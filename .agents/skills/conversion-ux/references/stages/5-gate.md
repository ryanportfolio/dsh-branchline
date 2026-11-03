# Stage 5: Gate

The user is asking: why do you need an account, my email or my consent now, how long will this take, and will I lose what I just chose?

Starts at sign-in, sign-up, email or phone verification, or a consent step, and ends when the user is back on the step they were heading for. Also covers onboarding that leads to the account ask. Hand-off rules and severity: [journey.md](../journey.md).

## Hand-off in and out

- **In**: the gate names the pending step and the choice it protects ("Create your account to start Pro · Yearly").
- **Out**: after the gate, the user lands on that step with every choice intact (GA1, JO1). This is where a journey most often breaks after the user has said yes, so a dropped choice here is Blocks.

## Rules

### Applies when: the action passes through sign-in, sign-up, verification, consent or payment

**GA1. Gates keep the user's place.** Follow the action through every gate: sign-in, sign-up, email verification, consent, payment. The user must come back to the same step with their choices intact (plan, quantity, filters, form input). A gate that drops them on the home page loses the sale after they have already said yes. Fix: carry the destination and choices through the gate (a redirect parameter, saved state) and name the pending step on the gate ("Create your account to start Pro · Yearly"). Convention.

### Applies when: the screen asks for an account, or leads to that ask

**GA2. Give before asking.** Results blurred behind "Create an account" hold the user's own work hostage. Fix: a real, useful part of the result first; the account saves it or unlocks the rest ("Save my report"). 2TlIg3VokY8 3:49. Adjacent research.

**GA3. Let them make something first.** A bare email and password form has nothing to lose. Fix: let users set up something short (a goal, a profile card, a first lesson) before the account; the account saves it; the button says "Continue" or "Save". 2TlIg3VokY8 5:36. Adjacent research. Guard: short enough to finish, and kept through sign-up.

**GA4. Never start at zero.** Count steps the user has really completed so progress starts above 0%, and say why they count. 2TlIg3VokY8 1:45. Adjacent research. Guard: real steps only.

**GA5. Ask for the account when it has a reason.** At the moment there is something to save, sync or share. 2TlIg3VokY8 3:49-7:03. Presenter.

## Honesty items here

HO4 (pre-ticked consent or marketing boxes), HO11 (progress padded with steps not done), HO13 (marketing consent bundled into the account or an alert). Details in [honesty.md](../honesty.md).

## Build moves

- **Map the path through every gate.** Draw the steps from arrival to the goal, including sign-in, sign-up, verification and payment. Each gate returns the user to the same step with their choices intact, and names the pending step. Count taps and fields; cut any step that asks for something the product already knows (GA1, JO2).
- **Place the ask where it has a reason.** After a partial result or something the user made, not before (GA2, GA3, GA5).

## At limited depth

Read-only: open the gate screen and judge what it shows (fields, copy, whether it names the pending step), but do not submit. Whether choices survive can sometimes be read without submitting: a return parameter in the sign-in link or form (`next=`, `redirect=`, `returnTo=`) is a sign, marked read from markup; it does not prove the state survives. Otherwise record survival as not observed.
