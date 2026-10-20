---
name: wow-loop
description: "Evidence-gated review and repair loop for one deliverable or a set of like items. Use on /wow-loop, requests for wow factor or dial it to 11, a target score to reach (\"get it to 8/10\", \"bring everything under 6 up to 6+\"), or substantial visual work (3D, animation, UI, rendered documents) that needs reference fidelity or repeated visual correction. Skip routine cosmetic edits and discussion of the skill itself."
---

# Wow loop

Improve one deliverable, or every item in a set of like items, until independent critics, working from their own captures and measurements, establish that it meets a written quality contract. State and evidence persist on disk so a later invocation resumes from the weakest module instead of starting over.

Target comes from `$ARGUMENTS` or the conversation, including any score the user names as the bar (section 2, "Target score"). A request only to rate or score something, with no improvement asked for, is outside this loop: answer it directly or ask whether to run the loop. Explicit invocation runs the loop even for a small deliverable; scale agent count to the task. Use `arena` when the solution shape is open, `lab` when the user wants to hand-tune values. Neither is a prerequisite.

When recording review evidence or presenting before/after artifacts, read the packaged
[evidence report](references/evidence-report.md) and retain this workflow's acceptance gates.
Carry its applicable evidence requirements into critic briefs.

## Invariants (hold every round)

- Self-review never establishes acceptance. Reading code never establishes a visual. Every visual verdict comes from a capture the verdict-giver read.
- One writer per file set at a time. Parallel implementers only on modules with disjoint artifact paths and separate build dirs and ports.
- Critics and judges write captures and reports, never the deliverable.
- Verdicts are binary per check and per finding. No numeric quality scores, judged, computed, or reported; they drift upward every round. A score the user names is converted once into the contract (section 2); the loop never produces a score of its own, and only the final report quotes the user's wording.
- Critics and judges never see the user's target score, earlier verdicts before their own assessment, or the builder's hopes.
- Never weaken a check to obtain a pass. User feedback amends the contract as a versioned, named check.
- Every subagent brief that renders or drives a page carries the browser rule, both parts:
  - Launch: headed Chrome on the real GPU through `launchPlacedChrome()` (`scripts/lib/launch-chrome.mjs`). A headless, minimized, or software-rendered run is never evidence for GPU, WebGL, or animation claims. Static media may render without it. Each parallel subagent launches its own `launchPlacedChrome()` instance; `mcp__playwright-iso__*` is one browser shared by the whole session, so only one agent at a time may drive it.
  - Drive: tie every capture to exactly one action on the right page. Find the app's page by a marker in its DOM, such as a `data-*` root; zero hits means the target is unknown: print each open page's URL and title, pick from that printout, and record which one. Attach to Electron or Chromium apps with `--remote-debugging-port`. Screenshot before and after each action that changes structure, and run one such action at a time. Locate elements by accessible role, label, or `data-*` attribute; take screen coordinates only from a screenshot of the current state. Element references go stale after navigation or a DOM change, so look them up again. Keep a list of every process and profile the run launches; teardown works from that list and touches nothing else.
- Inspect exposed agents, model options, and concurrency before dispatch. Honor explicit user model choices; otherwise inherit the configured model. Missing independent context or a required evidence tool is an unavailable gate, never self-review acceptance. Batch fresh critics within capacity and serialize shared browser control and performance measurements.
- Subagents receive the prompt plus relevant project constraints, never this skill or the conversation. Every rule a role needs travels in its brief.
- Save state before each dispatch, after each report, and before yielding.

## 1. Start or resume

Slug: kebab-case from the target name. If `.tmp/wow-loop/<slug>/state.json` exists, resume; if its `task` differs from the current request, ask the user or pick a new slug.

**First run.** Preserve the requested starting state, including dirty and untracked content. Use an isolated task worktree when needed; do not switch to a default branch that omits the user's intended work. Concurrent workstreams get their own ports and build output dirs (`NEXT_DIST_DIR=.next-dev2`); two processes on one build dir corrupt each other. Preflight the capture path: take one real capture of the current artifact and read it. A missing capability (no renderer, no GPU, no capture tool) is recorded as `unavailable` on the checks it blinds and declared to the user now, not discovered in round three.

