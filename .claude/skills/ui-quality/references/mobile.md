# Mobile web

The CSS and meta-tag fixes that make a web app behave on a phone: hover that sticks after a tap, the grey tap flash, `100vh` under the browser bars, inputs that zoom the page, slow taps, pull-to-refresh, the notch, long-press text selection, carousels that scroll the page, and the status bar colour. Use it when a screen targets phones, a PWA, a bottom sheet, a carousel or a full-screen layout, or when something "works in Chrome but feels wrong on my phone". Motion itself is in `motion-design`'s `references/ui-components.md` when that skill is installed.

Adapted from Emil Kowalski's `mobile-native` skill ([emilkowalski/skills](https://github.com/emilkowalski/skills), read 2026-10-26), MIT licence in [kowalski.LICENSE](kowalski.LICENSE). Each fix is Craft or browser behaviour unless a rule ID says otherwise.

## Rules for this work

- **Give each fix its reason and apply it where the reason applies.** `user-select: none` on a button is right; on body text it is a defect.
- **Gate by capability, not device.** Use `(hover: hover)`, `(pointer: fine)`, `env()` and `dvh`. Never branch on the user agent or screen width to guess at touch. Touch and mouse coexist: iPads with trackpads, laptops with touchscreens.
- **Never disable zoom.** `user-scalable=no` and `maximum-scale=1` fail RE3. The zoom they are added to stop comes from inputs under 16 px; fix those instead.
- **Prefer CSS or a meta tag over JavaScript.** A `useIsTouchDevice()` hook to hide hover styles is the wrong tool; a media query is the right one.
- **Real hardware decides.** None of these bugs reproduce in Chrome's device emulation, and the probe's 375 px touch context is emulation. Say which fixes you verified from code or the probe and which need a phone.

## Symptoms

| Symptom | Fix | Rule |
|---|---|---|
| Hover state stuck after a tap | Put `:hover` styles inside `@media (hover: hover) and (pointer: fine)` | RC12 |
| Grey or blue flash on tap | `-webkit-tap-highlight-color: transparent` on `html`, plus an `:active` style | RC13 |
| Layout taller than the screen, bottom button under the URL bar | `100dvh` for app shells, `100svh` for heroes | Stack traps |
| Page zooms into an input and stays zoomed | Inputs at 16 px or more | RE7 |
| Tap feels late | `:active` or `pointerdown` feedback; `touch-action: manipulation` on controls | RC13 |
| Pull-to-refresh or rubber band moves the app | `overscroll-behavior: none` on the root, `contain` on inner scrollers | Craft |
| Content stops at the notch, or a bar sits under it | `viewport-fit=cover` plus `env(safe-area-inset-*)` padding | Craft |
| Long-press selects a button's label | `user-select: none` on controls only | Craft |
| Swiping a carousel scrolls the page | `touch-action: pan-y pinch-zoom` on the horizontal gesture surface, or native scroll snap | Craft |
| Status bar colour fights the page | One `theme-color` per colour scheme | Craft |

## The fixes

**Sticky hover.** A tap applies `:hover` and leaves it until the user taps elsewhere, so a button that grows on hover stays grown. Both conditions matter: `(hover: hover)` says the primary input can hover, `(pointer: fine)` says it is precise. Tailwind v4's `hover:` already compiles to `@media (hover: hover)`; in v3 set `future.hoverOnlyWhenSupported`. Touch users still need press feedback through `:active`.

**Tap flash.** iOS Safari and Android Chrome paint a translucent box over any tapped element with a click handler. Set `-webkit-tap-highlight-color: transparent` once on `html`, then give every tappable element its own `:active` state, because the browser's flash was the only feedback it had.

**Viewport height.** `100vh` on a phone is the height with the browser bars collapsed, so at load the element overflows by the URL bar. `100dvh` tracks the visible area and suits app shells and drawers; it shifts layout as the bars move, so heroes use `min-height: 100svh`, the smallest viewport. `lvh` is the old `vh`. Keep a `100vh` line above as a fallback only if the support matrix needs it.

**Input zoom.** iOS Safari zooms when focus lands in an input whose font is under 16 px and does not zoom back out. Set `input, textarea, select { font-size: 16px; }`, or inside `@media (pointer: coarse)` when the desktop design wants smaller text. While there, set the keyboard: `inputmode="numeric"` for codes, `inputmode="decimal"` for amounts, `type="email"` and `type="tel"`, `autocapitalize="none"` and `autocorrect="off"` for usernames and codes, `enterkeyhint="send"`, `"search"` or `"done"`.

**Slow taps.** Two causes. Browsers can wait about 300 ms after a tap to see whether a double-tap zoom follows; `touch-action: manipulation` on `button, a, [role="button"]` removes the wait where `width=device-width` alone does not. And feedback on `click` arrives when the finger lifts, which reads as lag; style `:active` or listen to `pointerdown`. Show it as the finger lands (MO4: within 100 ms) and let it run 100 to 160 ms with ease-out. If `:active` never shows on an iPhone, add a passive no-op `touchstart` listener on the document (`document.addEventListener('touchstart', () => {}, { passive: true })`); some iOS versions apply `:active` only then. Check it on the device.

