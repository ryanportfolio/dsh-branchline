# Export to video

Export only when the tour has to travel where JavaScript does not run: a landing-page video, a social post, an app store preview. The interactive player stays the primary artifact.

**Status: experimental.** It works end to end, but it has been measured on one Windows machine with Chrome, at one window geometry, and capture start fails now and then. Say so to the owner before they plan around it. When a video is the only deliverable, a scripted recording of the real product with a seeded demo account is usually the better tool.

## Why the motion-design recipe needs an extra step here

The `motion-design` skill's [verify-export.md](../../motion-design/references/verify-export.md) encodes MP4s in the page with WebCodecs from a canvas, and forbids reading back a PNG or screenshot per frame for ffmpeg (user instruction, 2026-10-19). A walkthrough is DOM, not canvas: the product's CSS lays out real elements, and a `VideoFrame` cannot be built from a DOM element directly. Chrome's **Element Capture** closes that gap: `getDisplayMedia({ preferCurrentTab: true })` plus `track.restrictTo(await RestrictionTarget.fromElement(stage))` gives a video track of the stage's composited pixels, which `MediaStreamTrackProcessor` turns into `VideoFrame`s for a `VideoEncoder`. Everything stays in the page; ffmpeg only copies the H.264 stream into MP4.

## The script

```bash
node checks/export-video.mjs --url http://127.0.0.1:PORT/player.html --out <artifacts>/<project>/tour-dark.mp4 --theme dark
```

Options: `--fps 60`, `--width 1920 --height 1152` (output size; keep the stage's aspect ratio), `--hold 1200` (ms held after each chapter), `--bitrate 16` (Mbit/s), chapter ids to export a subset. Large files go to an artifacts folder, not the repo or a screenshots folder.

What it does:

1. Opens the player with `?capture=1` (no caption, no dev bar; the stage element isolated and flattened, which Element Capture requires).
2. Starts the capture from a click (getDisplayMedia needs a user gesture; `--auto-accept-this-tab-capture` accepts the prompt).
3. Plays each chapter from 0 to its end plus the hold, at 1x. Export takes as long as the tour.
4. Resamples captured frames onto a constant frame-rate grid. Element Capture sends a frame only when the stage repaints, so still moments produce no frames; the script repeats the last frame to fill them. It crops each frame to the stage (found in the first frame as the non-black box) and scales it into the output size in an `OffscreenCanvas`.
5. Pipes the stream to `ffmpeg -c:v copy` with BT.709 colour tags.

Measured 2026-10-20 on Windows with Chrome: two 6.5 s chapters plus holds gave 921 frames for 15.35 s of tour at 60 fps, H.264 High, 1920 x 1152, in both themes; the frame strips matched the player.

## Known limits

- **Geometry is fragile.** Viewport 1440 x 1000 in a 1600 x 1100 window works. Viewport 1440 x 864, a stage scaled to fill the viewport, and no viewport emulation all delivered no frames (the script times out). A viewport larger than the display allows came out stretched; the script prints a warning when the captured stage's aspect ratio differs from the stage's by more than 2%. Change `--viewport` or `--window` only with a test export.
- **Capture resolution is the rendered stage size** (about 1600 x 960 at the default viewport), scaled up to the output size. Fine for 1080p web video; for sharper output, test a larger viewport on a larger display.
- **Capture start fails now and then** with `NotReadableError: Could not start video source` (2 of 7 runs). The script retries up to three times.
- **Real time.** A dropped compositor frame shows as a repeated frame. Check the export, do not assume it.
- Needs Chrome with Element Capture and ffmpeg on PATH. Headed, offscreen, muted; never headless, never minimized.

## Verify every export

Follow verify-export.md: `ffprobe` (codec, profile, size, frame rate, frame count against the expected duration), a frame strip per chapter (`ffmpeg -i tour.mp4 -vf "fps=2,scale=480:-1,tile=4x4" -frames:v 1 strip.png`) compared with the contact sheets, a brand-colour pixel check, and the flash check.

## If Element Capture is not available

Ask the owner before any fallback. The per-frame screenshot route (step `t`, screenshot the stage, encode with ffmpeg) is only allowed with their OK. Another option to offer: a screen recording made by the owner of the player at 1x.
