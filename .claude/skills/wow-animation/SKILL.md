---
name: wow-animation
description: Use when the user runs `/wow-animation <subject> [notes]`, or asks to start a new shareable promo, explainer or trailer animation for a website, game, app or feature. Kickoff and orchestration only; the craft lives in motion-design.
---

# Wow animation

Kickoff brief and orchestration for one shareable JavaScript animation about a real subject. This skill decides what to make, grounds it in the real thing, runs the agents and the review gates. [motion-design](../motion-design/SKILL.md) owns story craft, timing rules, the `frame(t)` engine, verification and export. Never restate or override its rules here; load it and follow it.

## Argument

`/wow-animation <subject> [notes]`. Subject is a name, URL, repo path or any mix (`example.com`, `<game name> <store page URL>`). Everything after the subject is notes: extra goals, must-show items, and overrides of the defaults below. No subject → ask once, then go.

## The brief (the job every run carries)

Build a shareable JavaScript animation that:

1. Makes a stranger understand what the subject is and why to use it or play it.
2. Is worth watching as information on its own, even for someone who never clicks through.
3. Matches the subject's existing look without being limited by it. Creativity first: if it wows you, it will probably land with others.
4. Is gorgeous enough that people want to watch it to the end.

Ground every frame in the real thing: real assets restyled, real product strings, real numbers. Full text for agent briefs: [brief.md](references/brief.md).

## Defaults (notes override any of these)

| Default | Override examples |
|---|---|
| 16:9 desktop and shared-video viewing; no portrait or phone cut | "also portrait", "phone first" |
| Silent. No music, no effects, no `AudioContext`, no audio stream in the export; captions carry the story. This beats motion-design's music-led trailer cutting: cut on visual beats instead. Never add sound because it seems to fit | "sound", "music", "audio" → follow [score.md](references/score.md) |
| Deterministic `frame(t)` with `seek`/`renderAt` and flash limits (per motion-design). No reduced-motion version | "reduced motion" → build one per motion-design |
| No periods in headings or large display text (statements, taglines, end slate); product UI copy keeps its own punctuation | none expected |
| No MP4 or video export until every wow-loop round passes; export is the last step | "export a draft now" |
| One approval checkpoint: beat sheet plus animatic, then run to the end | "autonomous" skips it; "check in after each scene" adds more |
| Maximum parallel fan-out (see Parallelize); Sonnet for subject research, Opus for creative calls; never Haiku | "no subagents", "keep it small" |
| `/codex-fullreview` after each major step; Codex review before any merge | "skip codex" (the before-merge review stays: kernel rule) |
| Games: trailer structure per motion-design (gameplay fast, hook early, logo on end slate), real enemies, bosses and systems | "teaser only", "no bosses" |
| Commit and push on a feature branch, open a PR when done | "local only" |

## Parallelize

Speed comes from fan-out. Serial work that could run side by side is a defect in the run.

- Launch every independent agent of a step in one message, never one after another. Before each dispatch, ask what else could start now.
- Subject research runs on Sonnet (`model: "sonnet"`): what the subject is, what it does, how it looks, its copy, assets, store or marketing pages, code facts. Split by source (live site, repo copy, design tokens and assets, feature code, store page, sprites, enemy and boss code) so each agent owns one slice with no overlap. Six or more recon agents is normal for a large subject.
- Opus (`model: "opus"`) takes the judgment calls: animator research, direction pitches, hero scenes, restyled assets, critics.
- Steps 2 and 3 start together. Director pitches run in parallel. Build modules with disjoint files run in parallel. Critics of one wow-loop round run in parallel.
- Serialize only what must be: one writer per file set, one owner per browser profile, performance measurements, and anything that needs a prior result.
- The orchestrator stays free: it merges reports, keeps `facts.md` and state current, and dispatches the next wave; it does not do recon itself.

## Workflow

