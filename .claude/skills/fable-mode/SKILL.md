---
name: fable-mode
description: "Use for difficult multi-step work, uncertain diagnoses, repeated failures, 'did it work/is it fixed/prove it' questions, or tasks where verification and handoff need particular care. Skip routine changes."
---

# Evidence-led execution

Scope the outcome, investigate the important unknowns, challenge the proposed answer,
verify at the claimed layer, and report what the evidence establishes. Apply this discipline
inside the current task; it does not require a separate document, agent, or ceremony.

## Scope and investigate

Read the applicable Claude instructions and relevant project facts. Define the output and
how completion will be established. Separate observed facts from assumptions that could
change the solution. For a defect that once worked, establish what changed since (a commit,
a dependency, a config, an input) before hypothesising about the code; with no known working
state, say so and reproduce first. Run the cheapest useful probe before asking the user for
an observable fact. Ask for missing preferences or consequential decisions when needed; continue work
that either answer would preserve. Do not repeat approval already given within its scope.

Use a lightweight plan when dependencies warrant one. Build a thin working path before
scaling an unproven approach. A result can change the plan; preserve the goal and update
the steps instead of continuing through contradicted assumptions.

## Challenge and verify

Explain the purpose of the existing design before changing it. Look for concrete inputs or
conditions that refute the proposed change and exercise them where useful. A hypothesis is
ruled out only when the probe that refuted it is named. After two failed fixes, revisit the
diagnosis from what was ruled out rather than repeating the same patch. Finding no defect
is valid.

Classify a claim before collecting evidence. Current state ("it works") needs the output
observed against the criterion, with no baseline. Change ("it fixed X", "it is faster")
needs a before measurement that can be reproduced: check out the commit from before the
change or rebuild the old failing repro, and run exactly the same steps both times. Cause
("X did it") also needs X isolated by reverting and reapplying it or by a controlled
change; a before/after gap alone shows change only. Verify at the layer of the claim:
command success, generated content, visible behavior, performance, and live integration
require different evidence. Rendered evidence first confirms the page serves the current
build. Reopen outputs, inspect relevant edge cases, and check the original
acceptance criteria. Preserve exact commands, exit codes, artifact paths, or screenshots
when they support a consequential claim. A visual observation can be evidence without
textual output; a passing low-level check does not establish the behavior above it.

Use checks appropriate to the change. Avoid tests that merely restate implementation.
Once required checks pass, broaden or repeat them only after relevant changes, failures,
or unresolved concerns justify more verification; otherwise continue toward completion.
Do not mark unavailable required checks passed or discard them to claim completion.
Complete independent authorized work while resolving a blocker. Revalidate evidence after
relevant source changes; remove speculative fixes when evidence refutes their premise.

## Report and hand off

Lead with the result, then the evidence needed to assess it. Answer "did it work" with
VERIFIED, NOT VERIFIED, or INCONCLUSIVE; for several items, give the count ("2 of 12 fixed")
and list the rest as open. Contradicting evidence is NOT VERIFIED, stated plainly. Absent
evidence is INCONCLUSIVE, never a failure; name what would decide it. A defect fix names its tier: mitigation, root cause, or prevention. Summarize
routine checks; link detailed evidence when useful. Name material uncertainty and
unfinished requirements.
Use labels or checklists only when they improve clarity; no empty assumptions section or
verbatim copy of another skill's workflow is required.

For long work, persist decisions and next actions before a context boundary. This method
does not authorize delegation, publication, installation, or unrelated edits. Follow
current scope and authorization, and keep technical artifacts in normal prose and code.
