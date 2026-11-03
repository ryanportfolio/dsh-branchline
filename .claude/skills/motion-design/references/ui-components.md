# UI component motion

Motion inside a product: buttons, popovers, tooltips, toasts, drawers, tabs, lists and drag gestures. These pieces are seen many times a day, so this file is about restraint, response and staying inside the frame budget. Films, heroes and loops follow the rest of this skill.

Adapted from Emil Kowalski's skills ([emilkowalski/skills](https://github.com/emilkowalski/skills): `emil-design-eng`, `review-animations` and `animation-performance`, read 2026-10-26), MIT licence in [ui-components.LICENSE](ui-components.LICENSE). The values are his practice from Vercel, Linear, Sonner and Vaul. They are his practice, not standards: tune them by eye, and when citing one, attribute it to Kowalski rather than to a design system.

## Should it animate at all

Decide by how often the user sees it.

| Frequency | Decision |
|---|---|
| 100+ times a day (keyboard shortcuts, command palette toggle) | No animation |
| Tens of times a day (hover effects, list navigation) | Remove it or cut it right down |
| Occasional (modals, drawers, toasts) | Standard animation |
| Rare or first-time (onboarding, celebrations) | Room for delight |

Never animate an action the user starts from the keyboard. Raycast opens and closes with no animation, which is right for something used hundreds of times a day.

Every animation needs an answer to "why does this move?": spatial consistency (a toast leaves the way it came, so swiping it away makes sense), state change, explanation, feedback on press, or avoiding a jarring jump. "It looks cool" is not a reason for something seen often.

## Easing and duration

| Motion | Easing |
|---|---|
| Entering, or leaving (dismissed by the user or timed out) | Ease-out: it moves at once, so the UI feels like it responded |
| Moving or morphing while on screen | Ease-in-out |
| Hover and colour changes | `ease` |
| Constant motion (marquee, progress bar) | Linear |

Never ease-in on UI. It delays movement at the moment the user is watching: a dropdown with ease-in at 300 ms feels slower than ease-out at 300 ms. The skill's "element leaves: ease in" rule is for scene and film exits; a popover, menu or toast that leaves, by the user's hand or on a timer, eases out and runs faster than its entrance.

