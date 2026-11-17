---
name: user-walk
description: "Find friction in a web app: map every feature from code, blind walker agent tries each like a first-time user in headed Chrome, report wasted steps ranked by user cost. Use: /user-walk, 'is this user friendly', 'too many clicks', 'where do users get lost', 'walk my app like a new user'. Not games. Look → climb-loop; a11y/states → ui-quality; sign-up/checkout/paywall → conversion-ux; tours → product-walkthrough."
---

# User walk

Finds where first-time user wastes steps reaching each feature. Main session maps features from code + verifies shortest path; fresh walker agent, briefed with goal + URL only, attempts each feature; report compares the two. Judges reachability only: look, accessibility, conversion go to other skills (table below).

## Gates

- Run on request only (`/user-walk` or a clear ask). The owner's own web apps and sites only. Browser game → stop: testing a game means playing it.
- Walker never gets code, map, known path or step counts in its brief. The main session never walks a goal itself: it has read the code, so its walk proves nothing. No fresh agent available → say so and stop; never substitute a main-session walk.
- Walker agents still start in the repo and see its `CLAUDE.md` (Codex: `AGENTS.md`) and recent commit titles. So after each walker, run the driver's `check-walker` on its transcript; any tool call besides the driver and its screenshots → discard that walk, rerun with a fresh walker, note it in report.
- No walker starts before [preconditions.md](references/preconditions.md) is done: target and the commit it serves, account or seeded data, skip list, allowed origins, time estimate stated.
- Use a test account or seeded data only. Never act on real users' data.
- Headed Chrome, offscreen, muted, through `scripts/walk.mjs` (uses repo's `launchPlacedChrome()` when present). Never headless, never minimized. Pass this line into every walker brief.
- One walk = one sample. Label single-walk findings `1 walk`; no pattern claims from one walk.
- Job past 2× its estimate → stop walkers, report what finished, rethink.

## Steps

0. **Setup.** Run folder `.tmp/user-walk/<UTC time>/`. Screenshots where repo instructions put them (this machine: `D:\screenshots\<project>\user-walk\<run>\`), one subfolder per driver via `--shots <root>\goal-<n>` (or `known-<n>`). Read code at the commit the target serves (preconditions 1). Install once: `npm i --no-save --prefix .tmp/user-walk-deps playwright-core@latest`.
1. **Map.** [feature-map.md](references/feature-map.md) → `map.md` (features, goals in user's words, known paths, `file:line`). Update `.claude/reference/features.md` (names, what, where; no counts).
2. **Preconditions + known-path replay.** [preconditions.md](references/preconditions.md). Main session replays each known path through driver → measured known steps, blocked origins, seconds per action → estimate. Broken known path → fix map or it is a finding.
3. **Walk.** [walk-brief.md](references/walk-brief.md). One fresh walker per goal, max 4 at once, each own driver folder. One progress line per finished walker: `walked 3/9: export results: found, 7 actions (known 3)`.
4. **Report.** [report.md](references/report.md) → `report.md` in run folder. Chat: top findings, each with next skill, + path to report.
5. **Cleanup.** `stop` every driver (also after failures), `summary` on run folder, delete `auth.json`, confirm no walk Chrome left (`servers` skill where installed).

## Driver

`scripts/walk.mjs` in folder holding this SKILL.md. Header comment = full command list. Main session: `start` (sets goal, `--known`, `--max-actions`, `--skip`, `--origin`, `--storage-state`, `--shots`), `fill <ref> --from-file`, `save-state`, `stop`, `summary`, `check-walker`. Walker: `look`, `click`, `fill`, `select`, `hover`, `press`, `scroll`, `back`, `home`, `note`, `end`. Every walker action → `steps.jsonl`; counts come from log, not walker's account. Driver refuses skip-list controls (matched on the control's text, label, title and the control it sits in, for click, select, Enter, Space), takes navigation keys only, refuses off-screen targets until scrolled to, undoes any landing on another origin, blocks writes to other origins, redacts secret fields and URL parameters in the log, saves downloads to `<dir>/downloads`, enforces action budget, exits after 20 idle min.

## Hand-offs

Report names next step per finding; this skill never judges them itself.

| Finding | Next |
|---|---|
| Path too long, feature buried, misleading label, dead end | fix in code (report gives the change) |
| "Does this look current / modern" | `climb-loop` (blind ranking vs reference apps; none → `redesign-concepts`, then climb past own versions) |
| Accessibility, focus, missing states (loading, empty, error) | `ui-quality` |
| Sign-up, checkout, pricing, paywall, booking decisions | `conversion-ux` |
| Feature works but nobody would find it alone | fix discoverability; onboarding tour → `product-walkthrough` |
