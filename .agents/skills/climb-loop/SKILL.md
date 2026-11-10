---
name: climb-loop
description: "Hill-climb a target round after round: Opus, Sol and Astra rank our UI blind against named reference apps (none → redesign-concepts, build the pick, climb past our own versions) until all rank ours first, or a scripted eval climbs to perfect. Use: 'make our UI beat <app>', 'climb our UI without a reference', 'hill climb this'."
---

# Climb loop for Codex

Give the agent a hill it can measure → it climbs. Two hills:

- **Scripted hill** (prefer): program emits a number → push it up. Section 7.
- **Judged hill**: no program can measure it (UI taste) → council of three models ranks captures. Sections 1–6. No reference product → section 8.

Neighbors: `$wow-loop` = written quality contract, binary checks, own critics. `$perf-loop` = speed/size targets. This skill = beat named rivals or our own best version, judged by Opus + Sol + Astra, or an eval mined from history.

Invocation input: target (app, screens or eval) plus optional references and round cap. References are optional. Discussing or editing this skill does not start it.

## Stop rules (read first)

- Agree a round cap and a usage budget with the user before the first judge call or eval run; baseline, confirmation and scripted eval runs all count against them. When the round cap or the agreed usage budget is reached, stop, report, and ask the user before any further judge call. Never raise the cap or the budget yourself.
- Before starting, state seat count × planned rounds; every judge call bills the user's subscriptions.
- Judges must not edit anything. Codex judges run with `-s read-only`. The Opus judge runs with `--tools "Read"`, `--restricted` and `--permission-mode plan`, and its brief forbids edits.
- Never tell a judge the target, gate, round number, prior ranks, builder notes or which letter is ours.
- Never weaken a check, edit an eval case, or drop a reference to get a pass.
- If the Opus seat preflight fails or Opus stops mid-loop, say so and ask the user before continuing with Sol and Astra only. A council without Opus shares this session's vendor; report its gate as "Sol + Astra only" and never call it cross-vendor.
- Reference-product captures stay local in the screenshot folder. Never commit them to the repository.

## Why rank, not score

Absolute 1–10 scores drift. Observed in the source run: in-thread judge called a change 6.5 → 9 while a fresh judge with rival screenshots called it 7 → 7.4; rival screenshots never changed, yet one rival rose 8.3 → 9.1 and the other about 8.6 → 9.0. Speaker's general claim, not shown in the run: one model gives the same screenshot different scores on repeat. Speaker's suspicion, unverified: judges who knew the target scored higher. So: each judge ranks ours against frozen reference captures, per category, blind. References never change → drift = any change in the order of references among themselves (ours removed) between rounds; logged as judge noise. A reference dropping a tier because ours passed it is not drift.

## 1. Council

| Seat | Runs through | Model | Effort |
|---|---|---|---|
| Opus | `claude -p` child process, Claude subscription | `opus` alias | `high` |
| Sol | `codex exec` child process (plain, not `review`) | newest Sol, resolved per `$codex-review` | `high` |
| Astra | `codex exec` child process (plain) | Astra id from `$astra-review` | `medium` |

From Codex, Sol and Astra share this session's vendor; each child is still a fresh context. Opus is the only cross-vendor seat. Report says so. User names other models → honor, record.

Preflight, no inference:

- Codex route: accept a ChatGPT login from `codex login status` or a gateway `model_provider` in `config.toml`, per `$codex-review`; with neither, stop before inference and ask the user to log in.
- `codex --version`, `codex exec --help` shows `-i/--image`, `-s/--sandbox`, `-C/--cd`, `--skip-git-repo-check`, `--ephemeral`, `--output-schema`, `-o`.
- Opus seat: run the fail-closed preflight from `$claude-review` section 1 (subscription route proven, no API or provider variables), and also require `ANTHROPIC_DEFAULT_OPUS_MODEL` to be absent from the child environment (check presence only, never print the value). Stop the Opus seat if any check fails. Never accept or enable paid credits for the user.
- Do not probe models by spending usage.

