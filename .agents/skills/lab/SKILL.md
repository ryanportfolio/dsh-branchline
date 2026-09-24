---
name: "lab"
description: "Use when the user explicitly asks to lab or prototype a visual, UI, motion, or game-feel element with live tuning before production implementation."
---

# Lab: live-tune an element in an isolated sandbox, then port and delete

Models guess at feel; the user's eye knows it. A lab is a single throwaway HTML file with live controls that renders the element in isolation, so the user dials in the numbers instead of you guessing. Once they are happy, port the exact values into the real code and delete the lab. The result is agreed, deterministic values in the actual codebase.

Works for any visual or feel element, in a game or a website.

## The contract

A lab is scratch tooling, never product:

1. **Self-contained.** One HTML file. Inline vanilla JS and CSS. No external imports, no build step, no framework, no bundler. It must open and run as a plain file.
2. **Seeded at parity.** Every control starts at the element's current real value, so the lab opens looking exactly like the live thing. The user tunes away from the baseline and can always see what changed.
3. **1:1 key mapping.** The "Copy Settings" JSON uses keys that match the real constant names, so porting is a paste-map, not a translation.
4. **Never committed.** Do not `git add` the lab file. It does not ship.
5. **Deleted when done.** After porting, delete the lab and verify it is gone. Forgotten labs pile up as served-folder junk.

Invoking lab authorizes the scratch file and, once the user supplies settings, the port into the real code. It does not authorize commit, push, PR, merge, deploy, publication, or dependency installation unless that action is the user's explicit request.

## Workflow

### 1. Scope the knobs

Read the real code for the element. List every tunable parameter and its current value; these become the lab's controls. A knob is anything the user might want to feel out: durations, magnitudes, counts, radii, easing, colors, alphas, spacing, font sizes, delays, thresholds. Note the real constant name for each; it becomes the JSON key.

Pick the template from [templates.md](templates.md):

- **Game / canvas**: anything drawn to a `<canvas>`: particles, flashes, shake, trails, sprites, motion, timing. Mock the world procedurally (dummy actors, auto-fire). Do not import the real engine.
- **Web / DOM**: a component, layout, type scale, color, spacing, motion or transition, a redesign. Mock the markup with placeholder content.

### 2. Build the lab

Start from the matching skeleton in [templates.md](templates.md). For each knob, add a labeled control (range slider, number, color picker, or toggle) bound live to the preview: moving it updates the render immediately, with no reload. Seed each control's default at the current real value (contract rule 2). Group related knobs. Keep the preview large and the panel compact.

### 3. Add "Copy Settings" and handle the `file://` clipboard gotcha

Add a button that serializes the current control values to JSON, keyed by real constant names (contract rule 3).

Clipboard capability varies. On a `file://` page `navigator.clipboard` is often `undefined`, because the Clipboard API needs a secure context. `navigator.clipboard.writeText(...)` then throws a synchronous `TypeError`, not a rejected promise, so a naive `.catch(() => {})` never runs, the click handler aborts, and the visible JSON mirror is never written. The button looks dead and nothing is copyable.

Make the JSON readable without relying on the clipboard:

1. **Live mirror.** A `<pre>` or box that shows the JSON and updates on every input, not only on click, so the current settings are always on screen. The user can read, screenshot, or paste them even when copy is blocked. Seed it at load so it is never empty.
2. **Write the box first, then select it.** On click, set the box text before touching the clipboard, then select its contents (Range plus Selection) so a manual Ctrl+C works.
3. **Guard and fall back.** `if (navigator.clipboard && navigator.clipboard.writeText)` try it; otherwise fall back to `document.execCommand("copy")` on the selection. Wrap both in `try/catch` so neither can abort the handler.
4. **Never** let a clipboard call run before the visible mirror is written.

The skeletons in [templates.md](templates.md) already implement this pattern. Copy them rather than writing the naive `navigator.clipboard.writeText(json)` one-liner.

### 4. Place and open it

Use an authorized scratch location, defaulting to `.tmp/<name>.html`; verify ignore status with Git rather than assuming the file cannot be staged. Inspect the actual file, browser, server, and preview capabilities exposed in this session. Open a local file if supported, or use a reachable local server with supported controls. Browser work follows the browser-per-session rule in `AGENTS.md`. Verify the user can reach the chosen preview. Do not publish or install tools merely to show the lab.

Honor an explicit filename or title throughout. Otherwise use `<element>-lab.html`. Keep the lab standalone even when served.

### 5. Hand off to the user

Provide the usable absolute file link or verified preview URL. Tell the user to tune the controls and share the live JSON. When an exposed browser tool can read the live settings, use it within existing authorization; otherwise ask for pasted JSON. Never assume a particular preview host has or lacks an evaluation bridge.

Avoid editing or reloading after handoff, because it can reset the tune. Capture current values through available controls first; if that is not possible, explain the reset before a necessary edit. Wait for the user's chosen settings before porting.

### 6. Port the values

When the user supplies the JSON, map each key to its real constant and edit the actual code. Flag any knob that does not map cleanly so the user knows the lab and the real thing will differ. Example: the lab had a per-effect duration knob, but the real code shares one duration constant across effects, so that knob cannot carry over without a bigger change. Be honest about these gaps.

### 7. Tear down

Delete the lab file. Verify it is gone (`ls`) and that it was never committed: it must not appear in `git status` or `git ls-files`.

## General notes

- **Naming:** honor the user's requested filename or title verbatim. They may ask for a generic name and require the element word to appear nowhere: not the filename, not the `<title>`, not a visible heading. Check all three.
- **Determinism boundary:** if the real code has a deterministic core (a sim engine, a pure-function reducer), keep it that way when porting. Sim-affecting knobs become plain constants in the core; cosmetic-only knobs go in the renderer. Never port lab-style `Math.random` into a deterministic core.
- **Mock, don't import:** labs reproduce the look with throwaway code; they do not import the real engine or components. Keep them dependency-free so they open instantly.
- **Multiple render surfaces:** if the element renders in more than one shell or page, port knobs into the shared component so every surface inherits them.
