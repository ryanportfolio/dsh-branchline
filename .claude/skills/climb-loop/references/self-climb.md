# Self climb rules

Used by SKILL.md section 8. Self climb changes only the parts below. Stop rules, council, judge folder, valid result, contract categories, scripted floor, capture rig, brief and ratchet (section 4 step 6) all hold.

- **No round 0 judging**, so no section 4 noise check call. Round 1 is the first judge call.
- **Noise log** (no extra call): when champion is not baseline, compare each seat's champion-vs-baseline order (above, tied, below) per category with that seat's most recent earlier round that judged the same champion commit under the same brief version, if any; log categories where it changed. 2+ in one seat → report it and offer the user section 4 step 1's N calls per seat before the next round. With N calls, a seat accepts, beats or shows a regression when more than half its calls do; its noise log uses its first call.
- **New brief version** (section 3): no baseline rerun and no noise check call; noise log comparisons restart; a pending confirmation round reruns under the new version.
- **Letters per round**: baseline, champion (best accepted version, commit recorded), 2 challengers, each a separate commit branched from the champion commit, each a distinct direction from ours' defects (round 1: gaps between build and picked concept). Champion = baseline → 3 letters. Judges never learn which letter holds which role.
- **Beats** (X beats Y for one seat): X sits in a lower tier than Y in no category, and in a strictly higher tier than Y (not tied) in at least half the categories.
- **Seat accepts** a challenger that beats the champion.
- **Short-circuit** (replaces staged admission): seats judge one at a time in section 4 step 2 order on the same captures (without Opus: Sol, then Astra). After each seat, keep only challengers every seat so far accepted; none left → round over, remaining seats skip.
- **Champion change**: only a challenger every seat accepted. Two left → more categories in a strictly higher tier than champion, summed over seats and their calls; tie → smaller diff. Losing challengers stay on their commits, unmerged.
- **Regression**: 2+ seats in one round put baseline in a higher tier than champion in a category → stop and tell the user before another round (the redesign may be worse there). One seat alone = noise, logged.
- **Gate (plateau)**: two build rounds in a row with no champion change; replaces section 4's no-gain stop. Champion still = baseline → no confirmation round; report no gain, ask the user. Else one confirmation round, champion vs baseline only, fresh shuffle and judges: champion beats baseline for every seat. Fail → report, ask the user.
- **Taste**: no rival sets the bar → show the user each new champion; their notes become contract amendments (section 4 step 7).
- **`state.json`** adds role per letter, champion commit, challenger commits, plateau count, noise log. Resume (section 6) reruns the seats of the interrupted round.
- **Report**: only after a passed confirmation round, state that ours beat its own baseline, with no outside bar. Cap, budget, regression stop or failed confirmation → report "not shown better than baseline". Never claim it beats or matches other products. History table: round × seat × challenger, accepted or not, champion commit, noise log; each picked concept named.
