# Build procedure

Use while designing a new page, flow or component. Build walks the same stages as an audit ([journey.md](journey.md)), forward: design each stage, then design the hand-off to the next before moving on. Each stage file ends with its build moves; load it when you reach that stage.

## 1. Write the job and the arrival

One sentence each: the action this screen or flow exists to get; who arrives, from where, and what they already decided on the way. Details: [stages/1-arrive.md](stages/1-arrive.md), Build moves.

## 2. Map the journey before any screen

List the stages this journey has (most have fewer than seven), the screens in each, and every gate: sign-in, sign-up, verification, consent, payment. For each hand-off, write what must carry over (JO1) and what the next screen opens on (JO3). Mark each step that going back cannot undo (payment, sign-up, a submitted form) and say where back lands from its result (JO4). Count taps and fields from arrival to goal; cut any step that asks for something the product already knows (JO2, GA1). Design the exits now too: the decline on each upsell and the cancel route (EX1, EX3).

## 3. Put the user's questions on the map

Write the questions a first-time user has, in the order they arise, and assign each to the stage that must answer it:

| Question | Answered at |
|---|---|
| What is this? Is it for me? | Arrive, Understand |
| What do I get first? What does paying add? | Understand |
| What does it cost, and when? | Understand, repeated at Commit and Pay |
| Which one should I pick? | Choose |
| How much effort? Can I undo it? | Commit (the CO2 line) |
| Will I lose my place? | Gate |
| Can I trust it? | Understand, Pay |
| Can I stop? | Exit |

A question with no answer at its stage is a reason to leave. Then find the hardest one (usually money or commitment) and make it smaller and true ([stages/2-understand.md](stages/2-understand.md), Build moves).

## 4. Set the visual system

Before the screens: read order, type, shapes, grid, colour by role. [every-screen.md](every-screen.md), Build moves.

## 5. Design each stage in order

For each stage the journey has, load its file and apply its build moves:

1. [Arrive](stages/1-arrive.md): real content, first view by priority.
2. [Understand](stages/2-understand.md): questions answered in order, honest and complete prices.
3. [Choose](stages/3-choose.md): defaults and presets from data, consequences before the choice, the user kept oriented.
4. [Commit](stages/4-commit.md): the action, its words and the line beside it.
5. [Gate](stages/5-gate.md): the ask placed where it has a reason, the user's place kept.
6. [Pay](stages/6-pay.md): the charge matching the promise, add-ons opt-in, failure states.
7. [Exit](stages/7-exit.md): equal declines, honest loss copy, a short cancel route.

After each stage, check the hand-off to the next against the map from step 2.

## 6. Test with hostile content and every width

[every-screen.md](every-screen.md), Build moves. Design empty, loading and error states with the same care as the full state (SC6).

## 7. Run the honesty sweep

[honesty.md](honesty.md). Every price, count, date, badge and promise on the screen must be true for the typical user on the day it ships.

## 8. Decide how to measure

The source rules are heuristics, not proven lifts. Name the metric this screen moves (trial starts, completed bookings, sign-ups that reach first use) and a guard metric that catches harm (refunds, cancellations within the trial, support contacts, complaints). When traffic allows, ship the change as an A/B test with a sample size decided in advance; otherwise compare before and after over equal periods and say that the comparison is weaker. Where the journey has several stages, also track where users drop between them, so a gain at one stage is not a loss moved to the next.

## 9. Audit the result

When the design exists, audit it with [audit.md](audit.md) at the depth you have.
