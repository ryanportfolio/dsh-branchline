# Scene contract

This is the contract every chapter follows, and the text to brief builders with. Copy it into the scratch folder as `SCENES.md`, fill in the bracketed parts, and hand it to each builder with [builder-brief.md](builder-brief.md).

---

## Chapter scene contract for [product]

The player (`player.html`, served at [http://127.0.0.1:PORT/player.html]) plays short animated chapters that replay real [product] screens. Each chapter rebuilds its screen with the **production stylesheet** ([files listed in tour.config.js]) and the **real component markup** copied from the source in [repo path]. The guide, [a cursor | the mascot NAME, short description], performs the actions.

### Files

One plain script per chapter: `scenes/<id>.js`, and the scene's `id` must equal the file name (chapter order comes from the file names in `tour.config.js`). No imports, no modules, no build step at load time (a scene may be generated from a source file by `checks/build-scene.mjs`, but the output is a plain script). The player loads the files listed in `tour.config.js` `chapters`. Edit only your own scene file; never `player.html`, the product CSS, `tour.config.js` or another chapter. If you need a helper the player lacks, define it inside your scene.

```js
(function () {
  (window.SCENES = window.SCENES || []).push({
    id: "ch5-read", order: 5,
    title: "Read actively",                           // verb-led: what the viewer can do
    takeaway: "Highlight lines and send them to your notes.", // one line, 14 words or fewer
    cta: { label: "Open your library", href: "/library" },     // a same-origin path that exists
    alt: "The cursor selects two sentences, clicks Add to notes, and the note appears in the side panel.", // what it shows, for screen readers
    duration: 9000,                                   // ms
    mount(root, ctx) {                                 // build the DOM once
      return {
        frame(t) { /* render the state at t, 0..duration; a pure function of t */ },
        destroy() {},
      };
    },
  });
})();
```

### Stage

- `root` is a [1200 x 720] CSS px box. The player scales it to fit; work in stage coordinates. It carries the app's root classes, and `<html>` carries the current theme's class or attribute, so the app's theme-aware classes and CSS variables render each theme correctly with no extra work.
- Show the part of the real screen the chapter needs, cropped and composed for the stage. A slim version of the real header helps orientation; copy its markup too.
- Real markup and real classes only. Open the component in the source, copy its structure (`className` → `class`), keep its utility classes, inline its icons, take its strings from the translation file. Do not invent a different visual style. Do not invent UI the product lacks.
- Demo content is short, specific and plausible, and readable at the pace it appears.
- The result of the guide's action plays as a story on the screen's own elements, written in one sentence in the beat sheet: "the new note lands at the top of the panel and the older ones step down one slot". The story table in the motion-design skill's `references/ui-loops.md` lists one per kind of visual (stack, chart, list, calendar, prompt, counter). Text changes only where the change is the point: typed input, streamed answers, counters that land on the product's real value.
- Everything else on the screen stays at rest. A chart or list that is not the result of this chapter's action does not move, so it never competes with the guide.
- A moving element smaller than about 4 px at the smallest size the tour ships (the embed on a 1366 x 768 laptop, or the export) gets enlarged within the product's style, or the story uses a bigger element.

### Determinism

`frame(t)` renders the state at `t` from scratch, so the viewer and the review scripts can scrub backwards and forwards and get the same picture. It receives only `t`; there is no frame delta to accumulate.

- Derive everything from `t`: text by slicing strings (`OB.typed`, `OB.stream`), visibility and transforms from `OB.prog` and easing, list contents from which beats have passed.
- No state carried between frames: no `+=` on positions, no counters, no "already played" flags that are never reset when `t` goes back.
- No `Math.random()`; use `OB.rand(seed)` and reseed from `t` or a constant.
- Set `transition: none` on every element you animate. Product CSS often has `transition-colors` or `transition-all`, which makes a scrubbed value lag behind `t` and breaks the check.
- Do not rely on CSS `@keyframes` animations (spinners, pulses) for anything the viewer reads: they run on wall time. Drive them from `t` instead.
- Write to the DOM only when a value changes. `OB.writer()` returns a cached `set(el, prop, value)` for that.
- Measure layout once at mount if you need it, never per frame.
- Leave nothing behind outside your root: no styles on `<body>` or `<html>`, no globals another chapter reads. `checks/determinism.mjs` compares each chapter's first frame on a fresh page with its first frame after another chapter has played, and after a replay from the end.

### Helpers on `ctx`

- `ctx.OB`: `clamp(x,a,b)`, `lerp(a,b,u)`, `prog(t,start,dur)` → 0..1, `ease(name)` → function (`"out"`, `"in"`, `"inOut"`, `"back"`, `"spring"`, `"linear"`), `track(keys,t)` interpolates keyframes `[{t, ...numbers, ease?}]` (missing fields carry over), `typed(text,t,start,cps)`, `stream(text,t,start,wps)`, `h(html)` → element, `rand(seed)` → seeded random function, `writer()` → cached DOM setter.
- `ctx.actor(keys)`: the guide's path for the whole chapter, given once at mount: `[{t:0, x:1260, y:420, size:56, expr:"idle"}, {t:880, x:..., y:..., expr:"curious", ease:"out"}, {t:900, tap:true}, {t:1100, tap:false}, ...]`. `x`, `y` are the actor's centre in stage px. `tap:true` at a key plays a press and a ripple at the actor's tip. Optional fields: `opacity`, `lookX`, `lookY`, `excite`. Fields carry over from the previous key.
- `ctx.aim(x, y, size)` → the centre position that puts the actor's tip on stage point `(x, y)`. `ctx.tipOffset(size)` is the raw offset.
- `ctx.rect(el)` → the element's rect in stage px. Use it to measure targets while building, then hard-code the numbers.
- `ctx.theme`: the current theme id (read only). The player remounts the scene when the theme changes.

### The guide

- Aim taps with `ctx.aim` at the centre of the real control. Measure the target from a spot screenshot or `ctx.rect`; guessed coordinates miss.
- Confirm every tap moment with a spot shot at `t = tap + 60`: the tip and ripple sit on the control.
- Never park the guide over text the viewer is reading. Move it aside while text types or streams, and rest it beside results, not on them.
- Move with intent: one path per action, eased out on arrival, a short pause before a tap so the eye can land.

### Caption copy

- Title: verb-led, what the viewer can do.
- Takeaway: one line, 14 words or fewer, true in the product, with any condition stated ("On YouTube videos, ...").
- CTA: a label plus a same-origin path that exists (`/library`, never a full URL).
- Alt: one or two sentences saying what the animation shows, in plain words. The stage is inert and hidden from screen readers, so this is the only way they learn what happens.

### Accessibility

The player hides the stage from assistive tech and makes it inert, so copied `<button>` and `<a>` markup cannot be focused. Do not undo that (no `tabindex`, no focus calls inside the scene). Keep demo text readable at the stage's scaled size: nothing under 12 px in stage coordinates.

### Visual check

Each builder owns one browser: launch Chrome through the check scripts (`checks/spot.mjs`, `checks/review-all.mjs`), which open headed Chrome offscreen and muted. Never use a shared browser tool (an MCP browser or an app's built-in browser pane): another agent may own it. Screenshots go to [<screenshots>\project\walkthrough\<scene id>\]. Look at several `t` values in every theme, including the moments mid-transition, and fix what looks wrong before reporting. `window.__player.errors` lists anything your scene threw.

```bash
node checks/spot.mjs --url http://127.0.0.1:PORT/player.html --out <screenshots>/project/walkthrough/ch5-read --name t4000 "scene=ch5-read&t=4000&theme=light"
node checks/determinism.mjs --url http://127.0.0.1:PORT/player.html ch5-read   # every theme
node checks/ship-check.mjs --allow-star-origin                                   # id, alt, CTA, takeaway length
node checks/classcheck.mjs --css app.css scenes/ch5-read.js
```

### Facts you may state

Only what the inventory cites ([inventory.md]). Model names, plan names and limits come from the live product. [Product-specific rules: names that must never appear, features that must not be shown.]
