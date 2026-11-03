# Rules

Use this as a lookup table after the audit guide maps a candidate to a rule, or when building the relevant component. Groups: See (contrast and images), Read (reflow and text), Reach (keyboard and targets), Operate (semantics and forms), Motion, Stability, Integrity (the page loaded whole). Stack traps at the end apply only to the detected stack.

Each rule names its source and how it is checked. Sources: a WCAG 2.2 success criterion with its level, a platform guideline (Apple Human Interface Guidelines, Material Design), Core Web Vitals, or Craft (practice without a standard behind it; say so when citing it). "Probe" names an automated check; "Manual" needs observation or code inspection. When a row combines a requirement and craft advice, cite only the requirement the evidence demonstrates. A code inspection cannot establish runtime behavior by itself.

The probe uses `fail` for candidates associated with WCAG A or AA. Confirm the candidate before calling it a failure. Craft checks are `review`, and AAA, platform and best-practice items are `advisory`, unless the project's own instructions raise them. A check that found nothing has not shown that its criterion is met.

## See

| ID | Rule | Source | Checked by |
|---|---|---|---|
| SE1 | Body text at least 4.5:1 against what is behind it; large text (24 px, or 18.66 px bold) at least 3:1 | WCAG 1.4.3 AA | Probe `axe`, `contrast` (counts the opacity of the text and the boxes around it; not filters or blend modes) |
| SE2 | Icons that carry meaning, input borders, focus rings and control edges at least 3:1 against neighbours | WCAG 1.4.11 AA | Manual; axe covers only part |
| SE3 | Colour is never the only signal: errors, status, required fields and links in text also differ by text, icon, weight or underline | WCAG 1.4.1 A | Manual |
| SE4 | Meaningful images have a text alternative; decorative ones are hidden from assistive technology | WCAG 1.1.1 A | Probe `axe` finds missing ones; whether the text makes sense is manual |
| SE5 | Both themes are checked on their own; dark-theme values are never assumed from light | Craft | Probe `dark` |

## Read

| ID | Rule | Source | Checked by |
|---|---|---|---|
| RE1 | At 320 CSS px wide nothing needs sideways scrolling and nothing is cut off, except content that needs two dimensions (data tables, maps, code) scrolling inside its own box | WCAG 1.4.10 AA | Probe `reflow` |
| RE2 | Text survives WCAG text spacing (line height 1.5, paragraph gap 2em, letter 0.12em, word 0.16em) without being cut off | WCAG 1.4.12 AA | Probe `spacing` |
| RE3 | Text can grow to 200% without lost content or functionality; preserve zoom | WCAG 1.4.4 AA | Probe `axe` (viewport tag), `reflow` at 640 and `textscale` give candidates; verify actual browser zoom or text resize manually |
| RE4 | Body text at least 16 px on phones; lines about 45 to 75 characters on wide screens | Craft | Probe `phone:no-mobile-layout` when a phone shrinks a desktop-width layout; sizes and line length are manual |
| RE5 | Fixed heights with hidden overflow around text are a bug waiting for a longer name or language | Craft | Probe `reflow`, `spacing`, `textscale` (clipped text) |
| RE6 | The screen works in portrait and landscape unless one orientation is essential | WCAG 1.3.4 AA | Manual |
| RE7 | Text inputs, textareas and selects are at least 16 px on phones; iOS Safari zooms into smaller ones on focus and does not zoom back out | Craft (iOS Safari behaviour) | Probe `phone:input-zoom`; the zoom itself needs an iPhone |

## Reach

