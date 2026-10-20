---
name: wow-loop
description: "Use for $wow-loop, wow factor, a target score (\"get it to 8/10\"), or visual work needing reference fidelity or repeated correction, on one deliverable or a set of like items. Skip routine cosmetic edits and discussion of the skill."
---

# Wow loop for Codex

Improve one deliverable, or every item in a set of like items, against a concrete quality
contract through independent review and repair. Take the target from the invocation or
conversation, including any score the user names as the bar (section 2). A request only
to rate or score something, with no improvement asked for, is outside this workflow:
answer it directly or ask whether to run it. Explicit invocation enables this workflow
even for a small artifact. Discussing or editing the skill does not.

Maintain this native Codex skill directly. Arena explores competing approaches; lab
supports human tuning. Neither is required. This workflow owns its resume state without
nesting another orchestration skill.

When recording review evidence or presenting before/after artifacts, read the packaged
[evidence report](references/evidence-report.md) and retain this workflow's acceptance gates.
Carry its applicable evidence requirements into critic briefs.

## 1. Preflight

Inspect the artifact, project requirements, current edits, and exposed tools. Preserve
the requested starting state. Isolate concurrent work when needed; give concurrent servers
separate ports and build directories. Confirm the preview serves the intended checkout.

Independent review requires separate agents. Spawn subagents with `fork_turns: "none"`
and self-contained briefs by default. Critics always start fresh. Use native subagents,
not new sidebar tasks. Honor explicit user model choices; otherwise inherit the configured model. Report an unavailable requested model rather than silently substituting it.
If independent context or a required evidence tool is unavailable, record the affected
check as unavailable and continue useful work without claiming that gate passed.

For visual work, read [visual review](references/visual-review.md), take one real capture
or render, and inspect it before dispatching review rounds. Establish named states and
capture conditions, with fixed seeds where needed and tolerances for rendering variation.
Interactive and animated work also needs a natural run.

Browser rule, copied into every brief that renders or drives a page:
- Launch headed Chrome on the real GPU through the repo's placed-Chrome launcher,
  `launchPlacedChrome()` in `scripts/lib/launch-chrome.mjs`. A headless, minimized, or
  software-rendered run is never evidence for GPU, WebGL, or animation claims. Static
  media may render without it. Each parallel subagent launches its own
  `launchPlacedChrome()` instance; an MCP browser server is shared by the whole
  session, so only one agent at a time may drive it.
- Drive: tie every capture to exactly one action on the right page. Find the app's page by
  a marker in its DOM, such as a `data-*` root; zero hits means the target is unknown:
  print each open page's URL and title, pick from that printout, and record which one.
  Attach to Electron or Chromium apps with `--remote-debugging-port`. Screenshot before and
  after each action that changes structure, and run one such action at a time. Locate
  elements by accessible role, label, or `data-*` attribute; take screen coordinates only
  from a screenshot of the current state. Element references go stale after navigation or
  a DOM change, so look them up again. Keep a list of every process and profile the run
  launches; teardown works from that list and touches nothing else.

## 2. Set the bar

Gather current facts, constraints, baseline evidence, and usable references. Delegate
read-only recon when scope warrants it. One director produces a coherent spec and
`bar.md`; leave implementation judgment within explicit constraints.

Start with 5-10 top-level criteria, expanding only to cover real requirements. Give each
check a stable ID, scope, reference or rationale, state/view, method, pass condition,
tolerance, and acceptance impact. Keep fidelity, visual appeal, function, and performance
distinct. For example, a reference may support "headline is 5x body size at the target
viewport"; "feels premium" gives a critic no checkable condition.

Use exact reference captures or excerpts when available. Without a suitable reference,
derive checks from the user's goal and disclose the comparison limit. Concrete visual
judgment is valid: identify the composition, silhouette, hierarchy, material, or motion
being compared rather than forcing every observation into a number. Prefer a measured
check (foot slide, clipping depth, win rate over fixed seeds) wherever a criterion allows.

Split into modules only when independently reviewable parts help. Record dependencies,
local checks, and whole-deliverable checks. Future integration checks remain pending;
they do not block unrelated local progress.

