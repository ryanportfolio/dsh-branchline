# Friction report

Run `node <walk.mjs> <run> summary` → `summary.json` (one row per walk folder). Rank only `goal-*` rows; `known-*` and `login` rows are setup. Compare each goal with map's known path.

## What counts

- **Wasted steps** = walker actions (every attempt the budget charged, failed ones included) − known steps (floor 0). Count these, not raw clicks.
- Shown beside it, as separate counts (not parts of the waste): backtracks (`back`, `home`, or a return to a screen seen earlier without doing anything on the current one), dead ends (the subset of backtracks that left a screen where nothing was done), extra screens (walker's `screens` − screens on the known path).
- Shorter path than known that skipped a needed confirmation, undo or review step → finding, not a win. Destructive or costly step with no confirmation or undo (from map) → finding.
- Hesitations and misread labels from walker notes + reply, even with 0 wasted steps.
- `found` checked against map's end state. Wrong end state → outcome `wrong end`.

## Ranking (cost to user per attempt)

1. Not reached: `gave-up`, `not ended` (budget spent or walker stopped), `wrong end`, or Known steps `none` (site never answers the goal). `not walked` (driver or walker failed) → Not walked section, not ranked.
2. Reached, most wasted steps first; tie → more dead ends, then more backtracks, then more extra screens.
3. Reached with 0 wasted, hesitations or misleading labels.
4. Smooth: 0 wasted, no hesitation (listed, not ranked).

How often users need each feature is unknown to the run; owner may reorder by importance.

## Evidence labels

Every finding carries one or more, with location:

- `Log`: `steps.jsonl` row in goal folder (`goal-4/steps.jsonl:7`).
- `Observed`: walker note or reply, or screenshot path.
- `Measured`: known-path replay.
- `From code`: `file:line`.

Single walk → mark `1 walk`. Confirmed = second fresh walker hits the same friction, or log + code explain it. Offer repeat walks for top single-walk findings; never claim a pattern from one walk.

## Fix and hand-off

Each finding: concrete change (rename "Reports" to the word walker searched for, link screen A to B, move control above the fold) + next step: fix in code, `climb-loop`, `ui-quality`, `conversion-ux` or `product-walkthrough` (SKILL.md table). Never judge look, accessibility or conversion here; name the skill.

## Template (report is for the owner: normal prose)

```markdown
# User walk: <site> (<date>)

Commit <sha> · <URL> · <test account / signed out> · <n> walkers (fresh agents, <model>), <k> at a time · <total time> · skip list: default + <extra>

## Ranked friction
| # | Feature | Goal given | Outcome | Known | Walker | Wasted | Backtracks / dead ends / extra screens | What went wrong | Evidence | Fix | Next |
|---|---|---|---|---|---|---|---|---|---|---|---|

## Smooth
<features reached with no wasted steps and no hesitation>

## Not walked and limits
<skip-list paths, role-gated features, missing data, driver or walker failures>
Walkers read the whole page's text at once, as a screen reader would; a sighted visitor scans and scrolls. The driver makes them scroll before acting on a control, but they can read text below the fold without scrolling, so friction from finding an answer lower on the page and from visual prominence is under-counted. Walkers started in the repo and could see its project instructions and recent commit titles; `check-walker` confirmed they used only the driver (list any walk discarded for breaking that). Viewport <w × h>; no touch emulation.

## Feature names changed
<rows added, renamed or removed in .claude/reference/features.md>

## Product bugs seen
<list or none>
```
