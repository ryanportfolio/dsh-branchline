# Guide actor contract

The actor is whoever performs the actions: a plain cursor (`templates/actors/cursor.js`, the default) or a brand mascot. Scenes never draw it; they give the player a keyframed path with `ctx.actor(keys)` and the player moves, scales and fades the actor, plays taps and ripples, and calls the actor's `frame()` every animation frame.

## Module

One plain script that registers itself:

```js
(function () {
  let uid = 0;
  (window.WT_ACTORS = window.WT_ACTORS || {}).probe = {
    name: "Probe",
    box: (size) => ({ w: size, h: size * 1.2 }),       // host box for a given size
    tip: (size) => ({ x: -size * 0.55, y: size * 0.05 }), // centre → the point that taps
    create(host, opts) {                                // opts.theme = current theme id
      const id = "probe" + (++uid);                     // unique ids per instance
      host.innerHTML = `<svg viewBox="0 0 100 120" width="100%" height="100%">...</svg>`;
      return {
        frame(T, dt, st) { /* pose from T and st */ },
        destroy() { host.innerHTML = ""; },
      };
    },
  };
})();
```

Point `tour.config.js` `actor` at it: `{ src: "actors/probe.js", id: "probe", size: 72 }`.

## What the player passes to `frame(T, dt, st)`

- `T`: seconds on the chapter timeline (deterministic: the same `t` gives the same `T`). Use it for idle motion (bob, blink, glow) so screenshots at a given `t` match.
- `dt`: seconds since the last frame, clamped to 0.05.
- `st.size`: current size in px. The same actor may show at 34 px (a help launcher) and at 260 px (an intro). Below about 48 px drop fine detail and thicken key strokes so the silhouette and face stay readable.
- `st.expression`: `idle`, `curious`, `happy`, `thinking`, `surprised` or `sleepy`. Ease toward a new expression over 200 to 400 ms with `dt`; do not snap. That easing is the only state allowed, and it must settle within half a second so a paused frame is stable.
- `st.press`: 0..1 during a tap, 0 otherwise. Show the press (a dip, a squash toward the tip, a flash at the tip).
- `st.look`: `{x, y}` in -1..1, gaze direction from the keyframes' `lookX` and `lookY`.
- `st.excite`: 0..1, calm to energetic.
- `st.theme`: current theme id. The actor must read on every theme's background.

## Rules

- One inline SVG filling the host, the character centred with about 10% padding. Glows may spill; the host has `overflow: visible`.
- Every gradient, filter and clip id unique per instance (append a counter). Several instances can share a page, for example an intro mascot and the tour's mascot during a handoff.
- Animate attributes and transforms on a modest number of elements, well under 100 per instance. No per-frame DOM creation, no canvas, no large blurred filters.
- Tip offset must match the drawing: a tap at a measured button must show the tip on the button. Check it in a spot shot.
- For a brand mascot: keep it in the product's palette, design both themes, and decide with the owner whether it is cute or restrained. Give it live-tunable knobs (see [player-api.md](player-api.md#tuning-knobs)) while the owner settles its look.

## Handoff between hosts

When an intro scene on the host page owns its own copy of the mascot and the tour takes over inside an iframe, the player's `ready` message reports the actor's rect in the iframe viewport. The host flies its mascot to that rect, sends `start`, and crossfades: the tour's actor fades in over about 300 ms while the host's fades out. On `tour-done` the player reports the actor's last rect, and the host flies its mascot back from there. The player fades its own actor by itself in embed mode.
