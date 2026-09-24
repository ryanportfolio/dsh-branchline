# Visual review

Turn the relevant items below into named bar checks before implementation. Select only
what applies; a static document does not need browser or GPU checks.

## Capture contract

Record reference identity, viewport or export size, scale/zoom, camera position, lighting,
inputs, animation state/time, renderer settings, and environment where applicable.
Use fixed seeds for compared randomness and declared tolerances for rendering variation.
Freeze named states where useful, then inspect a natural run for behavior the freeze hides.

Capture and inspect multiple views that expose likely defects, including close-ups and
the intended presentation view. A screenshot of a successful command is not a render of
the artifact. Critics obtain their own captures; comparison judges can consume prepared
matched pairs after capture provenance has been verified by the orchestrator.

| Medium | Candidate checks |
|---|---|
| 3D | Silhouette/proportions from named angles; detail close-ups; material/light response; intersections and seams |
| Animation | Named beats; transitions; continuity; pacing; full natural playback |
| Interface | Target viewports; content extremes; hover/focus/error/loading states; keyboard and reduced-motion behavior |
| Document or graphic | Actual exported pages; hierarchy; legibility; alignment; cropping; continuity across pages |
| Runtime | Relevant console errors; failed resources; measured performance under recorded workload |

Require zero relevant runtime errors; distinguish unrelated baseline errors with evidence.
Set numerical performance budgets using the target environment, units, workload, and
measurement method. Triangle counts and draw calls help diagnose 3D work but cannot
establish acceptable frame time. Measure performance without competing resource-heavy jobs.

## Browser briefs

Pass applicable project browser requirements into every implementer and critic brief.
Where the project requires headed Chrome, preserve that requirement and use its placement
helper when available through supported tools. Do not minimize the measurement window;
verify rendering and throttling conditions before trusting animation or frame timings.
If the required environment cannot be established, mark its performance check unavailable.

Use currently exposed browser APIs. Select the intended page through its URL and a stable
app marker, never tab order alone. Confirm content unique to the current artifact before
accepting preview evidence. Refresh stale element references after structural changes;
take a fresh screenshot before coordinate actions. Verify consequential actions with an
appropriate observation or capture. Use CDP only where the exposed tool supports it.

Separate browser sessions when available, otherwise serialize ownership of shared control.
Do not let critics resize or navigate each other's measurement surface.

## Comparisons

Compare matched viewpoints, framing, resolution, and playback segments where possible.
Document unavoidable differences instead of interpreting them as artifact quality.
Reference fidelity means satisfying the requested reference contract; preference answers
which presentation a judge likes better. Keep these verdicts separate.

When comparative judging applies, prepare pairs with neutral A/B filenames and labels,
strip identifying metadata where practical, and store the mapping outside judge briefs.
Shuffle order independently for each of two fresh judges. Preserve visual content needed
for fair comparison; record recognizable branding or subjects that prevent full blinding.
Each judge returns A, B, or tie with visible reasons and relevant criterion IDs. Missing
mandatory comparative review leaves that review incomplete, even if other checks pass.

Tie or disagreement is not an automatic failure. Reconcile cited defects against the bar;
record unresolved preference differences without changing acceptance conditions.
