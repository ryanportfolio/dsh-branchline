---
name: conversion-ux
description: "Audit, design conversion flows stage by stage (arrive to exit): each element asks easier, honest question. Paywalls, pricing, trials, sign-up, onboarding, checkout, forms, filters, booking. Use: /conversion-ux, 'why doesn't this convert', 'audit this flow'. Visual concepts → redesign-concepts; copy polish → writing."
---

# Conversion UX

Every element on a screen puts a question in the user's head: is this worth 19 dollars a month, how many steps is this, what if my plans change. People act when those questions are easy to answer, and they stay when the easy answer was true. This skill finds the hard questions and replaces them with easier, honest ones.

Users decide across a run of screens, and many are lost between them: a plan forgotten at sign-in, a total that grows at payment, a "Not now" that drops them on the home page. So both modes work through the same seven stages, and check at each hand-off that the user's choices and attention carry over.

The rules come from four uxpeak videos (the question idea is from one of them), checked against the research they cite. The videos show no test data, so each rule says what it rests on: Research, Adjacent research, Presenter, Craft or Convention ([journey.md](references/journey.md) defines them).

Built for web and app screens where someone decides whether to act: buy, subscribe, sign up, book, filter, choose. For native apps, work from a simulator or screenshots. It does not replace an accessibility audit (`ui-quality` does that); it checks only that every user can reach the action.

## Stages

| Stage | The user is asking | Load |
|---|---|---|
| 1. Arrive | Is this what I came for, and what do I do here? | [stages/1-arrive.md](references/stages/1-arrive.md) |
| 2. Understand | What is it, what does it cost, what does paying add, can I trust it? | [stages/2-understand.md](references/stages/2-understand.md) |
| 3. Choose | Which plan, option, quantity or filter? | [stages/3-choose.md](references/stages/3-choose.md) |
| 4. Commit | What happens when I press this, and for how much? | [stages/4-commit.md](references/stages/4-commit.md) |
| 5. Gate | Why do you need an account or consent, and will I lose my place? | [stages/5-gate.md](references/stages/5-gate.md) |
| 6. Pay | Is this the price I agreed to? | [stages/6-pay.md](references/stages/6-pay.md) |
| 7. Exit | Can I say no, go back or stop without a penalty? | [stages/7-exit.md](references/stages/7-exit.md) |

Load a stage file only when the walk reaches that stage. Always loaded: [journey.md](references/journey.md) (the walk, hand-off rules, severity, evidence labels) and [honesty.md](references/honesty.md) (the sweep). Load [every-screen.md](references/every-screen.md) once for each distinct screen the walk meets.

## Modes

- **Audit** an existing page, flow, screenshot, design file or component: [audit.md](references/audit.md) sets the depth, captures the screens and gives the report format; the walk itself is in journey.md.
- **Build** a new page or flow: [build.md](references/build.md) walks the same stages forward, then audit the result.

[index.md](references/index.md) lists every rule ID with its name and file. Read [evidence.md](references/evidence.md) before citing a study in a finding. [sources.md](references/sources.md) holds the video notes; [coverage.md](references/coverage.md) maps every practice in them to a rule or the reason it was left out.

## Honesty guard

Overrides every rule and source tip, in both modes. Never recommend or build confirmshaming, urgency or scarcity that is not true, cancellation harder than sign-up, pre-ticked paid add-ons or consent, fees revealed at the last step, invented reviews, counts or reference prices, or comparisons that mix units.

Every upsell has a decline of equal weight that leaves the user where they were: "Not now" on a prompt that interrupts a task; an unobstructed way back on a page they chose to open. Loss framing is allowed only for a real loss of the user's own things, with the real date and amount. Asked for a dark pattern, name it, say what it risks (refunds, chargebacks, complaints, consumer-protection rules), and offer the honest version.

## Neighboring skills

- `redesign-concepts`: generated images of better versions of a built UI; use after an audit to show the fixes.
- `design-prototypes`: image concepts from a brief, before anything is built.
- `showpiece`: ambitious creative direction. This skill judges whether a user can decide and act, not originality.
- `ui-quality`: the accessibility and state floor, measured on the rendered page; run it on screens this skill audits or builds.
- `writing`: final polish of UI copy once this skill has decided what the copy must answer.
- When installed: `frontend-design` (visual styling), `design-brief` (a design-build prompt), `product-walkthrough` (animated product demos).

## Claude Code use

Use the request accompanying /conversion-ux, including $ARGUMENTS, as the target: a URL, a path, a screenshot or a description. Live pages are read-only unless the page owner grants more access. Render in headed Chrome, never headless, with the window offscreen and audio muted: `launchPlacedChrome()` where the repository has it, otherwise `--window-position=-2400,-2400 --mute-audio`. Save screenshots where the project's instructions put them. A subagent running the audit gets these rules, the depth from audit.md and the stage list in its brief.
