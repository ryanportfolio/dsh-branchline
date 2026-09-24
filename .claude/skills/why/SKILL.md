---
description: Use only when the user explicitly invokes /why to challenge the assistant's immediately prior recommendation; never trigger from ordinary why questions or paraphrases.
---

# Why

The user typed `/why`. They just got a recommendation from you — a library, an approach, a file layout, a fix, a tradeoff call — and want a quick, honest, well-rounded look at it: why it matters, the real reasoning, and, critically, what it might be missing. They can already see the recommendation. Don't re-explain the conversation. Explain and pressure-test the *pick*.

**Trigger:** this skill runs ONLY on the explicit `/why` command. The word "why" used normally in conversation is not a trigger — never fire on it.

**Lightweight by design.** This is not `/impartial-review` (no five-bucket panel, no broad audit). But a model reviewing its *own* previous turn tends to rubber-stamp — same blind spots, same biases. So `/why` borrows exactly one trick from real review: a single fresh subagent with no memory of this session, to get genuine distance on the weak spots. Everything else you do yourself, fast.

## Step 1: Lock onto what's being reviewed

- **Default: the assistant message directly before the user's `/why`** — your own immediately-preceding turn. That's the recommendation they're reacting to. Don't scan further back unless that turn has nothing to review.
- If the user passed an argument (`/why the caching approach`, `/why picking Wouter`), let it scope or redirect — they may mean a specific pick inside that previous turn, or an earlier one. Honor the argument over the default.
- If that previous turn made **several** distinct recommendations and the argument doesn't disambiguate, ask one short question naming the candidates. Don't guess and burn the review on the wrong one.
- If the previous turn contains **no actual recommendation** (a question, a status update, a plain answer), say so in one line and stop — don't invent something to critique or reach back for an unrelated older pick without asking.

Open the final review with a single line restating the pick so the user can confirm you're aimed right. One sentence, no thread recap.

## Step 2: Ground it before you defend it

Quickly — not exhaustively — check the pick actually holds:

