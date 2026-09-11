import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

spec = importlib.util.spec_from_file_location("pages", Path(__file__).resolve().parents[1] / "scripts/wait_for_pages.py")
pages = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pages)


class PagesWaitTests(unittest.TestCase):
    def successful_response(self):
        return io.BytesIO(json.dumps({"workflow_runs": [{
            "name": "pages build and deployment", "head_sha": "wanted",
            "head_branch": "main", "id": 42, "status": "completed", "conclusion": "success"
        }]}).encode())

    def test_only_the_main_pages_run_for_the_requested_commit_matches(self):
        runs = [
            {"name": "Site checks", "head_sha": "wanted", "head_branch": "main"},
            {"name": "pages build and deployment", "head_sha": "older", "head_branch": "main"},
            {"name": "pages build and deployment", "head_sha": "wanted", "head_branch": "feature"},
            {"name": "pages build and deployment", "head_sha": "wanted", "head_branch": "main", "id": 42},
        ]
        self.assertEqual(pages.pages_run(runs, "wanted")["id"], 42)
        self.assertIsNone(pages.pages_run(runs, "absent"))

    def test_transient_api_errors_can_recover_within_the_wait(self):
        errors = [HTTPError("https://api.github.com/", code, "temporary", {}, None)
                  for code in (408, 429, 500, 502, 503, 504)]
        errors += [URLError("connection reset"), TimeoutError("timed out")]
        for error in errors:
            with self.subTest(error=type(error).__name__, code=getattr(error, "code", None)):
                with patch.object(pages, "urlopen", side_effect=[error, self.successful_response()]) as request, patch.object(pages.time, "sleep") as delay:
                    pages.wait_for_pages("wanted", {})
                self.assertEqual(request.call_count, 2)
                delay.assert_called_once()

    def test_authentication_and_other_permanent_errors_fail_immediately(self):
        for code in (400, 401, 403, 404):
            with self.subTest(code=code):
                error = HTTPError("https://api.github.com/", code, "permanent", {}, None)
                with patch.object(pages, "urlopen", side_effect=error) as request, patch.object(pages.time, "sleep") as delay:
                    with self.assertRaises(HTTPError):
                        pages.wait_for_pages("wanted", {})
                self.assertEqual(request.call_count, 1)
                delay.assert_not_called()

    def test_repeated_transient_errors_have_a_bounded_attempt_count(self):
        with patch.object(pages, "urlopen", side_effect=TimeoutError) as request, patch.object(pages.time, "monotonic", return_value=0), patch.object(pages.time, "sleep") as delay:
            with self.assertRaises(RuntimeError):
                pages.wait_for_pages("wanted", {})
        self.assertEqual(request.call_count, 18)
        self.assertEqual(delay.call_count, 17)

    def test_elapsed_deadline_stops_additional_requests_and_delays(self):
        with patch.object(pages, "urlopen", side_effect=TimeoutError) as request, patch.object(pages.time, "monotonic", side_effect=[0, 0, 180, 180]), patch.object(pages.time, "sleep") as delay:
            with self.assertRaises(RuntimeError):
                pages.wait_for_pages("wanted", {})
        self.assertEqual(request.call_count, 1)
        delay.assert_not_called()

    def test_failed_pages_deployment_is_not_retried_as_an_api_failure(self):
        response = io.BytesIO(json.dumps({"workflow_runs": [{
            "name": "pages build and deployment", "head_sha": "wanted",
            "head_branch": "main", "id": 42, "status": "completed", "conclusion": "failure"
        }]}).encode())
        with patch.object(pages, "urlopen", return_value=response) as request, patch.object(pages.time, "sleep") as delay:
            with self.assertRaisesRegex(RuntimeError, "Pages run 42 finished: failure"):
                pages.wait_for_pages("wanted", {})
        self.assertEqual(request.call_count, 1)
        delay.assert_not_called()
