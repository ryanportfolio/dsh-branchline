# Player API and integration

`templates/player.html` plays the chapters. It reads `tour.config.js`, loads the product CSS, the actor and every scene file, then shows one chapter at a time on a fixed stage with a caption bar under it.

## Configuration (`tour.config.js`)

| Key | Meaning |
|---|---|
| `css` | Product stylesheets (and route chunks) to load, relative to `player.html`. |
| `bodyClass`, `rootClass` | The app's base classes for `<body>` and the stage root. |
| `stage` | `{ w, h }` in CSS px; scenes use these coordinates. Default 1200 x 720. |
| `themes` | `{ id: { class?, attrs?, ink? } }`: how each theme is set on `<html>`, plus the caption text colour. The first key is the default unless `defaultTheme` says otherwise. |
| `chapters` | Scene file names in play order. Order here wins over each scene's `order`. |
| `actor` | `{ src, id, size }` or `null`. |
| `gapMs` | Hold after a chapter ends before moving on (default 1800). |
| `maxScale` | Largest stage scale on big windows (default 1.25). |
| `accent` | Colour for progress dots, the primary button and the tap ripple. |
| `parentOrigin` | Embed mode: the host's origin. `"*"` while building only; `ship-check.mjs` fails on it. |
| `reducedMotion` | `"end-frame"` (default): with `prefers-reduced-motion`, each chapter opens paused on its final frame; Play still plays it. `"ignore"`: play as normal. |
| `strings` | Player strings (`chapter`, `back`, `next`, `finish`, `skip`, `cta`, `pause`, `play`, `chapters`) for localisation. Scene text lives in the scene files. |

## URL parameters

| Parameter | Effect |
|---|---|
| `scene=<id>` | Open that chapter. |
| `t=<ms>` | Freeze at that time (paused). Used by every check script. |
| `theme=<id>` | Start in that theme. |
| `embed=1` | Embed mode: transparent page, no dev bar, Skip button, postMessage protocol, waits for `start`. |
| `dev=0` | Hide the dev bar (for screen recordings). |
| `capture=1` | Stage only, for `export-video.mjs`. |
| `auto=0` | Standalone: stop at the end of each chapter instead of advancing. |
| `speed=<x>` | Playback speed. |

Changing chapter rewrites the URL to the current `scene` and keeps the other parameters (`t` is dropped; `theme` is kept unless it is the default).

Dev bar (standalone only): play and pause, scrub, time readout, speed, theme cycle, auto-advance toggle, replay. Scene and actor scripts get a cache-busting query only on `localhost` or `127.0.0.1`.

## Keyboard and accessibility

- The stage (`#wt-root`) is `inert` and `aria-hidden`: it is a picture of the product, so its copied controls cannot be focused or read out as real ones. The stage container is `role="img"` with the chapter's `alt` (falling back to title and takeaway) as its label, and `alt` is also in the caption's live region.
- The caption's chapter number, title and takeaway sit in an `aria-live="polite"` region, so a chapter change is announced.
- A pause button sits in the caption in every mode. Space pauses and plays when focus is not on a control. Left and Right arrows change chapter. Escape skips in embed mode.
- In embed mode, Tab cycles inside the caption controls (the iframe covers the host page), and `start` moves focus to Next.
- Reduced motion: see `reducedMotion` above.

Not covered: right-to-left layouts, and screen-reader testing with a real reader. Do both before claiming accessibility for a shipped tour.

## `window.__player`

| Member | Use |
|---|---|
| `ready` | `true` once scenes are loaded and the first chapter is mounted. Wait for it. |
| `errors` | Every exception from a scene, the actor or the player. Checks fail on it. |
| `missing` | Scene or actor files that failed to load. |
| `themes` | Theme ids from the config. |
| `scenes()` | `[{ id, title, takeaway, alt, cta, duration }]` in play order. |
| `set({ scene?, t?, theme? })` | Jump and render synchronously; pauses when `t` is given. Returns `state()`. |
| `state()` | `{ scene, index, t, theme, playing, started, reduced }`. |
| `play()`, `pause()` | Transport. |

## Embed protocol

