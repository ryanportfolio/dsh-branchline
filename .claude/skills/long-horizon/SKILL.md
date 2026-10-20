---
description: 'Use for work too big for one context window: long multi-step tasks, progress lost to compaction or failed retries, work spanning hours or sessions, or when the user says /long-horizon or asks to run a task in verified rounds.'
---

# long-horizon: run big tasks in audited rounds

Roles: Manager, Executor, Auditor. You (this ctx) = Manager: hold goal, keep state file true, delegate every round. Executors, auditors = fresh subagents; fresh ctx per round splits impl from independent evidence. Discussing/editing this skill does not activate it.

## State file

`.tmp/long-horizon/<task-slug>/state.md` (gitignored scratch), created before round one:

```markdown
# Contract  (original retained; explicit user changes recorded as amendments)
Goal: <one paragraph>
Acceptance: <the checks that prove it done, as a numbered list>
Version: <current contract version>

# Amendments
- <version, explicit user instruction, changed checks, affected steps and claims>

# Verified progress
- <claim> — contract version: <version>; evidence: <file/command/output the auditor saw>

# Remaining
1. <step sized for one fresh context>; depends on: <step numbers or none>; writes: <paths>

# Current rounds  (one block per active round; scope and checks fixed at Plan, except for explicit user amendments)
Round: <N>   Batch: <B>   Phase: planned | executing | awaiting-audit | audited
Contract version: <version used for this round>
Workspace: <absolute root the executor writes; any other workspace the round reads, marked read-only>
Workers: <agent/process IDs, role, last observed status; update as workers start or stop>
Step: <the one Remaining step this round works>
Done-check: <commands, cwd, and the expected result; the auditor runs them itself>
Write scope: <paths the executor may change; test and gate definitions only if the step is about them>
Baseline: <manifest path> + <git ref>  (see Plan; the auditor diffs against this, never HEAD)
Auditor brief: <path>  (written at Plan, dispatched byte for byte)
Residue: <paths a failed earlier round left changed, and whether they were reverted or kept>

# Dead ends  (approaches that failed audit; do not retry without new evidence)
- <approach>: <why it failed, one line>

# Method notes  (rules later rounds must follow, such as how to measure)
- <rule>: source round <N>; unconfirmed / confirmed in round <M> / dropped

# Audit log
- round N (batch B): <step> — <status>/<integrity>/<contract>, <one-line evidence>
```

Only audit-passed results enter **Verified progress**. Resume from existing state file; reconcile w/ real workspace + latest user instructions.
Before resuming run this session didn't start, check ownership: state file changed in last 30 min, or `Workers:` lists worker still running → ask user: take over (they stop other session first) or stay out. Two Managers writing one state file corrupt it.

Keep original contract. Explicit user changes → versioned amendments; reassess affected steps, invalidate affected claims before using them as prereqs. Never weaken acceptance just to make a round pass. Amendment mid-round → reconcile its workers before more execution; keep baseline + old briefs; new versioned brief from amended contract + raw artifacts, no executor assessments. Only audit vs current contract accepts affected work.

Dead ends = memory. Unrecorded failed approach gets re-proposed rounds later; re-walking it costs full round.

## Context boundary

Fresh = round gets no Manager conversation history. State file, workspace, standalone brief carry every fact round needs. Executor: only its bounded brief. Auditor: only its prewritten brief; never executor's turns or report.

Real leak: not executor's file list (auditor recovers it from workspace anyway) but its narrative ("works, checked X, Y was out of scope"). Manager has read it by auditor-brief time, may paraphrase unnoticed. So auditor brief pre-registered: written at Plan before executor exists, from current contract version's acceptance checks, Current round block, workspace root; saved to block's recorded path; dispatched unchanged. By-path dispatch = unchanged if sha256 recorded at Plan and agent checks hash before reading on. Manager wants to add to brief after Execute → that's Plan defect, not brief defect → next round, except explicit user amendment (above). Provenance checkable; "do not paraphrase" isn't.

Inspect exposed tools + capacity before dispatch. Fresh ctx; never `subagent_type: fork` or any history-inheriting option for an auditor. No fresh independent ctx → record gap; inherited ctx or self-review can't establish audit gate. Continue useful authorized work not depending on it. Capacity counts Manager + other active workers; short → smaller batches or sequential fresh rounds valid.

Workspace = executor's for round's duration. Anyone else's edits between Baseline and Audit → attribution impossible; auditor reports integrity `suspect`, no guessing whose.

## Parallel rounds

Run max safe rounds at once. Each Plan: every ready step able to run beside others gets own round; dispatch together as one batch. Ready step waits for later batch only when a rule below forbids; note rule in its Remaining entry. Sequential run = batches of one.

