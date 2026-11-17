---
name: climb-loop
description: "Hill-climb a target round after round: Opus, Sol and Astra rank our UI blind against named reference apps (none → redesign-concepts, build the pick, climb past our own versions) until most judges rank ours first, or a scripted eval climbs to perfect. Use: /climb-loop, 'make our UI beat <app>', 'climb our UI without a reference', 'hill climb this'."
---

# Climb loop

Give the agent a hill it can measure → it climbs. Two hills:

- **Scripted hill** (prefer): program emits a number → push it up. Section 7.
- **Judged hill**: no program can measure it (UI taste) → council of three models ranks captures. Sections 1–6. No reference product → section 8.

Neighbors: `wow-loop` = written quality contract, binary checks, own critics, one model family. `perf-loop` = speed/size targets. This skill = beat named rivals or our own best version, judged by Opus + Sol + Astra, or an eval mined from history.

`$ARGUMENTS`: target (app, screens or eval) plus optional references and round cap. References are optional.

## Stop rules (read first)

- Agree a round cap and a usage budget with the user before the first judge call or eval run; baseline, confirmation and scripted eval runs all count against them. When the round cap or the agreed usage budget is reached, stop, report, and ask the user before any further judge call. Never raise the cap or the budget yourself.
- Before starting, state seat count × planned rounds; every judge call bills the user's subscriptions.
- Judges must not edit anything. Codex judges run with `-s read-only`. The Opus judge is an Agent-tool subagent whose tools are not restricted, so it is read-only only because its brief forbids edits and any tool use beyond reading the listed images; say so in the report.
- Never tell a judge the target, gate, round number, prior ranks, builder notes or which letter is ours.
- Never weaken a check, edit an eval case, or drop a reference to get a pass.
- If Codex is unavailable, say so and stop the judged hill. Never fill a seat with another Claude subagent and call the council cross-vendor.
- If the Opus seat fails or stops mid-loop, say so and ask the user before continuing with Sol and Astra only. Report that gate as "Sol + Astra only" and never call it cross-vendor.
- Reference-product captures stay local in the screenshot folder. Never commit them to the repository.

## Why rank, not score

Absolute 1–10 scores drift. Observed in the source run: in-thread judge called a change 6.5 → 9 while a fresh judge with rival screenshots called it 7 → 7.4; rival screenshots never changed, yet one rival rose 8.3 → 9.1 and the other about 8.6 → 9.0. Speaker's general claim, not shown in the run: one model gives the same screenshot different scores on repeat. Speaker's suspicion, unverified: judges who knew the target scored higher. So: each judge ranks ours against frozen reference captures, per category, blind. References never change → drift = any change in the order of references among themselves (ours removed) between rounds; logged as judge noise. A reference dropping a tier because ours passed it is not drift.

## 1. Council

| Seat | Runs through | Model | Effort |
|---|---|---|---|
| Opus | Agent tool, fresh subagent, `model: "opus"`, reads images with Read | Opus | inherited |
| Sol | `codex exec` (plain, not `review`) | newest Sol, resolved per `codex-review` Step 1 | `high` |
| Astra | `codex exec` (plain) | Astra id from `astra-review` | `medium` |

Sol + Astra share a vendor (OpenAI) → their agreement is weaker evidence than Opus + either. Report says so. User names other models → honor, record.

Preflight, no inference. Codex route: accept a ChatGPT login from `codex login status` or a gateway `model_provider` in `config.toml`, per `codex-review` Step 1; with neither, stop before inference and ask the user to log in. Then `codex --version`, `codex exec --help` shows `-i/--image`, `-s/--sandbox`, `-C/--cd`, `--skip-git-repo-check`, `--ephemeral`, `--output-schema`, `-o`. Do not probe models by spending usage.

