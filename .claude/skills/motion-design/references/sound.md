# Sound and music sync

Compiled 2026-09-29. Most feeds autoplay muted, so the picture must teach without sound (story.md). Sound then adds weight and timing. Steamworks says a customer "may be watching your trailer without any audio" ([Steamworks](https://partner.steamgames.com/doc/store/trailer)).

## Prepare the music first

- **Map the cue before cutting.** Derek Lieu marks a track in colours: purple for "really big beats, big changes in the music, and sometimes a stopdown", yellow for a "rise ... usually before a really big beat or hit", cyan for a "fill" ([blog](https://www.derek-lieu.com/blog/2017/6/20/how-to-prepare-music-for-editing)). The markers become the beat sheet's Hit column.
- **Stopdowns land on a downbeat.** "Typically on a downbeat the music will simply cut out, or reverb out, and a sound effect will enhance or mask the moment." Cuts to black pair with "hits, bass drops, and cavernous hits", and a sound-effect rise connects two moments ([blog](https://www.derek-lieu.com/blog/2018/2/24/good-transitions-make-great-trailers)).
- **Reverb out.** To end a cue on a note: take the note's reverb tail from a clean spot ("you don't want any sounds coming in after"), cut in a second or two before the note, crossfade "as late as possible", and level-match "so you don't have a volume spike" ([blog](https://www.derek-lieu.com/blog/2016/10/03/how-to-make-a-sound-reverb-out)).
- **Cheat to the beat, but not at the cost of clarity.** "Occasionally I'll 'cheat' some audio a few frames for the sake of having it land closer to the beat", and "style should never be used at the expense of clarity" ([blog](https://www.derek-lieu.com/blog/2019/11/26/trailer-music-video-style-editing)). Gunshots and effects often land "in the spaces in between" beats ([blog](https://www.derek-lieu.com/blog/2021/2/1/sound-design-driven-game-trailers)).

## Impacts

- Layer an impact from separate parts, each EQ'd so they do not clash: Ableton's example stacks a distorted kick, a high percussive element, a processed cymbal, a sub and an atmosphere, with a tail of "a huge reverb that decreases in volume over time". A riser is "often followed by a hit, or even a brief moment of silence" ([Ableton](https://www.ableton.com/en/blog/learn-how-to-make-high-impact-sounds-for-movies-and-trailers/)).
- "If everything's loud, nothing's loud" ([Lieu, quoting a sound mixer](https://www.derek-lieu.com/blog/2022/5/23/sound-mixers-the-unsung-heroes-of-trailer-editing)). Leave space before the big hits.

## Sync tolerance

- ITU-R BT.1359: "detectability thresholds are about +45 ms to -125 ms" and "acceptability thresholds are about +90 ms to -185 ms", where positive means sound arrives before picture ([ITU](https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.1359-1-199811-I!!MSW-E.doc)).
- Viewers catch sound that arrives early far sooner than sound that arrives late. For a hammer blow the unnoticed window was about 75 ms audio lead to 188 ms audio lag ([Frontiers in Psychology, 2015](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2015.00736/full)).
- Rule (inference from both): put the visual hit on the audio hit or up to one frame before it, never after. Round hit frames down.

## Beat maps for a `frame(t)` engine

- Analyse the track once, offline, into a `beats.json` of times in seconds (librosa's `beat_track` and `onset_detect` with `units='time'`, [librosa](https://librosa.org/doc/latest/generated/librosa.frames_to_time.html); Essentia.js runs in the browser, [TISMIR](https://transactions.ismir.net/articles/10.5334/tismir.111)). Drive events from that file. A live `AnalyserNode` breaks determinism and seeking.
- Convert each beat to a frame from seconds (`Math.floor(beat * fps)`); never accumulate `60 / BPM` frames, since 128 BPM at 30 fps is 14.0625 frames per beat and the error grows (inference).
- For live preview, schedule audio on `AudioContext.currentTime`, which aligns to the sample; JS timers "can easily be skewed by tens of milliseconds or more" ([web.dev](https://web.dev/articles/audio-scheduling)). For export, `OfflineAudioContext` renders "as fast as it can" into a buffer ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext)).

## Loudness

- Broadcast: EBU R 128 targets -23 LUFS with a -1 dBTP true-peak ceiling ([EBU](https://tech.ebu.ch/publications/r128); numbers via [Wikipedia](https://en.wikipedia.org/wiki/EBU_R_128)).
- Web: YouTube turns loud uploads down to about -14 LUFS and does not turn quiet ones up, per a third-party measurement, not YouTube's docs ([Meterplugs, 2019](https://www.meterplugs.com/blog/2019/09/18/youtube-changes-loudness-reference-to-14-lufs.html)). Spotify normalizes to -14 and asks for true peak below -1 dB ([Spotify](https://support.spotify.com/us/artists/article/loudness-normalization/)).
- Console trailer masters (Xbox, per Lieu's spec list): -16 LUFS, -2 dBTP ([blog](https://www.derek-lieu.com/blog/2017/10/13/video-game-trailer-specifications-list)).
- Default for a web or Steam trailer: about -14 LUFS integrated, true peak at or below -1 dBTP. Label -14 as convention.

## Not verified

- An ATSC tolerance of plus or minus 15 ms (search summary only).
- An official YouTube, TikTok or Instagram loudness target.
- Whether YouTube's Stable Volume works client-side or server-side.
- A "-3 dBTP for lossy delivery" recommendation attributed to EBU (forum only).
