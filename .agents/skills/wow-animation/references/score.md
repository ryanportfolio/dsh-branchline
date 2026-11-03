# Score and sound effects (only when the user asks for sound)

Load this only when the notes ask for sound, music or audio. Otherwise the piece is silent: no music, no effects, no `AudioContext`, no audio stream in the export.

motion-design's `references/sound.md` covers sync tolerance, beat maps, impact layering and loudness targets. This file covers how the sound is made so it does not sound cheap or generated. Paste its rules into every brief that writes or reviews audio.

## Source

- Default: everything synthesized in code with Web Audio from the same timeline as the picture. No stock samples, no stock trailer kits, no AI music generator output.
- The user supplies a track: use it, and prepare it per motion-design's `sound.md`. Sections below about synthesis then apply only to added effects.
- Name one reference per piece (a specific cue by Vangelis, Jon Hopkins, or Kyle Dixon and Michael Stein's Stranger Things score, or the user's pick) and record it in `BRIEF.md`. Loudness and spectral balance get measured against it.

## Why it sounds cheap, and what to do instead

| Why it sounds cheap | Do instead |
|---|---|
| Imitating real instruments: fake piano, strings or brass is the biggest giveaway | Stay openly synthetic, in the style of Vangelis, Jon Hopkins or the Stranger Things score |
| Timbre never moves: a raw oscillator held flat | Filter envelopes, slow LFOs, detuned unison voices, gentle analog-style pitch drift |
| Perfect timing, equal velocities, perfect tuning | Micro-timing, varied velocities, a few cents of slow drift per voice, all from a seeded RNG so every render is identical |
| Bare waveforms that go "beep" (chiptune feel) | Layered, low-passed sounds; bells from FM with a decaying index, so the attack is bright and the tail soft |
| Dry, or a thin algorithmic reverb | Convolution reverb from a generated impulse: pre-delay, stereo decorrelation, darker tail |
| Narrow or mono image | Detuned voices spread wide, decorrelated reverb; bass kept mono |
| No mix: everything equally loud, clipping, no glue | High-pass everything except the bass, duck the pads under hits, bus compression, soft tape saturation, a limiter at about -14 LUFS and -1 dBTP |
| Harmony like a MIDI demo (I-IV-V), or random generative noodling | Chords composed per beat: open voicings, sus chords, a pedal bass, slow chord changes |
| Clicks and hard edges | Exponential envelopes, attack of at least 5 ms, no linear ramps |
| Too clean, no air | Very quiet filtered noise and tape hiss underneath, with slight wow and flutter |
| Sound effects that feel like UI beeps | Every effect tuned to the key, with soft transients |
| Sound a few frames off the picture | Everything rendered from the same timeline, checked by measuring onsets against the beat times |
| Thin low end | More bass: a sine sub plus a saturated layer an octave up so the bass still reads on laptop and phone speakers; bass and sub mono below about 120 Hz; carve 200 to 400 Hz out of pads, not out of the bass; sidechain the bass under the kick or impact |
| Trailer clichés: a braam on every hit, a riser into every section, a whoosh on every transition | At most one riser per section; let silence or a stopdown set up the biggest hit |
| Every visual event gets a sound | Sound the events that carry the story; save the biggest hit for one or two moments |
| Music that could score any product | One short motif built for this subject, stated early, returning resolved on the end slate |

## Arc

Sparse opening, build through the explanation, a stopdown or drop to near silence just before the hook, full weight on the hook, resolve on the end slate and let the reverb tail decay into silence instead of cutting. Choose tempo and key from the beat sheet so cuts land on bar lines.

## Engine

- Render the full mix once with `OfflineAudioContext` from the timeline (notes, effects, automation, seeded humanization). Live playback plays that buffer from offset `t`; `seek(t)` restarts the source at `t`. Export muxes the same buffer. One render feeds preview, critics and export, so they cannot drift apart.
- Re-render after any timeline edit. Never analyse audio live.

## Checks

No agent can hear the result. Audio verdicts come from measurements, spectrograms and the user's ears.

Scripted (run on the rendered buffer or the export):

- Integrated loudness -14 LUFS plus or minus 1, true peak at or below -1 dBTP (`ffmpeg -af ebur128=peak=true`).
- Every audio onset lands on its visual hit or within one frame after it (the picture leads, per motion-design).
- No clicks: no sample-to-sample jump above a set threshold outside scheduled onsets.
- Low end mono: left/right correlation below 120 Hz stays near 1. Full-band correlation stays positive (wide, still mono-safe).
- Timbre moves: the spectral centroid of each sustained pad changes over its length.
- Bass share: energy below 150 Hz at or above the named reference, measured the same way.

Judged:

- A critic reads a spectrogram per section plus the measurements: layering, air, bass weight, the arc, headroom before the big hits.
- The user listens to one full playback before export. That listen is the gate for anything the numbers cannot show.
