import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("site_check", Path(__file__).resolve().parents[1] / "scripts/check_site.py")
site_check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(site_check)


class SiteValidationTests(unittest.TestCase):
    def write_site(self, root, og_url):
        (root / "index.html").write_text(
            "<!doctype html><html><head>"
            f'<link rel="canonical" href="{site_check.BASE}">'
            f'<meta property="og:url" content="{og_url}">'
            "</head><body><main id=\"main-content\"><h1>Test</h1></main></body></html>"
        )
        (root / "sitemap.xml").write_text(
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            f'<url><loc>{site_check.BASE}</loc></url>'
            '</urlset>'
        )

    def test_canonical_page_without_schema_rejects_stale_open_graph_url(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.write_site(root, site_check.BASE + "old.html")
            with patch.object(site_check, "ROOT", root):
                with self.assertRaisesRegex(ValueError, "Open Graph URL differs from canonical"):
                    site_check.validate()

    def test_canonical_page_without_schema_accepts_matching_open_graph_url(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.write_site(root, site_check.BASE)
            with patch.object(site_check, "ROOT", root), patch("builtins.print"):
                site_check.validate()


if __name__ == "__main__":
    unittest.main()
