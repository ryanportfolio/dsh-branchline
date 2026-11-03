# Story for explainers, promos and game trailers

A promo has to hook a stranger in 3 seconds and still teach something useful. An explainer can take longer to set up. Both follow the same order: concrete first, one idea per beat, and a turn the viewer can feel.

## Structure

1. **Cold open, the concrete problem.** Show the pain happening, without naming it yet. Pick a pain the audience has today, not one the tools have already fixed. Show the cause as a visible object: something the viewer watches get made and then lost. That reads better than a timer or a meter. Repeat a moment only when the repeat adds information, for example "you already told it this". Identical repeats read as filler: a viewer judged three near-identical sessions redundant (Cold Boot, 2026-09).
2. **Name it** in a single statement once the pictures have made the point.
3. **The turn.** The product arrives as a physical change in the same world, not as a logo slide.
4. **The payoff of the setup.** Repeat the cold open's exact situation, which now succeeds. The payoff is what people remember.
5. **One beat per capability.** Each beat carries one idea the viewer can use even without the product, linked to the next with "but" or "therefore".
6. **Resolve.** Every element converges into the mark, followed by one line, the URL, and a 3-second hold.

For a 60 to 90 s piece, aim for 6 or 7 chapters of 8 to 14 s each, with a new idea every 10 to 15 s.

## Beat-sheet template

| t | Beat | Picture | Words on screen | Hold |
|---|---|---|---|---|
| 0 to 13 | Cold open | ... | small labels only, then one statement | 2 s |
| ... | ... | ... | ... | ... |

Write the picture column as verbs: "assembles", "cracks", "sweeps". A picture you can't describe with a verb is a slide.

## Captions (silent-first)

- Feeds autoplay muted, so the captions carry the story. Words on screen do the job of narration.
- There are two kinds of text:
  - **Statements** are large, at most one on screen, about ten words. One accent word per statement, set in an accent face or color.
  - **Labels** are small monospace text near the thing they name: file names, states, counts.
- Time each label to the cue it names, so it appears when the picture shows it.
- A statement arrives word by word (60 to 80 ms stagger) and then holds. Allow 250 ms per word plus 1 s before anything else changes. 250 ms per word is 240 words per minute, about the average adult silent reading rate, so half of viewers read slower: give more time over busy footage or fast cutting. No caption stays up for less than 20 frames, Netflix's subtitle floor ([Netflix](https://partnerhelp.netflixstudios.com/hc/en-us/articles/360051554394-Timed-Text-Style-Guide-Subtitle-Timing-Guidelines)).
- Keep the words cumulative. A stagger that leaves earlier words visible is not rapid serial presentation (one word replacing the last), which impairs recall at speed ([APS](https://www.psychologicalscience.org/publications/speed_reading.html)).
- Text over footage needs 4.5:1 contrast, or 3:1 for large text, measured at the least favourable spot ([WCAG](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [WebAIM](https://webaim.org/articles/contrast/)). Add a scrim until the worst pixel passes.
- Avoid orphans. Widen the measure or rewrite so the last line has at least two words.
- Keep product copy accurate. Every claim in a statement must be something the product really does, stated in its own vocabulary.
  - Where code and marketing copy disagree (counts, tiers, model names), use the value in the code and drop version numbers that drift.
  - Show real output. Pull a real public record through the product's own API rather than writing mock copy, then check the record against every on-screen claim. Example: a demo extraction whose Gemini run had failed made "synthesized from every model" false on that card.
- Ask the owner about punctuation style for statements. On-screen statements often read better without terminal periods; one owner rejected periods in all promo text.
- Make the reading budget a script, not a judgment: expose the caption schedule and fail any caption whose fully visible time is below the budget.

## Game trailer

A game trailer shows what the player does. The explainer order above still holds (concrete first, one idea per beat), but gameplay replaces the cold-open problem, and the mark waits for the end. Sources for the editor rules are in [principles.md](principles.md#game-trailers).

### Structure

- **Gameplay within the first 2 s.** No studio logo, no lore card, no slow environment pan before it (Chris Zukowski).
- **Genre in 1 or 2 shots, then the hook,** ideally inside the first 10 to 15 s and never later than the first half (Derek Lieu).
- **Logo on the end slate.** Lieu never opens on logos; a studio logo goes after the cold open for a couple of seconds or on the end slate. A new studio's logo belongs on the end slate.
- **Length 90 s or less** (Lieu).
- **Builds and stopdowns.** Each section builds tension (faster cuts, rising music) and ends in a stopdown, where the music stops and the momentum breaks before the next section. Lieu's examples run four stopdowns in about 2 minutes; for a 90 s cut this skill uses about 3 builds.
- **Cut on hits.** Land cuts and in-game impacts on the beat of the music. Prepare the music first; see [sound.md](sound.md).
- **Pacing curve.** Longer shots in the setup, the shortest in the climax, longer again on the end slate. Shot lengths and cutting rules are in [camera-cut.md](camera-cut.md).
- **Bosses get one short beat.** A section of only boss fights gets boring (Lieu, [pacing](https://www.derek-lieu.com/blog/2020/11/16/how-to-think-about-pacing-in-a-trailer)). Show scale or silhouette and cut before the fight resolves.

### Steam specifics

From Valve's trailer docs ([Steamworks](https://partner.steamgames.com/doc/store/trailer), read 2026-09-29):

- "The first two valid trailers will be shown to players before any screenshots." Valve recommends the first be mostly gameplay: "most Steam users are looking for gameplay of your game." A visible HUD is "often beneficial".
- In the Discovery Queue "you may have less than 10 seconds to make an impression", possibly with no audio.
- A custom thumbnail "must be a frame from the video itself", 1920x1080, and should avoid text. Export a text-free hero frame.
- Steam builds the 6-second looping microtrailer by "taking six 1-second clips from various points" of the first trailer; "It is not possible to customize microtrailers" ([Next Fest docs](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest)). Every second of the first trailer should read alone.
- Deliver separate cuts: a Steam-page cut (gameplay by 2 s, no logo), a YouTube or announcement cut, and a vertical cut edited for 9:16 rather than cropped. Delivery specs are in verify-export.md.

### System shots must read to a stranger

Measured on the MAIMCOIL promo (2026-09-29). A shot reproduced a game system faithfully (a lifesteal heal and its "OVERHEAL" shield) and the owner rejected it as "very weak ... no indication of what this is". A faithful copy of a system can still mean nothing to someone who never played.

- Each system shot shows three things in order: the **risk** the player takes, the **reward** it pays, and the **power spike** that results.
- Cause and effect must be obvious in under 1 s per beat: the kill, then the heal flying to the player, then the bar filling. Stage them in sequence on screen, not all at once.
- The caption states the rule in plain words, for example KILLS HEAL. Never caption with game jargon the viewer has not been taught (OVERHEAL, lifesteal, proc).
- The game's own HUD element is often a few pixels tall at trailer scale. Stage a film-scale gauge in the game's colours and with the game's real values, near the action, instead of pointing at the HUD.

### Beat sheet additions

Add two columns to the template above: **Hit** (the music accent the cut lands on) and **Stranger test** (what a non-player understands from this beat alone). A beat whose stranger test is blank gets rewritten or cut. Any film also gets a **Colour** column: one palette strip per beat, with saturation tracking the emotion (see [color-light.md](color-light.md)).

## Checks before building

- A stranger could say what the product is after watching with the sound off.
- Each beat's single idea fits in one sentence.
- The payoff visibly mirrors the cold open.
- The last frame holds long enough to read the URL.
- Game trailer: gameplay by 2 s, the hook by 15 s, and every system shot passes the stranger test.
