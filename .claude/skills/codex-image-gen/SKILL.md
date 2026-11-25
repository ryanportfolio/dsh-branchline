---
name: codex-image-gen
description: "Image asset needed (icon, sprite, texture, splash, logo, marketing art, illustration) → Codex image_gen via the shared codex-run runner. Use: 'generate an image', 'make an icon', 'use gpt-image / my Codex sub', placeholder → real art."
---

# Codex Image Generation

## Overview

Codex CLI runs on the user's ChatGPT/Codex subscription and its agent carries an `image_gen` tool. Claude Code cannot generate images itself, but it can drive Codex non-interactively through the shared runner `codex-run.mjs` (docs: the `README.md` beside it). The prompt tells Codex to generate and save a PNG into the workspace. Never hand-build `codex exec` lines. No API key; billing rides the user's subscription.

Run every command below from the repository root, with `$RUNNER` resolved in the same shell call: the repo's own runner, then the one shipped beside this skill, then the user install.

```bash
for RUNNER in .claude/scripts/codex-run/codex-run.mjs "<this skill's folder>/../../scripts/codex-run/codex-run.mjs" "$HOME/.claude/scripts/codex-run/codex-run.mjs" ""; do [ -f "$RUNNER" ] && break; done
test -n "$RUNNER" || echo "codex-run runner not found: stop and tell the user"
```

## Preflight

```bash
node "$RUNNER" --preflight
```

- Expect `"chatgptLogin": true`. The image tool needs a direct ChatGPT login; a gateway login alone does not expose it. If it is false, stop and ask the user to run `codex login` (browser OAuth) in their own terminal. Never handle credentials yourself.
- If the project has its own art-direction or visual-style skill/reference, load it before writing the image prompt and fold its constraints in.

## Recipe

```bash
node "$RUNNER" --out .tmp/img-run-<name>-<n> --role astra \
  --sandbox workspace-write --config model_provider=openai \
  --image ref1.png --image ref2.png --timeout-min 9 <<'PROMPT'
Use your image generation tool (image_gen) to create ONE image and save it to <scratch-dir>/<name>-raw.png in this workspace. Do nothing else - no code changes. If image_gen is not available, say so and stop; do not draw the image any other way.

The attached images are style references: <name what each one is>.
Match: <medium, material language, palette ROLES (not just hex), background/transparency, framing>.

Subject: <composition: what dominates, what contains it, where accents route>.

Do NOT produce: <the drift you fear: generic styles, backgrounds, text, extra variants>.

Requirements: <W>x<H> PNG, <transparent background if the asset needs alpha>, save exactly to <scratch-dir>/<name>-raw.png
PROMPT
```

Then read `<out>/result.json`: `ok`, `reason`, and the `observed` model, effort and sandbox. `ok` alone does not mean an image was made; check the PNG (see Verify).

Hard rules:

