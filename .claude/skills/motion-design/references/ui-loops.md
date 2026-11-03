# UI loops: cards, dashboards and product mockups

Use this when a static UI design (a bento grid, feature cards, a dashboard or an app mockup) has to come alive on a loop, on a landing page or as a video or GIF. The intro, where elements arrive, is only the opening. The main part is every visual acting out what it does: a list receives a new item, a chart is being read, a prompt gets typed. A frame that loads and then sits there with a few pulses is not finished.

Adapted from the `design-to-motion` skill in [elayadesign/ai-design-skills](https://github.com/elayadesign/ai-design-skills) (MIT). The decision rules in [SKILL.md](../SKILL.md) still apply; where this file and SKILL.md disagree, SKILL.md wins.

## Write one story per visual first

Before building, write one sentence per visual saying what it acts out, for example "a new lead lands on top and the older ones step back one slot". Visuals are charts, lists, stacks, calendars, flows, prompts, photos, media controls and status indicators. Text-only cards get no story: they arrive with their card and rest.

| Visual | Story |
|---|---|
| Stack (leads, notifications, files) | A new item lands on top from a blur, the others step back one slot, the last one leaves |
| Line or area chart | A scrubber glides across, dots ride the curves and the tooltip value counts. Or the line redraws, a marker pops and the numbers count up with it |
| Bar chart, equalizer, grid of cells | Bars move like a live feed and settle back to the design heights; a dot and tooltip ride the active bar |
| Donut, gauge | Segments ease outward one at a time and back, or the ring sweeps again clockwise |
| Table, list | A cursor inspects rows one by one, the row highlights and a preview loads for it. Or a soft highlight steps down the rows |
| Calendar, scheduler | A highlight searches for an open slot, the event glides into it, then back |
| Flow, connectors, pipeline | Pulses travel along the connectors in the flow direction, nodes light up as a pulse passes, dashed lines march |
| AI prompt, form | The prompt deletes and retypes, chips evaluate one by one, then the result arrives from a blur |
| Counters, KPIs | Numbers count up together with the chart that drives them |
| Profile, long content | The content scrolls slowly inside its clip, then returns |
| Logo row | A marquee that moves exactly one full set per loop, so it repeats without a seam |
| Media player | The playback handle and progress advance while the play button pulses |

## Rules for stories

- **Start and end on the exact design.** Each story leaves the resting frame, acts, and returns to it. At rest the frame equals the static design; the rest check in [verify-export.md](verify-export.md#loop-checks-seam-empty-hold-and-rest) proves it.
- **Use the design's own elements:** its cards, rows, bars, dots, chips and tooltips. Helpers a story needs (a cursor, a duplicate stack item, extra pulses) match the design's style and are absent from the static frame.
- **Change text only when the change is the point:** counters, typing and tooltip values. Counters land on the design's exact text at rest. Typing reveals one glyph at a time with a caret, never a smooth wipe; deleting runs the same steps backwards, a little faster. All other text stays still.
- **Make it obvious within 2 seconds.** Each animated card shows a clear beat every 1 to 2 s: a pulse leaves, a node lights, an item lands. If a viewer cannot tell the frame is animated within 2 s, the stories are too timid. A calm screen, such as a document dashboard, may rest after the intro if the owner prefers; ask once.
- **Offset the cards.** Cards never act in unison. Shift each card's story so attention travels around the frame in reading order.
- **One story per card, 3 to 8 s long.** A short story may run twice in one cycle, and the second run may vary a beat. Every run ends at rest before the cycle restarts.
- **Keep it readable at the smallest size it ships.** Check the story in the smallest export or the narrowest embed. A moving element under about 4 px there (a pulse dot, a thin line) gets enlarged within the design's style, gains a halo, or is replaced by a bigger story.
- **Bars fill like progress bars:** a left-to-right wipe over 0.7 to 1.1 s with an in-out curve. Never add loading lines or any other shape that is not in the design.
- **Drive stories from the clock.** Each story is a set of keyframe tracks read at loop time inside `frame(t)` ([web-engine.md](web-engine.md)), so seeks, stills and exports stay deterministic.

**Accents** sit on top of stories and never replace them. They fade in over 0.6 s once the intro has landed.

| Accent | Use for | Values |
|---|---|---|
| Pulse ring | Status dots, live indicators, play buttons | 1.8 to 2.2 s period, ring scale 1 to 2.6, opacity 0.55 to 0 |
| Heartbeat | Hearts, likes, sparkles | +20% over 0.35 s, every 3 s |
| Gentle bob | Floating objects (folders, devices, cards inside cards) | ±2.6 px, 2.8 s sine |
| Sheen sweep | Photos, bars, buttons | A band 38% of the element's width peaking at 34% white, a 1.5 s pass every 3.4 s. It disappears on light grey shapes; use a refill story there |

## Intro

Elements rise from below and resolve from blur to sharp, staggered in reading order. Defaults: text and rows rise 10 px from a 4 px blur; whole cards rise 24 px from `scale(0.985)` and a 6 px blur; icons and badges grow from 0.82 to 0.88 of their size around their own centre. Containers start 80 to 90 ms apart, items inside a group 30 to 80 ms apart, and a full frame lands in about 2 to 2.5 s. Inside a container the order is header, labels, values, then visuals. Anything hidden under another layer in the final frame arrives after its cover and leaves before it, so it never shows through.

An app frame built from joined surfaces (a sidebar and a body) keeps those surfaces still and opaque from the first frame; only their contents arrive. Separate cards arrive themselves, with their contents following inside them, and each card clips its own contents to its exact shape and radii.

## Cycle for exported loops

| Phase | Default |
|---|---|
| Intro | 0 to 2.4 s |
| Stories | 2.4 to 11.0 s |
| Fade out | 11.0 to 11.6 s (opacity over 0.5 s) |
| Empty hold | 11.6 to 12.0 s |

- The story phase holds at least one full run of every card's story. Lengthen the cycle rather than cut a story short.
- The fade-out returns to the starting frame: the empty background, or the joined surfaces of an app frame. A photo or textured background never fades, moves or blurs.
- Compute loop time as `t mod CYCLE`, and reset every value the stories write (masks, helpers, typed text, pulses) in the reset block, so the end of a cycle equals its start. Then run the [loop checks](verify-export.md#loop-checks-seam-empty-hold-and-rest).

## On a live page

- Animate only sections with a visual part: bento and feature cards, product mockups, logo rows. Text-only sections (headlines, testimonials, FAQ, pricing, footer) use the page's normal reveal.
- Start the intro once, when about 30% of the section is visible, with `IntersectionObserver`. Never a scroll listener.
- After the intro the stories run for as long as the section is on screen, with no fade-out cycle. Pause the clock while the section is off screen and resume it on return.
- Stagger in reading order inside each section, never across the whole page.
- Use the site's own components, tokens, radii and fonts, and keep text as live HTML. Only the visual parts are images or SVG.
- For a product or dashboard mockup, run the intro and then ask the owner whether they also want stories. Do not add them unasked.