**Judge folder.** Per seat per round, make a new empty folder outside the repository (`JUDGE=$(mktemp -d "${TMPDIR:-/tmp}/judge-XXXXXXXX")`). Copy in the filled brief and that seat's captures renamed `<letter>-<view>.png` under that seat's shuffle. Judges see only this folder: no repo, no project name, no slug in any path. Results move to `$RUN` = `.tmp/climb-loop/<slug>/round-<n>/<seat>/` after the call.

Codex judge call. `$MODEL_ID` and `$EFFORT` come from the seat's row in the table. Brief on stdin, so multi-value `-i` cannot swallow it (verified codex-cli 0.166.0). `$SKILL` = absolute path of this skill's folder. Launch in background and poll, per `codex-review` Step 3:

```bash
codex exec -C "$JUDGE" --skip-git-repo-check --ephemeral \
  -m "$MODEL_ID" -c model_reasoning_effort="$EFFORT" -s read-only \
  --output-schema "$SKILL/references/rank.schema.json" \
  -o "$JUDGE/out.json" \
  -i "$JUDGE/A-sidebar-dark.png" -i "$JUDGE/B-sidebar-dark.png" -i "$JUDGE/C-sidebar-dark.png" \
  < "$JUDGE/brief.md" > "$JUDGE/run.log" 2>&1
```

Opus seat: Agent tool, same brief, image paths inside `$JUDGE` only, returns the same JSON as its final message. Orchestrator writes that returned message to `$RUN/out.json` right away; never rely on the subagent's transcript file (came back empty in a live run). Effort: record the one the Agent call set, else "inherited, unverified".

Blinding limits to record: the Opus subagent loads project instructions (`CLAUDE.md`); Codex judges load the user's `config.toml` and run user hooks.

**Valid result.** Codex seat exit 0; Opus seat's Agent call returned a final message. Same parse for every seat: strip one surrounding code fence, `JSON.parse`, check every key and type in the schema, nested ones included (Codex enforces the schema; Opus does not, so check it), match category names trimmed and case-insensitive. Then completeness: every contracted category exactly once; in each ranking every expected letter exactly once, no other letters, no empty tier; defect labels only expected letters; `unreadable_images` empty. A non-empty `caveat` never invalidates a result; report caveats with the tiers. Top tier = `ranking[0]`. A result that fails any of these is invalid for the round and is never counted toward a pass. Other failures: report once, ask before a retry; never swap model or effort silently.

## 2. Contract (once, then frozen)

Write `.tmp/climb-loop/<slug>/contract.md`:

