---
name: brainstorming
description: Use when brainstorming or designing a product, interface, workflow, architecture, or behavior change with unresolved goals or material tradeoffs; not for routine or fully specified work.
---

# Brainstorming

Resolve only the decisions that materially affect implementation. Match discovery depth to uncertainty and risk; do not turn clear work into ceremony.

When deciding whether repeated operations need a shared boundary, read
[selective shared-code refactoring](references/shared-code-refactoring.md).

## Choose the lane

| Situation | Lane | Required outcome |
|---|---|---|
| Request is precise, routine, or already designed | Skip | State any important assumption, then continue with the requested work |
| One or two material choices remain, but scope is small | Quick alignment | Inspect context, recommend a direction, resolve the choice, then continue |
| Goals are ambiguous, alternatives differ materially, or failure is costly | Full design | Clarify, compare viable approaches, present a coherent design, and get approval |

Examples:

- Skip: copy changes, small bug fixes, mechanical refactors, implementing an approved spec.
- Quick alignment: a small feature with one unresolved UX or API choice.
- Full design: new workflows, cross-cutting architecture, security-sensitive behavior, major redesigns, or multi-system features.

If uncertain between lanes, use the lighter lane until a material unknown appears. A user saying “proceed” approves already-presented direction; do not ask again without a new decision.

## Inspect before asking

Read the smallest useful set of project instructions, product/design documents, representative code, tests, and recent changes. Prefer discovering facts from the repository over asking the user.

For an assumption that could change the recommendation, use a cheap, authorized check when available; otherwise state the uncertainty.

Before discussion, identify:

- desired outcome and success signal;
- relevant existing patterns and constraints;
- decisions already settled by repository truth;
- unknowns that could change behavior, scope, safety, or architecture.

If the request contains multiple independent systems, propose a decomposition and sequence before designing the first slice.

## Quick alignment

1. Summarize the goal and any consequential assumption in a few sentences.
2. Ask at most one focused question when the answer cannot be discovered and materially changes the result.
3. Recommend one direction. Mention an alternative only when the tradeoff is real.
4. Request approval only if the choice changes user-visible behavior, scope, architecture, security, data handling, or another costly-to-reverse decision.
5. Once resolved, continue with the user’s requested implementation or planning workflow.

Do not create a design document for quick alignment unless the user requests one or repository rules require it.

## Full design

### Clarify

Ask one to three tightly related questions per turn. Prefer concise choices when they make the decision easier, but allow open answers. Focus on goals, users, constraints, non-goals, success criteria, and high-risk edge cases.

### Compare

Present two or three genuinely distinct approaches when multiple viable directions exist. Lead with the recommendation and explain decisive tradeoffs. Do not invent weak alternatives to satisfy a quota.

### Design

Present one coherent design, scaled to the task. Cover only relevant dimensions:

- user flow and product behavior;
- boundaries, interfaces, data flow, and state;
- failure, empty, loading, recovery, and migration behavior;
- security, privacy, accessibility, and destructive-action contracts;
- verification and rollout.

Preserve existing patterns unless changing them is necessary for the goal. Include targeted cleanup only where it reduces risk in the touched area.

Use one approval gate for the complete material direction. Split approval by section only when sections are independently consequential or the user asks for incremental review.

## Design artifacts

Write a spec when the work is cross-cutting, high-risk, multi-step, likely to be handed off, or explicitly requested. Use the repository’s required location; otherwise use `docs/specs/YYYY-MM-DD-<topic>-design.md`.

Before handoff, scan for placeholders, contradictions, ambiguous requirements, scope creep, and requirements without verification. Fix them inline.

Never commit, push, publish, deploy, or mutate external state merely because brainstorming produced a document. Follow current authorization and repository rules.

## Visual companion

For a question whose answer depends on seeing layout, hierarchy, flow, or visual direction, offer a visual companion once when an exposed browser workflow can support it. Explain that it is optional and may cost more time/context. Obtain consent before opening a local URL or launching a helper.

If accepted, read [visual-companion.md](visual-companion.md) completely and use it only for questions materially improved by visuals. If declined or unavailable, continue in text. Do not force a separate consent turn for non-visual work.

## Handoff

After alignment or approval:

- implement when the user requested implementation and the work is now clear;
- create an implementation plan when complexity or repository policy warrants it;
- invoke a planning skill only when it is enabled and applicable;
- stop after design when the user requested design only.

Do not force every brainstorm through a spec, commit, planning skill, or implementation workflow.

## Hard rules

- Repository truth beats invented requirements.
- Resolve material ambiguity before implementation; tolerate harmless uncertainty.
- Keep questions decision-bearing and minimize user pauses.
- YAGNI: exclude unrequested features and unrelated refactors.
- Never weaken security, privacy, accessibility, evidence, or data-loss contracts for convenience.
- Do not treat a routine change as a product redesign.
