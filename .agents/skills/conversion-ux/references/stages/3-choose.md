# Stage 3: Choose

The user is asking: which plan, period, option, quantity, date or filter, and what will that choice get me?

Starts at the first selection and ends at the primary action. Hand-off rules and severity: [journey.md](../journey.md).

## Hand-off in and out

- **In**: what Arrive and Understand established carries into the controls. A search for "3 bedrooms in Portland" arrives with those filters set; a plan clicked on the pricing page arrives selected.
- **Out**: each selection reaches Commit exactly as made. The count on an option equals the results it gives; the selected plan and period are named on the button (CO1). Check that changing one filter does not reset another.

## Rules

### Applies when: the screen has inputs, a list to narrow, or options to pick

**CH1. Pre-fill the common choice.** Blank fields make the user decide everything. Fix: default to the most common real choice so the task is scan and adjust. 2TlIg3VokY8 0:20. Research. Guard: never a pre-ticked paid add-on, consent box or upsell; a pre-selected plan or tier is the one most similar users pick or the cheapest that fits their stated need, with its price visible, never the priciest by default.

**CH2. Fewer visible options, or a recommendation.** Long lists stall people when options are hard to compare. Fix: shortlist, group, or mark one recommended option with the reason. 2TlIg3VokY8 0:41. Adjacent research (mixed; see [evidence.md](../evidence.md)).

**CH3. Presets from real usage.** Fix: one-tap presets from actual usage (500 g, 1 kg, 2 kg) plus a custom control. GGg61sdEjeI 12:44. Presenter. Guard: say where the presets came from when there is no data yet.

**CH4. Control matches the task.** Chips or segmented options to pick a value; steppers to nudge one; a slider plus number inputs for ranges. U7jTCgIWS4w 10:52, 12:18. Craft.

**CH5. Match how people state the need.** "3 bedrooms" usually means at least three. Fix: "3+" by default, an explicit "exact" option, two taps for a range (which switches the options to exact values), an open end ("No max"), and a clear link per section. U7jTCgIWS4w 12:27, 14:41. Craft.

**CH6. Consequences before the choice.** Counts on each option ("3+ · 459"), recalculated from the other filters; a distribution behind a range slider; what loosening a filter would add; a live count on apply. U7jTCgIWS4w 11:33-14:41. Presenter.

**CH7. Ask for what the user knows.** Accept the inputs they have (deposit, monthly comfort) and compute what the system needs ("Your reach · $708K"). Keep an optional helper folded to one row until opened. U7jTCgIWS4w 13:31. Presenter. Guard: a folded summary must match the inputs behind it.

**CH8. Connected decisions on one surface.** One page per filter hides the other choices and the results. Fix: a sheet over the results with every filter in one scroll. U7jTCgIWS4w 8:12-10:18. Presenter.

**CH9. Visible filters, sort and counts.** The few most-used filters as chips, the rest behind a filter button with sort beside it; applied filters stay visible as filled chips on the results; a result count ("640 places"). Icon-only filter and sort buttons need icons people already know, or a label. U7jTCgIWS4w 1:36-3:23, about 5:28 (frames). Craft.

**CH10. Let people choose when no default fits.** Cards for desire, a list for comparison: offer a switch when both uses are common. U7jTCgIWS4w 3:31. Craft.

**CH11. Personal labels from real signals.** "Best match" only from data the product has about this user, never a paid placement. U7jTCgIWS4w 4:03. Presenter.

**CH12. Search that looks searchable and says its scope.** A field with an icon, a filled background and enough height reads as a control; the placeholder names what can be searched ("Search places, dishes or cuisines"). U7jTCgIWS4w 3:52, about 4:30 (frames). Craft.

### Applies when: several priced options sit side by side

**CH13. One-word verdicts.** "Cheapest", "Fastest", "Best value" do the comparison for the user. zr37ibqXl1U 8:58. Presenter. Guard: true among the visible options, with the basis named ("Best value · lowest price per month"); the video's unexplained "Cheaper" is not acceptable as is.

### Applies when: the screen changes in response to input

**CH14. Keep context during change.** Full-screen takeovers hide what the user was looking at. Fix: sheets over the content, a title that moves into a sticky header on scroll, content that slides over the image. U7jTCgIWS4w 10:00; GGg61sdEjeI 11:43. Craft.

**CH15. Motion that explains.** Use motion to show where something came from and went. The videos show these moves but do not test them. GGg61sdEjeI 11:43. Craft. Guard: respect the reduced-motion setting; nothing essential is conveyed by motion alone.

Zero results, slow loads and errors while filtering: SC6 in [every-screen.md](../every-screen.md).

## Honesty items here

HO2 ("3 people are viewing", invented stock), HO4 (an upgrade or add-on the user did not ask for, pre-selected so it adds cost; a visibly priced default chosen per CH1 is fine), HO6 (counts and ratings on options), HO12 (a paid item under a personal label). Details in [honesty.md](../honesty.md).

## Build moves

- **Choose defaults and options from data.** Pre-fill the most common real choice; offer presets from real usage; keep a custom control. With no usage data yet, pick the likely case, write down that it is an assumption, and plan to replace it (CH1, CH3). Defaults never add cost or consent.
- **Show consequences before commitment.** Counts on options, totals on buttons, previews that update as inputs change, the user's known inputs turned into the number the system needs (CO1, CH6, CH7).
- **Keep the user oriented.** Sheets over content instead of full-page takeovers, sticky context when scrolling, motion that shows where things come from and respects reduced-motion settings (CH8, CH14, CH15). Design empty, loading and error states with the same care as the full state (SC6).