Items: when the deliverable is a set of like things (49 icons, every skill card, each
page of a deck), write one shared rubric of three to six checks, instantiated per item as
`<check>@<item>`, plus item-specific checks only where an item differs. The item is the
review unit: each gets its own captures and verdicts, never one verdict for the set. The
module stays the writing unit: items that share files (one sprite sheet, one card
component) belong to the same module, which one writer owns. Critics may review items in
batches within capacity. Rank repairs by the check failing on the most items, then the
most failed mandatory checks per item, then severity.

Fix acceptance before implementation. User feedback becomes a versioned amendment with
named checks and affected scope. Clarify ambiguity without weakening the user's bar.

Target score: when the user names a score, settle once, before acceptance is fixed, which
items it covers, that it applies to every item and never the average, and the benchmark it
is judged against, which becomes the bar's reference. Read the number on the user's own
scale. At 90% of the top or higher (9 or 10 of 10, 90 of 100, 5 of 5), or "dial it to
11", it means standard acceptance (section 7). Lower means the user accepts visible
flaws: propose which named checks become nonblocking for this run and why, let the user
confirm, and record a contract amendment with a neutral ID (`relax-1`) that does not
reveal the target. Nothing is inferred from the number alone. If the user cannot be asked,
keep standard acceptance and say so. The user's wording lives only in state, which no
critic or judge receives. The workflow never produces a score of its own; only the final
report quotes the user's wording. A bar stated as standing policy for a kind of work is
offered for the project's durable reference notes at acceptance.

Baseline: when the user named a target score, asked for before/after, or the work is a
set of items, run one review-only pass on the untouched deliverable after acceptance is
fixed and before any writer starts, even when mandatory scripted checks already fail;
record those failures. It records each item's starting check results and findings and
consumes no implementation round. In items mode, compare the failing items against the
budget before the first writer: if the budget cannot plausibly reach them, say so and ask
for more budget, a subset, or a priority order. If no valid baseline can be captured,
label results current-only per the evidence report.

## 3. Checkpoint and resume

Read [state and resume](references/state.md). Before implementation, create
`.tmp/wow-loop/<task-slug>/state.json`, with the spec, bar, and evidence beside it.
The orchestrator alone writes state. Save before dispatch, after implementation and
review, and before yielding. Agents write reports and captures to assigned paths.

Resume by reconciling actual content, evidence, contract amendments, and active workers.
Invalidate affected passes and dependent checks after changes; retain unrelated verified
progress. Select the next ready scope by blockers, severity, and dependencies. Resume
never resets the budget or silently restarts the artifact.

Default budget: 12 implementation-and-review rounds across the entire run, including
initial attempts, any competing candidate writers, and repairs after final review. Reserve a round before dispatching its
writer. Interrupted or failed attempts still count; review-only passes, including the
baseline, do not. In items mode a round is one writer dispatch on one module, however many
items it repairs. Track
critic retries separately and change the evidence method after two consecutive identical
review failures. Honor explicit user limits in place of the default. Exhaustion prevents
new implementation attempts; finish the current review and required read-only acceptance
checks. If further implementation is needed, checkpoint as budget_exhausted and request
a raised budget. Explicit user limits on time or review work still apply.

## 4. Implement and review

Use one implementation writer at a time. Its brief contains the target, current contract,
relevant findings, allowed paths, dependencies, local checks, and the browser rule
when it renders a page. The writer inspects its own captures and runs local checks before returning
changed paths, evidence, and known limits. Stop writes before reviewing that artifact.

Assign separate read-only experience and engineering critics. Adapt engineering checks
to the artifact, such as export integrity for a document. The engineering critic also
checks other items that share the changed files for regressions. Respect exposed concurrency;
serialize browser control or performance measurements that share resources.

Give critics the contract, references, baseline, artifact paths, permitted tools,
capture conditions, the browser rule, and the severity anchors below. Exclude builder
explanations, the user's target score, and previous verdicts from initial assessment.

Severity anchors, copied verbatim into every critic brief:
- blocker: broken, wrong, or reads as something else; fails the goal in normal use.
- major: a flaw a typical user notices in normal use without looking for it.
- minor: a trained eye finds it, or it shows only at an edge state, zoom, or timing.

Critics collect their own captures and run relevant checks. They can write
evidence but cannot edit the deliverable or orchestrator state.

