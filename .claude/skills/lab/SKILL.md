---
description: Use when the user explicitly asks to lab or prototype a visual, UI, motion, or game-feel element with live tuning before production implementation.
---

# lab — live-tune an element in an isolated sandbox, then port + delete

LLMs guess at feel; the human eye knows it. A "lab" is a single throwaway HTML file with live controls that renders the element in isolation, so the **user** dials in the numbers instead of you guessing. Once they're happy, you port the exact values into the real code and throw the lab away. This bridges "looks right in my head" → deterministic, agreed-on values in the actual codebase.

Works for **any** visual or feel element — game OR website.

## The contract (read first)

A lab is **scratch tooling, never product**:

1. **Self-contained.** One HTML file. Inline vanilla JS + CSS. NO external imports, NO build step, NO framework, NO bundler. It must open and run as a plain file.
2. **Seeded at parity.** Every control starts at the element's CURRENT real value, so the lab opens looking exactly like the live thing. The user tunes *away* from the baseline — they can always see what changed.
3. **1:1 key mapping.** The "Copy Settings" JSON uses keys that match the real constant names, so porting is a paste-map, not a translation.
4. **Never committed.** Do not `git add` the lab file. It does not ship.
5. **Deleted when done.** After porting, delete the lab and verify it's gone. Forgotten labs accumulate into served-folder junk — don't start the pile.

## Workflow

### 1. Scope the knobs
Read the real code for the element. List every tunable parameter and its **current value** — these become the lab's controls. A knob is anything the user might want to feel out: durations, magnitudes, counts, radii, easing, colors, alphas, spacing, font sizes, delays, thresholds. Note the real constant name for each (you'll reuse it as the JSON key).

Decide the template (see `templates.md`):
- **Game / canvas** — anything drawn to a `<canvas>`: particles, flashes, shake, trails, sprites, motion, timing. Mock the world procedurally (dummy actors, auto-fire) — do NOT import the real engine.
- **Web / DOM** — a component, layout, type scale, color, spacing, motion/transition, a redesign. Mock the markup with placeholder content.

### 2. Build the lab
Start from the matching skeleton in `templates.md`. For each knob, add a labeled control (range slider, number, color picker, or toggle) bound **live** to the preview — moving it updates the render immediately, no reload. Seed each control's default at the current real value (contract rule 2). Group related knobs. Keep the preview large and the panel compact.

### 3. Add "Copy Settings" — and design for the `file://` clipboard gotcha
A button that serializes the current control values to JSON. Keys = real constant names (contract rule 3).

**Clipboard capability varies:** on a `file://` page `navigator.clipboard` is frequently **`undefined`** (the Clipboard API needs a secure context). `navigator.clipboard.writeText(...)` then throws a **synchronous `TypeError`** — NOT a rejected promise — so a naive `.catch(() => {})` never runs, the click handler aborts, and the visible JSON mirror never gets written → the button looks dead AND nothing is copyable.

So make the JSON readable **without** relying on the clipboard:

1. **Live mirror.** A `<pre>`/box that shows the JSON and updates on **every input** (not just on click), so the current settings are always on screen — the user can read/screenshot/paste them even if copy is 100% blocked. Seed it at load so it's never empty.
2. **Write the box first, then select it.** On click, set the box text BEFORE touching the clipboard, then auto-select its contents (Range + Selection) so a manual Ctrl+C works.
3. **Guard + fall back.** `if (navigator.clipboard && navigator.clipboard.writeText)` → try it; else fall back to `document.execCommand("copy")` on the selection. Wrap BOTH in `try/catch` so neither can abort the handler.
4. **Never** let any clipboard call execute before the visible mirror is written.

The skeletons in `templates.md` already implement this pattern — copy them rather than reinventing the naive `navigator.clipboard.writeText(json)` one-liner.

### 4. Place and open it

Use an authorized scratch location, defaulting to `.tmp/<name>.html`; verify ignore status rather than assuming the file cannot be staged. Inspect actual file, browser, server, and preview capabilities. Open a local file if supported, or use a reachable local server with supported controls. Verify the user can reach the chosen preview. Do not publish or install tools merely to show the lab.

Honor an explicit filename/title throughout. Otherwise use `<element>-lab.html`. Keep the lab standalone even when served.

### 5. Hand off to the user

Provide the usable absolute file link or verified preview URL. Tell the user to tune controls and share the live JSON. When an exposed browser tool can read the live settings, use that capability with the existing authorization; otherwise ask for pasted JSON. Never assume a particular preview host has or lacks an evaluation bridge.

Avoid editing or reloading after handoff because it can reset the tune. Capture current values through available controls first; if unavailable, explain the reset before a necessary edit. Wait for the user's chosen settings before porting.

### 6. Port the values
When the user pastes the JSON, map each key to its real constant and make the edits in the actual code. Flag any knob that does NOT map cleanly so the user knows the lab and the real thing will differ slightly — e.g. the lab had a per-effect duration knob but the real code shares one duration constant across effects, so that knob can't carry without a bigger change. Be honest about these gaps.

### 7. Tear down
Delete the lab file. Verify it's gone (`ls`) and that it was never committed (it shouldn't appear in `git status` / `git ls-files`). The lab has served its purpose.

## General notes

- **Naming:** honor the user's requested filename/title verbatim. They may ask for a generic name and require the element word to appear nowhere — not the filename, not the `<title>`, not a visible heading. Check all three.
- **Determinism boundary:** if the real code has a deterministic core (a sim engine, a pure-function reducer), keep it that way when porting — sim-affecting knobs become plain constants in the core; cosmetic-only knobs go in the renderer. Never port lab-style `Math.random` into a deterministic core.
- **Mock, don't import:** labs reproduce the *look* with throwaway code; they don't import the real engine/components. Keep them dependency-free so they open instantly.
- **Multiple render surfaces:** if the element renders in more than one shell/page, port knobs into the shared component so every surface inherits them.

See `templates.md` for copy-paste lab skeletons (canvas + DOM).
