---
description: 'Long-horizon rounds run through the Workflow tool: one script per batch, with a fresh baseline, candidate executors, a blind pick, and independent judges for every round, schema verdicts and a run journal. Use on /long-horizon-workflows or to run a big task in Workflow-audited rounds. Claude Code only.'
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
1. <step sized for one fresh context>; depends on: <step numbers or none>; writes: <paths>

# Current batch
Batch: <B>   Rounds: <N1, N2, ...>   Engine: workflow | agent
Base: <git ref pinned from main at Plan> + <main manifest path over the union of write scopes>
Batch of one because: <the Parallel rounds rule that forbade more, or "no other step ready">
Workers: <workflow runId + transcript dir, or agent IDs; role; last observed status>

# Current rounds  (one block per active round; scope and checks fixed at Plan, except for explicit user amendments)
Round: <N>   Phase: planned | executing | awaiting-audit | audited
Contract version: <version used for this round>
Workspaces: <one absolute root per candidate; in-place round: the main workspace>
Step: <the one Remaining step this round works>
Done-check: <commands, cwd relative to the workspace root, and the expected result; the auditor runs them itself>
Write scope: <paths the executor may change; test and gate definitions only if the step is about them>
Candidates: <count and the one-line reason, per Candidates below>
Judges: <total verdict count including the inspector, and the one-line reason for that number>
Serial candidates: yes | no  <yes when execution or the done-check binds a port, device or timing measurement; candidates then run one at a time>
Baseline: <manifest path per candidate> + <git ref per candidate>  (taken by the baseline agent; the auditor diffs against this, never HEAD)
Executor brief: <path>  (written at Plan)
Auditor brief: <path>  (written at Plan, dispatched byte for byte)
Residue: <paths a failed earlier round left changed, and whether they were reverted or kept>

# Dead ends  (approaches that failed audit; do not retry without new evidence)
- <approach>: <why it failed, one line>

# Method notes  (rules later rounds must follow, such as how to measure)
- <rule>: source round <N>; unconfirmed / confirmed in round <M> / dropped

