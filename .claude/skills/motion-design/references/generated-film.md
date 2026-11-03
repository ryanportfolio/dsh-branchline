# Generated film: chained clips + continuity gate

Scroll film or hero film from AI video (Seedance, Veo, any model that pins a start AND end image). Goal: one continuous camera move, no cuts, no stalls. Ideas from the Living Site skill (Notion, 2026-10); code here written fresh, nothing copied.

## Cost gate

Generation is paid. Never run `film-chain.mjs --run` until the owner has confirmed the credit total that the dry run printed. Stop and ask when credits run out; never retry a billed job blindly.

- Dry run (default) prints clips on disk, clips to make, credits. `--run` spends.
- `ledger.tsv` gets one row per generated clip: time, clip, credits, path. Count spend from ledger, not account balance (balance shared with other work).
- Price card reported by source, Oct 2026, unverified here: Seedance 2.0 5 s 1080p ≈ 60 credits, 720p ≈ 30, Nano Banana 2 still = 2. Check provider's price command before quoting.
- Remaking a keyframe costs a still; a clip that cuts costs a whole clip. Fix keyframes first.

## Plan the move

- **One camera move for whole film**: push in, pull back, push to a detail, or morph through time. Slideshow test: if two beats could swap places unnoticed → scenes, not a shot.
- **End on what next section shows live** (film ends on an orb → live 3D orb waits below; [page-runtime.md](page-runtime.md)).
- **Keyframes as chain**, 3 to 5: keyframe N+1 made with keyframe N as image reference. Same camera direction, same light, same place; one change per step (distance, framing, or one action). Prompt every step after first with "Same ..., same light, same camera direction as the reference". Contact sheet → remake any frame that turns camera or changes room.
- **Prompts**, one per clip: open "One continuous single shot, no cuts.", name ONE move ("steady dolly push in"), say light stays same. Audio off.
- Generated on-screen text = mush: "screen of soft light bars, no readable text".
- Model must honour BOTH pins. Source reported Seedance 2.0 does; 2.5 treats them as loose references and redraws start → chain breaks. Unverified here; check one clip's first frame against its start image.

## Build: `scripts/film-chain.mjs`

```bash
node .claude/skills/motion-design/scripts/film-chain.mjs film.json          # dry run
node .claude/skills/motion-design/scripts/film-chain.mjs film.json --run    # after owner confirms credits
```

`film.json` (paths relative to it):

```json
{ "keyframes": ["kf/k1.png", "kf/k2.png", "kf/k3.png"],
  "prompts": ["One continuous single shot, no cuts. The camera pushes in ...", "One continuous single shot, no cuts. ..."],
  "adapter": "adapter.mjs", "creditsPerClip": 60, "ledger": "ledger.tsv", "out": "film/film.mp4" }
```

What it does:
- Clip i starts on clip i-1's exact last frame (read back with ffmpeg, never keyframe) and ends on keyframe i+1 → seams match by construction.
- Strictly in order. Clip on disk (`film/c<i>.mp4`) reused, never repaid.
- Each clip gated before next starts. Fail → `c<i>.mp4` renamed `c<i>.cut.mp4` and `c<i>.job-id` renamed `c<i>.cut.job-id` (kept as evidence, never reused, so the rerun makes a new job), run stops. Gate could not measure (exit 2: ffmpeg missing, unreadable file) → clip and job left in place, run stops; no verdict, nothing retired.
- Join drops first frame of clip 2+ (repeats previous last frame), H.264 CRF 16, no audio, then gates whole film.
- Needs `ffmpeg` + `ffprobe` on PATH. Plain Node, no shell: runs same on Windows, macOS, Linux.

Fix for a cut clip: remake keyframe i+1 from `film/c<i-1>-last.png` (or k1), same angle, smaller step ("exactly the same frame, same camera angle, camera has pushed in only a little closer"). Delete nothing else, rerun. Never hide a cut with a dissolve; never buy a bridge clip.

### Adapter contract

`adapter.mjs` exports `async generate({ index, start, end, prompt, out, dir })`. Must write `out` (mp4) or throw.

- Persist provider job id next to `out` as exactly `c<i>.job-id` (the name the chain retires on a failed gate) the moment it exists; on rerun, wait on that job instead of creating a new one. Chain only logs credits after `out` exists, so a crash mid-job leaves billing to the adapter's record.
- Use `execFile` with an argv array, no shell: prompts carry quotes and commas.
- Windows: npm-installed CLIs are `.cmd` shims; Node 24 `execFile` refuses them (`EINVAL`) without `shell: true`. Call the CLI's `.exe`, or `node <its JS entry>`. Never switch to `shell: true` with a prompt in argv.

Higgsfield skeleton. Flags as the source skill used them (Oct 2026), unverified here; check `higgsfield generate create --help` first:

