#!/usr/bin/env python3
"""Read-only byte comparison of this checkout with the freelance Pages subpath."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
from urllib.error import HTTPError
from urllib.parse import urljoin
from urllib.request import Request, HTTPRedirectHandler, build_opener

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://anthonyjohnson.dev/freelance-dev/"
HEADERS = ("content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "strict-transport-security", "cache-control")


class ScopedRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        if not new_url.startswith(BASE):
            raise ValueError("Redirect leaves the freelance site; refusing to follow")
        return super().redirect_request(request, fp, code, message, headers, new_url)


def retrieve(url):
    if not (url.startswith(BASE) or url == BASE.rstrip("/")):
        raise ValueError("Only the freelance site may be inspected")
    request = Request(url, headers={"User-Agent": "freelance-dev-release-check", "Accept-Encoding": "identity"})
    started = time.monotonic()
    try:
        response = build_opener(ScopedRedirect()).open(request, timeout=10)
    except HTTPError as error:
        response = error
    with response:
        body = response.read(2_000_001)
        if len(body) > 2_000_000:
            raise ValueError("Unexpected response larger than 2 MB")
        return response.status, response.url, body, dict(response.headers), round(time.monotonic() - started, 3)


def compare(path):
    relative = path.relative_to(ROOT).as_posix()
    url = BASE if relative == "index.html" else urljoin(BASE, relative)
    expected = path.read_bytes()
    last = ""
    for attempt in range(4):
        try:
            status, final, body, headers, elapsed = retrieve(url)
            if status == 200 and final == url and body == expected:
                lowered = {key.lower(): value for key, value in headers.items()}
                return {"path": relative, "bytes": len(body), "seconds": elapsed,
                        "sha256": hashlib.sha256(body).hexdigest(),
                        "headers": {key: lowered.get(key) for key in HEADERS}}
            last = f"HTTP {status}; matching bytes: {body == expected}; matching URL: {final == url}"
        except (OSError, ValueError) as error:
            last = str(error)
        if attempt < 3:
            time.sleep(10)
    raise RuntimeError(f"{relative}: {last}")


def main():
    sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    paths = sorted(p for p in ROOT.rglob("*.html") if not any(part.startswith(".") for part in p.relative_to(ROOT).parts))
    paths += [ROOT / name for name in ("css/style.css", "js/main.js", "cookie-consent.js", "sitemap.xml", "robots.txt", "favicon.svg", "og-image.png")]
    paths += [path for path in sorted((ROOT / "js").glob("*.js")) if path not in paths]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(compare, paths))
    status, final, _, _, _ = retrieve(BASE.rstrip("/"))
    if status != 200 or final != BASE:
        raise RuntimeError("The slashless site address did not resolve to the canonical homepage")
    status, _, _, _, _ = retrieve(BASE + "release-check-missing-" + sha + ".html")
    if status != 404:
        raise RuntimeError(f"Missing page returned HTTP {status}, expected 404")
    report = {"commit": sha, "base": BASE, "verified_files": len(results), "redirect": "pass", "missing_page": "404", "files": results}
    print(json.dumps(report, indent=2))
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        home = next(item for item in results if item["path"] == "index.html")
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as output:
            output.write(f"Verified {len(results)} public files against `{sha}` at {BASE}. Redirect and missing-page status passed.\n\n")
            output.write("Homepage response headers (absence is reported, not treated as a failed deployment):\n\n")
            for key, value in home["headers"].items():
                output.write(f"- {key}: {value or 'not present'}\n")
            output.write("\nHTTP timings are single-run transfer observations, not Core Web Vitals. No scripts were executed and no forms were submitted.\n")


if __name__ == "__main__":
    main()
