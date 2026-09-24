---
description: 'Long-horizon rounds run through the Workflow tool: fresh executor, inspector, and judges per round with schema verdicts and a run journal. Use on /long-horizon-workflows or to run a big task in Workflow-audited rounds. Claude Code only.'
---

# long-horizon-workflows: audited rounds on the Workflow engine

Manager, Executor, Auditor. You (this context) are the Manager: hold the goal, keep the state
file true, and delegate every round. Executors and auditors are fresh subagents; a fresh context
per round separates implementation from independent evidence. Discussing or editing this skill
does not activate it.

This is the `long-horizon` contract with one change: when the `Workflow` tool is exposed, each
round's Baseline, Execute and Audit run as one script, which enforces the context boundary by
construction, forces verdicts into enums, and journals every agent's exact input and output.
Claude Code only; Codex sessions use `long-horizon`. If the tool is absent in a Claude session,
the same steps run as fresh `Agent` calls and the contract does not change.

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
- <claim>: contract version <version>; evidence: <file/command/output the auditor saw>

# Remaining
1. <step sized for one fresh context>

# Current round  (scope and checks fixed at Plan, except for explicit user amendments)
Round: <N>   Phase: planned | executing | awaiting-audit | audited
Contract version: <version used for this round>
Engine: workflow | agent
Workers: <workflow runId + transcript dir, or agent IDs; role; last observed status>
Step: <the one Remaining step this round works>
Done-check: <commands, cwd, and the expected result; the auditor runs them itself>
Write scope: <paths the executor may change; test and gate definitions only if the step is about them>
Judges: <total verdict count including the inspector, and the one-line reason for that number>
Baseline: <manifest path> + <git ref>  (see Plan; the auditor diffs against this, never HEAD)
Executor brief: <path>  (written at Plan)
Auditor brief: <path>  (written at Plan, dispatched byte for byte)
Residue: <paths a failed earlier round left changed, and whether they were reverted or kept>

# Dead ends  (approaches that failed audit; do not retry without new evidence)
- <approach>: <why it failed, one line>

