---
name: babysit-ci
description: "Watches a PR's checks and fixes failures. Use for /babysit-ci, \"watch CI\", \"fix CI\", \"get checks green\", or a PR with failing or pending checks; not a bare merge request."
---

# Babysit CI

## Mode

- **watch**: inspect and report. No edits, pushes, or reruns.
- **fix** ("fix CI", "get checks green"): scoped fixes and pushes. Never merge.
- Ambiguous request: watch.

## Loop

1. Find the PR: `gh pr view <pr> --json number,url,headRefName,headRefOid`. No PR given: pass the branch from `git branch --show-current`.
2. Read checks with `gh pr checks <pr> --json name,bucket,state,workflow,link`. Judge the PR by this output alone: Actions runs are only part of it, since apps and status contexts report here too.
3. Diagnose failures before waiting on anything. Each failing check gets one root error: the earliest log line that names a cause; errors after it often follow from it.
   - Actions check: take the run id from its link; `gh run view <run-id> --log-failed`.
   - External check: open its link and find the step or service that failed.
4. Pending checks: start `gh pr checks <pr> --watch --fail-fast` with Bash `run_in_background`. The harness re-invokes you when it exits; keep diagnosing meanwhile.
5. Watch mode: once the watcher exits, reread the checks and the head SHA, report, and stop. Fix mode continues below.

## Fix

Sort each failure before touching code:

- **Not from this PR's diff**: see whether the default branch already passes that check. If it does, `git fetch origin` and `git merge origin/<default>` bring the fix in; this PR carries no patch for it.
- **Flake**: one rerun (`gh run rerun <run-id> --failed`), and cite the evidence: it passed on rerun with no change, or it is a known flake (say where it is recorded).
- **Caused by this PR**: if the failing command is cheap to run locally, reproduce the failure first and rerun it after the change. One cause per push. Stage explicit paths. Never pass `--no-verify`.

After any push, restart at step 2. A push can trigger workflows the old list lacked or retire ones it showed, so check state read before the push is stale.

## Stop, report, and ask before continuing

- 3 fix pushes done.
- The same failure survives a fix: switch to `fable-mode`, rethink the cause, and name the fix tier.
- The fix needs secrets, infra, permissions, or a user decision.

## Before calling it green

Re-read `headRefOid`; if it moved, run the loop on the new head. A missing, skipped, or unavailable expected check does not pass; list it.

Each fix push leaves a head that `/codex-review` has not seen. State that in the report. Rerunning the review bills the user's Codex subscription and needs their OK.

A CI quirk that cost a retry goes to pitfalls via `recall`.

## Report

- Each iteration: check → first root error line → link → fix applied.
- Final: status and PR URL, or blocked plus the next action.
