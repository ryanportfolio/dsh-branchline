---
description: 'Use for work too big for one context window: long multi-step tasks, progress lost to compaction or failed retries, work spanning hours or sessions, or when the user says /long-horizon or asks to run a task in verified rounds.'
---

# long-horizon: run big tasks in audited rounds

Manager, Executor, Auditor. You (this context) are the Manager: hold the goal, keep the state
file true, and delegate every round. Executors and auditors are fresh subagents; a fresh context
per round separates implementation from independent evidence. Discussing or editing this skill does not activate it.

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
1. <step sized for one fresh context>

# Current round  (scope and checks fixed at Plan, except for explicit user amendments)
Round: <N>   Phase: planned | executing | awaiting-audit | audited
Contract version: <version used for this round>
Workers: <agent/process IDs, role, last observed status; update as workers start or stop>
Step: <the one Remaining step this round works>
Done-check: <commands, cwd, and the expected result; the auditor runs them itself>
Write scope: <paths the executor may change; test and gate definitions only if the step is about them>
Baseline: <manifest path> + <git ref>  (see Plan; the auditor diffs against this, never HEAD)
Auditor brief: <path>  (written at Plan, dispatched byte for byte)
Residue: <paths a failed earlier round left changed, and whether they were reverted or kept>

# Dead ends  (approaches that failed audit; do not retry without new evidence)
- <approach>: <why it failed, one line>

# Audit log
- round N: <step> — <status>/<integrity>/<contract>, <one-line evidence>
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
block and the workspace root, saved to the path recorded in the block, and dispatched unchanged. A Manager
that wants to add something after Execute has found a defect in the Plan, not in the brief;
it goes into the next round, except for an explicit user amendment handled as above.
Provenance is checkable; "do not paraphrase" is not.

Inspect exposed tools and capacity before dispatch. Use fresh context and never
`subagent_type: fork` or an option that inherits Manager history for an auditor. If fresh
independent context is unavailable, record the gap; inherited context or self-review cannot
establish the audit gate. Continue useful authorized work that does not depend on it.
Count Manager and other active workers against capacity; sequential fresh rounds are valid.

The workspace belongs to the executor for the duration of a round. Edits from anyone else
between Baseline and Audit make attribution impossible; the auditor reports integrity
`suspect` rather than guessing whose change it was.

## Round loop

1. **Plan** — read the state file, pick ONE remaining step, and write the Current round block
   into the state file, phase `planned`, before anything is spawned. Then take the Baseline,
   write the auditor brief to its recorded path, and write the executor brief: contract
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
   too. Sizes and mtimes are not a baseline; hashes are.
2. **Execute** — set phase `executing`, spawn a fresh subagent with the brief alone and no
   Manager conversation history. Record its agent/process ID as soon as dispatch returns.
   It does the step and reports what changed and how to check it. Confirm it has stopped
   writing, record its status, and set phase `awaiting-audit`.
3. **Audit** — confirm all writers to the scope have finished or stopped, then spawn a
   second fresh subagent with the prewritten auditor brief and nothing else. Record its ID.
   It works in this order, because its own done-check run writes files too:
   1. Rebuild the manifest now and diff it against the Baseline (added, modified, deleted),
      plus `git diff <ref> --stat` for tracked files. This delta is the executor's work.
   2. Run the done-check from the recorded cwd and compare with the expected result.
   3. Return three verdicts with evidence:
   - status: complete / incomplete / blocked, from its own run of the done-check. Evidence
     it did not produce this round counts only if it fetched it itself from an authenticated
     source (a CI run by URL, a receipt from the external system); executor-produced logs and
     test output are claims. If the check itself is broken, say `blocked: invalid check`, which
     is a Plan defect, not a Dead end. On `incomplete`, add `repairable: yes` or
     `repairable: no` with the diagnostic from the auditor's own done-check run. Yes means a
     mechanical fault the approach survives (build error, missing dependency, harness or
     resource failure); no means the approach itself failed. A diagnostic that exists only in
     the executor's report is a claim and does not make a step repairable.
   - integrity: clean / suspect / violation — clean only when the step-1 delta touches nothing
     outside Write scope and every artifact the step promised exists. A delta that reaches
     test or gate definitions the step did not own is `suspect` at best: a passing check
     proves nothing if the executor could edit the check. Unclear evidence = suspect
   - contract: aligned / drifted, with the inspected contract version and acceptance checks
   The executor's report is a claim; the auditor's inspection is the evidence. Only
   complete + clean + aligned enters Verified progress. Set phase `audited`.
4. **Integrate** — pass: move the step into Verified progress with the auditor's evidence and
   the round's brief path and baseline ref, so the round can be re-examined later. Fail:
   Preserve unaffected Verified progress and mark affected claims stale; append the audit
   findings, record the delta's paths under Residue with a decision to revert or keep each,
   and schedule the next round by the auditor's `repairable` verdict. `yes`: one recovery
   round on the same approach, its brief carrying the auditor's diagnostic, counted as the
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

- Same step fails audit twice in a row → the next brief must change approach, not retry the
  old one. Move the failed approach to Dead ends first.
- Three rounds with nothing new entering Verified progress → stop spawning and rewrite
  Remaining. The decomposition itself is the suspect, not the executor. Preserve consumed
  attempts; a new decomposition does not reset a user budget.

Count both triggers from the Audit log, never from memory; a recovery round is an attempt.
A rewrite of Remaining may route the stuck step through `arena` (parallel candidates, pick,
graft), and arena then runs inside the executor subagent: the Manager never reads candidates,
picks or grafts, and the auditor sees only the workspace result. Candidates need the state
file's Contract and Dead ends copied in, and a worktree starts from HEAD, so use `.tmp/arena-*`
copies or commit a WIP first; otherwise earlier rounds' uncommitted edits are lost.

Either trigger optionally escalates to a cross-vendor supervisor. Manager, executor, and
auditor are all Claude, so they share blindspots, and a shared blindspot is exactly what a
plateau looks like from the inside. Codex is a different model family that never saw this
session:

```bash
codex login status
```

Logged in → one `codex exec` run (custom prompt, no scope selector) carrying the contract, the
audit log, and Dead ends, asking for a plateau diagnosis and a different strategy. See the
`codex-review` skill for current local preflight, CLI mechanics, and run identity. Its answer is
an opinion: check the proposal against the current contract version and acceptance checks
before it rewrites Remaining, and drop anything that drifts. Not logged in or the run fails → skip it, the rewrite
rules above stand on their own.

One consult per trigger. Each run bills the user's Codex subscription, which is why this hangs
off a stagnation trigger instead of running every round.

## Completion

Per-round verdicts prove each step against the workspace as it was then; a later round can
regress an earlier one. So before reporting, spawn one last fresh auditor with the current
contract, its amendments, and the workspace root. Have it run every current acceptance check
against the final workspace. Anything that fails moves back to Remaining.

Then answer from Verified progress alone. Unfinished is a valid report: state what is verified
and what remains, including missing independent checks. Bind final evidence to the
inspected revision and content manifest; later relevant changes require revalidation.

## Guardrails

- Honor explicit user model choices and required quality floors. Otherwise inherit the
  configured session model. Check actual exposure before dispatch; if a requested model or
  floor is unavailable, disclose it rather than silently downgrading or claiming it ran.
- Size each step so one fresh context finishes it: one slice, one migration, one bug.
- Audit independence is the point — verdicts come from the auditor's own inspection in a
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
