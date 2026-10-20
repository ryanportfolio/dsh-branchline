# Triage

Measure every perf dimension that applies, rank, hand user a table to pick focus from. Triage finds + ranks problems only. No code changes; its numbers never = acceptance baseline.

## Dimensions

List each dimension that applies. Method ← named reference.

| Dimension | What to measure | Method |
| --- | --- | --- |
| Loading and readiness | Time to visible content + successful first action, cold + warm, main routes or launch path | [Loading](loading.md) |
| Delivery size | Compressed transfer + decoded bytes per route/artifact; largest bundles, assets, deps | [Loading](loading.md) |
| Rendering | Frame-time distribution + hitch count in heaviest scene, animation, or scroll | [Rendering](rendering.md) |
| Input responsiveness | Input → visible response on main interactions | [Rendering](rendering.md) |
| Memory | Peak, retained after idle, growth over repeated cycles of main journey | [Services](services.md) |
| Service latency and throughput | Latency percentiles, completed ops/s, errors at stated load | [Services](services.md) |
| CPU, disk and startup | Process startup, CPU time, I/O on sustained workload | [Services](services.md) |

Project has a dimension this list misses (battery, build time, serverless cold start) → add it. Keep every row. Doesn't apply → "not applicable" + reason. Tools can't measure → "not measured" + missing capability. Never drop a row silently.

## Measure

Same setup rules as full loop: representative optimized build, 1 preflight run per method, controlled cache + warmup, serial runs on shared hw. Short run set per dimension: ≥3 runs for quick deterministic scenarios; stated smaller plan for expensive ones. Record units, run counts, spread; keep raw evidence paths.

Profile each dimension just far enough to name top contributor: largest module/asset, longest main-thread task, slowest query, fastest-growing allocation. Stop there. Deeper diagnosis after user picks focus.

## Reference

Number alone ≠ problem. Compare each row vs, in preference order:

1. Existing project budget.
2. Published reference, labeled inferred: e.g. `1000 / target FPS` frame budget, or current official web-vitals thresholds checked vs their docs.
3. None → say so; rank by judged user impact, labeled judgment.

## Table

| Rank | Dimension | Scenario | Measured (unit, runs, spread) | Reference (source) | Gap | Top contributor | Confidence | Fix cost | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Rank by miss size vs reference, weighted by user impact; state ordering rule used. Passing rows stay, marked passing. "not applicable" + "not measured" rows last.

After table: name your pick + why, 1-2 sentences. Then stop; wait for user choice. Never start a round on own choice. Unattended run, nobody to choose → end here, report table.

Chosen dimension → primary metric. Full baseline for it before round 1; triage runs too few to accept a change against.