**Judge folder.** Per seat per round, make a new empty folder outside the repository (`JUDGE=$(mktemp -d "${TMPDIR:-/tmp}/judge-XXXXXXXX")`; on Windows a GUID-named folder under `%TEMP%`). Copy in the filled brief and that seat's captures renamed `<letter>-<view>.png` under that seat's shuffle. Judges see only this folder: no repo, no project name, no slug in any path. Results move to `$RUN` = `.tmp/climb-loop/<slug>/round-<n>/<seat>/` after the call. User-level instructions still load in each child; record that as a blinding limit.

Commands below are POSIX. PowerShell does not support `<` input redirection: on native Windows, launch each judge through a Node launcher that writes the brief to the spawned child's stdin (as `$opus-fullreview` does) and redirects its output to the judge folder. Launch every judge in the background and poll, per `$codex-review`. `$SKILL` = absolute path of this skill's folder.

Codex judge call. `$MODEL_ID` and `$EFFORT` come from the seat's row in the table. Brief on stdin, so multi-value `-i` cannot swallow it (verified codex-cli 0.166.0):

```bash
codex exec -C "$JUDGE" --skip-git-repo-check --ephemeral \
  -m "$MODEL_ID" -c model_reasoning_effort="$EFFORT" -s read-only \
  --output-schema "$SKILL/references/rank.schema.json" \
  -o "$JUDGE/out.json" \
  -i "$JUDGE/A-sidebar-dark.png" -i "$JUDGE/B-sidebar-dark.png" -i "$JUDGE/C-sidebar-dark.png" \
  < "$JUDGE/brief.md" > "$JUDGE/run.log" 2>&1
```

Opus judge call. Runs from the judge folder: `--restricted` confines file tools to working directories, so the captures must sit there. Brief lists images as paths inside `$JUDGE`:

```bash
cd "$JUDGE" && claude -p --model opus --effort high \
  --permission-mode plan --permission-prompts none --restricted \
  --tools "Read" --disable-slash-commands --strict-mcp-config \
  --no-session-persistence --no-chrome --output-format json \
  < brief.md > result.json 2> opus.log
```

Judge JSON = `result.json` `.result` text; `is_error` must be false. Attribute the model from `modelUsage`; if absent, mark the seat "requested opus, resolution unverified". A billing prompt or plan-limit message stops the Opus seat.

**Valid result.** Exit 0, then `JSON.parse` succeeds and the object has the schema's keys (Codex enforces the schema; Opus does not, so check it). Then completeness: every contracted category exactly once; in each ranking every expected letter exactly once, no other letters, no empty tier; defect labels only expected letters; `gaps` empty. Top tier = `ranking[0]`. A result that fails any of these is invalid for the round and is never counted as a pass. Other failures: report once, ask before a retry; never swap model or effort silently.

## 2. Contract (once, then frozen)

Write `.tmp/climb-loop/<slug>/contract.md`:

- **References**: 2+ products ours must beat, named by user. If the user named none, offer the section 8 options and wait for a pick before capturing.
- **Views**: states captured identically for ours and every reference: viewport, theme (light and dark), data fixture, zoom. Name each view.
- **Categories** (edit per product): hierarchy, typography, color and contrast, spacing and density, consistency (labels, radius, icons across surfaces), affordance (controls read as controls), iconography, states (focus, hover, empty, error).
- **Seat pass**: one valid result from one seat with ours alone in `ranking[0]` of every category.
- **Gate**: every seat in the council passes in the same round, then all pass again in a confirmation round (section 4) on the same commit. Council = Opus, Sol, Astra, or Sol + Astra only after the user agreed to continue without Opus.
- **Scripted floor**, after every edit, no judge call: axe-core clean on each view, WCAG AA contrast on text tokens, zero console errors, views outside the edit pixel-stable. If a gating floor check fails, do not run a judge round.
- User names a numeric bar ("9/10") → record it in `state.json` only, translate to the gate above. A lower bar may relax the gate (top two tiers, fewer categories) only after the user confirms which.

