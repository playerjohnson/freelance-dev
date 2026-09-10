#!/usr/bin/env python3
"""Validate this static site's local references and page metadata without network access."""
import json
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://anthonyjohnson.dev/freelance-dev/"


class Page(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.ids = []
        self.links = []
        self.canonicals = []
        self.og_urls = []
        self.schemas = []
        self.h1s = 0
        self.schema = None
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            self.ids.append(attrs["id"])
        if tag == "h1":
            self.h1s += 1
        if tag == "link" and attrs.get("rel") == "canonical":
            self.canonicals.append(attrs.get("href"))
        if tag == "meta" and attrs.get("property") == "og:url":
            self.og_urls.append(attrs.get("content"))
        for key in ("href", "src", "action"):
            if attrs.get(key):
                self.links.append(attrs[key])
        if tag == "script" and attrs.get("type") == "application/ld+json":
            self.schema = ""

    def handle_data(self, data):
        if self.schema is not None:
            self.schema += data

    def handle_endtag(self, tag):
        if tag == "script" and self.schema is not None:
            self.schemas.append(json.loads(self.schema))
            self.schema = None


def local_target(url):
    parsed = urlsplit(url)
    if parsed.netloc != "anthonyjohnson.dev" or not parsed.path.startswith("/freelance-dev/"):
        return None
    relative = unquote(parsed.path[len("/freelance-dev/"):])
    target = (ROOT / relative).resolve()
    if not target.is_relative_to(ROOT):
        raise ValueError("Reference escapes the site directory")
    if target.is_dir():
        target /= "index.html"
    return target


def validate():
    pages = {}
    for path in sorted(ROOT.rglob("*.html")):
        if any(part.startswith(".") for part in path.relative_to(ROOT).parts):
            continue
        pages[path] = Page(path.read_text())
    count = 0
    for path, page in pages.items():
        name = path.relative_to(ROOT).as_posix()
        url = urljoin(BASE, name)
        duplicates = [key for key, total in Counter(page.ids).items() if total > 1]
        if duplicates:
            raise ValueError(f"{name}: duplicate IDs: {duplicates}")
        if page.schemas:
            canonical = BASE if name == "index.html" else url
            if page.canonicals != [canonical] or page.h1s != 1 or "main-content" not in page.ids:
                raise ValueError(f"{name}: invalid canonical, h1 or main landmark")
            if page.og_urls != [canonical]:
                raise ValueError(f"{name}: Open Graph URL differs from canonical")
            for schema in page.schemas:
                if schema.get("url") != canonical:
                    raise ValueError(f"{name}: structured data URL differs from canonical")
        for link in page.links:
            resolved = urljoin(url, link)
            target = local_target(resolved)
            if target is None:
                continue
            if not target.is_file():
                raise ValueError(f"{name}: missing local target: {link}")
            fragment = unquote(urlsplit(resolved).fragment)
            if fragment and target in pages and fragment not in pages[target].ids:
                raise ValueError(f"{name}: missing fragment: {link}")
            count += 1
    sitemap = ET.parse(ROOT / "sitemap.xml")
    urls = [item.text for item in sitemap.findall(".//{*}loc")]
    if len(urls) != len(set(urls)):
        raise ValueError("Duplicate sitemap URLs")
    for url in urls:
        target = local_target(url)
        if target not in pages or pages[target].canonicals != [url]:
            raise ValueError(f"Sitemap URL is not a canonical local page: {url}")
    print(f"Validated {len(pages)} HTML files, {count} local references and {len(urls)} sitemap URLs.")


if __name__ == "__main__":
    validate()
