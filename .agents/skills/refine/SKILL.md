---
name: "refine"
description: "Explicit workflow-improvement review; user preferences → rules or skill; recurring task friction justifying a narrow skill or reference change; unattended weekly review ($refine weekly)."
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
Prefer an in-scope tool fix over documenting a workaround. For new guidance, use the first
form that fits, cheapest first: a script for a deterministic step the agent got wrong or did
slowly; a skill for a procedure with a recognizable trigger; a subagent for a bounded job
whose input is large and whose answer is small; a hook only when the evidence shows a rule
skipped more than once and a command can check it, because a hook also fires when it should
not; always-on text (kernel, `CLAUDE.md`, `AGENTS.md`) last, for a short rule every session
needs. Always-on text loads every turn, so adding lines to it means removing at least as many
from the same file, or saying in the report why the file should grow. Codex can disable
project hooks, so a rule a hook enforces keeps its wording in `AGENTS.md`. A description
change needs evidence that the trigger is wrong; an isolated misread can require no edit.

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

Read only this project's threads, never another project's. Saved rules and reports contain
the rule itself only: no quoted chat, no paths to session files, no credentials or tokens.

Codex threads are `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` and
`~/.codex/archived_sessions/rollout-*.jsonl` (`$CODEX_HOME` replaces `~/.codex` when set).
Decide scope from the first line alone, a `session_meta` record: keep the thread when
`git.repository_url` equals this repo's origin (ignore a trailing `.git` and letter case) or `cwd` falls inside the repo or one of its
worktrees; Codex worktrees live at `~/.codex/worktrees/<id>/`, so match the origin too.
User turns are `response_item` records with `payload.type` `message` and role `user`; skip
the injected `AGENTS.md` text and `<environment_context>` blocks in them. A thread whose
`source` is `exec` or a subagent had an agent typing the user turns: treat it as evidence of
delegation only, never as the user's preference.

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
cross-project personal rule to `~/.codex/AGENTS.md`, a project-wide rule to the project
kernel (`CLAUDE.md`, or `AGENTS.md` for Codex-only runtime rules), a quirk to
`.claude/reference/pitfalls.md` and other durable project facts to their reference file
(both through `$recall`), a procedure or check to the form chosen above, or nowhere. Keep
session events
and discoverable code facts out.

## Weekly mode

`$refine weekly` runs the review above without the user present, usually from a scheduled
task. Invoking it authorizes, for this repository only: reading the last 7 days of this
project's threads, editing repository files on a fresh branch from `origin/main`, pushing
that branch, opening one pull request, and appending to the metrics history file named in
step 2. It does not authorize merging, editing anything else outside the repository (such
as `~/.codex/AGENTS.md` or another repo), installing
anything, or another provider's paid review.

1. **Collect.** Read the Codex threads described above whose files were modified in the
   last 7 days and that match this repository by the `session_meta` rule. Skip `exec` and
   subagent threads and earlier weekly runs (their first user turn invokes
   `$refine weekly`): an agent typed those user turns, so they are not the user's words.
2. **Measure.** Count the threads read; user turns that correct the agent or repeat an
   instruction (the phrase grep above, plus "that's wrong", "not what I asked", "undo",
   "revert"), per thread, counting only turns timestamped inside the window; and comments the user wrote on pull requests merged in the
   window (`gh pr list --state merged --search "merged:>=<date>"`, then the review and issue
   comments of each, excluding bot authors), per merged pull request. Append one dated row
   to `~/.codex/refine-weekly/<repo id>.md` (`$CODEX_HOME` replaces `~/.codex` when set),
   where `<repo id>` is the repository id: its `origin` URL without scheme, user and trailing `.git`,
   lowercased, with every non-alphanumeric character replaced by `-`; with no `origin`, the
   main checkout's full path in the same form.
   Create the file with a header row if missing, and compare against the previous
   four rows. A phrase match is not always a correction: report the direction of change,
   not precise rates.
3. **Find.** Apply the review above to the collected threads, but skip its
   `memory-audit.mjs` run: that script reads every past transcript, beyond the window. In the new row's notes,
   record each task the user asked for this week as a short neutral description with its
   count of distinct threads, including tasks below three, without quoting chat. A task whose
   counts in this row and the previous four rows add up to three or more is a candidate for
   a playbook skill.
4. **Act.** Edit only what passes the evidence table's save row or the three failure checks,
   and only repository files. Everything else goes in the report for the user: suggestions,
   questions, contradictions, new skills, personal-rule changes, and any finding a project
   or personal rule keeps out of a file. List findings that are not specific to this
   repository in their own report section, as cross-project candidates.
5. **Ship.** With edits: branch `refine/weekly-<date>`, commit, push, and open one pull
   request whose body is the report. Without edits: no branch or pull request. Never merge.
   The report holds counts and rule text only, under the privacy rule above, because the
   pull request may be public. Final reply: the pull request URL or "no changes", this
   week's metrics row with the trend, and the items that need the user.

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
