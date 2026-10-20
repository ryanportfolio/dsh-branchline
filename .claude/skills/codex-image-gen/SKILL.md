---
name: codex-image-gen
description: "Image asset needed (icon, sprite, texture, splash, logo, marketing art, illustration) from inside Claude Code → drive Codex image_gen via codex exec. Use: \"generate an image\", \"make an icon\", \"use gpt-image / my Codex sub\", placeholder asset → real art."
---

# Codex Image Generation

## Overview

Codex CLI runs on the user's ChatGPT/Codex subscription and its agent carries an `image_gen.imagegen` tool. Claude Code cannot generate images itself, but it can drive Codex non-interactively: Bash → `codex exec` → the prompt tells Codex to generate and save a PNG into the workspace. No API key; billing rides the user's subscription.

## Preflight

```bash
codex --version && codex login status
```

- Expect `Logged in using ChatGPT`. Not logged in → STOP and ask the user to run `codex login` (browser OAuth) in their own terminal. Never handle credentials yourself.
- If the project has its own art-direction or visual-style skill/reference, load it FIRST and fold its constraints into the image prompt.

## Recipe

```bash
codex exec -m gpt-6-astra -c model_reasoning_effort=medium -c model_provider=openai -s workspace-write -i ref1.png -i ref2.png - <<'PROMPT'
Use your image generation tool (image_gen) to create ONE image and save it to <scratch-dir>/<name>-raw.png in this workspace. Do nothing else - no code changes. If image_gen is not available, say so and stop; do not draw the image any other way.

The attached images are style references: <name what each one is>.
Match: <medium, material language, palette ROLES (not just hex), background/transparency, framing>.

Subject: <composition: what dominates, what contains it, where accents route>.

Do NOT produce: <the drift you fear: generic styles, backgrounds, text, extra variants>.

Requirements: <W>x<H> PNG, <transparent background if the asset needs alpha>, save exactly to <scratch-dir>/<name>-raw.png
PROMPT
```

Hard rules:

- Prompt goes via stdin (`-`). `-i` is VARIADIC: a trailing prompt argument is swallowed as a filename and codex dies with `No prompt provided via stdin`.
- `-s workspace-write`: the default read-only sandbox blocks the save.
- `-m gpt-6-astra -c model_reasoning_effort=medium` pins the agent model that drives `image_gen`, overriding `~/.codex/config.toml`. The image model itself is chosen by Codex's backend.
- `-c model_provider=openai` forces direct ChatGPT login for this run only. A proxy/gateway `model_provider` in `~/.codex/config.toml` (e.g. CLIProxyAPI) does not expose `image_gen`: Codex answers "image_gen is not available" and makes nothing. The config file stays untouched.
- `Reconnecting... n/5` followed by `401 Unauthorized: Incorrect API key provided: sk-svcac…` on `chatgpt.com/backend-api/codex/responses`, while `codex login status` reports ChatGPT, points to an OpenAI outage rather than local auth. Check https://status.openai.com before debugging auth.json, env vars or config; report the outage and stop.
- The "do not draw it any other way" line stops Codex from faking the image with System.Drawing or code when the tool is missing. Check the result: a generated PNG is hundreds of KB with visible texture; a few-KB flat file means it was drawn in code.
- Style references are optional but strongly recommended for anything that must match an existing look: attach 1-3 with `-i` (the project's canonical art plus the 1-2 nearest existing assets of the same class). No refs → generic output. One-off standalone art with no house style → refs optional, but still write palette/medium/negatives explicitly.
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
3. Delete the scratch raw once the final asset is committed.

## Common mistakes

| Symptom | Cause → fix |
|---|---|
| `Reading prompt from stdin... No prompt provided` | prompt arg eaten by variadic `-i` → pass prompt via stdin `-` |
| generation ran but no file | read-only sandbox → `-s workspace-write` |
| output reads generic / off-brand | no style refs, no art-direction constraints → attach refs, describe palette roles + negatives |
| jagged downscale | NearestNeighbor on unaligned pixels → HighQualityBicubic |
| surprise sub usage | one generation ≈ 60-70k Codex tokens → don't spray unrequested variants; batch deliberate prompts |
