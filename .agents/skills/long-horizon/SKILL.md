---
name: long-horizon
description: "Use when work spans context windows or sessions, progress is lost after compaction or retries, or the user invokes $long-horizon or asks to work in verified rounds."
---

# Long-horizon for Codex

Big work in bounded rounds: fresh executors, independent auditors. Manager owns goal,
decisions, durable state. Maintain this Codex skill directly, standalone. Discussing/editing
it ≠ activating it. Small task fitting one ctx → ordinary execute/verify.

## Start and resume

Check exposed agent tools. Needs fresh independent agents; self-review never replaces
auditor. Unavailable → report gap, continue work not needing independent verdict.

Create `.tmp/long-horizon/<task-slug>/state.md` before execution; only Manager updates it.
Bulky output, per-round briefs live beside it, outside active summary. Baseline identity:
path/content hashes of relevant dirty, staged, untracked, ignored generated artifacts;
record deletions, unavailable coverage. Git revision alone ≠ working state.
`scripts/manifest.mjs` in skill dir builds it
(`<root> <out.json> --ref <ref> [Write scope and ignored paths]`), diffs for audit
(`--diff <out.json>`).

| Field | Required content |
|---|---|
| Contract | Goal, authorized scope, constraints, numbered final acceptance checks |
| Amendments | Version, explicit user instruction, changed checks, affected steps |
| Workspace | Abs root, branch/revision if Git, existing edits, baseline artifact paths, other workspaces round reads (read-only) |
| Rounds | Per active round: step ID, batch, phase, workspace, agent/process IDs, allowed edits, local checks, deps |
| Verified progress | Claim, contract version, inspected revision or file fingerprints, evidence path |
| Remaining | Bounded steps, deps, write paths, pending final checks, invalidated claims |
| Dead ends | Failed approach, observed cause, evidence needed before retry |
| Method notes | Rules later rounds must follow (e.g. how to measure), source round, unconfirmed / confirmed / dropped |
| Audit log | Round verdicts, evidence, decisions, blockers, recovery actions |

Phases: `planned`, `executing`, `awaiting-audit`, `accepted`, `needs-rework`, `blocked`.
Write state before dispatch, after execution, after audit. Save before yielding/ending
turn; never rely on catching compaction.

Resume: reconcile state w/ real workspace, latest user instructions. Check root, revision,
dirty files, artifacts, recorded workers/processes; HEAD misses uncommitted content. Old
evidence stays as history; mark affected claims stale, recheck before dependent work.
Recover partial edits, no blind re-run. Confirm old writers finished/stopped before
replacing; stop processes listed in `processes.log` whose worker is gone. Missing process IDs after
restart ≠ execution done.

Before resuming run this session didn't start, check ownership: state file changed in last 30 minutes, or lists live
worker → another session may own it; ask user: take over (they stop other session first)
or stay out. Two Managers on one state file corrupt it.

Keep original contract. Explicit user changes → amendments; reassess affected steps,
evidence vs new version. Manager never weakens acceptance to pass work. Existing
authorization carries forward within scope; ask only for missing user-owned decisions or
authority. Skill invocation alone doesn't authorize Git publication, deployments,
migrations, installation, external msgs.

## Parallel rounds

Max safe parallelism. Each Plan: every ready step able to run beside others gets own
round; dispatch all as one batch. Ready step defers only when rule below forbids; note
rule in its Remaining entry. Sequential run = batches of one.

Ready = all deps verified. Ready steps share batch only if:

- write scopes disjoint; neither reads path other writes;
- no contended resource across executions/done-checks: port, dev server, browser profile,
  DB, GPU, or timing/perf measurement parallel load would skew;
- concurrency covers them, counting Manager, every executor, auditor, other worker. Short
  → smaller batches or sequential OK;
- every allowed write path inside workspace root. Step writing outside runs alone, in main
  workspace: separate checkout can't isolate outside path, edits hit main env whatever
  audit says.
  In-place round skips batch integration steps 1-4 (nothing to copy; its edits already differ from Baseline by design) → normal Integrate on its own audit.

Each batch round keeps full contract: own state entry, workspace, baseline, briefs,
executor, auditor. Parallel executors never share workspace: one's edits land in other's
baseline diff → both audits `suspect`. Build round workspace from main, before baseline:
`git stash create` in main (empty output: use HEAD),
`git worktree add --detach <path> <sha>`, copy in all main's untracked files + any ignored artifacts step needs (deps, build output). Never worktree at HEAD: drops earlier rounds'
uncommitted verified work. Never plain copy of Git checkout: copied `.git` file still
points at original's index, HEAD. Plain copies only outside Git. Take baseline inside
round's own workspace. Before checkout, record main's hashes for round's allowed write paths (`manifest.mjs` on main w/ those paths): conflict reference for integration. Round baseline stays executor-attribution reference; checkout filters (e.g. `core.autocrlf`) can make round bytes differ from main's.

