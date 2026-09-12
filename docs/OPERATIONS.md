# Freelance site operations

Recorded 10 September 2026. This runbook describes the repository workflow; it does not replace Project Instructions or grant account, merge or settings approval.

Release-check reliability notes updated 11 September 2026.

## Scope and hosting

- Repository: `playerjohnson/freelance-dev`.
- Public address: `https://anthonyjohnson.dev/freelance-dev/`.
- GitHub Pages serves the root directory of `main`. A main merge triggers the GitHub-managed `pages build and deployment` workflow.
- This is static HTML, CSS and JavaScript. There is no application database, package build or repository staging environment.
- The root portfolio, sibling projects, shared consent/analytics resources and provider accounts are separate boundaries.

## Before merging

1. Read applicable instructions and inspect the current main, PR head, diff and reviews. Follow the current explicit merge authorisation; passing checks alone are not permission.
2. Require a successful `Site checks / validate` result for the actual PR head. The workflow runs Node tests and syntax checks plus `python3 scripts/check_site.py`.
3. Review content changes for evidence, original publication dates, pricing, availability and contract consistency. Keep employment, personal projects and commissioned work distinct. Keep private supporting evidence outside this public repository.
4. Confirm the diff stays within this site. Do not add live form submissions to tests. Do not change tracking, provider settings or schedules while their holds apply.

For local validation, use Node 24 and Python 3.10 or newer:

```sh
node --check js/main.js
node --check js/freelance-consent.js
node --check cookie-consent.js
node --test tests/*.test.cjs
python3 scripts/check_site.py
python3 -B -m unittest discover -s tests -p '*_test.py'
```

Static validation covers local URLs and fragments, IDs, page canonicals, Open Graph URLs, JSON-LD and sitemap targets. It does not prove external links, accessibility, marketing claims, indexing or enquiry delivery. At the time this runbook was introduced, main had no required branch-protection checks; changing that setting requires a separate decision.

## Verify a release

1. Record the merge SHA and wait for Pages build/deploy success at that SHA.
2. Check `Verify public release`. A successful main `Site checks` run triggers it; it then waits for GitHub's Pages run at the same commit using read-only repository Actions access. The public-file check performs GET requests only within the freelance subpath, compares the public HTML and local assets with the checkout, checks the slashless redirect and expects 404 for a missing page. It refuses redirects outside this site. It never runs tracking scripts, contacts Formspree or submits a form.
3. A superseded release is explicitly skipped, not verified. Find the newer main run. If bytes differ, investigate a failed or stale deployment before retrying; do not rebuild repeatedly without a reason.
4. Inspect the live homepage, contact page and an affected nested page in a browser. Check navigation, keyboard focus, local assets and error/status presentation. Do not equate a successful HTTP check with a complete browser journey.

The workflow rechecks main immediately before public-file verification, after the Pages wait, and again before reporting its result. If main advances during the comparison, the older run records a superseded skip instead of a success or stale-byte failure. Failure to fetch main remains an error. Pages polling retries transient network failures and HTTP 408, 429, 500, 502, 503 and 504 within a 180-second deadline and at most 18 observations; authentication/permission errors and failed Pages deployments still fail promptly.

