# A deterministic web animation engine

This is the architecture used in the "Cold Boot" animatic for harnessfirmware.com (2026-09). It ran 22,000 particles through 7 chapters over 76 s at 100 fps (the display refresh) in headed Chrome, with the particle math on the CPU in plain JavaScript. [engine-skeleton.html](../assets/engine-skeleton.html) is a working, cut-down copy.

## Core idea: every frame is a pure function of t

`frame(t)` computes every particle, caption and uniform from `t` alone. That makes the piece scrubbable, pausable, loopable and exportable frame by frame, with nothing to replay. The one piece of state is the phosphor trail buffer, and it is cleared whenever the viewer seeks.

Never use `Math.random()` inside a frame. Seed per-particle randoms once, for example with mulberry32 into `R1..R4` Float32Arrays, and read them.

## Roles and tracks

- **Roles.** Split the particle pool into fixed index ranges by role, for example SPARK 2%, BUILD 25%, RING 12%, SLAB 16%, AUX 13%, DUST for the rest. A particle keeps its role for the whole film, so its identity survives every morph.
- **Tracks.** Each role has a track, a list of keyframes `{at, dur, stag, fn}`. `fn(t, i, k, n, P)` writes the particle's target state into `P`: `x`, `y`, `b` (brightness), `a` (accent mix), `w` (white mix) and `s` (size). A keyframe fn can itself be time-driven: a spark following a path, a ring filling, blocks joining as they are built.
- **Current keyframe.** Pick the last keyframe with `at <= t` once per role per frame, not once per particle.
- **Staggered morph.** Each particle starts its transition at `at + R[i] * stag * dur` and runs for `dur * (1 - stag)`. Position uses an ease-out with overshoot (back-out, with `c1` as a bounce knob). Colour and brightness use a linear mix.
- **Recursive blend.** When a keyframe begins before the previous transition has finished, evaluate the previous keyframe as its own blend, recursively, with one scratch object per depth. Otherwise the particle jumps. Cap the depth at about 8.
- **Arc.** Add a perpendicular offset of `sin(PI*u) * ARC * (R - .5) * 2` so flights curve and a swarm looks like a swarm, not a tween.
- **Flight glow.** Add `sin(PI*u) * GLOW * min(1, dist/260)` to brightness in flight, so long flights leave phosphor streaks. Scale it by the endpoint brightnesses so a hidden target does not flare.
- **Dust as reservoir.** Unused particles drift as dim ambient dust. `fromDust(P, t, t0, d)` and `toDust(P, t, t0, d, burst)` let a shape gather out of the dust or dissolve back into it inside a single keyframe, for example a block that assembles when the spark reaches it.

## Shapes

- **Filled vector marks.** Rasterise `Path2D` from the SVG path strings into an offscreen canvas at 2x. Split the pixels into edge and fill lists, sample about 50% from each, and store the points in mark-space. Drawing edges brighter than fill gives crisp outlines.
- **Rect outlines, rings, text lines.** Sample these analytically. Pre-sample every shape once per particle count, never inside a frame.
- **Density.** Additive points saturate to white after tone mapping even when they are coloured. Dense outlines need a much lower per-particle brightness. Measured: 1,300 amber points on a 330 px ring needed `b = .2` to stay amber; at `.9` they read as white.

## Rendering (WebGL2)

1. **Points.** `gl.POINTS` with a gaussian sprite and additive blending (`ONE, ONE`) into a half-float target. Use `EXT_color_buffer_float` when available, else RGBA8. Size is `POINT_SIZE * canvasWidth / 1920`.
2. **Phosphor feedback.** Each frame, draw the previous target multiplied by `k = TRAIL^(dt*60)`, which keeps the decay the same at any frame rate. Then add the points with gain `1 - k`, so steady brightness does not depend on trail length. **On seek:** clear the target and draw that one frame with gain 1, so the image appears at full brightness instead of fading in over about 1/(1-k) frames.
3. **Bloom.** Run separable 9-tap blurs at quarter and eighth resolution, and add them to the composite.
4. **Composite.** `1 - exp(-x * 1.25)` tone mapping, a small white bleed on the brightest channel, a vignette, animated grain and a global fade. Add the ink background colour before the vignette. This curve works per channel, so bright saturated colours drift toward the secondaries and white; for exact brand hues use Khronos PBR Neutral ([color-light.md](color-light.md)). Dither by about 1 LSB just before output so dark gradients don't band.
5. **Resolution.** Cap device pixel ratio at 1.5. Re-create the targets on resize and mark a reset.

## Keeping camera, shake and sound seekable

Anything that integrates over frames breaks `frame(t)`. Make each of these a function of `t`:

