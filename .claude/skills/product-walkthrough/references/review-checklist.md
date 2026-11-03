# Review checklist

Run this after every build round and before any handover. Each step names the script that produces the evidence. Screenshots go to the machine's screenshot folder (`<screenshots>` below), never into the repo.

## 1. Mechanical gates (all must pass)

```bash
node checks/ship-check.mjs --allow-star-origin        # drop the flag before shipping
node checks/classcheck.mjs --css app.css scenes
node checks/determinism.mjs --url http://127.0.0.1:PORT/player.html
node checks/review-all.mjs --url http://127.0.0.1:PORT/player.html --out <screenshots>/<project>/walkthrough/review
```

- [ ] Ship-check: ids match file names, every chapter has title, takeaway (14 words or fewer), alt text and a same-origin CTA. Before shipping, also a real `parentOrigin`.
- [ ] Class check: every class has a rule, or is on the product bug list with a reason.
- [ ] Determinism: every chapter "deterministic" in every theme (the script runs all themes). That covers scrubbing, a replay from the end frame, and the first frame after another chapter has played. No CSS animations driving anything the viewer reads.
- [ ] `review-all` reports no errors and no missing scene files; console clean.

## 2. Contact sheets (one per chapter)

`review-all.mjs` writes `sheet-<id>.png`: six moments per theme. Read each sheet and check:

- [ ] The story reads left to right without the caption: action, response, result.
- [ ] The result plays out on the product's own elements, matching the one-sentence story in the beat sheet; nothing unrelated to the action moves.
- [ ] Every theme looks like the product in that theme (compare with the reference captures). No hard-coded colour that only works in one theme.
- [ ] Nothing clipped at the stage edges; nothing overlapping that does not overlap in the product.
- [ ] The actor never covers text the viewer is reading.
- [ ] The final frame holds a clear end state for the takeaway to land on.

## 3. Spot checks at full resolution

Contact sheets miss detail. Take spot shots (`checks/spot.mjs`) at the moments sheets do not sample:

- [ ] Every tap: `t = tap + 60`. Tip and ripple on the control.
- [ ] Every transition midpoint: dialogs opening and closing, views swapping, items flying. Collisions show up mid-transition.
- [ ] Typing and streaming: no orphan word on its own line, no text overflowing its box at the longest point.
- [ ] Small text legible at the stage's scaled size on a 1366 x 768 laptop (`--width 1366 --height 768`).
- [ ] At that size, every moving element of the result story is at least about 4 px, so the motion still reads.

## 4. Fidelity against the real product

Put each spot shot beside its reference capture.

- [ ] Same components, spacing, radii, icon sizes, font sizes and weights.
- [ ] Same layout relationships: a panel that replaces the view in the product replaces it here; a dialog that dims the page dims it here.
- [ ] Strings match the translation file; lists match the live product.
- [ ] Anything that is a metaphor, not product UI, was flagged in the storyboard and looks distinct from UI.

## 5. Truth of the copy

- [ ] Each title, takeaway and on-screen claim traces to an inventory entry, with its conditions stated.
- [ ] Each CTA route exists.
- [ ] Stated durations are computed from chapter durations plus gaps.
- [ ] No hidden internal names or admin-only features in user-visible text.

## 6. Watch it play

Stills prove layout, not motion. Watch the whole tour at 1x in a headed browser (or read dense frame strips from an export, per the motion-design skill's `verify-export.md`).

- [ ] Pacing: every string readable at the pace it appears; holds long enough for the eye to land.
- [ ] Easing: arrivals ease out, nothing scales up from 0, no linear moves on UI.
- [ ] The actor moves with intent and pauses before taps.

## 7. Keyboard and screen reader

- [ ] Tab reaches only the caption controls; nothing inside the stage takes focus.
- [ ] Space and the pause button pause and resume; arrows change chapter.
- [ ] Each chapter's `alt` says what happens on screen, readable without seeing it.
- [ ] With `prefers-reduced-motion: reduce` (Playwright `reducedMotion: "reduce"`), chapters open paused on their end frame.
- [ ] Caption text contrast at least 4.5:1 in every theme, on the host's background in embed mode.
- [ ] If the owner needs an accessibility claim: a pass with a real screen reader (NVDA or VoiceOver). The scripts do not cover it.

## 8. Embed

- [ ] `host-embed.html` (or the real host): open, play through, Skip, Escape, Finish, CTA, replay, theme switch mid-tour. `tour-done` arrives each time, focus returns to the host, nothing leaks visually between host and iframe.
- [ ] Nothing plays before the host sends `start`, arrow keys included.
- [ ] Tab stays inside the caption controls while the tour is open.

## Reporting

For each chapter: pass or the open issues, with the screenshot path. Then the product bug list, the "not in the real UI, so not shown" list from builders, and any visual doubt nobody resolved.
