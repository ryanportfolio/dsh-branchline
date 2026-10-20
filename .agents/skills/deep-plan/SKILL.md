---
name: "deep-plan"
description: "Use for $deep-plan: interview a loose idea in short rounds of decisions and stop for an explicit go before anything is built."
---

# deep-plan: interview a loose idea into decisions the user made

## Purpose and boundaries

- Turn a loose idea on any subject (code, product, process, writing, a personal plan) into decisions the user made. Decisions belong to the user; facts are your job. Never answer a decision for the user.
- Work with or without a repo. Probe files, git or code only when a repo is present.
- Build, draft or edit nothing except the ledger until the user picks Go at the gate. After Go, only hand off; do not implement. Leave plan mode off.
- Write every question, option, recap line and the gate in plain prose, even when session replies are compressed. Explain a term the user may not know in one or two plain sentences before the choice.

## Round 0: scope

1. Look for a ledger with `Status: open` under `.tmp/deep-plan/*/ledger.md`. If one exists and its `Updated` time is within the last 30 minutes, another session may still be running it: tell the user, and resume only after they confirm that session has stopped. Otherwise the first question offers "a) Resume <slug> (Recommended)" and "b) Start new". On resume: re-read the ledger, rebuild the frontier from statuses and depends-on edges, show a short recap, ask "Has anything changed since we stopped?" in the same popup, and continue from Next ID.
2. Otherwise propose, in one popup: a one-sentence destination, the out-of-scope list (never asked about later), and the slug. Slug: kebab-case from the destination sentence, at most about 5 words; the user accepts it or renames it through Other. If `.tmp/deep-plan/<slug>/` already exists, append `-2` (then `-3`).
3. If the idea holds several independent branches too big for one session, propose a split and ask which piece to plan now. A large piece can go to `$long-horizon` later.
4. Goal and scope are settled by the user, never assumed. Round 0 starts at Q1; IDs never reset.

## Ledger

Path: `.tmp/deep-plan/<slug>/ledger.md` from the working directory root (`.tmp/` is gitignored). Write it whenever a working directory exists.

```markdown
# <slug>
Destination: <one sentence>
Out of scope: <list>
Status: open | Round: <n> | Next ID: Q<n> | Pace: <questions per round> | Updated: <ISO time>

| ID | Title | Status | Answer (user's words) | Depends on | Rejected options | Round |

Notes:
- <fact> (source: <file path or command>); affects Q<n>
```

Statuses: `open`, `settled`, `assumed`, `unknown`, `parked`, `reopened`, `void`. Assumptions and parked items are rows too, so there is one ID sequence. At close, append the mechanism paragraph, the reversal answers and the handoff block.

Write it after round 0, after each round's answers are classified and before the next popup, on a premise change, at the gate, and on Go (`Status: closed`). Every write sets `Updated`. Re-read it before every round and after any compaction. Never re-ask a settled ID unless the user reopens it.

If a write fails, say so once and continue chat-only; never claim a ledger you did not write. With no working directory or no write permission, the echo lines and the recap are the record; to resume, the user pastes the recap back.

## Building a round

- Frontier: `open` or `reopened` nodes whose depends-on nodes are all settled or assumed. The frontier table lives in the ledger only; do not show it.
- Rework filter: ask only where a wrong guess forces rework. Turn a low-stakes node into an assumption with its own ID and status `assumed`. Never assume goal or scope.
- Drop from the round any question whose answer could change another question in the same round.
- Cap: at most 4 questions per round, the ones with the highest rework cost; the rest wait for the next round. If the user asks for fewer per round, use that cap and record it as Pace.
- Fact lookups: run the cheapest probe first (read a file, grep); use exposed multi-agent tools only for a slow lookup, otherwise run it on the main thread. Ask now the questions that do not depend on a pending lookup; hold the rest.

## Asking a round