The product hosts the player in an `<iframe>` with `?embed=1`. Messages carry `source: "walkthrough"`. The player only accepts messages whose `event.source` is its parent and, when `parentOrigin` is set, whose origin matches. The host should check `event.source === iframe.contentWindow` and the origin the same way.

Player to host:

| Message | When | Payload |
|---|---|---|
| `chapter` | A chapter mounted | `index`, `id`, `total` |
| `ready` | First render of a chapter after load, reset or resize | `index`, `actor` (rect in the iframe viewport, or `null`) |
| `cta` | The viewer pressed the chapter's CTA | `href`, `id` |
| `tour-done` | Last chapter ended, Finish, Skip or Escape | `skipped`, `index`, `id`, `total`, `actor` |

Host to player:

| Message | Effect |
|---|---|
| `{ type: "reset", theme }` | Back to chapter 1, paused, actor hidden. Send before every replay. |
| `{ type: "start" }` | Play and fade the actor in, focus Next. Send after `ready`. Nothing plays before it, arrow keys included. |
| `{ type: "theme", theme }` | Switch theme, keeping the chapter and time. Forward every host theme change. |
| `{ type: "goto", index }` | Jump to a chapter and play. |
| `{ type: "skip" }` | End now; the player answers with `tour-done` (`skipped: true`). |

## Host integration checklist

`templates/host-embed.html` is a working example.

- Full-viewport `<iframe>` (or a sized one) with `border: 0; background: transparent`. The iframe keeps product CSS from leaking into the host page and the host's CSS out of the replica.
- First run: set `src` with `embed=1&theme=<current>`; the player sends `ready` once loaded. Later runs: send `reset`, wait for `ready`, then `start`.
- Show the iframe on `ready`, then `focus()` it so arrow keys and Escape reach the player. Escape pressed while focus is on the host should send `skip`.
- On `tour-done`: hide the iframe, return focus to the control that started the tour (or the next logical field), and store what happened (`skipped`, chapter reached) so the product does not auto-open the tour again.
- On `cta`: resolve `href` against the host's origin and navigate only if the origin matches; then close the tour and send `reset` so the hidden player stops. The player itself only sends hrefs that are same-origin paths.
- Forward theme changes with `theme`.
- Lazy-load: create the iframe only when the tour is about to open. Product CSS bundles are large.
- Set `parentOrigin` in `tour.config.js` to the host's exact origin, check the host's expected player origin, and serve `player.html` with `Content-Security-Policy: frame-ancestors <host origin>` so other sites cannot frame it. Run `node checks/ship-check.mjs`.
- Return state: `tour-done` says whether the viewer skipped and how far they got. Store it so the tour does not reopen by itself, and decide with the owner whether a later "Replay the tour" resumes at that chapter (`goto`) or starts over.

## Tuning knobs

When the owner should settle feel by eye (speeds, delays, easing, mascot proportions), expose the values as live knobs in the lab page: a side panel of sliders and selects bound to one settings object `S` that `frame()` reads every frame, plus a **Copy settings JSON** button that writes `JSON.stringify(S)` to the clipboard. The owner tunes, copies, pastes the JSON into chat, and the values become constants in the shipped code. Knob panels stay in the scratch lab; they never ship.

## Porting into the product

The scratch player proves the tour. Shipping it means the owner choosing one of:

1. **Serve the player as a static page** from the product (`/tour/player.html`), embedded by iframe. Least work; the replica keeps its own copy of the product CSS, which drifts as the product changes.
2. **Rebuild chapters as product components** that render the real components with demo data. No drift, more work, needs the product's build.

Whichever is chosen, copy only what ships into the repo (player, config, scenes, actor, assets), leave the checks and labs behind, and delete the scratch folder once the port is merged.

### Keeping a shipped replica honest

Option 1 drifts: the next product deploy can change a screen the tour copies, and nothing fails. Before shipping, agree with the owner:

- **An owner** for the tour, by name.
- **A trigger to re-check.** Cheapest: record a hash of each production CSS file the tour copies, and re-run `classcheck.mjs` against the live bundle and `review-all.mjs` whenever the hash changes or a release touches a replicated screen. Re-read live lists (model names, plans, limits) at the same time.
- **A rule for when it is stale.** Update the chapter, or remove it from `chapters` until it is updated. A chapter showing UI that no longer exists does more harm than a shorter tour.
