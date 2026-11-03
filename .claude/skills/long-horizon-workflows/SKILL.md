---
description: "Long-horizon rounds via Workflow tool: 1 script per batch, fresh baseline, candidate executors, blind pick, independent judges each round, schema verdicts, run journal. Use: /long-horizon-workflows, big task in Workflow-audited rounds. Claude Code only."
disable-model-invocation: true
---

# long-horizon-workflows: audited rounds on the Workflow engine

Manager, Executor, Auditor. You (this ctx) = Manager: hold goal, keep state file true,
delegate every round. Executors/auditors = fresh subagents; fresh ctx per round separates
impl from independent evidence. Discussing/editing this skill ≠ activating it.

`long-horizon` contract, one change: `Workflow` tool exposed → every round of a batch runs
inside one script: baseline, candidate executors, blind pick, graft, audit. Ctx boundary
enforced by construction, verdicts forced into enums, every agent's exact input/output
journaled. Claude Code only; Codex sessions use `long-horizon`. Tool absent in Claude session
→ same steps as fresh `Agent` calls, contract unchanged.

Parallelism lives at three levels, all chosen at Plan and recorded in the state file:

- Batch: every ready step with disjoint write scope runs as its own round, all in one call.
- Candidates: a round may build its step N times in N workspaces from different angles; a
  blind panel picks the base and names ideas to graft from the others.
- Judges: the audit of a round's result is one inspector plus independent judges.

One writer per workspace stays absolute. Attribution comes from diffing a workspace against
its baseline; two writers in one workspace make the delta nobody's. More parallelism = more
workspaces, never more agents in one.

## Guardrails

- Honor explicit user model choices + required quality floors; else inherit configured
  session model. Check actual exposure before dispatch; requested model/floor unavailable →
  disclose; never silently downgrade or claim it ran.
- Size step so one fresh ctx finishes it: one slice, one migration, one bug. Split
  independent work into separate steps → parallel rounds.
- Audit independence = the point: verdicts from auditor's own inspection in fresh subagent,
  never this Manager ctx.
- Executors + auditors use fable-mode discipline inside round; fable-mode governs one ctx,
  this skill governs work spanning many.
- Under ~3 dependent steps: skip harness, run fable-mode directly.
- At `max(5, 2 * initial step count)` rounds: reassess strategy + remaining work before
  continuing. This default = reassessment threshold, not completion or abandonment rule. At reassessment: tag every Remaining item continue, reserve, or close w/ one-line reason; reserved item reopens only
  via final auditor's failed checks or user instruction. Track executor attempts, auditor
  calls, retries separately. Explicit user round/time/cost limits binding; checkpoint before
  exceeding, report unfinished checks. Budget zero → inspection allowed, no budgeted
  execution.
- Unavailable required check blocks that step + dependents; finish independent authorized
  work, ask only for missing user-owned decisions or authority. Invocation doesn't authorize
  publication, installation, deployments, or external messages.

## State file

`.tmp/long-horizon/<task-slug>/state.md` (gitignored scratch), created before round one:

Template: [state-file-template.md](references/state-file-template.md); read it before creating or rebuilding the file or writing a Current batch or Current round block.

Only audit-passed results enter **Verified progress**. Resume from existing state file;
reconcile w/ real workspace + latest user instructions. Before resuming run this session
didn't start, check if another session still manages it: state file changed in last 30 minutes,
or `Workers:` lists still-running worker/workflow run → ask user: take over (they stop other
session first) or stay out. Two Managers on one state file corrupt it.

Preserve original contract. Explicit user changes → versioned amendments; reassess affected
steps, invalidate affected claims before using them as prerequisites. Never weaken acceptance
just to pass a round. Amendment mid-round → reconcile its workers before further execution,
preserve baseline + old briefs, write new versioned brief from amended contract + raw
artifacts, no executor assessments. Only audit vs current contract accepts affected work.

Dead ends = memory too. Unrecorded failed approach gets re-proposed rounds later; re-walking
costs full round.

## Context boundary

