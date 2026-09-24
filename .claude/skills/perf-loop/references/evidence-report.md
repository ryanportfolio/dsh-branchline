# Evidence report

Use a compact record when evidence spans several checks, a handoff, or a before/after
comparison. A small current-state claim can stay in the reply. Extend the workflow's
existing report or state instead of introducing a second acceptance system.

## Record the inspected state

Record the claim, observable criterion, and whether it concerns current state, change,
or causation. For each run, identify the actual workspace and source content: revision
when available, relevant dirty/untracked path hashes or a preserved snapshot, and
generated artifact hashes. Record build mode and command, runtime/dependency versions,
inputs, device and other conditions that affect the claim. Verify that the served or
rendered output belongs to that source state; a commit ID alone cannot prove this.
Exclude report files from source fingerprints to avoid invalidating a run by recording it.

Keep commands or reproduction steps, expected and observed results, and timestamped
evidence pointers. A useful compact table is:

| Check and criterion | Source/run | Reproduction and conditions | Expected / observed | Evidence and capture time | Status |
| --- | --- | --- | --- | --- | --- |
| <observable condition> | <snapshot/build identity> | <command or steps; relevant environment> | <criterion / result> | <local path, log excerpt or artifact; timestamp> | passed / failed / untested |

Use `untested` with the reason when execution was unavailable or skipped. Preserve
native workflow states such as `unavailable` or `stale`; if summarized as untested,
retain that reason. A stale pass is not a current pass. Missing required evidence leaves
acceptance incomplete, while unrelated valid checks remain useful.

State the claim verdict separately: `VERIFIED` when suitable evidence meets the
criterion, `NOT VERIFIED` when valid evidence contradicts it, and `INCONCLUSIVE`
when evidence or criteria cannot decide it. Preserve any stricter workflow acceptance
gate and its own outcome. A passing current-state check needs no historical baseline.
A claimed improvement needs a comparable baseline; causal attribution also needs a
design isolating the proposed cause. Before/after correlation alone cannot do that.

## Present a comparison

Use the existing capture, render, log or measurement tools. Save original evidence
locally in the task's artifact directory. For a visual change, present labeled before
and after captures side by side or as a short sequence, with source/run identities,
capture times and captions tied to the criterion. Use clips when timing or interaction
matters and static captures when they establish the claim. Inspect every cited artifact.

Match the relevant view, viewport, zoom, data, interaction state, animation timing,
device and rendering conditions. Record unavoidable differences. Keep originals when
cropping or annotating for readability; label those edits and do not hide defects.
Performance comparisons use measured values, units, sample counts and variation;
screenshots only support accompanying visual claims.

If no valid before capture exists, label the result current-only and disclose that
change is unverified. Do not fabricate a baseline, relabel a reference as the old
implementation, or disturb user work to reconstruct it. A labeled reference can support
fidelity checks without proving improvement. Preserve blind-review labels until judging
finishes, then attach the provenance mapping in the presentation.

Link the smallest useful evidence beside the conclusion and name failed, untested or
confounded checks. Follow existing data-handling rules and omit sensitive payloads.
Local presentation grants no authority to upload, publish, install a recorder or other
tool, or change external access.

Maintainers: keep this reference identical in the Claude and Codex `wow-loop` and
`perf-loop` folders. Package each copy with its skill for standalone use.