# Audit log
- round N (batch B): <step>: <status>/<integrity>/<contract>, <candidates built, base picked>, <one-line evidence>, <runId or agent IDs>
```

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

Capacity: the engine runs about `min(16, CPUs - 2)` agents at once per call and queues the
rest, so a large batch finishes, only later. The session's workflow size guideline (under 10
agents) is advisory; invoking this skill is the user's request for batch scale. Count tokens,
not slots: every candidate multiplies the executor cost of its round.

Workspace = executor's for round duration. Anyone else's edits between Baseline and Audit →
attribution impossible; auditor reports integrity `suspect`, no guessing whose change.

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

Base of a batch, taken once by the Manager at Plan in the main workspace: `git stash create`
(empty output: use HEAD) → `git update-ref refs/long-horizon/<task-slug>/batch-<B> <sha>`,
then `manifest.mjs` on main over the union of the batch's write scopes (conflict reference
for integration). Never HEAD: drops earlier rounds' uncommitted verified work. Every
candidate workspace of every round in the batch is a detached worktree at that sha, built by
the round's baseline agent inside the script (Workflow engine) or by the Manager before
dispatch (Agent engine): `git worktree add --detach <path> <sha>`, copy in every untracked
file of main (`git ls-files --others --exclude-standard`), then the ignored artifacts the
step needs: a junction or symlink into main only for an artifact no step of the batch
writes, since a write through the link reaches main and every other candidate and the
manifest records the link, not its target; anything a step installs, updates or builds
into (dependencies under an install step, build output) is copied. Then take that
workspace's Baseline. Never plain copy of Git checkout: copied `.git` file still points at
original's index + HEAD. Plain copies only for non-Git workspaces. Round Baseline stays the
attribution reference; checkout filters (e.g. `core.autocrlf`) can make round bytes differ
from main's.

Workflow engine: one call per batch, `args.rounds` holding every round; the script runs the
rounds side by side and each round's stages in order. Agent engine: all executors in one msg;
each auditor once its executor stops. Integrate after whole batch audited:

1. Each passed round: apply manifest diff of its base workspace to main verbatim: copy each added/modified path from that workspace, delete each deleted path. Main file not matching main's pre-checkout hashes (or present where none recorded) = conflict → step back to Remaining for later batch; not Dead end.
2. Failed round's delta stays out of main. Save as patch under `evidence/round-<N>/` (recovery brief may cite); record in Residue as not applied.
3. Before removing any round workspace, candidates included: stop every process its round started (per `processes.log`), confirm gone; else old server answers step-4 check or holds its port. Step 4 starts any server it needs from main. Then copy every cited evidence file living in it (done-check output, ignored artifacts) into `evidence/round-<N>/`. Then unlink dep links in it (`rmdir` on junction/symlink), then `git worktree remove --force <path>`: dirty by design, so plain `git worktree remove` refuses; forcing before unlinking deletes through link into shared target.
4. Separate-workspace verdicts don't prove steps work together or survive workspace removal (e.g. link into removed worktree). After removal, one fresh auditor runs every applied round's done-check in main workspace before any enters Verified progress. Step failing there → Remaining w/ that output; its applied paths → Residue w/ revert-or-keep decision.

Within round, executor runs independent reads/searches/commands at once; fans out read-only
helper subagents, foreground, for research, search and probes. Parallel-writer work = several
steps: split in Remaining, run as parallel rounds.

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

Angles come from the script's constant list, assigned by index; the executor brief never
names an angle. Candidates read nothing of each other; the panel sees candidates by index
only and never an executor's return value. Blinding limit, recorded in the Audit log: the
workspace path shows the candidate index, nothing else. A grafter is a second writer in the
base workspace, so the final audit covers its edits too. A pick inspection runs the
done-check in the candidate's workspace before the audit and saves the executor's delta,
the check's own changes and a post-check manifest, so the audit attributes executor, check
and grafter edits separately instead of excluding whole paths. Candidates split over a basic
premise → the panel reports it, the round returns `blocked: brief gap`; fix the brief, run a
new round; a merge of both premises is never the answer.

Cost: a 3-candidate round spends about 3 executors + 3 inspectors + judges + 1 grafter before
its audit. Spend it where the shape is unclear; keep mechanical rounds at 1.

## Round engine: Workflow

Invoking skill = user opt-in to `Workflow` tool for its rounds, nothing else. Engine chosen
once at task start from tool exposure, recorded under `Engine:` in Current batch block.
Mid-task switch only if tool disappears; log switch in Audit log.

Script gives: spawned agents never inherit Manager history (boundary by construction);
`schema` forces verdicts into enums, not prose; run persists script + journal of every
agent's exact input/return value (provenance state file can't give); `resumeFromRunId`
replays every finished agent of the batch from cache after crash, no rerun.

Manager keeps Plan + Integrate. Script has no filesystem, clock, or user → can't pick steps,
freeze done-checks, weigh dead ends, decide residue, absorb amendments. One batch per call.
Rework after failed audit = next round in the next batch, planned inline; never a retry loop
in script.

Script rules:

- Every prompt from `args` + constants only. Executor and grafter returns kept for the Audit
  log, never concatenated into any pick or audit prompt. `agent(auditBrief + executorReport)`
  = the leak this skill prevents, one keystroke away.
- Briefs travel as paths, not strings. Agents read file Manager wrote at Plan; on-disk file =
  byte-for-byte record. Wrapper text around path = template constant, not per-round Manager
  prose. Done-check cwd in a brief is relative to the workspace root; the script names the
  root.
- Inspector raw artifacts at paths derived from `args`. Judges get paths from `args`, never
  from an inspector's return; never see its verdict. Pick judges see every candidate's delta
  and check output; audit judges see only the base's.
- One agent per workspace runs the done-check. Two auditors running it in one workspace →
  concurrent writes contaminate the manifest diff. Judges read delta + check output, score;
  no re-run.
- No `isolation: 'worktree'` for anyone: it starts from HEAD and loses every earlier round's
  uncommitted verified work. Workspaces come from the batch base via `args`.
- `agent()` returns `null` when user skips or API dies. Null baseline, inspector or every
  executor = `blocked` w/ integrity `suspect`, never `complete`. Null candidate among several
  = dropout, logged, round continues. Null pick inspection = that candidate leaves the pick
  (no delta or post-check manifest to audit against); every one null = `blocked`. Release
  null, or `released: false`, = `blocked`: resource state unconfirmed. Null grafter = possible
  partial edits; logged, audit runs anyway and attributes them.
- Pass no `model`. Agents inherit session model → quality floor holds. `effort: 'low'` OK for
  baseline agents only.
- Under `+Nk` budget directive, `agent()` throws at ceiling. Each round catches, returns
  `blocked: budget` with what it collected; the Manager checkpoints.
- Pass = unanimity in the audit stage: every status `complete`, every integrity `clean`, every
  contract `aligned`. Any `blocked` verdict blocks round. Disagreement = `suspect`. A missing
  judge caps integrity at `suspect`.
- `judges` missing from a round → 2. Candidate count = `workspaces.length`; one workspace = one candidate.

Template. Manager writes the Current batch + round blocks and every brief first, then calls
Workflow w/ `args`:

```js
export const meta = {
  name: 'long-horizon-batch',
  description: 'One long-horizon batch: per round, baseline, candidate executors, blind pick, graft, independent audit',
  phases: [{ title: 'Baseline' }, { title: 'Execute' }, { title: 'Pick' }, { title: 'Graft' }, { title: 'Audit' }],
}
// args: {
//   taskSlug, batch, mainWorkspace, baseSha, manifestScript,
//   ignoredArtifacts: [{ from, to, mode }],   // from/to relative to a workspace root; mode 'link' | 'copy'.
//     link = junction or symlink into main: only for an artifact no step of the batch writes
//     (a write through the link reaches main and every other candidate, and the manifest
//     records the link, not the target). A step that installs, updates or builds into an
//     artifact gets copy. Copied destinations join the baseline's extra paths, so the manifest
//     covers them and every later diff keeps that coverage.
//   rounds: [{ round, roundDir, workspaces, inPlace, writeScope, executorBrief, auditorBrief,
//              judges, serial }],
//   finalAudit: { auditorBrief, workspace, judges } | null,
// }
// workspaces = one absolute root per candidate, all built from baseSha unless inPlace; its
// length is the candidate count. Candidates are numbered 1..N everywhere agents see them.
// roundDir = .tmp/long-horizon/<slug>/round-<N>. Briefs are absolute paths written at Plan.
// manifestScript = absolute path of long-horizon/scripts/manifest.mjs.
// judges = total verdict count including the inspector.
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
    // On incomplete only: yes = mechanical fault from the inspector's own check run, no = the
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
    manifests: { type: 'array', items: { type: 'string' } },   // one per workspace, same order
    gitRefs: { type: 'array', items: { type: 'string' } },
    identical: { type: 'boolean' },                            // every manifest holds the same hashes
    fileCount: { type: 'integer' },
    uncovered: { type: 'array', items: { type: 'string' } },
  },
  required: ['manifests', 'gitRefs', 'identical', 'fileCount'],
}
const PICK = {
  type: 'object',
  properties: {
    candidates: { type: 'array', items: { type: 'object', properties: {
      index: { type: 'integer' },           // 1-based
      status: { enum: ['complete', 'incomplete', 'blocked'] },
      integrity: { enum: ['clean', 'suspect', 'violation'] },
      contract: { enum: ['aligned', 'drifted'] },
      evidence: { type: 'string' },
    }, required: ['index', 'status', 'integrity', 'contract', 'evidence'] } },
    base: { type: 'integer' },             // 1-based; candidate whose design the grafts would disturb least; tie: less code
    premiseSplit: { type: 'boolean' },     // candidates disagree on a basic premise of the step
    graftIdeas: { type: 'array', items: { type: 'object', properties: {
      fromCandidate: { type: 'integer' },  // 1-based
      idea: { type: 'string' },
      paths: { type: 'array', items: { type: 'string' } },
    }, required: ['fromCandidate', 'idea'] } },
  },
  required: ['candidates', 'base', 'premiseSplit', 'graftIdeas'],
}
const RELEASE = {
  type: 'object',
  properties: { released: { type: 'boolean' }, detail: { type: 'string' } },  // released = every listed process gone and every port free
  required: ['released', 'detail'],
}
const ANGLES = ['minimal change', 'failure-proof', 'end-user-first', 'simplest to verify', 'performance-first']
const LENSES = ['scope integrity', 'check validity', 'contract drift']
const a = args
const blocked = (reason) => ({
  status: 'blocked', blockedReason: reason, integrity: 'suspect',
  contract: 'aligned', contractVersion: 'n/a', evidence: reason, repairable: 'n/a', diagnostic: '',
})