1. **Locate and branch.** Find the subject's repo: current repo, then sibling folders of the current checkout, then `gh repo list`. Verify on GitHub, never the local checkout; branch a fresh worktree off fetched `origin/<default>`. Put the animation where the repo's conventions say; no obvious home → ask once. No repo access → public sources only, say so, mark every claim unverified.
2. **Ground (fan out, Sonnet).** Parallel Sonnet recon agents, one per source slice, dispatched in one message alongside step 3, build `facts.md` next to the animation: every on-screen string, number, feature, enemy and asset with its source (`file:line` or URL). Checklists per subject type: [grounding.md](references/grounding.md). A claim with no source gets cut, never guessed.
3. **Research the masters (runs with step 2).** One Opus agent searches for the most respected animators and motion designers as of today's date and what they teach. It writes `inspiration.md` with sources, flags what is new against motion-design's `references/principles.md`, and names 2 to 3 teachings this piece will apply. Propose additions to the motion-design skill in the handover; never edit it mid-run.
4. **Direct.** Invoke `/motion-design`. Two or three Opus directors each pitch a visual direction plus a one-sentence feeling-and-job line and a timestamped beat sheet, built from `facts.md` and `inspiration.md`. Pick the strongest (or graft), build the animatic, show the user beat sheet plus animatic, wait for OK unless notes say "autonomous". Write the chosen brief, direction and beat sheet to `BRIEF.md` beside the source and commit it.
5. **Build.** Scene modules with disjoint files, one writer each; Opus on hero scenes and restyled assets, Sonnet on mechanical wiring. `/codex-fullreview` on the build.
6. **Wow loop.** Run `/wow-loop` (absent → say so and run motion-design's verification by hand). Seed its contract from the four brief goals plus the defaults above as named checks, including one "stranger test" check: after one natural playback a critic states what the subject is and why to use it, and it matches `facts.md`. Critics judge the live JS animation at natural speed, plus stills and contact sheets. Rounds continue until the contract passes or the budget runs out. `/codex-fullreview` after the loop.
7. **Export last.** Video per motion-design's `references/verify-export.md`, only after the loop passes. Silent run: confirm with ffprobe that the file has no audio stream before calling the export done.
8. **Ship.** Commit, push, PR (`gh pr create --head <branch>`), `/codex-review` before merge, fix surviving findings.

`/codex-fullreview` needs the repo's `.agents/skills/impartial-review`; missing → run `/codex-review` and say which ran. Codex unavailable → say so, stop before merge.

## Rules every subagent brief carries

Subagents never see this skill. Paste these into each brief that renders, captures or writes copy:

- Headed Chrome on the real GPU, offscreen and muted: `launchPlacedChrome()` if the repo has it, else `--window-position=-2400,-2400 --mute-audio` on the first window. Never headless for motion claims, never minimized.
- Screenshots, stills and contact sheets go to the machine's screenshot folder when the user's instructions name one, keeping the relative path they would have had in `.tmp/`; otherwise `.tmp/`. Pass the exact path into the brief and report where they went.
- Every on-screen string and number comes from `facts.md`. No periods in display text. On-screen copy passes the `writing` skill (no em dashes, no puffery).
- Flash limits per motion-design. Reduced motion only when the owner asks.
- No audio of any kind unless the user's notes asked for sound. When they did, paste the rules from [score.md](references/score.md) into every brief that writes or reviews audio.
- Model: Opus or Sonnet only.

## Pitfalls

- Starting pixels before `facts.md` exists: the piece drifts to generic stock visuals and invented features.
- Faithful copies of sprites or UI that explain nothing to a stranger. Restyle the real asset, then make its rule readable.
- Exporting MP4 to show progress: critics then judge compression, and each fix costs a re-export.
- Critics judging only stills. Motion verdicts need one full natural playback.
- Duplicating motion-design rules into briefs from memory instead of loading the skill.
- Adding music because a trailer "needs" it. Sound only when the user asked.
- Calling audio good from code review or a subagent's say-so. No agent can hear it; the checks in score.md plus the user's listen decide.

## Handover

PR link, where the animation lives and how to open it, screenshot folder path, wow-loop outcome per check, each Codex run (which command, findings that survived verification, what was fixed or waived), proposed additions to motion-design from `inspiration.md`, open items.

## Examples

```
/wow-animation example.com
/wow-animation <game name> <store page URL> show the final bosses and the upgrade systems
```
