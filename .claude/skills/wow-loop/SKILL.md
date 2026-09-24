---
name: wow-loop
description: "Evidence-gated review and repair loop for one deliverable. Use on /wow-loop, requests for wow factor or dial it to 11, or substantial visual work (3D, animation, UI, rendered documents) that needs reference fidelity or repeated visual correction. Skip routine cosmetic edits and discussion of the skill itself."
---

# Wow loop

Improve one deliverable until independent critics, working from their own captures and measurements, establish that it meets a written quality contract. State and evidence persist on disk so a later invocation resumes from the weakest module instead of starting over.

Target comes from `$ARGUMENTS` or the conversation. Explicit invocation runs the loop even for a small deliverable; scale agent count to the task. Use `arena` when the solution shape is open, `lab` when the user wants to hand-tune values. Neither is a prerequisite.

When recording review evidence or presenting before/after artifacts, read the packaged
[evidence report](references/evidence-report.md) and retain this workflow's acceptance gates.
Carry its applicable evidence requirements into critic briefs.

## Invariants (hold every round)

- Self-review never establishes acceptance. Reading code never establishes a visual. Every visual verdict comes from a capture the verdict-giver read.
- One writer per file set at a time. Parallel implementers only on modules with disjoint artifact paths and separate build dirs and ports.
- Critics and judges write captures and reports, never the deliverable.
- Verdicts are binary per check and per finding. No numeric quality scores; they drift upward every round.
- Never weaken a check to obtain a pass. User feedback amends the contract as a versioned, named check.
- Every subagent brief that renders or drives a page carries the browser rule, both parts:
  - Launch: headed Chrome on the real GPU through `launchPlacedChrome()` (`scripts/lib/launch-chrome.mjs`). A headless, minimized, or software-rendered run is never evidence for GPU, WebGL, or animation claims. Static media may render without it. Each session owns one browser; parallel or subagent browser work uses isolated profiles through `mcp__playwright-iso__*` when exposed, else its own `launchPlacedChrome()` instance.
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

