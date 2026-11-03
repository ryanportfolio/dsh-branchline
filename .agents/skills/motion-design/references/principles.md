# Principles and who teaches them

Compiled 2026-09-28 from primary sources wherever they could be found; the game trailer, impact, perception and UI token sections were added 2026-09-29. A claim with no primary source is marked as such.

## Timing and spacing

- **Timing and spacing are separate controls.** The same 24 frames give different motion when the spacing changes. Put slow moves next to fast ones on purpose: "THIS SLOW AGAINST the FAST." (Richard Williams, *The Animator's Survival Kit*, [text](https://archive.org/stream/TheAnimatorsSurvivalKitRichardWilliams/The%20Animator's%20Survival%20Kit%20-%20Richard%20Williams_djvu.txt))
- **Duration follows distance and area.** Small moves are short and moves across the screen are long. Exits run shorter than entrances. (Material Design, [M1](https://m1.material.io/motion/duration-easing.html), [M3](https://m3.material.io/styles/motion/easing-and-duration))
- **Anticipation and overshoot are spacing tools.** Dip before a move, overshoot and settle after it. Animation Bootcamp also teaches arcs, follow-through, blocking, pacing and eye trace. (Joey Korenman, School of Motion, [course](https://schoolofmotion.com/courses/animation-bootcamp))

## Easing

- **Pick the easing by what the element is doing.** Entering or leaving: ease-out. Already on screen and moving: ease-in-out. Never ease-in something that is arriving. Never scale up from 0; start at 0.9 or more. (Emil Kowalski, [7 practical tips](https://emilkowal.ski/ui/7-practical-animation-tips))
- **Shape curves by hand.** Ben Marriott found that plugin easing put a ceiling on his work, so he used only the graph editor for two to three months. ([Envato](https://elements.envato.com/learn/ben-marriott))
- **Springs feel physical.** Josh Comeau's [intro to spring physics](https://www.joshwcomeau.com/animation/a-friendly-introduction-to-spring-physics/). With Motion's `visualDuration` the spring reaches its target at that time and the bounce plays afterwards, which keeps springs in sync with timed tweens (Matt Perry, [Motion docs](https://motion.dev/docs/spring)).
- **Decide what the elements are.** Are they sliding on a table, or hanging from springs? Breaking the physics on purpose can be funny. (Dave Pagurek, [Butter](https://www.butter.video/blog/animation-principles-for-motion-graphics))

## Stagger, overlap and secondary motion

- **Stagger stops a group reading as one fused block.** Start at a frame or two per item, or use random per-item offsets from a fixed seed. Stagger words by about 4 frames. Per-letter stagger (about 0.75 frame) suits typing effects; with larger motion it gets "a little powerpointy". (Butter)
- **Follow-through and overlapping action.** Children trail their parent, and things don't all stop at once. This is Rauno Freiberg's favorite Disney principle ([uxtools](https://www.uxtools.co/blog/your-ui-needs-more-walt-disney)). The 100 to 200 ms figure in that article is Tommy Geoco's example, not Rauno's.
- **Secondary motion keeps held elements alive.** Start it while the entrance is still running, not after, and add the two together. Sway with a per-item phase shift, for example `cos(t + i * 1.5)`. (Butter)
- **Stagger signals brand personality.** Material Design says expressive brands use it and utility brands mostly don't ([M2](https://m2.material.io/design/motion/customization.html)). For UI lists, the only numeric stagger any design system gives is Material 1's: "Begin each item's staggered entrance no more than 20ms apart", and "Do not wait for each item to fully animate before introducing the next item" ([M1](https://m1.material.io/motion/choreography.html)). No design system specifies 40 to 80 ms; that figure came from a third-party skill file. Kowalski's skills give 30 to 80 ms between items as his own practice ([ui-components.md](ui-components.md)). Film word stagger (60 to 80 ms) is a separate, slower timing for reading.

## Continuity and hierarchy

- **Transform instead of cutting.** Parenting and transformation keep one object's identity across states, for example a button that becomes a progress ring and then a check. Offset and delay show hierarchy. (Issara Willenskomer, [UX in Motion manifesto](https://medium.com/ux-in-motion/creating-usability-with-motion-the-ux-in-motion-manifesto-a87a4584ddc))
- **Morph one shape into the next.** Manim does this, and the picture and the voice say the same thing at the same time. (Grant Sanderson, [3Blue1Brown](https://www.3blue1brown.com/about/))

## Explanation

- **Every movement needs a purpose that supports the words.** Show the concrete before the abstract, never open with definitions, and don't leave text "unnecessarily moving around". (Sanderson)
- **Open with a question, then chain ideas with "but" and "therefore".** Give a new counter-intuitive idea regularly. (Nicky Case, [How I make explorables](https://blog.ncase.me/how-i-make-an-explorable-explanation/)) For a 60 to 90 s piece, this skill scales that to one new idea every 10 to 15 s. That figure is our scaling, not Case's.
- **Move up and down the ladder of abstraction.** Show one concrete run, then the general pattern, then return to the concrete. Bret Victor's explorable explanations ([summary](https://en.wikipedia.org/wiki/Explorable_explanation)); Case credits Victor for about 90% of his own approach.

## Perception and learning

- **Apprehension and congruence.** Animation "must be slow and clear enough for observers to perceive movements, changes, and their timing", should "lean toward the schematic and away from the realistic", and can annotate with "arrows or highlighting". Many apparent wins for animation were confounded with extra information (Tversky, Morrison and Betrancourt, [2002](https://hci.stanford.edu/courses/cs448b/papers/Tversky_AnimationFacilitate_IJHCS02.pdf)).
- **Animation's edge is small.** Over 140 comparisons, animation beat static graphics by Hedges g = 0.226 ([Berney and Betrancourt, 2016](https://archive-ouverte.unige.ch/unige:92234)). Animate where change over time is the content.
- **Mayer's principles, median effect sizes** ([chapter](https://edtechuvic.ca/wp-content/uploads/sites/11/2022/09/principles-for-reducing-extraneous-processing-in-multimedia-learning-coherence-signaling-redundancy-spatial-contiguity-and-temporal-contiguity-principles.pdf)):
  - Temporal contiguity 1.22 (9 of 9 tests): words land with the picture they name.
  - Coherence 0.86 (23 of 23): cut decorative material, which hurts most in system-paced pieces such as films.
  - Redundancy 0.86 (16 of 16): don't print narration verbatim; short keywords beside the named part are exempt.
  - Signaling 0.41 (24 of 28), "when it is used sparingly rather than excessively".
  - Segmenting 0.79 (10 of 10) ([chapter](https://edtechuvic.ca/wp-content/uploads/sites/11/2022/09/principles-for-managing-essential-processing-in-multimedia-learning-segmenting-pre-training-and-modality-principles.pdf)).
- **Onset draws the eye.** "Motion per se does not automatically attract attention... the onset of motion does" ([Abrams and Christ, 2003](https://pubmed.ncbi.nlm.nih.gov/12930472/)). Start motion on the thing to read at its cue; don't launch unrelated motion during a caption.
- **Tracking limit.** Observers tracked up to 5 of 10 identical moving objects ([Pylyshyn and Storm, 1988](https://www.ncbi.nlm.nih.gov/pubmed/3153671)); up to 8 at slow speeds and 1 at high speeds ([Alvarez and Franconeri, 2007](https://dash.harvard.edu/handle/1/41056876)). Ask viewers to follow about 4 independent movers, fewer when fast. Swarm members that share one velocity group as one actor (common fate).
- **Cause and effect.** Michotte's launching effect "is destroyed by adding a temporal gap" ([Scholl and Tremoulet, 2000](https://perception.yale.edu/papers/00-Scholl-Tremoulet-TICS.pdf)); a 2025 replication found the delay window softer than Michotte reported ([Royal Society Open Science](https://pmc.ncbi.nlm.nih.gov/articles/PMC12434928/)). Keep effect right after cause, or bridge the gap with a visible carrier (the heal flying to the player).
- **Instant.** "0.1 second is about the limit for having the user feel that the system is reacting instantaneously" ([Nielsen](https://www.nngroup.com/articles/response-times-3-important-limits/)).

## UI motion tokens

From each system's own token source, read 2026-09-29.

| System | Durations | Easing and springs |
|---|---|---|
| Material 3 ([tokens.xml](https://raw.githubusercontent.com/material-components/material-components-android/master/lib/java/com/google/android/material/motion/res/values/tokens.xml)) | short 50 to 200, medium 250 to 400, long 450 to 600, extra long 700 to 1000 ms | standard `(0.2, 0, 0, 1)`, emphasized decelerate `(0.1, 0.7, 0.1, 1)`, emphasized accelerate `(0.3, 0, 0.8, 0.2)`; springs (damping, stiffness): expressive spatial default 0.8/380, standard 0.9/700; effects springs (opacity, colour) use damping 1, no overshoot |
| Apple ([WWDC23](https://developer.apple.com/videos/play/wwdc2023/10158/)) | spring `duration` is perceptual | bounce 0 by default; be "cautious about using values higher than around 0.4" |
| Fluent 2 ([tokens](https://github.com/microsoft/fluentui/tree/master/packages/tokens/src/global)) | 50, 100, 150, 200, 250, 300, 400, 500 ms | decelerateMax `(0.1, 0.9, 0.2, 1)`, accelerateMax `(0.9, 0.1, 1, 0.2)` |
| Carbon ([guidelines](https://v10.carbondesignsystem.com/guidelines/motion/overview/)) | 70, 110, 150, 240, 400, 700 ms; micro-interactions 90 to 120 ms | productive standard `(0.2, 0, 0.38, 0.9)`, expressive standard `(0.4, 0.14, 0.3, 1)`, expressive only for "occasional, important moments" |

Apple's HIG: "Don't add motion for the sake of adding motion", make it optional and cancelable, and avoid motion on frequent interactions ([HIG](https://developer.apple.com/design/human-interface-guidelines/motion)). Never bounce opacity or colour.

More topics, each with sources and its own unverified list: [accessibility.md](accessibility.md), [camera-cut.md](camera-cut.md), [impact-fx.md](impact-fx.md), [color-light.md](color-light.md), [sound.md](sound.md).

## Process

- **Decide the feeling before the technique.** Be "feeling givers rather than storytellers". (Jay Grandin, Giant Ant, [SoM podcast](https://schoolofmotion.com/blog/jay-grandin-podcast-podcast)) Buck says story comes first and it keeps no house style ([McKay podcast](https://www.allanmckay.com/365/)).
- **Block first, polish later.** Work from an animatic, block the poses, animate the key moments, then trim at prerender. This was basement.studio's pipeline for the Vercel Ship 2025 opening film ([Behind the Ship](https://basement.studio/post/behind-the-ship)).
- **Lock the audio first, when there is audio.** At Kurzgesagt the narration take sets the animation timing ([kurzgesagt](https://kurzgesagt.org/what-we-do?visit=videos)). For a silent piece, the caption reading time plays that role.
- **Prototype in code and hold back.** "With software, the material is code." (Rauno Freiberg, [interview](https://spaces.is/loversmagazine/interviews/rauno-freiberg)) Too much animation "loses impact". Animate transform and opacity, and honor `prefers-reduced-motion`. (Kowalski, [Great animations](https://emilkowal.ski/ui/great-animations))
- **Let viewers pause.** Readers complained about looping animation they could not stop on Rauno's essay ([HN](https://news.ycombinator.com/item?id=36669249)).

## Game trailers

- **Length.** Lieu aims for 90 s for game trailers and closes with "make your game trailers 90 seconds or fewer". (Derek Lieu, [Ideal game trailer length](https://www.derek-lieu.com/blog/2018/12/20/ideal-game-trailer-length-and-labeling))
- **Hook early.** Establish the genre in 1 or 2 shots, then jump to the hook: "Ideally it's within the first 10-15 seconds", within the first third and no later than the first half. (Lieu, [How to hook the audience](https://www.derek-lieu.com/blog/2022/10/24/how-to-hook-the-audience-and-how-quickly-to-do-it))
- **Logos.** "Never start the trailer with logos." He opens on a gameplay cold open, then shows logos for a couple of seconds, or puts them at the end for a lesser-known studio; famous logos are the exception. (Lieu, [No logo](https://www.derek-lieu.com/blog/2019/1/19/no-logo))
- **Stopdowns.** A stopdown is "when the momentum of the trailer stops, and a new section starts"; think of it as building tension and releasing it. His *Steve Jobs* example has four major stopdowns in about 2 minutes, and his *Half-Life: Alyx* trailer has exactly four. (Lieu, [Tension and trailer stopdowns](https://www.derek-lieu.com/blog/2020/1/10/tension-and-trailer-stopdowns)) The "about 3 builds" for a 90 s cut in story.md is this skill's scaling, not Lieu's number.
- **Cut on the beat.** "More often than not, trailers cut to the beat of the music or match actions to the beat." (Lieu, [How to watch a trailer analytically](https://www.derek-lieu.com/blog/2017/9/17/how-to-watch-a-trailer-analytically))
- **Gameplay within 2 s.** "Cut to actual gameplay within the first two seconds of your trailer. Do not show your studio logo (you aren't Nintendo)." He based it on watching Steam shoppers scrub a trailer until they reached gameplay. (Chris Zukowski, [60 mistakes ebook](https://howtomarketagame.com/wp-content/uploads/2023/05/Zukowski_60MistakesEbookV1.pdf), mistake 7)

## Impact

- **Hitstop, and shake the victim.** Sakurai's eight hitstop techniques in Smash Bros. Ultimate: shake the character being hit more than anything else, keep the hitbox still, shake horizontally on the ground and vertically in the air, taper the shake, tune the stop length, interpolate into the damage pose, keep the attacker moving slightly, and scale the shake with camera distance. (Masahiro Sakurai, [Eight hit stop techniques](https://www.youtube.com/watch?v=tycbMSjDDLg); list as summarized by [Nintendo Wire](https://nintendowire.com/news/2022/12/12/this-week-in-sakurai-12-5-12-11-fine-tuning-hit-stop-and-cheating-the-system/)) The earlier [Stop for big moments!](https://www.youtube.com/watch?v=OdVkEOzdCPw) covers the stop itself.
- **Stack small feedback tricks.** Nijman adds about 30 tricks, one at a time, to a plain platformer shooter, among them impact effects where bullets collide, a hit animation on the enemy, enemy knockback, screen shake, player knockback and "sleep", a momentary pause on hit. (Jan Willem Nijman, Vlambeer, [The art of screenshake](https://www.youtube.com/watch?v=AJdEqssNZ-U), INDIGO 2013; trick names from a viewer's timestamp list on [this page](https://theengineeringofconsciousexperience.com/jan-willem-nijman-vlambeer-the-art-of-screenshake/)) A playable recreation toggles each trick ([DK Liao](https://dkliao.itch.io/the-art-of-screenshake-recreation)).
- **Impact frames and cubic debris.** Action animation strongly influenced by Yoshimichi Kameda and Yutaka Nakamura has seen "an incredible boom in impact frames, a technique that had all but disappeared since the early 90's"; modern impact frames "use few colors, and are themselves animated rather than just a few still frames". Nakamura breaks things into cubic debris, "plain, basic shapes". ([Animétudes, The Kanada style now](https://animetudes.com/2021/07/09/the-kanada-style-now/)) This is critical analysis of his work; no first-hand teaching by Nakamura was found.
- **Characters on twos, camera on ones.** *Into the Spider-Verse* was animated primarily on twos, each image held for two frames, with no motion blur, and the team "worked hard to get the animation on twos to work both with simulations and complex camera moves" ([Sony Pictures Imageworks](https://www.imageworks.com/our-craft/feature-animation/movies/spider-man-spider-verse), [AWN](https://www.awn.com/animationworld/creating-stylized-universe-sonys-spider-man-spider-verse)). Head of character animation Josh Beveridge described the result as "cameras nice and smooth [on] ones and [animation] on twos" ([Major Spoilers, 2019-02-25](https://majorspoilers.com/2019/02/25/spider-man-into-the-spider-verse-joshua-beveridge-interview/); the page now redirects, so the quote was read from its search-indexed copy).
- **Hold frames for weight, few fast smears.** "Hold a pose for a few extra frames to add impact", subtly and only for exaggerated actions; hold the follow-through longer to give a weapon weight. "Usually a single smear frame can get the job done", and "the smear frames should always be few and fast." (Slynyrd, [Pixelblog 9: melee attacks](https://www.slynyrd.com/blog/2018/9/8/pixelblog-9-melee-attacks)) His later sword timing is 100, 50, 50, 50, 100, 50 ms per frame, holding the long frames on wind-up and follow-through ([Pixelblog 56](https://www.slynyrd.com/blog/2025/5/23/pixelblog-56-top-down-character-attack-animation)).
- **Hue-shifted colour ramps.** He builds ramps of 9 swatches with about 20 degrees of positive hue shift between swatches, so colours warm as they brighten; brightness rises steadily and saturation peaks in the middle. (Slynyrd, [Pixelblog 1: colour palettes](https://www.slynyrd.com/blog/2018/1/10/pixelblog-1-color-palettes))

## Craft numbers worth keeping

- **Dark scenes.** Never pure #000. Keep near-black with slightly cool shadows so the accent is the only warm light, and keep accent highlights below clipping. Drive bloom with HDR values above 1, not with bloom strength. With a true HDR target, skip the threshold and mix bloom in at about 0.04 (Jorge Jimenez); a threshold near 1 suits an LDR or selective pipeline ([three.js selective bloom](https://threejs.org/examples/webgl_postprocessing_unreal_bloom_selective.html)). Details in [color-light.md](color-light.md).
- **Caption rates.** About 17 characters per second is comfortable and 20 is Netflix's English maximum, with at most 42 characters per line and two lines ([summary](https://www.closedcaptioncreator.com/blog/articles/subtitle-reading-speed.html)).
- **Vertical safe zones.** Meta's own Reels guide keeps "roughly 14% of the top, 35% of the bottom, and 6% on each side" clear of text and logos, about 269 px, 672 px and 65 px on a 1080x1920 frame ([Meta Ads Guide](https://www.facebook.com/business/ads-guide/update/image/instagram-reels)). TikTok and YouTube publish templates but no pixel margins, so design to the union and preview in the apps. Third-party figures (about 220 px top, 430 to 480 px bottom, 120 to 150 px right) come from [Ignite](https://www.ignitesocialmedia.com/content-creation/what-are-the-safe-zones-for-tiktoks-and-instagram-reels/).
- **Broadcast safe area.** EBU R 95: "The action safe area is 3.5% and the graphics safe area is 5%" per edge ([EBU](https://tech.ebu.ch/publications/r095)). Rest static text inside the central 90%; moving text may cross the margin but should settle inside it.
- **Muted-viewing figures are old.** The common "85% watch muted" traces to a 2016 Digiday report about Facebook, and "47% of ad value in the first 3 s" is also 2016-era Meta data. Design sound-off first, but don't quote those numbers as current.

## Reference works

- Bartosz Ciechanowski, [Mechanical Watch](https://ciechanow.ski/mechanical-watch/): builds a mechanism one part at a time in hand-written WebGL.
- Nicky Case, [The Evolution of Trust](https://ncase.me/trust/): a "but / therefore" chain that starts from a concrete game.
- 3Blue1Brown videos: objects keep their identity through every transform.
- basement.studio's Vercel Ship 2025 opening film: one visual idea (liquid) carried through the film, the WebGL hero and the site.
- Anthropic's "Keep thinking" (Mother, 2025, 90 s): the structure is one reversal, with the music turning at the pivot.

## Not verified

- No first-hand analysis was found of the 2025 to 2026 launch films from Linear, Stripe, Raycast or Arc. The only write-ups came from video agencies.
- No first-hand teaching was found for Active Theory, Oddfellows, Tendril, ManvsMachine or animography. Found since:
  - Lusion builds every project from scratch because "the best ideas usually fall apart the moment you force them into a template" ([Codrops, 2026-04-13](https://tympanus.net/codrops/2026/04/13/lusion-where-digital-craft-meets-ambitious-experimentation/)).
  - abeto's Igloo Inc (Awwwards Site and Developer Site of the Year 2024) was built from grey-box previs animations before any shading, with particles that re-form into different shapes ([case study](https://www.awwwards.com/igloo-inc-case-study.html)). abeto's Messenger won Developer Site of the Year 2025.
  - Awwwards Site of the Year 2025 went to OFF+BRAND's Lando Norris site ([winners](https://www.awwwards.com/annual-awards/winners)); reviewers noted performance was never traded for spectacle.
- Awwwards lists two sites as 2025 Site of the Year; no 2026 winner had been announced by 2026-09-28.
- **Inverted (negative) impact frames.** No source found (2026-09-29) teaches a colour-inverted frame on the hit or names who does it. Treat it as common anime practice to test by eye, not a sourced rule.
- **M3 easing values.** Material's Motion.md lists emphasized decelerate as `(0.05, 0.7, 0.1, 1)` and accelerate as `(0.3, 0, 0.8, 0.15)`, which differ from the generated `tokens.xml` quoted above; treat `tokens.xml` as canonical. Numeric values for SwiftUI's `.smooth`, `.snappy` and `.bouncy` presets were not found.
- **Average trailer watch time.** Widely repeated figures (23 s average, 70% watch muted) have no traceable source. Zukowski's 2019 observation of 7 Steam shoppers, who mostly clicked past the trailer, left the sound off, and scrubbed to gameplay, is the only first-hand account found ([Game Developer](https://www.gamedeveloper.com/business/how-steam-users-see-your-game)).
- **Nijman's impact flash and sleep length.** The talk shows a "hit animation" on enemies; no text source confirms a white flash by name. Accounts of the sleep length disagree (20 ms from "sleep(20)", or about 0.2 s). Check the video before quoting either.
