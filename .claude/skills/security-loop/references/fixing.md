# Owner gate and fix rounds

Step 8 of the loop. Upstream's skill stops at the report; this part is ours.

## Owner gate

After `REPORT.md` is written, stop and show the owner, in chat:

- the confirmed findings table (severity, title, one-line result, cross-vendor result), without payloads when the repository is public;
- each open `needs_validation` record as a one-line question the owner can answer ("Is `/admin` behind the host's access control in production?");
- the grouped fixes from `REPORT.md`, each offered as one pick that selects every fingerprint it names;
- the recommendation: fix every confirmed critical, high, and medium finding; low and informational at the owner's choice.

Ask three things in one message: which findings or grouped fixes to fix, whether each fix also gets a committed regression test (recommend yes when the repository already has a test suite for that area; the kernel adds tests only on request), and answers to any questions they can settle now. Never pick fixes for the owner. An unattended run ends at the report. Fix rounds apply only to repositories the owner owns; for a source-only repository, the report's remediation is the deliverable and nothing is committed there.

Record the answers in `<output>/fixes.json`, one entry per confirmed or answered fingerprint:

```json
[
  {
    "fingerprint": "...",
    "status": "picked|fixed|owner_action|wont_fix|deferred",
    "owner_answer": null,
    "regression_test": false,
    "branch": null,
    "commits": [],
    "pr": null,
    "fixer_agent": null,
    "verifier_agent": null,
    "after_check": null
  }
]
```

An owner answer to a `needs_validation` question goes to a fresh verifier with the record (verification.md, Step 4 brief); its decision updates `findings.json` through the Step 6 rules, and the reports are regenerated. A newly confirmed record joins the fix list only if the owner picks it.

`owner_action` is for fixes only the owner can make: rotating a committed credential, changing a provider or host setting, enabling branch protection. List the exact action. Never rewrite git history to remove a committed secret unless the owner asks for that by name; rotation makes the old value useless, and history rewriting is destructive.

## Fix rounds

One round per picked finding, in severity order, one implementer at a time (fixes often touch shared code).

1. **Branch.** Fixes start from the audited source ref recorded in `run-metadata.json`, so the implementer works on the source the findings describe. If that ref is an unmerged fix branch from an earlier run, add the new commits to that branch. Otherwise use the session's own worktree when it is clean and at that ref, or `git -c core.hooksPath=<output>/no-hooks worktree add -b claude/security-<run>-fixes <worktree root>/security-fix-<run> <audited ref>`. Commits in the fix branch run the repository's normal hooks; never skip them. If the owner wants the fixes on a different base, the fresh verifier in step 3 re-checks every record on that base before its fix ships. All rounds of one run share the branch, one commit per finding. A picked group still runs one round per fingerprint: order its findings so each commit closes one of them, and when the shared change cannot be split, record that one commit against every fingerprint it closes. Each fingerprint still gets its own re-check in step 3.
2. **Fix.** A fresh implementer gets the final record, the remediation, the invariant, the worktree path, and the rules from SKILL.md. It makes the smallest change that enforces the invariant at the last trusted decision point, keeps existing validation and error handling, and checks every caller of the function it changes. If the owner asked for a regression test, it adds one that fails before the fix and passes after; otherwise it keeps the reproduction in its scratch only. It runs the project's own checks (lint, typecheck, tests) and reports their output.
3. **Re-check.** A fresh verifier, not the implementer, gets the record, the diff, and the reproduction. It confirms that the original reproduction no longer shows the effect on the fixed tree (owner-local tier and command template only), that the fix enforces the invariant rather than moving trust, that sibling and variant paths of the same root cause are covered, and that no behavior the record's `intended_behavior` describes broke. A failed re-check sends the round back to step 2 once with the verifier's findings; a second failure sets the entry to `deferred` with the reason.
4. **Record.** Update the entry: `status: "fixed"`, commit SHA, agents, and `after_check` (what the reproduction showed after the fix).

## Shipping

- Check visibility: `gh repo view --json visibility -q .visibility`.
- Commit messages and the PR body describe each change in neutral terms: the invariant now enforced and where ("validate the tenant id against the session in `orders.ts` before the lookup"). For a public repository, no reproduction steps, payloads, exploit framing, severity labels, or links to the output directory until the fix is merged. A private repository may name the finding's title; still no secret values.
- Before opening the PR, check `gh pr list --head <branch>`; push to an existing PR instead of opening another. Push with `git push -u origin HEAD`, then `gh pr create --head <branch> --body-file <file>`.
- Opening the PR triggers `/codex-review` in the same turn, per the kernel. Verify its findings, fix the confirmed ones, push.
- For a public repository with outside users, offer to draft a private GitHub security advisory for the owner to publish after the fix ships. Publishing is the owner's decision.
- Never merge as part of this skill unless the owner asks; merging follows the kernel's review rule.

## Into the next run

The next run's source ref is the fix branch head when the fixes are unmerged, else fresh `origin/<default>`. Every `fixed` fingerprint becomes a `prior_confirmed_changed_source` revalidation unit that also covers variants (recon.md, Prior runs). The fix branch's own diff is in scope: a security fix can open a new hole.
