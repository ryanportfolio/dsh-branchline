# Cutting and the virtual camera

Compiled 2026-09-29. Editing rules for trailers and promos, and camera rules for engine-rendered shots.

## Cutting

- **Rule of Six.** Walter Murch ranks what a cut must serve: emotion 51%, story 23%, rhythm 10%, eye-trace 7%, the 2D plane (screen direction) 5%, 3D space 4%, numbers he calls "slightly tongue-in-cheek, but not completely" ([book excerpt, Berkeley iSchool](https://blogs.ischool.berkeley.edu/i290-viznarr-s12/the-rule-of-six-walter-murch/)). When rules conflict, "let go from the bottom of the list up" ([ProVideo Coalition, 2020](https://www.provideocoalition.com/aotc-murch-books/)).
- **Eye trace.** Put the subject of the incoming shot where the viewer's eye already is. A match-action cut that shows "the same action at the same screen location as pre-cut" satisfies viewers; with nothing to look at they "default back to the screen centre" (Tim J. Smith, [Attentional Theory of Cinematic Continuity](https://ualresearchonline.arts.ac.uk/id/eprint/21187/2/6679.pdf)). Fixations last about 200 to 500 ms (same paper, citing Rayner 1998).
- **Cut on action.** Viewers missed 32.4% of match-action cuts, 25.1% of other within-scene cuts and 9.4% of cuts between scenes; a missed cut is a smooth one ([Smith and Henderson 2008](https://bop.unibe.ch/JEMR/article/view/2264)). Schedule the cut on the frame where the action starts, with the motion continuing in the same screen region. To make a cut felt (a chapter break), break the action match.
- **Graphic matches** align "compositional features from A to B" and "snap up the pace", but scene changes still "need to be clear fairly quickly" (David Bordwell, [blog](https://www.davidbordwell.net/blog/2020/04/12/who-will-match-the-watchmen/)). Use them at section transitions, sparingly.
- **30-degree rule.** Two consecutive shots of the same subject need at least 30 degrees of camera change, or the cut reads as a jump cut ([Wikipedia](https://en.wikipedia.org/wiki/30-degree_rule)). Otherwise morph or hold.
- **Screen direction.** A subject leaving frame-left enters the next shot from frame-right. Cross the axis only on purpose.

## Shot length

- "There is no average shot length that makes your trailer objectively better or worse"; "Don't cut fast for the sake of cutting fast." Measured average shot lengths: Baba Is You 4.25 s, Papers, Please 2.6 s, Modern Warfare II 1.3 s; "game trailers do have far fewer cuts than movie trailers" (Derek Lieu, [blog](https://www.derek-lieu.com/blog/2023/4/23/more-trailer-editing-is-not-better-trailer-editing)).
- 99 short cinematic social ads averaged 17.9 s, 15.2 shots and 1.2 s per shot, against about 4 s for modern films; 52.2% used a cut on action ([Law, Li and Narechania, arXiv 2608.24329](https://arxiv.org/html/2608.24329v1)).
- Feature films fell from 8 to 11 s average shot length before 1960 to 4 to 6 s (Bordwell, [Intensified continuity revisited](https://www.davidbordwell.net/blog/2007/05/27/intensified-continuity-revisited/)).
- **Pacing curve.** Shots are longest in the setup, "fall precipitously during the first part of the climax", then "rise smartly during the epilog" (James Cutting, [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC5133278/)). Lieu: "If a trailer feels high energy all the time, then none of it will feel high energy" ([blog](https://www.derek-lieu.com/blog/2017/9/10/the-matrix-is-a-trailer-editors-dream)).
- Pick the length by what the viewer must read. A shot explaining a system needs longer than a montage beat; see the stranger test in story.md.

## Lens

- A wide lens makes motion toward or away from camera "very fast and dramatic"; a long lens makes subjects "move and move and move and never seem to get anywhere". The effect applies only to depth motion, not sideways motion ([Videomaker](https://www.videomaker.com/article/10370-lenses-the-long-and-short/)).
- Wide lenses hide camera shake and long lenses amplify it: "For telephoto lenses, use smaller amplitude values because the narrower FOV amplifies the effect" ([Cinemachine docs](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineNoiseProfiles.html)).
- A push-in only reads when layers sit at different depths; with none, a dolly and a zoom "look almost identical" ([flashboards](https://flashboards.yaroflasher.com/learn/camera-movement/dolly-shot/), secondary).
- Scale: "The bigger the object, the slower it should move"; fast motion "reads as miniature" ([digikorevfx](https://digikorevfx.com/the-psychology-of-scale-why-big-objects-fail-on-screen/)).

## Moves

- Push in isolates, pull back reveals context, a whip pan "blurs into indistinct streaks" and works as a transition ([Wikipedia](https://en.wikipedia.org/wiki/Whip_pan)). A dolly zoom keeps the subject the same size while the background changes ([Wikipedia](https://en.wikipedia.org/wiki/Dolly_zoom)).
- Give each shot its own camera and cut or blend between cameras. Epic does "not recommend constructing full-length cinematic sequences using multiple cameras and cuts" and builds them from shots that each hold one camera and one camera cut; a blended cut interpolates the transform plus camera properties such as focal length and depth of field ([Unreal docs](https://dev.epicgames.com/documentation/en-us/unreal-engine/cinematic-camera-cut-track-in-unreal-engine)).

## Damping and follow

- Camera rules from Ryan Juckett: "Avoid discontinuities in motion", "Never let the player outrun the camera", "Move exactly the same with respect to time regardless of frame rate". A critically damped spring "will reach equilibrium as fast as possible without oscillating" ([blog](https://www.ryanjuckett.com/damped-springs/)).
- Per-frame lerp weights at 60 fps: "0.01 = nice and slow", "0.1 = reasonably fast", "0.5 = incredibly fast" (Squirrel Eiserloh, [GDC 2016 slides](https://archive.org/stream/GDC2016Eiserloh/GDC2016-Eiserloh_djvu.txt)). A per-frame lerp depends on frame rate; use `1 - exp(-k * dt)` (inference).
- A spring with a `halflife` parameter (the time for the gap to halve) lags a constant-speed target by `halflife / ln 2` ([theorangeduck.com](https://theorangeduck.com/page/spring-roll-call)).
- In a seekable `frame(t)` engine a stateful spring breaks seeking. Evaluate the follow in closed form from the last camera keyframe, as a pure function of `t` (inference; see web-engine.md).

## Handheld and shake

- Handheld noise uses three layers per axis: "low range is 0.1-0.5 Hz, the mid range 0.8-1.5, and the high 3-4", and operators "shake more rotationally than they do positionally" (Cinemachine docs, above).
- In 3D, rotational shake reads well and translational shake reads badly: "Translational: super lame!", "Rotational: nice!" In 2D, "Translational + Rotational = Awesome". Use smoothed noise such as Perlin, not random, because it "works with pause and slow-motion" and replays the same (Eiserloh slides, above). Shake amplitude recipe: impact-fx.md.

## Capturing gameplay for a trailer

- Freecam moves should be slow and eased: "In most cases we do NOT want the camera to move quickly"; "Gradual camera moves from 0 up to speed and then back to 0 is best!" A gamepad beats a mouse, which "picks up hand jitter"; record and replay moves (Lieu, [freecam post](https://www.derek-lieu.com/blog/2022/11/19/how-to-make-a-freecam-or-marketing-camera-for-game-trailers)).
- Capture directors recapture after build changes and use debug or custom cameras with depth-of-field control ([Aftermath interview with Jason White, Buddha Jones](https://aftermath.site/video-game-trailer-capture-director-maker/)).

## Not verified

- Walter Murch's percentages come from a book excerpt; the book itself was not read.
- J and L cut overlap lengths (6 to 12 frames, 0.5 to 1 s) come only from tutorial sites.
- No frame count was found for how long viewers need to find the subject after a cut.
- Lens ranges of 18 to 35 mm for speed and 50 to 85 mm for compression come from one secondary blog.
- Squirrel Eiserloh's own shake angles and decay rates are not in the slides.
