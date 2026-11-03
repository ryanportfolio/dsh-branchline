---
name: product-walkthrough
description: "Product tour replaying real screens (product CSS + markup), guide cursor acts; embed or MP4. Use: /product-walkthrough, onboarding tours."
---

# Product walkthrough

A walkthrough is a set of 8 to 12 second chapters. Each chapter shows one real screen of the product, rebuilt with the product's production stylesheet and copied component markup, while a guide (a cursor or a mascot) does one concrete thing on it: pastes a link, picks three items, sends a question. A caption under the stage names what the viewer can do, in one line, with a button to the real route. The player scrubs, switches themes, auto-advances, and talks to a host page when embedded.

The craft of timing and easing lives in the `motion-design` skill; read its decision rules before blocking chapters. This skill covers what is specific to replaying a real product honestly.

## When it fits, and when something else is better

It fits a web app whose screens are built from HTML and CSS you can fetch (utility classes or plain stylesheets), with themes set by a class or attribute on `<html>`, viewed on a desktop or tablet-sized screen, in one locale per tour.

Pick something else, or tell the owner the extra cost first, when:

- **The UI changes weekly.** A replica goes stale at the next redesign. Render the real components with seeded demo data, or use an overlay tour on the live product (driver.js, Shepherd).
- **The screens are canvas, WebGL, native or Flutter.** They cannot be rebuilt in DOM. Record a scripted session of a seeded demo account and edit it.
- **The only deliverable is a video.** A scripted recording of the real app is simpler and honest by construction; export from this player is experimental.
- **Styles are CSS modules, CSS-in-JS or shadow DOM.** Class names are hashed or generated at runtime: copy the rendered DOM and computed CSS from the live page instead of the source, and expect the class check to be of little use.
- **The tour is for phones.** The 1200 x 720 stage is unreadable at phone width; build a separate portrait stage (for example 390 x 844) with chapters composed for it.
- **Right-to-left or many locales.** The player has no `dir` handling and scene text is per file: one tour per locale, checked for text overflow in each.
- **Login is SSO, OAuth, 2FA or a magic link.** `capture-refs.mjs` handles a form login; capture references by hand or with a saved session the owner provides.

## Settle with the owner first

Ask only what you cannot find out. Defaults in brackets.

