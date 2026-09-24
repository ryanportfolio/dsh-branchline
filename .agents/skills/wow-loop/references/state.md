# State and resume

Use `.tmp/wow-loop/<task-slug>/state.json` inside the target workspace. Keep the spec,
bar, captures, and reports alongside it. This directory must survive context resets;
verify it still exists on resume. It is local scratch storage, not a cross-machine backup.

The orchestrator owns updates. Write to a sibling temporary file, parse it, then replace
the state file safely. Keep the last readable checkpoint until replacement succeeds.
Store large content manifests and reports separately and link them from state.

## Required record

| Field | Contents |
|---|---|
| task | Goal, scope, absolute workspace root, starting revision if applicable |
| contract | Spec/bar paths, version, reference identities, user amendments |
| artifact | Content-manifest path and digest identifying the inspected artifact |
| modules | IDs, dependencies, phase, check IDs, attempt count |
| checks | IDs, status, contract/artifact versions, evidence paths |
| findings | IDs, scope/check, severity, acceptance impact, observed defect, evidence, resolution |
| rounds | Reserved attempt number, scope, approach, outcome, report paths, review retries |
| limits | Total round limit, consumed rounds, user overrides |
| outcome | in_progress, passed, blocked, or budget_exhausted, with reason |
| next_action | Exact next step and prerequisites |

While workers or servers are active, also record their IDs, ownership, workspace, ports,
and permitted write scope as applicable. These records support reconciliation; an ID
alone does not prove a worker still exists or that its work completed.

Check statuses: `pending`, `passed`, `failed`, `unavailable`, `stale`.
Module phases: `planned`, `implementing`, `reviewing`, `needs_rework`, `accepted`, `blocked`.
Reserve a round before its writer starts. An interrupted reserved attempt stays consumed.
An explicit budget of zero permits inspection but no implementation attempt.

## Identify the actual artifact

Use content hashes for relevant source files, configuration, reference captures, assets,
and rendered outputs being judged. Include untracked, staged, and ignored generated
artifacts when they affect the result. Record missing/deleted relevant paths as well.
Avoid timestamps as the sole identity and avoid a lone `git diff` hash: neither covers
all relevant content. A saved manifest keeps hashing details out of the state summary.

Tie runtime evidence to the build and assets actually served. Record capture environment
and conditions in evidence metadata. Rebuilding or editing source does not prove the
review browser loaded the new result.

## Reconcile before dispatch

1. Match task, workspace, current user instructions, and contract version. If several
   checkpoints could match, inspect their goals before selecting one; never merge them
   implicitly. Preserve malformed state and reconstruct only from recoverable evidence.
2. Check old writers and processes through exposed tools. Resolve ownership before
   replacing a writer; missing IDs after restart mean unknown status, not completion.
3. Compare the manifest with actual content and inspect partial edits. Keep old evidence
   as history. Missing or unreadable evidence cannot support a current pass.
4. Mark checks affected by content, reference, contract, or environment changes stale,
   including dependent and whole-deliverable checks. When impact is uncertain, recheck
   the potentially affected scope. Preserve unrelated valid results.
5. Carry consumed attempts forward. Choose the next ready module by acceptance blockers,
   severity, and dependencies. Exhaustion blocks new implementation attempts, not review
   of the final attempt or required read-only acceptance checks. Request more budget only
   when further implementation is needed, subject to explicit user time/review limits.

For example, changing a shared material invalidates visual checks for every module using
it and the relevant whole-scene checks. An unaffected export filename check may remain
valid. Changing a reference image invalidates comparisons that used that reference.

Record user amendments with their reason and affected checks. Reviewers cannot silently
reclassify a mandatory failure as a suggestion. Nonblocking findings must remain consistent
with all current acceptance requirements.
