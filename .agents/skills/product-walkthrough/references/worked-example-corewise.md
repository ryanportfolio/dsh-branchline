# Worked example: CoreWise signup onboarding (October 2026)

This is one real run of the workflow, kept as an example. Nothing here applies to other products; read it for the shape of the work.

## The brief

CoreWise (corewise.video) turns long videos, audio, articles and PDFs into a searchable library. The owner wanted a post-signup welcome: a cinematic intro with the new mascot, Probe (a small gold-foil space probe with one lens eye, a dish and a boom), that hands off to a short tour of what the app can do.

## Research

`onboarding-features.md` catalogued the app from a fresh checkout, with `file:line` for every claim, a tier table (what each plan allows), and model lists read with `curl` from the live `/api/chat/models` and `/api/council/models` on the research date. Each entry carried UI copy (i18n key and string), what it does, how to reach it, availability by plan, caveats, a non-obvious score and a demo idea. Two examples of what the code changed in the copy:

- Visual Q&A ("ask what was on screen") only runs for YouTube extractions, so the takeaway reads "On YouTube videos, ask about slides, code and charts on screen, with timestamps."
- The research also surfaced a production bug: an endpoint returning raw upload errors to the client, which could show internal vendor names. It went on the owner's bug list.

## Chapters

Ten chapters of 9.3 to 11 s, with 1.8 s between them, so the intro's tour button says "About 2 minutes · 10 quick demos" (computed from those durations, not estimated). Order: talk to any link, switch models mid-thread, make six models argue (Council), ask what was on screen, read actively, chat across your library, deep research, studio images, discover, share.

## Fidelity

- `app.css` fetched from production; the chat and Council screens needed extra CSS chunks, copied separately.
- Markup copied from `client/src/` (for example `Chat.tsx`, `ChatComposer.tsx`, `ProjectView.tsx`, `LibraryList.tsx`), lucide icons inlined by a build script, provider logos inlined as data URIs, strings from `en.json`.
- Class checks per chapter group against `app.css`.
- Logged-in reference captures with a test account read from a secret file; the session file was deleted at the end.
- Themes: dark (no attribute) and night-light (`data-theme="night-light"` on `<html>`), both reviewed for every chapter.

## Build

The contract (`SCENES.md`) was briefed to parallel builder agents, two or three chapters each. Each launched its own headed Chrome offscreen and muted, saved screenshots to `D:\screenshots\CoreWiseVideo\onboarding-chapters\<id>\`, and reported what it could not show because the real UI lacks it. The library chapter is a good model: a header comment cites the real flow (`Chat.tsx ~1040-1252`), a `T` object holds every beat time, Probe's taps are aimed through the tip offset at targets measured by a script, and every animated element has `transition: none`.

## Review

`review-all.mjs` contact sheets (6 moments x 2 themes per chapter), full-resolution spot shots at transitions, a backward-scrub determinism check on the heaviest chapters, and comparison with the reference captures. Fixes that came out of it included a layout error: one chapter showed a panel beside the view where the real app replaces the view.

## Integration

The intro page (`onboarding-lab.html`) embeds the player in a full-viewport iframe with `?embed=1`. Phases: the welcome blurs back while the intro's Probe flies to the tour Probe's reported spot, the iframe fades in, a 300 ms crossfade hands over to the tour's Probe, and on `tour-done` the intro's Probe flies home from the tour Probe's last position. Escape and Skip end the tour from either side. Knobs for every timing lived in a side panel with a settings dump the owner could copy.
