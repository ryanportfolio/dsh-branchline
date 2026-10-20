# Rendering and interaction

## Measurements

Tie scenario to representative scene complexity, input, viewport, device pixel ratio, quality settings, duration. Include startup effects, steady state, transitions, heavy scene relevant to complaint.

- Frame times in ms: distribution w/ supported percentiles + longest gap + hitch count vs declared threshold. Avg FPS alone hides stutter. Low-FPS stat → record tool's definition.
- Frame-time budget from requested refresh target: `1000 / target FPS`. VSync + frame caps can hide headroom → inspect frame cost as well as presented FPS.
- Measure input-to-visible-response separately from render throughput. Faster loop can still defer input handling.
- Split CPU vs GPU work w/ available profilers. Record main-thread tasks, draw calls, shader compilation, uploads, allocations, GC only where they explain observed bottleneck.

Name the observed stage: callback rate (for example rAF), render submission, GPU execution or visible presentation. These are different measurements. Fast callbacks do not prove smooth presentation; a texture-ready flag or completed CPU submission does not prove a visible frame. If presentation is unobservable, report the proxy and its limit.

For a frame cap, derive the nominal interval from the agreed target and check pacing at relevant display refresh rates. An average matching the cap can conceal alternating intervals or large stalls. Frame-spaced GPU samples avoid treating a back-to-back burst as ordinary animation. Use timer-query availability/disjoint checks; do not infer cheap GPU work from unsupported or invalid results.

## Misleading runs

Confirm rendering stays active: background tabs, occluded/minimized windows, headless execution, software rendering, refresh caps, power modes all change result. Record actual rendering env, including actual DPR and canvas raster size; never claim device GPU perf from unmatched env. Verify visibility and rendering activity in the run rather than trusting window flags or requested emulation settings.

Repeatable gameplay/interaction sequences, realistic stress, fixed seed where apt. Warmup + shader-compilation treatment explicit. Never warm away real first-use stalls from a startup metric.

Traces, video capture, screenshots, overlays may add overhead. Matching instrumentation for comparisons; separate quality captures from clean timing runs when needed. Frozen frame supports visual comparison, can't prove live pacing.

## Preserve experience

Compare equivalent scenes + states w/ actual captures, then run natural interaction. Check effects, lighting, text, responsive layout, reduced motion, keyboard behavior, hit targets where affected. Changed scheduling/timestep logic → validate timing-dependent sim + animation at different frame rates.

Investigate batching, culling, redundant renders, allocation churn, asset uploads, scheduling only when profiles point there. Lower resolution, entity count, animation rate, visual effects = quality change → get agreement before accepting as solution.