**Resume.** Recompute every module fingerprint (section 3). Mismatch marks that module's checks, its dependents' checks, and the whole-deliverable checks `stale`; unrelated passes stay. Verify evidence paths still exist; a report whose captures are gone is `stale`. Reconcile with the latest user instructions. Recover partial work before repeating it. Enter at `next_action`, targeting the module with the most acceptance blockers, then highest severity, then dependency order. Do not restart all modules.

`/loop /wow-loop <slug>` re-fires only while this session stays open. Across sessions the state file is the continuity; the user re-invokes with the slug.

Track every process the task starts. Keep review servers alive while critics need them; stop owned processes before yielding and prove the port is free. Never stop processes the task did not start.

## 2. Contract

Recon first: one read-only agent (or the orchestrator, for a small target) gathers exact code excerpts with line refs, live measurements, existing pins, reusable pieces, and the reference material. Nobody downstream works from memory.

One director writes `spec.md` (exact values: dimensions, tokens, timing tables, file layout, module list, risks) and `bar.md`. Two competing directors only when the direction is materially unresolved.

`bar.md` is torn down from one named reference the user, the conversation, or the director supplies: a specific model, page, video, or document. Record the reference identity and store its captures or excerpts under `captures/reference/`. Mechanisms, not adjectives. "Feels premium" is useless; "headline is 5x body size, three type sizes total", "engine glow occupies 12-15% of the rear-view frame", "nothing animates for under 400 ms" are checkable from a capture. If no reference exists, derive checks from the user's goal and say so in `bar.md`.