Fresh = no Manager conversation history. State file, workspace, standalone brief carry every
needed fact. Executor gets only its bounded brief; auditor only its prewritten brief. Auditor
never gets executor's turns or report.

Real leak ≠ executor's file list (auditor recovers it from workspace). It's executor's
narrative ("works, checked X, Y was out of scope"): Manager has read it by auditor-brief time,
can paraphrase unnoticed. So auditor brief pre-registered: written at Plan, before executor
exists, from current contract version's acceptance checks, Current round block, workspace
root; saved to block's recorded path; dispatched unchanged. Manager wants to add to brief after Execute → that's Plan defect, not brief defect → next round (exception: explicit user amendment,
handled above). Provenance checkable; "do not paraphrase" isn't.

Inspect exposed tools + capacity before dispatch. Auditor: fresh ctx; never
`subagent_type: fork` or any option inheriting Manager history. No fresh independent ctx →
record gap; inherited ctx or self-review can't establish audit gate. Continue useful
authorized work not depending on it.

Workspace = executor's for round duration. Anyone else's edits between Baseline and Audit →
attribution impossible; auditor reports integrity `suspect`, no guessing whose change.

## Round loop

1. **Plan**: read state file. Both engines: pin the batch base (never HEAD), take main's
   manifest and size the batch per [batch-workspaces.md](references/batch-workspaces.md),
   read first. Split Remaining to the finest safe grain (Parallel rounds);
   pick batch (every ready step the rules allow; each round works ONE step); set each
   round's candidate count, judge count and serial-candidates flag; write the Current batch block
   and each Current round block to state file, phase `planned`, before spawning anything.
   Then per round: auditor brief → its recorded path; executor brief = contract excerpt,
   Current round block, only verified facts step needs, every dead end touching step, Method
   notes. Done-check frozen from here; wrong one fixed in next batch's Plan, never after
   reading an executor's report.

   Hours-long execution or done-check → before briefs freeze it, run the draft review in [draft-review.md](references/draft-review.md). Cheap rounds skip.

   Before writing the state file or any brief: [briefs.md](references/briefs.md).

   Baseline = workspace before its executor ran, never HEAD. Before taking or validating one: [baseline.md](references/baseline.md).
2. **Execute**: phase `executing`. Workflow engine: call the batch script; executors = stage
   2 of every round. Agent engine: fresh subagent per candidate w/ brief alone, no Manager
   conversation history; angle line per index. Either way record run/agent IDs as soon as
   dispatch returns. Executor does step, reports what changed + how to check. Confirm it
   stopped writing, record status, phase `awaiting-audit`.
3. **Pick** (rounds with several candidates): [candidates-blinding.md](references/candidates-blinding.md). No candidate passes its own check → round fails on the base's inspection, audit skipped.
4. **Audit**: confirm all writers to the base workspace finished/stopped. Workflow engine:
   inspector + judges = last stage, run only after the executor and grafter returned. Agent
   engine: fresh subagent w/ prewritten auditor brief, nothing else; record its ID. Order
   fixed b/c its own done-check run writes files too:
   1. Rebuild manifest now, diff vs Baseline (added, modified, deleted) + `git diff <ref> --stat`
      for tracked files. After a pick inspection: executor delta from its pre-check diff,
      grafter delta from its post-check manifest; a path the check alone changed and nothing
      touched since is a check artifact, not a delta.
   2. Run done-check from recorded cwd; compare w/ expected result.
   3. Return three verdicts w/ evidence:
   - status: complete / incomplete / blocked, from own done-check run. Evidence the auditor
     didn't produce this round counts only if it fetched it itself from authenticated source (CI run by
     URL, receipt from external system); executor-produced logs/test output = claims. Check
     itself broken → `blocked: invalid check` = Plan defect, not Dead end. On `incomplete`:
     add `repairable: yes` or `repairable: no` w/ diagnostic from inspector's own done-check
     run (raw check output under round dir). Yes = mechanical fault; approach survives it (build
     error, missing dep, harness/resource failure); no = approach itself failed. Diagnostic
     only in executor's report = claim, can't make step repairable. Several judges: any `no`
     is `no`.
   - integrity: clean / suspect / violation. Clean only if step-1 delta touches nothing
     outside Write scope AND every promised artifact exists. Delta reaching test/gate
     definitions step didn't own = `suspect` at best: passing check proves nothing if
     executor could edit it. Unclear evidence = suspect.
   - contract: aligned / drifted, w/ inspected contract version + acceptance checks.
   Executor report = claim; auditor inspection = evidence. Only complete + clean + aligned
   enters Verified progress. Phase `audited`.
