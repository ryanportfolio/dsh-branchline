---
name: "advocate"
description: "Use only when the user explicitly invokes $advocate to challenge a change just made before it lands. Do not trigger from natural-language requests."
---

# Advocate: any reason not to?

The user invoked `$advocate` on a change just made and wants the devil's-advocate case before it lands: is there any reason not to do this? This is not "is it buggy"; assume it works. The question is whether the change should exist at all, in this form and at this scope.

You made the change, so your bias is to keep it. This skill exists to fight that bias on purpose.

Trigger only on an explicit `$advocate` invocation. Do not fire on the word "advocate" in normal conversation.

## How it differs from neighbors

- `why` pressure-tests a recommendation (a pick or advice) and stays balanced. `advocate` pressure-tests a change already made and leans adversarial, because confirmation bias already argues the case for it.
- `impartial-review` and other bug-hunting reviews hunt defects in a diff. `advocate` assumes the code is correct and asks whether it should ship: a judgment call, not a defect scan. If a real bug turns up in passing, name it and point at the bug-hunting skills; do not become one.

## Step 1: Lock onto what is under review

- Default: the change just made, meaning the uncommitted working diff. Run `git status --short`, `git diff`, and `git diff --staged`. On a clean tree, fall back to the latest commit (`git show HEAD`); the change just landed and the doubt is still worth voicing.
- If the invocation input names a slice (`$advocate the retry logic`, `$advocate the new dependency`), scope to that slice. The input beats the default.
- If there is no change to review (clean tree, no relevant recent commit), say so in one line and stop. Do not invent a change to second-guess.
- First, state the change's goal in your own words: what problem it solves and why it was made. The counter-case is only fair if it argues against the real intent, not a strawman.

Open the review with one line restating what changed and the goal, so the user can confirm you are aimed right.

## Step 2: Fresh eyes on the case against

Independent context is required. Inspect the tools exposed in this session. If multi-agent tools are exposed, spawn exactly one fresh devil's-advocate agent with `fork_turns: "none"` and a self-contained brief. A model reviewing its own change rubber-stamps it; the value of "any reason not to?" is distance that self-review cannot fake.

- Model: honor an explicit user model choice; otherwise inherit the configured session model. Check the exposed tool and model options before dispatch. An unavailable requested model is a capability gap, not permission to substitute silently.
- Feed only the diff under review (or the scoped slice) plus a one-line statement of the goal. Do not pass conversation history or unrelated context. Minimal context is the point.
- The agent is a read-only leaf: no edits, no Git writes, no agents or review processes of its own.
- Ask for the strongest honest case against keeping this change, specifically:
  - **Scope:** does it do more than the goal needs? Unrequested refactors, extra abstraction, defensive code, or drive-by edits that belong in a separate change.
  - **Necessity:** does it need to exist at all? Does it treat a symptom instead of the cause? Is doing nothing defensible?
  - **Blast radius:** what else does it touch, and which assumptions does it break? Callers, config, other environments, public API, on-disk or database state.
  - **Reversibility:** what does it cost to undo once landed? A migration, format change, added dependency, or a name others will build on.
  - **Simpler path:** is there a smaller or more local change that reaches the same goal with less surface?
  - **Wrong place or wrong time:** right idea, but wrong PR, wrong layer, or premature (YAGNI).
  - Be specific and skeptical, cite the diff, and do not restate it approvingly. One or two cheap searches or reads to ground a claim are fine; no deep repository exploration.
- One agent only. If agent tools are not exposed, or the dispatch fails, disclose that the independent check did not complete. Useful personal critique may continue, clearly labeled as self-review; it cannot complete the independent gate, and you must not claim `$advocate` ran as designed. A completed reviewer that finds no valid criticism is a valid result, not a dispatch failure.

Then you own the synthesis. Drop off-base points (the agent lacks full repository and project context), keep what lands, and fold it into the review below. Integrate; do not relay raw output.

## Step 3: Check against project rules

