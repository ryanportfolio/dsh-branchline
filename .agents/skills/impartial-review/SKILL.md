---
name: impartial-review
description: "Use when the user requests independent review of code, a diff, or recent changes. Requires fresh reviewer context through exposed agents or an authenticated Codex CLI."
---

# Independent Codex review

Manager fixes the review scope, dispatches independent reviewers, verifies their findings,
and reports actionable results. Review requests do not authorize implementation or publication.

Resolve the requested files, commit, or PR. Otherwise inspect uncommitted changes first,
then the latest commit and any relevant open PR. Record exact base/head revisions and
dirty/untracked content. Capture enough baseline to distinguish existing work. State scope.
Use path/content hashes for relevant dirty and untracked content; exclude task-owned
report artifacts. Review evidence applies to that content; relevant later edits require renewed review.

For uncommitted or untracked work, or a diff over about 1500 lines, freeze the scope with
`node <this skill>/scripts/snapshot.mjs --base <ref> [--merge-base] [--root <dir>] [--exclude <report dir>]`
(`--base` defaults to `HEAD`; use `--base origin/main --merge-base` for a branch or PR). The
script always snapshots the checked-out working tree. To review a commit, branch or range
whose head is not checked out, or a checkout with unrelated local edits, first create a clean
worktree at the requested head (`git worktree add --detach <dir> <head>`) and pass `--root <dir>`. It
compares the base with the working tree, untracked files included, and writes a folder under
`.tmp/review-snapshots/` with `base/` and `head/` copies of changed files, `scope.patch`,
`source-inventory.json` (path, status, SHA-256, absolute paths, scope hash) and `BRIEF.md`.
CRLF becomes LF before diffing, so a pure line-ending flip is listed `eol-only` and stays out
of the patch. Copies and patches over 48 KB or 1800 lines are also split into pages. The brief
ends with a JS/TS import check listing `unresolvedDeps`. Exit 1 with no inventory means a
changed path is missing from the patch: fix the cause, never review a partial patch. Before
accepting findings, run `snapshot.mjs --verify <snapshot dir>`; exit 1 lists drifted paths,
and findings on them are stale, or altered snapshot files, which need a fresh snapshot. When the caller already supplied a snapshot (a `BRIEF.md`
path), use it as is. When this session cannot write files, for example a Manager in a
read-only sandbox, do not run the script: use git commands for the scope, record the hashes
above by hand, and state in the report that the scope was not frozen.

An author brief is optional: facts only (the goal in one or two sentences, the files or
behaviors most likely to break, related work in flight such as other PRs or merge order,
and checks already run with results), never a verdict. The caller may supply one, or the
Manager writes one when reviewing work this session wrote.

When the diff extracts repeated operations or changes a shared boundary, read
[selective shared-code refactoring](references/shared-code-refactoring.md)
and include its applicable caller and invariant checks in reviewer briefs.

When the user asks for a strict, harsh, or deep maintainability review, read the
[strict quality rubric](strict-quality-rubric.md) and append it to the brief of the
reviewer covering missing integration/cleanup (the sole reviewer on a small change). It adds maintainability blockers on top
of the normal areas; correctness coverage is unchanged.

## Dispatch

Use currently exposed native agents first. Spawn with `fork_turns: "none"` or the runtime's
actual fresh-context equivalent. Do not pass Manager reasoning or an author's proposed
verdict. Give each reviewer scope, raw artifacts, relevant constraints, and these rules.
With a snapshot, the scope is its `BRIEF.md` pasted verbatim; reviewers resolve every path
against the absolute snapshot and workspace paths it names, never their own working directory
or another checkout.
The author brief goes to the intent reviewer only; every other reviewer gets the diff without it.
Each is a leaf reviewer: no agents or review subprocesses of its own, no fixes or Git writes.
Reviewers never enter plan mode, write a plan, or wait for approval; a report that does is a
failed review for that area: rerun it or report the area as uncovered.

For a small, low-risk change, use one independent reviewer. For broader work, cover all
five areas, assigning reviewers or bounded batches according to actual available capacity:
correctness/types; data flow/compatibility/failures; performance/security/observability;
missing integration/cleanup; project-specific rules. With an author brief, at either size, add one
intent reviewer: diff plus brief, checking whether the change achieves its stated goal on every path
the goal implies, which required cases it leaves unhandled, whether the areas the brief calls risky are
actually safe, how it interacts with the related work named, and whether the checks run cover the risky
parts. The brief is framing, not evidence: findings come from the code. For every diff except a tiny one
(under 50 changed lines in one file, with no schema, auth, or cache code), also add one open-lens reviewer: diff plus the names of the lenses already assigned (never their findings or the brief).
It chooses the one or two lenses most likely to find a real problem that no assigned reviewer covers, from the
unassigned areas or any lens the diff calls for (rendering and frame budget, accessibility, concurrency,
cross-platform shell and path behavior, cost, user-facing copy), names each with the diff lines that make it
relevant, then reviews through it. A lens without a reason tied to this diff is a failed review. Count Manager and other active agents
against capacity; state worker and retry bounds. Wait and release completed agents when supported before starting a new
batch. Preserve independent context even when execution is sequential.

Inherit the session model when suitable. Respect an explicitly required model or quality
floor; do not silently downgrade. Native Codex reviewers provide independent context, not
vendor independence.

If native agents are unavailable, check authenticated Codex CLI and its current help.
Run separate read-only `codex exec` processes with standalone prompts on stdin, unique
output/log files, and bounded concurrency. Pass exact scope and forbid nested review.
Track processes and wait for completion; stale files are not new results. Require a
successful process exit and non-empty report in a newly created run directory, record
report hash and observed model/effort, and recheck source identity. Missing required
inspection remains incomplete coverage despite exit 0; unknown model resolution stays
unverified. Model fallback or a usage-consuming retry requires existing explicit
authorization or user agreement. Use supported
options and authorized model settings. If neither route can supply independent context,
report the gap; do not call Manager self-review an impartial review.

## Reviewer evidence

Read code and relevant callers before reporting. Exercise an affordable reproduction when
it resolves uncertainty. Match project rules to what they govern: AGENTS.md governs Codex;
shared product constraints remain relevant regardless of author. Do not import Claude-only
session policies as Codex obligations.

For each finding include location, concrete trigger, consequence, evidence, proposed fix,
severity, and confidence, plus three lines: `Scope:` (the first 12 characters of the scope
hash, or the git range), `Evidence: read-only` or `Evidence: executed` with each command and
its result, and `Files read:` with absolute paths. Keep severity separate from confidence. Missing access means a
check was unavailable, not that code passed. Report credible uncertain findings with their
uncertainty; do not invent issues or promote style preferences into correctness blockers.
Finding nothing is valid.

Manager first sets aside findings whose `Scope:` differs from the run's scope hash or that sit
on paths `--verify` reports as drifted; they need renewed review. Manager then deduplicates and
tries to refute findings against the same snapshot copies the reviewer read, never a different
checkout; a disagreement with a reviewer is settled there, citing the lines read and any
command run. Confirm, dismiss with evidence, or retain explicit uncertainty. When the intent reviewer ran, tag each
finding blind (diff-only reviewers), intent, or both; flag a blind-only finding in an area the
brief called risky or covered. Rank globally by impact. Report
actionable findings, material unavailable checks, reviewed scope, whether the intent reviewer ran, each standard
area that had no reviewer with a one-line reason tied to the diff, the lenses the open-lens reviewer chose with
its reasons, and recommendation.
Keep speculative concerns separate from verified defects. Fix only when requested or
already authorized, then independently recheck affected claims.