5. **Integrate**: batches follow Parallel rounds order. Pass: step → Verified progress w/
   auditor's evidence, round's brief paths, baseline refs, runId (re-examinable later); copy
   cited result files outside task dir into its `evidence/round-<N>/` (workspaces vanish).
   Fail: keep unaffected Verified progress, mark affected claims stale; append audit
   findings; delta's paths → Residue, revert-or-keep decision each; next round per combined
   `repairable`. `yes`: one recovery round, same approach, brief carries inspector's
   diagnostic, candidates ≥3 (in-place: 1); counts as step's second attempt under Stagnation. `no`:
   approach → Dead ends now; next brief changes approach. `invalid check` = Plan defect →
   neither. `brief gap` = Plan defect too; fix the brief, no attempt consumed. One recovery
   per step: failed recovery = step's second failure → Stagnation forces new approach
   whatever second diagnostic says. Either way: archive Current round block into Audit log,
   clear it (stale block feeds next auditor wrong done-check). Rules for later rounds stated
   in an executor's report → Method notes, unconfirmed until later done-check covers them.

Update state file every batch. 3 batches w/o state-file write = drift: stop, rebuild file
from real workspace.

Round building/changing verification tool (harness, probe, diff or measurement script) later
rounds use as evidence → one cross-vendor code review of tool after it passes audit, before
any later done-check depends on it: `codex-review`, or `codex-fullreview` if tool large, run
between rounds on uncommitted work holding it. Audit judged step, not whether tool measures
correctly. Confirmed tool findings → next round's step; others → Remaining.

End of each phase (contract milestone, or unit user asked to ship as one PR):
`codex-fullreview` on phase diff, or `codex-review` if diff small. Surviving findings fixed in
audited round before merge, never patched by Manager directly. Other pre-merge reviews repo
requires still run. One PR per phase requested → phase ends after last audited round: commit,
open PR, run these reviews, record `Waiting: merge of <PR>` in state file. Next phase plans
first batch in fresh workspace from merged default branch; base taken there.

After compaction/restart or resuming a run: follow [recovery.md](references/recovery.md) before touching a round.

Validate baseline manifests + Git refs in every phase. Recover missing pieces only from trusted
pre-execution artifacts. Execution may have started + recovery fails → keep partial edits,
integrity `suspect`, attribution unavailable. Never replace old baseline w/ current content
or accept round as clean.

## Stagnation

Round count alone can't resolve stall. Watch repeated failures directly:

- Same step fails audit twice in a row: next brief must change approach, not retry. Move
  failed approach to Dead ends first; next round runs with candidates ≥3 (in-place: 1,
  new approach in the brief), angles clear of every Dead end.
- 3 batches in a row w/ nothing new in Verified progress: stop spawning, rewrite Remaining.
  Decomposition is suspect, not executor. Keep consumed attempts; new decomposition doesn't
  reset user budget.

Count both triggers from Audit log, never memory; recovery round = attempt. The Candidates
stage is the arena for a stuck step; a standalone `arena` run is unnecessary and would start
its worktrees from HEAD, losing earlier rounds' uncommitted edits.

Either trigger may escalate to a cross-vendor supervisor: read [supervisor-consult.md](references/supervisor-consult.md) first. Its answer = opinion: check vs current contract version + acceptance checks before it rewrites Remaining.

One consult per trigger. Each run bills user's Codex subscription → stagnation-triggered
only, not every round.

## Completion

