---
name: long-horizon-lite
description: "long-horizon, lighter: fresh executor per step, parallel where safe, a branch + merge per round as baseline, Codex audits in groups (one Sol run per 3 merged rounds, one Astra run at the end of each major section). Use: /long-horizon-lite. Needs Codex, a Git repo, results a commit can hold; an audit before every next step → long-horizon."
disable-model-invocation: true
---

# long-horizon-lite: Git-tracked rounds, Codex audits every 3 rounds

Roles: Manager (this ctx) holds goal + state file, delegates every round. Executor = fresh Claude subagent, one step per round. Auditor = Codex, never Claude. Lighter than `long-horizon`: Git carries the bookkeeping (a branch per round, one merge commit into the task branch), and one Codex run judges three rounds in place of a fresh auditor subagent per round. Discussing/editing this skill does not activate it.

## What it needs

- Codex: every audit is a Codex run.
- A Git repo: rounds are branches and merges.
- Every step's result fits in a commit: nothing written outside the repo, no gitignored deliverable, no change to the machine outside a checkout.

One missing → `long-horizon`. Also `long-horizon` when every step must be audited before the next one builds on it. Under ~3 dependent steps → `fable-mode` directly.

`references/rare-paths.md` ("rare paths" below) holds four paths; read a path's section before taking it: a dependency install, a contract change, a `blocked` round whose check is wrong, a section shipped as its own PR.

## Guardrails