Each check gets a stable ID and records: requirement; gating or advisory; module or whole; reference or rationale; state, view, or interaction to inspect; method; pass condition with tolerance; dependencies. Method is `scripted` (dimensions, page count, text present, colors, console errors, frame time, triangle count, foot slide, clipping depth, win rate over fixed seeds: anything a script can measure; prefer it wherever a criterion allows) or `judged` (composition, fidelity, motion, taste). Scripted checks go into `check.sh` (or the project's test runner) and run after relevant edits without an additional critic invocation; critics are dispatched only once every gating scripted check passes (advisory scripted failures are recorded, not blocking); the baseline pass is the one exception. The experience critic judges the visual list; the engineering critic independently reruns relevant scripted checks too. Five to twelve checks per module is the working range. Separate reference fidelity, comparative appeal, functional correctness, and performance; a pass in one says nothing about another. Freeze the contract before implementation. Amendments append a version and named checks.

**Target score.** When the user names a score ("get it to 8/10"), settle three things once, before the contract freezes: which items it covers; that it applies to every item, never the average ("get them to 8" means each one); and the benchmark it is judged against, which becomes the `bar.md` reference. Read the number on the user's own scale. At 90% of the top or higher (9 or 10 of 10, 90 of 100, 5 of 5), or "dial it to 11", it means standard acceptance (section 8). Lower means the user accepts visible flaws: propose which named checks become advisory for this run and why, let the user confirm, and record the result as a contract amendment with a neutral ID (`relax-1`) that does not reveal the target. The user's wording lives only in `state.json`, which no critic or judge receives. Nothing is inferred from the number alone. If the user cannot be asked, keep standard acceptance and say so. A bar the user states as standing policy for a kind of work is offered for `/recall save` at acceptance.

**Modules.** Split when parts can be built and reviewed on their own; a compact artifact stays one module. Each module lists its artifact paths (disjoint from other modules), dependencies, and local checks. Always define whole-deliverable checks: composition, integration, transitions, full playback, complete user journey. Passing parts do not establish a coherent whole.

**Items.** When the deliverable is a set of like things (49 icons, every skill card, each page of a deck), write one shared rubric of three to six checks, instantiated per item as `<check>@<item>`, plus item-specific checks only where an item differs. The item is the review unit: each gets its own captures and verdicts, never one verdict for the set. The module stays the writing unit: items that share files (one sprite sheet, one card component) belong to the same module, which one writer owns. Critics may review items in batches within capacity. Rank repair work by the check failing on the most items (a shared cause), then the most failed gating checks per item, then highest severity.

**Medium checks.** Pick what applies:

- 3D: silhouette and proportions from named angles, close-ups of key details, materials and lighting, intersections, seams, scale against the reference.
- Animation: named beats, transitions, continuity, pacing, one complete natural playback. Stills cannot establish motion.
- Interfaces: target viewports, content extremes, interaction states, keyboard path, reduced motion, no-JS where relevant.
- Documents and static graphics: the rendered pages or exports, hierarchy, alignment, legibility, cropping, cross-page continuity.
- Runtime: zero relevant console errors, zero failed resources, frame time measured under recorded conditions (viewport, hardware, workload). Triangle count and draw calls diagnose; frame time gates. Unrelated baseline errors are recorded separately with evidence.

**Baseline.** When the user named a target score, asked for before/after, or the work is a set of items, run one review-only pass (section 5) on the untouched deliverable after the contract freezes and before any writer starts. It runs even when gating scripted checks fail: run `check.sh`, record those failures, and dispatch the critics anyway. It records each item's starting check results and findings and consumes no implementation round. In items mode, compare the failing items against the budget (section 3) before the first writer: if the budget cannot plausibly reach them, say so and ask for more budget, a subset, or a priority order. If no valid baseline can be captured, label results current-only per the evidence report.

## 3. State

`.tmp/wow-loop/<slug>/` holds `state.json`, `spec.md`, `bar.md`, `check.sh`, `captures/<round>/<module>/`, `reports/<round>/<role>.json`. Gitignored, worktree-local: resume in the same worktree and keep that worktree until the loop passes; record its absolute path. The orchestrator alone writes `state.json`; agents write to assigned paths. Write to a temp file and rename (an atomic write) so an interrupted save keeps the last checkpoint.

```json
{
  "task": {"goal": "", "scope": "", "constraints": [], "worktree": ""},
  "contract": {"spec": "spec.md", "bar": "bar.md", "version": 1, "amendments": [], "reference": ""},
  "target": {"user_wording": "", "amendment": "", "standing": false},
  "modules": {"<id>": {"paths": [], "gen_dirs": [], "deps": [], "items": [], "fingerprint": "", "phase": "pending|building|reviewing|passed", "rounds": 0, "checks": []}},
  "checks": {"<id>": {"status": "pending|passed|failed|unavailable|stale", "module": "", "gating": true, "evidence": [], "contract_version": 1}},
  "findings": {"<id>": {"check": "", "module": "", "severity": "blocker|major|minor", "gating": true, "evidence": [], "status": "open|fixed|refuted|waived", "note": ""}},
  "rounds": [{"n": 1, "module": "", "approach": "", "outcome": "", "reports": []}],
  "limits": {"per_module": 4, "total": 12, "used": 0, "user_override": null},
  "outcome": "in_progress|passed|blocked|budget_exhausted",
  "next_action": ""
}
```

Detailed evidence stays in `reports/` and `captures/`; the JSON holds paths and statuses only. Findings history is kept, never overwritten.

**Fingerprint.** Content plus path, over the module's tracked and untracked files and its ignored generated dirs. `git diff` misses staged and untracked; `git ls-files --ignored` filters to ignored-only. Use:

```bash
{ git ls-files -z --cached --others --exclude-standard -- <module paths>; [ -n "<gen_dirs>" ] && find <gen_dirs> -type f -print0 2>/dev/null; } \
| sort -zu | while IFS= read -r -d '' f; do [ -f "$f" ] && printf '%s %s\n' "$f" "$(git hash-object "$f")"; done \
| git hash-object --stdin | cut -c1-12
```

Include relevant configuration, assets, stored reference captures, and rendered outputs in the content manifest, recording missing/deleted paths. Bind runtime captures to the actual served build and capture conditions. The shell pipeline is an example; an equivalent path/content manifest is valid on another runtime.

A bare `find` with no path scans the whole worktree, including this state dir, and would churn every fingerprint; the guard above skips it when `gen_dirs` is empty. Whole-deliverable fingerprint is the hash of the module fingerprints in ID order.

Default budget: 12 implementation-and-review rounds for the whole run, including initial attempts, failed/interrupted attempts, bakeoff candidates, and repairs after final review. Reserve one attempt before each writer starts; review-only passes, including the baseline, do not consume implementation rounds. In items mode a round is one writer dispatch on one module, however many items it repairs, and `per_module` counts those dispatches. Track critic retries separately, and change the evidence method after two consecutive identical review failures. Resume preserves counts. Explicit user round/time/cost/review limits replace defaults and remain binding. At exhaustion, finish the current review and required read-only acceptance checks; checkpoint `budget_exhausted` and request more budget only if further implementation is needed. A budget of zero allows inspection, not implementation.

## 4. Build

One implementer per module, briefed with the contract, the target module, its open findings ranked, allowed paths, `check.sh`, and the local checks. For a small target the orchestrator may implement itself; independence comes from the critics, not the builder. The implementer runs `check.sh` and self-verifies with the capture hook before returning: held-state captures at the named beats or views, one natural run, and it reads its own captures. Its report names changed files, states tested, evidence paths, known limits, remaining work. Treat the report as a claim.

Repairs go to the same implementer via SendMessage (it keeps its context and reproduces cheaper) until a check fails twice on its approach; then a fresh implementer with the recorded cause and a different approach. Stop edits before review; review binds to the fingerprint it inspected, and any later edit marks that review `stale`.

## 5. Critique

Two fresh critics per round, distinct lenses, each briefed to disprove the work. They get the contract, references, baseline, artifact access, capture instructions, the browser rule, the severity anchors, and the required report schema. They do not get builder explanations, the user's target score, or prior verdicts until after their initial assessment; then they get the open findings for explicit resolution checks. A finding not mentioned is not fixed.

Severity anchors, carried verbatim into every critic brief so severity means the same thing every round:

- blocker: broken, wrong, or reads as something else; fails the goal in normal use.
- major: a flaw a typical user notices in normal use without looking for it.
- minor: a trained eye finds it, or it shows only at an edge state, zoom, or timing.

- Experience critic: takes its own captures at every named state, view, and zoom the checks require, plus at least two the contract did not list (another viewport, a later page, an off-axis angle, a mid-transition frame) since defects hide where nobody planned to look, plus a natural run. It passes or fails each judged check from what it sees, comparing against the stored reference captures in the same session.
- Engineering critic: reruns `check.sh`, tests, typecheck, build, console and resource checks, performance measurement under recorded conditions, full diff read for regressions, scope violations, regressions in other items that share the changed files, nondeterminism, accessibility damage, leaked processes. Adapt the lens to the medium (export integrity and link checks for a document).

Report is JSON, parsed by the orchestrator, so no finding is lost to vocabulary drift: `fingerprint`, `contract_version`, `checks: {id: {status: passed|failed|unavailable, evidence: []}}`, `findings: [{id, check, module, item, severity: blocker|major|minor, gating: bool, evidence: [], measurement, reproduction, repair}]`, `resolutions: {prior_id: fixed|open|refuted, with evidence}` for every open finding handed over in the second message, `gaps: []`. A gating finding without an evidence path is returned to the critic, not accepted; so is a report that omits a resolution for any handed-over finding. Measure when a finding could be argued (pixel stats, bounding boxes, timings). Read every capture cited.

## 6. Repair loop

The orchestrator reconciles findings against evidence and contract; disputed findings get a recorded reason, not silent deletion. When the orchestrator disputes a judged gating verdict or its severity, or the implementer contests one with evidence, one second fresh experience critic judges that check from its own captures without seeing the first verdict; the stricter verdict stands unless a measurement refutes it, and the check is not re-judged again on the same fingerprint. Only the user waives a gating finding. Confirmed gating findings, ranked, go to the implementer (section 4). It reproduces each defect before fixing and proves each fix with a fresh capture under the same conditions. Rerun failed checks and every check the fix could affect, including the checks of every item in a module whose shared files changed; keep unrelated passes.

After each round, send the user one update: for the items or modules touched, the before and current captures and the change in gating checks passed and open findings by severity.

Stagnation: the same check failing twice records the observed cause and forces a changed approach (implementation, decomposition, or evidence method), never a lowered bar. Failing a third time may justify a bakeoff within remaining budget and exposed capacity: two fresh implementers in separate worktrees get the same finding, both results are captured under the same rig, and one fresh judge picks between them blind (same product, so blinding holds); the winner's diff lands, the loser's worktree goes. Four rounds on one module is a reassessment checkpoint: rescope, change strategy, or ask the user; it is not a pass and not an automatic stop. Exhausting the total budget blocks new writers, not the last attempt's review or required read-only checks; record unmet checks and `next_action`. A missing capability or external prerequisite yields `blocked`. Identical attempts without new evidence or a changed approach do not run.

## 7. Whole deliverable and blind judging

After every module passes locally, a fresh experience critic takes the complete deliverable and the whole-deliverable checks: full playback for animation, the complete journey for an interface, every rendered page for a document, every item side by side for a set (consistent style, scale, and treatment), composition and integration for a scene. The engineering critic reruns integration and regression checks on the same fingerprint.

When reference fidelity is a goal and comparable evidence exists, two fresh judges each receive matched pairs (ours vs reference, same view, same conditions) labeled only A and B, order shuffled per judge, provenance and prior verdicts withheld, label mapping kept outside their briefs, file names free of any hint. Each judge states a preference or tie per pair, the visible reasons, and the contract criteria involved. A recognizable reference (a famous ship, a well-known site) limits blinding; record that. Preference votes locate unmet requirements; they do not gate on their own, and judges are not rerun to obtain a better vote.

## 8. Accept and report

The orchestrator reads the key captures itself, runs remaining project-required checks and any check invalidated since its last pass, and confirms process cleanup. `passed` requires: every gating check `passed` on the current fingerprint and contract version; both critic lenses and the whole-deliverable pass complete; no open gating finding; evidence paths present. Advisory findings may remain and are named. Any gating check `failed`, `unavailable`, or `stale` blocks acceptance. In items mode every item must meet this; an item still short is reported with its failing checks, the cause, and what it would take.

**Lock it in.** After `passed`, offer the user two things and do neither without a yes. First, promote the gating scripted checks from `check.sh` into the project's test runner, so the bar survives once `.tmp/` is gone; name the tests and the file they would land in. Second, commit a scorecard (reference, rubric, per-item before and after, evidence summary, date) to a path the user picks, and, if the user stated the bar as standing policy, record it with `/recall save`.

Report, leading with one result line ("41 of 49 items meet the bar; 38 failed it at baseline"). Then: per item or module, gating checks passed out of total and open findings by severity, at baseline and now, with the main fault fixed or the reason it is still short; the target as the user worded it and the amendment it became, if any; which checks were scripted and which judged, and that judged checks are judgments; what changed; remaining findings with causes; before/after evidence per the evidence report; the state path; and the exact next action if unfinished.

## Role briefs (what each dispatch must contain)

- Director: recon output, reference identity, user goal, item list if any; returns `spec.md` and `bar.md` per section 2.
- Implementer: contract, module, its items, allowed paths, ranked findings, local checks, capture hook, browser rule; returns the section 4 report.
- Critic: contract, references, baseline captures, artifact access, capture instructions, browser rule, severity anchors, report schema, lens; never the user's target score; returns the section 5 report. Open findings arrive as a second message.
- Judge: pairs labeled A and B only, the contract criteria list, browser rule if it must render; returns preference, reasons, criteria per pair.

## Anti-patterns

- Ending because the work looks done, rather than because critics armed with captures failed to break it.
- Any agent claiming a visual it did not read, or verifying a visual claim from code.
- Turning a user's score into a number anywhere in the loop: asking an agent for one, telling a critic the target, or reporting a computed one.
- One verdict for a whole set of items, or an average where the bar applies to each item.
- Parallel writers on shared paths or shared build dirs.
- One capture angle. Vary viewpoint, zoom, viewport, pointer, scroll, timing.
- Comparing against a memory of the reference instead of its stored captures in the same session.
- Fixing without reproducing, or closing a finding without a fresh capture.
- Marking a module passed while its dependents or the whole-deliverable checks are stale.
- Leaving an accepted, machine-checkable bar in `.tmp/` without offering to make it a test.
- Hiding residuals. Name them with causes.