Per-round verdicts prove each step vs workspace as it was then; later round can regress
earlier one. So before reporting: one last fresh auditor w/ current contract, amendments,
workspace root runs every current acceptance check vs final workspace. Workflow engine: one
more script call with `rounds: []` and `finalAudit` set, final-audit brief, no executor
stage. Failures → back to Remaining.

Then answer from Verified progress alone. Unfinished = valid report: state verified +
remaining, incl. missing independent checks. Bind final evidence to inspected revision +
content manifest; later relevant changes → revalidate.

## Parallel rounds

Max safe concurrency. Each Plan: every ready step able to run beside others → own round, all
dispatched as one batch. Ready step waits for later batch only if rule below forbids; note
rule in its Remaining entry. A batch of one needs the forbidding rule, or "no other step
ready", written on the `Batch of one because:` line. Before picking the batch, split any
Remaining step whose write scope partitions into disjoint parts with their own done-checks;
a step wanting N parallel workers is N steps.

Ready = all dependencies in Verified progress. Ready steps share batch only if:

- write scopes don't overlap; neither reads path other writes;
- no two executions/done-checks contend for one resource: port, dev server, browser profile,
  DB, GPU, or timing/perf measurement parallel load would skew. A round whose own candidates
  contend that way sets `Serial candidates: yes` (its executors and candidate checks run one at a time) and
  shares a batch only with rounds that never touch that resource;
- capacity covers them, counting Manager + every agent of every running round, candidates
  and judges included;
- every Write scope path inside workspace root. Step writing outside → runs alone, in main
  workspace, one candidate: separate checkout can't isolate outside path, edits reach main
  env whatever audit says. In-place round skips batch integration steps 1-4 (nothing to copy;
  its edits already differ from Baseline by design) → normal Integrate on its own audit.

Each round keeps whole contract: own Current round block, workspaces, Baselines, briefs,
executors, audit. Workspaces never shared: one writer's edits land in another's manifest
diff → both audits `suspect`.

Batch base, candidate workspaces, capacity: read [batch-workspaces.md](references/batch-workspaces.md) at Plan before pinning the batch base, sizing a batch or building workspaces (both engines), and again before integrating.

Workflow engine: one call per batch, `args.rounds` holding every round; the script runs the
rounds side by side and each round's stages in order. Agent engine: all executors in one msg;
each auditor once its executor stops. Integrate after whole batch audited:
follow steps 1-4 in [batch-workspaces.md](references/batch-workspaces.md). No round enters Verified progress before step 4's fresh auditor run in main.

## Candidates

`arena` inside the round, as a stage of the script: N executors build the same step in N
workspaces from different angles; N inspectors run the done-check, one per workspace; a blind
panel picks the base and names ideas to graft; one grafter rewrites those ideas into the base;
the normal audit then judges the base. Set `Candidates:` per round, record the reason:

- 1: mechanical step with an obvious shape and a deterministic done-check (tests, build,
  hash compare, a migration with one correct form). Candidates would converge; the panel
  would pick at random.
- 3 (default when unsure): design-shaped step, several plausible approaches, done-check that
  needs interpretation, or a step whose area already holds a Dead end.
- 3 or more, mandatory: rework round after a failed audit, or a Stagnation trigger. Angles
  must differ from every Dead end touching the step. In-place rounds are the one exception:
  they always run one candidate, because nothing isolates a write outside the workspace, so
  their rework round changes approach through the brief instead of fanning out.

Angles, blinding, grafting, cost: read [candidates-blinding.md](references/candidates-blinding.md) before any multi-candidate round.

## Round engine: Workflow

Invoking skill = user opt-in to `Workflow` tool for its rounds, nothing else. Engine chosen
once at task start from tool exposure, recorded under `Engine:` in Current batch block.
Mid-task switch only if tool disappears; log switch in Audit log.

Manager keeps Plan + Integrate. Script has no filesystem, clock, or user → can't pick steps,
freeze done-checks, weigh dead ends, decide residue, absorb amendments. One batch per call.
Rework after failed audit = next round in the next batch, planned inline; never a retry loop
in script.

Before writing `args` or calling Workflow, read [workflow-script.md](references/workflow-script.md): script rules, template, handling its return.