- **Camera follow.** No stateful spring or per-frame lerp. Evaluate the follow in closed form from the last camera keyframe, so any `t` gives the same pose (camera-cut.md).
- **Shake.** Trauma is a sum of hit contributions, each decaying linearly from its hit time; shake samples seeded Perlin noise at `t`. Never `Math.random()` (impact-fx.md).
- **Handheld noise.** Three seeded noise layers per axis at 0.1 to 0.5, 0.8 to 1.5 and 3 to 4 Hz, rotation first (camera-cut.md).
- **Music.** Read beat and onset times from an offline `beats.json`; never analyse audio live (sound.md).
- **Reduced motion.** Only when the owner asks for it: read `prefers-reduced-motion` once at load and scale shake, zoom and parallax to 0 (accessibility.md).

## Motion blur

Accumulate sub-frames: HeyGen's HyperFrames engine defaults to 16 samples per frame (maximum 64), a 180-degree shutter and a -90 degree phase, so the window spans a quarter frame either side of the frame instant. It averages samples as they arrive, skips extra samples on static frames, and blends in sRGB by default, because linear light "diverges ... on high-contrast edges" from After Effects ([PR 4019](https://github.com/heygen-com/hyperframes/pull/4019)). A 180-degree shutter exposes for half the frame time ([RED](https://www.reddigitalcinema.com/red-101/shutter-angle-tutorial)). Raise the sample count until the fastest element moves about 1 px or less between sub-frames (inference), and skip blur on type holds.

## Browser API choice

