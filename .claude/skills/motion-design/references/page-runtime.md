# Page runtime: 3D embed shield + motion switch

Two drop-in scripts for a live page with several moving layers (3D embed, film, code-drawn motion). Ideas from the Living Site skill (Notion, 2026-10); code written fresh, nothing copied. Plain browser JS, no build step, no dependencies.

## 3D embeds: `assets/iframe-shield.js`

Canvas inside an iframe (Spline, Sketchfab, any WebGL embed) takes wheel + touch-drag → page stops scrolling under cursor. Transparent layer over iframe takes those events → page scrolls.

```html
<section style="position:relative;height:100vh">
  <iframe data-shield src="https://my.spline.design/..." style="width:100%;height:100%;border:0"></iframe>
</section>
<script src="iframe-shield.js"></script>
```

- `data-shield`: plain. Scene plays its own animation; no input reaches it. For ambient scenes.
- `data-shield="forward"`: also forwards pointer to scene by `postMessage`, addressed to iframe's own origin only: `{ shield: 'move'|'down'|'up'|'leave'|'click', x, y }`, x/y 0 to 1 of iframe box. Only for scenes you control. Skips file:// and sandboxed frames (origin `null`) and iframes with no `src` yet (lazy load).
- Shield covers the iframe's own box (offset from its parent, refit by ResizeObserver), so links, buttons and other iframes in the same parent stay reachable.
- Iframes added after load: `IframeShield.attach(iframe)`.
- Keyboard: iframe stays in tab order; shield blocks only pointer.

Receiver, paste into scene page (Spline: its HTML content document, after scene ready). Allowlist your site's origins; never accept any origin, since the message drives input:

```js
const PARENT = ['https://example.com', 'http://127.0.0.1:8701'];
const TYPES = { move: 'pointermove', down: 'pointerdown', up: 'pointerup', leave: 'pointerleave', click: 'click' };
addEventListener('message', e => {
  if (!PARENT.includes(e.origin)) return;
  const d = e.data;
  if (!d || typeof d.shield !== 'string' || !Object.hasOwn(TYPES, d.shield) || !Number.isFinite(d.x) || !Number.isFinite(d.y)) return;
  const type = TYPES[d.shield], x = d.x * innerWidth, y = d.y * innerHeight;
  const target = document.elementFromPoint(x, y) || document.body;
  target.dispatchEvent(new (type === 'click' ? MouseEvent : PointerEvent)(type, { clientX: x, clientY: y, bubbles: true }));
});
```

Measured 2026-10-28, headed Chrome, page and scene on two origins, scene canvas calling `preventDefault` on wheel: wheel over shielded scene scrolled page 400 px; shield removed → 0 px (trap reproduced). Forwarded click arrived at exact scene coordinates; plain-shield scene received nothing. Two sibling iframes beside a button in one parent: each shield matched its iframe's box exactly, the button stayed clickable, and pointer moves reached only the scene under the cursor. Not tested with a real Spline scene: source skill reported its runtime reacting to forwarded events via a full-screen element; check once per new scene.

Spline notes from source skill, unverified here:
- One 3D showpiece per page, two at most. Characters and brand marks beat abstract props; matte beats glass when small (glass reads low-res).
- Community scene: its page holds an iframe with a public `app.spline.design/file/<inner-id>?view=preview` link (community id itself is not). Credit author in footer. Never edit someone else's file; embed or remix into own account.
- No "click to play" or "move your cursor" hints over 3D.
- Crop viewer chrome by oversizing iframe; melt bottom edge into page: `mask: linear-gradient(#000 72%, transparent 98%)`.
- Heavy scene can take ~10 s: fade iframe in on load over a soft CSS glow placeholder. Below the fold: `data-src` + IntersectionObserver, `rootMargin: '1200px 0px'`, then `IframeShield` still covers it (forward mode waits for `src`).
- Spline MCP (connector) Pro plan: 200 tool calls a day, resets 00:00 UTC; custom scene ≈ 6 to 10 calls. Default play camera exports blank → add `PerspectiveCamera`, set rotation explicitly, `setPlayCamera`. Light shadows off (GPU errors, late or blank render).

## Motion switch: `assets/motion-switch.js`

One Off / On / X-ray control for whole page. X-ray labels each moving part with what it is and how it was made: shows a client which layer did what.

```html
<div data-motion-switch></div>
<video src="film.mp4" autoplay muted loop playsinline data-xray="Scroll film, 3 chained clips" data-xray-tool="generated video"></video>
<script src="motion-switch.js"></script>
<script>Motion.on(m => m === 'off' ? diagram.showFinal() : diagram.play());</script>
```

- Mode, first match wins: `?motion=on|off|xray` → visitor's saved choice (localStorage `motion`) → `prefers-reduced-motion` gives off → on. `<html data-motion>` mirrors it for CSS. OS setting followed live while visitor has picked nothing.
- Reduced motion is a floor, matching the live-page rule in web-effects.md: picking On or X-ray under `prefers-reduced-motion` lifts the switch's own pause and notifies subscribers, but the switch pauses native `autoplay` video (also when the OS setting turns on after a choice) and web-effects recipes keep their reduced-motion fallbacks (poster, still). A piece that wants to play anyway decides that in its own `Motion.on` handler.
- `off`: every `<video>` pauses and CSS animations are removed (`.motion-paused *{animation:none!important}` ships in the script), so each element shows its visible rest state. Pausing instead would freeze `fill-mode: both` entrances on their hidden first frame when a page loads with Off. On replays entrances once. Each piece shows its finished still. Pieces that own their videos: leave out `autoplay`, drive them from `Motion.on`.
- Same pause contract as the pause button in [web-effects.md#shared-conventions](web-effects.md#shared-conventions): off sets `<html class="motion-paused">`, and every change fires `motionchange` on `document`. Recipes there (background video, loops, scroll-scrubbed video) stop and resume with the switch. Use the switch or that button, not both.
- `xray`: everything plays; each `[data-xray]` gets dashed outline + fixed label (`data-xray` · `data-xray-tool`) at its top-left, repositioned every frame while X-ray is on.
- API: `Motion.mode`, `Motion.set(mode)`, `Motion.on(fn)` (runs `fn(mode)` now and on every change, returns unsubscribe). Define pieces before or after script: `on` works either way, fires once per change.
- Key M cycles, ignored while typing in input, textarea, select, contenteditable, or with Ctrl/Alt/Meta.
- Buttons: `role="group"` + `aria-pressed`, visible focus ring, 26 px tall. Restyle `.motion-switch` to the page.
- Screenshots: `?motion=off` for still, `?motion=xray` for labelled.

Fits live-page rule ([web-effects.md#shared-conventions](web-effects.md#shared-conventions)): effects on live pages honour reduced motion → default off. Films and animated pieces shown alone keep their own rule (SKILL.md, Control).

Measured 2026-10-28, headed Chrome: fresh load on; Off button → video paused, `aria-pressed` moved, choice saved, kept after reload; M → xray, two labels at element corner (+6 px); typing "mm" in a field left mode unchanged; `?motion=off` overrode saved xray; reduced motion → off by default, then followed OS change to on; subscribers fired once per change. With the scroll-scrub recipe from web-effects.md on the page: Off → `motion-paused` set, `motionchange` fired, poster opacity 1, canvas 0; On → reversed. In that browser the scrub canvas did not redraw on scroll on either this branch or main, so resume-to-current-frame is unverified.