Each check gets a stable ID and records: requirement; gating or advisory; module or whole; reference or rationale; state, view, or interaction to inspect; method; pass condition with tolerance; dependencies. Method is `scripted` (dimensions, page count, text present, colors, console errors, frame time, triangle count: anything a script can measure) or `judged` (composition, fidelity, motion, taste). Scripted checks go into `check.sh` (or the project's test runner) and run after relevant edits without an additional critic invocation; critics are dispatched only once every gating scripted check passes (advisory scripted failures are recorded, not blocking). The experience critic judges the visual list; the engineering critic independently reruns relevant scripted checks too. Five to twelve checks per module is the working range. Separate reference fidelity, comparative appeal, functional correctness, and performance; a pass in one says nothing about another. Freeze the contract before implementation. Amendments append a version and named checks.

**Modules.** Split when parts can be built and reviewed on their own; a compact artifact stays one module. Each module lists its artifact paths (disjoint from other modules), dependencies, and local checks. Always define whole-deliverable checks: composition, integration, transitions, full playback, complete user journey. Passing parts do not establish a coherent whole.

**Medium checks.** Pick what applies:

- 3D: silhouette and proportions from named angles, close-ups of key details, materials and lighting, intersections, seams, scale against the reference.
- Animation: named beats, transitions, continuity, pacing, one complete natural playback. Stills cannot establish motion.
- Interfaces: target viewports, content extremes, interaction states, keyboard path, reduced motion, no-JS where relevant.
- Documents and static graphics: the rendered pages or exports, hierarchy, alignment, legibility, cropping, cross-page continuity.
- Runtime: zero relevant console errors, zero failed resources, frame time measured under recorded conditions (viewport, hardware, workload). Triangle count and draw calls diagnose; frame time gates. Unrelated baseline errors are recorded separately with evidence.

## 3. State

`.tmp/wow-loop/<slug>/` holds `state.json`, `spec.md`, `bar.md`, `check.sh`, `captures/<round>/<module>/`, `reports/<round>/<role>.json`. Gitignored, worktree-local: resume in the same worktree and keep that worktree until the loop passes; record its absolute path. The orchestrator alone writes `state.json`; agents write to assigned paths. Write to a temp file and rename so an interrupted save keeps the last checkpoint.

```json
{
  "task": {"goal": "", "scope": "", "constraints": [], "worktree": ""},
  "contract": {"spec": "spec.md", "bar": "bar.md", "version": 1, "amendments": [], "reference": ""},
  "modules": {"<id>": {"paths": [], "gen_dirs": [], "deps": [], "fingerprint": "", "phase": "pending|building|reviewing|passed", "rounds": 0, "checks": []}},
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

Default budget: 12 implementation-and-review rounds for the whole run, including initial attempts, failed/interrupted attempts, bakeoff candidates, and repairs after final review. Reserve one attempt before each writer starts; review-only passes do not consume implementation rounds. Track critic retries separately, and change the evidence method after two consecutive identical review failures. Resume preserves counts. Explicit user round/time/cost/review limits replace defaults and remain binding. At exhaustion, finish the current review and required read-only acceptance checks; checkpoint `budget_exhausted` and request more budget only if further implementation is needed. A budget of zero allows inspection, not implementation.

## 4. Build

One implementer per module, briefed with the contract, the target module, its open findings ranked, allowed paths, `check.sh`, and the local checks. For a small target the orchestrator may implement itself; independence comes from the critics, not the builder. The implementer runs `check.sh` and self-verifies with the capture hook before returning: held-state captures at the named beats or views, one natural run, and it reads its own captures. Its report names changed files, states tested, evidence paths, known limits, remaining work. Treat the report as a claim.

Repairs go to the same implementer via SendMessage (it keeps its context and reproduces cheaper) until a check fails twice on its approach; then a fresh implementer with the recorded cause and a different approach. Stop edits before review; review binds to the fingerprint it inspected, and any later edit marks that review `stale`.

## 5. Critique

Two fresh critics per round, distinct lenses, each briefed to disprove the work. They get the contract, references, baseline, artifact access, capture instructions, the browser rule, and the required report schema. They do not get builder explanations or prior verdicts until after their initial assessment; then they get the open findings for explicit resolution checks. A finding not mentioned is not fixed.

- Experience critic: takes its own captures at every named state, view, and zoom the checks require, plus at least two the contract did not list (another viewport, a later page, an off-axis angle, a mid-transition frame) since defects hide where nobody planned to look, plus a natural run. It passes or fails each judged check from what it sees, comparing against the stored reference captures in the same session.
- Engineering critic: reruns `check.sh`, tests, typecheck, build, console and resource checks, performance measurement under recorded conditions, full diff read for regressions, scope violations, nondeterminism, accessibility damage, leaked processes. Adapt the lens to the medium (export integrity and link checks for a document).

Report is JSON, parsed by the orchestrator, so no finding is lost to vocabulary drift: `fingerprint`, `contract_version`, `checks: {id: {status: passed|failed|unavailable, evidence: []}}`, `findings: [{id, check, module, severity: blocker|major|minor, gating: bool, evidence: [], reproduction, repair}]`, `resolutions: {prior_id: fixed|open|refuted, with evidence}` for every open finding handed over in the second message, `gaps: []`. A gating finding without an evidence path is returned to the critic, not accepted; so is a report that omits a resolution for any handed-over finding. Measure when a finding could be argued (pixel stats, bounding boxes, timings). Read every capture cited.

## 6. Repair loop

The orchestrator reconciles findings against evidence and contract; disputed findings get a recorded reason, not silent deletion. Confirmed gating findings, ranked, go to the implementer (section 4). It reproduces each defect before fixing and proves each fix with a fresh capture under the same conditions. Rerun failed checks and every check the fix could affect; keep unrelated passes.

Stagnation: the same check failing twice records the observed cause and forces a changed approach (implementation, decomposition, or evidence method), never a lowered bar. Failing a third time may justify a bakeoff within remaining budget and exposed capacity: two fresh implementers in separate worktrees get the same finding, both results are captured under the same rig, and one fresh judge picks between them blind (same product, so blinding holds); the winner's diff lands, the loser's worktree goes. Four rounds on one module is a reassessment checkpoint: rescope, change strategy, or ask the user; it is not a pass and not an automatic stop. Exhausting the total budget blocks new writers, not the last attempt's review or required read-only checks; record unmet checks and `next_action`. A missing capability or external prerequisite yields `blocked`. Identical attempts without new evidence or a changed approach do not run.

## 7. Whole deliverable and blind judging

After every module passes locally, a fresh experience critic takes the complete deliverable and the whole-deliverable checks: full playback for animation, the complete journey for an interface, every rendered page for a document, composition and integration for a scene. The engineering critic reruns integration and regression checks on the same fingerprint.

When reference fidelity is a goal and comparable evidence exists, two fresh judges each receive matched pairs (ours vs reference, same view, same conditions) labeled only A and B, order shuffled per judge, provenance and prior verdicts withheld, label mapping kept outside their briefs, file names free of any hint. Each judge states a preference or tie per pair, the visible reasons, and the contract criteria involved. A recognizable reference (a famous ship, a well-known site) limits blinding; record that. Preference votes locate unmet requirements; they do not gate on their own, and judges are not rerun to obtain a better vote.

## 8. Accept and report

The orchestrator reads the key captures itself, runs remaining project-required checks and any check invalidated since its last pass, and confirms process cleanup. `passed` requires: every gating check `passed` on the current fingerprint and contract version; both critic lenses and the whole-deliverable pass complete; no open gating finding; evidence paths present. Advisory findings may remain and are named. Any gating check `failed`, `unavailable`, or `stale` blocks acceptance.

Report: outcome, what changed, the evidence behind acceptance, remaining findings with causes, the state path, and the exact next action if unfinished.

## Role briefs (what each dispatch must contain)

- Director: recon output, reference identity, user goal; returns `spec.md` and `bar.md` per section 2.
- Implementer: contract, module, allowed paths, ranked findings, local checks, capture hook, browser rule; returns the section 4 report.
- Critic: contract, references, baseline captures, artifact access, capture instructions, browser rule, report schema, lens; returns the section 5 report. Open findings arrive as a second message.
- Judge: pairs labeled A and B only, the contract criteria list, browser rule if it must render; returns preference, reasons, criteria per pair.

## Anti-patterns

- Ending because the work looks done, rather than because critics armed with captures failed to break it.
- Any agent claiming a visual it did not read, or verifying a visual claim from code.
- Parallel writers on shared paths or shared build dirs.
- One capture angle. Vary viewpoint, zoom, viewport, pointer, scroll, timing.
- Comparing against a memory of the reference instead of its stored captures in the same session.
- Fixing without reproducing, or closing a finding without a fresh capture.
- Marking a module passed while its dependents or the whole-deliverable checks are stale.
- Hiding residuals. Name them with causes.
