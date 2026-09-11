#!/usr/bin/env python3
"""Wait for the GitHub-managed Pages run at this checkout; never dispatch or rerun it."""
import json
import os
from pathlib import Path
import subprocess
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

REPOSITORY = "playerjohnson/freelance-dev"


def pages_run(runs, sha):
    return next((run for run in runs if run.get("name") == "pages build and deployment"
                 and run.get("head_sha") == sha and run.get("head_branch") == "main"), None)


def retry_delay(error, rate_backoff):
    headers = {name.lower(): value for name, value in (error.headers or {}).items()}
    rate_limited = error.code == 429 or (error.code == 403 and
                   (headers.get("x-ratelimit-remaining") == "0" or "retry-after" in headers))
    if not rate_limited and error.code not in (408, 500, 502, 503, 504):
        return None
    delay = rate_backoff if rate_limited else 10
    try:
        if "retry-after" in headers:
            delay = max(delay, int(headers["retry-after"]))
        if headers.get("x-ratelimit-remaining") == "0" and "x-ratelimit-reset" in headers:
            delay = max(delay, int(headers["x-ratelimit-reset"]) - time.time() + 1)
    except (TypeError, ValueError):
        raise RuntimeError("Cannot interpret the Actions API retry timing; refusing an early retry") from None
    return delay


def wait_for_pages(sha, headers):
    url = f"https://api.github.com/repos/{REPOSITORY}/actions/runs?head_sha={sha}&per_page=100"
    deadline = time.monotonic() + 180
    rate_backoff = 60
    for attempt in range(18):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        delay = 10
        try:
            with urlopen(Request(url, headers=headers), timeout=min(10, remaining)) as response:
                runs = json.load(response)["workflow_runs"]
        except HTTPError as error:
            delay = retry_delay(error, rate_backoff)
            if delay is None:
                raise
            if error.code in (403, 429):
                rate_backoff *= 2
            print(f"Transient Actions API response: HTTP {error.code}; observation {attempt + 1}/18.")
        except OSError:
            print(f"Transient Actions API network failure; observation {attempt + 1}/18.")
        else:
            run = pages_run(runs, sha)
            if run and run["status"] == "completed":
                if run["conclusion"] != "success":
                    raise RuntimeError(f"Pages run {run['id']} finished: {run['conclusion']}")
                print(f"Pages run {run['id']} succeeded for {sha}.")
                return
        remaining = deadline - time.monotonic()
        if delay >= remaining:
            break
        if attempt < 17 and remaining > 0:
            time.sleep(delay)
    raise RuntimeError("No successful Pages deployment for this commit within the waiting period")


def main():
    root = Path(__file__).resolve().parents[1]
    sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    token = os.environ.get("GH_TOKEN")
    if token:
        headers["Authorization"] = "Bearer " + token
    wait_for_pages(sha, headers)


if __name__ == "__main__":
    main()