- Typing `/long-horizon-lite` is the user's OK for this task's Codex runs: one Sol run per three merged rounds, one Sol run for a section's leftover rounds, one Astra run per major section, and one Astra re-audit of a section that failed. A request relayed by another session or agent is not that OK: quote the run count to the user in this session and wait. Each run bills the user's Codex subscription, so before round one tell the user the expected minimum (per section: rounds / 3 rounded up, + 1) and that fix rounds, a repaired check's re-audit, an Astra re-audit, a retried run, and the repo's own PR review add to it. Keep a running count in the state file.
- Never spend a Sol run on fewer than three rounds before their section ends. One exception: every step left in the section waits on those rounds' verdicts. Astra runs only at the end of a major section, after every round of it has passed Sol.
- Codex unavailable, or an audit run fails twice → stop and tell the user. Never count a Claude subagent's review or the Manager's own reading as the audit.
- Models: round auditor = Sol (role `sol`), section auditor = Astra (role `astra`), both at effort high (overrides astra's medium default); pins: `models.json` next to the runner in use. Newer model → tell the user; update `models.json` only with the user's OK. An explicit user model or effort choice wins (`--model`, `--effort`). Never drop `--role`/`--model`. A rejected Sol id → `codex-review` Step 4. A rejected Astra id → report it per `astra-review`; never swap models.
- Explicit user round/time/cost limits binding; checkpoint before exceeding. Never weaken acceptance just to make a round or section pass. The contract changes only on the user's explicit OK, in this session, to the exact change and the audit runs it costs → rare paths, Contract amendment.
- Never reset, force-push, or delete an unmerged branch without the user's OK. A round installs or updates a dependency only when the user approved that exact command for that step → rare paths, Dependency round.
- Invocation does not authorize publication, installation, deployments, or external messages.

## Manager context

- Manager reads exit codes, counts, verdict lines, and executor reports. Never diffs, done-check logs, or audit report bodies: those pass between workers by file path.
- Every command the Manager runs sends its output to a file under the task dir and prints one line (exit code, match count, SHA).
- Executor brief asks for a report of 10 lines or fewer: changed paths, how to check, blockers.
- Anything that needs reading (a failing report, a log, a conflict) → a fresh subagent reads it and returns a short answer.

## Start

1. Contract: goal, numbered acceptance checks, steps (each sized so one fresh ctx finishes it: one slice, one migration, one bug), major sections. Section = contract milestone, or a unit the user wants shipped as its own PR (mark it); none named → whole task = one section.
   - Acceptance checks name their cases, and every step, fix steps included, states its outcome as those cases. An open-ended check or step ("rejects any bad input") has no end an auditor can reach, so each audit finds one more gap → bound it with the user before round one.
   - Ask now for every user decision the steps need, and for an OK per dependency install: exact command + step.
   - A bad step is found at its Sol checkpoint, up to three rounds later: a step whose failure would strand much later work goes last in its group of three.
2. Task branch = the branch this work ships from, never the default branch: the current one, or a new one cut per repo rules. Record it + Task base. The main workspace stays on it (it moves only when a section ships as its own PR: rare paths), and `git status --porcelain` there must print nothing before round one. Uncommitted user work → ask the user to commit it or set it aside; never stash, reset, or discard it yourself.
3. State file `.tmp/long-horizon-lite/<task-slug>/state.md`. Template, audit prompts, launch and resume: `references/state-and-prompts.md`; read it before creating the file, before the first audit, and when resuming after compaction or restart. `.tmp/` not gitignored in this repo → add it to the file `git rev-parse --git-path info/exclude` names first, else commits swallow state + evidence.

## Round loop

Run max safe rounds at once. Each Plan: list every ready step first, then give each one the batch rules allow its own round. Sections run one at a time: no step of a later section is planned until the current one is verified (and merged, when it ships as its own PR), so each section's audits hold only its own work. Ready = a step of the current section w/ every dependency in Provisional or Verified progress. Write each stage's result into the round's block before the next stage (Phase, Worker, Attempts, SHAs; a round that dies, conflicts or is reverted → Phase `closed` w/ the reason): resume has nothing else to go on. Rounds run at the same time, in one batch or across batches, only if:

- write scopes don't overlap; neither reads a path the other writes, nor describes or uses what the other produces (docs for code written in the same batch wait for it);
- no two executions/done-checks contend for one resource: port, dev server, browser profile, DB, GPU, or a timing/perf measurement parallel load would skew;
- capacity covers Manager + every executor.

1. **Plan.** Per round, write a block in Current rounds: step, branch, workspace, done-check, Write scope.
   - Done-check = command, folder relative to the repo root (a round worktree is gone by audit time), expected exit code, and optionally one exact output line: the Manager compares these mechanically. A check script the Manager writes lives under the task dir, outside every Write scope; it may write to the system temp folder, never into a checkout.
   - Red first: run the done-check on the task branch tip now → `evidence/round-<N>/gate-0.log`. It must fail, and because the step's outcome is missing, not because the command cannot start. A check that passes before the work exists proves nothing: rewrite it. For a fix round this is the code before the fix, so the check must fail on the finding it closes.
   - Then write the round's audit section from the template, using contract + block only, and record its sha256 and the check script's in the block. It is written before the executor exists, so no executor claim reaches it; neither file is edited afterwards (an audit fills a copy), and the hash shows any edit: no diff would, both sit in an ignored dir.
   - Then executor brief: contract excerpt, the block's Step, Done-check and Write scope (never the audit section or its path), verified facts the step needs, dead ends touching it. Write these w/ file-edit tool; shell string layers drop backslashes + backticks.
2. **Branch.** Every round works in its own worktree on its own branch, cut from the task branch tip: `git worktree add -b lh-lite/<task-slug>/r<N> <path> <task branch>`, `<path>` outside the repo folder; record the cut SHA. All later stages use absolute paths; state + evidence stay under the main workspace's task dir. Never Agent `isolation: "worktree"`: by default it cuts from the remote default branch and misses earlier rounds. New checkout has no ignored files → link the dependencies the step needs from the main workspace, never build output; a tool that keeps a cache inside the dependency folder is pointed at a folder in the round worktree. Write each link, w/ its target's entry count, into the block before creating it: removing a worktree deletes whatever an unrecorded link points at. A dependency round never links (rare paths). A recovery round reuses its round's branch + worktree: the earlier attempt's work stays, and none of it reaches the task branch.
3. **Execute.** Fresh subagent, brief alone, never `subagent_type: fork`; start a batch's executors in one msg. It follows `fable-mode`. Brief says: no commits, no branch switches, no installs, no writes under `.tmp/long-horizon-lite/`. Returns w/o promised work, or says it waits on helpers → resume it by message (SendMessage), not a new round. Reports that the step needs an install → never install on your own: ask the user (rare paths).
4. **Scope check + commit.** Once the executor stopped writing, in the round worktree:
   - `git rev-parse HEAD` must equal the tip the Manager last recorded (the cut SHA, or the previous attempt's commit). It moved → the executor committed: that branch never merges. Close the round; the step gets a new round on a new branch. Same when an installer ran over a recorded link (rare paths: how to tell).
   - `git status --porcelain -z --untracked-files=all` vs Write scope (`-z` keeps odd paths unquoted; a rename lists both paths and both must be inside; recorded links don't count). A path outside → commit nothing. Show the user the paths and ask whose they are. The user's → they commit them or set them aside. The executor's → recovery brief tells the executor to restore them.
   - All inside → stage exactly the paths just listed (`git add -- <paths>`, never `-A`), commit `lh-lite round <N>: <step>`, record the new tip. Nothing to commit → the attempt failed its gate.
5. **Gate.** Before this and every later run of the check, recompute the script's sha256; mismatch with the block → do not run it, and tell the user. Manager runs the done-check in the round worktree → `evidence/round-<N>/gate-<attempt>.log`, w/ Clean tree (below). Exit code + expected line match → Merge. Mismatch → one recovery round, same approach, brief cites the log path. Second mismatch in a row → approach to Dead ends; stop the round's processes; the branch stays unmerged; a new approach is a new round on a new branch.
6. **Merge.** As each round passes its gate, one at a time, in the main workspace:
   1. Stop every process the round started.
   2. `git merge --no-ff <round branch>` → the merge commit is the Round SHA. Conflict → `git merge --abort`; the step returns to Remaining as a new round from the new tip; not a Dead end. "Already up to date" → stop: state and history disagree; reconcile from `git log` first.
   3. Dependency round → first install in the main workspace, and restore it after a revert (rare paths). Done-check again on the task branch → `evidence/round-<N>/done-check.log` (the log the auditor gets), w/ Clean tree. Always rerun it: the round worktree can hold ignored files the task branch lacks. Mismatch → `git revert -m 1 <Round SHA>`, step back to Remaining.
   4. Match → Provisional progress w/ Round SHA + log path. The block stays in Current rounds, phase `merged`, until its section is verified: audits need its section path, hashes and Round SHA.
   5. Three rounds in Provisional progress with no Sol verdict and in no run still out → Sol checkpoint (below).
   6. A merged or closed round's worktree → remove it only per the reference file's Worktree cleanup: `git worktree remove` deletes through any link left in it, with or without `--force`. A merged round branch → `git branch -d` once its worktree is gone.

**Clean tree.** Before and after every check the Manager runs (red first, gate, merged, section acceptance) and before every merge, `git status --porcelain` in that checkout must print nothing but recorded links. If it prints more, show the user the paths and change nothing in the checkout: they may be the user's work, even when they appeared during a check. A check that writes into a checkout = Plan defect, corrected at next Plan; its output never gets a commit. Generated files a step needs (snapshots, lockfiles) are the executor's work, inside Write scope.

## Audits

Prompt templates, preflight, launch commands and the run-directory rule: reference file.

**Sol checkpoint: one run per three rounds.** Group = the three oldest rounds in Provisional progress with no Sol verdict that are in no run still out; fewer than three only under the Guardrails' exception. Fix rounds count like any other. Failed attempts, closed rounds, and unmerged branches are never in a group. Build the prompt per the reference file (each section's sha256 is rechecked first; a mismatch is never dispatched), write the Audit runs line, then launch, and keep going: the next batch does not wait for it. Collect the verdicts when the run exits, before the next Plan.

**Section end.** Every step of a section in Provisional progress:

1. Sol runs for the section's rounds still w/o a verdict: a checkpoint per full three, then one run for the one or two left; wait for them and for any checkpoint still running. A round failed → fix it first (below). Go on only when every round of the section passed Sol or was closed by a fix round that passed.
2. Manager runs the section's acceptance checks → logs in the Astra run dir, one per check, w/ Clean tree. Last section: every acceptance check of the contract. A check that fails here → no Astra run yet: a fresh subagent plans a fix step from its log (the log path is its finding reference); go back to rounds.
3. One Astra run over `<section base SHA>..HEAD`, last section `<Task base>..HEAD` (the current task branch's base); nothing merges into the task branch while it is out. HEAD must be the one the step-2 checks ran on: it moved → run them again first.

**Accept** a report only when its recorded exit code is 0, its `codex/result.json` has `ok: true`, it opens with every verdict line for every round in its group, in order, each line is exactly `KEY: value` w/ one allowed value (anything more on it = malformed; trimming: reference file, Launch), its Audit runs line names the current contract version, and its SHAs still hold: each Round SHA is still an ancestor of the task branch tip w/ no revert of it there, and a section run's head SHA still equals HEAD. Accept is applied once, when the run is collected; a verdict already in the Audit log stands. Else failed run: one retry in a new run dir, same prompt, then stop. A report turned away only because a SHA or its contract version went stale is not a failed run: never rerun that prompt; build a new one from the current state.

**Verdicts.** Sol judges each round of its group on its own. Per round: `STATUS` complete / incomplete / blocked, `CHECK` sound / weak, `INTEGRITY` clean / suspect / violation, `CONTRACT` aligned / drifted; the prompt template defines each. The Manager holds to: `CHECK: weak` fails no round by itself, and work that falls short of the contract is `incomplete`, never `drifted`.

Sol lists FAILING findings (they set a verdict) and NOTES (they change none). Round passes = complete + clean + aligned. Section passes = `SECTION: pass` + `CONTRACT: aligned`.

A section's steps move to Verified progress, w/ report paths, only when every one of its rounds passed Sol or was closed by a fix round that passed, and its Astra run passed at the current HEAD; then archive their blocks to the Audit log. A verified section marked own-PR → rare paths, before any step of the next one. A round or section that fails:

- One fresh subagent reads the failing report and reproduces each FAILING finding before planning anything. Reproduced → a fix step, 6 lines or fewer: step (as named cases), Write scope (every file that documents or uses the behaviour the fix changes, docs included), done-check that fails on the current code, finding reference (`<report path>#<round>.<n>`; a group report numbers findings per round). A weak check is replaced by a new check file that becomes the fix round's done-check; a frozen check is never edited. Not reproduced → it returns the finding w/ the output that contradicts it; the Manager cannot overrule the auditor: show the user both and let the user decide.
- The subagent finds that only a contract change can close a finding → show the user its proposed amendment + reasons and wait for the OK (rare paths, Contract amendment); no fix round for it meanwhile.
- `blocked`, and the subagent, never the Manager, finds the code right and only the done-check wrong → no executor: rare paths, Check-only repair.
- Fix steps go to the front of that section's Remaining and run as normal rounds; each fix round's audit section cites its finding reference. Its Sol verdict comes from the checkpoint or leftover group it lands in.
- A failed round is closed only when every fix round planned for it has a passing Sol verdict, a failed fix counting as replaced by its own fix, or when its re-audit after a repair passes; never by the Manager. Nothing that depends on a failed round starts until then.
- Astra failed → once the fix rounds have their Sol verdicts, one Astra re-audit of the section. A further Astra run for the same section needs the user's OK.

## Stagnation

Count from Audit log, never memory.

- Same step fails its gate twice in a row → next brief changes approach; failed one → Dead ends first.
- Two failures tracing back to the same original step (a failed Sol verdict on a fix round of it or on its re-audit after a repair, or a failed check-only repair), or the same acceptance check failing at section end twice → stop; the user decides whether to spend more runs.
- Three batches in a row, nothing new in Provisional progress → stop spawning, rewrite Remaining, report to the user w/ Codex runs spent.
- At `max(5, 2 * initial step count)` rounds → reassess remaining work, report run count. Reassessment threshold only, not a completion rule.

## Completion

Answer from Verified progress alone, after the last section's audits pass. Provisional progress is unaudited or only partly audited: report it as such, never as done. Unfinished = valid report: verified + provisional + remaining + missing checks. Bind the result to the head SHA the last Astra run audited; later commits need revalidation. Report Sol + Astra run counts, observed model + effort per run (or "requested, resolution unverified"), the auditors' NOTES and every `CHECK: weak` round by report path, unmerged round branches, and evidence paths. Sections shipped earlier: PR, audited head, and commits the PR took after it (not audited by this run). Commit, push and PR follow repo rules; other repo-required pre-merge reviews still run.
