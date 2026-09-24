---
name: "external-review"
description: "Use on explicit $external-review invocation or when a launcher prompt names this file. Single-context leaf review of an exact diff scope: no agents, nested reviews, or edits."
---

# External leaf review

One reviewer, one fresh context, one exact scope. The launcher that invoked this skill
owns dispatch, verification of findings, and any fixes. Single-context review is the
designed mode here, not a gap: do not suggest or mention spawning sub-reviewers as a
missing step.

## Scope identity

Resolve exact base and head SHAs from the invocation, or from the stated selector
(branch, commit, PR, uncommitted changes). When head differs from the checked-out
`HEAD`, read head content with `git show <head>:<path>` and the change with
`git diff <base> <head>`, not from the working tree. Dirty and untracked content is in
scope only when the selector includes the working tree, as in an uncommitted review;
then record the relevant paths with content hashes. State the scope before reviewing.
If the scope cannot be resolved to exact revisions and content, report that and stop;
do not guess a base, widen to unrelated history, or review a different diff.

## Review areas

Cover all five areas in this order within the one context:

1. Correctness and types.
2. Data flow, compatibility, and failure handling.
3. Performance, security, and observability.
4. Missing integration and cleanup: callers, config, docs, tests, and generated files the change should have touched.
5. Project-specific rules. AGENTS.md governs Codex; shared product constraints apply
   regardless of author. Do not import Claude-only session policies as Codex obligations.

When the diff extracts repeated operations or changes a shared boundary, read
[selective shared-code refactoring](references/shared-code-refactoring.md) and apply its
caller and invariant checks.

## Evidence

Read the changed code and its relevant callers before reporting. Run an affordable
reproduction when it resolves uncertainty, using read-only commands only. The run may be
in a read-only sandbox: a check that needs writes, installs, or network is reported as
unavailable, never as passed. Missing access means a check was unavailable, not that the
code passed.

Report credible uncertain findings with their uncertainty. Do not invent issues or promote
style preferences into correctness findings. Finding nothing is valid.

## Hard limits

- Leaf reviewer. Spawn no agents and start no subprocess review or nested review; never
  run `codex exec` or any other reviewer CLI.
- Invoke no other skill or review workflow.
- No file edits, no Git writes, no publication (comments, PRs, pushes, messages).
- Current system, developer, sandbox, approval, and user instructions win.

This is a fresh-context review by one reviewer. Do not claim multi-reviewer coverage or
vendor independence.

## Report

Keep it concise and in this order, so the launcher can parse it. If the runtime
prescribes an output schema, follow it and include these fields.

1. `Scope: <base>..<head>`, plus in-scope dirty or untracked paths with hashes, or `clean`.
2. Findings, ordered by severity (P0 critical, blocks release; P1 high; P2 medium;
   P3 low). Each has:
   location (`path:line`), trigger, consequence, evidence, proposed fix, severity, and
   confidence (high, medium, low). Keep severity separate from confidence.
3. `Checked and fine`: areas and specific risks inspected with no finding.
4. `Unavailable checks`: what could not be run or read, and why.
5. `Verdict:` one line.
