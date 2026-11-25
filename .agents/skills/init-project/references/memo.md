# Project memo

Six questions settle what the project is before config gets written. Repo answers first, user second.

1. What is it?
2. Who is it for?
3. What is it not?
4. What does done look like?
5. What's the smallest version that proves it?
6. What features do you want in it that aren't built yet?

## Answer from the repo first

Read-only sources: README, manifest `description`, the project's own `docs/` (not files copied from the template), a filled `What this project is` section, routes, commands, entry points. Draft one answer per question, with its source.

- Section already filled and still matching the code → reuse it; ask nothing it answers. Never rewrite a filled section unless the user asked for that; a plan request that creates a brief still adds the `First build` line to it.
- Existing code usually answers 1 and 2. 3, 4, 5 and 6 are intent and seldom in code → ask, unless a doc states them. Built features never count as answers to 6.
- Empty or new repo → ask all six.

Never invent an answer. Every drafted answer is a draft, whatever its source: show it to the user marked as inferred, and write it only after they confirm or correct it.

## Ask

One round: inferred drafts to confirm + open questions, together with the other setup questions (profile, prose mode, deploy). Use the six questions as worded above, plus one optional: anything it must never compromise on? One line per answer is enough.

At most one follow-up round, only where an answer can't steer work:

- 2 names a crowd ("everyone", "developers") → ask for one specific role who would use it first.
- 3 empty or "nothing" → offer 2-3 likely non-goals drawn from answers 1 and 2 (no accounts, no mobile app, single user) to accept or strike. Include parts an existing service or library should cover in place of new code (payments, sign-in, email).
- 4 not checkable ("works well") → ask for the few things it must do every time, each something the user could open, click or run to check.
- 5 as big as 6 → ask for the smallest thing to run or show that proves the idea can work if the rest never ships (a throwaway test counts). Smallest version answers "can this be done?", not "is this ready for users?".
- Feature priority order, or which done checks and features belong in the smallest version, not given → ask. Still not given → write them as unknown in the brief; never guess an order or an assignment.

An answer the follow-up still couldn't make usable (done still not checkable, say) counts as unanswered. User skips a question → leave it unknown, list it in the report, continue setup. A skipped question never blocks the other setup steps.

## Where answers go

| Question | Lands in |
|---|---|
| 1 what, 2 who, 3 not, 4 done, never compromise | `CLAUDE.md` → `What this project is`, replacing its FILL IN marker |
| 5 smallest version, 6 wanted features | `docs/specs/YYYY-MM-DD-project-brief.md` |

`What this project is` loads every turn and Codex reads it too. Cap ~10 lines, normal prose:

```markdown
<What it is and who it is for, in one or two sentences.>

- Not: <what it will not do or become>
- Done: <the result someone can check>
- Won't compromise on: <short list, only when the user named some>
- First build: `docs/specs/<date>-project-brief.md` (delete this line when nothing in the brief is left to build)
```

- Any of 1-4 unanswered → write the confirmed lines and keep one `<!-- FILL IN (via /init-project): <missing items> -->` line naming only what is missing. `doctor.mjs` keeps warning and the next setup run asks only for those.
- Never-compromise line and glossary of team terms: only when the user gave them and the cap still holds.

Brief: normal prose, the user's own words. Three parts:

1. Smallest version: what it contains and the one claim it proves. Already shipped → say so. Otherwise, brief still without a smallest version or claim → write `unknown: settle the claim with the user before the first build and its proof check`.
2. Done checks: answer 4 split into rows, one behavior per row as what to do and what result to expect, each marked required for the smallest version, later, or unknown. Never pad the table with rows the user didn't give. End the part with this line, verbatim, unless part 1 says the smallest version already shipped: "Before calling the smallest version done, run one check that would fail if the claim in part 1 were false (pick or define it with the user when no row does that), then check each required row by running, opening or clicking it; write a test only if the user asks."
3. Wanted features in the user's priority order (order unknown → say so and keep the order given), one line each, each marked in, out, or unknown for the smallest version. Parts the user chose to cover with an existing service or library are listed as such, with the service when named.

Don't repeat non-goals; don't add features the user didn't name.

- Brief feeds the first build session (`brainstorming`, `writing-plans`). Setup writes it and stops: answering the memo does not authorize building anything.
- Nothing left to build (smallest version shipped, no unbuilt features wanted) → no brief, no `First build` line.
- Create the brief only from answers to 5 or 6 the user gave in this run. That answer is the request for the file, also inside callers that keep `docs/specs` out of their own scope (`apply-firmware`).
- A `First build` line already points to a brief → update that file in place with any answer to 4, 5 or 6 confirmed in this run, keeping the user's edits; never start a second dated brief. A file already at the new brief's path → ask before replacing or merging it.
- `docs/specs` is a template-only path. Template cleanup removes only the template's own files there and never the brief.
- Setup never edits `.claude/reference/features.md`; `user-walk` fills it with built features.
