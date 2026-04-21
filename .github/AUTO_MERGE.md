# Dependabot Auto-Merge — ARM/TEST

Concise decision record for the Dependabot auto-merge policy. Format:
**A**ction / **R**ationale / **M**itigation / **TEST**.

## Action

Consolidate Dependabot PRs and auto-merge non-major bumps.

- `.github/dependabot.yml` groups `version-updates` into a single
  `minor-and-patch` group per ecosystem (`/`, `/cli`,
  `github-actions`). Security updates go through a dedicated `security`
  group that also includes major bumps so CVEs aren't gated on the
  manual-review path.
- `.github/workflows/dependabot-auto-merge.yml` auto-approves and
  squash-auto-merges patch + minor PRs when CI is green. Majors get a
  comment and stay open for manual review.

## Rationale

PRs #3–#11 were all closed **without merging** because:

1. Each dependency opened its own PR, so a single batch produced 9+
   branches that had to be rebased against `main` one by one.
2. Dependabot will auto-close a PR once its branch conflicts with a
   newer-opened superseding PR. With no grouping, that cascade happens
   on every green-field Monday run.
3. There was no `gh pr merge --auto` path, so even green PRs needed a
   human click — and when the human didn't click, the branch went stale
   and Dependabot closed it.

Grouping collapses the 9-branch churn into 1–3 PRs per ecosystem and
auto-merge ensures a green CI run is sufficient to land them.

## Mitigation

- Majors are **explicitly excluded** from auto-merge. React / react-dom
  / next majors are also ignored entirely in `dependabot.yml` so a bad
  SDK jump doesn't sneak in via the `minor-and-patch` group.
- Branch protection on `main` should require the existing CI jobs
  (`validate`, `build`, `cli`) as status checks. `gh pr merge --auto`
  respects required checks — if CI fails, nothing merges.
- Security updates carry their own group that includes majors. This
  preserves fast-path merging for CVE-driven bumps without forcing
  majors through the standard update cadence.
- The workflow runs only for PRs authored by `dependabot[bot]`
  (double-gated: `github.actor` and `pull_request.user.login`). Human
  PRs are untouched.

## TEST

Manual verification steps after deploying this policy:

1. Wait for the next Monday run (or trigger Dependabot manually via
   **Insights → Dependency graph → Dependabot → Check for updates**).
   Confirm at most 3 PRs are opened (root, `/cli`, actions), each
   labeled `dependencies` + ecosystem label.
2. On a grouped minor+patch PR, verify:
   - CI runs the existing `validate`, `build`, and `cli` jobs.
   - `dependabot-auto-merge` workflow posts an approval review.
   - The PR shows "Auto-merge enabled (squash)".
   - Once CI turns green, the PR merges within seconds.
3. Open a synthetic major-bump PR (e.g. bump a dev dep yourself on a
   branch that mimics Dependabot's head ref format is impractical — in
   practice wait for the next real one). Confirm: no approval, no
   auto-merge, and a comment noting the major bump was posted.
4. Temporarily break a test (e.g. on a scratch branch) and open a
   synthetic dependabot-style PR pointing at a red CI. Confirm
   `gh pr merge --auto` does **not** merge while CI is red.
5. Check Actions logs for the auto-merge workflow: it must skip cleanly
   on non-dependabot PRs (the `if:` guard on the `dependabot` job).

If any of the above fail, roll back by deleting the
`dependabot-auto-merge.yml` workflow — Dependabot will still open
grouped PRs, just without the auto-merge tail.
