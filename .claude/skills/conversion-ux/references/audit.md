# Audit procedure

Use on an existing page, flow, screenshot, design file or component. This file sets the depth, says how to capture the screens and gives the report format. The walk itself, the hand-off rules and severity are in [journey.md](journey.md); the rules are in the stage files.

## 1. Set the depth

Work out whose screen this is and what access exists. When the request does not say and you cannot tell, treat it as read-only. State the depth at the top of the report.

- **Owner's staging, test account or code**: walk the full path, through sign-up and payment in test mode, and read the code for anything a browser cannot show.
- **A live page you have no account for, or someone else's product**: read-only. Navigate, scroll, open menus and toggles, type without submitting. Stop before anything that writes data, charges money or sends email (submitting a form, creating an account, opening payment). Read what follows from code if you have it, and mark it as read, not observed.
- **A screenshot, design file or native app you cannot run**: judge what is shown; list the states and steps you could not see.

What each depth can reach, by stage:

| Depth | Arrive to Commit | Gate | Pay | Exit |
|---|---|---|---|---|
| Owner's staging, test account or code | Walk | Walk through sign-up and verification | Walk in test mode | Walk, including cancel and downgrade |
| Live page, read-only | Walk; open but do not submit | The gate screen itself; do not submit. Whether choices survive: read the sign-in link or form for a return parameter (marked read from markup), else not observed | Fees and totals shown before payment only; the final total is not observed | Upsell declines, back and close; the cancel route only from public help pages, marked read |
| Screenshot, design file, app you cannot run | The states shown | Shown only | Shown only | Shown only |

## 2. Capture the real screens

- **Web**: headed Chrome, never headless, offscreen and muted (`launchPlacedChrome()` where the repository has it, otherwise `--window-position=-2400,-2400 --mute-audio`). Render at a phone width (375 px unless the product names another) and at desktop. Scroll slowly to the bottom and wait for lazy-loaded sections before a full-page capture. Wait at least 20 seconds for anything that opens on a timer. Tab through the primary path once with the keyboard (SC3).
- **Native app**: use a simulator or emulator, or the owner's screenshots. Purchases and cancellations through an app store happen in the store's own sheets and the phone's subscription settings; judge the app's screens before and after them.
- **States**: capture the ones this depth can reach (logged out and in, empty, loading, error, trial, paid). List the rest under "Not checked"; do not guess what they look like.

Capture each stage as you walk it, and keep the screenshot path for the journey map. Every piece of UI text you quote as observed must appear in a capture of the state it belongs to (a screenshot or saved page text taken in that state, such as "size 10 selected"); name the state beside the quote. Text you could only read from code or markup is quoted with its file and line and the condition that shows it (a prop, a flag, a route), and marked "read from code; not observed".

## 3. Walk the journey

Name the job (AR1), then run the loop in [journey.md](journey.md) at each stage the journey has, loading that stage's file when you reach it.

## 4. Report

Open with **the five findings to fix first**, one line each (honesty items count). Then:

- **Depth**, the **job** (or the top jobs, one walk each) and the **arrival**: the entry point and what the user had already decided.
- **Journey map**: one row per stage.

  | Stage | Screen (path or URL) | Status | Taps so far | Hand-off |
  |---|---|---|---|---|
  | 1. Arrive | ... | Observed | 0 | Search terms kept |
  | 5. Gate | ... | Not observed: read-only, account needed | 4 | Return parameter present in sign-in link (read from markup) |

  Status is one of: observed, read from code or markup, shown in an image, not observed (reason), not in this journey. Hand-off is carried, dropped or not observed, with what was checked.
- **Path count** now and after the fixes (JO2).
- **Hard questions**, by stage.

Then the **Honesty** section: each item from [honesty.md](honesty.md) found, with its stage, or "none found", plus the items that could not be determined at this depth.

Then the findings, Blocks first, then Slows, then Polish; within each grade, in stage order. Each finding:

- **Stage**: where in the journey it bites, or the hand-off between two stages.
- **Where**: the element, its exact current text, and where that text came from: a screenshot path or selector for observed text, a file and line for text read from code. Mark each fact as observed or read from code.
- **Before → after**: the hard question and the easier one the fix asks. For friction that is not a question (an overlay, low contrast), name it and say it is removed.
- **Rule**: one rule ID, the closest fit, or **Unmatched** with a one-line statement of the principle broken.
- **Fix**: the concrete change, with replacement copy when copy is the fix. Copy stays true to the product; any fact you could not confirm (a reminder email, a cancellation route) is an assumption for the owner to check.
- **Evidence**: the rule's label: Research, Adjacent research, Presenter, Craft or Convention. Cite papers per [evidence.md](evidence.md); never quote a lift percentage from the videos.
- **Severity**: Blocks, Slows or Polish, as defined in [journey.md](journey.md).

Close with what already works (short); the stages, states and honesty items not checked, each with the access that would settle it ("needs a test account through checkout"); and the first test to run: fix defects and honesty items first; A/B the rest with a metric and a harm guard (see the last step of [build.md](build.md)).

Leave out rules that pass. One defect is one finding: when several rules describe it, pick the closest and name the others in its fix instead of reporting it again.
