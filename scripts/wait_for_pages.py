#!/usr/bin/env python3
"""Wait for the GitHub-managed Pages run at this checkout; never dispatch or rerun it."""
import json
import os
from pathlib import Path
import subprocess
import time
from urllib.request import Request, urlopen

REPOSITORY = "playerjohnson/freelance-dev"


def pages_run(runs, sha):
    return next((run for run in runs if run.get("name") == "pages build and deployment"
                 and run.get("head_sha") == sha and run.get("head_branch") == "main"), None)


def main():
    root = Path(__file__).resolve().parents[1]
    sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    token = os.environ.get("GH_TOKEN")
    if token:
        headers["Authorization"] = "Bearer " + token
    url = f"https://api.github.com/repos/{REPOSITORY}/actions/runs?head_sha={sha}&per_page=100"
    for attempt in range(18):
        with urlopen(Request(url, headers=headers), timeout=10) as response:
            runs = json.load(response)["workflow_runs"]
        run = pages_run(runs, sha)
        if run and run["status"] == "completed":
            if run["conclusion"] != "success":
                raise RuntimeError(f"Pages run {run['id']} finished: {run['conclusion']}")
            print(f"Pages run {run['id']} succeeded for {sha}.")
            return
        if attempt < 17:
            time.sleep(10)
    raise RuntimeError("No successful Pages deployment for this commit within the waiting period")


if __name__ == "__main__":
    main()
