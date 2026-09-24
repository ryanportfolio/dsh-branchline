# Rendering and interaction

## Choose measurements

Tie the scenario to representative scene complexity, input, viewport, device pixel ratio, quality settings, and duration. Include startup effects, steady state, transitions, and the heavy scene relevant to the complaint.

- Record frame times in milliseconds, a distribution with supported percentiles, and hitch counts against a declared threshold. Average FPS alone can hide stutters. If using a low-FPS statistic, record the tool's definition.
- Derive the frame-time budget from the requested refresh target: `1000 / target FPS`. VSync and frame caps can hide headroom, so inspect frame cost as well as presented FPS.
- Measure input-to-visible-response separately from rendering throughput. A faster loop can still defer input handling.
- Split CPU and GPU work with available profilers. Record main-thread tasks, draw calls, shader compilation, uploads, allocations, and garbage collection only where they explain the observed bottleneck.

## Avoid misleading runs

Confirm rendering stays active: background tabs, occluded or minimized windows, headless execution, software rendering, refresh caps, and power modes can change the result. Record the actual rendering environment; do not claim device GPU performance from an unmatched environment.

Use repeatable gameplay or interaction sequences, with realistic stress and a fixed seed where appropriate. Keep warmup and shader compilation treatment explicit. Do not remove real first-use stalls from a startup metric by warming them away.

Traces, video capture, screenshots, and overlays may add overhead. Use matching instrumentation for comparisons and separate quality captures from clean timing runs when needed. A frozen frame supports visual comparison but cannot prove live pacing.

## Preserve the experience

Compare equivalent scenes and states with actual captures, then run the natural interaction. Check effects, lighting, text, responsive layout, reduced motion, keyboard behavior, and hit targets where affected. Validate timing-dependent simulation and animation at different frame rates after changing scheduling or timestep logic.

Investigate batching, culling, redundant renders, allocation churn, asset uploads, and scheduling only when profiles point there. Lowering resolution, entity count, animation rate, or visual effects is a quality change; obtain agreement before accepting it as the solution.
