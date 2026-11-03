# Impact, effects and character timing

Compiled 2026-09-29. Numbers for hits, shake, squash, effects and enemy attacks. principles.md covers the teachers (Sakurai, Nijman, Slynyrd, Spider-Verse); this file holds the recipes. Flash limits for impact frames are in accessibility.md.

## Shake

- **Trauma model.** Keep a trauma value in [0, 1]. Each hit adds to it ("+= 0.2 or 0.5"), it decays linearly, and shake amplitude is trauma squared or cubed, so small hits barely shake and big ones escalate. The slide's example, "Trauma .30, .60, .90 means 3%, 22%, 73% shake", is the cube. (Squirrel Eiserloh, [GDC 2016 slides](http://www.mathforgameprogrammers.com/gdc2016/GDC2016_Eiserloh_Squirrel_JuicingYourCameras.pdf))
- **Noise, not random.** Sample smoothed noise (Perlin) at time `t`, one seed per channel. It "automagically works with pause and slow-motion" and replays identically, which keeps a `frame(t)` engine seekable. Add the shake to a copy of the camera; keep the base camera untouched. (Same slides)
- **2D vs 3D.** 2D: translation plus rotation. 3D: rotation only ("Translational: super lame!"). Details and handheld noise bands in camera-cut.md.
- **Starting values.** Bevy's example, which follows the talk, uses 10 degrees max angle, 20 px max offset, trauma decay 0.5 per second and exponent 2 ([Bevy](https://bevy.org/examples/camera/2d-screen-shake/)). These are Bevy's numbers, not Eiserloh's.
- **Salt.** "Camera shake is like salt" (Eiserloh). Save the top level for one or two moments per piece.

## Freeze and hitstop

