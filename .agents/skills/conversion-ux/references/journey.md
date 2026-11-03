# The journey walk

The instrument both modes use. An audit walks the stages as the user meets them; a build designs them in the same order ([build.md](build.md)). Rules hang off the stage where they apply, so load a stage file only when the walk reaches it.

## Stages and what each hand-off carries

| Stage | Starts at | Hand-off to the next stage must carry |
|---|---|---|
| 1. Arrive | The entry point: ad, search result, shared link, app launch, a prompt fired inside the product | What the user decided before arriving: search terms, a plan clicked on a pricing page, a cart, a destination, the task they were doing |
| 2. Understand | The user reads for detail: what it is, cost, terms, what paying adds | Every price, term and claim stated here, which later stages must honour |
| 3. Choose | The first selection: plan, period, option, quantity, filter, date | Each selection, exactly as made |
| 4. Commit | The primary action and the line beside it | The promise on the button: the plan, the total, the outcome |
| 5. Gate | Sign-in, sign-up, verification, consent | The destination and every choice, through the gate and back |
| 6. Pay | Checkout, payment sheet, app-store purchase | A charge equal to the promise, and the terms that go with it |
| 7. Exit | "Not now", back, close, cancel, downgrade | The user's place: they return to where they were, with their things |

Walk the stages the journey has, in the order the user meets them. Not every journey has all seven: a filter screen may end at Commit, a free sign-up has no Pay, a cancel flow is Arrive (the account area) then Exit. Mark a stage the journey lacks "not in this journey", which is different from "not observed". An upsell that interrupts a task is its own short journey (Arrive at the trigger, Understand, Commit or Exit) and gets its own walk. A screen with several jobs (rule AR1) gets one walk per top job.

## The loop at each stage

1. **Enter.** Note the screen, how the user got here, and the taps, fields and screens so far (JO2).
2. **Check the hand-off in.** Compare this screen with the record from the previous stage: did the choices survive (JO1), does the first read follow from the last action (JO3), and can back re-enter a step already finished (JO4)?
3. **List the questions.** Top to bottom, the question each element raises. Mark the hard ones: value judgements before any use, unknown cost or effort, unclear commitment, fear of a trap, mental arithmetic, decisions made blind to each other, a choice that will be lost.
4. **Run the stage file.** Load it and run the rules whose "Applies when" line fits. On a screen not yet seen, run [every-screen.md](every-screen.md) and sweep it region by region (header and banners, first view, price block, options, the action and the line beside it, floating widgets and prompts, lists and cards, footer and navigation), writing down each element's exact text, so nothing outside the main path goes unread. Check the honesty items tagged for this stage in [honesty.md](honesty.md).
5. **Look past the rules.** Problems no rule names, especially between elements and across the hand-off. Report them as Unmatched, and keep a one-line note of which hand-offs you checked even when you find nothing.
6. **Record the stage.** One status: observed, read from code or markup, shown in an image, not observed (with the reason: depth, needs an account, needs payment, app-store sheet, state not reachable), or not in this journey. Never infer a stage's quality from its absence.

## Journey rules

Checked at every hand-off, in both modes.

**JO1. Choices carry over.** Between any two stages, the user's choices (plan, billing period, quantity, dates, filters, form input) and their place survive: through gates (GA1), the browser back button, closing a sheet, a page refresh, and a trip from a list to a detail page and back. Fix: keep non-sensitive selections (plan, period, quantity, dates, filters) in the URL or a saved session, and form input in a saved session only; never put credentials, verification codes, payment details or private content in a URL, where history and logs keep it. Restore the scroll position on back; name the carried choice on the next screen. Convention.

**JO2. Count the path.** Taps, fields and screens from arrival to the goal, and any dead end. Report the count now and the count your fixes would leave. Where the next choice is small (a time slot, a size), put it on the card so the action needs no extra screen ("Book Sat 11:30"). U7jTCgIWS4w 8:48, about 9:48 (frames). Presenter.

