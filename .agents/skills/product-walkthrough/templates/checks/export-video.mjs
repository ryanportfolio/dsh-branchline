// Exports chapters to MP4 by capturing the stage element in the page and encoding it
// with WebCodecs. No per-frame screenshots: Chrome's Element Capture feeds the stage's
// composited pixels to a VideoEncoder, and ffmpeg only copies the H.264 stream into MP4.
//
// node checks/export-video.mjs --url http://127.0.0.1:4173/player.html --out <artifacts>/<project>/tour.mp4 \
//   [--theme dark] [--fps 60] [--width 1920 --height 1152] [--viewport 1440x864] [--window 1600x1100]
//   [--hold 1200] [--bitrate 16] [chapterId ...]
//
// Real time: the tour plays once at 1x while it records, so a 2-minute tour takes about
// 2 minutes. Captured frames arrive only when the stage changes; the page resamples them
// onto a constant frame-rate grid (repeating the last frame) so ffmpeg can copy the
// stream at --fps. Each frame is drawn into a canvas of exactly --width x --height
// (letterboxed), because the captured size follows the real tab, which the display can
// clamp. Pick a size with the stage's aspect ratio (1200 x 720 → 1920 x 1152).
// The player runs with ?capture=1 (stage only, no caption or dev bar).
// Needs Chrome with Element Capture (RestrictionTarget) and ffmpeg on PATH. Window:
// headed, offscreen, muted; never headless and never minimized.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { parseArgs, need, withQuery } from "./lib/browser.mjs";

const args = parseArgs();
const url = need(args, "url", "player URL");
const out = need(args, "out", "output .mp4 (large files: an artifacts folder, not the repo)");
const fps = +(args.fps || 60), width = +(args.width || 1920), height = +(args.height || 1152);
const hold = +(args.hold || 1200), bitrate = +(args.bitrate || 16) * 1e6;
// --viewport and --window: Element Capture in an offscreen window is sensitive to geometry.
// Measured on Windows, Chrome, 2026-10-20: viewport 1440x1000 in a 1600x1100 window works
// (several runs, captured stage aspect within 0.3% of the stage); viewport 1440x864 and a
// stage scaled to fill the viewport delivered no frames (timeout); a viewport larger than
// the display allows came out stretched (the script warns when the captured aspect is
// off); no viewport emulation delivered no frames. Change these only with a test export.
const vp = String(args.viewport || "1440x1000").split("x").map(Number);
const win = String(args.window || "1600x1100").split("x").map(Number);
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });

// The capture prompt is auto-accepted only with --auto-accept-this-tab-capture, so this
// script launches Chrome itself instead of lib/browser.mjs launch().
async function chromium() {
  for (const start of [process.env.WALKTHROUGH_PW_FROM, process.cwd()].filter(Boolean)) {
    for (const pkg of ["playwright", "playwright-core"]) {
      try { const m = await import(pathToFileURL(createRequire(path.join(start, "package.json")).resolve(pkg)).href); return m.chromium || m.default.chromium; } catch { /* next */ }
    }
  }
  throw new Error("playwright or playwright-core not found (set WALKTHROUGH_PW_FROM)");
}
const browser = await (await chromium()).launch({ headless: false, channel: "chrome", args: [
  "--window-position=-2400,-2400", `--window-size=${win[0]},${win[1]}`, "--mute-audio", "--auto-accept-this-tab-capture",
  "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"] });

