---
name: brainstorming
description: "Use when product, interface, workflow, or architecture goals have unresolved material tradeoffs. Skip routine work and implementation of an approved design."
---

# Resolve the design decisions

Match discovery to uncertainty. Clear or routine work needs no brainstorming detour.
For one or two small choices, inspect context, recommend a direction, resolve the missing
decision, and continue. Use a fuller design when competing approaches materially affect
the result or when failure would be costly.

When deciding whether repeated operations need a shared boundary, read
[selective shared-code refactoring](references/shared-code-refactoring.md).

Read the smallest useful set of project facts, existing patterns, representative code,
and constraints. Identify the intended outcome and how success would be recognized,
using existing context where possible. Separate observable facts from user-owned
preferences. Preserve already-approved direction.

Investigate facts instead of asking the user to retrieve them. For an assumption that
could change the recommendation, use a cheap, authorized check when available;
otherwise state the uncertainty.

Ask concise, related questions only for decisions that change scope, behavior, architecture,
or another important outcome. Use the current input tool when available and appropriate;
otherwise ask directly. Continue useful work that does not depend on the answer. Time spent
waiting is not an answer to a required question.

When several approaches are viable, explain their decisive tradeoffs and recommend one.
Do not manufacture alternatives to meet a quota. Present a coherent design covering only
relevant behavior, boundaries, failures, data, accessibility, verification, and rollout.
Use one decision gate for unresolved material direction; do not ask to approve each section
or reconfirm ordinary implementation details within accepted scope.

Use a native visualization or available browser workflow when seeing the design materially
helps. Reuse supported tools and current authorization instead of assuming a Claude-specific
visual helper is required. New installation, publication, or external access follows its
own permissions. Text remains sufficient when visuals are unnecessary or unavailable.

Save a design artifact when requested or needed for a substantial handoff, using project
conventions. Check it for contradictions, unsupported assumptions, and missing acceptance
criteria. Continue implementation when that was requested and the material decisions are
resolved; stop at design when design was the request. No automatic commit or publication.
