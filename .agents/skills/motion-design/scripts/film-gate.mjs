// Continuity gate for generated video (see ../references/generated-film.md).
// Usage: node film-gate.mjs <clip.mp4> [more.mp4 ...] [--max-freeze 0.5] [--freeze-ssim 0.995]
// Proves each file is one continuous shot: no hard cut inside it and no stretch where the camera stops.
// Exit 0 = every file passed, 1 = a file failed, 2 = usage error or ffmpeg/ffprobe could not measure.
//
// Method: SSIM at 480 px wide. Cuts: every adjacent frame pair, read as dissimilarity d = 1 - SSIM.
// A fixed threshold fails here: a fast smooth dolly changes most of the frame every step, while a cut
// between two similar frames changes little. What separates them is the local shape of the curve:
//   cut    d of one pair jumps far above the median d of the pairs around it (the pair itself excluded,
//          so a cut cannot raise its own baseline): d > 3x local median and d > local median + 0.15
//   freeze frame n and frame n + L (L = --max-freeze seconds of frames) score above --freeze-ssim, so nothing
//          visible changed for that long: a dead scroll zone. Adjacent pairs cannot judge this: a slow push
//          or dissolve at 24 fps changes so little per frame that it scored 0.998, like a stopped camera.
//          Moving over featureless areas (flat sky, black) also counts as frozen; on a scroll film it reads as one.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); if (i < 0) return def; const v = Number(args[i + 1]); args.splice(i, 2); return v; };
const maxFreeze = opt('--max-freeze', 0.5);
const freezeSsim = opt('--freeze-ssim', 0.995);
const files = args;
if (!files.length || !Number.isFinite(maxFreeze) || !Number.isFinite(freezeSsim)) {
  console.error('usage: node film-gate.mjs <clip.mp4> [more.mp4 ...] [--max-freeze 0.5] [--freeze-ssim 0.995]');
  process.exit(2);
}

function run(cmd, argv) {
  const r = spawnSync(cmd, argv, { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.error) throw new Error(`${cmd} could not start (${r.error.code}); is it on PATH?`);
  return r;
}

function fps(file) {
  const r = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=avg_frame_rate', '-of', 'csv=p=0', file]);
  const [n, d] = r.stdout.trim().split('/').map(Number);
  return n > 0 && d > 0 ? n / d : NaN;
}

function pairs(file, lag = 1) {
  // The file against itself shifted by lag frames: pair n compares frame n with frame n + lag.
  const graph = `[0:v]trim=start_frame=${lag},setpts=PTS-STARTPTS,scale=480:-2[a];[1:v]scale=480:-2[b];[a][b]ssim=stats_file=-:shortest=1`;
  const r = run('ffmpeg', ['-v', 'error', '-nostdin', '-i', file, '-i', file, '-lavfi', graph, '-f', 'null', '-']);
  const out = [];
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = /All:(-?[0-9.]+)/.exec(line);   // SSIM goes negative for inverted contrast, often at a cut
    if (m) out.push(Number(m[1]));
  }
  // Any nonzero exit fails, even after some rows: partial statistics would certify a clip never fully decoded.
  if (r.status !== 0) throw new Error(r.stderr.trim().split(/\r?\n/).slice(-2).join(' '));
  return out;
}

const median = a => { const s = [...a].sort((x, y) => x - y); const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };

let failed = false, broken = false;
for (const file of files) {
  if (!existsSync(file)) { console.log(`FAIL ${file}: file not found`); broken = true; continue; }
  let ssim, lagged, lag, rate;
  try {
    ssim = pairs(file); rate = fps(file);
    lag = Math.max(1, Math.round(maxFreeze * rate));
    lagged = Number.isFinite(rate) && ssim.length > lag ? pairs(file, lag) : [];
  } catch (e) { console.log(`FAIL ${file}: ${e.message}`); broken = true; continue; }
  if (ssim.length < 8 || !Number.isFinite(rate) || !lagged.length) {
    // A gate that passes without measuring anything is worse than no gate.
    console.log(`FAIL ${file}: measured ${ssim.length} frame pairs, fps ${rate}; too few to judge`);
    broken = true; continue;
  }
  const d = ssim.map(s => 1 - s);
  const cuts = [];
  for (let i = 0; i < d.length; i++) {
    const near = [];
    for (let j = Math.max(0, i - 4); j <= Math.min(d.length - 1, i + 4); j++) if (j !== i) near.push(d[j]);
    const base = median(near);
    if (d[i] > 3 * base && d[i] > base + 0.15) cuts.push({ frame: i + 1, ssim: ssim[i], base: 1 - base });
  }
  const freezes = [];
  for (let i = 0; i < lagged.length;) {
    if (lagged[i] <= freezeSsim) { i++; continue; }
    let j = i; while (j < lagged.length && lagged[j] > freezeSsim) j++;
    freezes.push({ frame: i + 1, secs: (j - i + lag) / rate });
    i = j;
  }
  const ok = !cuts.length && !freezes.length;
  failed ||= !ok;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${file}: ${ssim.length + 1} frames at ${rate.toFixed(2)} fps, median SSIM ${median(ssim).toFixed(3)}, lowest ${Math.min(...ssim).toFixed(3)}`);
  for (const c of cuts.slice(0, 6)) console.log(`  cut at frame ${c.frame} (${(c.frame / rate).toFixed(2)} s): SSIM ${c.ssim.toFixed(3)} vs local ${c.base.toFixed(3)}`);
  for (const f of freezes.slice(0, 6)) console.log(`  frozen from frame ${f.frame} (${(f.frame / rate).toFixed(2)} s) for ${f.secs.toFixed(2)} s`);
  // Fast motion over fine texture decorrelates every step, so a jump looks like one more step.
  // Measured: a 40 px/frame pan scored median 0.49, and a 300 px skip inside it passed.
  if (median(ssim) < 0.6) console.log('  WARN median SSIM under 0.6: cuts and skips inside fast motion are hard to see here; watch this file at 1x');
}
process.exitCode = broken ? 2 : failed ? 1 : 0;
