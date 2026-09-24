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
Each is a leaf reviewer: no agents or review subprocesses of its own, no fixes or Git writes.

For a small, low-risk change, use one independent reviewer. For broader work, cover all
five areas, assigning reviewers or bounded batches according to actual available capacity:
correctness/types; data flow/compatibility/failures; performance/security/observability;
missing integration/cleanup; project-specific rules. Count Manager and other active agents
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
severity, and confidence. Keep severity separate from confidence. Missing access means a
check was unavailable, not that code passed. Report credible uncertain findings with their
uncertainty; do not invent issues or promote style preferences into correctness blockers.
Finding nothing is valid.

Manager deduplicates and tries to refute findings against the actual source. Confirm,
dismiss with evidence, or retain explicit uncertainty. Rank globally by impact. Report
actionable findings, material unavailable checks, reviewed scope, and recommendation.
Keep speculative concerns separate from verified defects. Fix only when requested or
already authorized, then independently recheck affected claims.
