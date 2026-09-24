---
description: Use only when the user explicitly invokes /advocate to challenge a change just made before it lands. Do not trigger from natural-language requests.
disable-model-invocation: true
---

# Advocate — any reason not to?

User typed `/advocate`. Just made change → before it lands, want devil's-advocate case: **any reason not to do this?** Not "is it buggy" — assume works. Q = should change exist, in this form, this scope, at all?

You made change → bias = keep it. Skill exists to fight that bias on purpose.

**Trigger:** ONLY explicit `/advocate` command — slash-only, model auto-invocation disabled in frontmatter. Don't fire on word "advocate" in normal talk.

## How differs from neighbors

- **`/why`** → pressure-tests a *recommendation* (pick, advice), stays well-rounded (both sides). `/advocate` → pressure-tests a *change already made*, leans adversarial: case against, since confirmation bias already argues case for.
- **`/impartial-review` / `/code-review`** → hunt *bugs* in diff. `/advocate` → assumes code correct, asks whether it should ship — judgment call, not defect scan. Turns up real bug in passing → name it, point at bug-hunt skills; don't become one.

## Step 1: Lock onto what's under review

- **Default: change(s) just made** — uncommitted working diff. `git status --short` + `git diff` (+ `git diff --staged`). Clean tree → fall back to latest commit (`git show HEAD`); change just landed, doubt still worth voicing.
- User passed arg (`/advocate the retry logic`, `/advocate the new dependency`) → scope/redirect to that slice. Arg beats default.
- **No change to review** (clean tree, no relevant recent commit) → say so in 1 line, stop. Don't invent a change to second-guess.
- First: get change's **goal** clear in own words — what problem it solves, why made. Counter-case only fair if arguing real intent, not a strawman.

Open review with 1 line restating what changed + goal → user confirms you're aimed right.

## Step 2: Fresh eyes on the case against

Dispatch **one** subagent via Agent tool — independent devil's advocate. Model reviewing own change rubber-stamps; whole value of "any reason not to?" = distance self-review can't fake.

- **Model:** honor an explicit user model choice; otherwise inherit the configured session model. Inspect the exposed tool and model options before dispatch. **Type:** `general-purpose`, fresh context. An unavailable requested model is a capability gap, not permission to substitute silently.
- **Feed only:** diff under review (or scoped slice) + 1-line statement of goal. Do **not** paste conversation / unrelated history. Minimal context = the point.
- **Ask for strongest honest case *against* keeping this change**, specifically:
  - **Scope** — does more than goal needs? Unrequested refactor, extra abstraction, defensive code, drive-by edits belonging in a separate change.
  - **Necessity** — need to exist at all? Solving a symptom not the cause? Doing nothing defensible?
  - **Blast radius** — what else touched / assumptions broken? Callers, config, other envs, public API, on-disk/DB state.
  - **Reversibility** — cost to undo once landed? Migration, format change, dep added, a name others build on.
  - **Simpler path** — smaller / more local change hitting same goal, less surface?
  - **Wrong-place / wrong-time** — right idea, wrong PR / wrong layer / premature (YAGNI).
  - Be specific + skeptical, cite diff, **not** restate approvingly. 1-2 cheap greps/reads OK to ground a claim; no deep repo spelunking.
- **One agent only.** If fresh dispatch is unavailable or fails, disclose that the independent check did not complete. Useful personal critique may continue, clearly labeled as self-review; it cannot complete the independent gate. A completed reviewer finding no valid criticism is a valid result, not a dispatch failure.

Then **you** own synthesis: drop off-base bits (agent lacks full repo/project context), keep what lands, fold into review below. Integrate — don't relay raw output.

## Step 3: Check vs project rules

Quickly, where relevant → confirm change doesn't collide with project's own constraints — concrete "reasons not to" the generic reviewer can't know:

- `CLAUDE.md` kernel rules (scope discipline, naming/copy policies, no unrequested refactors, migration/install policy).
- Relevant `.claude/reference/` file for the area (`pitfalls.md`, `architecture.md`, etc.) via quick read or `/recall`.

Change works but violates a project rule = real reason not to ship as-is. Flag it.

## Step 4: Write the review

1 line restating change + goal (Step 1), then:

### The case against

The meat. Honest reasons not to do this, sharpened by the fresh reviewer + project-rule check. Lead with strongest. Specific to *this* diff — "adds `lodash` for one `groupBy` you could write in 3 lines, and it's the only dep in this package" beats "adds a dependency." Case against weak → say so plainly, don't manufacture doubt.

### Then tight + conversational (no rigid headers):

- **Counter-weight** — honest reasons the change *is* worth keeping despite the above. Stops contrarian theater. 1-2 lines.
- **Cheaper alternative** — only if a real smaller path exists. 1 line: what it is, what it gives up.
- **Verdict** — 1 line: **keep as-is / revise / drop** + confidence read + the 1 thing that flips it. Calibrated "keep, but split the unrelated rename into its own change" beats a blanket thumbs-up or reflexive "revert."

## Style

- **Concise.** Handful of lines, not an essay. Cut anything not changing how user sees the change.
- **Adversarial but honest.** Job = voice the doubt build-momentum buried — but a change that genuinely should ship gets a clear "keep." Don't invent objections to look rigorous.
- **Specific > generic.** No "consider the tradeoffs." Name the scope creep, the caller that breaks, the dep, the simpler diff.
- **Render in caveman *full*** (default intensity) even when session runs caveman *ultra* — a review carries nuance ultra mangles. Resume session mode after. Session not in caveman → write plainly.
- Skill **reviews — does not implement.** No file edits while running. Verdict revise/drop → separate follow-up user green-lights.

## Worked example

Change under review: *added a `retryWithBackoff` wrapper around every outbound HTTP call in `client.ts`; goal was to stop one flaky webhook from failing.* Ideal `/advocate` response (caveman full):

> **Change:** `retryWithBackoff` wrapped around all outbound calls in `client.ts`. Goal: stop one flaky webhook failing.
>
> ### The case against
> Scope > goal. One flaky endpoint → retry applied to *every* call, incl. non-idempotent POSTs → silent double-submits under transient errors. Blast radius wide: every caller now inherits added latency + swallowed-then-retried errors, harder to debug. Simpler path skipped: wrap the one webhook call, not the whole client. Reversibility: fine to undo now, but callers will start assuming retries → cost grows the longer it sits.
>
> **Counter-weight:** central retry is a real eventual want; the backoff impl itself looks sound.
>
> **Cheaper alternative:** retry only the webhook call site — 3-line change, zero blast radius. Promote to client-wide later with an idempotency guard.
>
> **Verdict:** revise — scope down to the one call. High confidence. Flip to "keep" only if the goal was actually "make the whole client resilient," which it wasn't.

Shape: restate → case against (meat) → honest counter-weight → cheaper path → calibrated verdict. Short.

## Anti-patterns

- Firing on word "advocate" outside the explicit `/advocate` command.
- Turning into a bug hunt — that's `/impartial-review` / `/code-review`. `/advocate` assumes correctness, questions the *decision*.
- Manufacturing objections to look thorough. Clean change → "keep."
- Contrarian theater — only downsides, reflexive "revert." Counter-weight + calibrated verdict mandatory.
- Feeding subagent whole conversation. Scope to diff + goal, nothing more.
- Implementing the revision while running skill. Review, verdict, stop.
- Generic caveats fitting any change ("weigh the tradeoffs", "consider maintainability").