Capture rig: headed Chrome on the real GPU via `launchPlacedChrome()` (`scripts/lib/launch-chrome.mjs`), never headless, never minimized, audio muted. Each parallel agent launches its own instance; an MCP browser server is shared by the whole session, one driver at a time. Captures go to the screenshot folder the user's instructions name, else `.tmp/climb-loop/<slug>/captures/`. Reference captures taken once in round 0, reused unchanged. Browser launches and the local server need process and network approval; without a browser, say the judged hill cannot run rather than judging from code.

## 3. Judge brief

Template: [references/judge-brief.md](references/judge-brief.md). Per seat per round: reshuffle letter mapping; keep mapping in `state.json`, never in the judge folder. Recognizable rival chrome limits blinding → record it.

Output: [references/rank.schema.json](references/rank.schema.json). Ranking as tiers, best first; reason; up to 3 defects per letter (view, element, problem, measurable fix). Orchestrator maps letter → ours, keeps ours' defects, keeps rival defects only as rationale.

## 4. Loop

1. **Round 0 (baseline)**: capture all, every council seat judges untouched UI. Record start tiers.
2. **Staged admission** (cost): only Sol judges until Sol passes; then Opus joins; when Opus passes, Astra joins. Without Opus: Sol, then Astra. Default order is the source run's (Astra in its third seat); user may reorder. A pass while a seat is still waiting only admits the next seat; it never meets the gate.
3. **Build**: one writer, isolated worktree per `AGENTS.md`. Commit each build before the next round; judges only ever see a clean tree at a recorded commit. Fix ours' defects ordered by seats citing them, then category where ours ranks lowest. Scripted floor after each edit.
4. **Next round**: new captures of ours, new shuffle, new judge folders, fresh judge processes. Never resume a judge session.
5. **Confirmation round**: after a round where every council seat passes, run one more round on the same commit with no build in between: new shuffle, new judge folders, fresh judges. All pass → gate met. Any seat fails → back to step 3.
6. **Ratchet**: gate met and change is mergeable → open PR per `AGENTS.md` (its review gate applies). Further climbing (stricter gate, more references, more views) goes on a stacked branch in a new worktree; the mergeable PR stays intact.
7. **User taste** ("too grayscale"): append a named, versioned contract amendment; builder gets it, judges never see it as a goal.
8. Save `state.json` (round, seats admitted, mapping, tiers, commit, spend) after every round.

If two build rounds in a row bring no tier gain in any category, stop, write one sentence on the assumption both rounds shared, and test it before another round. Confirmation rounds do not count toward this.

## 5. Report

- PR body (normal prose): history table rounds × seat × category, ours' tier; drift row: changes in reference-only order, ours removed (expected none).
- Per shipped change: annotated before/after (arrow + one line) so the user can see subtle diffs.
- Attribution: seats that ran, observed model/effort per seat (or requested, resolution unverified), rounds where a seat sat out and why (staged, quota, failure), blinding limits, total judge calls.

## 6. Resume

`state.json` exists for `<slug>` → reload contract, mapping history and last commit. Commit changed since last round → re-capture ours, rerun admitted seats before building more.

## 7. Scripted climb

Fuzzy problem → eval → climb. Fits skill descriptions, kernel size, MCP or tool text, prompt behavior.

1. Mine own history for cases where agents did the wrong thing (session transcripts, review findings, `pitfalls.md`). Categorize.
2. Each case → eval with a programmatic pass condition. Run current state on every target model; record baseline (source run: about 60 of 88).
3. Climb to perfect on every target model. Commit; freeze cases.
4. Flip objective: cut cost (source run: tool descriptions to a third of their size) while staying perfect. Mid-climb regressions are expected (66 → 63 of 85); recover by changing the subject, never the cases.
5. Commit the eval with the change → later edits stay testable. Source run result: 52% fewer tokens, 78% with tool search on.