| ID | Rule | Source | Checked by |
|---|---|---|---|
| RC1 | Every action works by keyboard alone | WCAG 2.1.1 A | Probe `focus` for Tab reach, focusable elements Tab never reached and elements styled as clickable that Tab cannot reach; Enter, Space, Escape and arrow keys are manual |
| RC2 | Focus can always leave a component; dialogs keep focus inside while open and return it to the opener on close | WCAG 2.1.2 A, 2.4.3 A | Probe `focus` notes loops, and `keyboard:not-reached` names what a walk that cycled back skipped, which is how a trap looks; dialogs are manual |
| RC3 | Focus order follows the visual and reading order | WCAG 2.4.3 A | Probe lists the order; judging it is manual |
| RC4 | The focused element is always visibly marked | WCAG 2.4.7 AA | Probe `focus`; `focus:unmeasured` when motion around the element hides the comparison |
| RC5 | Sticky headers, cookie bars and chat widgets never cover the focused element entirely | WCAG 2.4.11 AA (2.4.12 AAA for partly) | Probe `focus` |
| RC6 | The focus marker is at least as large as a 2 px outline around the element and changes contrast by 3:1 | WCAG 2.4.13 AAA | Manual; the probe's `focus:weak` is a craft check for markers smaller than a 1 px ring, not this test |
| RC7 | Pointer targets at least 24 by 24 CSS px or spaced so a 24 px circle fits; 44 pt on Apple platforms and 48 dp on Android for touch | WCAG 2.5.8 AA; Apple HIG; Material | Probe `axe` (24 px), `phone` (44 px, scaled to what the phone shows when the page has no mobile layout) |
| RC8 | Anything done by dragging also works with a single tap or click | WCAG 2.5.7 AA | Manual |
| RC9 | Content shown on hover or focus can be dismissed with Escape, hovered itself, and stays until dismissed | WCAG 1.4.13 AA | Manual |
| RC10 | Nothing essential depends on hover; touch screens have none | Craft | Manual |
| RC11 | A skip link or landmarks let keyboard users pass repeated navigation | WCAG 2.4.1 A | Probe `axe` (landmarks, best practice); manual |
| RC12 | Hover styles sit inside `@media (hover: hover) and (pointer: fine)`; on touch a tap applies `:hover` and it stays until the next tap elsewhere | Craft | Probe `phone:ungated-hover` (same-origin stylesheets only; it accepts `(hover)`, `(hover: hover)` or `(pointer: fine)` alone, so whether both conditions are present is manual); fixes in [mobile.md](mobile.md) |
| RC13 | A tap shows the control's own press feedback at once: an `:active` style or `pointerdown` handler, no browser tap highlight over it, `touch-action: manipulation` on controls | Craft | Probe `phone:tap-highlight` for the highlight; feedback timing is manual on a phone |

## Operate and understand

| ID | Rule | Source | Checked by |
|---|---|---|---|
| OP1 | Every control has an accessible name, a role and its state (pressed, expanded, selected, checked) | WCAG 4.1.2 A | Probe `axe` for missing names; axe accepts a glyph such as "x" as a name, so whether a name says what the control does, and state changes, are manual |
| OP2 | A control's visible text is part of its accessible name | WCAG 2.5.3 A | Probe `axe` |
| OP3 | Fields have visible labels; a placeholder is not a label | WCAG 3.3.2 A | Probe `axe` for missing labels; axe accepts a placeholder as a name, so placeholder-only fields are manual |
| OP4 | Errors identify the field and describe the error; give a correction suggestion when known. Place errors by the field, retain input and use a focused summary for multiple errors as craft defaults | WCAG 3.3.1 A, 3.3.3 AA for identification and suggestions; placement, retained input and focused summary are Craft | Manual: submit the form wrong in an authorized test environment |
| OP5 | Sign-in allows password managers and paste; no puzzle or memory test without an alternative | WCAG 3.3.8 AA | Manual |
| OP6 | Information already given in the same process is filled in or selectable, not asked again | WCAG 3.3.7 A | Manual |
| OP7 | Help links and contact options keep the same order relative to other content across pages | WCAG 3.2.6 A | Manual |
| OP8 | Status changes (saved, 3 results, upload failed) are announced without moving focus | WCAG 4.1.3 AA | Manual |
| OP9 | One primary action per screen; destructive actions are distinct and confirmed or undoable | Craft; Apple HIG | Manual |
| OP10 | Disabled controls say why, or stay enabled and explain on use | Craft | Manual |
| OP11 | Labels, headings, lists and table headers shown on screen are also in the markup; a label is tied to its field | WCAG 1.3.1 A | Probe `axe` in part; manual |
| OP12 | Headings and labels describe their topic or purpose | WCAG 2.4.6 AA | Manual |
| OP13 | Moving focus or changing a field never submits, navigates or opens something unannounced | WCAG 3.2.1 A, 3.2.2 A | Probe `focus:navigated` for focus that loads another page; changes to fields are manual |
| OP14 | Fields for the user's own details (name, email, address, phone) carry `autocomplete` values | WCAG 1.3.5 AA | Manual or from code |
| OP15 | A session time limit warns first and lets the user extend it | WCAG 2.2.1 A | Manual or from code |