# Audit log
- round N: <step>: <status>/<integrity>/<contract>, <one-line evidence>, <runId or agent IDs>
```

Only audit-passed results enter **Verified progress**. Resume from the existing state file
and reconcile it with the actual workspace and latest user instructions.

Preserve the original contract. Explicit user changes become versioned amendments; reassess
affected steps and invalidate affected claims before using them as prerequisites. Never weaken
acceptance merely to make a round pass. If an amendment arrives during a round, reconcile its
workers before further execution, preserve the baseline and old briefs, and prepare a new
versioned brief from the amended contract and raw artifacts, without executor assessments.
Only an audit against the current contract can accept affected work.

Dead ends are memory too. A failed approach that never gets written down gets re-proposed a
few rounds later, and re-walking it costs a full round.

## Context boundary

Fresh means the round receives no Manager conversation history. The state file, workspace and
a standalone brief carry every fact the round needs. Give the executor only its bounded brief;
give the auditor only its prewritten brief. The auditor never receives the executor's turns
or report.

The leak that matters is not the executor's file list, which the auditor recovers from the
workspace anyway; it is the executor's narrative ("works, checked X, Y was out of scope"),
which the Manager has read by the time it would write the auditor brief and can paraphrase
without noticing. So the auditor brief is not written then. It is written at Plan, before the
executor exists, from the current contract version's acceptance checks, the Current round
block and the workspace root, saved to the path recorded in the block, and dispatched
unchanged. A Manager that wants to add something after Execute has found a defect in the Plan,
not in the brief; it goes into the next round, except for an explicit user amendment handled
as above. Provenance is checkable; "do not paraphrase" is not.

Inspect exposed tools and capacity before dispatch. Use fresh context and never
`subagent_type: fork` or an option that inherits Manager history for an auditor. If fresh
independent context is unavailable, record the gap; inherited context or self-review cannot
establish the audit gate. Continue useful authorized work that does not depend on it.
Count Manager and other active workers against capacity; sequential fresh rounds are valid.

The workspace belongs to the executor for the duration of a round. Edits from anyone else
between Baseline and Audit make attribution impossible; the auditor reports integrity
`suspect` rather than guessing whose change it was.

## Round engine: Workflow

Invoking this skill is the user's opt-in to the `Workflow` tool for its rounds and nothing
else. Engine choice is made once, at task start, from tool exposure, and recorded under
`Engine:` in the Current round block. Switching mid-task is allowed only when the tool
disappears, and the switch goes into the Audit log.

What a script buys: agents it spawns never inherit Manager history, so the context boundary
holds by construction; `schema` forces the three verdicts into enums instead of prose; the run
persists its script and a journal with every agent's exact input and return value, which is
provenance the state file alone cannot give; `resumeFromRunId` replays a finished executor
from cache after a crash instead of running it twice.

What stays with the Manager: Plan and Integrate. The script has no filesystem, no clock and no
user in the loop, so it cannot pick the step, freeze the done-check, weigh dead ends, decide
residue or absorb an amendment. One round per workflow call. Rework after a failed audit is
the next round, planned inline, never a retry loop inside the script.

Agent count per round is three fixed roles plus a variable number of judges, chosen at Plan:

- Fixed: baseline, executor, inspector. Baseline and inspector are the mechanical roles the
  contract already requires. The executor is one agent because a round is one step in one
  fresh context, and parallel executors in one workspace make the manifest diff
  unattributable. A step that wants N parallel workers is decomposed wrong: split it into N
  steps.
- `Judges:` is the total verdict count including the inspector. Pick it per round and record
  the reason:
  - 1 (inspector alone): mechanical step, small write scope, deterministic done-check (tests,
    build, hash compare).
  - 2 to 3: normal step; delta spans more than one subsystem, or the done-check needs
    interpretation (visual result, log inspection, "no regressions").
  - 4 or more: rework round after a failed audit, step touches test or gate definitions,
    irreversible side effects, or a stagnation trigger fired.
  - Extra judges rotate through distinct lenses (scope integrity, check validity, contract
    drift) rather than running as identical copies.

Rules the script must satisfy:

- Every prompt is built from `args` and constants only. The executor's return value is kept
  for the Audit log and is never concatenated into an audit prompt.
  `agent(auditBrief + executorReport)` is the leak this skill exists to prevent, one keystroke
  away.
- Briefs travel as paths, not strings. Agents read the file the Manager wrote at Plan; the
  file on disk is the byte-for-byte record. The wrapper text around the path is a constant in
  the template, not per-round Manager prose.
- The inspector's raw artifacts land at paths derived from `args`. Judges get those paths from
  `args`, never from the inspector's return, and never see its verdict.
- One agent runs the done-check. Parallel auditors each running it would write files
  concurrently and contaminate the manifest diff. Judges read the delta and the check output
  and score them; they do not re-run.
- No `isolation: 'worktree'` for anyone. A worktree starts from HEAD and loses the executor's
  uncommitted edits.
- `agent()` returns `null` when the user skips it or the API dies. Null is `blocked` with
  integrity `suspect`, never `complete`.
- Pass no `model`. Agents inherit the session model, which is how the quality floor holds.
  `effort: 'low'` is acceptable for the baseline agent only.
- Under a `+Nk` budget directive, `agent()` throws once the ceiling is hit. Catch it, return
  `blocked: budget`, checkpoint.
- A pass requires unanimity: every status `complete`, every integrity `clean`, every contract
  `aligned`. Any `blocked` verdict blocks the round. Disagreement is `suspect`.

Template. The Manager writes the Current round block and both briefs first, then calls
Workflow with `args`:

```js
export const meta = {
  name: 'long-horizon-round',
  description: 'One long-horizon round: baseline, executor, inspector, independent judges',
  phases: [{ title: 'Baseline' }, { title: 'Execute' }, { title: 'Audit' }],
}
// args: { taskSlug, round, roundDir, writeScope, executorBrief, auditorBrief, judges }
// roundDir = .tmp/long-horizon/<slug>/round-<N>. Briefs are absolute paths written at Plan.
// judges = total verdict count including the inspector, from the Current round block.
const VERDICT = {
  type: 'object',
  properties: {
    status: { enum: ['complete', 'incomplete', 'blocked'] },
    blockedReason: { type: 'string' },
    integrity: { enum: ['clean', 'suspect', 'violation'] },
    contract: { enum: ['aligned', 'drifted'] },
    contractVersion: { type: 'string' },
    evidence: { type: 'string' },
    deltaPaths: { type: 'array', items: { type: 'string' } },
    // On incomplete only: yes = mechanical fault from the auditor's own check run, no = the
    // approach failed. Judges read the raw check output, never the executor's report.
    // diagnostic is the fault as seen in that output; empty on complete or blocked.
    repairable: { enum: ['yes', 'no', 'n/a'] },
    diagnostic: { type: 'string' },
  },
  required: ['status', 'integrity', 'contract', 'contractVersion', 'evidence', 'repairable', 'diagnostic'],
}
const BASELINE = {
  type: 'object',
  properties: {
    manifestPath: { type: 'string' },
    gitRef: { type: 'string' },
    fileCount: { type: 'integer' },
    uncovered: { type: 'array', items: { type: 'string' } },
  },
  required: ['manifestPath', 'gitRef', 'fileCount'],
}
const LENSES = ['scope integrity', 'check validity', 'contract drift']
const a = args
const manifest = `${a.roundDir}/baseline-manifest.json`
const delta = `${a.roundDir}/audit/delta.md`
const checkOut = `${a.roundDir}/audit/check-output.txt`
const artifacts = { manifest, delta, checkOut }
const blocked = (reason) => ({
  status: 'blocked', blockedReason: reason, integrity: 'suspect',
  contract: 'aligned', contractVersion: 'n/a', evidence: reason, repairable: 'n/a', diagnostic: '',
})
// Stage results live outside the try so a throw mid-round still returns what was collected.
let base = null, executorReport = null, executed = false, inspector = null, judges = []

