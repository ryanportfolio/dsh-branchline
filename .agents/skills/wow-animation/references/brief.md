# Kickoff brief

Generalized kickoff prompt, from past runs on a website film and a game trailer. Fill the brackets, append the notes from the argument, and paste into director and critic briefs. It also seeds `BRIEF.md` beside the animation source.

## Brief text

> Build a shareable JavaScript animation for [SUBJECT] ([URL or repo]). It should work as something people pass around to promote [SUBJECT]: what it is, why someone should use it (or play it), and how it is used. It must be a good source of information on its own, not only an ad.
>
> The look should match [SUBJECT]'s existing aesthetic, but you are not limited by it. Creativity and expression come first. If it impresses and wows you, it will probably resonate with others, so pick whatever visual direction does that best, knowing people only watch to the end if the animation is gorgeous.
>
> Ground it in the real thing. Read the actual code, product copy, assets and public pages. Restyle real assets into striking versions of themselves; do not invent stand-ins. Every string and number on screen comes from `facts.md` and matches the code.
>
> Success test: anyone who watches it once can say what [SUBJECT] is, why it is worth using, and wants to try it.
>
> [NOTES FROM THE ARGUMENT]

## Game variant (append when the subject is a game)

> Treat it as an animated game trailer. Show actual enemies and bosses in stylized form, built from the real sprites and the real boss and enemy code (attack patterns, telegraphs, phases), so they look like the coolest possible versions of themselves. Show the systems so a stranger reads risk, reward and power spikes. The viewer should come away knowing what the game is, thinking it is fun, and wanting to play.

## Product variant (website, app or feature)

> Show one real task done start to finish with the real UI and real strings, then the reason it matters. Features appear inside that task, never as a list.

## Contract seeds for wow-loop

Turn these into named checks in `bar.md`. Keep the IDs so repeated runs compare.

| ID | Check | Method |
|---|---|---|
| WA-STRANGER | After one natural playback, a critic with no context states what the subject is and why to use or play it; the answer matches `facts.md` | judged |
| WA-VALUE | A viewer learns at least 3 concrete facts (from `facts.md`) they could act on | judged |
| WA-LOOK | Palette, type and key shapes trace to the subject's real tokens or assets, and at least one scene goes clearly beyond them | judged |
| WA-GORGEOUS | Compared frame for frame with the reference named in `bar.md`, no scene reads as template or stock | judged |
| WA-FACTS | Every on-screen string and number has a `facts.md` row | scripted |
| WA-DISPLAY-PUNCT | No display text or heading ends in a period; product UI copy untouched | scripted |
| WA-169 | Stage renders 16:9 at the target size with no clipped text | scripted |
| WA-SEEK | `seek(t)` then render equals fresh load at `t` for sampled times | scripted |
| WA-RM (only when reduced motion was asked for) | Reduced-motion version exists and keeps every caption | scripted |
| WA-FLASH | Flash limits from motion-design hold across the full timeline | scripted |
| WA-SILENT (sound off, the default) | No `AudioContext` or media element with audio in the page (the export's audio stream is checked at export, after the loop) | scripted |
| WA-SOUND-* (sound on) | Every check in [score.md](score.md#checks), plus one full listen by the user before export | scripted and user |
| WA-GAME-CAST (games) | Named real enemies and bosses appear, each restyled from its sprite and showing its real tell | judged |