Dispatch all batch executors before waiting on any. Each auditor starts when its executor
stops, not waiting on batch. Integrate after whole batch audited:

1. Each accepted round: apply manifest diff to main workspace verbatim: copy each added/modified path from round workspace, delete each deleted path. Main file not matching main's pre-checkout hashes (or present where none recorded) = conflict → step back to Remaining for later batch; not dead end.
2. Rejected round's delta stays out of main. Save as patch under `evidence/round-<N>/` (recovery brief may cite); record in state as not applied.
3. Before removing any round workspace: stop every process its round started (per `processes.log`), confirm gone; else old server answers step-4 check or holds its port. Step 4 starts any server it needs from main. Then copy every cited evidence file living in it (done-check output, ignored artifacts) into `evidence/round-<N>/`. Then unlink dep links in it (`rmdir` on junction/symlink), then `git worktree remove --force <path>`: dirty by design, so plain `git worktree remove` refuses; forcing before unlinking deletes through link into shared target.
4. Separate-workspace verdicts don't prove steps work together or survive workspace removal (e.g. link into removed worktree). After removal, one fresh auditor runs every applied round's done-check in main workspace before any counts as verified. Step failing there → Remaining w/ that output; its applied paths → state w/ revert-or-keep decision.

In-round, executor runs independent reads/searches/commands at once; read-only
helpers OK if runtime allows. Executor's turn ending = round over → wait for every helper
result (incl. `arena` inside executor) before stopping; helper still running at stop →
output lost. Parallel writers needed → split into steps in Remaining, run
as parallel rounds.

## Each round

1. **Plan one step per round.** Define allowed paths/actions, deps, local done-checks,
   relevant task constraints. Pre-round baseline incl. dirty/untracked files, enough to
   separate round's changes from existing work. Before spawning executor, save versioned
   auditor brief (pre-register) from contract, scope, checks, baseline identity, raw
   artifact paths; record path, content hash. Write state/briefs via file-edit tool;
   shell/script strings drop backslashes, backticks. Re-read each saved brief before
   dispatch. Every brief: worker appends each long-lived process it starts (pid, port,
   command) to `processes.log` in task dir. Hours-long jobs: brief has executor check between
   batches that workspaces still whole (`git worktree list`, sentinel file); mismatch →
   stop, report, don't rebuild. Evidence from other revision (line numbers, patch map)
   names it; executor finds cited code by anchor text, not line number.

   Execution or done-check costing hours (browser work, GPU timing, long batches) → draft
   review once scope/checks drafted, before baseline and auditor brief freeze them. One
   fresh read-only peer, ideally other vendor (custom-prompt Claude CLI run w/
   `claude-review` skill's auth, launch checks; else fresh agent w/
   `fork_turns: "none"`: fresh ctx, no vendor independence), reads draft step,
   done-checks, code they exercise. One question: can check pass while work wrong, fail
   while right, or not run as written? Concrete findings only: wrong impl that passes
   (stub returning expected value, test never reaching changed path, check reading file executor
   can write), correct result failing check read literally, or command failing as written
   w/ cwd, output. "Could be stronger" ≠ finding. Manager fixes draft, ≤1 follow-up review
   of changed wording, freezes. Peer sees only draft, code; never executor report. Auditor
   brief gets only frozen checks, never peer critique. Cheap rounds skip; auditor
   `blocked` for broken check covers them.
2. **Execute.** Fresh agent w/ `fork_turns: "none"` if exposed. Standalone brief: step,
   scope, checks, needed verified facts, relevant dead ends, Method notes, abs
   workspace/artifact paths, current permissions, style instructions. Works w/o Manager
   history. Other names → runtime equivalent. Only inherited ctx possible → record it;
   never claim fresh independent audit. Honor explicit user model choice, else session
   model. Requested model unavailable → disclose, never silently substitute. Executor
   implements, verifies only its step; returns changed paths, commands/results, blockers.
   Can't edit Manager state or dispatch agents. Returns w/o promised artifacts, or says
   it's waiting on helpers → send it follow-up input via exposed agent tools, not new
   round or failed audit.
3. **Audit after execution stops.** Separate fresh agent gets prewritten auditor brief
   byte for byte, or by path if agent first checks recorded hash. Never rewrite after
   reading executor output; Plan defect → next round. Explicit user amendment → reconcile
   workers, keep old briefs/baseline, freeze new version from amended contract, raw
   artifacts, no executor assessments. Exclude executor reports, turns, verdicts. Report
   is requested deliverable → auditor inspects it as artifact, w/o executor assessment.
   Auditor inspects real changes, runs relevant checks itself; never fixes impl or writes
   Manager state. Other writers off audited files until verdict integrated.
