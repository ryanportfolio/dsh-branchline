# Workflow batch script

Script rules, the batch script template, and what to do with its return. Read before writing `args` or calling Workflow for a batch.

Script gives: spawned agents never inherit Manager history (boundary by construction);
`schema` forces verdicts into enums, not prose; run persists script + journal of every
agent's exact input/return value (provenance state file can't give); `resumeFromRunId`
replays every finished agent of the batch from cache after crash, no rerun.

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
