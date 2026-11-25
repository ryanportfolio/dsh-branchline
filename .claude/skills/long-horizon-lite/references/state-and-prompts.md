# long-horizon-lite: state file, audit prompts, launch, resume

Read before creating the state file, before the first audit of a run, and when resuming. Dependency rounds, contract amendments, check-only repair and sections shipped as their own PR: `rare-paths.md`, next to this file.

## Resume

After compaction or restart: read state, compare it w/ `git log`, `git branch --list "lh-lite/<task-slug>/*"` and `git worktree list`. State file changed in last 30 min by another session → ask the user before touching it.

First, the paths in `rare-paths.md`, each per its own section there: an Amendments line marked `applying` → finish Contract amendment before anything else; one marked `proposed` → ask the user again; one marked `declined` whose round is still failed w/ no fix step for that finding → ask the user for another fix, or end w/ the Completion report; a Worker line that says `needs install` → Dependency round, Unplanned need, before any Scope check on that round; a `Waiting` line that names a PR → Section shipped as its own PR, step 3; a block w/ an `Install` line → Dependency round, Resume; a block w/ a `Repair` line → Check-only repair, Resume.

Then continue each round's block from its phase, never by running an executor over existing work:

- `planned` → first finish any Plan sub-step the block lacks (gate-0 log, audit section, both sha256), then Branch. A round branch or worktree left by an interrupted Branch stage is used as it is, not added again. A worktree that already holds changes means an executor ran: treat the round as `executing`;
- `executing` → confirm the worker stopped (not established → pause that round), then Scope check. A tip commit whose message starts `lh-lite round <N>:` is the Manager's own, made before the stop: record it and go to Gate;
- `committed` → Gate;
- `gated` → `git rev-parse -q --verify MERGE_HEAD` in the main workspace prints the round's last Attempts SHA → this round's merge was interrupted: `git merge --abort`, then treat it as a conflict. It prints any other SHA → that merge is not this round's: stop and ask the user, abort nothing. It prints nothing → look for the merge by its second parent, never by branch name (`r1` also matches `r10`): `git log --merges --format="%H %P" <task branch>`, the line ending in the round's last Attempts SHA. None → Merge. Found → record its SHA as the Round SHA, then look for its revert (`git log --grep "This reverts commit <Round SHA>"`). No revert → go on from Merge step 3. Reverted → Phase `closed`, step back to Remaining;
- `merged` → waits for its Sol run. A Sol fail already recorded for it, and nothing cites that report's findings yet (no fix step in Remaining and no fix round in Current rounds or Provisional progress w/ a finding reference into that report, and no `Repair` or Amendments line whose finding reference points into that same report; a line that cites an earlier report does not count) → run the fix-planning subagent now;
- `closed` → the round died, conflicted or was reverted, and its step is back in Remaining or in Dead ends.

A `merged` or `closed` round whose worktree still exists → finish Worktree cleanup now.

Audit runs. The Audit runs line is written before launch, so every run that started has one. A verdict already in the Audit log stands; do not apply the Accept rule to it again (HEAD has moved on since). For a run with no recorded verdict:

- `exit-code` present → apply the Accept rule now;
- no `$RUN/codex` dir → it never launched: launch it into that same dir;
- `$RUN/codex` but no `exit-code` → `$RUN/codex/status.json` shows progress (`events`, `elapsedSec`, every 30 s); `kill -0 "$(cat "$RUN/pid")"` succeeds → still running, wait. It fails → look for `exit-code` once more, since the run may have ended between the two looks; present → apply the Accept rule. Still none, or no `pid` file → failed run.

A second paid run only when the recorded one failed.

## Worktree cleanup

For a merged or closed round's worktree, and for the two worktrees of a check-only repair. `git worktree remove` deletes straight through a link it finds in the worktree, with or without `--force`: an ignored junction to the main workspace's dependencies does not show in `git status`, and removal empties the folder it points at. So:

1. Stop every process the round started.
2. For each path on the block's Links line: missing → already clean. `fs.lstatSync` says symbolic link (a junction reports as one) → remove it w/ Node's `fs.unlinkSync`, which does not follow it. Anything else at that path is not the link: leave it and show the user. A round's own dependency folder (a dependency round) → remove it per `rare-paths.md`, Dependency round, Cleanup.
3. List what is left: `find <path> -type l` (it also lists Windows junctions). Every entry must be a tracked symlink (`git -C <path> ls-files -s` shows it with mode 120000). Any other link → stop, do not remove the worktree, and show the user: it may be one made just before a stop and never recorded, or the user's own.
4. `git worktree remove <path>`, never with `--force`. A refusal means uncommitted or untracked files: show the user what is in it.