Ready = every dependency in Verified progress. Ready steps share batch only if:

- write scopes don't overlap; neither reads path other writes;
- no two executions/done-checks contend for one resource: port, dev server, browser profile, DB, GPU, or timing/perf measurement parallel load would skew;
- capacity covers them, counting Manager + every executor, auditor, other worker;
- every Write scope path inside workspace root. Step writing outside it runs alone, in main workspace: separate checkout can't isolate outside path → edits reach main env whatever audit says. In-place round skips batch integration steps 1-4 (nothing to copy; its edits already differ from Baseline by design) → normal Integrate on its own audit.

Each batch round keeps whole contract: own Current round block, workspace, Baseline, briefs, executor, auditor. Parallel executors never share workspace: one's edits land in other's manifest diff → both audits `suspect`. Build each round workspace from main before its Baseline: `git stash create` in main workspace (empty output: use HEAD), `git worktree add --detach <path> <sha>`, copy in all main's untracked files + any ignored artifacts step needs (deps, build output). Never worktree at HEAD: drops earlier rounds' uncommitted verified work. Never plain copy of Git checkout: copied `.git` file still points at original's index + HEAD. Plain copies only for non-Git workspaces. Take Baseline inside round's own workspace. Before checkout, record main's hashes for round's Write scope paths (`manifest.mjs` on main w/ those paths): conflict reference for integration. Round Baseline stays executor-attribution reference; checkout filters (e.g. `core.autocrlf`) can make round bytes differ from main's.

Start all batch executors in one msg. Each round's auditor starts when that round's executor stops, not waiting for batch. Integrate once every batch round audited:

1. Each passed round: apply manifest diff to main workspace verbatim: copy each added/modified path from round workspace, delete each deleted path. Main file not matching main's pre-checkout hashes (or present where none recorded) = conflict → step back to Remaining for later batch; not Dead end.
2. Failed round's delta stays out of main. Save as patch under `evidence/round-<N>/` (recovery brief may cite); record in Residue as not applied.
3. Before removing any round workspace: stop every process its round started (per `processes.log`), confirm gone; else old server answers step-4 check or holds its port. Step 4 starts any server it needs from main. Then copy every cited evidence file living in it (done-check output, ignored artifacts) into `evidence/round-<N>/`. Then unlink dep links in it (`rmdir` on junction/symlink), then `git worktree remove --force <path>`: dirty by design, so plain `git worktree remove` refuses; forcing before unlinking deletes through link into shared target.
4. Separate-workspace verdicts don't prove steps work together or survive workspace removal (e.g. link into removed worktree). After removal, one fresh auditor runs every applied round's done-check in main workspace before any enters Verified progress. Step failing there → Remaining w/ that output; its applied paths → Residue w/ revert-or-keep decision.

Within round, executor runs independent reads/searches/commands at once, may fan out read-only subagents. Executor is subagent: its turn ending = round over, no completion notice reaches it after → helper agents run foreground (`run_in_background: false` when Agent tool offers it; several in one msg still parallel; no such param → runtime waits for them); Bash that may pass 10-min tool limit → background + poll its log/exit; never stop while any helper runs. Same for `arena` inside executor. Work needing parallel writers = several steps: split in Remaining, run as parallel rounds.

## Round loop

1. **Plan**: read state file, pick batch (every ready step Parallel rounds allows; each round works ONE step), write each round's Current round block to state file, phase `planned`, before spawning anything. Then per round: take Baseline, write auditor brief to recorded path, write executor brief: contract excerpt, Current round block, only verified facts step needs, every dead end touching step, Method notes. Done-check frozen from here; wrong one → fixed in next round's Plan, never after reading executor's report.

   Round whose execution or done-check costs hours (browser work, GPU timing, long batches) → draft review after Current round block written, before Baseline + briefs freeze it. One fresh read-only peer, preferably other model family (custom-prompt `codex exec -s read-only` run, preflight + CLI mechanics per `codex-review` skill; else fresh Claude subagent), reads draft Step, Done-check, and the code the check exercises. One question: can check pass while work wrong, fail while right, or not run as written? Concrete findings only: wrong impl that passes (stub returning expected value, test never reaching changed path, check reading file executor can write), correct result failing check read literally, or command failing as written w/ cwd + output. "Could be stronger" ≠ finding. Manager fixes draft, ≤1 follow-up review of changed wording, then freezes. Peer sees only draft + code, never executor report; auditor brief carries only frozen block, never peer critique. Cheap rounds skip; auditor's `blocked: invalid check` covers them.

   Write/edit state file + briefs w/ file-edit tool; shell/script string layers drop backslashes + backticks. Re-read each saved brief before dispatch. Every brief: worker appends each long-lived process it starts (pid, port, command) to `processes.log` in task dir. Hours-long job brief: executor checks between batches that workspaces still whole (`git worktree list`, sentinel file); mismatch → stop + report, don't rebuild. Evidence from another revision (line numbers, patch map) names that revision; executor finds cited code by anchor text, not line number.

   Baseline = workspace before this executor ran. Rounds don't commit between themselves → HEAD wrong ref: would attribute every earlier round's verified edits, plus pre-existing user changes, to this executor. Take as manifest file under task's `.tmp` dir: path + content hash for every file under Write scope (incl. outside repo), every untracked file, every tracked file w/ uncommitted changes. Git workspace: also pin tracked snapshot: `git stash create` (touches neither tree nor index; empty output = clean, use HEAD) + `git update-ref refs/long-horizon/<task-slug>/round-<N> <sha>` so gc can't prune across sessions. Git ops unavailable → equivalent immutable snapshot + content manifest valid. Include relevant ignored generated artifacts explicitly; name unavailable coverage, never call it clean. Record deleted paths too. Hashes = baseline; sizes/mtimes aren't. `scripts/manifest.mjs` beside this file builds it (`<root> <out.json> --ref <ref> [Write scope and ignored paths]`) and diffs for audit (`--diff <out.json>`).