- Celeste freezes the whole game for 0.05 s (3 frames at 60 fps) on a dash, and 0.1 s on an explosion launch ([Celeste source, Player.cs](https://github.com/NoelFB/Celeste/blob/master/Source/Player/Player.cs)).
- Juicy Breakout's freeze runs through a time-scale multiplier between 0 and 1, so a freeze can be a slowdown, with duration up to 320 ms and fade-in and fade-out up to 160 ms each ([Freezer.as](https://github.com/grapefrukt/juicy-breakout)).
- "A Hit Stop that's too strong will kill the energy of the animation." (Jonathan Colin, Lead Gameplay Animator, Brain Jar Games, [AniMotionX](https://www.animotionx.com/en/post/interview-jonathan-colin-readability-silhouette-and-gameplay-animation-secrets))

## Squash and stretch

From shipped source code, usable as starting values:

- Celeste: jump sets scale 0.6 wide by 1.4 tall; landing and ducking 1.4 by 0.6; a vertical bounce 0.5 by 1.5. Scale returns to 1 linearly at 1.75 per second, about 0.23 s from 0.6 (Player.cs, above).
- Juicy Breakout: a moving ball stretches to `1 + 0.3 * speed` along travel and `1 - 0.2 * speed` across it, clamped to 0.85 to 1.35. A hit block pops to 1.2 in 0.05 s, then springs back over 0.6 s with elastic-out, the two axes offset by 0.05 s ([Ball.as, Block.as](https://github.com/grapefrukt/juicy-breakout)).
- Polish must not change the simulation. Steve Swink defines polish as "any effect that artificially enhances interaction without changing the underlying simulation" ([Game Feel, chapter 1](http://mycours.es/gamedesign2014/files/2014/10/Game-Feel-Steve-Swink-chapter-1.pdf)). Keep hitboxes and state independent of visual squash and shake.

## Too much juice

- Dominic Kao tested four versions of an action RPG with 3,018 players: "both None and Extreme amounts of juiciness lead to significantly decreased play time", and lower experience, motivation and performance, than Medium and High ([Entertainment Computing, 2020](https://doi.org/10.1016/j.entcom.2020.100359)).
- Folmer Kelly's "Don't Juice It or Lose It" (GDC Europe 2014) warns against effects that contradict the material: "dust clouds kicked up in places where there is no dust, bouncy tweens on hard rocks" ([GDC Vault](https://gdcvault.com/play/1020861/Don-t-Juice-It-or)).
- Scale feedback to the importance of the event.

## Effect timing

- **Explosion shape: fast out, slow away.** Joey Korenman at 12 fps: "Really fast, like 1, 2, 3 frames, and then it'll slow down", with a 1-frame flash, and a ring that "starts out as a thicker stroke and then it gets thinner and thinner" instead of fading ([School of Motion](https://schoolofmotion.com/blog/cartoon-explosion-after-effects)).
- **Ones for the blast, twos for the drift.** Hand-drawn smoke expands "quickly expanding on 1s" and dissipates "slowly on 2s"; all ones "can look too smooth and gooey". Layer starts offset within 4 or 5 frames ([Flash FX Animation blog, 2008](http://flashfx.blogspot.com/2008/12/2-smoke.html)).
- **Hit frame about 0.1 s, then staggered dissipation.** Kevin Leroy (VFX artist, Riot Games): the hit is "supposed to be very fast (my favorite time is 0.1s)". Kill the main glow first, then the flare, sparks and dust last. A fade curve of alpha 0, 0.5, 0 ([80.lv](https://80.lv/articles/constructing-vfx-worthy-of-league-of-legends)).
- **Layers.** Build a projectile as cast, projectile and hit, each layered from a hot core, trail, secondary bits, glow and a dark shadow (Leroy, above).
- **Tempo carries intent.** Healing and safe effects pulse below about 60 BPM; attacks move faster. An-Tim Nguyen credits the idea to a 2013 Diablo talk: "motion faster than a heartbeat tends to better communicate danger" ([GDC 2022 slides](https://media.gdcvault.com/GDC+2022/Speaker+Slides/VFXasagamedesignlanguage_Nguyen_An-Tim.pdf)). A heuristic.

## Effect readability

- Riot's rule: "the amount of attention an ability grabs should match its level of importance"; projectiles show direction "even without motion" through a blurred tail ([League of Legends dev blog](https://www.leagueoflegends.com/en-us/news/dev/clarity-in-league/)).
- Leave headroom for glow: on a 0.5 background a glow can add only 0.5; darken the local background toward 0.2 with a shadow and it gains 0.8 (Leroy, above). Avoid value and saturation extremes elsewhere ([VFX Apprentice summary of Riot's guide](https://www.vfxapprentice.com/blog/10-league-of-legends-vfx-design-tips), secondary).
- Colour must never be the only cue for status or faction; shape and silhouette do it "more reliably than color", and ambient effects such as muzzle flashes must not distract from threats (Nguyen, above).
- Bullet-hell practice: bright cores next to dark borders, a mid-tone background that leaves the extremes free, threats "always drawn on top" including over explosions, and a check in black and white ([Boghog, Shmups Wiki](https://shmups.wiki/library/Boghog's_bullet_hell_shmup_101)).
- Many additive layers on screen fuse into "one large white mass" ([JangaFX](https://jangafx.com/insights/diablo-3-vfx-experiments), a recreation of Diablo III techniques). Keep a dark backing behind bright cores.

## Enemies and characters

- **Telegraph length.** Nicolas Kraj: anticipation = player reaction time + the time the player's answer takes to trigger + a difficulty buffer, with reaction time taken as 0.25 s, "15 frames in a 60fps one" ([GDKeys](https://gdkeys.com/keys-to-combat-design-1-anatomy-of-an-attack/)). Average reaction is "around 265 milliseconds", about 16 frames ([Infil, Killer Instinct guide](https://ki.infil.net/reaction.html)).
- **Bigger hit, longer wind-up.** Enemy anticipation ("telegraphing") is "desirably longer" than the player's, and longer anticipation pairs with higher damage ([Game Anim, chapter 3](https://www.gameanim.com/2019/05/15/the-12-principles-of-animation-in-video-games/)).
- **Attack phases.** Jerry Zhang's Dark Souls 3 breakdown: attack signal plus attack at least 340 ms, hitbox live 2 to 4 frames, end pose held at least 170 ms before a punish window ([Game Developer](https://www.gamedeveloper.com/game-platforms/anatomy-of-an-enemy-attack-in-dark-souls-3)). Third-party measurement.
- **Threat colour.** God of War (2018) marks incoming melee with red arrows and ranged attacks with "a slightly different purple"; flashing the screen edge failed because "players thought they were damage indicators" (Mihir Sheth, [GDC 2019 slides](https://media.gdcvault.com/gdc2019/presentations/Sheth_Mihir_EvolvingCombat.pdf)).
- **Player attacks start moving.** "I often start my animation at frame -3 (which is 0.1 seconds at 30 FPS)" (Colin, above). "The faster a move, the less weight" (Game Anim, above).
- **Silhouette.** Overwatch's team checked whether a silhouette was "too similar to an existing character" ([Cook and Becker](https://www.cookandbecker.com/en/article/378/designing-overwatch.html)). Test trailer enemies filled solid black.
- **Twelve principles.** Frank Thomas and Ollie Johnston's list (*The Illusion of Life*, 1981); sources order it differently ([Wikipedia](https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation), Game Anim above).

## Not verified

- The stage values for Martin Jonasson and Petri Purho's "Juice It or Lose It" talk; the code has only slider ranges.
- The "100 ms real-time response" figure attributed to Swink's *Game Feel* appears only in a review.
- Hollow Knight and Dark Souls frame counts come from third-party analysis, never the studios.
- Riot's original VFX style guide could not be loaded; Riot rules beyond the Clarity post are secondary.
- Frame counts attributed to Joseph Gilland's *Elemental Magic*: the book was not read.