The built-in CSS curves are weak. Starting points:

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);      /* UI entrances and dismissals */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);  /* movement on screen */
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);   /* iOS-like drawer (Ionic) */
```

Use the project's existing motion tokens first. The design-system token tables are in [principles.md](principles.md#ui-motion-tokens).

| Element | Duration |
|---|---|
| Press feedback | 100 to 160 ms |
| Tooltips, small popovers | 125 to 200 ms |
| Dropdowns, selects | 150 to 250 ms |
| Modals, drawers | 200 to 500 ms |

Keep UI animation under 300 ms; modals and drawers can run to 500 ms. A 180 ms select feels more responsive than a 400 ms one, and a faster spinner makes the same load feel shorter.

## Component rules

| Situation | Rule |
|---|---|
| Anything pressable | `transform: scale(0.97)` on `:active`, `transition: transform 160ms ease-out`. Keep the scale between 0.95 and 0.98. Style `:active` or listen to `pointerdown`; feedback on `click` arrives when the finger lifts. |
| Element appears | Start at `scale(0.95)` with `opacity: 0`, never `scale(0)`. |
| Popover, dropdown, menu | Scale from the trigger: `transform-origin` at the trigger, or Base UI's `var(--transform-origin)`. Modals are the exception: they belong to the viewport, so they stay centred. |
| Row of tooltips | Delay the first one. Once one is open, open its neighbours instantly with no transition (`transition-duration: 0ms` on a `data-instant` state). |
| Triggered rapidly (toasts added, toggles) | CSS transitions, not keyframes. A transition retargets from where it is; a keyframe animation restarts from zero. |
| Enter animation without JavaScript | `@starting-style { opacity: 0; transform: translateY(100%); }` inside a rule that also sets a `transition` on those properties; without the transition nothing animates. The fallback is a `data-mounted` attribute set after the first render. |
| Crossfade shows two overlapping states | Add `filter: blur(2px)` during the transition so the eye reads one changing object. Keep animated blur under 20 px; it is expensive, worst in Safari. |
| Press that confirms something (hold to delete) | Slow on press, fast on release: the overlay fills over 2 s linear while held and snaps back in 200 ms ease-out. Slow where the user decides, fast where the system responds. |
| Group entering together | Stagger 30 to 80 ms between items, and never block input while it plays. Material 1 gives 20 ms or less for list items (see [principles.md](principles.md)); 30 to 80 ms is Kowalski's practice. |
| Moving by an element's own size | `translateY(100%)`: percentages are relative to the element, so it works at any height. This is how Sonner and Vaul hide toasts and drawers. |
| Spring | Bounce 0.1 to 0.3 at most, and only for drag-to-dismiss or playful pieces. Motion's `{ type: "spring", visualDuration: 0.5, bounce: 0.2 }` is easier to reason about than mass, stiffness and damping, and lands on time next to timed motion (the skill's spring rule). Springs keep their velocity when interrupted, which suits gestures the user may reverse. |
| Decorative motion that follows the mouse | Pass the value through `useSpring` instead of applying it directly, so it has momentum. Only for decoration; a functional chart stays direct. |
| List items entering and leaving | Opacity and height have to work together. There is no formula; tune until it feels right. |
| Personality | Match the component. A playful piece can bounce; a dashboard is crisp and fast. Sonner runs a little slower than usual with `ease`, to feel elegant. |

### clip-path patterns

`clip-path: inset(top right bottom left)` eats into the element from each side. Chrome and Firefox can animate it on the compositor; support elsewhere is uneven, so test on Safari and a phone.

- **Reveal on scroll:** from `inset(0 0 100% 0)` to `inset(0 0 0 0)` when the element enters the viewport (`IntersectionObserver`, once).
- **Tabs with clean colour changes:** duplicate the tab list, style the copy as active, clip the copy to the active tab and animate the clip on change. The text colour changes exactly at the edge, which separate colour transitions cannot do.
- **Hold to delete:** a coloured overlay at `inset(0 100% 0 0)` fills to `inset(0 0 0 0)` on `:active`, with the asymmetric timing above.
- **Comparison slider:** stack two images and set the top one's right inset from the drag position. No extra elements.

## Gestures and drag

- **Dismiss on a flick.** Compute velocity as distance over elapsed ms. Dismiss when the drag passes the distance threshold or the velocity passes about 0.11 px/ms, so a quick flick is enough on its own.
- **Resist past the edge.** Dragging beyond a boundary moves the element less the further it goes. Allow the over-drag with rising friction instead of a hard stop.
- **Capture the pointer** once dragging starts (`setPointerCapture`), so the drag survives the pointer leaving the element.
- **Ignore extra touches** after the drag begins, or a second finger makes the element jump.
- **Test on a phone.** Drawers and swipes only feel right or wrong on hardware; see `ui-quality`'s mobile reference when it is present.

## Performance

At 60 Hz a frame has 16.7 ms; at 120 Hz, which most phones and many laptops now run, it has 8.3 ms. Design for the smaller number and a mid-range phone, never the development laptop.

| Tier | Properties | Cost per frame |
|---|---|---|
| Composite only | `transform` and `opacity` reliably; `filter`, `clip-path` and `background-color` in current Chrome and Firefox, with uneven support elsewhere (test on Safari and a phone) | Cheapest |
| Paint and composite | `box-shadow`, `border-radius`, `color` | Redraw every frame |
| Layout, paint and composite | `width`, `height`, `padding`, `margin`, `top`, `left`, `border-width` | Most expensive, and it moves the neighbours too |

| Instead of | Animate |
|---|---|
| `width`, `height`, `padding` to grow or shrink | `scale()` |
| `top`, `left`, `margin` to move | `translate()` |
| `display` or `visibility` swaps | `opacity` |
| `box-shadow` | `filter: drop-shadow()` |

| Driver | Thread |
|---|---|
| `requestAnimationFrame` loops (GSAP, Motion's `x`/`y`/`scale` shorthands, hand-written loops) | Main thread, always |
| Web Animations API (`element.animate()`, Motion's `animate()`, Motion components given a full `transform` string) and CSS transitions or keyframes | Can run off the main thread |

Traps:

- **`transition: all`.** It animates whatever changes next, layout properties included. List the properties.
- **Motion that plays while the page is busy** (navigation, data fetching, hydration) drops frames when it runs on the main thread. Vercel's dashboard tab indicator used a Framer Motion shared layout animation and stuttered while the next page loaded; a CSS animation fixed it. Use CSS or WAAPI for these.
- **Framer Motion shorthands.** `x`, `y`, `scale` and `rotate` are computed on the main thread every frame and are not hardware-accelerated. When the animation has to survive a busy main thread, animate the string: `animate={{ transform: "translateX(100px)" }}`.
- **React state per frame.** A hand-rolled animation that calls `setState` in a rAF, pointer, scroll or drag handler re-renders every frame. Write to `ref.current.style.transform` or a motion value instead.
- **Inherited CSS variables.** Vaul's drag got laggy past about 20 items because the drag distance was a CSS variable on the container, and changing it recalculates styles for every descendant. Set `transform` on the moving element. Suspect this whenever a transform animation gets worse as content grows.
- **`will-change`.** Browsers already promote elements animating `transform` or `opacity`. Add `will-change: transform` only to the animating element and only after you see a 1 px shift at the start or end, or measure dropped frames. Never on `*` or large containers: every layer costs GPU memory.

When an animation drops frames, check in this order: which properties animate; whether it coincides with the page being busy; React re-rendering per frame; whether it worsens as content grows; animated CSS variables; blur above 20 px; then `will-change`. Name the cause before changing code, and confirm with a recording (DevTools Performance panel on a real mid-range phone over remote debugging), not by feel. CPU throttling on a desktop models a slow CPU, not a weak GPU.

## Reduced motion

For UI, reduced motion means fewer and gentler animations, not none: keep opacity and colour transitions that explain a change, drop movement and position changes (`useReducedMotion()` in Motion, or the media query). This follows `ui-quality`'s MO1. The skill's "no reduced-motion version by default" rule covers films, where motion is the content.

## Reviewing

Report UI motion findings as one table:

| Before | After | Why |
|---|---|---|
| `transition: all 300ms` | `transition: transform 200ms var(--ease-out)` | Name the properties |
| `transform: scale(0)` | `transform: scale(0.95); opacity: 0` | Nothing appears from nothing |
| `ease-in` on a dropdown | `ease-out` with a custom curve | Ease-in feels sluggish |
| No `:active` on a button | `transform: scale(0.97)` on `:active` | Press feedback |
| `transform-origin: center` on a popover | `transform-origin: var(--transform-origin)` | Scale from the trigger (not modals) |
| Animation on a keyboard action | None | Seen hundreds of times a day |
| Ungated `:hover` animation | Inside `@media (hover: hover) and (pointer: fine)` | Touch makes hover stick after a tap |
| Keyframes on a rapidly triggered element | CSS transition | Interruptible |
| Same speed in and out | Faster exit than entrance | The system responds quickly |

To judge feel: play it at 2 to 5 times its duration or step it in the DevTools Animations panel (check that colours crossfade cleanly, the origin is right and coordinated properties stay in sync), try gestures on a real phone, and look again the next day.