try {
  const page = await browser.newPage({ viewport: { width: vp[0], height: vp[1] } });
  page.on("pageerror", (e) => console.log("page error:", e.message));
  // speed=1 overrides a preview speed left in --url: the recording runs at 1x.
  await page.goto(withQuery(url, `capture=1&t=0&speed=1${args.theme ? `&theme=${args.theme}` : ""}`));
  await page.waitForFunction(() => window.__player && window.__player.ready);
  const ids = args._.length ? args._ : await page.evaluate(() => window.__player.scenes().map((s) => s.id));
  // getDisplayMedia needs a user gesture: an invisible button Playwright clicks.
  await page.evaluate(() => { const b = document.createElement("button"); b.id = "wt-rec"; b.style.cssText = "position:fixed;left:0;top:0;width:4px;height:4px;opacity:0;z-index:99"; document.body.appendChild(b); });

  await page.evaluate(({ ids, fps, hold, bitrate, width, height }) => {
    document.getElementById("wt-rec").onclick = async () => {
      const R = window.__rec = { chunks: [], frames: 0, captured: 0, err: null, done: false };
      // A magenta cover over the stage marks its box in the first frames; the crop comes from
      // it, since the product's own pixels can be black right up to (or well inside) its edges.
      const mark = document.createElement("div");
      mark.style.cssText = "position:absolute;inset:0;background:#f0f;z-index:1000;pointer-events:none";
      document.getElementById("wt-fit").appendChild(mark);
      try {
        window.__player.set({ scene: ids[0], t: 0 });
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: fps }, audio: false, preferCurrentTab: true });
        const [track] = stream.getVideoTracks();
        await track.restrictTo(await RestrictionTarget.fromElement(document.getElementById("wt-fit")));
        const enc = new VideoEncoder({ output: (c) => { const b = new Uint8Array(c.byteLength); c.copyTo(b); R.chunks.push(b); }, error: (e) => { R.err = String(e); } });
        const cfg = { codec: "avc1.640033", width: width & ~1, height: height & ~1, bitrate, framerate: fps, avc: { format: "annexb" } };
        if (!(await VideoEncoder.isConfigSupported(cfg)).supported) cfg.codec = "avc1.4d0033";
        enc.configure(cfg); R.size = [cfg.width, cfg.height];
        const cv = new OffscreenCanvas(cfg.width, cfg.height), g = cv.getContext("2d");
        const reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
        const step = 1e6 / fps;
        let prev = null, t0 = null, finished = false, gotFirst;
        const first = new Promise((r) => { gotFirst = r; });

        // Drive the tour once the first frame is in, so the opening is not lost to capture
        // start-up: each chapter from 0 to its end plus a hold.
        (async () => {
          // Element Capture sends frames only when the element repaints, so a still stage
          // never delivers the first frame. Nudge its opacity until one arrives.
          const fit = document.getElementById("wt-fit");
          let nudging = true; first.then(() => { nudging = false; fit.style.opacity = ""; });
          (function nudge(i) { if (!nudging) return; fit.style.opacity = i % 2 ? "0.999" : "1"; requestAnimationFrame(() => nudge(i + 1)); })(0);
          await first;
          // The hold runs on its own clock with the player paused on the end frame, so the
          // player's auto-advance gap (gapMs) can never cut it short or start the next chapter.
          const holdEnd = (ms) => new Promise((r) => { const end = performance.now() + ms;
            (function n(i) { if (performance.now() >= end) { fit.style.opacity = ""; return r(); } fit.style.opacity = i % 2 ? "0.999" : "1"; requestAnimationFrame(() => n(i + 1)); })(0); });
          for (const id of ids) {
            window.__player.set({ scene: id, t: 0 }); window.__player.play();
            const dur = window.__player.scenes().find((s) => s.id === id).duration;
            await new Promise((r) => { const tick = () => window.__player.state().t >= dur || window.__player.state().scene !== id ? r() : requestAnimationFrame(tick); tick(); });
            window.__player.pause(); window.__player.set({ t: dur });
            await holdEnd(hold);
          }
          // A still stage sends no frames, so a pending read() would wait forever: stopping
          // the track ends the stream and the read returns done.
          finished = true; R.endedAt = performance.now(); track.stop();
        })();

        // Captured frames follow the real window, which the display can clamp, and pad the
        // element with pure black. Find the stage's box in the first frame (the magenta
        // cover's pixels), crop every frame to it, and skip frames that still show the cover.
        let crop = null;
        const magenta = (d, i) => d[i] > 200 && d[i + 1] < 60 && d[i + 2] > 200;
        const findCrop = (frame) => {
          const fw = frame.displayWidth, fh = frame.displayHeight, c = new OffscreenCanvas(fw, fh), x = c.getContext("2d");
          x.drawImage(frame, 0, 0); const d = x.getImageData(0, 0, fw, fh).data;
          let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
          for (let y = 0; y < fh; y += 2) for (let i = y * fw * 4, xx = 0; xx < fw; xx += 2, i += 8) {
            if (magenta(d, i)) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
          }
          if (x1 < 0) return null;
          return { sx: x0, sy: y0, sw: Math.min(fw, x1 + 2) - x0, sh: Math.min(fh, y1 + 2) - y0 };
        };
        const covered = (frame) => {
          const c = new OffscreenCanvas(8, 8), x = c.getContext("2d");
          x.drawImage(frame, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, 8, 8); const d = x.getImageData(0, 0, 8, 8).data;
          for (let i = 0; i < d.length; i += 4) if (!magenta(d, i)) return false;
          return true;
        };
        const emit = (frame) => {
          const { sx, sy, sw, sh } = crop;
          const k = Math.min(cfg.width / sw, cfg.height / sh), w = sw * k, h = sh * k;
          g.fillStyle = "#000"; g.fillRect(0, 0, cfg.width, cfg.height);
          g.drawImage(frame, sx, sy, sw, sh, (cfg.width - w) / 2, (cfg.height - h) / 2, w, h);
          const f = new VideoFrame(cv, { timestamp: R.frames * step, duration: step });
          enc.encode(f, { keyFrame: R.frames % (fps * 2) === 0 }); f.close(); R.frames++;
        };
        while (!finished) {
          const { value: frame, done } = await reader.read();
          if (done) break;
          R.captured++;
          if (!crop) {
            const fw = frame.displayWidth, fh = frame.displayHeight;
            crop = findCrop(frame); frame.close();
            if (!crop) throw new Error("the stage cover did not show in the first captured frame, so the stage box is unknown");
            R.crop = { ...crop, fw, fh }; mark.remove(); continue;
          }
          if (t0 === null) {
            if (covered(frame)) { frame.close(); continue; } // frames painted before the cover came off
            t0 = frame.timestamp; R.startedAt = performance.now(); gotFirst();
          }
          // Fill the constant-rate grid up to this frame's time with the previous frame.
          const due = Math.floor((frame.timestamp - t0) / step);
          if (prev) { while (R.frames < due) emit(prev); prev.close(); }
          prev = frame;
          while (enc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0));
        }
        // Hold the last frame to the end of the recording, then flush.
        if (prev) { const end = Math.round(((R.endedAt || performance.now()) - R.startedAt) * 1000 / step); do emit(prev); while (R.frames < end); prev.close(); }
        await enc.flush();
      } catch (e) { R.err = String((e && e.stack) || e); }
      mark.remove();
      R.done = true;
    };
  }, { ids, fps, hold, bitrate, width, height });

  const total = await page.evaluate((ids) => ids.reduce((a, id) => a + window.__player.scenes().find((s) => s.id === id).duration, 0), ids);
  console.log(`recording ${ids.length} chapter(s), about ${((total + hold * ids.length) / 1000).toFixed(1)} s`);
  // Capture start fails now and then with "NotReadableError: Could not start video source"
  // (2 of 7 runs on Windows, 2026-10-20); a fresh attempt a second later works.
  let info;
  for (let attempt = 1; ; attempt++) {
    await page.evaluate(() => { window.__rec = null; });
    await page.click("#wt-rec");
    await page.waitForFunction(() => window.__rec && window.__rec.done, null, { timeout: total + hold * ids.length + 60000, polling: 500 });
    info = await page.evaluate(() => ({ err: __rec.err, frames: __rec.frames, captured: __rec.captured, size: __rec.size, crop: __rec.crop }));
    if (info.err && /NotReadableError/.test(info.err) && attempt < 4) { console.log(`capture did not start, retrying (${attempt})`); await page.waitForTimeout(1000); continue; }
    break;
  }
  if (info.err) throw new Error(info.err);
  console.log(`encoded ${info.frames} frames (${(info.frames / fps).toFixed(2)} s at ${fps} fps) from ${info.captured} captured, ${info.size.join("x")}`);
  const c = info.crop, stageAspect = await page.evaluate(() => { const r = document.getElementById("wt-fit").getBoundingClientRect(); return r.width / r.height; });
  console.log(`capture ${c.fw}x${c.fh}, stage found at ${c.sx},${c.sy} ${c.sw}x${c.sh}`);
  if (Math.abs(c.sw / c.sh / stageAspect - 1) > 0.02) console.log(`WARNING: captured stage aspect ${(c.sw / c.sh).toFixed(3)} differs from the stage's ${stageAspect.toFixed(3)}; check a frame for clipping or stretching`);

  // Pull the stream out in pieces and pipe it into ffmpeg, which copies it and writes
  // BT.709 colour tags into the stream.
  const ff = spawn("ffmpeg", ["-v", "error", "-y", "-f", "h264", "-framerate", String(fps), "-i", "-", "-c:v", "copy",
    "-bsf:v", "h264_metadata=colour_primaries=1:transfer_characteristics=13:matrix_coefficients=1:video_full_range_flag=0", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
  const n = await page.evaluate(() => __rec.chunks.length);
  for (let i = 0; i < n; i += 200) {
    const part = await page.evaluate(([a, b]) => {
      const cs = __rec.chunks.slice(a, b), o = new Uint8Array(cs.reduce((s, c) => s + c.length, 0));
      let p = 0; for (const c of cs) { o.set(c, p); p += c.length; }
      let s = ""; for (let k = 0; k < o.length; k += 0x8000) s += String.fromCharCode.apply(null, o.subarray(k, k + 0x8000));
      return btoa(s);
    }, [i, i + 200]);
    if (!ff.stdin.write(Buffer.from(part, "base64"))) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  const code = await new Promise((r) => ff.on("close", r));
  if (code !== 0) throw new Error("ffmpeg exited " + code);
  console.log(`wrote ${out}\nverify: ffprobe -v error -show_entries stream=codec_name,profile,width,height,r_frame_rate,nb_frames -of compact "${out}"`);
} catch (e) {
  console.error("export failed:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