**JO3. Attention carries over.** Each new screen opens on the result of the last action: the item just added, the plan just picked, the step now pending, in its first read. A screen pushed between two stages (a promo, a survey, a cross-sell) breaks the user's line of thought; when one is needed, it names what the user was doing, returns them to it, and has a decline per EX1. Fix: the confirmation or pending step leads the next screen ("Pro · Yearly selected. Create your account to start."). Convention.

**JO4. Back never re-enters a finished step.** After a step that going back cannot undo (a payment, a finished sign-up or sign-in, a submitted order or form, completed onboarding), back (the browser button, a back link, the phone's back gesture) must not show that step's form or an enabled submit again, or re-open a paywall already paid for. Back that can place an order or charge twice is Blocks; any other re-entry is Slows. Back must not trap the user either: block it only while an irreversible request is in flight (seconds, with visible progress) or when leaving would lose unsaved input, and then ask with a confirm that lets the user leave (the browser's own `beforeunload` prompt when leaving the page, an in-app confirm for an in-app route; never fake history entries to catch back). Any other trap, such as a funnel, exit prompt or rating prompt that blocks back, is Blocks. Fix: before the step is finished, back walks through the earlier steps as usual (JO1). Once it is finished, every screen of that flow checks the finished state and shows the result instead of the form ("Order placed. View order"), so each back press still moves one screen back and none lands on a live form; in a single-page flow, also replace the final step with the result. A redirect after a form post only stops a refresh from posting again, and the browser may restore the old form page without asking the server, so the form's script re-checks on `pageshow` (fired on every load, including back-forward cache restores) and keeps the submit disabled until the server confirms the step is still open, and disabled if the check fails. Make the submit idempotent with a key tied to the order or cart, never one made per page load or click. A paywall opened from a feature closes onto that feature, unlocked (GA1). Test only at the owner's depth, in test mode ([audit.md](audit.md)): before finishing, back returns to the previous step with its choices; after finishing, press back once, twice and until the flow is left, and refresh the result page. Each back press lands on an earlier screen, none shows the finished step's form or an enabled submit, and the test-mode order or payment log holds exactly one entry. Read-only: read it from code and mark it read, or mark it not observed. Convention.

## Severity follows the journey

Grade each finding by what it does to the walk:

- **Blocks**: the journey stops. A user who wants to act cannot finish a stage, cannot reach the action (by keyboard or screen reader, or past an overlay that cannot be dismissed), or loses their choice, data or place at a hand-off.
- **Slows**: the journey continues, but a stage leaves a decision question unanswered, hidden, covered or late, or costs extra steps or a detour.
- **Polish**: the journey is intact; the change is craft. Report at most three Polish findings from the screen-craft rules (AR4, AR5, AR6, UN4, UN5, UN6, UN7, SC4, SC5) unless a visual review was asked for. A craft flaw that hides a decision fact is graded at its real severity and does not count toward the three.

Honesty items ([honesty.md](honesty.md)) get no grade: each is reason enough to fix before the rest, and they are reported above the findings.

A defect late in the journey costs more than the same defect early: the user has already said yes. Order findings Blocks, then Slows, then Polish, and within each grade by stage, so the report reads in the order the user meets the problems.

## Evidence labels

Each rule carries one label, and each finding repeats it:

- **Research**: a published study in a setting close to interface choices (defaults on a form). Read its entry in [evidence.md](evidence.md) before citing it.
- **Adjacent research**: a published effect from another setting (money gambles, raffle tickets, loyalty cards, lab anchors). Plausible for screens, not tested on them; cite it as a reason to test, never as proof.
- **Presenter**: the video's claim, no data shown. A heuristic to test.
- **Craft**: visual or interaction convention, judged by inspection.
- **Convention**: common practice not taken from the source videos; covers what they skip.

A **Guard** line on a rule is an honest limit; the fix must stay inside it. Source references are video ID plus timestamp; notes are in [sources.md](sources.md).
