---
name: motion-design
description: "Animation that must read + feel right: explainers, promos, trailers, hero/UI motion, landing-page effects, generated scroll films, 3D embeds, component transitions + gestures, UI card loops, kinetic type, WebGL particles, janky animation. Not static layout."
---

# Motion design

Use this skill when motion carries meaning. It covers the story, the timing, the craft rules, a deterministic web engine and how to verify the result. It does not replace live tuning: when the `lab` skill exists, use it to let the user dial in values by eye. When `wow-loop` exists, use it for repeated review-and-repair rounds on one piece.

Motion inside a product (buttons, popovers, tooltips, toasts, drawers, drag gestures) or an animation that drops frames skips the story workflow below: read [ui-components.md](references/ui-components.md) and follow it.

## Workflow

1. **Name the feeling and the job.** Write one sentence saying what the viewer should feel and understand when the piece ends. Choose techniques after that, never before (Jay Grandin).
2. **Write the story before any pixels.** For an explainer, open on a concrete moment instead of a definition, chain the beats with "but" and "therefore", and give each beat one idea. Write a beat sheet with timestamps. See [story.md](references/story.md).
3. **Build an animatic with final timing and rough visuals.** It needs a scrubber, pause and chapter ticks. Get the pacing approved before any polish.
4. **Block the key poses, then polish the in-betweens:** easing, stagger, overlap and secondary motion.
5. **Verify in a real browser on the GPU.** Judge motion by watching it play. Stills only prove layout. See [verify-export.md](references/verify-export.md).
6. **Export to video** when the piece has to travel to feeds that do not run JavaScript. Encode in the page with WebCodecs, never a PNG or screenshot per frame (user instruction, 2026-10-19); see [verify-export.md](references/verify-export.md).

## Decision rules

These are defaults. Tune them by eye.