// Unanimity over one inspector plus the judges that returned.
function combine(inspector, judges, judgeCount) {
  const all = [inspector, ...judges]
  const blockedVote = all.find(v => v.status === 'blocked')
  if (blockedVote) return blockedVote
  return {
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
}

// Manifest diff plus the done-check, in one workspace, writing raw artifacts under outDir.
function inspect(r, i, outDir, phase, pickDir) {
  return agent(
    `Read ${r.auditorBrief} and follow it. Workspace root: ${r.workspaces[i]}. Work in this order. ` +
    (pickDir
      ? `1: a pick inspection already ran the done-check in this workspace. Its ${pickDir}/delta.md is the executor's delta, ` +
        `taken before any check ran; its ${pickDir}/post-check-manifest.json is the workspace right after that check. ` +
        `Rebuild the manifest now and diff it against the post-check manifest: that is the grafter's delta. Write both deltas, ` +
        `labelled executor and grafter, plus \`git diff ${r.gitRefs[i]} --stat\` run in that root, to ${outDir}/delta.md. ` +
        `Integrity judges the union of the executor and grafter deltas; a path listed only in ${pickDir}/check-delta.md and ` +
        `unchanged since the post-check manifest is a check artifact and does not count. `
      : `1: rebuild the manifest with the same coverage as ${r.manifests[i]}, diff it (added, modified, ` +
        `deleted), append \`git diff ${r.gitRefs[i]} --stat\` run in that root, and write the result to ${outDir}/delta.md. `) +
    `2: run the done-check from its recorded cwd under that root and write the complete raw output to ${outDir}/check-output.txt. ` +
    `3: rebuild the manifest once more, save it to ${outDir}/post-check-manifest.json, and write every path the check itself ` +
    `changed to ${outDir}/check-delta.md. ` +
    `4: stop every process this inspection started and confirm it is gone. ` +
    `5: return your verdicts with evidence.`,
    { schema: VERDICT, phase, label: `r${r.round} c${i + 1} inspect` })
}

// Serial rounds share a port, device or measurement, so a candidate's leftover process would
// bind the next candidate's resource. Runs after every serial executor and inspection, null
// returns included.
function release(r, phase, what) {
  return agent(
    `Release shared resources after ${what} of round ${r.round}. Read ${r.roundDir}/processes.log (one line per ` +
    `long-lived process a worker started: pid, port, command). Stop every listed process still running, confirm each ` +
    `port is free again, and append a stopped line per pid. Change nothing else. Return released true only when every ` +
    `listed process is gone and every listed port is free; otherwise released false with the detail.`,
    { schema: RELEASE, effort: 'low', phase, label: `r${r.round} release` })
}
const unreleased = (res) => res === null ? 'release agent returned null' : res.released ? null : `release failed: ${res.detail}`

function judgePanel(r, count, phase, inputs) {
  return parallel(Array.from({ length: count }, (_, j) => () => agent(
    `Independent audit judge ${j + 1}, lens: ${LENSES[j % LENSES.length]}. ` +
    `Read ${r.auditorBrief}, then read ${inputs}. ` +
    `Do not run anything and do not modify files. Return your own verdicts. ` +
    `Default to incomplete or suspect when the evidence is unclear.`,
    { schema: VERDICT, phase, label: `r${r.round} judge ${j + 1}` })))
}

async function runRound(r) {
  const n = r.workspaces.length
  const judgeCount = Math.max(0, (r.judges ?? 2) - 1)
  const out = { round: r.round, executed: false, baseline: null, reports: [], pick: null, graft: null, base: null, votes: [], verdict: null }
  const fail = (reason) => { out.verdict = blocked(reason); return out }
  try {
    const build = r.inPlace ? `The workspace already exists; build nothing. ` :
      `For each workspace that does not exist yet: \`git -C ${a.mainWorkspace} worktree add --detach <workspace> ${a.baseSha}\` ` +
      `(retry once on a git lock error), copy every untracked file of ${a.mainWorkspace} ` +
      `(\`git ls-files --others --exclude-standard\`) to the same relative path, then apply ${JSON.stringify(a.ignoredArtifacts ?? [])} ` +
      `(mode link = junction or symlink, mode copy = copy). `
    // Copied ignored artifacts sit outside git status, so the manifest only sees them as
    // extra paths; an executor edit to a copied dist/ must show in the delta like any other.
    const coverage = [...new Set([...r.writeScope, ...(a.ignoredArtifacts ?? []).filter(x => x.mode === 'copy').map(x => x.to)])]
    out.baseline = await agent(
      `Prepare round ${r.round} of long-horizon task ${a.taskSlug}. Workspaces: ${JSON.stringify(r.workspaces)}. ` + build +
      `Then take a baseline of every workspace with ${a.manifestScript}: ` +
      `manifest at ${r.roundDir}/baseline-c<index>.json, ref refs/long-horizon/${a.taskSlug}/round-${r.round}-c<index> (index 1..${n}, workspace order), ` +
      `extra paths ${JSON.stringify(coverage)}. Change nothing else. Report whether every manifest holds identical hashes ` +
      `and list coverage you could not take under uncovered.`,
      { schema: BASELINE, effort: 'low', phase: 'Baseline', label: `r${r.round} baseline` })
    if (!out.baseline) return fail('baseline agent returned null')
    if (!out.baseline.identical || out.baseline.manifests.length !== n || out.baseline.gitRefs.length !== n) return fail('candidate workspaces differ at baseline')
    r.manifests = out.baseline.manifests
    r.gitRefs = out.baseline.gitRefs

    if (r.inPlace && n !== 1) return fail('in-place round must have exactly one candidate')
    out.executed = true
    const execute = (ws, i) => agent(
      `Read ${r.executorBrief} and do exactly what it says, ` +
      (r.inPlace ? `writing only the paths its write scope names. ` : `writing only inside ${ws}. `) +
      (n > 1 ? `Angle for this attempt: ${ANGLES[i % ANGLES.length]}. ` : '') +
      `Apply fable-mode discipline. Run independent reads, searches and probes through read-only helper ` +
      `subagents in the foreground when they would save time. Append each long-lived process you start ` +
      `(pid, port, command) to ${r.roundDir}/processes.log and stop every one of them before returning. ` +
      `Return what changed, how to check it, and the options you considered and dropped, with reasons.`,
      { phase: 'Execute', label: `r${r.round} c${i + 1}` })
    // serial: execution or the done-check binds a port, device or timing measurement that
    // separate worktrees do not isolate, so candidates run one at a time.
    if (r.serial) for (let i = 0; i < n; i++) {
      out.reports.push(await execute(r.workspaces[i], i))
      const bad = unreleased(await release(r, 'Execute', `candidate ${i + 1}`))
      if (bad) return fail(`after candidate ${i + 1}: ${bad}; shared resource state unconfirmed`)
    } else out.reports = await parallel(r.workspaces.map((ws, i) => () => execute(ws, i)))
    // Executor returns are kept for the Audit log only. Never passed to a pick or audit agent.
    const alive = out.reports.map((rep, i) => rep === null ? null : i).filter(i => i !== null)
    if (!alive.length) return fail('every executor returned null; reconcile as interrupted execution')
    if (alive.length < n) log(`round ${r.round}: ${n - alive.length} candidate(s) returned null; dropped`)

    let base = alive[0], pickDir = null
    if (alive.length > 1) {
      let inspections = []
      if (r.serial) for (const i of alive) {
        inspections.push(await inspect(r, i, `${r.roundDir}/pick/c${i + 1}`, 'Pick'))
        const bad = unreleased(await release(r, 'Pick', `inspection of candidate ${i + 1}`))
        if (bad) return fail(`after inspection of candidate ${i + 1}: ${bad}; shared resource state unconfirmed`)
      } else inspections.push(...await parallel(alive.map(i => () => inspect(r, i, `${r.roundDir}/pick/c${i + 1}`, 'Pick'))))
      // A null inspection left no delta or post-check manifest, so that candidate cannot be
      // picked or audited; it leaves the pick.
      const inspected = alive.filter((_, k) => inspections[k])
      inspections = inspections.filter(Boolean)
      if (!inspected.length) return fail('every pick inspector returned null')
      if (inspected.length < alive.length) log(`round ${r.round}: ${alive.length - inspected.length} pick inspection(s) returned null; those candidates leave the pick`)
      const inputs = inspected.map(i => `candidate ${i + 1}: ${r.roundDir}/pick/c${i + 1}/delta.md and ${r.roundDir}/pick/c${i + 1}/check-output.txt`).join('; ')
      const panel = (await parallel(Array.from({ length: Math.max(1, judgeCount) }, (_, j) => () => agent(
        `Blind pick judge ${j + 1} for round ${r.round}. Candidates are known by index only; do not infer who built them. ` +
        `Read ${r.auditorBrief} for the acceptance checks and done-check, then read ${inputs}. ` +
        `Do not run anything and do not modify files. For each candidate return status, integrity and contract with evidence. ` +
        `Pick base: the candidate whose design the planned grafts would disturb least; tie: less code. ` +
        `Set premiseSplit when candidates disagree on a basic premise of the step. ` +
        `List at most two graftIdeas per non-base candidate worth rewriting into the base, each with the paths that hold it.`,
        { schema: PICK, phase: 'Pick', label: `r${r.round} pick ${j + 1}` })))).filter(Boolean)
      out.pick = { inspections, panel }
      if (!panel.length) return fail('every pick judge returned null')
      if (panel.filter(p => p.premiseSplit).length * 2 > panel.length) return fail('brief gap: candidates split over a premise')
      const byIndex = (i) => inspections[inspected.indexOf(i)]
      const votes = (i) => panel.filter(p => p.base === i + 1).length
      base = inspected.slice().sort((x, y) =>
        votes(y) - votes(x)
        || ((byIndex(y)?.status === 'complete') - (byIndex(x)?.status === 'complete'))
        || ((byIndex(x)?.deltaPaths ?? []).length - (byIndex(y)?.deltaPaths ?? []).length)
        || x - y)[0]
      pickDir = `${r.roundDir}/pick/c${base + 1}`
      if (!inspections.some(v => v.status === 'complete')) {
        log(`round ${r.round}: no candidate passed its check; audit skipped`)
        out.base = r.workspaces[base]
        out.verdict = combine(byIndex(base), [], 0)
        if (out.verdict.status === 'complete') out.verdict.status = 'incomplete'
        return out
      }
      const ideas = panel.flatMap(p => p.graftIdeas).filter(g => g.fromCandidate !== base + 1 && inspected.includes(g.fromCandidate - 1))
      if (ideas.length) {
        out.graft = await agent(
          `Read ${r.executorBrief}. Base workspace: ${r.workspaces[base]}; write only inside it and only within its write scope. ` +
          `Ideas to take, each with the candidate workspace index and paths that hold it (read those workspaces only): ${JSON.stringify(ideas)}. ` +
          `Candidate workspaces, index 1 first: ${JSON.stringify(r.workspaces)}. Rewrite each idea to the base's conventions; ` +
          `take at most two per candidate; drop any that conflicts with the base's design. ` +
          `Return what you took and left, with reasons.`,
          { phase: 'Graft', label: `r${r.round} graft` })
        if (out.graft === null) log(`round ${r.round}: grafter returned null; audit attributes any partial edits`)
        // The grafter may have left a server running, and a null return means it never reached
        // its own cleanup; the audit's check must not answer to it.
        if (r.serial || out.graft === null) {
          const bad = unreleased(await release(r, 'Graft', 'the grafter'))
          if (bad) return fail(`after the grafter: ${bad}; shared resource state unconfirmed`)
        }
      }
    }
    out.base = r.workspaces[base]

    const inspector = await inspect(r, base, `${r.roundDir}/audit`, 'Audit', pickDir)
    if (!inspector) return fail('inspector returned null')
    const judges = (await judgePanel(r, judgeCount, 'Audit', `${r.roundDir}/audit/delta.md and ${r.roundDir}/audit/check-output.txt`)).filter(Boolean)
    if (judges.length < judgeCount) log(`round ${r.round}: ${judgeCount - judges.length} judge(s) returned null; integrity capped at suspect`)
    out.votes = [inspector, ...judges]
    out.verdict = combine(inspector, judges, judgeCount)
    return out
  } catch (error) {
    // agent() throws at the +Nk budget ceiling and on runtime faults. Return what exists so the
    // Manager can checkpoint; executors may already have changed files.
    const reason = `blocked: agent() threw (budget ceiling or runtime error): ${error && error.message ? error.message : String(error)}`
    log(reason)
    out.verdict = blocked(reason)
    return out
  }
}

const rounds = await parallel((a.rounds ?? []).map(r => () => runRound(r)))

let finalAudit = null
if (a.finalAudit) {
  const f = a.finalAudit
  const judgeCount = Math.max(0, (f.judges ?? 2) - 1)
  let inspector = null, judges = []
  try {
  inspector = await agent(
    `Read ${f.auditorBrief} and follow it. Workspace root: ${f.workspace}. Run every acceptance check it lists from its ` +
    `recorded cwd under that root, write the complete raw output to ${f.workspace}/.tmp/long-horizon/${a.taskSlug}/final/check-output.txt, ` +
    `and return your verdicts with evidence.`,
    { schema: VERDICT, phase: 'Audit', label: 'final inspect' })
  judges = inspector ? (await parallel(Array.from({ length: judgeCount }, (_, j) => () => agent(
    `Independent final judge ${j + 1}, lens: ${LENSES[j % LENSES.length]}. Read ${f.auditorBrief}, then read ` +
    `${f.workspace}/.tmp/long-horizon/${a.taskSlug}/final/check-output.txt. Do not run anything and do not modify files. ` +
    `Return your own verdicts. Default to incomplete or suspect when the evidence is unclear.`,
    { schema: VERDICT, phase: 'Audit', label: `final judge ${j + 1}` })))).filter(Boolean) : []
  finalAudit = inspector ? { verdict: combine(inspector, judges, judgeCount), votes: [inspector, ...judges] } : { verdict: blocked('final inspector returned null'), votes: [] }
  } catch (error) {
    const reason = `blocked: agent() threw (budget ceiling or runtime error): ${error && error.message ? error.message : String(error)}`
    log(reason)
    finalAudit = { verdict: blocked(reason), votes: [inspector, ...judges].filter(Boolean) }
  }
}

return { batch: a.batch, rounds, finalAudit }
```

After return: runId + transcript dir → Workers; per round, `verdict`, `votes`, candidates
built, `base` → Audit log; then Integrate (below) from each passed round's `base` workspace.
`blocked` w/ `executed: true` = executors ran, or may have, before stop (null return, budget
ceiling, runtime fault) → reconcile as interrupted execution vs recorded baselines, never
clean round. Cached return on resume ≠ evidence until `journal.jsonl` in transcript dir
shows agent's actual output.

## Round loop

1. **Plan**: read state file; split Remaining to the finest safe grain (Parallel rounds);
   pick batch (every ready step the rules allow; each round works ONE step); set each
   round's candidate count, judge count and serial-candidates flag; write the Current batch block
   and each Current round block to state file, phase `planned`, before spawning anything.
   Then per round: auditor brief → its recorded path; executor brief = contract excerpt,
   Current round block, only verified facts step needs, every dead end touching step, Method
   notes. Done-check frozen from here; wrong one fixed in next batch's Plan, never after
   reading an executor's report.

   Hours-long execution or done-check (browser work, GPU timing, long batches) → draft
   review after Current round block written, before briefs freeze it. One fresh read-only
   peer, prefer other model family (custom-prompt `codex exec -s read-only` run, preflight +
   CLI mechanics per `codex-review` skill; else fresh Claude subagent outside round script),
   reads draft Step, Done-check + code the check exercises. One question: can check pass while
   work wrong, fail while right, or not run as written? Concrete findings only: wrong impl
   that passes (stub returning expected value, test never reaching changed path, check
   reading file executor can write), correct result failing check read literally, or command
   failing as written w/ cwd + output. "Could be stronger" ≠ finding. Manager fixes draft,
   ≤1 follow-up review of changed wording, then freezes. Peer sees only draft + code, never
   executor report; auditor brief carries only frozen block, never peer critique. Cheap
   rounds skip; inspector's `blocked: invalid check` covers them.

   State file + briefs: write/edit via file-edit tool; shell/script string layers drop
   backslashes, backticks. Re-read each saved brief before dispatch. Every brief: worker
   appends each long-lived process it starts (pid, port, command) to `processes.log` in task
   dir (Workflow engine: the round dir, where the script's release agent reads it). Hours-long
   job brief: executor checks between batches that workspaces still whole
   (`git worktree list`, sentinel file); mismatch → stop + report, no rebuild. Evidence from
   another revision (line numbers, patch map) names that revision; executor finds cited code
   by anchor text, not line number.

   Baseline = workspace before its executor ran. Rounds never commit between selves → HEAD
   always wrong reference: would attribute earlier rounds' verified edits + pre-existing user
   changes to this executor. Take as manifest file under task's `.tmp` dir: path + content
   hash for every file under Write scope (incl. outside repo), every untracked file, every
   tracked file w/ uncommitted changes. Git workspace: also pin tracked snapshot: `git stash
   create` (touches neither tree nor index; empty output means clean, use HEAD) +
   `git update-ref refs/long-horizon/<task-slug>/round-<N>-c<index> <sha>` so gc can't prune
   it across sessions. Git ops unavailable → equivalent immutable snapshot + content manifest
   valid. Include relevant ignored generated artifacts explicitly; name unavailable coverage,
   don't call it clean. Record deleted paths. Sizes/mtimes ≠ baseline; hashes are.
   `.claude/skills/long-horizon/scripts/manifest.mjs` builds
   (`<root> <out.json> --ref <ref> [Write scope and ignored paths]`) + diffs
   (`--diff <out.json>`). Workflow engine: the round's baseline agent builds the candidate
   workspaces and takes every baseline as the script's first stage, at the manifest paths +
   ref names already in the Current round block. Agent engine: Manager builds workspaces and
   takes baselines inline before spawning executors.
2. **Execute**: phase `executing`. Workflow engine: call the batch script; executors = stage
   2 of every round. Agent engine: fresh subagent per candidate w/ brief alone, no Manager
   conversation history; angle line per index. Either way record run/agent IDs as soon as
   dispatch returns. Executor does step, reports what changed + how to check. Confirm it
   stopped writing, record status, phase `awaiting-audit`.
3. **Pick** (rounds with several candidates): one inspector per candidate workspace (manifest
   diff + done-check, serial when `Serial candidates: yes`), then the blind panel, then at most
   one grafter in the base. A pick inspection saves the executor's delta (taken before its
   check), the paths the check changed, and a post-check manifest; the audit attributes the
   executor's and the grafter's edits separately from those and judges both. In a serial
   round, a release agent stops every process in the round's `processes.log` after each
   executor, each inspection and the grafter, and the round blocks unless it reports every
   process gone and every port free, so one candidate's server never answers the next
   one's check. Agent engine: same agents, same inputs, Manager holds the
   index-to-angle map and never shows the panel an executor's report. No candidate passes its
   own check → round fails on the base's inspection, audit skipped.
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

After compaction/restart: read state, reconcile workspace + latest user instructions, inspect
recorded workers before touching round. Stop `processes.log` processes whose worker no longer
runs. Confirm old writers finished/stopped before auditing or replacing them. Missing IDs or
lost handles ≠ proof of completion; writer status not established → pause affected work, record
recovery needed. Workflow-engine batch resumes w/ `resumeFromRunId`, same script, same
`args`: finished agents replay from cache → completed executors not rerun. Read run's
`journal.jsonl` before trusting any cached return.

Validate baseline manifests + Git refs in every phase. Recover missing pieces only from trusted
pre-execution artifacts. Execution may have started + recovery fails → keep partial edits,
integrity `suspect`, attribution unavailable. Never replace old baseline w/ current content
or accept round as clean.

Then reconcile phase:
- `planned`: no execution + no work present → finish/rebuild Plan before dispatch. Execution
  may have occurred → keep original baseline, reconcile as interrupted execution.
- `executing` or `awaiting-audit`: once writers stopped + baseline valid, audit existing work;
  don't repeat execution or overwrite its baseline.
- `audited`: integrate only if inspected content + contract version still apply; else
  invalidate affected evidence, re-audit.

Record recovery actions + pending checks before continuing.

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

Either trigger may escalate to cross-vendor supervisor. Manager, executor, auditor all Claude
→ shared blindspots, which is exactly how plateau looks from inside. Codex = different model
family, never saw this session:

```bash
codex login status
```

Logged in, or a `model_provider` gateway set in `config.toml` in `$CODEX_HOME` (default `~/.codex`): one `codex exec` run (custom prompt, no scope selector) carrying contract, audit log,
Dead ends; asks plateau diagnosis + different strategy. Current local preflight, CLI
mechanics, run identity: `codex-review` skill. Answer = opinion: check vs current contract version +
acceptance checks before it rewrites Remaining; drop anything that drifts. Neither, or run
fails: skip; rewrite rules above stand alone.

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