1. Who watches and where: new signups inside the app (embedded) [default], a marketing page, or a video file.
2. The guide: a cursor [default], or a mascot (reuse one if the product has it; see [actor-contract.md](references/actor-contract.md)).
3. Length: [6 to 10 chapters, about 2 minutes].
4. Themes: every theme the product ships [default].
5. A test account for logged-in reference captures, handed over in a file the owner pastes into (the `secret-file` skill makes one, where installed), never in chat.
6. Who owns the shipped tour and re-checks it when the product changes (see Porting in [player-api.md](references/player-api.md#porting-into-the-product)).
7. Reduced motion: [chapters open paused on their end frame for viewers who ask for less motion].

## Workflow

0. **Scratch folder.** Copy `templates/` into a gitignored folder in the repo (check `git check-ignore`), for example `<repo>/.tmp/walkthrough/`. Start `node serve.mjs . <port>` there. Base the repo checkout you read on freshly fetched `origin/<default>`. Labs and checks never get committed.
1. **Inventory.** Read the code and write `inventory.md`: every capability with `file:line` citations, conditions and a non-obvious score. Then `STORYBOARD.md`: chosen chapters, verb-led titles, takeaways of 14 words or fewer, CTA routes, beat sheets. Get the owner's OK on the storyboard. See [inventory.md](references/inventory.md).
2. **Fidelity kit.** Production CSS and route chunks, theme switch, fonts, icon set, strings, live lists, reference captures of each screen in each theme. See [fidelity.md](references/fidelity.md).
3. **Contract and a reference chapter.** Fill in [scene-contract.md](references/scene-contract.md) as `SCENES.md`. Build the first chapter yourself, end to end through review, so builders have a finished example.
4. **Parallel builders.** One subagent per chapter or small group, briefed with [builder-brief.md](references/builder-brief.md). Each owns its scene file and its own browser and reports what the real UI lacks.
5. **Review loop.** Run [review-checklist.md](references/review-checklist.md): ship-check, class check, determinism in every theme, contact sheets, spot checks at taps and transitions, fidelity against reference captures, truth of the copy, a 1x watch, keyboard and screen-reader basics, the embed. Fix and repeat until it passes.
6. **Integrate.** Embed with the iframe protocol in [player-api.md](references/player-api.md); `templates/host-embed.html` is a working host. Set `parentOrigin`, run `node checks/ship-check.mjs` (it fails on a wildcard origin, mismatched ids, off-site CTAs, missing alt text and long takeaways), and agree with the owner how it ships and who re-checks it.
7. **Export (only if asked; experimental).** [export.md](references/export.md): Element Capture into WebCodecs, measured on one Windows machine at one window geometry, with capture start failing now and then. Tell the owner that before relying on it. Never a screenshot per frame without the owner's OK.
8. **Hand over and clean up.** See the handover list below.

## Rules

- **Show a concrete action on the real UI.** Every chapter is the user doing one thing and seeing the result. No benefit cards, no invented screens. "Hours to minutes" is not a feature.
- **Every claim traces to code.** Titles, takeaways, on-screen text and stated durations match the inventory, including conditions ("On YouTube videos, ...").
- **Real UI only.** Copy markup and classes from source, strings from the translation file, lists from the live product. When a beat needs a metaphor, flag it and keep it visibly distinct from UI. Keep layout relationships true.
- **The result acts, the rest waits.** Write the result of each chapter's action as a one-sentence story on the screen's own elements (the motion-design skill's `references/ui-loops.md` has one per kind of visual) and keep everything else on screen at rest.
- **Deterministic frames.** `frame(t)` is a pure function of `t`; `transition: none` on animated elements; no `Math.random()`, no wall-clock CSS animations for anything the viewer reads.
- **The guide never covers what the viewer reads,** and every tap lands on its control (measure, then spot-check `t = tap + 60`).
- **Every theme, every chapter.**
- **The stage is a picture, not the product.** The player makes it inert and hidden from assistive tech, so each chapter needs `alt` text describing what it shows. Keep the pause button, Space-to-pause and the reduced-motion default; a tour longer than 5 s with no pause fails WCAG 2.2.2.
- **Embed safely.** `parentOrigin` set to the host's exact origin, CTAs as same-origin paths only, and the player served with a CSP `frame-ancestors` for that origin. `checks/ship-check.mjs` enforces the first two.
- **Product bugs go to the owner.** Purged classes, contrast failures, leaking error strings: one list, `product-bugs.md`, never silently fixed or silently copied.
- **One browser per agent.** Check scripts launch their own headed Chrome, offscreen and muted. Never a shared MCP browser for builders, never headless, never minimized.
- **Screenshots and exports outside the repo:** the machine's screenshot folder and an artifacts folder for video, written `<screenshots>` and `<artifacts>` in the commands of these references. Pass these paths into every brief.
- **Secrets stay in files.** Read the test account from its secret file, never print it, delete cached sessions (`capture-refs.mjs` does this unless told to keep it).
- **Tuning by eye goes through knobs.** When the owner should settle speeds or feel, expose live sliders with a Copy settings JSON button in the scratch lab; bake the values into constants after. Knobs never ship.

## Pitfalls

- Storyboarding from the marketing page: chapters end up showing what users already know, or claim what the code does not do.
- Copying the source Tailwind config instead of the built CSS: arbitrary values and plugin classes go missing. Copy the served bundle and the route chunks.
- Guessed tap coordinates. On the starter chapter a guessed "Create" target landed 50 px below the button; the spot shot caught it.
- CSS transitions from product classes (`transition-colors`, `transition-all`) make scrubbing non-deterministic; the determinism check finds them.
- A panel shown beside a view when the real app replaces the view. Compare layouts with reference captures, not just components.
- Caption text inheriting a dark body colour on a transparent embed. Set each theme's `ink` in `tour.config.js`.
- Two agents on one browser deadlock or steal each other's pages.
- Contact sheets miss mid-transition collisions; spot-check transition midpoints.
- Stated tour length estimated instead of computed from chapter durations plus gaps.
- A scene id that differs from its file name: chapter order silently falls back to `order`. The player logs an error and ship-check fails.
- Shipping the replica with nobody to re-check it. It drifts from the product at the next deploy, and nothing tells anyone.

## Handover

Tell the owner: where the player runs (URL and the start command), what was verified and how (scripts run, themes, screenshot folder), the review result per chapter, the ship-check result, the product bug list, the "not in the real UI, so not shown" list, metaphors used, open visual doubts, who re-checks the tour and when, and what is left to port. Stop the server and close browsers you started. Delete the scratch folder, and the reference captures (they show the test account's data), once the tour is ported and merged.

## Maintenance

This Claude Code copy is the source. The Codex port in `.agents/skills/product-walkthrough/` carries identical `references/` and `templates/` plus a Codex-specific SKILL.md (invocation, agent-tool check, sandbox, server start, browser placement). After changing shared folders here, copy them across; after changing this SKILL.md, port the change there and run `node .claude/scripts/sync-codex-skills.mjs --baseline product-walkthrough`.

## Resources

- [references/inventory.md](references/inventory.md): feature inventory format, choosing chapters, storyboard and copy checks.
- [references/fidelity.md](references/fidelity.md): the fidelity kit, class check, reference captures, honesty rules, product bug list.
- [references/scene-contract.md](references/scene-contract.md): the chapter contract to fill in and brief builders with.
- [references/actor-contract.md](references/actor-contract.md): guide actor module (cursor or mascot) and host handoff.
- [references/player-api.md](references/player-api.md): config, URL parameters, `window.__player`, embed protocol, host checklist, tuning knobs, porting.
- [references/builder-brief.md](references/builder-brief.md): subagent brief template.
- [references/review-checklist.md](references/review-checklist.md): the review loop.
- [references/export.md](references/export.md): MP4 export through Element Capture and WebCodecs, with measured limits.
- [references/worked-example-corewise.md](references/worked-example-corewise.md): one real run, for reference only.
- `templates/`: `player.html`, `tour.config.js`, `scenes/ch1-example.js` (starter chapter), `actors/cursor.js`, `host-embed.html`, `serve.mjs`, and `checks/` (`review-all`, `spot`, `determinism`, `classcheck`, `capture-refs` with an example config and step, `build-scene`, `ship-check`, `export-video`; shared `lib/browser.mjs`). Scripts take `--url` and `--out`; Playwright is resolved from the working directory or `WALKTHROUGH_PW_FROM`.
