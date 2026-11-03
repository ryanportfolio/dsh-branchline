# Web effects: landing-page video, scroll and glass

Recipes for the effects that carry a marketing or portfolio page: background video, seamless and scrubbed loops, glass over footage, entrance choreography and scroll-driven stages. Each one keeps its reduced-motion branch, its touch fallback and a cost rating. Product components (buttons, popovers, toasts, drawers) are in [ui-components.md](ui-components.md); films and loops rendered by a `frame(t)` engine are in [web-engine.md](web-engine.md).

Adapted from the technique library in [Motionsites-AI/claude-skill](https://github.com/Motionsites-AI/claude-skill) (`plugins/motionsites-web-builder/skills/motionsites-web-builder/references/techniques/`, commit `faa30d5`, read 2026-10-26), MIT licence in [web-effects.LICENSE](web-effects.LICENSE). Only its techniques folder was used; the `examples/` and `media/` folders, which are not MIT-licensed, and its craft, spec and review files were not. Its taste rules (which effects to pair, one signature per page) were left out: direction comes from the brief, `design-brief` and `showpiece`. Its limit of one heavy effect per page is kept, as a performance budget. Values marked as source values are that library's practice, not standards; tune them by eye. Several recipes were rewritten here to cost less; those changes are called out. The decision rules in [SKILL.md](../SKILL.md) still apply; where this file and SKILL.md disagree, SKILL.md wins.

## Cost and budget

| Cost | Meaning on a mid-range phone |
|---|---|
| light | CSS or a little event-driven JS |
| medium | Per-frame work while scrolling, filters, or extra media |
| heavy | Large frame caches, several videos, animated filters on bitmaps, or WebGL |

Allow at most one heavy effect per page. Measure frame time with the page's real media before adding a second medium one to the same viewport.

## Shared conventions

```css
:root{
  --ease-out-expo:cubic-bezier(.16,1,.3,1);   /* entrances, panels, media settle */
  --ease-out-quint:cubic-bezier(.22,1,.36,1); /* carousels, fills, menus */
  --ease-reveal:cubic-bezier(.25,.1,.25,1);   /* scroll reveals */
}
```

- **The rest state is visible.** Hide elements only through `animation-fill-mode: both` or a `.js` class set in `<head>`, so a failed script never leaves a blank page.
- **Scroll handlers are passive and rAF-throttled:** `if (!pending) { pending = true; requestAnimationFrame(update); }`. A loop that smooths toward a target stops once it settles; no recipe here runs a permanent `requestAnimationFrame` loop.
- **Read all rects, then write all styles** in one frame, never interleaved.
- **Sticky needs unclipped ancestors.** `overflow:hidden` on any ancestor kills `position:sticky`; use `overflow-x:clip` on wrappers.
- **Pause what is off screen.** Every autoplaying video gets an IntersectionObserver that pauses it outside the viewport.
- **Reduced motion.** These effects run on live pages, so they honour reduced motion, unlike films where motion is the content. The default is `ui-quality`'s rule MO1: decorative and scroll-driven movement stops or becomes an opacity fade, and the final state still shows. The source kept scroll-linked mappings (scrubbed video, the cinematic stage, the crawl) under reduced motion and only dropped smoothing; each recipe below says what it does instead.
- **Pause control.** Autoplaying motion that runs longer than 5 s beside other content (background video, loops, animated grain) gets a visible pause button (MO2, WCAG 2.2.2; the Control row in [SKILL.md](../SKILL.md)). One button can stop everything on the page:

  ```html
  <button class="motion-toggle" type="button" aria-pressed="false">Pause motion</button>
  <script>
    document.querySelector('.motion-toggle').addEventListener('click', (e) => {
      const paused = e.currentTarget.getAttribute('aria-pressed') !== 'true';
      e.currentTarget.setAttribute('aria-pressed', String(paused));
      document.documentElement.classList.toggle('motion-paused', paused);
      if (paused) document.querySelectorAll('video').forEach((v) => v.pause());
      document.dispatchEvent(new Event('motionchange'));   // each video's controller resumes by its own rules
    });
  </script>
  <style>.motion-paused *{animation-play-state:paused!important}</style>
  ```

  Resuming is left to each video's controller, which knows whether its clip is on screen, scrubbed or a reduced-motion still. Every recipe below that calls `play()` checks `document.documentElement.classList.contains('motion-paused')` first and re-applies its state on `motionchange`. Mount plain autoplaying loops through `mountVideo` so they resume too.
- **Touch.** Pointer effects check `(hover: hover) and (pointer: fine)` and fall back to autoplay or a still.
- **Media encoding.** Background clips: H.264 MP4 with `-movflags +faststart`, 6 to 12 s, 5 to 8 MB at most, plus a 720p or smaller encode for phones chosen with `matchMedia('(max-width: 768px)')`. Clips that will be seeked (scrubbed) need short keyframe intervals; see the scrub recipes.
- Where `@supports (animation-timeline: view())` passes, CSS scroll-driven animations can replace the JS for reveals and simple parallax and run off the main thread. Keep the JS path as the fallback.

## Index

| Effect | Use it when | Cost |
|---|---|---|
| [Background video layer](#background-video-layer) | Footage carries the hero | medium |
| [Seamless fade loop](#seamless-fade-loop) | A loop shows a hard cut at the wrap | light |
| [Boomerang loop](#boomerang-loop) | A clip that doesn't loop (push-in, bloom, smoke) must loop | light |
| [Framing and scrims](#framing-and-scrims) | The subject collides with copy, or copy needs contrast | light |
| [Progressive bottom blur](#progressive-bottom-blur) | Bottom titles over footage whose colours must stay | medium |
| [Cursor-scrubbed video](#cursor-scrubbed-video) | A turntable or head-turn clip should feel like a 3D object (desktop) | medium |
| [Scroll-scrubbed video](#scroll-scrubbed-video) | Scrolling drives a transformation clip behind sparse copy | heavy |
| [Scene switcher](#scene-switcher) | Visitors pick one of 3 to 5 moods | heavy |
| [Liquid glass](#liquid-glass) | UI floats over moving footage | light |
| [Frosted glass and text on video](#frosted-glass-and-text-on-video) | Text must sit on glass over video and stay legible | light |
| [Grain and texture](#grain-and-texture) | Video, flat colour or gradients look banded or too clean | light |
| [Blur-rise entrance](#blur-rise-entrance) | Every hero's first second | light |
| [Fail-safe entrance system](#fail-safe-entrance-system) | Rich load choreography that must never leave a blank page | light |
| [Viewport reveal](#viewport-reveal) | Every section below the hero | light |
| [Scroll-linked word reveal](#scroll-linked-word-reveal) | A manifesto paragraph read at scroll pace | medium |
| [Pointer parallax layers](#pointer-parallax-layers) | A layered still needs depth | light |
| [Sticky cinematic stage](#sticky-cinematic-stage) | Layered photography tells a story across one long pinned scroll | heavy |
| [Stacking cards](#stacking-cards) | 3 to 5 case studies or steps | medium |
| [Pinned heading with parallax columns](#pinned-heading-with-parallax-columns) | A gallery orbiting a pinned title | medium |
| [Opposing marquee rows](#opposing-marquee-rows) | A wall of work after a portfolio hero | medium |
| [Tilted text crawl](#tilted-text-crawl) | A manifesto over video should read like a film opening | medium |
| [Exclusion-blend fixed UI](#exclusion-blend-fixed-ui) | Fixed UI must stay legible as the page goes video, black, white | light |

## Video

### Background video layer

Medium. A muted clip fills the hero and all UI floats over it.

- `muted autoplay loop playsinline` are all required for iOS autoplay; also set `video.muted = true` as a property.
- Section background `#000` or the clip's edge colour, so nothing flashes before the first frame. `100svh` with a `100vh` fallback.
- Settle-in: `opacity 0, scale 1.05` to rest over 1.8 s `--ease-out-expo`, on the individual `scale` property so `transform` stays free for the framing rules below, or fade the video in at about 2.8 s and let a type intro own the first seconds.
- HLS (`.m3u8`): Safari plays it natively; elsewhere use a pinned hls.js release with `capLevelToPlayerSize: true` so phones never stream 4K, and call the returned cleanup on unmount (it destroys the hls.js instance).
- Reduced motion: no autoplay, the poster or first frame stays as a still. Autoplay can be refused (low-power mode) and the clip can fail to load, so the poster sits on the section background, independent of the video, and must work as the design. Match its position to the video's `object-position`.

```html
<section class="vhero" style="--poster:url(poster.jpg)">
  <video class="vhero__media" data-src="clip.mp4" poster="poster.jpg" muted playsinline preload="auto" aria-hidden="true"></video>
  <div class="vhero__content">…</div>
</section>
```
```css
.vhero{position:relative;min-height:100vh;min-height:100svh;overflow:hidden;isolation:isolate;color:#fff;
  background:#000 var(--poster) center/cover no-repeat}   /* the poster shows even if the video never loads */
.vhero__media{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2;pointer-events:none;
  opacity:0;scale:1.05;transition:opacity 1.8s var(--ease-out-expo),scale 1.8s var(--ease-out-expo)}
.vhero__media.is-ready{opacity:1;scale:1}
@media (prefers-reduced-motion:reduce){.vhero__media{opacity:1;scale:1;transition:none}}
```
```js
/** Returns a cleanup function. */
function mountVideo(video, src, { revealDelay = 0 } = {}) {
  let hls = null, io = null, timer = 0, visible = false;
  const apply = () => (visible && !document.documentElement.classList.contains('motion-paused') ? video.play().catch(() => {}) : video.pause());
  video.muted = true; video.playsInline = true;
  if (/\.m3u8($|\?)/i.test(src) && !video.canPlayType('application/vnd.apple.mpegurl') && window.Hls?.isSupported()) {
    hls = new Hls({ capLevelToPlayerSize: true }); hls.loadSource(src); hls.attachMedia(video);
  } else video.src = src;
  const reveal = () => { timer = setTimeout(() => video.classList.add('is-ready'), revealDelay); };
  video.readyState >= 2 ? reveal() : video.addEventListener('loadeddata', reveal, { once: true });
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) video.pause();
  else {
    video.loop = true;
    io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; apply(); });
    io.observe(video);
    document.addEventListener('motionchange', apply);
  }
  return () => {
    clearTimeout(timer); io?.disconnect(); video.removeEventListener('loadeddata', reveal);
    document.removeEventListener('motionchange', apply); video.pause(); hls?.destroy();
  };
}
document.querySelectorAll('video[data-src]').forEach((v) => mountVideo(v, v.dataset.src));
```

### Seamless fade loop

Light. Native `loop` shows a hard cut when the first and last frames differ. Instead: fade in from black, fade out just before the end, hold black briefly, restart. The same mechanism cycles a playlist.

- Fade 500 ms; 100 ms of black between plays. The source started the fade-out when `duration - currentTime <= 0.55 s`, but `timeupdate` fires only about every 250 ms, so the fade often began with 0.33 s left and snapped to black at `ended`. Here the lead is 0.8 s and the fade-out is shortened to the time actually left.
- Fades run on rAF, never a CSS transition on the video. Each new fade cancels the previous one and starts from the current opacity, so fades never snap. A flag stops `timeupdate` from re-triggering the fade-out.
- `loop` off; the section behind is pure `#000` so the dip reads as intentional.
- Reduced motion: paused still at full opacity. A playlist item that fails to load is skipped; if every item fails, the loop stops on black, so put a poster or colour behind it.

```js
/** Manual loop with rAF fades. Returns a cleanup function. */
function fadeLoopVideo(video, { fadeMs = 500, fadeOutLead = 0.8, gapMs = 100, playlist = null } = {}) {
  let raf = 0, timer = 0, fadingOut = false, gap = false, idx = 0, visible = true, failures = 0;
  const fadeTo = (target, ms = fadeMs) => {
    cancelAnimationFrame(raf);
    const from = parseFloat(video.style.opacity) || 0, t0 = performance.now();
    const tick = (now) => {
      const p = Math.min((now - t0) / ms, 1);
      video.style.opacity = String(from + (target - from) * p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };
  const canPlay = () => visible && !document.documentElement.classList.contains('motion-paused');
  const start = () => { fadingOut = gap = false; failures = 0; if (canPlay()) video.play().catch(() => {}); fadeTo(1); };
  const onTime = () => {
    const left = video.duration - video.currentTime;
    if (!fadingOut && left > 0 && left <= fadeOutLead) {
      fadingOut = true;
      fadeTo(0, Math.max(50, Math.min(fadeMs, (left - 0.05) * 1000)));   // finish before the last frame
    }
  };
  const onError = () => {                                   // skip a playlist item that fails to load
    if (!playlist || playlist.length < 2 || ++failures >= playlist.length) return;
    idx = (idx + 1) % playlist.length; video.src = playlist[idx];
  };
  const onEnded = () => {
    gap = true; cancelAnimationFrame(raf); video.style.opacity = '0';
    timer = setTimeout(() => {
      if (playlist?.length > 1) { idx = (idx + 1) % playlist.length; video.src = playlist[idx]; }  // loadeddata -> start
      else { video.currentTime = 0; start(); }
    }, gapMs);
  };
  if (playlist?.length) video.src = playlist[0];
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { video.pause(); video.style.opacity = '1'; return () => {}; }
  video.loop = false; video.muted = true; video.playsInline = true; video.style.opacity = '0';
  const apply = () => {                                    // visibility or the pause button changed
    if (!canPlay()) { video.pause(); cancelAnimationFrame(raf); return; }   // a running fade freezes with the video
    video.play().catch(() => {});
    if (gap || video.readyState < 2) return;                // start() fades in after loading or the restart
    const left = video.duration - video.currentTime;
    fadingOut ? fadeTo(0, Math.max(50, Math.min(fadeMs, (left - 0.05) * 1000))) : fadeTo(1);
  };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; apply(); });
  io.observe(video);
  document.addEventListener('motionchange', apply);
  video.addEventListener('error', onError);
  video.addEventListener('loadeddata', start);
  video.addEventListener('timeupdate', onTime);
  video.addEventListener('ended', onEnded);
  if (video.readyState >= 2) start();
  return () => {
    cancelAnimationFrame(raf); clearTimeout(timer); io.disconnect(); video.pause();
    document.removeEventListener('motionchange', apply);
    video.removeEventListener('error', onError); video.removeEventListener('loadeddata', start);
    video.removeEventListener('timeupdate', onTime); video.removeEventListener('ended', onEnded);
  };
}
```

The video's CSS sets `opacity:0` with no transition. In React, put that in the class, not `style={{}}`, so a re-render never resets it, and return the cleanup from `useEffect`.

### Boomerang loop

Light. The clip plays forward then backward with no seam, which reads like slow breathing. Pre-render it and loop the file natively. Each half drops its first frame, so no frame repeats at the turn or where the loop wraps (the source's command showed both twice):

```
ffmpeg -i in.mp4 -filter_complex "[0:v]split[a][b];[a]trim=start_frame=1,setpts=PTS-STARTPTS[f];[b]reverse,trim=start_frame=1,setpts=PTS-STARTPTS[r];[f][r]concat=n=2:v=1:a=0[out]" -map "[out]" -an -c:v libx264 -crf 20 -pix_fmt yuv420p -movflags +faststart boomerang.mp4
```

`reverse` holds the whole clip in memory while encoding (about 3 MB per 1080p frame), so keep the source short.

The source also captures frames at runtime and plays them back from a canvas; that costs about 2 MB per 960×540 frame (about 300 MB for 5 s at 30 fps), so it is not ported. When pre-rendering is impossible, use the fade loop instead.

### Framing and scrims

Light. Geometry that puts the clip's subject where the layout needs it, and overlays that keep text legible without a flat tint that kills the footage.

Framing (pick per breakpoint, retest at 375×812):

- Focal crop: `object-position: 70% center` keeps a right-side subject on portrait screens; `right bottom` from 1024 px.
- Oversize and top anchor: `width:120%; height:120%; left:50%; top:0; transform:translateX(-50%); object-position:top center` keeps sky or horizon in view.
- Vertical offset: `translateY(15%)` to `translateY(20%)` pushes the subject below the headline; works only when the exposed band matches the section background.
- Lower band: the video fills only the area below the headline (`top: clamp(180px,30vh,300px)`), dissolved into a light page by a `bg, transparent 50%, bg` vertical gradient on `::after`.
- In-flow on phones: the video becomes a block below the copy (`aspect-ratio:1/1`, `16/9` on tablets) and returns to an absolute background from 1024 px, so phones never put text over busy footage.
- Bleed: `scale(1.05)` hides encoder edge lines and 1 px letterbox slivers.
- Reuse: the same clip flipped with `scaleY(-1)` and `filter:brightness(.4)` behind the footer reads as a new shot without a second download.

Scrims (one at most, kept subtle, always in the exact page colour, or the seam shows):

- Bottom fade into the page: 12 to 16 rem tall, `linear-gradient(to top, var(--bg), transparent)`.
- Eased bottom fade that starts late; a two-stop gradient bands. Source stops: `0 @78.8%, .23 @79.6, .45 @81.4, .75 @83.3, .84 @85.2, .888 @88, .905 @91, .96 @95, 1 @100`.
- Top fade under a transparent nav: 180 px, `linear-gradient(#010103, transparent)`.
- Full vertical: `rgba(0,0,0,.3)`, transparent at 45 %, `rgba(0,0,0,.6)`.
- Flat dim: `.20` hero, `.45` call-to-action band, `.60` for a reused clip behind a footer.
- Portrait copy over the busiest part of the frame (`@media (max-aspect-ratio:11/10)`): left to right `.86, .66 @42%, .20 @78%, .10`; top to bottom `.72, .34 @24%, .34 @56%, .80 @82%, .97 @94%, 1`.
- Media cards: black 60 % at the bottom to transparent at 50 %.
- Side letterbox when the video has a capped width on ultra-wide screens: page colour beyond the video's edges, feathered over about 70 px.
- No scrim at all is often strongest: footage with a dark negative-space zone behind the copy, plus glass chrome.

### Progressive bottom blur

Medium. The bottom of the footage goes out of focus instead of darker, protecting bottom-aligned titles while colours stay intact.

```css
.bottom-blur{position:absolute;inset:0;z-index:1;pointer-events:none;
  -webkit-backdrop-filter:blur(24px);backdrop-filter:blur(24px);
  -webkit-mask-image:linear-gradient(to top,#000 0%,transparent 45%);mask-image:linear-gradient(to top,#000 0%,transparent 45%)}
```

A smoother stepped version stacks four layers over the bottom 55 % with blurs of 2, 4, 8 and 16 px and masks fading out at 100, 75, 50 and 25 % of the layer height. `backdrop-filter` over full-screen video re-samples every frame; use the single layer on phones.

### Cursor-scrubbed video

Medium, desktop only. A paused clip whose playhead follows horizontal mouse movement, so a turntable or head-turn feels like a live 3D object.

- Relative mapping, sensitivity 0.8: `Δt = (Δx / innerWidth) × 0.8 × duration`, clamped. The first mouse move never jumps.
- **Seek queue:** never set `currentTime` while a seek is in flight. Store the target; on `seeked`, seek again only if the target moved. Without this the decoder floods and the image freezes.
- Encode with tiny keyframe intervals so seeks land at once: `ffmpeg -i in.mp4 -an -c:v libx264 -crf 20 -g 6 -keyint_min 6 -pix_fmt yuv420p -movflags +faststart scrub.mp4` (`-g 1`, all keyframes, is the smoothest and largest).
- Clips under about 15 MB: load the whole file as a blob first (`fetch(url).then(r => r.blob())`, then `URL.createObjectURL`) so every seek is local.
- Below 1024 px or without a fine pointer: autoplay loop, paused while off screen. Reduced motion: still frame.

```js
function mouseScrubVideo(video, { sensitivity = 0.8, query = '(min-width: 1024px) and (hover: hover) and (pointer: fine)' } = {}) {
  const mq = matchMedia(query), reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let prevX = null, target = 0, busy = false, visible = true;
  video.muted = true; video.playsInline = true;
  const flush = () => {
    if (!mq.matches || reduce.matches || !visible || Math.abs(video.currentTime - target) < 1 / 60) { busy = false; return; }
    busy = true; video.currentTime = target;            // 'seeked' calls flush again
  };
  video.addEventListener('seeked', flush);
  addEventListener('mousemove', (e) => {
    if (!mq.matches || reduce.matches || !visible || !video.duration) { prevX = null; return; }   // no decoding off screen
    if (prevX === null) { prevX = e.clientX; return; }
    target = Math.max(0, Math.min(video.duration, target + ((e.clientX - prevX) / innerWidth) * sensitivity * video.duration));
    prevX = e.clientX;
    if (!busy) flush();
  }, { passive: true });
  const applyMode = () => {
    if (reduce.matches) video.pause();
    else if (mq.matches) { video.loop = false; video.pause(); target = video.currentTime; }
    else {
      video.loop = true;
      visible && !document.documentElement.classList.contains('motion-paused') ? video.play().catch(() => {}) : video.pause();
    }
  };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; applyMode(); }).observe(video);
  mq.addEventListener('change', applyMode); reduce.addEventListener('change', applyMode);
  document.addEventListener('motionchange', applyMode);
  applyMode();
}
```

Split variant: two clips, left of centre scrubs clip A by distance from centre, right scrubs clip B, and a dead zone of `max(30px, width × 0.05)` either side of centre holds frame 0 of the last active clip. The source drives it from a permanent rAF loop; drive it from `pointermove` plus `seeked` with the same seek queue instead, and skip seeks while the clips are off screen. On touch, the two clips alternate on `ended`.

### Scroll-scrubbed video

Heavy. A fixed full-bleed clip advances only as the user scrolls, smoothed with a lerp. For abstract or 3D transformation footage behind two or three screens of sparse copy. Never also autoplay it.

Rewritten here to cost less. The source cached up to 90 frames at 960 px wide (about 190 MB on desktop), sized a viewport canvas at up to twice the device pixel ratio, and ran rAF on every frame forever. This version:

- **Light variant first:** no cache. Encode all keyframes (`-g 1`) and seek the video directly through the seek queue. Memory is one decoder. Try this on the target devices before reaching for the cache.
- **Cache with a budget:** frames are limited by pixel area (960×540 at most) and by a memory budget (64 MB desktop, 24 MB phones), between 12 and `duration × 12` frames. Neighbouring frames crossfade, so fewer frames still scrub smoothly.
- **The canvas is the size of one frame** and CSS `object-fit:cover` scales it on the compositor, so there is no full-viewport backing store and no cover math.
- **rAF runs only while the smoothed value settles** or a seek is pending.
- **A seek that doesn't land within 3 s abandons the cache** and keeps the seek path. The source resolved its 1 s timeout as if the seek had landed, so on a slow connection (about 2 Mbps in a test) more than half the cached frames were the wrong ones. For clips under about 15 MB, downloading the file as a blob first (see the cursor recipe) makes every seek local.
- **Reduced motion:** no scrub; the poster stays. The source kept the scrub and only dropped smoothing.
- **Pause control** (`.motion-paused` + `motionchange`, Shared conventions): the poster shows and scrolling stops redrawing; resuming jumps to the current scroll position.

```html
<div class="scrubbg" aria-hidden="true">
  <img class="scrubbg__poster" src="poster.jpg" alt="">
  <video class="scrubbg__video" src="scrub.mp4" muted playsinline preload="auto"></video>
  <canvas class="scrubbg__canvas"></canvas>
</div>
<main class="page">…screens of copy, with ~80vh spacers between them so the footage visibly changes…</main>
```
```css
.scrubbg{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;background:#0a0a0a}
.scrubbg>*{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity .5s ease}
.scrubbg__video,.scrubbg__canvas{opacity:0}
.scrubbg.has-video .scrubbg__video{opacity:1}
.scrubbg.has-video .scrubbg__poster,.scrubbg.has-frames .scrubbg__video{opacity:0}
.scrubbg.has-frames .scrubbg__canvas{opacity:1}
.scrubbg.is-paused .scrubbg__poster{opacity:1}
.scrubbg.is-paused .scrubbg__video,.scrubbg.is-paused .scrubbg__canvas{opacity:0}
.page{position:relative;z-index:1}
```
```js
(() => {
  const root = document.querySelector('.scrubbg');
  const video = root.querySelector('video'), canvas = root.querySelector('canvas'), ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = matchMedia('(max-width: 768px)').matches;
  const USE_CACHE = true;                                  // false = light variant (all-keyframe encode, seek only)
  const MAX_PIXELS = phone ? 640 * 360 : 960 * 540;
  const BUDGET = (phone ? 24 : 64) * 2 ** 20;              // bytes of decoded frames
  let frames = [], target = 0, smooth = 0, drawn = -1, pending = false;

  const progress = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    return max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
  };
  const render = () => {
    if (frames.length) {
      const f = smooth * (frames.length - 1), i = Math.floor(f), a = f - i;
      const key = Math.round(f * 32);                      // skip redraws that would look identical
      if (key === drawn) return;
      drawn = key;
      ctx.globalAlpha = 1; ctx.drawImage(frames[i], 0, 0);
      if (a > 0.02 && frames[i + 1]) { ctx.globalAlpha = a; ctx.drawImage(frames[i + 1], 0, 0); }
    } else if (video.duration && !video.seeking) {
      const t = smooth * (video.duration - 0.05);
      if (Math.abs(video.currentTime - t) > 0.04) video.currentTime = t;   // 'seeked' requests another frame
    }
  };
  const update = () => {
    pending = false;
    target = progress();
    smooth += (target - smooth) * 0.12;
    if (Math.abs(target - smooth) < 0.0005) smooth = target;
    render();
    if (smooth !== target) request();
  };
  const paused = () => document.documentElement.classList.contains('motion-paused');
  const request = () => { if (!pending && !paused()) { pending = true; requestAnimationFrame(update); } };
  const applyPause = () => { root.classList.toggle('is-paused', paused()); request(); };   // paused: the poster shows

  const once = (el, ev) => new Promise((r) => el.addEventListener(ev, r, { once: true }));
  const seekTo = (v, t) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('seek timed out')), 3000);   // a wrong frame is worse than no cache
    v.addEventListener('seeked', () => { clearTimeout(timer); resolve(); }, { once: true });
    v.currentTime = t;
  });
  async function buildFrameCache() {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = video.currentSrc || video.src;
    v.play().then(() => v.pause()).catch(() => {});         // iOS ignores preload until play()
    if (v.readyState < 2) await once(v, 'loadeddata');
    const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (v.videoWidth * v.videoHeight)));
    const w = Math.round(v.videoWidth * scale), h = Math.round(v.videoHeight * scale);
    const count = Math.max(12, Math.min(Math.round(v.duration * 12), Math.floor(BUDGET / (w * h * 4))));
    const out = [];
    for (let i = 0; i < count; i++) {
      await seekTo(v, (i / (count - 1)) * (v.duration - 0.05));
      const c = document.createElement('canvas');           // small canvases avoid CORS and ImageBitmap quirks
      c.width = w; c.height = h; c.getContext('2d').drawImage(v, 0, 0, w, h);
      out.push(c);
    }
    v.removeAttribute('src'); v.load();                     // release the second decoder
    canvas.width = w; canvas.height = h;
    return out;
  }

  if (reduce) return;                                      // reduced motion: the poster stays, no scrub
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', request);
  video.addEventListener('seeked', request);
  document.addEventListener('motionchange', applyPause);
  applyPause();
  video.play().then(() => video.pause()).catch(() => {});   // prime decoding on iOS
  const init = async () => {
    root.classList.add('has-video');
    request();
    if (!USE_CACHE) return;
    await new Promise((r) => setTimeout(r, 300));           // let the first paint finish
    try { frames = await buildFrameCache(); drawn = -1; root.classList.add('has-frames'); request(); }
    catch { /* keep the seek path */ }
  };
  video.readyState >= 2 ? init() : video.addEventListener('loadeddata', init, { once: true });   // cached media may load before this runs
})();
```

Drawing a cross-origin video into a canvas only taints it (pixels can't be read back); drawing still works, so don't set `crossOrigin` unless the host sends CORS headers, or the video fails to load.

### Scene switcher

Heavy. Three to five stacked looping clips (moods or locations) with a tab row; the chosen clip crossfades in, and an optional transparent foreground cut-out (window frame, cockpit) bobs on top.

- Crossfade `opacity 1s ease-in-out`; lock input for the same second so clicks can't stack; pause the outgoing clip when the fade ends.
- Only the active clip preloads (`preload="metadata"` on the rest); the others load on first selection.
- Foreground bob: `translateY(0 to -6px)` 3 s ease-in-out infinite, with a constant `scale(1.03)` so edges never show.
- Bright clip: switch the hero copy to a deep ink (source value `#182C41`) over 700 ms through a `data-tone` attribute on the section.
- Tabs use `role="tab"` with `aria-selected`; inactive `opacity .5`, hover `.8`.
- Reduced motion: no bob, no crossfade transition.

## Glass and texture

### Liquid glass

Light. An almost invisible frosted surface whose edge is a gradient hairline, bright at top and bottom and fading at the sides, like light on a lens rim. For nav pills, chips, badges, secondary calls to action, inputs and cards over moving footage. On flat black it reads only as an outline: it needs footage behind it.

- Subtle tier (nav, chips, cards): `blur(4px)`, `inset 0 1px 1px rgba(255,255,255,.1)`, rim alphas `.45 / .15 / 0 / 0 / .15 / .45` at `0 / 20 / 40 / 60 / 80 / 100 %`.
- Strong tier (one primary glass surface or a big panel): `blur(50px)`, rim `.5 / .2 / 0 / 0 / .2 / .5`.
- Dark tier for bright footage: fill `rgba(0,0,0,.4)`, rim `.3 / .1 / 0 / 0 / .1 / .3`.
- No `border`; the 1.4 px rim is a masked `::before`.

```css
.liquid-glass{position:relative;overflow:hidden;border:none;
  background:rgba(255,255,255,.01);background-blend-mode:luminosity;
  -webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);
  box-shadow:inset 0 1px 1px rgba(255,255,255,.1)}
.liquid-glass::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1.4px;pointer-events:none;
  background:linear-gradient(180deg,
    rgba(255,255,255,var(--rim-a,.45)) 0%,rgba(255,255,255,var(--rim-b,.15)) 20%,
    rgba(255,255,255,0) 40%,rgba(255,255,255,0) 60%,
    rgba(255,255,255,var(--rim-b,.15)) 80%,rgba(255,255,255,var(--rim-a,.45)) 100%);
  -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);
  -webkit-mask-composite:xor;
          mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);
          mask-composite:exclude}
.liquid-glass--strong{-webkit-backdrop-filter:blur(50px);backdrop-filter:blur(50px);
  box-shadow:4px 4px 4px rgba(0,0,0,.05),inset 0 1px 1px rgba(255,255,255,.15)}
.liquid-glass--strong::before{--rim-a:.5;--rim-b:.2}
.liquid-glass--dark{background:rgba(0,0,0,.4)}
.liquid-glass--dark::before{--rim-a:.3;--rim-b:.1}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.liquid-glass:not(.liquid-glass--dark){background:rgba(255,255,255,.08)}}
```

Keep the three-line mask form: it is the one that works across browsers. The mask removes the content box, so only the ring paints and clicks pass through.

Cost: `backdrop-filter` re-samples the moving video every frame, and cost grows with radius and area. Use the 4 px tier for anything repeated, keep `blur(50px)` to one or two surfaces, and measure on a phone; if a strong surface drops frames over playing video there, fall back to the 4 px tier.

Light sibling for bright footage: `background: rgb(255 255 255/.7); backdrop-filter: blur(12px); border: 1px solid rgb(255 255 255/.6)`.

### Frosted glass and text on video

Light. Heavier frost than liquid glass, for when text sits on the glass.

| Element | Source values |
|---|---|
| Chips | `rgba(255,255,255,.15)`, `blur(12px)` |
| Large panels | `rgba(255,255,255,.10)`, `blur(12px)`, border `1px rgba(255,255,255,.15)`, radius 16 px |
| Dark pill on bright footage | `rgba(23,23,23,.9)`, `blur(8px)` |
| Label badge | `border-left: 2px solid #fff`, padding `6px 12px`, mono 11 px uppercase, tracking `.15em` |
| Numbered rows | mono index 11 px at 55 % white; title 16 to 18 px; body 14 px at 70 %; dividers `rgba(255,255,255,.15)`; 20 px padding |

Text straight on video: white with layered `filter: drop-shadow(0 4px 3px rgba(0,0,0,.07)) drop-shadow(0 2px 2px rgba(0,0,0,.06))`, no box. Check contrast against the brightest frame the text crosses, not the poster.

### Grain and texture

Light. A faint texture removes banding in video, gradients and flat colour.

```css
:root{--noise:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
/* page-wide grain: about 1.5 % effective (noise alpha averages about .5, times .08, times .4) */
.page-grain{position:fixed;inset:0;z-index:100;pointer-events:none;opacity:.4;background-size:200px 200px;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.08'/%3E%3C/svg%3E")}
/* over a video, last child of a position:relative; overflow:hidden box: shows in mid-tones, where banding lives */
.noise-overlay{position:absolute;inset:0;pointer-events:none;opacity:.7;mix-blend-mode:overlay;background-image:var(--noise)}
/* animated film grain; the parent clips it */
.grain-anim{position:absolute;inset:-10%;pointer-events:none;opacity:.08;mix-blend-mode:overlay;
  background-image:var(--noise);animation:grain 1s steps(6) infinite}
@keyframes grain{0%,100%{transform:translate(0,0)}20%{transform:translate(-5%,3%)}40%{transform:translate(4%,-6%)}
  60%{transform:translate(-3%,5%)}80%{transform:translate(6%,2%)}}
@media (prefers-reduced-motion:reduce){.grain-anim{animation:none}}
```

Changed from the source: the animated grain layer was `inset:-50%`, a layer four times the viewport's area; `-10%` still covers the largest 6 % shift. Halftone over images: `radial-gradient(circle,#000 1px,transparent 1px)` at 4×4 px, `opacity .2`, `multiply`. Dot grid behind tech heroes: `radial-gradient(#fff 1px,transparent 1px)` at 24×24 px, `opacity .05`. SVG `feTurbulence` filters applied to large text are expensive: one or two elements at most, none at 1024 px and below.

## Entrances

### Blur-rise entrance

Light. Each hero element rises a few pixels out of a blur in reading order while the background media settles from a slight zoom.

- Blur-rise: `opacity 0`, `translateY` of 20 to 28 px and `blur` of 6 to 12 px, to rest, 0.85 to 1.1 s, `--ease-out-expo`. Nav comes down from -10 to -20 px; content comes up.
- `filter: blur()` on large text is costly: blur only headline lines and a few chips; paragraphs get a plain rise (y 20 to 24 px, 0.8 to 1 s).
- Media settle: `scale(1.12 → 1)` for images, `scale(1.05 → 1)` plus fade for video, 1.8 s.
- Spacing: 80 to 200 ms between siblings, everything landed by about 1.5 s, the headline gets the longest duration, logos and fine print only fade.
- Source timelines (start delays): minimal centred, headline 0, sub .2, call to action .4 (0.8 s, y 24). Glass hero over video: badge .4, headline words with .08 stagger (the source used .1; SKILL.md's word stagger is 60 to 80 ms), sub .8, calls to action 1.1, stat cards 1.3, partner strip 1.4. Two-line headline: line 1 .25, line 2 .42, bottom copy .70 and .85.

```css
/* from-only keyframes end on the element's own values, so hover transforms and fixed children work afterwards */
@keyframes blurRise{from{opacity:0;transform:translateY(var(--rise,28px));filter:blur(var(--blur,12px))}}
@keyframes fadeRise{from{opacity:0;transform:translateY(var(--rise,20px))}}
@keyframes fadeDown{from{opacity:0;transform:translateY(-16px)}}
@keyframes settleZoom{from{transform:scale(var(--zoom-from,1.12))}}
.in-blur{animation:blurRise var(--dur,1.1s) var(--ease-out-expo) var(--d,0ms) both}
.in-fade{animation:fadeRise var(--dur,1s) var(--ease-out-expo) var(--d,0ms) both}
.in-down{animation:fadeDown .8s var(--ease-out-expo) var(--d,0ms) both}
.in-zoom{animation:settleZoom 1.8s var(--ease-out-expo) both}
/* wait for fonts so lines don't re-wrap mid-animation; only when the head script ran, or a paused
   first keyframe would hide the text for good */
.js .in-blur,.js .in-fade{animation-play-state:paused}
.js.fonts-ready .in-blur,.js.fonts-ready .in-fade{animation-play-state:running}
@media (prefers-reduced-motion:reduce){.in-blur,.in-fade,.in-down,.in-zoom{animation:none}}
```
```html
<script>   /* inline in <head>, so the gate and its release can't fail separately */
  const root = document.documentElement, release = () => root.classList.add('fonts-ready');
  setTimeout(release, 1500);                                // first, so nothing below can block it
  root.classList.add('js');
  // fonts.ready resolves at once in <head>, before any font is requested; wait for the parsed DOM
  document.addEventListener('DOMContentLoaded', () => document.fonts?.ready.then(release) ?? release());
</script>
```

`both` hides an element only during its delay; if animations never run, everything stays visible. A filled animation holds the element's transform while it runs, so hover transforms apply only once it ends.

### Fail-safe entrance system

Light. The production version of the blur-rise: each element picks a verb and a delay, the page can never be stuck blank, and once an animation ends its `transform` is released so `:hover` transforms work.

- Duration 1.05 s, `--ease-out-expo`, delay from `--d`.
- Verbs: `scale` (from `scale(.9)`; the source used .84, below SKILL.md's 0.9 floor) for the logo, `soft` (`translateY(14px)`), `mask` (`translateY(40%)` inside an overflow-hidden line), `pop` (`scale(.9)`, `1.03` at 70 %, then 1) for badges, `btn` (`translateY(18px) scale(.94)`), `side` (`translateX(22px)`) for secondary calls to action, `stat` (`translateY(20px)`).
- Accent words in a headline: `opacity .35, blur(4px)` to sharp, 1.2 s at .72 s.
- Example timeline: logo .08; nav items .16 to .52; badge .22; headline lines .42 and .62; lede .82 (1.25 s); primary .96; secondary 1.10; stats 1.12, 1.28, 1.44.

```css
.appear{animation-duration:1.05s;animation-fill-mode:both;animation-timing-function:var(--ease-out-expo);animation-delay:var(--d,.08s)}
.appear--scale{animation-name:in-scale} .appear--soft{animation-name:in-soft} .appear--mask{animation-name:in-mask}
.appear--pop{animation-name:in-pop} .appear--btn{animation-name:in-btn} .appear--side{animation-name:in-side} .appear--stat{animation-name:in-stat}
.appear.is-in{animation:none}   /* release: the element's own opacity, transform and filter return */
@keyframes in-scale{from{opacity:0;transform:scale(.9)}}
@keyframes in-soft {from{opacity:0;transform:translateY(14px)}}
@keyframes in-mask {from{opacity:0;transform:translateY(40%)}}
@keyframes in-pop  {0%{opacity:0;transform:scale(.9)}70%{opacity:1;transform:scale(1.03)}100%{opacity:1;transform:scale(1)}}
@keyframes in-btn  {from{opacity:0;transform:translateY(18px) scale(.94)}}
@keyframes in-side {from{opacity:0;transform:translateX(22px)}}
@keyframes in-stat {from{opacity:0;transform:translateY(20px)}}
@keyframes in-em   {from{opacity:.35;filter:blur(4px)}}
.headline-line{display:block;overflow:hidden;padding:.06em .15em .14em}   /* the clip; room for descenders and italics */
.headline-line>.appear{display:block}                                      /* the moving line inside it */
h1 em{animation:in-em 1.2s var(--ease-out-expo) .72s both}
@media (prefers-reduced-motion:reduce){.appear,h1 em{animation:none!important}}
```
```js
// at the end of <body>, or with defer, so the elements exist
const appearEls = document.querySelectorAll('.appear');
appearEls.forEach((el) => el.addEventListener('animationend', (e) => {
  if (e.target === el) el.classList.add('is-in');      // ignore animations bubbling from children such as <em>
}));
requestAnimationFrame(() => requestAnimationFrame(() => {  // fallback: nothing animating means show everything
  const animating = [...appearEls].some((el) => el.getAnimations?.().some((a) => a.playState === 'running' || a.playState === 'finished'));
  if (!animating) appearEls.forEach((el) => el.classList.add('is-in'));
}));
```
```html
<h1>
  <span class="headline-line"><span class="appear appear--mask" style="--d:.42s">First line with <em>accent</em></span></span>
  <span class="headline-line"><span class="appear appear--mask" style="--d:.62s">second line.</span></span>
</h1>
```

## Scroll

### Viewport reveal

Light. Blocks below the fold fade and rise once as they enter, with per-element delays so a group cascades.

- Source values: `opacity 0, y 30px` to rest, 0.7 s `--ease-reveal`, once. Large headings y 40; media y 60 over 0.9 s; two-column splits from `x ±40px`; card grids `scale(.95)` with `--ease-out-quint`.
- Trigger: `threshold .15`, `rootMargin: 0px 0px -10% 0px`. `threshold` is a fraction of the element, so with that margin a block taller than about 6 viewports never reaches 0.15: give blocks taller than the viewport `threshold 0`. The margin also means the bottom 10 % of the viewport never counts, so whenever the page is at its end (scrolled there, or too short to scroll), everything left on screen is revealed.
- Stagger `base + i × step`: lists `150 + i·120 ms`, grid cards `i·100 ms`, stat columns `i·150 ms`.
- Corner decor around a centred heading: four objects sliding in from `x ±80px`, 0.9 s, delays .10, .15, .25, .30 s.
- The `.js` class hides content before the controller runs, so the head script also sets a 3 s fallback: if the controller never reports ready (it failed to load or threw), everything is shown.

```html
<script>   /* in <head> */
  document.documentElement.classList.add('js');
  setTimeout(() => window.revealReady || document.documentElement.classList.add('reveal-failed'), 3000);
</script>
<ul data-stagger="120" data-stagger-base="150"><li data-reveal>…</li><li data-reveal>…</li></ul>
```
```css
.js [data-reveal]{opacity:0;transform:translate3d(var(--x,0px),var(--y,30px),0);
  transition:opacity var(--dur,.7s) var(--ease,var(--ease-reveal)) var(--d,0s),transform var(--dur,.7s) var(--ease,var(--ease-reveal)) var(--d,0s)}
.js [data-reveal="scale"]{transform:scale(.95);--ease:var(--ease-out-quint)}
.js [data-reveal].is-in,.reveal-failed [data-reveal]{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.js [data-reveal]{opacity:1;transform:none;transition:none}}
```
```js
document.querySelectorAll('[data-stagger]').forEach((g) => {
  const step = +g.dataset.stagger, base = +(g.dataset.staggerBase || 0);
  g.querySelectorAll('[data-reveal]').forEach((el, i) => el.style.setProperty('--d', `${base + i * step}ms`));
});
const revealIO = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (e.isIntersecting) { e.target.classList.add('is-in'); revealIO.unobserve(e.target); }
}), { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });
document.querySelectorAll('[data-reveal]').forEach((el) => revealIO.observe(el));
const revealAtEnd = () => {                                // the last lines may sit in the excluded bottom band
  const SLACK = 80;                                        // more than the largest hide offset (60 px), which itself adds scroll
  if (innerHeight + scrollY < document.documentElement.scrollHeight - SLACK) return;   // also true when the page doesn't scroll
  document.querySelectorAll('[data-reveal]:not(.is-in)').forEach((el) => {
    if (el.getBoundingClientRect().top < innerHeight + SLACK) { el.classList.add('is-in'); revealIO.unobserve(el); }
  });
};
addEventListener('scroll', revealAtEnd, { passive: true });
addEventListener('resize', revealAtEnd);
revealAtEnd();
window.revealReady = true;                                 // last line: the head fallback stands down
```

### Scroll-linked word reveal

Medium. A paragraph in large type starts at 15 % opacity and lights up word by word as the reader scrolls through it. One or two per page; highlighted key words end in full foreground, the rest on a softer tone.

- Progress 0 when the block's top reaches 80 % of the viewport, 1 when its bottom reaches 20 %.
- Each word's window is 0.15 of the progress wide and overlaps its neighbours; the windows are spread so the first starts at 0 and the last ends at 1. The source's `[i/N - 0.1, i/N + 0.05]` started the first words already lit and left the last ones short of full opacity. For a crisper sweep use `before: 0, after: 1 / N`.
- Opacity only, inline spans: no layout shift, natural line breaks, and the text stays real for screen readers.

```js
function scrollReveal(el, { from = 0.15, start = 0.8, end = 0.2, before = 0.1, after = 0.05 } = {}) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  texts.forEach((node) => {                                  // wrap words, keep spaces and nested markup
    const frag = document.createDocumentFragment();
    node.textContent.split(/(\s+)/).forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) { frag.append(part); return; }
      const s = document.createElement('span'); s.className = 'sp'; s.textContent = part; frag.append(s);
    });
    node.replaceWith(frag);
  });
  const pieces = [...el.querySelectorAll('.sp')], N = pieces.length;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = -1, pending = false;
  const update = () => {
    pending = false;
    const r = el.getBoundingClientRect(), vh = innerHeight;
    const p = reduce ? 1 : Math.min(1, Math.max(0, (start * vh - r.top) / ((start - end) * vh + r.height)));
    if (Math.abs(p - last) < 0.0005) return;
    last = p;
    pieces.forEach((s, i) => {
      const c = before + (N > 1 ? i / (N - 1) : 0) * (1 - before - after), a = c - before, b = c + after;
      s.style.opacity = (from + (1 - from) * Math.min(1, Math.max(0, (p - a) / (b - a)))).toFixed(3);
    });
  };
  const request = () => { if (!pending) { pending = true; requestAnimationFrame(update); } };
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', request);
  update();
}
```

### Pointer parallax layers

Light, desktop only. Stacked transparent layers drift with or against the pointer by different amounts.

- Pointer normalised to `[-0.5, 0.5]`, eased with lerp 0.12 per frame; the loop stops once settled.
- Source depths in px per unit: far background `-12 x / -4 y` (against the cursor), subject `+18 / +8`, foreground `+22 / +10`. Vertical about 0.4 of horizontal; more reads as seasick.
- Overscan every layer (`inset:-4%`, 108 % size) so edges never show.
- Fine pointer only; reduced motion and touch get the still composition.

```js
(() => {
  const scene = document.querySelector('.px-scene');      // layers: transform: translate3d(calc(var(--mx) * var(--dx) * 1px), calc(var(--my) * var(--dy) * 1px), 0)
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
  const loop = () => {
    x += (tx - x) * 0.12; y += (ty - y) * 0.12;
    scene.style.setProperty('--mx', x.toFixed(4)); scene.style.setProperty('--my', y.toFixed(4));
    raf = Math.abs(tx - x) > 0.0005 || Math.abs(ty - y) > 0.0005 ? requestAnimationFrame(loop) : 0;
  };
  addEventListener('pointermove', (e) => {
    tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5;
    if (!raf) raf = requestAnimationFrame(loop);
  }, { passive: true });
})();
```

Here the variables sit on the scene, which only holds the few layers that read them; on a scene with many descendants, write a transform to each layer instead.

### Sticky cinematic stage

Heavy. One pinned viewport tells a whole story: layered cut-outs (sky, midground, giant title, subject, foreground halves) move independently as the reader scrolls a long runway. The title sits between background and subject, the foreground parts like curtains to reveal a close-up, and the background goes soft and takes a tint while story panels slide through.

Architecture:

- Runway `height: calc(100vh + 3000px)` to `calc(100vh + 3700px)` holding a stage with `position:sticky; top:0; height:100vh; min-height:620px; overflow:hidden`.
- JS computes `scroll = clamp(-section.top, 0, section.height - innerHeight)` in pixels, smooths it (lerp 0.14, snap when within 0.08 px) and writes the results; rAF runs only while something is settling.
- Write the story as a table of pixel windows before coding. Source example: 90 to 650 px the title rises 210 px, shrinks to .92 and fades while intro copy sinks 90 px; 560 to 900 px the foreground halves part to `∓46vw` (eased `enter^1.5`) and the subject widens; 1300 to 1620 px the subject launches upward and the chapter panel leaves.
- A constant drift over the runway (source: `progress = scroll / 2700`, adding -74 px and +0.23 scale to the hero layers) keeps the stage alive between windows. Pointer parallax mixes in with the depths from the recipe above.

```js
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smoothstep = (e0, e1, v) => { const x = clamp((v - e0) / (e1 - e0)); return x * x * (3 - 2 * x); };
// a scroll window: fades in over [a,b], out over [c,d]
const segment = (s, a, b, c, d) => { const enter = smoothstep(a, b, s), exit = smoothstep(c, d, s); return { enter, exit, active: enter * (1 - exit) }; };

function stage(section, apply) {                         // apply(s) writes styles for scroll position s
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let smooth = 0, init = false, pending = false;
  const update = () => {
    pending = false;
    const target = clamp(-section.getBoundingClientRect().top, 0, section.offsetHeight - innerHeight);
    smooth = !init || reduce.matches || Math.abs(target - smooth) < 0.08 ? target : smooth + (target - smooth) * 0.14;
    init = true;
    apply(smooth);
    if (smooth !== target) request();
  };
  const request = () => { if (!pending) { pending = true; requestAnimationFrame(update); } };
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', request);
  request();
}
```

Rewritten here to cost less than the source, which wrote about 25 custom properties on the stage every frame and animated `filter: blur() brightness()` on full-viewport image layers:

- **Write each value on the element that uses it** (`el.style.transform`, or a variable set on that layer), and skip the write when the rounded value hasn't changed. Variables on the stage restyle every descendant on each change (see [ui-components.md](ui-components.md#performance)).
- **Never animate `filter` on the big layers.** Export a pre-blurred copy of the background (source value 14 px) and crossfade its `opacity`; do brightness and tint with overlay layers whose `opacity` changes. Everything that moves is then `transform` or `opacity`.
- **Size the planes to their use.** Each decoded layer costs width × height × 4 bytes. Export each plane at its largest rendered width times a device pixel ratio capped at 2 (a 118vw foreground on a 1440 px screen is about 3400 px), crop it tight to its opaque pixels, serve smaller files to phones with `srcset`, and cut the foreground into a left and a right file.
- **Hide what is off stage:** controls that slide out get `visibility:hidden` and `pointer-events:auto` only once their enter value passes 0.98.

Mobile widens the subject and close-up (source: 138vw, then 190vw on phones) so the planes still cover, and shrinks the title in steps. Reduced motion: replace the parting, launches and drift with opacity crossfades between the key states (`apply` can branch on `matchMedia('(prefers-reduced-motion: reduce)')`), and drop pointer parallax. The helper already snaps without smoothing. The source kept the full movement and only dropped smoothing.

### Stacking cards

Medium. Cards pin near the top one after another; each new card slides over the last while those underneath shrink a little with a sliver of their top edge showing.

- Each card in its own slot: `position:sticky; top:0; height:85vh`, card offset `top: i × 28px`, `transform-origin: top center`.
- Target scale `1 - (n - 1 - i) × 0.03`, interpolated from 1 at section progress `i/n` to the target at progress 1. Progress ends when the last slot pins, not when the section's bottom reaches the viewport's.
- Reduced motion: keep the sticky stacking, skip the scaling.

```js
function stackCards(section) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cards = [...section.querySelectorAll('.stack-card')], n = cards.length;
  let pending = false;
  const update = () => {
    pending = false;
    const r = section.getBoundingClientRect();
    const end = Math.max(1, r.height - cards[n - 1].parentElement.offsetHeight);   // when the last slot pins
    const p = Math.min(1, Math.max(0, -r.top / end));
    cards.forEach((card, i) => {
      const t = Math.min(1, Math.max(0, (p - i / n) / (1 - i / n)));
      card.style.transform = `scale(${1 - (n - 1 - i) * 0.03 * t})`;
    });
  };
  const request = () => { if (!pending) { pending = true; requestAnimationFrame(update); } };
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', request);
  update();
}
```

### Pinned heading with parallax columns

Medium. A heading stays pinned in the centre while two columns of tilted images scroll past at different speeds.

- Section `min-height:300vh`; a sticky full-height layer holds the heading; the columns sit over it in a two-column grid.
- Column offset `(progress - 0.5) × speed × innerHeight` with source speeds `-0.6` (faster than the page) and `0.3` (lags). Cards square, rotated `-4°` and `+3°`.
- Single-element parallax: `offset = clamp(-(elementCentre - viewportCentre) × 0.2, -200px, 200px)`, measured on the untransformed parent.
- One column (under 640 px): halve the speeds or show a plain stack. Reduced motion: offsets 0.

### Opposing marquee rows

Medium. Two rows of work thumbnails slide sideways as the page scrolls down, the top row right and the bottom row left.

- `offset = (innerHeight - section.top) × 0.3`; row A `translateX(calc(-33.333% + offset))`, row B `translateX(calc(-33.333% - offset))`. Each set must be wider than the viewport plus the largest offset, or an empty edge shows; repeat tiles within a set if needed.
- Each row's content is tripled and starts one set to the left, so neither direction shows an empty edge. Mark the duplicate sets `aria-hidden="true"`.
- Tiles 420×270 px (260×168 on phones), radius 16 px, 12 px gaps.
- Changed from the source: when tiles are videos, only the middle set plays video; the duplicate sets use the poster image, so the page decodes one copy of each clip instead of three. Pause them all when the section leaves the viewport.
- The section itself may use `overflow:hidden`, since nothing sticky sits inside it. Reduced motion: rows stay still.

### Tilted text crawl

Medium. A large centred paragraph tilted back in perspective drifts upward as the section passes, lagging on a heavy spring and fading in midway, like a film's opening crawl over video.

- Container `perspective:400px`; text `rotateX(24deg) translateY(y) translateZ(15px)`; `y` maps progress 0 to 1 onto 60 to -120 px; opacity 0 to 1 between progress 0.3 and 0.5.
- Spring (source values): stiffness 15, damping 32, mass 1.8, an overdamped float.
- Changed from the source, which ran rAF forever: the loop starts on scroll and stops once the spring settles (about 10 s after the last scroll, since the spring is heavily damped). The first frame snaps to the scroll position, so a page loaded mid-section shows the text at once.
- Reduced motion: the text holds its resting tilt and only fades in with scroll.

```js
function crawl(sec, txt, { K = 15, C = 32, M = 1.8 } = {}) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let x = 0, v = 0, last = 0, raf = 0, init = false;
  const targetOf = () => { const r = sec.getBoundingClientRect(); return Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight + r.height))); };
  const frame = (now) => {
    const dt = last ? Math.min(0.032, (now - last) / 1000) : 1 / 60; last = now;
    const target = targetOf();
    if (!init || reduce) { x = target; v = 0; init = true; }
    else { v += ((-K * (x - target) - C * v) / M) * dt; x += v * dt; }        // semi-implicit Euler
    const y = reduce ? -30 : 60 - 180 * x;                                    // reduced motion: no drift
    txt.style.transform = `rotateX(24deg) translateY(${y.toFixed(2)}px) translateZ(15px)`;
    txt.style.opacity = Math.min(1, Math.max(0, (x - 0.3) / 0.2)).toFixed(3);
    raf = Math.abs(x - target) > 2e-3 || Math.abs(v) > 2e-3 ? requestAnimationFrame(frame) : (last = 0);   // 2e-3 ≈ 0.36 px
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', kick);
  kick();
}
```

### Exclusion-blend fixed UI

Light. Fixed UI (wordmark, nav, captions) in white with `mix-blend-mode: exclusion` inverts by itself: white over dark footage, black over white sections sliding beneath. One fixed layer survives a page that goes from video to black to white.

- `position:fixed; color:#fff; mix-blend-mode:exclusion; pointer-events:none`, with `pointer-events:auto` back on real links.
- Blending happens against what is painted in the same stacking context. A parent with `transform`, `filter`, `opacity < 1`, `isolation` or `will-change` traps the blend, so keep blended elements as direct children of `body` and animate the blended element itself, not a wrapper.
- Exclusion fails over mid-grey: white over `rgb(128,128,128)` gives `rgb(127,127,127)`, a contrast of about 1:1. Navigation that people need to use gets a backing surface (a small glass or dark pill) wherever the footage passes through mid-tones; check frames across the whole clip, not only the brightest.
- Keep a visible focus style for keyboard users.

## Not ported

From the same library: buttons and card hovers, type effects (scramble, typewriter, rotating word, giant display type, wordmark assembly, count-ups), depth carousels, cursor spotlight, image trails, orbit rings, sand-dissolve transitions, menus and navigation, product mockups, sliders and marquees, and the 3D model and shader backdrops. For product components see [ui-components.md](ui-components.md); for WebGL see [web-engine.md](web-engine.md). The library's craft, spec-template and review files, its example prompts and its media were not used.
