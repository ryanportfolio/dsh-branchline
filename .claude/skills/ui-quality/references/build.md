# Build mode

Follow these steps for a new screen or a change to an existing one. Preserve behavior outside the requested scope.

## 1. Read existing decisions

Read repository instructions, the relevant manifests, existing components and design tokens, then `design/system.md` and `design/pages/<page>.md` if present. The page file overrides the system file for that page only. If the repository uses another location for design decisions, use it. Read its own UI skill when one is supplied. Report conflicts between those sources.

Detect the stack from manifests such as `package.json`, `pubspec.yaml`, `Package.swift`, `build.gradle`, `composer.json` or `Gemfile`. Reuse the project's controls and tokens. Do not install a UI library or change the stack to follow this skill.

## 2. Save only missing decisions

Create or update `design/system.md` for shared decisions and `design/pages/<page>.md` for exceptions. Point to token files instead of copying values. A short record can use this format:

```markdown
# Design decisions

Applies to: account screens
Existing components and tokens: <paths>
Density and text: <chosen scale and reason>
Colour roles and themes: <token references; themes shipped>
Focus and targets: <component or CSS reference>
Motion and reduced motion: <behavior, duration tokens>
Widths to verify: <product breakpoints plus 320 and 375 CSS px>
Page exceptions: <links, or none>
```

Use the See, Read, Reach and Motion groups in [rules.md](rules.md) for these decisions. Choose values from the existing system. If none exists, distinguish minimum requirements from chosen defaults: 24 CSS px target size with WCAG exceptions is AA; 44 CSS px touch targets and a 2 px, 3:1 focus marker are stronger targets. Body text of 16 px on phones is craft advice, not a WCAG minimum. Measure text and control contrast in each shipped theme.

## 3. Inventory states before markup

For each affected component or screen, record the applicable states below. For each, state what the user sees, what they can do and how you will reach it for verification. Mark inapplicable states with a reason rather than implementing speculative features.

| State | What to design and verify |
|---|---|
| Default | Realistic content and the main user task |
| Empty | First use, no search results, or content cleared by the user; a useful next action |
| Loading | Layout space held, progress for a noticeable wait, cancel or leave for long operations |
| Partial | Some data present while another part loads or fails |
| Error | Validation, network, not found, no permission, server error; recovery and input retained |
| Success | What changed and undo if supported |
| Disabled or read-only | Why an action is unavailable and how to make it available |
| Offline or slow | What still works and what will retry |
| Identity and roles | Signed out and supported permission levels |
| Content extremes | Long names, unbroken strings, large numbers, one or many rows, supported translations and right-to-left text; build the worst-case fixture and toggle in [worst-case.md](worst-case.md) |

Keep the inventory with the task or page decisions. An inaccessible fixture or missing account is a verification gap, not a tested state.

## 4. Build with the relevant rules

- Use native elements and existing components. Read Reach and Operate in [rules.md](rules.md) for keyboard behavior, names and state. Custom controls need equivalent semantics and keyboard operation.
- Forms need visible associated labels, hints, suitable `autocomplete`, usable validation and input preserved after failure. Keep paste and password managers available. Read OP1 through OP6 and OP14.
- Read Read and Stability for responsive content, text resizing and space reserved for late data. Choose pagination or virtualization only when the actual content and performance need it; preserve keyboard and screen reader access.
- Read Motion when anything animates. Implement the reduced-motion behavior and keep the resulting content available. For the motion itself (easing, duration, press feedback, popovers, gestures, jank), read the `motion-design` skill's `references/ui-components.md` when that skill is installed.
- When the screen targets phones, start from the baseline in [mobile.md](mobile.md) and gate every hover style behind `(hover: hover) and (pointer: fine)`.

Update saved decisions when implementation changes them. Use audience-appropriate prose for labels, errors and empty states; use the Writing skill if available.

## 5. Audit the result

Follow [audit.md](audit.md) at quick depth. Run the probe for each distinct URL-addressable state in the inventory. Exercise other changed states manually where authorized. Verify and fix confirmed failures in scope, then recheck the affected behavior. Record unresolved items, inaccessible states and unavailable checks. Do not call an untested state complete.
