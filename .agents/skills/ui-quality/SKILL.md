---
name: ui-quality
description: "UI quality floor (forms, dashboards, settings): build every state; audit by measuring the page (axe-core, focus, reflow, contrast). Use: 'audit accessibility', 'is this UI production-ready', 'check this page on mobile', 'feels wrong on my phone', 'break this UI' with worst-case data. Ambitious look → showpiece; conversion → conversion-ux."
---

# UI quality

Build or audit screens people can see, read, reach and operate: forms, dashboards, settings, tables and app screens. Use the project's design system. Visual direction belongs to `showpiece` or `frontend-design`; conversion decisions belong to `conversion-ux`.

## Start here

Use the request accompanying $ui-quality as the target. Both Claude Code and Codex follow the same steps:

1. Read the repository instructions. Identify the requested screen, its main user task, and whether you may change it. A public site you do not own is read-only.
2. Choose the route below. Read only that route first.

| Request | Read next | Finish with |
|---|---|---|
| Build or change a UI | [build.md](references/build.md), in order | Implemented states, saved design decisions, then a quick audit |
| Audit, accessibility review, mobile check, production readiness | [audit.md](references/audit.md), in order | Verified findings and explicit coverage gaps |
| Check after a build or a narrow fix | [audit.md](references/audit.md), quick depth | Evidence for the changed screen and states |
| Make a web app behave on a phone: sticky hover, tap flash, input zoom, notch, `100vh`, carousel or sheet gestures | [mobile.md](references/mobile.md) | Fixes applied, a quick audit of the changed screen per [audit.md](references/audit.md), and which fixes need a real phone to confirm |
| Break a component with worst-case data, stress-test, edge cases | [worst-case.md](references/worst-case.md), in order | A dev-only data toggle and a break report; fixes only when the owner names them or the request asked for them |

[rules.md](references/rules.md) is a lookup table. During a build, read the groups relevant to the components. During an audit, use the rule IDs in the audit guide to look up the source for each finding. You do not need to read the probe's implementation to run it.

## Evidence rules

- A finding needs evidence, labelled Probe (a row in this run's output), Measured by hand, Observed, or From code, with its location. Report the user's difficulty and a concrete fix.
- Probe rows are candidates. Verify them before presenting them as defects. A clean run establishes only that the checks found nothing in the tested state; it never establishes WCAG compliance.
- Keep unverified candidates and checks you could not perform separate from confirmed findings. Include failures to start the probe or reach a state in coverage gaps.
- Use WCAG sources only for what their criterion requires. Label craft, platform and AAA advice separately. The probe's `fail`, `review` and `advisory` labels are not owner-facing priorities.
- Follow repository constraints and existing design decisions. Detect the stack from manifests before choosing implementation techniques. Report conflicting project decisions rather than silently replacing them.

The probe uses headed Chrome, offscreen at `-2400,-2400` and muted. It uses the repository's `launchPlacedChrome()` when available; it never uses headless or minimized Chrome. Audit setup, commands, output interpretation and cleanup are all in [audit.md](references/audit.md).
