---
name: recall
description: "Before unfamiliar project-area work; retrieve project decisions or pitfalls; save authorized durable fact; quirk just cost retry, backed-out change, or user correction → pitfalls."
---

# Retrieve and maintain project knowledge

Read the applicable AGENTS.md boundary. Discover the project's reference directory or
index; in this repository, list `.claude/reference/` and read only relevant topics.
The shared directory name does not make its facts Claude-only. Prefer current source and
observed behavior when stored notes conflict with reality. Cite the conflict and its effect.
When a stored fact changes an action, say so with its file and date, for example "per
pitfalls.md (2026-03-14): the test database must be reset first, resetting it", so a stale
fact surfaces as a dated claim the user can correct in one reply.

Before opening or updating a pull request, fetch the default branch and run
`node .claude/scripts/memory-audit.mjs --diff origin/<default-branch>`. It lists the
reference entries that cite a file the change touched. Re-read each one against the new
code: leave it if it still holds, amend it if part of it changed, or retire it as below if
the change made it false. Correcting an entry the change made false needs no separate
request; adding new facts still follows the save rules below. The list is a prompt, not a
verdict, and it misses an entry that describes changed code without naming its path, so
also check entries you know cover the area. When writing an entry, cite folders with a
trailing slash (`assets/`) and files by path or full name: a bare name with no slash or
extension (`assets`) matches only while it still exists, so deleting it hides the entry.
Report what you changed, or that every listed entry still holds.

For lookup, answer from relevant entries with evidence pointers. If no entry answers the
question, inspect the project or state the gap. Do not create facts or edit memory merely
because a lookup found nothing. Stay within the requested project's history and references.

Pitfalls carry standing authorization. When a project quirk cost a wasted attempt, a
backed-out change, or a user correction in this session, and its cause is confirmed rather
than guessed, save it to the project's pitfalls reference before the task ends without
asking. Waiting for an explicit save request is how quirks get lost. Every other durable
fact saves only when the user requested or authorized capture. All saves need:

- The fact changes future decisions and cannot be recovered cheaply from the code.
- It is a durable constraint, decision, or recurring pitfall, not a task status or PR event.
- Evidence supports it; uncertainty and exceptions are preserved.

If a non-pitfall capture lacks authorization, finish useful lookup and propose the specific
note. Existing authorization to save a fact does not require another confirmation. Read the
target first. Amend stale entries instead of stacking contradictory notes; when the new
fact contradicts the old one, keep one line `retired YYYY-MM-DD: <old claim>; reason: <what
changed>` at the end of the entry so a later reader sees the flip. Keep entries short,
dated, topic-specific, and linked to evidence. Preserve unrelated content.

For a new topic, update the index Codex actually reads if the project has one; otherwise
directory discovery is sufficient. Do not duplicate cross-cutting AGENTS.md rules or
expand the always-loaded instructions with local implementation trivia.

Validate links and factual accuracy, then report the path and what changed. Saving a note
does not inherently require a commit. Commit, push, global edits, and propagation to other
repositories follow current authorization separately. Do not silently promote a local
lesson into a rule for every project.