```js
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const HF = ['C:/path/to/higgsfield.exe'];   // or ['node', '<entry>.js'] for an npm shim
const run = a => execFileSync(HF[0], [...HF.slice(1), ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
export async function generate({ start, end, prompt, out }) {
  const idFile = out.replace(/\.mp4$/, '.job-id');
  let id = existsSync(idFile) ? readFileSync(idFile, 'utf8').trim() : '';
  if (!id) {
    const res = run(['generate', 'create', 'seedance_2_0', '--mode', 'std', '--resolution', '1080p', '--duration', '5',
      '--generate_audio', 'false', '--start-image', start, '--end-image', end, '--prompt', prompt, '--json']);
    id = (res.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/) || [])[0];
    if (!id) throw new Error('no job id: ' + res.slice(-300));
    writeFileSync(idFile, id);
  }
  const done = run(['generate', 'wait', id, '--timeout', '25m', '--json']);
  const url = (done.match(/https:\/\/[^"\s]+\.mp4[^"\s]*/g) || []).pop();
  if (!url) throw new Error('no video url: ' + done.slice(-300));
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${r.status}; job ${id} kept in ${idFile}, do not pay twice`);
  writeFileSync(out, Buffer.from(await r.arrayBuffer()));
}
```

Source tip, unverified: safety filter refuses harmless prompts with upright-cylinder words (pillar, tube, rod, post) → "low wide drum", "disc stack", "rounded block".

## Gate: `scripts/film-gate.mjs`

```bash
node .claude/skills/motion-design/scripts/film-gate.mjs film/film.mp4 [more.mp4 ...] [--max-freeze 0.5] [--freeze-ssim 0.995]
```

Exit 0 pass, 1 fail, 2 could not measure (missing file, not a video, under 8 frame pairs). Never treat exit 2 as pass.

- **Cut**: SSIM of adjacent frames at 480 px, as dissimilarity d = 1 - SSIM. Cut when d > 3x median d of the 8 neighbouring pairs (pair itself excluded) and > that median + 0.15. Fixed threshold fails: smooth fast pan scored median 0.49 per step; hard cut between similar frames scores high.
- **Freeze**: frame n vs frame n + `--max-freeze` s scores above `--freeze-ssim` → nothing visible changed that long = dead scroll zone. Adjacent pairs can't judge this: slow 4 s dissolve scored 0.998 per step, same as a stopped camera.

Measured 2026-10-28 on synthetic clips (ffmpeg 8.0.1): smooth zoom PASS (median 0.989); hard cut caught (0.504 vs local 0.986); cut to the inverted frame caught (SSIM goes negative; parsed signed); zoom jump mid-push caught (0.482 vs 0.984); 1.5 s hold caught as 1.54 s freeze; textured pan 40 px/frame PASS (median 0.488).

Limits:
- Median SSIM under 0.6 (fast motion over fine texture) → gate prints WARN: a 300 px skip inside the 40 px/frame pan passed. Watch those files at 1x.
- Moving over featureless area (flat sky, black) counts as frozen. On a scroll film it reads as one; recompose or shorten.
- Pinned clips often ease in and out → stall at each seam. Gate flags it on the joined film; trim ease frames or retime.
- Not for ping-pong loops: frames mirror around the reversal, so the turnaround reads as a freeze (measured 0.71 s on a 4 s loop). Gate the source clip before reversing it.
- Gate proves continuity only. Still watch film at 1x and slow scroll for wobble, morphing faces, physics.

## Show it

- Scroll scrub: [web-effects.md#scroll-scrubbed-video](web-effects.md#scroll-scrubbed-video) (all-keyframe encode `-g 1`, neighbour crossfade so slow scroll glides).
- Frame film (rounded, shadow) with captions beside it. Text over footage fights picture.
- **Living still** for cards: a clip with start = end image and calm motion that can come home ("locked-off camera, leaf shadows drift across the wall and back"), then forward + reversed for a loop with no seam:

```bash
ffmpeg -i in.mp4 -filter_complex "[0:v]scale=960:-2,split[a][b];[a]trim=start_frame=1,setpts=PTS-STARTPTS[f];[b]reverse,trim=start_frame=1,setpts=PTS-STARTPTS[r];[f][r]concat=n=2:v=1[v]" -map "[v]" -an -c:v libx264 -crf 25 -pix_fmt yuv420p -movflags +faststart loop.mp4
```

  Same as the [boomerang loop](web-effects.md#boomerang-loop) at web size: each half drops its first frame, so no frame repeats at the turn or the wrap (4-frame test: `1,2,3,2,1,0`). `reverse` buffers whole clip in memory: fine for 5 s at 960 px. Play `<video muted playsinline loop autoplay poster="still.jpg">`. Model outputs 16:9 from portrait still → crop in card with `object-fit: cover`.
