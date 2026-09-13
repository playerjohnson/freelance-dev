from pathlib import Path
import unittest


class ReleaseWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = (Path(__file__).resolve().parents[1] / ".github/workflows/release-verification.yml").read_text()

    def test_verifiers_are_scoped_to_the_exact_release_and_not_cancelled_by_later_runs(self):
        self.assertIn("group: verify-public-release-${{ github.event.workflow_run.head_sha || github.sha }}", self.workflow)
        self.assertIn("cancel-in-progress: false", self.workflow)

    def test_release_is_not_skipped_merely_because_main_advanced(self):
        self.assertNotIn("Check whether the release has been superseded", self.workflow)
        self.assertNotIn("git fetch --no-tags origin main", self.workflow)

    def test_public_verification_can_check_newer_successful_pages_evidence(self):
        marker = "- name: Verify public files, redirect and 404"
        section = self.workflow.split(marker, 1)[1]
        self.assertIn("GH_TOKEN: ${{ github.token }}", section)
        self.assertIn("run: python3 scripts/verify_release.py", section)


if __name__ == "__main__":
    unittest.main()