2. **Execute**: phase `executing`, spawn fresh subagent w/ brief alone, no Manager history. Record agent/process ID immediately when dispatch returns. It does step, reports changes + how to check. Returns w/o promised artifacts, or says it's waiting on helpers → resume it by message (SendMessage), not new round or failed audit. Confirm it stopped writing, record status, phase `awaiting-audit`.
3. **Audit**: confirm all writers to scope finished/stopped, spawn 2nd fresh subagent w/ prewritten auditor brief, nothing else. Record ID. Auditor works in this order, b/c auditor's own done-check run writes files too:
   1. Rebuild manifest now, diff vs Baseline (added, modified, deleted) + `git diff <ref> --stat` for tracked files. Delta = executor's work.
   2. Run done-check from recorded cwd, compare to expected.
   3. Return three verdicts w/ evidence:
   - status: complete / incomplete / blocked, from own done-check run. Evidence auditor didn't produce this round counts only if auditor fetched it itself from authenticated source (CI run by URL, external-system receipt); executor-produced logs/test output = claims. Check itself broken → `blocked: invalid check` = Plan defect, not Dead end. On `incomplete`, add `repairable: yes` or `repairable: no` w/ diagnostic from auditor's own done-check run. Yes = mechanical fault; approach survives it (build error, missing dep, harness/resource failure); no = approach itself failed. Diagnostic only in executor's report = claim, doesn't make step repairable.
   - integrity: clean / suspect / violation: clean only if step-1 delta touches nothing outside Write scope and every promised artifact exists. Delta reaching test/gate definitions step didn't own → `suspect` at best: passing check proves nothing if executor could edit it. Unclear evidence = suspect
   - contract: aligned / drifted, w/ inspected contract version + acceptance checks
   Executor report = claim; auditor inspection = evidence. Only complete + clean + aligned enters Verified progress. Phase `audited`.
4. **Integrate**: batches follow Parallel rounds order. Pass: step → Verified progress w/ auditor evidence, round's brief path + baseline ref (re-examinable later); copy cited result files outside task dir into its `evidence/round-<N>/` (workspaces can vanish). Fail: keep unaffected Verified progress, mark affected claims stale; append audit findings; delta paths → Residue w/ revert-or-keep decision each; schedule next round by auditor's `repairable` verdict. `yes`: one recovery round, same approach, brief carries auditor diagnostic; counts as step's 2nd attempt under Stagnation. `no`: approach → Dead ends now; next brief changes approach. `invalid check` = Plan defect → neither. One recovery per step: failed recovery = step's 2nd failure → Stagnation forces new approach regardless of 2nd diagnostic. Either way, archive Current round block to Audit log and clear it; stale block feeds next auditor wrong done-check. Rules for later rounds stated in executor's report → Method notes, unconfirmed until later done-check covers them.

Update state file every round. 3 rounds w/o state-file write = drift: stop, rebuild file from real workspace.

Round building/changing verification tool (harness, probe, diff, measurement script) later rounds use as evidence → one cross-vendor code review of tool after it passes audit, before any later done-check depends on it: `codex-review`, or `codex-fullreview` if large, run between rounds on uncommitted work holding it. Audit judged step, not whether tool measures correctly. Confirmed tool findings → next round's step; others → Remaining.