1. Chat preface, a few lines at most: this round's assumptions ("Assumed unless you object: Q9 (log format): plain text"), any fact notes, and this line: "Pick Other to override, ask for an explanation, say you don't know, or change a premise."
2. One call to the session's question popup (the current input tool) with 1-4 questions. If that popup's limits are smaller than these, follow the smaller limit:
   - Header `Q<n> <topic>`, 12 characters or fewer, for example `Q12 Storage`. IDs continue across rounds.
   - Question text is self-contained plain prose, with background first for an unfamiliar term.
   - 2-4 options labelled `a) ...`, `b) ...`. The recommendation comes first, its label ends "(Recommended)", and it answers the question as worded. Word a yes/no question so Yes is the recommendation.
   - Use multi-select only for a genuine pick-all-that-apply decision.
3. With no popup exposed, or one the current mode will not let you call (some Codex builds allow the input tool only in Plan mode), ask in chat with the same cap and IDs. The same fallback covers round 0 and the gate:

```text
❓ **Q<n>** - **<title>**: <question>
a) <option>
b) <option>
➡️ <recommendation, answering the question as worded>
---
```

Self-check before sending: header length, recommendation first, no question in the round depends on another.

## Handling answers

Answers arrive as option labels or Other text. Classify each one and echo one line per question, for example `Q4 -> override: Postgres`.

- Accept or override: settled. Record overrides in the user's words, verbatim. Only the user's words or an explicit accept settle a decision; never record your recommendation as the answer.
- Explain request: answer it and keep the question open for the next round; do not re-issue the whole round.
- I don't know: if a fact settles it, look the fact up; otherwise give a short explainer and re-ask once; if it is ungrillable, park it. Failing all three, mark it `unknown`, note what it blocks, and continue on branches either answer keeps.
- Ungrillable: a look, feel or layout question, or one reworded twice without settling. Mark it `parked`, name the route, and keep the rest of the frontier moving. Hand the user the command instead of running it: `$lab` to tune an existing element, `$arena` for a structural choice that needs real builds, `$dare` for a suspect framing, `design-prototypes` for visual concepts. Name only routes that are among this session's available skills; with none, suggest a throwaway sketch the user makes. The user comes back with a one-line verdict.
- Premise change: walk depends-on edges from the changed node, mark its descendants `void`, show "Dropped because Q3 changed: Q9 (cache), Q12 (storage)", and recompute the frontier. "Reopen Qx" reopens that question and its descendants.
- Defer, or no answer: carry it to the next round.
- A shown question is locked. A returned lookup never advances a round: it lands as a ledger note and can only unblock questions or reopen a shown one next round. Only a user reply ends a round.

## Stop and gate

1. Stop when the frontier is empty and you can write a short paragraph a newcomer could follow on how the result works. If you cannot, the gap becomes a new question and rounds continue.
2. Recap in chat, numbered by ID: each decision, in the user's own words where they overrode, then assumptions, unknowns and parked items. An objection to an assumption reopens it.
3. Pick the 1-3 weightiest decisions. Run `$why` on each and show one line on what the check changed; if no independent agent is exposed, say the check did not run as designed. This is the only `$why` check in deep-plan, never inside rounds. Then ask once in chat, free text: "If this decision were reversed, what would go wrong?" Record the answers; a real gap they expose becomes a new question.
4. Gate popup, one call with two questions: `Q<n> Go` with "a) Go (Recommended)" and "b) Not yet: reopen something", and `Q<n+1> Handoff` with "a) writing-plans (Recommended)", "b) long-horizon contract", "c) enhance-prompt", "d) None"; offer only the skills available in this session, and always keep None. If None is the only handoff left, drop the Handoff question: the gate popup asks Go alone and the handoff is None. Not yet ignores the handoff answer and returns to rounds. Go must be this explicit pick, never inferred from a round answer.

## Handoff

On Go, set `Status: closed` and render the ledger into a handoff block: Goal, Non-goals, Decisions (ID, choice, rejected options and why), Assumptions, Unknowns, Parked. Follow `$writing-plans` or `$enhance-prompt` with the block. For long-horizon, print the block shaped as its Contract and Acceptance sections and hand the user the `$long-horizon` command; do not start it, since it executes. For None, or if the chosen skill turns out to be unavailable, print the block. The receiving skill maps every decision ID to a step or N/A and does not reopen settled decisions.

## Pitfalls

- No async memo, no quick or full modes, no long per-question template, no glossary or ADR output.
- Never answer a decision yourself or treat silence as acceptance.
- Never reset or reuse an ID.
- Never build, draft or edit anything but the ledger before Go.