Each critic returns the inspected content/contract versions, per-check passed/failed/
unavailable results, evidence paths, and findings with stable IDs, severity, acceptance
impact, and a concrete observed defect. Record missing coverage and uncertainty.
After initial assessment, reconcile previous findings explicitly; silence does not close
an earlier defect. Measure disputed claims when possible.

## 5. Repair

Resolve findings against the contract and evidence, recording reasons for disputed
verdicts. When the orchestrator disputes a judged mandatory verdict or its severity, or
the writer contests one with evidence, one second fresh experience critic judges that
check from its own captures without seeing the first verdict; the stricter verdict stands
unless a measurement refutes it, and the check is not re-judged again on the same content.
Only the user waives a mandatory finding. Send ranked confirmed findings to the sole
writer. Reproduce defects where possible and verify repairs under the same conditions. A
nonreproducible defect stays unresolved until evidence supports closure.

Rerun failed and affected checks, including the checks of every item in a module whose
shared files changed, preserving unrelated valid passes. After each round, send the user
one update: for the items or modules touched, the before and current captures and the
change in mandatory checks passed and open findings by severity. After the same check
fails twice, record the cause and change approach. After four repair rounds on one module,
reassess strategy and decomposition within the remaining total budget. Never lower the
bar or repeat identical attempts merely to obtain approval.

## 6. Review the whole

After local acceptance, assign a fresh experience critic the complete deliverable and
whole-deliverable contract. Inspect integration, composition, transitions, and the full
intended experience; for a set of items, every item side by side for consistent style,
scale, and treatment. Run applicable integration checks on the same content version.

When comparative visual quality is part of the goal and matched evidence is available,
use two fresh judges. Give them captures or clips labeled only A and B, shuffle order
independently, and keep provenance and the label mapping out of their briefs. Require
a preference or tie with visible reasons tied to criteria. Record recognizable references
that limit blinding. Follow the comparison conditions in the visual review reference.

Resolve disagreement through cited evidence and requirements. Preference votes cannot
establish fidelity or correctness. Record residual taste differences without inventing
a threshold after results arrive or rerunning judges to obtain favorable votes.

## 7. Accept or hand off

The orchestrator reads final reports and key renders, verifies evidence matches the
integrated artifact, and runs remaining required checks or rechecks invalidated results.
Clean up task-owned processes when their work is finished.

Mark `passed` only when every mandatory local and whole check has current passing
evidence, required independent reviews are complete, and no acceptance-blocking finding
remains. Nonblocking suggestions may remain only if they contradict no required check.
In items mode every item must meet this; an item still short is reported with its failing
checks, the cause, and what it would take.

Otherwise record `in_progress`, `blocked`, or `budget_exhausted`, with the exact cause
and next action. Failed, unavailable, and stale required checks prevent acceptance.

After `passed`, offer the user two things and do neither without a yes: promote the
mandatory scripted checks into the project's test runner, so the bar survives once
`.tmp/` is gone, naming the tests and the file they would land in; and commit a scorecard
(reference, rubric, per-item before and after, evidence summary, date) to a path the user
picks, recording a standing bar in the project's reference notes if the user stated one.

Report, leading with one result line ("41 of 49 items meet the bar; 38 failed it at
baseline"). Then: per item or module, mandatory checks passed out of total and open
findings by severity, at baseline and now, with the main fault fixed or the reason it is
still short; the target as the user worded it and the amendment it became, if any; which
checks were scripted and which judged, and that judged checks are judgments; what
changed; verification; residuals; and the absolute state path. A checkpoint
supports later resume after context reset; it schedules nothing. Use a verified runtime
scheduling capability only when the user requests scheduling.

## Anti-patterns

- Do not replace independent review with self-review or visual inspection with code reading.
- Do not accept builder claims or captures that the reviewer did not inspect.
- Do not trust one angle, one animation frame, or modules without whole-deliverable review.
- Do not attach a passing verdict to changed content or missing evidence.
- Do not filter away findings through mismatched severity labels.
- Do not use numeric quality scores or preference votes as acceptance gates.
- Do not ask an agent for a score, tell a critic the user's target, or report a computed score.
- Do not give one verdict for a whole set of items, or an average where the bar applies to each item.
- Do not leave an accepted, machine-checkable bar in `.tmp/` without offering to make it a test.
- Do not weaken criteria, reset attempts on resume, or call budget exhaustion a pass.
