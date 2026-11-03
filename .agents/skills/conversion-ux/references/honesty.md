# Honesty sweep

The honesty guard in [SKILL.md](../SKILL.md) sets the limits for both modes; this file is the list an audit checks and a build clears before it ships. Each item names the stages where it usually shows up, and each stage file lists the items to check there.

## Reporting

Report each item found in the report's Honesty section, above the other findings, with its stage and no Blocks, Slows or Polish grade: any of them is reason enough to fix before the rest. List an item you could not determine at this depth (fees shown only at payment, how hard cancelling is) under "Not checked" instead of guessing. When the walk did not reach a stage, its items are not checked, not clean.

## Items

| ID | Item | Usually at |
|---|---|---|
| HO1 | Confirmshaming dismiss copy ("I'll risk it", "No, I don't want to save money") | Commit, Exit |
| HO2 | Urgency or scarcity that is not true: resetting countdowns, invented stock, "3 people are viewing" without data | Arrive, Understand, Choose |
| HO3 | Cancel or downgrade harder than sign-up | Exit |
| HO4 | Pre-ticked paid add-ons, insurance or consent boxes | Choose, Gate, Pay |
| HO5 | Fees that appear only at the last step | Pay (compared with Understand) |
| HO6 | Fake or unverifiable reviews, ratings or user counts | Arrive, Understand, Choose |
| HO7 | Price comparisons with mixed units or invented reference prices | Understand, Pay |
| HO8 | Plan claims that overstate what paying adds ("more of everything" when the free tier has the same limits) | Understand |
| HO9 | Trial or renewal terms that hide the charge date or amount | Understand, Commit, Pay |
| HO10 | A dismiss option styled to be missed | Exit, and any upsell |
| HO11 | Progress padded with steps the user did not do (the video's "even a fake one" progress, rejected) | Gate, onboarding |
| HO12 | A personal label ("Best match", "Recommended for you") on an item that paid to be there | Arrive, Choose |
| HO13 | Marketing consent bundled into a service request: a stock alert, receipt or account that also signs the user up for promotions with no separate choice | Gate, Exit |

## In build mode

Every price, count, date, badge and promise on the screen must be true for the typical user on the day it ships. Asked to build any item above, name it, say what it risks (refunds, chargebacks, complaints, consumer-protection rules), and build the honest version instead.