| Job | Use | Status, 2026-09 |
|---|---|---|
| UI transforms and opacity | CSS or WAAPI, which can run on the compositor ([Motion](https://motion.dev/docs/performance)) | stable |
| Thousands of particles | canvas or WebGL from rAF; for "thousands of small elements" DOM animation loses ([Motion](https://motion.dev/magazine/web-animation-performance-tier-list)) | stable |
| State morphs in one page | View Transitions | Baseline since 2025-10-14 ([web-features](https://raw.githubusercontent.com/web-platform-dx/web-features/main/features/view-transitions.yml.dist)) |
| Cross-page transitions, scroll-driven animation | `@view-transition`, `animation-timeline` | no Firefox; ship a fallback |
| Custom easing curves | CSS `linear()` | Baseline high since 2026-06-11 |

Writing a CSS variable every frame always triggers paint; 1,300 elements cost 8 ms per frame in Motion's test.

## Text in WebGL

- Use multi-channel signed distance fields (MSDF) for titles; they keep corners sharp when scaled. Keep `screenPxRange()` at 2 or more at the smallest on-screen size, since below 2 "the anti-aliasing will fail" ([msdfgen](https://github.com/Chlumsky/msdfgen/blob/master/README.md)). Bake about 32 to 48 px per em with a pixel range of 4, mipmaps off ([Red Blob Games](https://www.redblobgames.com/x/2403-distance-field-fonts/)).
- troika-three-text uses plain SDF with `sdfGlyphSize` 64 by default; raise it to 128 for thin display faces ([troika](https://protectwise.github.io/troika/troika-three-text/)).
- Split DOM text into spans only after `document.fonts.ready`, or the layout shifts ([GSAP SplitText](https://gsap.com/docs/v3/Plugins/SplitText/)).

## Captions and transport

- **Overlay.** A 1920x1080 DOM overlay scaled by `stageWidth / 1920` sits over the canvas. That gives real fonts, crisp text and selectable, accessible copy.
- **Caption records.** Each caption is `{a, b, cls, x, y, html}` with times from chapter-relative seconds. Opacity comes from `t`: ease-out in, smoothstep out over the last 0.45 s.
- **Statements.** Split words into spans, including the words inside `<em>`, and stagger them 70 ms, each rising a few pixels. Set a max-width wide enough that no word is orphaned.
- **Chapter scaling.** Write events in default chapter seconds and map them with `L(chapter, sec) = start + sec * dur / defaultDur`. A duration knob then stretches a chapter without editing any events.
- **Transport.** Play/pause (Space), ←/→ to step 1 s, `[` `]` to jump chapters, a scrubber with chapter ticks, and a speed selector. Expose `window.__anim = {seek, pause, t}` so scripts can drive it.

## Gotchas measured in practice

- `-(x)**2` is a SyntaxError in JavaScript ("unary operator before exponentiation"). Write `-((x)**2)`.
- A `file://` page blocks relative `@font-face` loads in Chrome. For a single-file lab, inline the fonts as base64 data URLs with a small build script.
- The Playwright MCP blocks `file://` and only writes inside the workspace. Drive verification from your own Playwright script instead (see verify-export.md).
- A still taken while paused shows the converged frame, not the motion trails. Judge motion by playing.
- 22,000 particles with per-particle closures and one recursive blend per transition cost well under a frame at 100 Hz. Profile before moving the morph to the GPU.

Measured on the CoreWise promo (2026-09-28: 12,000 CPU particles as instanced quads, 94 s, 2.7 ms render at 1920x1080 on an RX 6600 XT):

- **Atlas UVs flip vertically.** A 2D-canvas word atlas uploaded without `UNPACK_FLIP_Y` has row 0 at the top, so a quad whose top corner samples `(y + h) / H` draws every glyph upside down. Map the top corner to `y / H`.
- **Sub-pixel particles shimmer.** Clamp the drawn radius to about 0.7 device px in the vertex shader and scale alpha by `(r / minR)^2`, so energy stays constant and nothing strobes as particles shrink.
- **Grain breaks determinism if it reads a frame counter.** Seed it from `round(t * fps)`; the same `t` then gives bit-identical pixels after any seek (measured mean abs diff 0).
- **Keep brand colours exact under tone mapping.** Compose `bg + (1 - bg) * (1 - exp(-light))`, a screen blend of the tone-mapped light over an untouched background, so background and UI hex values survive and only the light is tone-mapped.
- **Two UI layers.** A back 2D layer under the light (cards, tiles) and a front layer over it (captions, labels). Particles then glow over panels without washing out the words.
- **Caption scrims.** A radial gradient drawn with `fillRect` smaller than the gradient radius leaves a hard edge. Translate, `scale(1, ry / rx)`, and fill a square that fully contains the circle.
- **Intermediate states collide.** An element on an orbit crossed a caption panel only mid-orbit. Capture mid-transition times as well as key poses.
- **Tooling.** `npm i --no-save <pkg>` in a folder without package.json prunes the packages an earlier `--no-save` install added. Install every tool package in one command.

Measured on the MAIMCOIL game trailer (2026-09-29: a WebGL2 block renderer with lit, emissive voxel blocks, filmic tone mapping, bloom, depth of field and haze):

- **Reset every per-frame field in the frame reset.** The end slate set the vignette strength to 0.75 and nothing reset it to the 0.55 default, so seeking back from the end rendered earlier shots darker at the edges than a fresh load did. Any field a scene can write goes in the reset block at the top of `frame(t)`, with its default.
- **Round the clock before comparing it with event times.** A seek to 35.98 s computed 2379.999 ms of scene time and landed one step before a beat at 2380 ms. Rounding the scene clock to 1 microsecond (`Math.round(t * 1e6) / 1e6`) before any `>=` test fixed it.
- **Filmic tone mapping bleaches saturated emissives.** Bright, saturated emission ran into the curve's shoulder and drifted toward white: orange read salmon, red read pink, lime read khaki. Keep emissive gain below the shoulder, give each block separate albedo and emission colours, and measure hue and saturation from stills against the brand hex (see verify-export.md).
- **Coloured light multiplies with a same-hued albedo.** An orange point light on an orange albedo read red, because the product of the two pushes the weaker channels down. Make glowing parts mostly emissive with a low albedo.
- **Depth of field inflates small particles.** Particles near or above the camera turned into large soft blobs. Keep ambient particles inside the focus band.
- **Haze and god rays veil the frame.** Gamma lifts the long tail of exponential haze into a grey veil over the whole image, and god rays without a screen-space falloff from the light do the same. Fade the rays with distance from the light's screen position, and judge haze strength on gamma-encoded stills, not on linear values.
- **ANGLE on D3D11 rejects branchy fragment shaders.** Chrome on Windows failed with "Error compiling dynamic pixel executable" on if / else-if chains and on texture reads inside branches. Keep fragment shaders branchless: select with `mix` and `step`, and sample textures unconditionally.
- **Global look changes live in master constants.** Bloom, streaks, depth of field, motion blur and haze each get a master scale constant. Retune the film by changing those, not by editing every shot.
- **Opaque blocks cannot alpha-fade.** An opaque block drawn with depth writes has no alpha to fade. Remove text and debris with a dissolve, a squash to a line, or an emission fade.
- **Free every GPU object before reallocating on resize.** Framebuffers, renderbuffers and depth textures all leak if only the colour textures are deleted. Wrap in-page video export in `try/finally` so a thrown error restores the render loop instead of freezing it.
- **Flat sprites on the floor read as pancakes.** Pixel sprites laid flat looked like decals from trailer camera angles. Extrude them into voxel sprites with volume on both sides and stand them upright.
