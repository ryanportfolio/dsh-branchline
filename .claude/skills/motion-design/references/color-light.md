# Colour, light and tone mapping

Compiled 2026-09-29. How to keep colour meaningful from the colour script to the tone mapper. The measured MAIMCOIL gotchas (emissive bleaching, same-hue light shifts) are in web-engine.md.

## Plan colour per beat

- **Colour script.** Ralph Eggleston made colour scripts a per-film tool at Pixar: quick pastel strips of each sequence, "an efficient way to convey color, light, emotion, and mood" ([Cartoon Brew](https://www.cartoonbrew.com/rip/ralph-eggleston-a-cornerstone-of-pixars-visual-style-dies-at-56-220781.html)). His aim was "a storyline through the intuitive emotions of color"; in WALL-E the first act is "very dull and muted" and "the colors get wildly saturated" as the leads come together ([interview](https://www.animationartconservation.com/design-with-a-purpose,-an-interview-with-ralph-eggleston.html)). For a film, add a colour strip per beat to the beat sheet before the animatic, and let saturation rise toward the payoff.
- **Value and silhouette first.** Valve designed Team Fortress 2's nine classes to be identifiable by silhouette alone, with shadows that "go to cool, not black", rim highlights instead of dark outlines, and "muted colors dominating and small areas of saturation" ([NPAR 2007 paper](https://steamcdn-a.akamaihd.net/apps/valve/2007/NPAR07_IllustrativeRenderingInTeamFortress2.pdf)). Riot's VALORANT keeps characters readable against any background with a red enemy fresnel and blue ally fresnel, dimmed so it does not distract ([Riot](https://www.riotgames.com/en/news/valorant-shaders-and-gameplay-clarity)).
- **Check.** Two actors that differ only in hue look the same in grayscale. Check beat frames in grayscale and as flat silhouettes before judging colour.

## Tone mappers and hue

Bevy documents each operator's hue behaviour ([docs.rs](https://docs.rs/bevy/latest/bevy/core_pipeline/tonemapping/enum.Tonemapping.html)):

| Operator | Bevy's note | Use |
|---|---|---|
| Reinhard (per channel) | "Suffers from lots hue shifting, brights don't desaturate naturally" | avoid for brand colour |
| ACES fitted | "intentional and dramatic hue shifting"; blues toward magenta, reds and greens toward orange | filmic punch, then grade hues |
| AgX | "Very neutral... Little to no hue shifting" | quiet, natural look |
| Tony McMapface | "Very neutral. Subtle but intentional hue shifting" | natural look |
| Khronos PBR Neutral | faithful brand colours "with low brightness grayscale lighting", but "significant Abney shifting" and it "tends to crush grays" | brand and product hex |

- Artists report "bright blue turn magenta with ACES tone mapping on", and that any per-channel curve "will skew values toward the secondary mixtures" ([ACEScentral](https://community.acescentral.com/t/high-light-fix-and-premature-desaturate/3041)). The skill's own `1 - exp(-x)` composite is a per-channel curve, so it skews the same way (inference); it is fine for white-hot light, not for brand hues.
- Krzysztof Narkowicz's popular ACES fit is "a very simple luminance only fit, which over saturates brights"; multiply by exposure before it and gamma-correct after ([blog](https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/)).
- John Hable: a filmic curve "will add saturation to your shadows and remove saturation from your highlights" ([blog](http://filmicworlds.com/blog/filmic-tonemapping-with-piecewise-power-curves/)).

### Khronos PBR Neutral

The README guarantees "there are no hue shifts (angle around the white axis)", and exact reproduction of base colours whose R, G and B all lie in 0.08 to 0.8 under unit white light ([README](https://github.com/KhronosGroup/ToneMapping/blob/main/PBR_Neutral/README.md)). Source, Apache-2.0, input and output in linear Rec. 709 ([pbrNeutral.glsl](https://github.com/KhronosGroup/ToneMapping/blob/main/PBR_Neutral/pbrNeutral.glsl)):

```glsl
vec3 PBRNeutralToneMapping( vec3 color ) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  const float d = 1. - startCompression;
  float newPeak = 1. - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1. - 1. / (desaturation * (peak - newPeak) + 1.);
  return mix(color, newPeak * vec3(1, 1, 1), g);
}
```

If ANGLE on D3D11 rejects the early return (see web-engine.md), compute both paths and select with `step(startCompression, peak)`.

## Bloom

- **No threshold on an HDR target.** Jorge Jimenez (Call of Duty: Advanced Warfare): "When using PBR the dynamic range is usually very high, so you don't need to threshold"; the bloom layer is "set to a low value (say 0.04)", and "We expose after bloom." Against fireflies, weight the first downsample by `1 / (1 + luma)` per 2x2 block ([slides page](https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/)).
- **Recipe.** A 13-tap downsample whose weights sum to 1, a 3x3 tent upsample added up the chain, 5 mips, and a final `mix(hdr, bloom, strength)` with strength 0.03 to 0.15 ([LearnOpenGL, physically based bloom](https://learnopengl.com/Guest-Articles/2022/Phys.-Based-Bloom)).
- **Order.** Exposure, bloom, tone map, then encode to sRGB. One master exposure constant.
- three.js's `UnrealBloomPass` needs tone mapping enabled on the renderer; `toneMappingExposure` defaults to 1 ([three.js docs](https://threejs.org/docs/pages/UnrealBloomPass.html)).

## Banding and dither

- An 8-bit gradient across 1920 px has bands about 8 px wide ([Simon Schreibt](https://simonschreibt.de/gat/colorbanding/)). Dark haze and glow show it first.
- Dither just before the 8-bit write, in the space being quantized (sRGB), with triangular or blue noise of about 1 LSB. Bart Wronski: "Whenever possible, avoid ordered Bayer!" ([blog](https://bartwronski.com/2016/10/30/dithering-part-three-real-world-2d-quantization-dithering/)). Christoph Peters: animated blue noise is "even less objectionable" ([Moments in Graphics](https://momentsingraphics.de/BlueNoise.html)). Playdead's INSIDE talk covers the same ground ([slides](https://github.com/playdeadgames/publications/raw/master/INSIDE/banding_in_games.pdf)).
- Seed the dither from `round(t * fps)` so a seek reproduces the same pixels. The video encoder can remove dither again; see verify-export.md.

## Not verified

- Whether Khronos's "no hue shift" (an RGB angle) holds perceptually; Bevy reports Abney shifting. Both are quoted above.
- The exact triangular noise range in the Playdead deck (it gives two different ranges).
- A John Lasseter line about colour intensifying with emotion (search summary only).
- Blender's AgX documentation and the full Jimenez slide deck were not read.
