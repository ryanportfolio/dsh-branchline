// Chained film builder for generated video (see ../references/generated-film.md).
// Usage: node film-chain.mjs <film.json>         dry run: prints the plan and the credits it would spend
//        node film-chain.mjs <film.json> --run   generates, gates and joins
//
// film.json (paths relative to the file):
//   { "keyframes": ["kf/k1.png", "kf/k2.png", "kf/k3.png"],     N keyframes, each made from the one before
//     "prompts": ["One continuous single shot, no cuts. ...", ...], N-1 prompts, one camera move per clip
//     "adapter": "adapter.mjs",                                    exports async generate({ index, start, end, prompt, out, dir });
//                                                                  job id in c<i>.job-id next to out (retired on a failed gate)
//     "creditsPerClip": 60, "ledger": "ledger.tsv", "out": "film/film.mp4" }
//
// Clip i starts on the exact last frame of clip i-1 (pixels read back with ffmpeg, never the keyframe) and
// ends on keyframe i+1, so both ends are pinned and the seams match by construction. Clips are made strictly
// in order. A finished clip on disk is reused, never paid for again. Every clip is gated for hidden cuts
// (film-gate.mjs) before the next one starts; a clip that fails is renamed *.cut.mp4 and the run stops.
// Clip 2 onwards drops its first frame on join, because it repeats the previous clip's last frame.
import { spawnSync } from 'node:child_process';
import { existsSync, statSync, readFileSync, appendFileSync, mkdirSync, renameSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const [planPath, flag] = process.argv.slice(2);
if (!planPath || (flag && flag !== '--run')) { console.error('usage: node film-chain.mjs <film.json> [--run]'); process.exit(2); }
const dir = dirname(resolve(planPath));
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const at = p => resolve(dir, p);
const gate = join(dirname(fileURLToPath(import.meta.url)), 'film-gate.mjs');
const nonEmpty = p => existsSync(p) && statSync(p).size > 0;

const kf = (plan.keyframes || []).map(at);
const prompts = plan.prompts || [];
const problems = [];
if (kf.length < 2) problems.push('need at least 2 keyframes');
if (prompts.length !== kf.length - 1) problems.push(`need ${kf.length - 1} prompts for ${kf.length} keyframes, got ${prompts.length}`);
for (const k of kf) if (!nonEmpty(k)) problems.push(`keyframe missing: ${k}`);
if (!plan.adapter || !nonEmpty(at(plan.adapter))) problems.push('adapter missing (film.json "adapter")');
if (!Number.isFinite(plan.creditsPerClip)) problems.push('creditsPerClip missing: quote it from the provider price card');
if (problems.length) { for (const p of problems) console.error(p); process.exit(2); }

const filmDir = dirname(at(plan.out || 'film/film.mp4'));
const out = at(plan.out || 'film/film.mp4');
const ledger = at(plan.ledger || 'ledger.tsv');
const clip = i => join(filmDir, `c${i}.mp4`);
const todo = prompts.map((_, k) => k + 1).filter(i => !nonEmpty(clip(i)));
console.log(`${prompts.length} clips: ${prompts.length - todo.length} on disk, ${todo.length} to generate, about ${todo.length * plan.creditsPerClip} credits`);
if (flag !== '--run') { console.log('dry run: nothing generated. Confirm the credits with the owner, then rerun with --run.'); process.exit(0); }

function ffmpeg(argv) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-nostdin', '-y', ...argv], { encoding: 'utf8' });
  if (r.error || r.status !== 0) throw new Error(`ffmpeg failed: ${r.error?.code || r.stderr.trim()}`);
}

// No process.exit() after the adapter ran: Node 24 on Windows can abort on exit right after a fetch().
async function main() {
  mkdirSync(filmDir, { recursive: true });
  const { generate } = await import(pathToFileURL(at(plan.adapter)).href);
  if (typeof generate !== 'function') { console.error('adapter must export async function generate(...)'); return 2; }

  let start = kf[0];
  for (let i = 1; i <= prompts.length; i++) {
    const c = clip(i);
    if (!nonEmpty(c)) {
      console.log(`clip ${i}: generating`);
      try { await generate({ index: i, start, end: kf[i], prompt: prompts[i - 1], out: c, dir }); }
      catch (e) {
        // The job may still be running or billed: the adapter's own job-id file is what lets a rerun resume it.
        console.error(`clip ${i}: adapter failed: ${String(e.message || e).split(/\r?\n/)[0]}`);
        return 1;
      }
      if (!nonEmpty(c)) { console.error(`clip ${i}: adapter returned but ${c} is missing or empty`); return 1; }
      appendFileSync(ledger, `${new Date().toISOString()}\tclip ${i}\t${plan.creditsPerClip}\t${c}\n`);
    } else console.log(`clip ${i}: on disk, reused`);
    const g = spawnSync(process.execPath, [gate, c], { encoding: 'utf8' });
    process.stdout.write(g.stdout);
    if (g.status !== 1 && g.status !== 0) {
      // Not measured (ffmpeg missing, unreadable file): no verdict, so the paid clip and its job stay in place.
      process.stderr.write(g.stderr || '');
      console.error(`clip ${i} could not be measured; ${c} left in place. Fix the cause (ffmpeg on PATH? a real video?), then rerun.`);
      return 1;
    }
    if (g.status === 1) {
      const kept = c.replace(/\.mp4$/, '.cut.mp4');
      renameSync(c, kept);
      // Retire the provider job too, or a resuming adapter would download the rejected clip again.
      const job = c.replace(/\.mp4$/, '.job-id');
      if (existsSync(job)) renameSync(job, c.replace(/\.mp4$/, '.cut.job-id'));
      console.error(`clip ${i} failed the gate; kept as ${kept}. Remake keyframe ${i + 1} from ${start} with the same camera angle and a smaller step, then rerun.`);
      return 1;
    }
    // -update 1 overwrites one image per decoded frame of the last second, leaving the true last frame.
    const last = join(filmDir, `c${i}-last.png`);
    ffmpeg(['-sseof', '-1', '-i', c, '-update', '1', last]);
    start = last;
  }

  const n = prompts.length;
  let graph = '';
  for (let i = 0; i < n; i++) graph += i === 0 ? `[0:v]setpts=PTS-STARTPTS[v0];` : `[${i}:v]trim=start_frame=1,setpts=PTS-STARTPTS[v${i}];`;
  for (let i = 0; i < n; i++) graph += `[v${i}]`;
  graph += `concat=n=${n}:v=1:a=0[v]`;
  ffmpeg([...prompts.flatMap((_, k) => ['-i', clip(k + 1)]), '-filter_complex', graph, '-map', '[v]', '-an',
    '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
  const g = spawnSync(process.execPath, [gate, out], { encoding: 'utf8' });
  process.stdout.write(g.stdout);
  console.log(g.status === 0 ? `film: ${out}` : 'joined film failed the gate; check the seams listed above');
  return g.status === 0 ? 0 : 1;
}
process.exitCode = await main();