HTTP 403 is retried only when response headers identify throttling (`x-ratelimit-remaining: 0` or `retry-after`), or the JSON response's `message` explicitly identifies a secondary rate limit. The message check reads at most 8 KiB plus one overflow byte and never logs response bodies; unrecognised, oversized or unreadable bodies do not enable a retry. Rate-limit retries respect the advertised retry/reset time and use an increasing backoff starting at 60 seconds. If the required delay exceeds the remaining deadline, or its timing cannot be interpreted, the check fails without making an early request. Ordinary permission-related 403 responses still fail immediately. See [GitHub's rate-limit guidance](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#exceeding-the-rate-limit).

The same read-only check can be run manually from the intended release checkout:

```sh
python3 scripts/verify_release.py
```

The check reports selected HTTP headers and transfer times. Missing policy headers are reported rather than silently accepted as a security audit. Timings are not Lighthouse or Core Web Vitals measurements. The root origin's robots policy and Search Console indexing need separate, correctly scoped evidence.

## Roll back a bad release

1. Identify the last verified merge and the faulty merge commit. Review whether subsequent commits depend on it.
2. Branch from current main and prepare a revert PR. For a normal merge commit, `git revert -m 1 <faulty-merge-sha>` reverses its changes relative to main. Inspect the diff; do not force-push or reset the remote branch.
3. Run checks and follow the current merge-approval instructions. After merging, verify the new Pages run and public bytes again.
4. A repository revert does not undo provider settings, consent already stored in visitors' browsers, sent messages or external data changes. Escalate those separately if involved.

## Enquiry evidence and recovery

The form uses Formspree. Endpoint reachability and a success message do not prove mailbox delivery. Verify the form in the correct provider account, its intended recipient, spam rules, quotas and recent submission/delivery records. Record timestamps and status without copying personal enquiry content into public issues or logs.

Use isolated fixtures for pending, success, HTTP failure, rate-limit, network and timeout behaviour. A live delivery test needs explicit approval, a clearly marked test message and verification at both provider and intended mailbox. Do not submit repeated tests or infer non-receipt after a timeout. Keep the direct-email alternative visible.

## Optional tracking pause — 12 September 2026

Optional analytics and advertising are paused on the freelance subpath. The dedicated script is inert apart from a no-op event helper; it does not load providers, access stored choices or cookies, or render opt-in controls. All existing script references use the paused version. The legacy shared script and provider settings remain unchanged.

Re-enabling tracking needs a separately reviewed and authorised change. Verify the actual container's purposes and consent behaviour, the provider/account evidence and privacy wording before restoring any loader. Test fresh visits, saved choices, rejection, withdrawal, cross-tab storage clearing and nested pages in an approved isolated environment. Loader-selection tests alone do not establish what a container executes. Do not restore old saved consent automatically.

The pause takes effect when a visitor loads or reloads a page with the new release; deployment cannot stop scripts already running in an open tab. It does not erase existing provider data or shared-origin cookies. The contact form remains independent of optional tracking.

## Monitoring proposal and outstanding gates

Active checks: PR/main validation, GitHub Pages build/deploy, and post-Pages public-file verification. These are release-triggered checks; no timed schedule is created here.

Proposed, awaiting schedule/account approval:

- Hourly read-only availability checks for the homepage, contact page and critical assets, with two failures before an alert.
- Weekly review of dated content, public links and provider evidence; agree an owner before enabling notifications.
- Formspree quota, spam and delivery monitoring after account ownership and available provider events are verified.
- Search Console coverage and indexing review after identifying the correct property and account.

## Core-site completion and handover

The agreed core goal is a reliable freelance information and enquiry site with optional analytics and advertising paused. Restoring measurement, changing provider accounts and introducing scheduled monitoring are separate work requiring their own approval.

Close the core work with a dated handover identifying the exact serving commit, PRs, checks and any owner-accepted exceptions. Do not describe an untested gate as passed, or treat the site's published wording as proof of the underlying practice.

| Gate | Evidence needed for closure |
| --- | --- |
| Enquiries | Isolated validation and failure fixtures, usable direct-email alternative, and the existing authorised delivery evidence. Do not repeat the completed live test without a new reason and approval. |
| Content | Approved positioning, labelled employment/project context, supported claims, current availability and internally consistent commercial terms. Preserve original article publication dates; update modification dates for actual edits. |
| Privacy | Text matches the deployed code and the owner's actual enquiry retention, mailbox and provider arrangements. A provider's public policy is not proof of this account's contract or settings. |
| Usability | Check homepage, contact, one nested service/article and 404 with keyboard navigation. At 320, 375 and 768 CSS pixels, check menu opening/closing, readable content, forms and horizontal overflow. Check 200% zoom and a screen reader's field labels and status announcements using an isolated form fixture. Record the device/browser and result. |
| Performance | Record an actual browser measurement and its conditions. HTTP transfer time and a small asset size alone do not establish Core Web Vitals. |
| Search | Verify canonicals, sitemap, robots, redirects and 404 behaviour. Record Search Console visibility separately; a sitemap or verification file does not prove indexing. |
| Release | Successful checks for the actual head, successful Pages deployment, public-file comparison and an affected-page browser inspection. Keep the rollback steps above available. |

No new schedule or notification is activated by this runbook. AJ remains the contact for enquiries and commercial decisions; ongoing monitoring responsibilities and frequency require explicit agreement. When reviewing an enquiry, check the intended mailbox and the form's inbox/spam/quota in the correct account. For a failed release, use the existing workflow evidence and rollback process before retrying deployment.

The completion review on 12 September 2026 found the root-origin robots file allows crawling but advertises the root sitemap. The freelance sitemap remains available at `/freelance-dev/sitemap.xml`; the subpath's `robots.txt` does not control origin-wide crawler policy. Do not modify the root sitemap or robots file as part of freelance-only work.

Remaining manual gates must be recorded in the private handover: real mobile/zoom and screen-reader checks, performance measurements, owner confirmation of public claims and privacy practices, and any accepted account/security limitations. The optional tracking pause does not require enabling or modifying shared providers to close the core release.