## State file

Copy into `.tmp/long-horizon-lite/<task-slug>/state.md`.

```markdown
# Contract  (current text; every change to it is an amendment below, made only on the user's explicit OK)
Version: v1
Goal: <one paragraph>
Acceptance: <the checks that prove it done, as a numbered list>
Sections: <S1: steps 1-3, acceptance checks 1-2, base <SHA of the task branch tip before its first round>, ships: with the task | own PR; S2: ...>  (none named: one section, all steps)
Task branch: <the branch the current section ships from>   Task base: <SHA that branch had before its first round>
Shipped: <per merged PR: the sections it carried, its task branch, audited head SHA, PR, merge commit; or none>
Waiting: <merge of <PR URL>, next branch <name>; or nothing>
User decisions: <choices and approvals the user gave, each approved install as command + step; or none>

# Amendments  (old text kept here; the Contract block holds the current text)
- v<n>, proposed | declined | applying | applied: "<the user's instruction, or for a proposal the finding reference>"; <old → new text per changed check or step>; affected rounds <N, N>; extra Sol runs <k>

# Verified progress  (every round passed a Sol run or was closed by fix rounds that passed, and the section passed its Astra run)
- <claim> — round <N>, commit <SHA>, Sol report <path>, section <S> Astra report <path>

# Provisional progress  (gate passed and merged; Sol verdict noted once it exists)
- <step> — round <N>, commit <SHA>, done-check log <path>, Sol: none yet | pass <report path> | fail <report path>

# Remaining
1. <step sized for one fresh context>; section: <S>; depends on: <step numbers or none>; finding: <report path#round.n, for a fix step>

# Current rounds  (one block per round, kept until its section is verified; scope and done-check fixed at Plan)
Round: <N>   Batch: <B>   Phase: planned | executing | committed | gated | merged | closed (<dead end, conflict, reverted, needs install, or amended v<n>>)
Step: <the one Remaining step this round works>
Branch: lh-lite/<task-slug>/r<N>
Workspace: <absolute path of the round's worktree>   Cut SHA: <task branch tip the round branch was cut from>
Links: <each dependency link w/ the entry count of the folder it points at, or `own dependency folder: <path>`, written here before it is created; or none>
Install: <dependency round only: approved command; restore: <restore command>; main workspace: not yet | installed | restored after revert>
Done-check: <command, folder relative to the repo root, expected exit code, expected output line if any>; script sha256: <hash at Plan>; red first: <gate-0 log path, failed as required>
Write scope: <paths the executor may change; test and gate definitions only if the step is about them>
Audit section: <path of the current one; a file once written is never edited> sha256: <its hash when written>
Worker: <agent ID, last observed status; `needs install <command>, asked` while that question is open; empty until an executor is dispatched>
Attempts: <commit SHA on the round branch per attempt, gate pass | fail; the last one is the tip the scope check expects>
Round SHA: <the merge commit on the task branch; filled at Merge>   Done-check log: <evidence/round-<N>/done-check.log, or the repair log that replaced it>
Repair <k>: <check-only repair only, one line per repair: started | held | failed; finding <report path#round.n>; plan <path>; check <path> sha256 <hash>; worktrees <path>, <path>>

# Audit runs  (one line per Codex run, written before launch)
- Sol group <G>: rounds <N, N, N>, contract v<n>, <run dir>, <process or task ID>, running | exited <code>, <verdict lines per round>
- Astra section <S>: base <SHA>, head <SHA>, contract v<n>, <run dir>, <process or task ID>, running | exited <code>, <verdict lines>

# Dead ends  (approaches that failed their gate twice; do not retry without new evidence)
- <approach>: <why it failed, one line>

# Audit log
- round <N> (batch <B>), attempt <k>: <step> — gate pass | fail, <log path>; merge <commit, "conflict, back to Remaining", or "reverted, back to Remaining">
- Sol group <G>: <N: status/integrity/contract, ...>, <observed model and effort>
- Astra section <S>: <pass|fail>, <aligned|drifted>, <observed model and effort>
- void by v<n>: <round N's Sol verdict, w/ the report path and the audit section it judged>
- round <N>, repair <k>: held | failed, <check path, both log paths>; replaced <old check, old audit section, old done-check log>
- unmerged round branches: <branch, why it was left>

# Codex runs
Sol: <count>   Astra: <count>   Expected minimum at start: <per section: rounds / 3 rounded up, + 1>
```

