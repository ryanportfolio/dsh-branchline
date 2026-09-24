---
name: enhance-prompt
description: "Use when the user asks for a rewritten, copy-ready prompt for another agent or session. Produce the prompt without executing its task."
---

# Write a usable handoff prompt

Preserve the user's intended task: advice, review, planning, or implementation. Carry forward
settled choices and existing authorization without broadening either. Do not turn approved
implementation into another proposal round merely because it touches UI copy or an API.

Gather the minimum cold-reader context: current and desired behavior, verified file paths,
relevant patterns, constraints, and completion checks. Inspect facts that can be discovered.
Ask only when a missing decision materially changes the prompt; identify harmless assumptions.
Never invent requirements, metrics, files, or permissions.

For a Codex-targeted prompt, include relevant AGENTS.md constraints, the intended workspace
or branch when known, and native capabilities only when they affect execution. For a generic
recipient, use portable outcome-based instructions. Inline necessary constraints if the
recipient cannot access the source. Keep pasted data distinct from instructions.

Match detail to the task. A useful sequence is context, task, constraints, verification,
and requested output. Short tasks need no formal template. Include examples only when
they clarify the deliverable. Split into approval phases only for genuinely unresolved
decisions or external actions needing new authority, not as a blanket default.

State what happens if a required check or resource is unavailable: report the gap and
continue independent authorized work. Match verification to the claim; do not add broad
test prohibitions or require full-suite execution for every tiny change.

Read the draft as a recipient with no conversation history. Remove padding and ambiguous
references. Deliver one copy-ready block in normal, clear prose, optionally preceded by a
short note describing material changes. Do not execute the prompt, edit project files,
or create a separate task unless the user separately requested that action.
