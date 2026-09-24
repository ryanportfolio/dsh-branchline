---
name: refine
description: "Use for an explicit workflow-improvement review, turning the user's preferences into rules or a skill, or recurring task friction that may justify a narrow change to skills or project references."
---

# Improve the working process

Inspect actual task events and the relevant current instruction before recommending a change.
Separate stale facts, missing guidance, a poorly scoped trigger, tool/config defects, and
failure to follow an existing rule. A correction is evidence to examine, not automatically
a universal preference. If the rule already exists, avoid duplicating it.

Look at consequential decisions, wasted tool calls, repeated failures, and backed-out actions.
Run `node .claude/scripts/memory-audit.mjs` for the read-side view of reference entries,
memory files, and skills: never-read files, dated entries older than six months, and retired
lines old enough to prune are candidates to check, not verdicts.
For each recurring problem, identify the smallest change that would have prevented it.
Prefer an in-scope tool fix over documenting a workaround. A description change needs
evidence that the trigger is wrong; an isolated misread can require no edit.

Only the user's own words count as evidence of a preference. Before reading deeply, grep
the user's turns case-insensitively for phrases that set or repeat a standing rule:
"from now on", "going forward", "every time", "always", "never", "I already told you",
"why do you keep". The grep only picks where to read first; a standing rule phrased any
other way still counts.
Decide each candidate by this table:

| Evidence in the user's turns | Action |
|---|---|
| The user said it applies from now on, or asked to save it | Save it; one occurrence is enough |
| The user let the same agent choice pass several times without comment | Suggest it to the user; do not save |
| Only the agent did it | Nothing |
| The user said opposite things | Ask |
| The instruction was about one task | Leave it with that task |

Past sessions: this project's folder under `~/.claude/projects/<munged-path>/` plus its
`memory/MEMORY.md`; never open another project's transcripts. Saved rules and reports
contain the rule itself only: no quoted chat, no paths to session files, no credentials or
tokens.

A preference the user asked to save needs only the evidence table above. To fix a failure,
pass three checks before editing; failing any means zero changes is the correct outcome.
The failure is attributable to an instruction, tool, or configuration, not to the model
reasoning wrong on correct inputs with working tools. The causal link is stated from the
evidence: which behavior caused the failure and how the change removes it. The rule or
parameter being changed was active in the failure; changing one the evidence shows was
never exercised does nothing. Before attributing a failure to instructions, check what the
agent saw and remembered: filtered, clamped, or truncated tool output, summarized context,
or a stale observation explains many "did not follow the rule" events, and added text does
not fix those.

For a review request, report evidence and proposed changes. For an instruction to improve
the workflow, make reversible changes within the named scope. Auto-selection at task end
does not authorize global edits or publication. Read before editing; preserve unrelated
work and a backup or diff for non-Git files. Route each confirmed change to one home: a
cross-project personal rule to `~/.claude/CLAUDE.md`, a project-wide rule to the project
kernel, a quirk to `.claude/reference/pitfalls.md` and other durable project facts to their
reference file (both through recall), a repeatable procedure to a skill, or nowhere. Keep
session events and discoverable code facts out.

For skill authoring or installation, use addskill when available; Codex authoring uses
built-in skill-creator. A standalone refinement can use the local evaluation resource
without requiring the repository or another installed skill.

Use static validation for straightforward wording/metadata fixes. For material changes to
routing, decisions, verification, or retained working behavior, use the local
[evaluation record](references/evaluation.md) before trials. Compare the baseline and
candidate on targeted and neighboring scenarios in fresh context when available. This skill
requests bounded validation agents only when useful. Judge observable actions, not copied
headings. Separate local acceptance, later observed use, and demonstrated improvement;
pending later use does not block a local edit.

Report changed files, evidence, verification, and limits. Zero changes is valid. Commit,
push, cross-project synchronization, and another provider's paid review need existing or
explicit authorization; there is no mandatory one-friction/one-commit rule.
