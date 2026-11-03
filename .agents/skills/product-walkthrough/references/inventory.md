# Feature inventory and storyboard

Chapters come from the code, not from the marketing page. Before any storyboard, write a feature inventory where every claim cites the file and line that makes it true. The inventory decides which chapters exist, and later it is the fact sheet every caption is checked against.

## Inventory file

Write `inventory.md` in the scratch folder. Header: the research date, the commit read (`git rev-parse --short HEAD` of a fresh `origin/<default>` checkout), and where any live data came from (for example `curl` of a public API on a given date). Then a short reference table for limits that vary by plan or tier, then one entry per capability:

```markdown
#### 7. Paste any link into chat
- **UI copy:** en:`chat.working.readingLink` "Reading the link…"   (i18n key and English string the UI shows)
- **What:** Any http(s) URL in a chat message is fetched before the model answers; video links pull the transcript. Up to 3 links per message (`server/chat-routes.ts:456-476`).
- **Reach:** `/chat`, paste into the composer. No toggle.
- **Availability:** signed-in users on every plan; guests cannot chat.
- **Caveats:** fetched text is not replayed on later turns (`server/chat-routes.ts:2098`).
- **Non-obvious:** 5/5. Nothing in the composer says links work.
- **Demo idea:** paste a 3-hour lecture link and ask which parts matter for the exam.
```

Rules:

- Every fact has a `file:line` or a dated live source. A capability you cannot cite does not go in.
- Read the code path end to end, server included. A button that exists in the UI can still be gated, rate-limited, or limited to one source type.
- Record conditions exactly: plan, tier, source type, platform, feature flag, region. These become caption wording later.
- Lists that the product fetches at runtime (models, templates, integrations) drift. Record the date and where you read them, re-read them before shipping, and again whenever the tour is re-checked. Third-party names and logos in those lists are fine inside an in-app tour; ask the owner before using them in marketing video.
- Note product bugs you trip over (an error string leaking internals, a dead route) in a separate list for the owner; see [fidelity.md](fidelity.md#product-bugs).

## Scoring and choosing chapters

Score each entry 1 to 5 on two axes:

- **Non-obvious:** would a new user find this alone in their first week? 5 = nothing in the UI hints at it.
- **Demo value:** can it be shown as one concrete action with a visible result in about 10 seconds?

Pick from the top of both. A typical tour has 6 to 10 chapters of 8 to 12 seconds each. Prefer capabilities that change how someone uses the product over ones they would discover anyway (log in, open settings).

Reject:

- Benefit claims with no action behind them ("save hours", "work smarter"). "Hours to minutes" is not a feature.
- Chapters that need UI the product lacks. If a beat needs a metaphor (an animation of data flowing between screens), flag it to the owner as a metaphor and keep the real screens on either side of it.
- Two chapters that show the same screen doing the same kind of thing.

## Storyboard

For each chosen chapter write, in `STORYBOARD.md`:

1. **Title:** verb-led, says what the viewer can do ("Chat across your library", not "Library chat").
2. **Takeaway:** one line, 14 words or fewer, true for the viewer's plan. State the condition when there is one: "On YouTube videos, ask about slides, code and charts on screen" because the visual pass only runs for YouTube.
3. **CTA:** label plus the real route it opens (`/chat`, `/projects/new`). Check the route exists.
4. **Beat sheet** with timestamps: what is on screen, what the actor does, what changes in response. One idea per chapter. The viewer must be able to read every string at the pace it appears.
5. **Demo content:** specific and plausible (a real-sounding video title, a sensible question and a short answer). Numbers in demo content must be possible in the product (no "50 sources" on a plan capped at 10).
6. **Screens and sources:** the components and files the chapter replicates.

Show the storyboard to the owner and get an OK before building. It is cheap to change here and expensive after ten scenes exist.

## Copy checks before shipping

- Every title, takeaway and on-screen claim matches an inventory entry and its conditions.
- Durations stated anywhere ("about 2 minutes") are computed from the chapter durations plus the gaps, not estimated.
- Model names, plan names and limits are copied from the live product or its source, never from memory.
- Hidden implementation details (internal provider names, admin-only features) never appear in user-visible copy.