4. **Integrate.** Batches: order per Parallel rounds. Accept only
   `complete + clean + aligned` w/ evidence. Else record findings, invalidate prior claims
   hit by failed changes, choose next round by auditor's `repairable`: `yes` → one
   recovery round, same approach, auditor diagnostic in brief, = step's 2nd attempt;
   `no` → approach to Dead ends, next brief changes approach. One recovery per step;
   failed recovery = 2nd failure → Stagnation. Keep unrelated verified claims. On accept,
   copy cited result files outside task dir into its `evidence/round-<N>/` (workspaces
   vanish). Later-round rules stated in executor report → Method notes, unconfirmed until
   later done-check covers. Persist state before next round.

Round building/changing verification tool (harness, probe, diff, measurement script) later
rounds use as evidence → one cross-vendor code review of tool after accept, before any
done-check relies on it: `claude-review`, or `opus-fullreview` if large, between rounds on
uncommitted work holding it. Audit judged step, not whether tool measures right. Confirmed
tool findings → next round's step; rest → Remaining.

Phase end (contract milestone, or unit user asked to ship as one PR): `opus-fullreview` on phase
diff, or `claude-review` if small. Surviving findings fixed in accepted round before merge,
never patched by Manager directly. Other repo-required pre-merge reviews still run. One PR
per phase requested → phase ends after last accepted round: commit, open PR, run these
reviews, record `Waiting: merge of <PR>` in state.
Next phase: first round in fresh workspace from merged default branch; baseline there.

Rounds use native subagents; sidebar tasks no substitute. Wait via exposed wait tools,
bounded. Check live status before re-dispatch. Respect concurrency; release finished
agents if supported. While waiting, Manager may inspect evidence, organize work; never edit files in executor's scope.

## Audit contract

Auditor returns:

- `status`: complete / incomplete / blocked.
- `integrity`: clean / suspect / violation. Clean needs observed artifacts, changes in
  scope, established vs baseline; missing evidence → suspect.
- `contract`: aligned / drifted, justified vs current contract version.
- `repairable`: yes / no, on `incomplete` only, w/ diagnostic from auditor's own check
  run. Yes = mechanical fault; approach survives it (build error, missing dep, harness or
  resource failure); no = approach failed. Diagnostic only in executor report = claim,
  doesn't count.
- Per applicable check: passed / failed / unavailable, command or inspection, actual
  result, evidence location. Record inspected revision, dirty-file fingerprints.

Step acceptance: every required **local** check passes, task constraints hold. Future
final checks stay pending; don't block prerequisite step. E.g. verified DB work may
precede unbuilt UI if DB checks pass; doesn't prove full user flow works.

Failed/unavailable checks required for current step block its acceptance and dependent
work, despite confident labels or time spent. Identify missing check/authority, do
independent authorized work, get needed user input. Never count unavailable required check
as pass.

Before declaring done: fresh final audit of integrated workspace vs **all current final
acceptance checks**, incl. affected earlier guarantees. Any failed/unavailable required
final check → unfinished. Verdict bound to inspected workspace; later relevant edits →
revalidate.

## Stagnation and stopping

- Same step fails twice → record cause, change approach per evidence. Failed recovery =
  2nd failure.
- 3 straight batches w/o new verified progress → pause dispatch, rethink decomposition.
  Blocked tool or missing authority needs recovery, not more code edits.
- Count both from Audit log, never memory. Rewrite may route stuck step through `arena`
  (parallel candidates, pick, graft) inside executor agent; Manager never reads
  candidates, picks or grafts; auditor sees only workspace result. Candidates need
  Contract, Dead ends copied in. Worktree starts from HEAD → use `.tmp/arena-*` copies or
  commit WIP first, else earlier uncommitted edits lost.
- At `max(5, 2 * initial step count)` rounds → reassess scope, remaining work. Tag each
  Remaining item continue, reserve, or close w/ one-line reason; reserved reopens only via
  final audit's failed checks or user instruction. Record changed strategy before
  continuing; numeric cap alone ≠ completion, nor reason to drop feasible authorized work.
  Honor explicit user limits, runtime stop rules.

Track executor attempts, auditor invocations, incl. retries. User-stated budget or bound
agreed w/ user = binding; checkpoint before exceeding. Distinct from default
strategy-reassessment threshold. Binding limit hit → preserve evidence, report remaining
work; hitting it ≠ completion.

Unresolved plateau → optional different-vendor consult, once per trigger. From Codex:
available Claude review workflow w/ its auth, permission checks. Another Codex agent =
fresh ctx, not vendor independence. Unavailable → record it, keep evidence-driven
replanning. Consult = proposal; verify vs contract before adopting.

Handoff or real blocker → save state path, last verified result, exact unfinished check,
next action. Report only currently valid verified claims. Saved checkpoint doesn't
schedule future run; wakeups only on user request.
