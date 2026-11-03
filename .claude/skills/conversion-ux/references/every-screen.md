# Checks for every screen

Run once on each distinct screen the walk meets, at whatever stage it appears. These rules decide whether the stage's facts and action can be seen and reached at all, so a failure here is graded by what it hides: covering the price or the button is Slows or Blocks, not Polish. Severity: [journey.md](journey.md).

## Rules

### Applies when: always

**SC1. Nothing covers the action or the decision facts.** Chat widgets, auto-opening tips, cookie bars and promo banners that cover prices, the button or the cancellation line. Check after waiting at least 20 seconds and after scrolling, on phone. Fix: no auto-opening overlays on pricing, checkout and sign-up screens; dock anything that must stay. Convention.

**SC2. Every width and language shows the facts needed to decide.** Content hidden on phone (`hidden md:block` and similar) that answers a decision question shown on desktop; prices or buttons that truncate in a longer language or break in right-to-left layouts. Fix: the same decision facts at every width and locale, shortened if needed. Convention.

**SC3. Everyone can reach the action.** Tab through the path: every control reachable by keyboard in a sensible order, with a visible focus; icon-only controls have an accessible name; touch targets at least 24 by 24 CSS px (WCAG 2.2 target size), 44 px where the platform asks for it; nothing essential depends on hover or on motion. A primary action that a keyboard or screen-reader user cannot reach blocks them. Convention.

The next two are screen-craft rules and count toward the Polish cap.

**SC4. One shape language, one grid.** Mixed corner radii; elements a few pixels off the margin. Fix: one radius scale; consistent margins and columns. U7jTCgIWS4w 1:58; GGg61sdEjeI 3:32. Craft.

**SC5. Colour by role, readable.** Saturated colour on many elements; light text on bright fills. Fix: quieter palette, strong colour only where attention belongs; check text contrast. GGg61sdEjeI 4:17, 8:24. Craft.

### Applies when: the screen loads data, can be empty, or can fail

**SC6. Empty, loading and error states.** Say what will appear and give the one action that fills it; show progress for waits over about a second; errors say what happened and what to do next, and keep what the user entered. Convention.

## Build moves

- **Set the visual system before the screens.** A read order: first, second, third; size, weight and position follow it (AR1, UN4). One type family; hierarchy from size, weight, colour and line height (UN5). One corner radius scale, one icon style, one grid (SC4, UN6). Colour by role: neutral surfaces, one accent for the primary action, status colours only for status; readable contrast (SC5).
- **Test with hostile content and every width.** Brightest and busiest photo, longest name, zero results, one result, huge numbers, a currency with long formatting, text 30 to 40 percent longer after translation, a right-to-left language if the product supports one, and the narrowest phone the product supports. Every width shows the facts needed to decide (SC2, AR6).
