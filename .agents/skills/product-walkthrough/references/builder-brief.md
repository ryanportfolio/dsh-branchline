# Builder brief template

Brief one subagent per chapter, or per group of two or three chapters that share screens. Builders run in parallel because each owns its own files and its own browser. Fill in the brackets; keep every line, since subagents do not read the global or project instructions.

---

You are building [chapter ids] of the [product] walkthrough.

**Read first:** `[scratch]/SCENES.md` (the scene contract), `[scratch]/STORYBOARD.md` (your chapters' beat sheets), `[scratch]/inventory.md` (the only facts you may state), and the finished reference chapter `[scratch]/scenes/[reference id].js`.

**Source to copy from:** [repo path at a fresh origin/main checkout]. Your screens: [components and files]. Strings: [translation file]. Icons: [icon package path] via `node checks/build-scene.mjs`.

**You own only:** `[scratch]/scenes/[id].js` (and `checks/src/[id].src.js` if you build from a source). Do not edit `player.html`, `tour.config.js`, the product CSS, another chapter or anything in the product repo. Need a shared helper? Put it in your own scene and mention it in the report.

**Paths:** absolute paths on every command; the working directory may reset between commands. Player URL: `http://127.0.0.1:[PORT]/player.html`. Run scripts as `cd [scratch] && node checks/<script>.mjs ...`.

**Browser:** launch your own Chrome through the check scripts only (`checks/spot.mjs`, `checks/review-all.mjs`, `checks/determinism.mjs`). They open headed Chrome on the real GPU, parked offscreen at -2400,-2400 and muted (`--mute-audio`). Never headless, never minimized, and never a shared browser tool (an MCP browser or an app's built-in browser pane): another agent may own it. The scripts park the window offscreen by themselves; `CHROME_PLACE=here` shows it, for debugging only. Close every browser you open.

**Screenshots:** `[<screenshots>/<project>/walkthrough/<chapter id>/]`. Create the folder. Look at your shots with your image-reading tool; do not report a visual result you did not look at.

**Done means:**
1. `node checks/classcheck.mjs --css [css files] scenes/[id].js` reports nothing missing (or each miss is a real product bug you list).
2. `node checks/determinism.mjs --url [player] [id]` reports deterministic in every theme.
3. `node checks/ship-check.mjs --allow-star-origin` passes for your chapters: id equals file name, takeaway of 14 words or fewer, `alt` text that says what the animation shows, CTA a same-origin path.
4. Spot shots at every tap (`t = tap + 60`), every transition midpoint, and the end, in every theme, look right against the reference captures in `[refs folder]`.
5. `window.__player.errors` is empty for your chapters.

**Report back, briefly:**
- What each chapter shows, and its title, takeaway, alt text and CTA.
- Not in the real UI, so not shown: anything the storyboard asked for that the product lacks.
- Metaphors: any beat that is not product UI, and why.
- Product bugs: classes without rules, contrast problems, strings that look wrong, with file:line.
- Visual doubts: anything you are unsure looks like the product, with the screenshot path.
- Copy you changed from the storyboard, and why.