No council needed here; the project's normal PR review still applies.

## 8. No reference

User names no rival → suggest this path. Before any image generation or judge call, wait for the user's go, and agree the round cap and usage budget in that same exchange. The go states the concept count (default 10 image calls, plus retries); that spend counts against the budget and goes into `state.json` spend.

1. **Redesign first.** Run `$redesign-concepts` on the current UI through `synthesis.md` only. Skip its build-work and contract-amendment paragraph: the climb contract stays frozen, and step 4 builds. A picked concept that needs data or backend the product lacks → user chooses: build that first, or drop it. Never fake its data.
2. **Views.** Set contract views after the pick: screens and states in both the current UI and `synthesis.md`. A state the pick removes gets its replacement under the same view name, written in `contract.md`.
3. **Baseline.** Capture current UI under those views and the section 2 rig, before any build. Frozen for the whole climb. Reuse `$redesign-concepts` captures only if they match the views and rig exactly and were taken at the baseline commit.
4. **Build the picked concept(s).** One writer, own commit, scripted floor. Pass the builder `synthesis.md` and the picked concept images by absolute path. That commit = first champion.
5. **Self climb** from it, below.

User declines the redesign, or it cannot run (no Codex login or image tool) → say so, offer self climb from current UI (champion = baseline). User names or supplies references later (products, screenshots) → sections 1–6 instead.

Concept images are builder targets only. Never give one to a judge as a letter: judges would rank render style (mockup vs live capture), not the design.

Self climb changes only these parts. Stop rules, council, judge folder, valid result, contract categories, scripted floor, capture rig, brief and ratchet (section 4 step 6) all hold.

- **No round 0 judging.** Round 1 is the first judge call.
- **Letters per round**: baseline, champion (best accepted version, commit recorded), 2 challengers, each a separate commit branched from the champion commit, each a distinct direction from ours' defects (round 1: gaps between build and picked concept). Champion = baseline → 3 letters. Judges never learn which letter holds which role.
- **Beats** (X beats Y for one seat): X sits in a lower tier than Y in no category, and in a strictly higher tier than Y (not tied) in at least half the categories.
- **Seat accepts** a challenger that beats the champion.
- **Short-circuit** (replaces staged admission): seats judge one at a time in section 4 step 2 order on the same captures (without Opus: Sol, then Astra). After each seat, keep only challengers every seat so far accepted; none left → round over, remaining seats skip.
- **Champion change**: only a challenger every seat accepted. Two left → more categories in a strictly higher tier than champion, summed over seats; tie → smaller diff. Losing challengers stay on their commits, unmerged.
- **Regression**: 2+ seats in one round put baseline in a higher tier than champion in a category → stop and tell the user before another round (the redesign may be worse there). One seat alone = noise, logged.
- **Gate (plateau)**: two build rounds in a row with no champion change; replaces section 4's no-gain stop. Champion still = baseline → no confirmation round; report no gain, ask the user. Else one confirmation round, champion vs baseline only, fresh shuffle and judges: champion beats baseline for every seat. Fail → report, ask the user.
- **Taste**: no rival sets the bar → show the user each new champion; their notes become contract amendments (section 4 step 7).
- **`state.json`** adds role per letter, champion commit, challenger commits, plateau count. Resume (section 6) reruns the seats of the interrupted round.
- **Report**: only after a passed confirmation round, state that ours beat its own baseline, with no outside bar. Cap, budget, regression stop or failed confirmation → report "not shown better than baseline". Never claim it beats or matches other products. History table: round × seat × challenger, accepted or not, champion commit; each picked concept named.

Source: Theo, "Agents Sucked At UI (Until Today)", 2026-11-03, https://www.youtube.com/watch?v=xq0eB8vxeqk. Figures above are that one run's, not benchmarks.
