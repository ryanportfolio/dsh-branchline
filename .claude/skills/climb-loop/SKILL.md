---
name: climb-loop
description: "Hill-climb a target round after round: Opus, Sol and Astra rank our UI blind against named reference apps until all rank ours first, or a scripted eval climbs to perfect. Use: /climb-loop, 'make our UI beat <app>', 'hill climb this'."
---

# Climb loop

Give the agent a hill it can measure → it climbs. Two hills:

- **Scripted hill** (prefer): program emits a number → push it up. Section 7.
- **Judged hill**: no program can measure it (UI taste) → council of three models ranks captures. Sections 1–6.

Neighbors: `wow-loop` = written quality contract, binary checks, own critics, one model family. `perf-loop` = speed/size targets. This skill = beat named rivals, judged by Opus + Sol + Astra, or an eval mined from history.

`$ARGUMENTS`: target (app, screens or eval) plus optional references and round cap.

## Stop rules (read first)

- Agree a round cap and a usage budget with the user before the first judge call or eval run; baseline, confirmation and scripted eval runs all count against them. When the round cap or the agreed usage budget is reached, stop, report, and ask the user before any further judge call. Never raise the cap or the budget yourself.
- Before starting, state seat count × planned rounds; every judge call bills the user's subscriptions.
- Judges must not edit anything. Codex judges run with `-s read-only`. The Opus judge is an Agent-tool subagent whose tools are not restricted, so it is read-only only because its brief forbids edits and any tool use beyond reading the listed images; say so in the report.
- Never tell a judge the target, gate, round number, prior ranks, builder notes or which letter is ours.
- Never weaken a check, edit an eval case, or drop a reference to get a pass.
- If Codex is unavailable, say so and stop the judged hill. Never fill a seat with another Claude subagent and call the council cross-vendor.
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

Opus seat: Agent tool, same brief, image paths inside `$JUDGE` only, returns the same JSON as its final message. The subagent still loads project instructions (`CLAUDE.md`); record that as a blinding limit.

**Valid result.** Exit 0, then `JSON.parse` succeeds and the object has the schema's keys (Codex enforces the schema; Opus does not, so check it). Then completeness: every contracted category exactly once; in each ranking every expected letter exactly once, no other letters, no empty tier; defect labels only expected letters; `gaps` empty. Top tier = `ranking[0]`. A result that fails any of these is invalid for the round and is never counted as a pass. Other failures: report once, ask before a retry; never swap model or effort silently.

## 2. Contract (once, then frozen)

Write `.tmp/climb-loop/<slug>/contract.md`:

- **References**: 2+ products ours must beat, named by user. If the user named none, ask before capturing.
- **Views**: states captured identically for ours and every reference: viewport, theme (light and dark), data fixture, zoom. Name each view.
- **Categories** (edit per product): hierarchy, typography, color and contrast, spacing and density, consistency (labels, radius, icons across surfaces), affordance (controls read as controls), iconography, states (focus, hover, empty, error).
- **Seat pass**: one valid result from one seat with ours alone in `ranking[0]` of every category.
- **Gate**: all three seats pass in the same round, then all three pass again in a confirmation round (section 4) on the same commit.
- **Scripted floor**, after every edit, no judge call: axe-core clean on each view, WCAG AA contrast on text tokens, zero console errors, views outside the edit pixel-stable. If a gating floor check fails, do not run a judge round.
- User names a numeric bar ("9/10") → record it in `state.json` only, translate to the gate above. A lower bar may relax the gate (top two tiers, fewer categories) only after the user confirms which.

Capture rig: headed Chrome on the real GPU via `launchPlacedChrome()` (`scripts/lib/launch-chrome.mjs`), never headless, never minimized, audio muted. Each parallel agent launches its own instance; an MCP browser is one per session, one driver at a time. Captures go to the screenshot folder the user's instructions name, else `.tmp/climb-loop/<slug>/captures/`. Reference captures taken once in round 0, reused unchanged.

## 3. Judge brief

Template: [references/judge-brief.md](references/judge-brief.md). Per seat per round: reshuffle letter mapping; keep mapping in `state.json`, never in the judge folder. Recognizable rival chrome limits blinding → record it.

Output: [references/rank.schema.json](references/rank.schema.json). Ranking as tiers, best first; reason; up to 3 defects per letter (view, element, problem, measurable fix). Orchestrator maps letter → ours, keeps ours' defects, keeps rival defects only as rationale.

## 4. Loop

1. **Round 0 (baseline)**: capture all, all three seats judge untouched UI. Record start tiers.
2. **Staged admission** (cost): only Sol judges until Sol passes; then Opus joins; when Opus passes, Astra joins. Default order Sol, Opus, Astra (the source run's order, Astra in its third seat); user may reorder. A pass while a seat is still waiting only admits the next seat; it never meets the gate.
3. **Build**: one writer, isolated worktree per project rules. Commit each build before the next round; judges only ever see a clean tree at a recorded commit. Fix ours' defects ordered by seats citing them, then category where ours ranks lowest. Scripted floor after each edit.
4. **Next round**: new captures of ours, new shuffle, new judge folders, fresh judge contexts. Never reuse a judge thread.
5. **Confirmation round**: after a round where all three seats pass, run one more round on the same commit with no build in between: new shuffle, new judge folders, fresh judges. All pass → gate met. Any seat fails → back to step 3.
6. **Ratchet**: gate met and change is mergeable → open PR per project rules (its review gate applies). Further climbing (stricter gate, more references, more views) goes on a stacked branch in a new worktree; the mergeable PR stays intact.
7. **User taste** ("too grayscale"): append a named, versioned contract amendment; builder gets it, judges never see it as a goal.
8. Save `state.json` (round, seats admitted, mapping, tiers, commit, spend) after every round.

If two build rounds in a row bring no tier gain in any category, stop, write one sentence on the assumption both rounds shared, and test it before another round. Confirmation rounds do not count toward this.

## 5. Report

- PR body (normal prose): history table rounds × seat × category, ours' tier; drift row: changes in reference-only order, ours removed (expected none).
- Per shipped change: annotated before/after (arrow + one line) so the user can see subtle diffs.
- Attribution: seats that ran, observed model/effort per seat, rounds where a seat sat out and why (staged, quota, failure), blinding limits, total judge calls.

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

Source: Theo, "Agents Sucked At UI (Until Today)", 2026-11-03, https://www.youtube.com/watch?v=xq0eB8vxeqk. Figures above are that one run's, not benchmarks.
