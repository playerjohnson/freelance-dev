import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("release", Path(__file__).resolve().parents[1] / "scripts/verify_release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseVerificationTests(unittest.TestCase):
    def test_requests_cannot_leave_the_freelance_subpath(self):
        for url in (
            "https://formspree.io/f/example",
            "https://anthonyjohnson.dev/",
            "https://anthonyjohnson.dev/everyday-tools/",
            "https://anthonyjohnson.dev/freelance-dev/%2e%2e/everyday-tools/",
            "https://anthonyjohnson.dev/freelance-dev/%252e%252e/everyday-tools/",
        ):
            with self.subTest(url=url), self.assertRaises(ValueError):
                release.retrieve(url)

    def test_redirects_cannot_visit_siblings_other_hosts_or_encoded_traversal(self):
        for url in (
            "https://anthonyjohnson.dev/",
            "https://example.com/freelance-dev/",
            "https://anthonyjohnson.dev/freelance-dev/%2e%2e/everyday-tools/",
            "https://anthonyjohnson.dev/freelance-dev/%252e%252e/everyday-tools/",
        ):
            with self.subTest(url=url), self.assertRaises(ValueError):
                release.ScopedRedirect().redirect_request(None, None, 302, "Found", {}, url)

    def test_scoped_url_allows_only_normalised_site_paths(self):
        self.assertTrue(release.is_scoped_url(release.BASE))
        self.assertTrue(release.is_scoped_url(release.BASE.rstrip("/")))
        self.assertTrue(release.is_scoped_url(release.BASE + "services/api-integration.html"))
        self.assertTrue(release.is_scoped_url(release.BASE + "services/%61pi-integration.html"))
        self.assertFalse(release.is_scoped_url(release.BASE + "services/../../../everyday-tools/"))

    def test_byte_match_passes_without_a_second_request(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            path = root / "index.html"
            path.write_bytes(b"expected release")
            with patch.object(release, "ROOT", root), patch.object(release, "retrieve", return_value=(200, release.BASE, b"expected release", {}, 0.1)) as request:
                result = release.compare(path)
            self.assertEqual(result["bytes"], 16)
            request.assert_called_once_with(release.BASE)

    def test_stale_bytes_fail_after_bounded_retries(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            path = root / "index.html"
            path.write_bytes(b"new release")
            with patch.object(release, "ROOT", root), patch.object(release, "retrieve", return_value=(200, release.BASE, b"old release", {}, 0.1)) as request, patch.object(release.time, "sleep") as delay:
                with self.assertRaises(RuntimeError):
                    release.compare(path)
            self.assertEqual(request.call_count, 4)
            self.assertEqual(delay.call_count, 3)

    def test_latest_successful_pages_sha_requires_the_managed_pages_identity(self):
        payload = {
            "workflow_runs": [
                {"name": "pages build and deployment", "path": ".github/workflows/spoof-pages.yml", "event": "push", "head_branch": "main", "status": "completed", "conclusion": "success", "head_sha": "spoofed"},
                {"path": release.PAGES_WORKFLOW_PATH, "event": release.PAGES_EVENT, "head_branch": "main", "status": "completed", "conclusion": "failure", "head_sha": "failed"},
                {"path": release.PAGES_WORKFLOW_PATH, "event": release.PAGES_EVENT, "head_branch": "main", "status": "completed", "conclusion": "success", "head_sha": "latest"},
            ]
        }
        response = io.BytesIO(json.dumps(payload).encode())
        with patch.object(release, "urlopen", return_value=response):
            self.assertEqual(release.latest_successful_pages_sha(), "latest")

    def test_failed_comparison_is_skipped_only_after_newer_successful_pages_release(self):
        with patch.dict(release.os.environ, {}, clear=True), patch.object(release.subprocess, "check_output", return_value="older\n"), patch.object(release, "verify_files", side_effect=RuntimeError("bytes differ")), patch.object(release, "latest_successful_pages_sha", return_value="newer"), patch.object(release, "report_superseded") as skipped:
            release.main()
        skipped.assert_called_once_with("older", "newer")

    def test_failed_comparison_for_latest_successful_pages_release_still_fails(self):
        with patch.dict(release.os.environ, {}, clear=True), patch.object(release.subprocess, "check_output", return_value="current\n"), patch.object(release, "verify_files", side_effect=RuntimeError("bytes differ")), patch.object(release, "latest_successful_pages_sha", return_value="current"), patch.object(release, "report_superseded") as skipped:
            with self.assertRaisesRegex(RuntimeError, "bytes differ"):
                release.main()
        skipped.assert_not_called()

    def test_successful_public_comparison_is_reported_without_main_branch_assumption(self):
        report = {"commit": "served", "base": release.BASE, "verified_files": 0, "redirect": "pass", "missing_page": "404", "files": []}
        with patch.dict(release.os.environ, {}, clear=True), patch.object(release.subprocess, "check_output", return_value="served\n"), patch.object(release, "verify_files", return_value=report), patch.object(release, "latest_successful_pages_sha") as latest, patch("builtins.print") as output:
            release.main()
        latest.assert_not_called()
        output.assert_called_once()


if __name__ == "__main__":
    unittest.main()