Where relevant, quickly confirm the change does not collide with the project's own constraints. These are concrete reasons not to ship that a generic reviewer cannot know:

- `AGENTS.md` rules, plus the configured-facts sections of `CLAUDE.md` that `AGENTS.md` names (What this project is, Verification, Environment & Deploy Target). Other `CLAUDE.md` workflow rules are not Codex instructions.
- The relevant `.claude/reference/` file for the area (`pitfalls.md`, `architecture.md`, and so on), by a quick read or `$recall`.

A change that works but violates a project rule is a real reason not to ship it as-is. Flag it.

## Step 4: Write the review

One line restating the change and goal (from Step 1), then:

### The case against

The main section. Give the honest reasons not to do this, sharpened by the fresh reviewer and the project-rule check. Lead with the strongest. Make it specific to this diff: "adds `lodash` for one `groupBy` you could write in 3 lines, and it's the only dependency in this package" beats "adds a dependency." If the case against is weak, say so plainly; do not manufacture doubt.

### Then, tight and conversational (no rigid headers)

- **Counter-weight:** honest reasons the change is worth keeping despite the above. This prevents contrarian theater. One or two lines.
- **Cheaper alternative:** only if a real smaller path exists. One line: what it is and what it gives up.
- **Verdict:** one line: keep as-is, revise, or drop, plus a confidence read and the one thing that would flip it. A calibrated "keep, but split the unrelated rename into its own change" beats a blanket approval or a reflexive "revert."

## Style

- Concise: a handful of lines, not an essay. Cut anything that does not change how the user sees the change.
- Adversarial but honest. The job is to voice the doubt that build momentum buried, but a change that should ship gets a clear "keep." Do not invent objections to look rigorous.
- Specific over generic. No "consider the tradeoffs." Name the scope creep, the caller that breaks, the dependency, the simpler diff.
- Render the review in caveman full (the default intensity) even when the session runs caveman ultra; a review carries nuance that ultra mangles. Resume the session mode afterward. If the session is not in caveman, write plainly.
- This skill reviews; it does not implement. No file edits while it runs. A revise or drop verdict becomes a separate follow-up the user approves.

## Worked example

Change under review: a `retryWithBackoff` wrapper added around every outbound HTTP call in `client.ts`; the goal was to stop one flaky webhook from failing. Ideal response (caveman full):

> **Change:** `retryWithBackoff` wrapped around all outbound calls in `client.ts`. Goal: stop one flaky webhook failing.
>
> ### The case against
> Scope > goal. One flaky endpoint, but retry applied to *every* call, incl. non-idempotent POSTs: silent double-submits under transient errors. Blast radius wide: every caller now inherits added latency + swallowed-then-retried errors, harder to debug. Simpler path skipped: wrap the one webhook call, not the whole client. Reversibility: fine to undo now, but callers will start assuming retries, so cost grows the longer it sits.
>
> **Counter-weight:** central retry is a real eventual want; the backoff impl itself looks sound.
>
> **Cheaper alternative:** retry only the webhook call site. 3-line change, zero blast radius. Promote to client-wide later with an idempotency guard.
>
> **Verdict:** revise: scope down to the one call. High confidence. Flip to "keep" only if the goal was actually "make the whole client resilient," which it wasn't.

Shape: restate, case against (the main part), honest counter-weight, cheaper path, calibrated verdict. Short.

## Anti-patterns

- Firing on the word "advocate" outside an explicit `$advocate` invocation.
- Turning into a bug hunt; that belongs to `impartial-review` and other bug-hunting reviews. `advocate` assumes correctness and questions the decision.
- Manufacturing objections to look thorough. A clean change gets "keep."
- Contrarian theater: only downsides, a reflexive "revert." Counter-weight and a calibrated verdict are mandatory.
- Feeding the agent the whole conversation. Scope it to the diff and goal, nothing more.
- Presenting self-review as the independent check.
- Implementing the revision while the skill runs. Review, verdict, stop.
- Generic caveats that fit any change ("weigh the tradeoffs", "consider maintainability").