| Situation | Rule |
|---|---|
| Element arrives | Ease out (cubic or quint). Never scale up from 0: start at 0.9 or larger, or come down from above 1 for a slam. |
| Element leaves | Ease in, at about 75% of the entrance duration. This is for scene and film exits; a UI element that leaves, whether the user dismissed it or it timed out, eases out, faster than it entered ([ui-components.md](references/ui-components.md)). |
| Element moves while on screen | Ease in-out. |
| Physical or playful motion | Use a spring set by `visualDuration` and `bounce`, so it lands on the beat and the bounce plays after it. |
| Duration | Scale it with distance and area. UI: 150 to 300 ms. Scene morphs: 0.8 to 2.4 s. |
| Stagger | Particles: 1 to 2 frames, random offsets from a fixed seed. Words: 60 to 80 ms each. Letters: about 0.75 frame each, and only for typing effects. |
| Rhythm | Put slow drift next to fast snaps. Contrast is what makes a snap land. |
| Holds | Once a caption names what the picture shows, hold the structure still for 1.5 to 2 s. During a hold, allow only motion that changes no shape or layout: shimmer, a slow sway, a twinkle. |
| Continuity | Morph between states instead of cutting, so one object carries its identity through the change. |
| Color | One hue per actor, the same everywhere. For example, builder green and reviewer amber. |
| Text | Browser-only piece: set real DOM text over the canvas and let particles draw pictures. Piece that must export to video: draw text into a 2D canvas layer composited into the frame, so the in-page WebCodecs export carries it; a piece with trail feedback must do this. A piece that keeps DOM text, CSS 3D or several canvases exports by tab capture instead (verify-export.md). Either way, keep a statement to about ten words, with no orphan word on its own line, and set it in a face with character (the brand display or editorial face), not the UI body font. |
| UI cards, dashboard or mockup | Write one sentence per visual saying what it acts out (a list receives an item, a chart is read), and build that story after the intro. Each story starts and ends on the exact design; cards act offset, in reading order. See [ui-loops.md](references/ui-loops.md). |
| Landing-page effect | Background video, seamless or scrubbed loops, glass over footage, entrances, scroll reveals and pinned scroll stages start from the recipe in [web-effects.md](references/web-effects.md). Keep its reduced-motion and touch fallbacks, give autoplaying motion a pause button, and allow one heavy effect per page. |
| Generated video film | One camera move. Chain the keyframes, pin every clip at both ends, gate each clip for cuts and stalls. Dry run first; spend credits only after the owner confirms the total. See [generated-film.md](references/generated-film.md). |
| 3D embed or several moving layers on one page | Shield every 3D iframe so the wheel always scrolls the page, and give the page one Off / On / X-ray switch. See [page-runtime.md](references/page-runtime.md). |
| Anything that loops | Run the seam, empty-hold and rest checks before export, and export frames 0 to `CYCLE * fps - 1`. See [verify-export.md](references/verify-export.md#loop-checks-seam-empty-hold-and-rest). |
| Game trailer | Gameplay by 2 s, hook by 15 s, logo only on the end slate, 90 s or less, cuts on the music's hits. Every system shot shows risk, reward and power spike to someone who never played. See [story.md](references/story.md#game-trailer). |
| Impact | Hitstop plus shake on the victim, not only the camera; hold frames for weight; few, fast smears. Sources in [principles.md](references/principles.md#impact). |
| Control | Anything that loops or runs past 10 s gets pause. Scrub and chapter ticks always exist in the dev build (a `?t=` seek for capture); expose them to viewers only when the owner wants them. Films and animated pieces get no reduced-motion version by default, because motion is the point; build one only when the owner asks, per [accessibility.md](references/accessibility.md). Product UI always honours reduced motion ([ui-components.md](references/ui-components.md#reduced-motion)), and so do effects on live pages ([web-effects.md](references/web-effects.md#shared-conventions)). |
| Flash | At most 3 flashes in any 1 s, or space them 334 ms apart; keep flashed area under about 20% of the frame; no saturated red flashes. A full-screen white or inverted hit frame counts as a flash. |
| Cut pace | Set by what the viewer must read, never a target number. Measured game trailers average 1.3 to 4.25 s per shot. Cut on action, keep the subject in the same screen region across the cut. See [camera-cut.md](references/camera-cut.md). |
| Camera | One camera per shot, every move eased from 0 to speed and back. In 3D, shake rotates and never translates. Longer lens, smaller shake. |
| Enemy attack | Telegraph at least 0.25 s (15 frames at 60 fps), longer for bigger hits, with a distinct pose plus a trail or FX tell. See [impact-fx.md](references/impact-fx.md). |
| Sound sync | Visual hit on the audio hit or up to 1 frame before, never after. Drive beats from an offline beat map. See [sound.md](references/sound.md). |
| Tone mapping | Brand hex needs Khronos PBR Neutral or AgX; ACES and per-channel curves shift saturated hues. See [color-light.md](references/color-light.md). |

## Pitfalls

- Opening on a definition or an architecture diagram before a concrete example.
- Motion that competes with the words: text sliding around while it is being read.
- Everything moving at once with even timing, which reads as mechanical.
- Ease-in on arrivals, scaling up from 0, or preset curves nobody looked at.
- Hard cuts that break an object's identity between states.
- Listing features instead of showing one real task.
- Mock copy where real product data exists, or real data that contradicts a claim on screen (a demo record where one of "all six" models failed).
- Layout checked only at key poses. Collisions show up mid-transition, when an orbiting element crosses a label.
- Static holds that look dead, or constant motion that never lets the eye rest.
- A UI loop that only loads in and then sits there with a few pulses. Every visual needs a story of what it does.
- A loop that stutters at the wrap: a story not back at rest, a field the reset missed, or an export that repeats the first frame at the end.
- A game-system shot that copies the game faithfully but explains nothing to a stranger, or a caption in game jargon (OVERHEAL) instead of the rule (KILLS HEAL).
- Per-frame state that one scene sets and the frame reset never clears, so seeking back renders differently from a fresh load. The same goes for stateful camera springs, `Math.random()` shake and live audio analysis.
- Juice on everything. In a 3,018-player study, both no juice and extreme juice lowered play time and motivation compared with medium and high amounts. Save the biggest shake and flash for one or two moments.
- Decorative motion inside a teaching beat, or narration printed word for word on screen.
- Saturated red text or 1 px coloured lines, which 4:2:0 video blurs.

## Resources

- [principles.md](references/principles.md): who teaches what, with sources, perception and learning research, UI motion tokens, plus the claims that could not be verified.
- [ui-components.md](references/ui-components.md): product UI motion (whether to animate, easing and duration by component, press, popover, tooltip, toast and drawer rules, clip-path patterns, drag gestures), the frame budget and the traps that cause jank. Adapted from Emil Kowalski's MIT-licensed skills.
- [story.md](references/story.md): explainer structure, a beat-sheet template, caption rules and game trailer structure.
- [ui-loops.md](references/ui-loops.md): one story per visual for UI cards, dashboards and mockups, accents, intro choreography, the loop cycle, and live-page rules.
- [web-engine.md](references/web-engine.md): a deterministic `frame(t)` engine with keyframed particle tracks, staggered morphs, phosphor trails, bloom, captions and a transport, plus gotchas measured in practice.
- [web-effects.md](references/web-effects.md): landing-page recipes with cost ratings, reduced-motion and touch fallbacks: background video, fade and boomerang loops, framing and scrims, cursor- and scroll-scrubbed video, glass and grain, fail-safe entrances, scroll reveals, a sticky cinematic stage, stacking cards and a text crawl. Adapted from the MIT-licensed MotionSites technique library.
- [verify-export.md](references/verify-export.md): headed offscreen Chrome, stills, an fps probe, seek and colour checks, loop checks, delivery specs, encoding checks, WebCodecs export (from a canvas, or by tab capture for DOM pieces) and a last-resort frame-stepped export.
- [generated-film.md](references/generated-film.md): AI video films: the cost gate, one camera move, chained keyframes, the clip adapter contract, the continuity gate and its measured limits, living-still loops.
- [page-runtime.md](references/page-runtime.md): the 3D iframe shield with its pointer-forwarding receiver, Spline notes, and the Off / On / X-ray motion switch.
- [accessibility.md](references/accessibility.md): flash limits, photosensitivity testing, and reduced-motion replacements for when the owner asks for one.
- [camera-cut.md](references/camera-cut.md): cutting rules, shot-length data, lenses, camera damping, handheld noise and gameplay capture.
- [impact-fx.md](references/impact-fx.md): shake, hitstop and squash numbers from shipped code, effect timing and readability, enemy telegraphs.
- [color-light.md](references/color-light.md): colour scripts, tone mappers and hue, bloom and dither.
- [sound.md](references/sound.md): music prep, impact layering, sync tolerance, beat maps and loudness.
- [assets/engine-skeleton.html](assets/engine-skeleton.html): a working single-file starting point for the engine.
- [scripts/stills.mjs](scripts/stills.mjs): captures stills at given times and reports console errors and frame cost.
- [scripts/film-chain.mjs](scripts/film-chain.mjs) and [scripts/film-gate.mjs](scripts/film-gate.mjs): build a film from chained generated clips, and check any video for hidden cuts and stalls.
- [assets/iframe-shield.js](assets/iframe-shield.js) and [assets/motion-switch.js](assets/motion-switch.js): drop-in page scripts from page-runtime.md.
