import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("release", Path(__file__).resolve().parents[1] / "scripts/verify_release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseVerificationTests(unittest.TestCase):
    def test_requests_cannot_leave_the_freelance_subpath(self):
        for url in ("https://formspree.io/f/example", "https://anthonyjohnson.dev/", "https://anthonyjohnson.dev/everyday-tools/"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                release.retrieve(url)

    def test_redirects_cannot_visit_siblings_or_other_hosts(self):
        for url in ("https://anthonyjohnson.dev/", "https://example.com/freelance-dev/"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                release.ScopedRedirect().redirect_request(None, None, 302, "Found", {}, url)

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