**Overscroll.** In an app with its own scroll areas, a drawer dragged down or a canvas, scrolling past the top triggers pull-to-refresh on Android and the whole-page bounce on iOS. Set `overscroll-behavior: none` on `html, body`, and `overscroll-behavior: contain` on inner scrollers (sheet content, chat lists) so they keep their own bounce without moving the page. Leave the root alone on a scrolling document where pull-to-refresh is welcome. Never use a `touchmove` listener with `preventDefault()`: it blocks scrolling and makes the listener non-passive.

**Safe areas.** Without `viewport-fit=cover` the page is letterboxed inside the safe area and every `env(safe-area-inset-*)` value is `0`. With it, pad the fixed parts back out: `padding-top: env(safe-area-inset-top)` on a fixed header, `padding-bottom: env(safe-area-inset-bottom)` on bottom bars, and `calc(1rem + env(safe-area-inset-bottom, 0px))` on sheets and toasts.

**Long-press selection.** On `button, [role="button"]`, tabs, chips and drag handles: `user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;`. Never on `body`: people copy addresses, error messages and order numbers.

**Gesture axes.** `touch-action` names what the browser may still do. `pan-y pinch-zoom` on a horizontal carousel leaves vertical scrolling and pinch zoom to the browser; `pan-x pinch-zoom` on a vertical sheet handle leaves horizontal scrolling and zoom. Bare `pan-x` or `pan-y` also blocks pinch zoom on that surface, so keep `pinch-zoom` unless the element handles zoom itself; `none` only on an element that really handles every axis (a slider, a drag-to-dismiss surface), or the user cannot scroll past it. A control that works only by dragging also needs a single tap or click alternative (RC8). A carousel built on native scrolling needs none of this: `scroll-snap-type: x mandatory` on the track and `scroll-snap-align: start` on slides.

**Status bar.** Give each scheme its own colour, matched to the top of the page (the header background, not the brand colour), plus `color-scheme` when a dark theme ships. Safari 26 is reported to ignore `theme-color` and tint its bars from the page's top background or a fixed header instead, so also give `html` or `body` a background that matches the header. In Next.js use the `viewport` export's `themeColor`. A theme switched by class needs the tag updated from JavaScript. For an installed PWA, the manifest's `theme_color` and `background_color` and `apple-mobile-web-app-status-bar-style` are the same decision.

## Baseline for a new phone-facing app

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0a0a0a" />
```

```css
html {
  -webkit-tap-highlight-color: transparent;
  -webkit-text-size-adjust: 100%; /* no font inflation in landscape */
  overscroll-behavior: none;      /* drop for a scrolling document */
}
input, textarea, select { font-size: 16px; }
button, a, [role="button"] { touch-action: manipulation; }
button, [role="button"] { /* not links: inline links are content */
  user-select: none;
  -webkit-user-select: none;
}
@media (hover: hover) and (pointer: fine) {
  /* every :hover rule lives here */
}
```

`interactive-widget=resizes-content` makes Android Chrome shrink the layout viewport, and `100dvh` with it, when the software keyboard opens, so bottom-pinned inputs stay above the keyboard. iOS Safari ignores the setting and does not resize the layout viewport for the keyboard; there, position against `window.visualViewport` or test on an iPhone. Replace the colours with the page's own. Add `<meta name="color-scheme" content="light dark" />` only when a dark theme ships: it turns form controls and the default background dark, which breaks a light-only page that sets dark text.

## Never ship

| Never | Instead |
|---|---|
| `user-scalable=no` or `maximum-scale=1` | 16 px inputs |
| Ungated `:hover` | `@media (hover: hover) and (pointer: fine)` |
| `100vh` for an app shell or bottom-pinned UI | `100dvh` |
| `100dvh` on a marketing hero | `100svh` |
| Press feedback on `click` only | `:active` or `pointerdown` |
| `touchmove` with `preventDefault()` to stop overscroll | `overscroll-behavior` |
| `user-select: none` on `body` | Only on controls |
| `touch-action: none` on something the user scrolls past | `pan-x pinch-zoom` or `pan-y pinch-zoom` |
| `env(safe-area-inset-*)` without `viewport-fit=cover` | Add the meta tag |
| One `theme-color` for both schemes | One per `prefers-color-scheme` |
| User-agent sniffing for touch | `(hover)` and `(pointer)` media queries |
| Calling it fixed from emulation | A real phone |

## Testing on a phone

- Run the dev server on `0.0.0.0` and open it by the machine's LAN address from a phone on the same network.
- iOS: Safari, Develop menu, the device. Android: `chrome://inspect`.
- Use a phone a few years old, with the keyboard open, and once in landscape. Test as an installed PWA when that is a target: standalone mode changes the viewport, safe areas and status bar.
- The Xcode Simulator is better than emulation and still misses touch feel.

Report what was wrong (the symptom and its reason), what changed (file and declaration), and what needs a phone to confirm.
