# Release-branch development flow

`main` is the production/release branch for the freelance site.

For substantial feature or release work, use this branch model:

```text
main
  ↑ final release PR
release/<feature-or-release>
  ↑ internal PRs
feature/* / fix/* / chore/*
```

## Internal work

- Create short-lived `feature/*`, `fix/*`, or `chore/*` branches from the active `release/*` branch.
- Merge them back to that `release/*` branch by pull request.
- Keep internal CI proportionate and inexpensive. The repository's `Site checks` workflow intentionally runs on pull requests and supplies JavaScript syntax, behaviour, static-page/link, and release-boundary regression checks.
- Every internal pull request requires an independent Code Review and an independent Security Review of the exact current head SHA.
- Every finding blocks merge until fixed and independently re-reviewed, or explicitly dispositioned with rationale.
- Any new commit makes previous Code Review and Security Review evidence stale and requires both reviews again on the new exact head.
- Missing, pending, stale, skipped, rate-limited, failed, or inconclusive review evidence blocks merge.

## Final release

Open `release/<feature-or-release> → main` when the release branch is ready.

Before merge, require the complete repository-appropriate gate:

1. applicable CI/build checks;
2. full repository security/regression checks;
3. independent Code Review of the exact current head;
4. independent Security Review of the exact current head;
5. resolution or explicit disposition of every finding;
6. fresh exact-head Code Review and Security Review after every new commit;
7. zero unresolved findings;
8. exact head/base verification immediately before merge;
9. merge to `main`;
10. verify the merged tree, managed GitHub Pages deployment, and `Verify public release` result.

Green CI alone is never sufficient to merge.

## Current workflow intent

- `.github/workflows/site-checks.yml` is the lightweight pull-request/static regression workflow. It also runs on pushes to `main` so the released tree is rechecked.
- `.github/workflows/release-verification.yml` is production-only verification. It is triggered only after a successful `Site checks` run for `main` (or by explicit manual dispatch), then waits for the managed GitHub Pages deployment of that exact SHA and verifies the public `/freelance-dev/` release.
- Creating or pushing a `release/*`, `feature/*`, `fix/*`, or `chore/*` branch must not trigger a production Pages deployment or the production release verifier.

## Operational holds

The branch flow does not authorise production data writes or migrations, credentials/secrets changes, infrastructure or hosting settings, DNS, payments/billing, analytics/consent changes, or external/customer communications. Those remain separately approval-controlled.

Do not modify shared/global workflow repositories, sibling projects, the anthonyjohnson.dev root portfolio, or shared infrastructure from this project. Use a cross-project handoff when another project must change.
