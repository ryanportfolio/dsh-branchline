# Dispatch

Read from the wow-loop skill: role briefs and the browser rule before each dispatch, the critic report schema in section 5, the bakeoff in section 6, blind judging in section 7.

## Role briefs (what each dispatch must contain)

- Director: recon output, reference identity, user goal, item list if any; returns `spec.md` and `bar.md` per section 2.
- Implementer: contract, module, its items, allowed paths, ranked findings, local checks, capture hook, browser rule; returns the section 4 report.
- Critic: contract, references, baseline captures, artifact access, capture instructions, browser rule, severity anchors, report schema, lens; never the user's target score; returns the section 5 report. Open findings arrive as a second message.
- Judge: pairs labeled A and B only, the contract criteria list, browser rule if it must render; returns preference, reasons, criteria per pair.

## Browser rule: Drive

Carried verbatim, with the Launch part from the skill's invariants, into every subagent brief that renders or drives a page.

- Drive: tie every capture to exactly one action on the right page. Find the app's page by a marker in its DOM, such as a `data-*` root; zero hits means the target is unknown: print each open page's URL and title, pick from that printout, and record which one. Attach to Electron or Chromium apps with `--remote-debugging-port`. Screenshot before and after each action that changes structure, and run one such action at a time. Locate elements by accessible role, label, or `data-*` attribute; take screen coordinates only from a screenshot of the current state. Element references go stale after navigation or a DOM change, so look them up again. Keep a list of every process and profile the run launches; teardown works from that list and touches nothing else.

## Critic report

Report is JSON, parsed by the orchestrator, so no finding is lost to vocabulary drift: `fingerprint`, `contract_version`, `checks: {id: {status: passed|failed|unavailable, evidence: []}}`, `findings: [{id, check, module, item, severity: blocker|major|minor, gating: bool, evidence: [], measurement, reproduction, repair}]`, `resolutions: {prior_id: fixed|open|refuted, with evidence}` for every open finding handed over in the second message, `gaps: []`.

## Bakeoff

Failing a third time may justify a bakeoff within remaining budget and exposed capacity: two fresh implementers in separate worktrees get the same finding, both results are captured under the same rig, and one fresh judge picks between them blind (same product, so blinding holds); the winner's diff lands, the loser's worktree goes.

## Blind judging

When reference fidelity is a goal and comparable evidence exists, two fresh judges each receive matched pairs (ours vs reference, same view, same conditions) labeled only A and B, order shuffled per judge, provenance and prior verdicts withheld, label mapping kept outside their briefs, file names free of any hint. Each judge states a preference or tie per pair, the visible reasons, and the contract criteria involved. A recognizable reference (a famous ship, a well-known site) limits blinding; record that.
