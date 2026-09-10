import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("pages", Path(__file__).resolve().parents[1] / "scripts/wait_for_pages.py")
pages = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pages)


class PagesWaitTests(unittest.TestCase):
    def test_only_the_main_pages_run_for_the_requested_commit_matches(self):
        runs = [
            {"name": "Site checks", "head_sha": "wanted", "head_branch": "main"},
            {"name": "pages build and deployment", "head_sha": "older", "head_branch": "main"},
            {"name": "pages build and deployment", "head_sha": "wanted", "head_branch": "feature"},
            {"name": "pages build and deployment", "head_sha": "wanted", "head_branch": "main", "id": 42},
        ]
        self.assertEqual(pages.pages_run(runs, "wanted")["id"], 42)
        self.assertIsNone(pages.pages_run(runs, "absent"))
