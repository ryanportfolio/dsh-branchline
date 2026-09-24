---
name: "dare"
description: "Use for $dare, first principles, or questioning the problem: four fresh stages decompose, audit, recombine and test, preserving immutable goals and constraints."
---

# dare: first-principles chain with fresh-context steps

D.A.R.E. = Decompose, Audit, Recombine, Experiment. One problem, four steps, each run in a fresh agent that receives the prior step's artifact plus an immutable goal and constraints contract, never the conversation. Fresh context is the mechanism: an auditor that saw the decomposer's reasoning defends it, and an architect given prior solution narratives can inherit the standard playbook. Isolation must not erase the user's acceptance conditions.

## When to use, when not

- Use for problems where the inherited approach may itself be the problem: strategy calls, architecture choices, "we've always done it this way" processes, stuck problems where variations on the standard answer keep failing.
- Skip for well-specified build tasks (`$writing-plans`), open design exploration (`$brainstorming`), or challenging a single recommendation (`$why`). Never auto-fire on an ordinary task.

## Orchestration

The main session is orchestrator only: it holds the user gates, passes artifacts, and never performs a step itself. Each step is one fresh agent spawned through the currently exposed multi-agent tools with `fork_turns: "none"` and a self-contained brief. Inspect actual tool exposure first; config flags are not proof. Honor explicit user model choices and required floors, otherwise inherit the configured model.

If fresh context or a required model is unavailable, report the gap. Do not silently substitute a model, run a step in the main thread, or claim the isolated chain completed.

Artifacts are plain markdown passed verbatim inside the dispatch brief.

Before dispatch, save `contract.md`: the user's goal, constraints, authorization, acceptance conditions, and version. Pass it verbatim to every stage alongside that stage's specified input. Only explicit user changes may amend it, with earlier versions retained. It contains no preferred solution, agent assessment, or narrative.

Artifact chain: problem statement, decomposition tree, audit table, surviving blocks, solution set, test plan. Each artifact targets one page; depth beyond that is available on request, not passed by default. Persist every artifact to `.tmp/dare/<problem-slug>/` as it is produced, so the chain is inspectable and any step can be rerun against its exact input.

### D: Decompose

Input: the immutable contract and the user's problem statement, verbatim.

Dispatch instructions: decomposition only; advice, solutions, assumptions, and standard playbooks are out of scope and count against you. First check whether the stated problem hides a deeper objective; if so, name it in one sentence and stop there. Otherwise break the problem into its smallest useful parts: a clear hierarchy (problem, major components, elements inside each), using only dimensions that matter here (people, process steps, time, resources, costs). For each component: what it contains and how it connects upward. Stop splitting when each part can be examined on its own for hidden assumptions; that is what the parts are for. Mark every point where a choice will eventually be required (a smoothing approach, a data store, a boundary) as an open decision, without naming a winner: flagged decision points are the map's most valuable annotations. Temporal and process structure count as decomposition when the problem contains them (steps and their ordering as they exist); a prescribed action order is a plan and out of scope. No choosing, no evaluation, no fact-versus-assumption labels, no recommendations.

Gate: if a deeper problem surfaced, ask the user directly, as a plain numbered question or through the current input tool, which problem to decompose, and do not continue until they choose. Never silently reframe. Rerun D on the chosen problem if it changed.

### A: Audit

Input: the immutable contract, the decomposition tree, and a verification-sources appendix the orchestrator assembles: file paths, URLs, and command names where evidence lives, listed bare with zero interpretation. Not the conversation, not D's reasoning. Without the appendix a fresh auditor cannot check anything and every classification degrades to guesswork.

Dispatch instructions: skeptical red team; every "obvious" block may be hiding a convention until evidence says otherwise. Produce a numbered list of the assumptions hiding in the blocks, ordered most load-bearing first. For each: name it; classify it fact, convention, or unknown from available evidence, verifying with tools where the repo or the web can actually settle it; state what breaks or opens up if it is eliminated; state what changes if it is inverted.

Gate: show the table. The user may reclassify entries before R; record their overrides as theirs. Running unattended: proceed with A's classifications and mark the table un-reviewed in the final report.

### R: Recombine

Input: the immutable contract and the surviving blocks (facts plus anything the user kept). Deliberately excluded: the original problem wording, the audit's reasoning, and any statement of how this is normally solved.

Dispatch instructions: assemble as many solutions as the blocks honestly support: structurally distinct configurations, not detail variants. One is a legal count; so is five. Never pad toward a quota or trim a genuinely distinct shape to hit one. For each: which blocks it uses, which discarded convention it refuses to obey, its single biggest point of failure. Label any new block as a new assumption. Escape hatch, a legal and complete output: if the blocks only assemble into the conventional shape, say so; "the standard answer stands, and the audit shows its assumptions are facts" is a finding, not a failure.

### E: Experiment

Input: the immutable contract and the solutions (or the standing conventional answer).

Dispatch instructions: for each solution, the smallest concrete real-world test: what to do, build, or ask, spending the least time, money, effort, and social risk the problem allows. Prefer a test that discriminates between two or more solutions over separate per-solution tests; evidence per unit cost is the metric. For each test: the result that rules the solution out, the result that keeps it alive, and what is learned about the problem either way. If every test would fail, name the building block to revisit first.

Handoff: tests runnable within existing authorization execute through the `$fable-mode` verification step (claim classified, evidence at its layer, VERIFIED / NOT VERIFIED / INCONCLUSIVE verdict). A causal or change claim needs a valid comparison; a current-state claim does not require a historical baseline. External actions or additional costs outside that authority remain proposed tests. Invoking dare does not authorize commit, push, PR, merge, deploy, dependency installation, or another outward action.

## Output

The orchestrator ends with one consolidated report: the chosen problem, the audit table, the solutions with their failure points, the test plan, and the single next action. No step's agent addresses the user directly.

When the downstream goal is a build plan, the decomposition tree and audit table hand off to `$writing-plans` as its inputs, the same way E's runnable tests hand off to `$fable-mode` verification: dare interrogates the map, writing-plans commits to mechanisms, order, and gates.

## Boundaries

- Steps never share context. A dispatch gets the specified artifact, the immutable contract, and the explicitly allowed evidence appendix; no other conversation or earlier assessments. Check every final solution and test against the unchanged goal and constraints.
- The orchestrator never folds its own opinion into an artifact between steps; changes happen at the gates, made by the user and labeled as theirs.
