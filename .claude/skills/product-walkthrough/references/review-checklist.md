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

- [ ] Pacing: every string readable at the pace it appears; holds long enough for the eye to land, and no longer; each change lands on an actor action.
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

## 9. Viewer questions

A walkthrough is the `explainer` type in the motion-design skill's `references/critique.md`. Ask its questions of the finished tour, read as below; steps 1 to 8 already answer the rest.

A failed `loop` or `point` fails the tour. Each verdict cites the capture path and the `t` it judged; one without them is returned.

- Covered above: `read` (steps 3, 6, 7) and `pace` (step 6). Walkthroughs have no audio, so no `sound`.
- [ ] `loop` (decisive), per chapter: one action carried to its result, as step 2 checks. A tour is separate chapters by design (see inventory.md), so the tour-level "no feature list" half does not apply.
- [ ] `shown`: in each chapter the stage does the action its title and takeaway claim, with the takeaway's condition visible. Step 5 proves the claim is true; this proves the stage shows it and does not leave it to the caption.
- [ ] `point`: run `node checks/review-all.mjs --url <player>?capture=1 --out <screenshots>/<project>/walkthrough/blind --themes <default theme>` (stage only, no caption) and copy its per-moment PNGs, renamed `01.png`, `02.png`, ... in play order. Never pass the `sheet-*` files or `meta.json`: they print titles and takeaways. A fresh subagent given only the `Audience:` line and those copies writes one sentence on what the product lets this viewer do. A second fresh agent, given only that sentence and the storyboard's `Tour:` line, returns same or different. The author never makes either call.
- [ ] `own`: the same critic, ignoring the name and logo, names what else each chapter could be for. A chapter that fits any app of its kind (sign in, invite a teammate) fails.
- [ ] `land`: the last chapter's end frame and CTA tell the viewer what to do next.
- [ ] `open`: an embedded tour starts on the host's `start`, so only the second half applies: chapter 1 sets up a goal or problem the rest of the tour delivers on. An MP4 exported for a feed gets the full `open`, judged muted at phone size.
- Not used: `q-read-time` (needs the motion-design engine's caption records; the step 6 watch judges caption timing instead) and `q-best` (needs wow-loop rounds). A tour run through `wow-loop` adds `q-best` per critique.md.

## Reporting

For each chapter: pass or the open issues, with the screenshot path. Then the step 9 tour results (the `point` sentence and its verdict, `open`, `land`), the product bug list, the "not in the real UI, so not shown" list from builders, and any visual doubt nobody resolved.
