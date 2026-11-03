# Stage 4: Commit

The user is asking: what happens when I press this, how much will it cost, how many steps follow, and can I undo it?

Starts at the primary action and the line beside it; ends when the user presses it. Hand-off rules and severity: [journey.md](../journey.md).

## Hand-off in and out

- **In**: the button repeats what was chosen (plan, period, slot, total) and agrees with the prices and terms recorded at Understand.
- **Out**: what the button promises is what the next stage delivers. A gate names the pending step (GA1); payment charges the total on the button (PA1). Press the button only when the depth allows it (see [audit.md](../audit.md)); otherwise read where it leads (link target, form action) and mark it read, not observed.

## Rules

### Applies when: the screen has a primary action

**CO1. The button says what happens and for how much.** "Search", "Show homes", "Continue", or a control with no words hide the result. Fix: verb plus outcome, with the live count or the full total, updated on every change ("Show 41 homes", "Reserve · €445 total", "Get Pro · $3/month"); when the user just picked something, repeat it ("Book Sat 11:30"). Words go on the control itself. A live count also prevents landing on zero results. 2TlIg3VokY8 1:06; U7jTCgIWS4w 11:12; zr37ibqXl1U 13:28; GGg61sdEjeI 11:24. Presenter. Guard: totals include every mandatory fee.

**CO2. One line beside the action: cost, effort, exit.** Find the objection most likely to stop this user here (will I be charged and when, how many steps, can I cancel, what if plans change) and check whether one line within a glance of the button answers it. Fix: "2 taps · cancel anytime", "Free cancellation before Mar 26", "$3 today, then monthly · cancel in your account". zr37ibqXl1U 3:56, 13:43. Presenter. Guard: true step count, real date, and the cancel route that really applies (for app-store subscriptions that is the phone's subscription settings, so say so).

**CO3. Light verbs for first steps.** "Subscribe" signals a recurring commitment; "Start my free trial" a beginning. zr37ibqXl1U 3:23. Presenter. Guard: the CO2 line still states billing and its date.

**CO4. Reachable when the user is ready.** People decide after reading further down. Fix: a sticky action on long pages, labelled with the plan and price, that does not cover content. GGg61sdEjeI 12:15. Craft.

**CO5. Inputs beside the action they feed.** Quantity far from "Add to cart"; units outside the control. Fix: group them; put the unit inside the selector. GGg61sdEjeI 11:09. Craft.

**CO6. Emphasis without shouting.** All caps, oversized, aggressive buttons. Fix: weight and colour carry priority; sentence case. GGg61sdEjeI 10:55. Craft.

Something covering the button or the CO2 line (a chat widget, a cookie bar): SC1. A button a keyboard cannot reach: SC3. Both in [every-screen.md](../every-screen.md).

## Honesty items here

HO1 (shaming copy on the secondary option beside the action), HO9 (billing date or amount missing from the CO2 line). Details in [honesty.md](../honesty.md).

## Build moves

Design the action:

- Words on the control: verb plus outcome, with the live count or full total (CO1).
- A light verb for a first step, while the line beside it states billing plainly (CO3, CO2).
- Inputs that feed the action sit next to it (CO5).
- On long pages the action follows the user as a labelled sticky bar (CO4).
- Nothing auto-opens over the action or the price (SC1).
- Every control reachable by keyboard with visible focus, named for screen readers, and large enough to tap (SC3).
- An upsell that interrupts a task gets an equal "Not now" (EX1).
- Write down what the button promises; the next stage must deliver exactly that (JO1).