try {
  phase('Baseline')
  base = await agent(
    `Take a long-horizon baseline. Write scope: ${JSON.stringify(a.writeScope)}. ` +
    `Write a manifest to ${manifest}: path and content hash for every file under write scope ` +
    `(including paths outside the repo), every untracked file, every tracked file with ` +
    `uncommitted changes, and deleted paths. In a git workspace also run \`git stash create\` ` +
    `(empty output means clean: use HEAD) and ` +
    `\`git update-ref refs/long-horizon/${a.taskSlug}/round-${a.round} <sha>\`. ` +
    `Change nothing else. List coverage you could not take under uncovered.`,
    { schema: BASELINE, effort: 'low' })
  if (!base) return { verdict: blocked('baseline agent returned null'), executed, executorReport, artifacts }

  phase('Execute')
  executed = true
  executorReport = await agent(
    `Read ${a.executorBrief} and do exactly what it says. Apply fable-mode discipline. ` +
    `Return what changed and how to check it.`)
  // Kept for the Audit log only. Never passed to an audit agent.
  // Null means skipped or died, possibly after partial edits: the Manager reconciles this as
  // an interrupted execution against the baseline; the workspace is never audited as complete.
  if (executorReport === null) {
    return { verdict: blocked('executor returned null; reconcile as interrupted execution'), executed, executorReport, baseline: base, artifacts }
  }

  phase('Audit')
  inspector = await agent(
    `Read ${a.auditorBrief} and follow it. Work in this order. ` +
    `1: rebuild the manifest with the same coverage as ${manifest}, diff it (added, modified, ` +
    `deleted), append \`git diff ${base.gitRef} --stat\`, and write the result to ${delta}. ` +
    `2: run the done-check from the recorded cwd and write the complete raw output to ${checkOut}. ` +
    `3: return your verdicts with evidence.`,
    { schema: VERDICT, phase: 'Audit' })
  if (!inspector) return { verdict: blocked('inspector returned null'), executed, executorReport, baseline: base, artifacts }

  const judgeCount = Math.max(0, (a.judges ?? 1) - 1)
  judges = (await parallel(Array.from({ length: judgeCount }, (_, i) => () => agent(
    `Independent audit judge ${i + 1}, lens: ${LENSES[i % LENSES.length]}. ` +
    `Read ${a.auditorBrief}, then read ${delta} and ${checkOut}. ` +
    `Do not run anything and do not modify files. Return your own verdicts. ` +
    `Default to incomplete or suspect when the evidence is unclear.`,
    { schema: VERDICT, phase: 'Audit' })))).filter(Boolean)
  if (judges.length < judgeCount) log(`${judgeCount - judges.length} judge(s) returned null; integrity capped at suspect`)

  const all = [inspector, ...judges]
  const blockedVote = all.find(v => v.status === 'blocked')
  const verdict = blockedVote ? blockedVote : {
    status: all.every(v => v.status === 'complete') ? 'complete' : 'incomplete',
    integrity: all.some(v => v.integrity === 'violation') ? 'violation'
      : (judges.length === judgeCount && all.every(v => v.integrity === 'clean')) ? 'clean' : 'suspect',
    contract: all.every(v => v.contract === 'aligned') ? 'aligned' : 'drifted',
    contractVersion: inspector.contractVersion,
    evidence: all.map((v, i) => `[${i === 0 ? 'inspector' : `judge ${i}`}] ${v.evidence}`).join('\n'),
    deltaPaths: inspector.deltaPaths ?? [],
    // Any judge calling the failure unrepairable wins; a repairable claim needs everyone,
    // plus a non-empty inspector diagnostic, since the recovery brief has to carry it.
    repairable: all.every(v => v.status === 'complete') ? 'n/a'
      : all.some(v => v.repairable === 'no') ? 'no'
      : (all.every(v => v.repairable === 'yes') && (inspector.diagnostic ?? '').trim()) ? 'yes' : 'no',
    diagnostic: inspector.diagnostic ?? '',
  }
  return { verdict, votes: all, executed, executorReport, baseline: base, artifacts }
} catch (error) {
  // agent() throws at the +Nk budget ceiling and on runtime faults. Return what exists so the
  // Manager can checkpoint; the executor may already have changed files.
  const reason = `blocked: agent() threw (budget ceiling or runtime error): ${error && error.message ? error.message : String(error)}`
  log(reason)
  return { verdict: blocked(reason), votes: [inspector, ...judges].filter(Boolean), executed, executorReport, baseline: base, artifacts }
}
```

After the call returns: record the runId and transcript directory under Workers, copy
`verdict` and `votes` into the Audit log, then Integrate as below. A `blocked` verdict with
`executed: true` means the executor ran, or may have, before the round stopped (null return,
budget ceiling, runtime fault): reconcile it as an interrupted execution against the recorded
baseline, never as a clean round. A cached return on resume
is not evidence until `journal.jsonl` in the transcript directory shows the agent's actual
output.

## Round loop

1. **Plan**: read the state file, pick ONE remaining step, decide the judge count, and write
   the Current round block into the state file, phase `planned`, before anything is spawned.
   Then write the auditor brief to its recorded path, and write the executor brief: contract
   excerpt, the Current round block, only the verified facts that step needs, and every dead
   end that touches this step. The done-check is frozen from this point; one that turns out
   wrong is fixed in the next round's Plan, never after reading the executor's report.

   The Baseline is what the workspace looked like before this executor ran. Rounds do not
   commit between themselves, so HEAD is the wrong reference: it would attribute every
   earlier round's verified edits, and any pre-existing user changes, to this executor. Take
   it as a manifest file under the task's `.tmp` directory: path and content hash for every
   file under Write scope (including paths outside the repo), every untracked file, and every
   tracked file with uncommitted changes. In a git workspace also pin a tracked snapshot:
   `git stash create` (touches neither tree nor index; empty output means clean, use HEAD)
   and `git update-ref refs/long-horizon/<task-slug>/round-<N> <sha>` so gc cannot prune it
   across sessions. An equivalent immutable snapshot plus content manifest is valid when
   these Git operations are unavailable. Include relevant ignored generated artifacts
   explicitly; name unavailable coverage rather than calling it clean. Record deleted paths
   too. Sizes and mtimes are not a baseline; hashes are. Under the workflow engine the
   baseline agent takes it as the script's first stage, at the manifest path and ref name the
   Current round block already records; under the agent engine, take it inline before
   spawning the executor.
2. **Execute**: set phase `executing`. Workflow engine: call the round script; the executor
   is its second stage. Agent engine: spawn a fresh subagent with the brief alone and no
   Manager conversation history. Either way record the run or agent ID as soon as dispatch
   returns. The executor does the step and reports what changed and how to check it. Confirm
   it has stopped writing, record its status, and set phase `awaiting-audit`.
3. **Audit**: confirm all writers to the scope have finished or stopped. Workflow engine: the
   inspector and judges are the script's third stage and run only after the executor agent
   has returned. Agent engine: spawn a second fresh subagent with the prewritten auditor
   brief and nothing else, and record its ID. The audit works in this order, because its own
   done-check run writes files too:
   1. Rebuild the manifest now and diff it against the Baseline (added, modified, deleted),
      plus `git diff <ref> --stat` for tracked files. This delta is the executor's work.
   2. Run the done-check from the recorded cwd and compare with the expected result.
   3. Return three verdicts with evidence:
   - status: complete / incomplete / blocked, from its own run of the done-check. Evidence
     it did not produce this round counts only if it fetched it itself from an authenticated
     source (a CI run by URL, a receipt from the external system); executor-produced logs and
     test output are claims. If the check itself is broken, say `blocked: invalid check`, which
     is a Plan defect, not a Dead end. On `incomplete`, add `repairable: yes` or
     `repairable: no` with the diagnostic from the inspector's own done-check run (the raw
     check output under the round directory). Yes means a mechanical fault the approach
     survives (build error, missing dependency, harness or resource failure); no means the
     approach itself failed. A diagnostic that exists only in the executor's report is a
     claim and does not make a step repairable. With several judges, any `no` is `no`.
   - integrity: clean / suspect / violation. Clean only when the step-1 delta touches nothing
     outside Write scope and every artifact the step promised exists. A delta that reaches
     test or gate definitions the step did not own is `suspect` at best: a passing check
     proves nothing if the executor could edit the check. Unclear evidence = suspect.
   - contract: aligned / drifted, with the inspected contract version and acceptance checks.
   The executor's report is a claim; the auditor's inspection is the evidence. Only
   complete + clean + aligned enters Verified progress. Set phase `audited`.
4. **Integrate**: pass: move the step into Verified progress with the auditor's evidence, the
   round's brief paths, baseline ref and runId, so the round can be re-examined later. Fail:
   preserve unaffected Verified progress and mark affected claims stale; append the audit
   findings, record the delta's paths under Residue with a decision to revert or keep each,
   and schedule the next round by the combined `repairable` verdict. `yes`: one recovery
   round on the same approach, its brief carrying the inspector's diagnostic, counted as the
   step's second attempt under Stagnation. `no`: the approach goes to Dead ends now and the
   next brief changes approach. `invalid check` is a Plan defect and goes to neither. One
   recovery per step: a failed recovery is the step's second failure, and Stagnation then
   forces a new approach whatever the second diagnostic says. Either way, archive the
   Current round block into the Audit log and clear it; a stale one would feed the next
   auditor the wrong done-check.

Update the state file every round. Three rounds without a state-file write means drift: stop
and rebuild the file from the real workspace.

After compaction or restart, read state, reconcile the workspace and latest user instructions,
and inspect recorded workers before touching the round. Confirm old writers have finished or
stopped before auditing or replacing them. Missing IDs or lost handles do not prove completion;
if writer status cannot be established, pause affected work and record the recovery needed.
A round that ran under the workflow engine resumes with `resumeFromRunId`, the same script
and the same `args`: finished agents replay from cache, so a completed executor is not run
twice. Read the run's `journal.jsonl` before trusting any cached return.

Validate the baseline manifest and Git ref in every phase. Recover missing pieces only from
trusted pre-execution artifacts. If execution may have started and recovery fails, preserve
partial edits and record integrity as `suspect` with attribution unavailable. Do not replace
the old baseline with current content or accept the round as clean.

Then reconcile phase:
- `planned`: if no execution occurred and no work is present, finish or rebuild Plan before
  dispatch. If execution may have occurred, preserve the original baseline and reconcile it
  as an interrupted execution.
- `executing` or `awaiting-audit`: once writers are stopped and the baseline is valid, audit
  the existing work; do not repeat execution or overwrite its baseline.
- `audited`: integrate only if the inspected content and contract version still apply;
  otherwise invalidate affected evidence and re-audit.

Record recovery actions and pending checks before continuing.

## Stagnation

A round count alone cannot resolve a stalled run. Watch for repeated failures directly:

- Same step fails audit twice in a row: the next brief must change approach, not retry the
  old one. Move the failed approach to Dead ends first.
- Three rounds with nothing new entering Verified progress: stop spawning and rewrite
  Remaining. The decomposition itself is the suspect, not the executor. Preserve consumed
  attempts; a new decomposition does not reset a user budget.

Count both triggers from the Audit log, never from memory; a recovery round is an attempt.
A rewrite of Remaining may route the stuck step through `arena` (parallel candidates, pick,
graft), and arena then runs inside the executor agent: the Manager never reads candidates,
picks or grafts, and the inspector sees only the workspace result. Candidates need the state
file's Contract and Dead ends copied in, and a worktree starts from HEAD, so use `.tmp/arena-*`
copies or commit a WIP first; otherwise earlier rounds' uncommitted edits are lost.

Either trigger optionally escalates to a cross-vendor supervisor. Manager, executor, and
auditor are all Claude, so they share blindspots, and a shared blindspot is exactly what a
plateau looks like from the inside. Codex is a different model family that never saw this
session:

```bash
codex login status
```

Logged in: one `codex exec` run (custom prompt, no scope selector) carrying the contract, the
audit log, and Dead ends, asking for a plateau diagnosis and a different strategy. See the
`codex-review` skill for current local preflight, CLI mechanics, and run identity. Its answer
is an opinion: check the proposal against the current contract version and acceptance checks
before it rewrites Remaining, and drop anything that drifts. Not logged in or the run fails:
skip it, the rewrite rules above stand on their own.

One consult per trigger. Each run bills the user's Codex subscription, which is why this hangs
off a stagnation trigger instead of running every round.

## Completion

Per-round verdicts prove each step against the workspace as it was then; a later round can
regress an earlier one. So before reporting, spawn one last fresh auditor with the current
contract, its amendments, and the workspace root. Have it run every current acceptance check
against the final workspace. Under the workflow engine this is one more script call with a
final-audit brief and no executor stage. Anything that fails moves back to Remaining.

Then answer from Verified progress alone. Unfinished is a valid report: state what is verified
and what remains, including missing independent checks. Bind final evidence to the
inspected revision and content manifest; later relevant changes require revalidation.

## Guardrails

- Honor explicit user model choices and required quality floors. Otherwise inherit the
  configured session model. Check actual exposure before dispatch; if a requested model or
  floor is unavailable, disclose it rather than silently downgrading or claiming it ran.
- Size each step so one fresh context finishes it: one slice, one migration, one bug.
- Audit independence is the point: verdicts come from the auditor's own inspection in a
  fresh subagent, never from this Manager context.
- Executors and auditors follow fable-mode discipline inside their round; fable-mode governs
  one context, this skill governs work spanning many.
- Under ~3 dependent steps: skip the harness, run fable-mode directly.
- At `max(5, 2 * initial step count)` rounds, reassess strategy and remaining work before
  continuing. This default is a reassessment threshold, not a completion or abandonment
  rule. At reassessment, tag every Remaining item continue, reserve, or close with a one-line
  reason; a reserved item reopens only through the final auditor's failed checks or a user
  instruction. Track executor attempts, auditor calls, and retries separately. Explicit user
  round, time, or cost limits are binding; checkpoint before exceeding them and report
  unfinished checks. A budget of zero permits inspection but no budgeted execution.
- An unavailable required check blocks that step and its dependents; complete independent
  authorized work and ask only for missing user-owned decisions or authority. Invocation
  does not authorize publication, installation, deployments, or external messages.