- `--out` is a new or empty dir per run; the runner refuses a non-empty one. A retry gets a new `--out`.
- `--role astra` picks the model pin in `models.json` next to the runner in use (the agent model that drives `image_gen`; the image model itself is chosen by Codex's backend). Never hard-code a model id in a skill or command.
- `--sandbox workspace-write`: the default `read-only` sandbox blocks the save.
- `--config model_provider=openai` forces direct ChatGPT login for this run only. A proxy/gateway `model_provider` in `~/.codex/config.toml` (e.g. CLIProxyAPI) does not expose `image_gen`: Codex answers "image_gen is not available" and makes nothing. The config file stays untouched.
- Plugins, apps, user hooks and user MCP servers stay off (the runner's default). The image tool works with them off (tested 2026-11-22: `image_gen` call made, PNG saved), so do not pass `--keep-plugins`.
- Prompt via stdin heredoc or `--prompt-file`. The runner places every `--image` before the `-` stdin marker, so Codex's variadic `-i` cannot swallow the prompt.
- Outside a git repo (scratch outside the repo, a study tree) → add `--skip-git-repo-check --cd <dir>`; the save path in the prompt is then relative to `<dir>`.
- The foreground Bash tool dies at 10 min, so keep `--timeout-min 9` in the foreground. Longer runs or batches: start in the background, poll `<out>/status.json`, read `result.json` after exit.
- Codex keeps its own raw copy under `~/.codex/generated_images/<threadId>/` and may downscale before saving to your path.
- `reason: model_rejected` → run `codex debug models`; if a newer Astra exists, tell the user, and edit `models.json` only with the user's OK. Any other failure → one retry with a new `--out`. Second failure → stop and report both.
- `Reconnecting... n/5` followed by `401 Unauthorized: Incorrect API key provided: sk-svcac…` on `chatgpt.com/backend-api/codex/responses` (in `<out>/stderr.log` or `events.jsonl`), while preflight reports ChatGPT, points to an OpenAI outage rather than local auth. Check https://status.openai.com before debugging auth.json, env vars or config; report the outage and stop.
- The "do not draw it any other way" line stops Codex from faking the image with System.Drawing or code when the tool is missing. Check the result: a generated PNG is hundreds of KB with visible texture; a few-KB flat file means it was drawn in code (flat simple subjects at small sizes run smaller; check `events.jsonl` for the image tool call if unsure).
- Style references are optional but strongly recommended for anything that must match an existing look: attach 1-3 with `--image` (the project's canonical art plus the 1-2 nearest existing assets of the same class). No refs → generic output. One-off standalone art with no house style → refs optional, but still write palette/medium/negatives explicitly.
- Generate large (1024×1024 or the model's native size) even for small targets; downscale afterwards. Raw output goes to a gitignored scratch dir (`.tmp/`, `scratch/`, whatever the project uses); only the processed asset is committed.
- Transparent background only when the asset genuinely needs alpha (icons, sprites, cutouts). Full-bleed art (splash, marketing, photos) → opaque, and say so in the prompt.

## Post-process (Windows, no image libs needed)

Downscale preserving alpha via PowerShell System.Drawing:

```powershell
Add-Type -AssemblyName System.Drawing
$src=[System.Drawing.Image]::FromFile("$PWD\.tmp\<name>-raw.png")
$bmp=New-Object System.Drawing.Bitmap <W>,<H>,([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g=[System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)
$g.DrawImage($src,0,0,<W>,<H>); $g.Dispose(); $src.Dispose()
$bmp.Save("$PWD\<final-path>.png",[System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
```

Use HighQualityBicubic, not NearestNeighbor: generated "pixel art" pixels are not grid-aligned, so nearest-neighbor shreds edges.

On non-Windows hosts use whatever is available (`sips` on macOS, ImageMagick/`ffmpeg` if installed), same rule: high-quality resample, preserve alpha.

## Verify

1. Read the final PNG with the Read tool and judge it at actual output size against the style refs / stated requirements (the user is still the final visual check; never claim visual verification beyond this).
2. Check dimensions/alpha mechanically (e.g. `node -e` PNG header read: bytes 16-23 hold width/height big-endian; color type byte 25 = 6 → RGBA). If the project pins assets with a test, run it.
3. Delete the scratch raw and the run dir once the final asset is committed.

## Common mistakes

| Symptom | Cause → fix |
|---|---|
| runner exit 2, `is not empty` | reused `--out` → new dir |
| generation ran but no file | missing `--sandbox workspace-write` |
| "image_gen is not available" | gateway provider → `--config model_provider=openai` |
| `Not inside a trusted directory` | outside a git repo → `--skip-git-repo-check --cd <dir>` |
| output reads generic / off-brand | no style refs, no art-direction constraints → attach refs, describe palette roles + negatives |
| jagged downscale | NearestNeighbor on unaligned pixels → HighQualityBicubic |
| unrequested variants | generate only what was asked; one generation is about 60-70k Codex tokens (test run 2026-11-22), so batch deliberate prompts. No usage or cost notices to the user |