## Motion

| ID | Rule | Source | Checked by |
|---|---|---|---|
| MO1 | With reduced motion on, decorative and scroll-driven motion stops or becomes a fade; the final state still shows | Craft: no WCAG criterion requires honouring the setting (2.3.3 AAA covers motion caused by an interaction); large or parallax motion can cause dizziness and nausea in people with vestibular disorders | Probe `motion` (review) |
| MO2 | Anything that moves, blinks or auto-advances for more than 5 seconds beside other content can be paused, stopped or hidden; carousels stop on focus and hover | WCAG 2.2.2 A | Probe `motion` flags candidates; the control is manual |
| MO3 | Content flashes no more than three times a second, or stays below the general flash and red flash thresholds | WCAG 2.3.1 A | Dedicated analysis when flashing exists; the probe cannot establish this |
| MO4 | Durations fit the distance and size of the change. Starting values: small UI 100 to 200 ms, larger panels 200 to 400 ms, press feedback within 100 ms; adjust to the product | Craft; these timing values are choices, not WCAG requirements | Manual |

## Stability

| ID | Rule | Source | Checked by |
|---|---|---|---|
| ST1 | Layout shift under 0.1; reserve space for images, ads, banners and late data | Core Web Vitals | Probe `shift` covers load and settle only, a lower bound; shifts after that are manual |
| ST2 | Hover, press and focus styles never change an element's size or move its neighbours | Craft | Manual |

## Integrity

| ID | Rule | Source | Checked by |
|---|---|---|---|
| IN1 | Every script, stylesheet, font, image, media file, data request (fetch, XHR) and frame document the page needs loads; none fails, is blocked by the page's own Content-Security-Policy, or answers HTTP 400 or higher | Craft | Probe `page:failed-request` (load and settle only) |
| IN2 | The page throws no uncaught errors or unhandled promise rejections | Craft | Probe `page:error` (load and settle only) |
| IN3 | Every image loads; a broken one leaves its alt text or an empty box in the layout | Craft; the alt text itself is SE4 | Probe `page:broken-image` |
| IN4 | Headings draw in the font the design names; a web font that fails or cannot be used, or a named font that is not installed and has no installed fallback named after it, falls back to another font with different widths and line breaks | Craft | Probe `page:font-fallback` (first visible h1 only) |
| IN5 | Videos load and show a frame or a poster; an autoplay video has `muted` and `playsinline`, because browsers block autoplay with sound and iPhone Safari plays a video in the page only with `playsinline` | Craft (browser autoplay policies) | Probe `page:video-stuck` |
| IN6 | The first paint already uses the page's background: a dark page never flashes white while its styles, theme or script arrive | Craft | Probe `page:white-flash` (frames about every 100 ms from navigation to the end of the settle time) |

## Stack traps

Common ways a stack breaks the rules above. Check the ones that match the detected stack.

- Tailwind: `focus:` styles also show on mouse click, so teams remove them; use `focus-visible:` instead of removing focus styles. `outline-none` without a replacement fails RC4.
- CSS resets with `*:focus { outline: none }` fail RC4 everywhere at once.
- `hidden md:block` and similar hide content on phones; check that nothing a phone user needs is behind it.
- `overflow-x: hidden` on `html`, `body` or a wrapper turns a reflow failure into silently cut-off content; the probe reports it as `reflow:cut-off`.
- `height: 100vh` on phones sits under the browser bars; use `100dvh` for app shells and `min-height: 100svh` for heroes ([mobile.md](mobile.md)).
- `user-scalable=no` or `maximum-scale=1` in the viewport tag fails RE3.
- Emoji or icon fonts alone can leave a control's name ambiguous and render differently per platform. Inspect the accessible name; give the control a name that describes its action. An SVG alone does not supply one.
- `title` as the only name is unreliable; touch and many screen readers ignore it.
- React and other component frameworks: a `div` with `onClick` has no role, no Tab stop and no Enter key; use `button` or `a`.
- Native apps (React Native, Flutter, SwiftUI, Compose): the probe does not apply. Check targets against 44 pt or 48 dp, Dynamic Type or font scaling at the largest size, and screen reader labels in a simulator.
