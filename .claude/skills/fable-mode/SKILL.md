---
name: fable-mode
description: "Hard multi-step work, uncertain diagnoses, repeated failures, 'did it work/is it fixed/prove it', or tasks needing careful verification + handoff. Skip routine changes."
---

# Evidence-led execution

Scope outcome → investigate unknowns that matter → challenge proposed answer → verify at claimed layer → report what evidence establishes. Runs inside current task: no separate doc, agent, or ceremony.

This method does not authorize delegation, publication, installation, or unrelated edits. Follow current scope and authorization, and keep technical artifacts in normal prose and code.

## Scope and investigate

- Read applicable instructions, relevant project facts. Define output, how completion gets established.
- Separate observed facts from assumptions that could change solution.
- Defect that once worked → find what changed since last known-good state (commit, dependency, config, input) before hypothesising about code. No known-good state → say so, reproduce first.
- Observable fact → cheapest useful probe before asking user.
- Missing preference or consequential decision → ask when needed; continue work either answer would preserve. Do not repeat approval already given within its scope.
- Lightweight plan when dependencies warrant. Thin working path before scaling unproven approach. Result contradicts plan → keep goal, update steps.

## Challenge

- Explain existing design's purpose before changing it.
- Seek concrete inputs or conditions that refute proposed change; exercise where useful.
- Hypothesis ruled out only when refuting probe is named.
- Two fixes in a row fail on same failure → stop. Name in one sentence the assumption both share, test it before a third; build that fix on what is ruled out and what is true. Never switch to a weaker check to get a pass.
- Finding no defect is valid.

## Verify

Classify claim before collecting evidence:

| Claim | Evidence needed |
|---|---|
| Current state ("it works") | Output observed against criterion; no baseline |
| Change ("it fixed X", "it is faster") | Reproducible before measurement, exactly the same steps after |
| Cause ("X did it") | Change evidence, plus X isolated by revert and reapply or controlled change; before/after gap alone shows change only |

- Change or cause claim ahead → measure before first edit. Missed → check out pre-change commit or rebuild old failing repro.
- Verify at claim's layer: command success, generated content, visible behavior, performance, live integration need different evidence. Passing low-level check does not establish behavior above it. Visual observation counts without textual output.
- Rendered evidence → first confirm page serves current build.
- Reopen outputs, inspect relevant edge cases, check original acceptance criteria.
- Consequential claim → keep exact commands, exit codes, artifact paths, or screenshots.
- Checks fit the change. Check you wrote or never saw fail → run once on the failure it guards against (missing or empty output; planted bad case for a check that looks for something absent), watch it fail. No tests that merely restate implementation.
- Required checks pass → broaden or repeat only after relevant changes, failures, or unresolved concerns; else continue toward completion.
- Do not mark unavailable required checks passed or discard them to claim completion.
- Blocker → finish independent authorized work meanwhile.
- Relevant source changed → revalidate evidence. Evidence refutes fix's premise → remove speculative fix.

## Report and hand off

- Result first, then evidence needed to assess it.
- "Did it work" → VERIFIED, NOT VERIFIED, or INCONCLUSIVE, one per material claim. Several items → count ("2 of 12 fixed"), rest listed open.
- VERIFIED: valid evidence (valid check or direct observation) establishes claim.
- NOT VERIFIED: valid evidence (valid check, direct observation, or report) contradicts claim, including required output a valid check found missing or empty. State plainly.
- INCONCLUSIVE: no valid evidence establishes or refutes claim (checks unavailable, stale, or one you wrote or never saw fail that has not yet failed on its must-reject case; nothing observed either way; or run-to-run variation unmeasured on a noisy check, or too wide to decide claim). Never a failure; name what would decide it.
- No before measurement, before-state cannot be rebuilt → split: current state judged on its own evidence ("works now" can still be VERIFIED); change or cause ("the patch fixed it") INCONCLUSIVE unless valid current evidence contradicts it (still fails → NOT VERIFIED).
- Defect fix names tier: mitigation, root cause, or prevention.
- Summarize routine checks; link detailed evidence when useful. Name material uncertainty, unfinished requirements.
- Labels or checklists only when they aid clarity; no empty assumptions section, no verbatim copy of another skill's workflow.
- Long work → persist decisions, next actions before context boundary.