- If it rests on a **checkable fact about this repo** (a file exists, a pattern is already used here, a constraint applies), confirm it with a fast grep/read rather than asserting it. A wrong premise is the most important thing a review can catch.
- If it touches a known project landmine, check `CLAUDE.md` and the relevant `.claude/reference/` file. Typical collisions worth flagging (substitute this project's actual rules):
  - **Naming / copy policies** — anything touching user-facing copy or error surfaces that CLAUDE.md constrains.
  - **Manual install / migration policy** — a pick that adds a runtime dependency or a schema change may carry a manual deploy step the user must take; that's a real cost of the recommendation, not a footnote.
  - **i18n / theming requirements** — a pick that adds user-facing copy or UI may fan out across locales or themes per project rules.

Verify the one or two facts the pick actually leans on. If nothing needed verifying, that's fine — don't pad.

## Step 3: Get fresh eyes on the blind spots

Dispatch **one** subagent via the Agent tool for the "what it could be missing" angle — independent distance the self-review can't give itself:

- **Model:** honor an explicit user model choice; otherwise inherit the configured session model. Inspect the exposed tool and model options before dispatch. **Type:** `general-purpose`, fresh context. An unavailable requested model is a capability gap, not permission to substitute silently.
- **Feed it only the recommendation under review** — the text of your immediately-preceding turn, plus at most the single user message that prompted it so the pick makes sense. Do **not** paste the whole conversation or unrelated history. Minimal context is the point: genuine distance, no wasted tokens chewing the thread.
- **Ask it for:** unstated assumptions, edge cases the pick ignores, costs or risks not surfaced, and the conditions under which this is the *wrong* call. Tell it to be specific and skeptical, to **not** restate the recommendation, and to say plainly if the pick looks weak. Reasoning-level blind spots are the job — it may do one targeted grep/read if a claim is cheaply checkable, but it should not go spelunking the repo.
- **One agent only.** If fresh dispatch is unavailable or fails, disclose that the independent check did not complete. Useful personal critique may continue, clearly labeled as self-review; it cannot complete the independent gate. A completed reviewer finding no valid criticism is a valid result, not a dispatch failure.

Then **you** own the synthesis: take the subagent's findings, drop anything off-base (it lacks full repo context), and fold the rest into the review below. Don't relay its raw output — integrate it.

## Step 4: Write the review

One line restating the pick (Step 1), then lead with the header, then go conversational and tight:

### Why it matters

A real header (`### Why it matters`). One to three sentences: the stakes, the problem this pick solves, what goes wrong if it's ignored or done differently. This is the only fixed section — the user asked for it by name.

### Then, conversationally (no rigid headers, keep it short):

- **The real reasoning** — why this over the obvious alternatives, in plain terms. The *actual* driver, not a post-hoc justification. If it came down to one thing, say the one thing.
- **What it could be missing** — the honest part, now sharpened by the fresh reviewer. Assumptions it bakes in, edge cases it skips, costs you didn't surface first time (effort, lock-in, a manual deploy step, a perf or maintenance tail), conditions where it's the *wrong* call. Be specific to this pick. If it's genuinely shaky, say so plainly — don't soften a real problem into a "minor consideration."
- **Alternatives worth a glance** — only if a real one exists. One line each: what it is, when you'd switch. Skip if there's no honest contender.
- **Bottom line** — one line. Would you still make this call, how confident, and what would change your mind. A calibrated "yes, unless X" beats a blanket endorsement.

## Style

- **Concise.** A handful of lines, not an essay. Cut any sentence that doesn't change how the user sees the pick.
- **Honest over flattering.** The value is surfacing weak spots — the user can already see the pick. If a harder look shows the recommendation was wrong or weak, lead with that; self-correcting here is a feature.
- **Specific over generic.** "Wouter has no built-in data loaders, so route-level data fetching you bolt on yourself" beats "there are tradeoffs to consider."
- **Don't re-litigate the thread.** Review the pick, not the conversation.
- **Render the review in caveman *full* (the default intensity)** — even when the session is running caveman *ultra*. A review carries reasoning and nuance that ultra's compression mangles; full stays terse but readable. Resume the session's normal mode afterward. If the session isn't in caveman at all, just write plainly.
- This skill **reviews and explains — it does not implement.** No file edits while running it. If the review changes the user's mind, that's a separate follow-up.

## Worked example

Pick under review: *"Use Wouter instead of React Router for the new settings pages."* An ideal `/why` response (caveman full):

> **Pick:** Wouter for the new settings pages, not React Router.
>
> ### Why it matters
> Routing lib bakes into every page. Swap later = migration tax across whole app. Cheap to get right now, expensive to redo.
>
> **Real reasoning:** repo already runs Wouter everywhere. Driver = consistency + tiny size (~1.5kb), not feature count. Matching existing app beats a marginally richer router.
>
> **Could be missing:** Wouter has no built-in data loaders / nested-route data fetching — settings pages with per-route async data → you hand-roll the loader + suspense yourself. No route-level code-split helper either. Fresh-eyes flag: assumes settings stays flat; if it grows multi-step wizard flows, Wouter's model gets awkward.
>
> **Alternative:** React Router only if settings becomes its own data-heavy sub-app. Not worth the inconsistency otherwise.
>
> **Bottom line:** Right call, high confidence. Flip only if settings needs route-loaders → revisit then, don't pre-build.

Note the shape: one-line restate → `Why it matters` header → reasoning → honest gaps (incl. the subagent's flag) → alternative → calibrated bottom line. Short.

## Anti-patterns

- Restating the recommendation at length instead of pressure-testing it.
- Listing only upsides (sycophancy) — or only downsides (contrarian theater). Well-rounded means both, honestly weighted.
- Generic caveats that fit any decision ("consider your team's familiarity", "weigh the tradeoffs").
- Spinning up a *panel* or a broad multi-agent audit — that's `/impartial-review`. `/why` gets exactly **one** scoped reviewer.
- Feeding that subagent the whole conversation. Scope it to the recommendation plus the prompt that triggered it — nothing more.
- Inventing a recommendation to review when none was actually given.
- Firing on the word "why" outside the explicit `/why` command.
