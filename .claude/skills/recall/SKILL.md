---
name: recall
description: "Use before unfamiliar project-area work, when retrieving project decisions or pitfalls, when saving an authorized durable fact, or when a quirk just cost a retry, a backed-out change, or a user correction and belongs in pitfalls."
---

# Retrieve and maintain project knowledge

Read the applicable CLAUDE.md instructions. Discover the project's reference directory or
index; in this repository, list `.claude/reference/` and read only relevant topics.
Shared project facts can serve either runtime. Prefer current source and
observed behavior when stored notes conflict with reality. Cite the conflict and its effect.
When a stored fact changes an action, say so with its file and date, for example "per
pitfalls.md (2026-08-29): the plugin browser is shared, using playwright-iso", so a stale
fact surfaces as a dated claim the user can correct in one reply.

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

For a new topic, update the project reference index if the project has one; otherwise
directory discovery is sufficient. Do not duplicate cross-cutting CLAUDE.md rules or
expand the always-loaded instructions with local implementation trivia.

Validate links and factual accuracy, then report the path and what changed. Saving a note
does not inherently require a commit. Commit, push, global edits, and propagation to other
repositories follow current authorization separately. Do not silently promote a local
lesson into a rule for every project.