- **References**: 2+ products ours must beat, named by user. If the user named none, offer the section 8 options and wait for a pick before capturing.
- **Views**: viewport and zoom identical for ours and every reference; theme (light and dark) matched where each product offers it. Ours uses one fixed data fixture, and the same route and screen state for a view at every viewport. Record every theme, data or item difference with the references in `contract.md`; the brief tells judges not to rank on them. Name each view.
- **Categories** (edit per product): hierarchy, typography, color and contrast, spacing and density, consistency (labels, radius, icons across surfaces), affordance (controls read as controls), iconography, states (status visible in the captures; focus, hover, empty or error only where a named view captures them). Measured contrast is the scripted floor's job, not the judges'. Every category must be judgeable from the views for every letter: the orchestrator checks this at contract time and drops or narrows any category that fails (example: overlay styling when a reference shows no overlays), recording the decision in `contract.md`.
- **Seat counts a category**: one valid result from that seat with ours in `ranking[0]` of that category. Ties allowed, but a `ranking[0]` that holds every letter never counts.
- **Category passes** in a round: more than half the seats admitted that round count it (1 of 1, 2 of 2, 2 of 3).
- **Round passes**: every category passes.
- **Gate**: a round passes with every council seat admitted, then a confirmation round (section 4) passes on the same commit. Both need a valid result from every council seat; an invalid one fails the round unless the user OKs a retry. Council = Opus, Sol, Astra, or Sol + Astra only after the user agreed to continue without Opus.
- **Strict gate** (user's choice at contract time, recorded): every admitted seat counts every category, ours alone in `ranking[0]` (no ties); replaces Category passes, gate and confirmation unchanged. Rarely reachable: a live-run seat, rerun on identical captures and brief, moved ours' tier in 2 of 10 categories. The gate is chosen once and never loosened mid-run to get a pass.
- **Scripted floor**, after every edit, no judge call: axe-core clean on each view, WCAG AA contrast on text tokens, zero console errors, views outside the edit pixel-stable. If a gating floor check fails, do not run a judge round.
- User names a numeric bar ("9/10") → record it in `state.json` only, translate to the default gate above. A lower bar may relax the gate (top two tiers, fewer categories) only after the user confirms which.

Capture rig: headed Chrome on the real GPU via `launchPlacedChrome()` (`scripts/lib/launch-chrome.mjs`), never headless, never minimized, audio muted. Each parallel agent launches its own instance; an MCP browser is one per session, one driver at a time. Captures go to the screenshot folder the user's instructions name, else `.tmp/climb-loop/<slug>/captures/`. Reference captures taken once in round 0, reused unchanged.

## 3. Judge brief

Template: [references/judge-brief.md](references/judge-brief.md). Per seat per round: reshuffle letter mapping; keep mapping in `state.json`, never in the judge folder.

Blinding limits → record in `contract.md`: recognizable rival chrome, product names or badges in ours ("Demo"), theme differences. Where ours' fixture allows, hide its name and badges in captures.

Brief version: `state.json` records the version each round used. Any mid-run change to the brief's wording (per-round letter, order and path fills excluded), the categories or the schema → new version; changing categories mid-run needs the user's OK as a contract amendment. Admitted seats rerun the baseline (latest baseline captures) under the new version (counts toward cap and budget), then the noise check reruns on them. A new version voids any pending confirmation round and the passed round it would confirm: a round must pass under the new version before its confirmation round. Never compare tiers, gains or drift across versions.

Output: [references/rank.schema.json](references/rank.schema.json). Ranking as tiers, best first; reason; up to 3 defects per letter (view, element, problem, measurable fix). Orchestrator maps letter → ours, keeps ours' defects, keeps rival defects only as rationale.

## 4. Loop

1. **Round 0 (baseline)**: capture all, every council seat judges untouched UI. Record start tiers. Then the **noise check**, one extra call inside round 0 (adds no round; counts toward budget): rerun the first seat in admission order on the round-0 captures, same brief version. Every extra call of a seat in a round gets its own shuffle, judge folder, `$RUN/call-<k>/` and `state.json` mapping. Invalid rerun → report noise not measured. A category moved when the count of letters ranked strictly above ours changed, or whether the seat counts it (section 2, gate in force) flipped; record both. 2+ moved → state it in the report, claim no gain before a passed confirmation round, and offer the user N calls per seat per round: N odd, 3 or more, the first call included. Spend per round grows N-fold: restate seat calls × rounds and agree the budget again. A seat then counts a category when more than half its N calls count it; any invalid call makes the seat's result invalid for the round.
2. **Staged admission** (cost): only Sol judges until every category is counted by at least one admitted seat; then Opus joins; when that holds again with Sol and Opus, Astra joins. Without Opus: Sol, then Astra. Default order Sol, Opus, Astra (the source run's order, Astra in its third seat); user may reorder. The round right after an admission runs on the same commit with no build, and counts toward cap and budget. Meeting that bar while a seat is still waiting only admits the next seat; it never meets the gate.
3. **Build**: one writer, isolated worktree per project rules. Commit each build before the next round; judges only ever see a clean tree at a recorded commit. Before fixing, the builder checks each of ours' cited defects against the DOM or computed styles: measured values replace judge estimates; a defect with no DOM or style value (icon metaphor, hierarchy) is checked against ours' capture instead; one that does not reproduce is dropped and logged; one caused by fixture, demo data or the capture rig goes on the rig and fixture fix list in `state.json`, never into product code. Show the list to the user each round; applying an item needs the user's OK, then re-capture baseline and ours under the new rig or fixture as a new brief version. Fix the confirmed defects ordered by seats citing them, then category where ours ranks lowest. Scripted floor after each edit.
4. **Next round**: new captures of ours, new shuffle, new judge folders, fresh judge contexts. Never reuse a judge thread.
5. **Confirmation round**: after a round that passes with every council seat admitted, run one more round on the same commit with no build in between: new shuffle, new judge folders, fresh judges. Passes → gate met. Fails → back to step 3.
6. **Ratchet**: gate met and change is mergeable → open PR per project rules (its review gate applies). Further climbing (stricter gate, more references, more views) goes on a stacked branch in a new worktree; the mergeable PR stays intact.
7. **User taste** ("too grayscale"): append a named, versioned contract amendment; builder gets it, judges never see it as a goal.
8. Save `state.json` (round, seats admitted, mapping, tiers, caveats, brief version, commit, spend, rig and fixture fix list) after every round.

If two build rounds in a row bring no tier gain in any category, stop, write one sentence on the assumption both rounds shared, and test it before another round. Confirmation rounds do not count toward this; a new brief version restarts the count.

## 5. Report

- PR body (normal prose): history table rounds × seat × category, ours' tier, brief version per round; drift row: changes in reference-only order, ours removed (expected none); noise check result (categories moved on the rerun); gate used (default or strict); caveats seats raised; rig and fixture fix list.
- Per shipped change: annotated before/after (arrow + one line) so the user can see subtle diffs.
- Attribution: seats that ran, observed model/effort per seat (or requested, resolution unverified), rounds where a seat sat out and why (staged, quota, failure), blinding limits, total judge calls.

## 6. Resume

`state.json` exists for `<slug>` → reload contract, mapping history, last commit, brief version, spend, admitted seats, fix list and any pending confirmation round (voided by a new brief version, section 3, or a commit change). Brief template or schema changed since → new brief version (section 3). Commit changed since last round → re-capture ours, rerun admitted seats before building more.

## 7. Scripted climb

Fuzzy problem → eval → climb (skill descriptions, kernel size, MCP or tool text, prompt behavior). Steps: [references/scripted-climb.md](references/scripted-climb.md). No council; the project's normal PR review still applies.

## 8. No reference

User names no rival → suggest this path. Before any image generation or judge call, wait for the user's go, and agree the round cap and usage budget in that same exchange. The go states the concept count (default 10 image calls, plus retries); that spend counts against the budget and goes into `state.json` spend.

1. **Redesign first.** Run `redesign-concepts` on the current UI through `synthesis.md` only. Skip its build-work and contract-amendment paragraph: the climb contract stays frozen, and step 4 builds. A picked concept that needs data or backend the product lacks → user chooses: build that first, or drop it. Never fake its data.
2. **Views.** Set contract views after the pick: screens and states in both the current UI and `synthesis.md`. A state the pick removes gets its replacement under the same view name, written in `contract.md`.
3. **Baseline.** Capture current UI under those views and the section 2 rig, before any build. Frozen for the whole climb. Reuse `redesign-concepts` captures only if they match the views and rig exactly and were taken at the baseline commit.
4. **Build the picked concept(s).** One writer, own commit, scripted floor. Pass the builder `synthesis.md` and the picked concept images by absolute path. That commit = first champion.
5. **Self climb** from it, below.

User declines the redesign, or it cannot run (no Codex login or image tool) → say so, offer self climb from current UI (champion = baseline). User names or supplies references later (products, screenshots) → sections 1–6 instead.

Concept images are builder targets only. Never give one to a judge as a letter: judges would rank render style (mockup vs live capture), not the design.

Self climb keeps sections 1–6 except where [references/self-climb.md](references/self-climb.md) says otherwise (letters, beats, short-circuit, champion, regression, plateau gate, taste, state, report). Read it before round 1.

Source: Theo, "Agents Sucked At UI (Until Today)", 2026-11-03, https://www.youtube.com/watch?v=xq0eB8vxeqk. Figures above are that one run's, not benchmarks.
