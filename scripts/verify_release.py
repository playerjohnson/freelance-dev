#!/usr/bin/env python3
"""Read-only byte comparison of this checkout with the freelance Pages subpath."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import posixpath
import subprocess
import time
from urllib.error import HTTPError
from urllib.parse import unquote, urljoin, urlsplit
from urllib.request import Request, HTTPRedirectHandler, build_opener, urlopen

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "playerjohnson/freelance-dev"
BASE = "https://anthonyjohnson.dev/freelance-dev/"
BASE_PARTS = urlsplit(BASE)
SITE_ROOT = BASE_PARTS.path.rstrip("/")
ACTIONS_URL = f"https://api.github.com/repos/{REPOSITORY}/actions/runs?branch=main&status=success&per_page=100"
PAGES_WORKFLOW_PATH = "dynamic/pages/pages-build-deployment"
PAGES_EVENT = "dynamic"
MAX_DECODE_PASSES = 16
MAX_ENCODED_PATH_LENGTH = 8192
HEADERS = ("content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "strict-transport-security", "cache-control")


def decoded_path(path):
    """Decode nested URL escaping to a bounded fixed point before scope checks."""
    if len(path) > MAX_ENCODED_PATH_LENGTH:
        return None
    decoded = path
    for _ in range(MAX_DECODE_PASSES):
        try:
            expanded = unquote(decoded, errors="strict")
        except UnicodeDecodeError:
            return None
        if expanded == decoded:
            return decoded
        decoded = expanded
    return None


def is_scoped_url(url):
    parsed = urlsplit(url)
    if parsed.scheme != BASE_PARTS.scheme or parsed.netloc != BASE_PARTS.netloc:
        return False
    path = decoded_path(parsed.path)
    if path is None or "\\" in path or any(ord(character) < 32 for character in path):
        return False
    normalised = posixpath.normpath(path)
    return normalised == SITE_ROOT or normalised.startswith(SITE_ROOT + "/")


class ScopedRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        if not is_scoped_url(new_url):
            raise ValueError("Redirect leaves the freelance site; refusing to follow")
        return super().redirect_request(request, fp, code, message, headers, new_url)


def retrieve(url):
    if not is_scoped_url(url):
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


def latest_successful_pages_sha():
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    token = os.environ.get("GH_TOKEN")
    if token:
        headers["Authorization"] = "Bearer " + token
    with urlopen(Request(ACTIONS_URL, headers=headers), timeout=10) as response:
        body = response.read(2_000_001)
    if len(body) > 2_000_000:
        raise RuntimeError("Actions API response exceeded the release-check limit")
    payload = json.loads(body)
    for run in payload.get("workflow_runs", []):
        if (run.get("path") == PAGES_WORKFLOW_PATH and
                run.get("event") == PAGES_EVENT and
                run.get("head_branch") == "main" and
                run.get("status") == "completed" and
                run.get("conclusion") == "success" and run.get("head_sha")):
            return run["head_sha"]
    raise RuntimeError("No successful managed main Pages deployment was found for supersession checking")


def report_superseded(sha, latest_sha):
    message = f"Superseded release `{sha}`: newer successful Pages deployment `{latest_sha}` exists; public verification skipped."
    print(message)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as output:
            output.write(message + "\n")


def verify_files(sha):
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
    return {"commit": sha, "base": BASE, "verified_files": len(results), "redirect": "pass", "missing_page": "404", "files": results}


def main():
    sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    try:
        report = verify_files(sha)
    except (RuntimeError, OSError, ValueError):
        latest_sha = latest_successful_pages_sha()
        if latest_sha != sha:
            report_superseded(sha, latest_sha)
            return
        raise
    print(json.dumps(report, indent=2))
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        home = next(item for item in report["files"] if item["path"] == "index.html")
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as output:
            output.write(f"Verified {report['verified_files']} public files against `{sha}` at {BASE}. Redirect and missing-page status passed.\n\n")
            output.write("Homepage response headers (absence is reported, not treated as a failed deployment):\n\n")
            for key, value in home["headers"].items():
                output.write(f"- {key}: {value or 'not present'}\n")
            output.write("\nHTTP timings are single-run transfer observations, not Core Web Vitals. No scripts were executed and no forms were submitted.\n")


if __name__ == "__main__":
    main()