## Round audit section (frozen at Plan)

Write to `evidence/round-<N>/section.md` at Plan. Fill only from the contract and the round's block; a fix round also names its finding reference. This file is frozen: never edit it after Plan. An audit copies it into a group prompt and fills the three `<at audit>` fields in the copy, changing nothing else. A contract amendment or a check-only repair gives a round a new section in a new file (`section-v<n>.md`, `section-repair-<k>.md`), frozen the same way; the block's Audit section line names the one audits use.

```markdown
## Round <N>

Acceptance checks this step serves: <numbers and text>
Step: <step text>
Finding this step must close: <report path#round.n, or none>
Write scope: <paths>
Done-check: <command>, run from <folder relative to the repository root>, expected: <exit code and output line>
Check replaced: <none; or, after a check-only repair: the earlier check, the finding that called it wrong, and the log of this check failing at the base commit>

Base commit: <at audit: first parent of the round commit>
Round commit: <at audit: Round SHA>
Done-check output, captured by the task manager at the round commit: <at audit: absolute log path>
```

## Sol group prompt

Build in the new run dir: the text below, then the copied and filled section of each round in the group (three at a checkpoint, one or two for a section's last rounds). Each round's section = the file its block's Audit section line names, and its log = the block's Done-check log.

Before a section goes into a prompt, recompute that file's sha256. Mismatch with the block → do not dispatch it: rewrite that section from contract + block, note the tampering in the Audit log, and tell the user. Match → copy it and fill three facts in the copy, nothing else: base = `<Round SHA>^1`, Round SHA, the Done-check log path. A small script may do the copy and fill, if it checks that each placeholder occurs exactly once per section.

```markdown
You are the independent auditor for steps of a larger task. You did not write this code and have
seen none of the author's explanations. Work read-only: no edits, no agents, no nested reviews.

Contract (version <the state file's Version>):
<goal paragraph>
Recorded decisions: <the User decisions line of the state file, or none>
Amendments: <the applied Amendments lines of the state file, or none>

Below are <k> rounds. Judge each one on its own; one round's result never excuses another's.

Judge a step against what it says and what the acceptance checks it serves say, read as a careful
engineer would read them. Do not judge it against every input you can construct. A sweeping
sentence in a step ("rejects everything that is not X") is bounded by the cases its acceptance
checks name. A gap those cases do not name goes under NOTES and changes no verdict.

Your sandbox is read-only and may lack the project's tools. A command you cannot run is not a
finding: say so and rely on the log.

For each round, the round commit is the merge commit that brought that step into the task branch,
and the base commit is its first parent. Your checkout may be at a later commit, because other
steps were merged after it. Judge a step by its own diff, and read a file as that step left it
with `git show <round>:<path>`.

Per round, in order:
1. Read the change with `git diff <base> <round>` and `git diff --stat <base> <round>`. That diff is
   the author's whole work for the step, every attempt included, and no other step's work.
2. Read the done-check log. Rerun the command only if it is safe to run without writing files, and
   say that a rerun reflects the later checkout, not the round commit.
3. Read the changed code and its callers far enough to judge whether the step is done, not only
   whether the check passed. Commit messages, comments and docs in the diff are the author's claims,
   not evidence.

Open your answer with one block of exactly these five lines per round, in round order, with at
most a blank line between blocks. Each line carries one value and nothing after it: write `STATUS: complete`,
never the list of choices and never a comment on the same line. The detail follows after the last
block.

ROUND: <N>
STATUS: <complete, incomplete or blocked>
CHECK: <sound or weak>
INTEGRITY: <clean, suspect or violation>
CONTRACT: <aligned or drifted>

- STATUS is complete when the code does what the step says and no finding breaks the step's stated
  outcome or an acceptance check it serves. It is incomplete when such a finding exists, whether or
  not the done-check caught it. It is blocked only when you could not judge the step: the done-check
  cannot run as written, or it tests something other than the step. Say which.
- CHECK is weak when the done-check passes although a failing finding is present, or would pass
  with the step undone. A weak check does not by itself make the step incomplete.
- INTEGRITY is clean only if the diff touches nothing outside the write scope. A diff that changes
  test or gate definitions the step did not own is suspect at best: a passing check proves nothing
  if the author could edit it. Unclear evidence is suspect.
- CONTRACT is drifted only when the change contradicts the goal, an acceptance check or a recorded
  decision: it does something they rule out. Falling short of them is incomplete, not drifted.

Then, per round:
EVIDENCE: for each verdict, the `path:line` or the command and output you relied on.
FAILING: numbered within the round. Only findings that make STATUS incomplete or blocked, INTEGRITY
suspect or violation, or CONTRACT drifted. Each: `path:line`, what is wrong, which stated outcome or
acceptance check it breaks, and the observation that would show it fixed. A round that is complete,
clean and aligned has none.
NOTES: numbered within the round. Everything else: what a weak check misses, hardening, and edge
cases past what the contract names. Each: `path:line` and one line. These change no verdict.
```

## Section audit prompt (Astra)

Write into the section's new run dir at section end, after the Manager ran each acceptance check listed for the section and saved each output in that same run dir, one log per check (a re-audit's logs then never overwrite the first run's). For the last section, list every acceptance check of the contract and every step on the current task branch; its base is the Task base. After a section shipped as its own PR that is the new branch's base, never the first branch's, and the shipped sections go on the `Shipped before the base commit` line. A re-audit gets a new run dir and a new prompt with the new head commit.

```markdown
You are the independent auditor for a finished section of a larger task. Another auditor judges
each step on its own. You did not write this code. Work read-only: no edits, no agents, no nested
reviews.

Contract (version <the state file's Version>):
<goal paragraph>
Recorded decisions: <the User decisions line of the state file, or none>
Amendments: <the applied Amendments lines of the state file, or none>
Acceptance checks for this section: <numbers and text>
Steps in this section: <step texts>
Shipped before the base commit: <sections already merged into the default branch, with their steps; their work is in the base commit and not in this diff; or none>

Base commit: <section base SHA, or the current Task base SHA for the last section>
Head commit: <HEAD SHA>
Acceptance check outputs, captured by the task manager at the head commit: <check number: absolute log path, one per check>

Do this in order:
1. Read the change with `git diff <base> <head>` and `git diff --stat <base> <head>`.
2. Read each acceptance check log. Rerun a check yourself when it is safe to run without writing files.
3. Look for what a per-step audit cannot see: steps that do not work together, a later step that
   broke an earlier one, work that drifted from the contract, and acceptance checks that pass while
   the goal is not met.

Your sandbox is read-only and may lack the project's tools. A command you cannot run is not a
finding: say so and rely on the log.

Answer with exactly these two lines first, then the detail. Each line carries one value and nothing
after it: write `SECTION: pass`, never the list of choices and never a comment on the same line.

SECTION: <pass or fail>
CONTRACT: <aligned or drifted>

- SECTION is fail when a finding breaks the goal or an acceptance check, read as a careful engineer
  would read them, not against every input you can construct.
- CONTRACT is drifted only when the work contradicts the goal, an acceptance check or a recorded
  decision. Falling short of them is a fail, not drifted.

EVIDENCE: for each acceptance check, pass, fail or not run, with the log path or your own command and output.
FAILING: numbered. Each: `path:line`, what is wrong, which acceptance check or step it breaks, and
the observation that would show it fixed.
NOTES: numbered. Hardening and edge cases past what the contract names; these change no verdict.
```

A section passes only on `SECTION: pass` + `CONTRACT: aligned` from a run that meets SKILL.md's Accept rule, launched after every round of the section passed Sol or was closed by a fix round that passed. The pass belongs to the head commit in the prompt.

## Launch

Every launch goes through the shared runner `$RUNNER` (lookup below; README beside it); never hand-build `codex exec`. Preflight: `node "$RUNNER" --preflight` → exit 0 + JSON (CLI version, login or gateway, role pins); exit 1 → Codex unavailable, per Guardrails. Model pins = roles in `models.json` next to the runner in use: round auditor `ROLE=sol`, section auditor `ROLE=astra`. Both at effort high: `--effort` overrides astra role's medium default. Explicit user model or effort → below. Newer model in catalog → tell the user; update `models.json` only with the user's OK, never edit pins here.

One new directory per run, never reused: `evidence/sol-group-<G>/audit-1`, `evidence/section-<S>/audit-1`; a retry or a re-audit takes the next free number. `mkdir` without `-p` fails on an existing directory: stop there and take the next number. Runner output goes to `$RUN/codex` (runner refuses an existing non-empty dir; `$RUN` already holds prompt, meta, check logs). Prompt via `--prompt-file` (runner pipes it to stdin `-`), so no shell quoting touches it.

```bash
RUN=<absolute task dir>/evidence/sol-group-<G>/audit-1     # or evidence/section-<S>/audit-1
mkdir -p "$(dirname "$RUN")" && mkdir "$RUN"               # then write the prompt to "$RUN/prompt.md"
```

`$RUNNER` lookup, in the same command as preflight and every launch (working directory stays the target repo): the repo's own runner, then the one shipped beside this skill, then the user install. None found → tell the user; Codex unavailable.

```bash
for RUNNER in .claude/scripts/codex-run/codex-run.mjs "<this skill's folder>/../../scripts/codex-run/codex-run.mjs" "$HOME/.claude/scripts/codex-run/codex-run.mjs" ""; do [ -f "$RUNNER" ] && break; done
test -n "$RUNNER" || echo "codex-run runner not found: tell the user"
```

```bash
test -n "$RUNNER" && test -n "$ROLE" && test -s "$RUN/prompt.md" && test ! -e "$RUN/codex" && { echo $BASHPID > "$RUN/pid"; node "$RUNNER" --out "$RUN/codex" --role "$ROLE" --effort "${EFFORT:-high}" --sandbox read-only --timeout-min 60 --label "lh-lite $RUN" --prompt-file "$RUN/prompt.md" > "$RUN/runner.log" 2>&1; echo $? > "$RUN/exit-code"; }
```

Set `RUN`, `ROLE` and `RUNNER` in the same command: a new shell call does not keep them. User named a model → `MODEL=<id>`, swap `ROLE` for `MODEL` in the first guard and `--role "$ROLE"` for `--model "$MODEL"`. Set `EFFORT` only when the user chose an effort other than high. The four `test` guards keep Codex from starting without a runner, without a model, without a prompt, or into a directory that already holds a run. `pid` holds the shell that waits on the runner (`$BASHPID`, which stays right when the block runs in the background; `$$` would name the parent shell) and `exit-code` (runner: 0 ok, 1 run failed, 2 bad arguments) is written when the run ends, so both survive a restart of the Manager: Resume reads them to tell a running run from a dead one, and the Accept rule reads the exit code + `$RUN/codex/result.json`. `--timeout-min 60` = choice, not measured: runner kills the process tree, `reason: timeout`, a failed run.

Launch each run as its own background process from the task branch checkout, at most 4 at a time; start the next as one exits. A foreground tool call dies at the harness's 10-minute ceiling and takes the audit with it. Progress while out: `$RUN/codex/status.json` (`events`, `elapsedSec`). Before launch record in `$RUN/meta.md`: workspace, the SHAs and the contract version in the prompt, CLI version (preflight), command, requested role/model + effort, start time. After exit add the end time and, from `$RUN/codex/result.json`: `ok`, `reason`, `observed` model/effort/sandbox, `threadId`, `usage`. `observed` null or a `warnings` entry → report it as requested, resolution unverified.

Map `reason` to SKILL.md Accept and Guardrails: `ok: true` → read verdict lines. `model_rejected` → never swap or drop the model; Sol → `codex-review` Step 4, Astra → report per `astra-review`. `model_mismatch`, `sandbox_mismatch`, `timeout`, `nonzero_exit`, `empty_report` → failed run: one retry in a new run dir, same prompt, then stop.

Report = `$RUN/codex/last.md` (final message). Read only the verdict lines of each report into the Manager's context: the five-line block per round at the top of a Sol report, the first two lines of a section report. Trim surrounding whitespace and skip blank lines; each line must then be exactly a key and one allowed value. Anything else on a verdict line makes the report malformed, which is a failed run, never a pass. Report bodies go to the subagent that plans fix steps, and to fix-round executors, by path.