Phase end (contract milestone, or unit user wants shipped as one PR): `codex-fullreview` on phase diff, or `codex-review` if small. Surviving findings fixed in audited round before merge, never patched by Manager directly. Other repo-required pre-merge reviews still run. User asked one PR per phase → phase ends after last audited round: commit, open PR, run these reviews, record `Waiting: merge of <PR>` in state file. Next phase plans first round in fresh workspace from merged default branch, takes Baseline there.

After compaction/restart: read state, reconcile workspace + latest user instructions, inspect recorded workers before touching round. Stop `processes.log` processes whose worker no longer runs. Confirm old writers finished/stopped before auditing or replacing them. Missing IDs or lost handles don't prove completion; writer status not established → pause affected work, record needed recovery.

Validate baseline manifest + Git ref in every phase. Recover missing pieces only from trusted pre-execution artifacts. Execution may have started + recovery fails → keep partial edits, record integrity `suspect`, attribution unavailable. Never replace old baseline w/ current content or accept round as clean.

Then reconcile phase:
- `planned`: no execution + no work present → finish/rebuild Plan before dispatch. Execution may have occurred → keep original baseline, reconcile as interrupted execution.
- `executing` or `awaiting-audit`: writers stopped + baseline valid → audit existing work; don't re-execute or overwrite baseline.
- `audited`: integrate only if inspected content + contract version still apply; else invalidate affected evidence, re-audit.

Record recovery actions + pending checks before continuing.

## Stagnation

Round count alone can't resolve stalled run. Watch repeated failures directly:

- Same step fails audit twice in a row → next brief must change approach, not retry. Move failed approach to Dead ends first.
- Three batches in a row, nothing new entering Verified progress → stop spawning, rewrite Remaining. Suspect = decomposition, not executor. Keep consumed attempts; new decomposition doesn't reset user budget.

Count both triggers from Audit log, never memory; recovery round = attempt. Remaining rewrite may route stuck step through `arena` (parallel candidates, pick, graft); arena then runs inside executor subagent: Manager never reads candidates, picks, grafts; auditor sees only workspace result. Candidates need state file's Contract + Dead ends copied in. Worktree starts from HEAD → use `.tmp/arena-*` copies or commit WIP first; else earlier rounds' uncommitted edits lost.

Either trigger may escalate to cross-vendor supervisor. Manager, executor, auditor all Claude → shared blindspots; from inside, shared blindspot looks exactly like plateau. Codex = different model family, never saw this session:

```bash
codex login status
```

Logged in, or `model_provider` gateway set in `config.toml` in `$CODEX_HOME` (default `~/.codex`) → one `codex exec` run (custom prompt, no scope selector) w/ contract, audit log, Dead ends, asking plateau diagnosis + different strategy. Current local preflight, CLI mechanics, run identity: per `codex-review` skill. Answer = opinion: check vs current contract version + acceptance checks before it rewrites Remaining; drop anything drifting. Neither, or run fails → skip; rewrite rules above stand alone.

One consult per trigger. Each run bills user's Codex subscription → tied to stagnation trigger, not every round.

## Completion

Per-round verdicts prove each step vs workspace at that time; later round can regress earlier one. So before reporting: one last fresh auditor w/ current contract, amendments, workspace root runs every current acceptance check vs final workspace. Failures → back to Remaining.

Then answer from Verified progress alone. Unfinished = valid report: state verified + remaining, incl. missing independent checks. Bind final evidence to inspected revision + content manifest; later relevant changes require revalidation.

## Guardrails

- Honor explicit user model choices + required quality floors; else inherit configured session model. Check actual exposure before dispatch; requested model/floor unavailable → disclose, never silently downgrade or claim it ran.
- Size step so one fresh ctx finishes it: one slice, one migration, one bug. Split independent work into separate steps → parallel rounds.
- Audit independence = the point: verdicts from auditor's own inspection in fresh subagent, never this Manager ctx.
- Executors + auditors follow fable-mode discipline in their round; fable-mode governs one ctx, this skill governs work spanning many.
- Under ~3 dependent steps: skip harness, run fable-mode directly.
- At `max(5, 2 * initial step count)` rounds: reassess strategy + remaining work before continuing. Reassessment threshold only, not completion or abandonment rule. At reassessment, tag every Remaining item continue, reserve, or close w/ one-line reason; reserved item reopens only via final auditor's failed checks or user instruction. Track executor attempts, auditor calls, retries separately. Explicit user round/time/cost limits binding; checkpoint before exceeding, report unfinished checks. Zero budget permits inspection, no budgeted execution.
- Unavailable required check blocks that step + dependents; finish independent authorized work, ask only for missing user-owned decisions or authority. Invocation does not authorize publication, installation, deployments, or external messages.
