---
name: perf-loop
description: "Run measured optimization rounds with independent review for FPS, loading, latency, throughput, and resource use. Use for $perf-loop or broad performance improvement requests; skip routine isolated fixes."
---

# Performance loop

Improve the performance users experience through reproducible experiments and independent review. Preserve behavior and quality. Take the target, constraints, and authorization from the request; broad optimization means broad discovery within that target, followed by focused changes.

## Establish the scope and measurement path

Identify the important user journeys, workload, target devices, and existing performance budgets. Infer reasonable defaults from the project and state them. Ask only when missing information changes the goal or requires a user-owned tradeoff. An audit request stops at findings and recommendations.

Inspect exposed tools before promising profiling, browser capture, or independent review. Preflight the selected measurement method with one real run and inspect its output. Missing capabilities narrow the claim: code inspection can identify hypotheses but cannot prove runtime improvement. Report the gap and complete useful authorized work without claiming the full gate passed.

Load only relevant guidance:

- [Rendering and interaction](references/rendering.md): FPS, frame pacing, games, animation, responsiveness, and visual quality.
- [Loading and delivery](references/loading.md): startup, page loads, assets, bundles, network requests, and readiness.
- [Services and resources](references/services.md): APIs, databases, throughput, memory, CPU, disk, and sustained workloads.

For experiment evidence and before/after presentation, read the packaged
[evidence report](references/evidence-report.md); retain the measurement and review gates below.

Use existing project tools first. This workflow does not grant permission to install tools, run disruptive production load, publish changes, or alter unrelated infrastructure.

## Record a repeatable baseline

Capture the current working state, including relevant uncommitted changes, so baseline and candidate can be rebuilt without discarding user work. Identify source state, build mode, commands, dependency versions, device/runtime, dataset, scenario, and sampling duration. Use a representative optimized build for acceptance; diagnostic development runs must be labeled separately.

Control cache state, warmup, resolution, quality settings, concurrency, random seeds where useful, and power/thermal conditions. Keep cold and warm runs separate. Confirm the intended build is running. Record unavoidable differences and their limits.

Repeat the baseline enough to expose variation. For quick deterministic scenarios, start with at least three runs; expensive or noisy workloads need a justified sample plan. Retain raw measurements, sample counts, units, and distributions. A tiny sample does not establish a reliable tail percentile. Fix the measurement window and exclusion rules before evaluating candidates; retain and explain invalid runs instead of silently dropping inconvenient results.

Run benchmarks serially on shared hardware. Pause agent builds, tests, other benchmarks, and profiling work that compete for the measured resources. Give shared browser control one owner at a time. Keep build outputs and ports separate when multiple environments are necessary. Never stop unrelated user processes to clean up a measurement.

## Set the bar and profile

Define the primary outcome metric, practical success threshold, protected scenarios, and regression tolerances before editing. Use existing budgets or derive a target from the request and baseline; label inferred targets. Avoid universal score targets or unsupported promises about all devices.

Profile the actual slow scenario. Rank bottlenecks by measured contribution, user impact, confidence, and fix cost. Treat suspected bottlenecks as hypotheses. Prefer end-to-end improvements over proxy wins such as smaller bundles with unchanged readiness or higher FPS with worse input latency.

## Run bounded experiments

Use one implementer per round and one testable hypothesis, allowing a small coupled change when needed to test it. Keep an experiment record in the project's existing artifact location, or a task-local directory:

| Field | Evidence to record |
| --- | --- |
| Scenario and source states | Workload, baseline and candidate identifiers, reproduction commands |
| Bottleneck and hypothesis | Profile evidence and expected effect on the primary metric |
| Change and constraints | Files changed and behavior or quality that must be preserved |
| Measurements | Raw evidence paths, run counts, absolute values, variation, and deltas |
| Regression checks | Protected scenarios and functional or visual evidence |
| Verdict | Keep, discard, or inconclusive, with the reason |

Reproduce the same workload after each change. Alternate baseline and candidate runs when practical to detect environment drift. Distinguish profiler traces used for diagnosis from minimally instrumented acceptance runs; keep measurement overhead comparable. Report absolute and relative changes with a clear direction of improvement.

Check correctness and affected user journeys alongside performance. Preserve features, visual fidelity, accessibility, security, data integrity, and existing resource constraints. Reducing resolution, effects, content, durability, or other quality requires explicit agreement when it changes the intended experience. Moving work into first interaction or growing memory to reduce latency must be measured as a tradeoff.

Keep changes with repeatable, practically meaningful gains and no disallowed regressions. Discard failed experiments by reverting only this round's edits. Treat improvements indistinguishable from run variation as inconclusive. Re-profile after meaningful wins because the bottleneck may move. Do not keep speculative changes merely because they look efficient.

Pick the next hypothesis from the whole experiment record (kept, discarded, inconclusive, and why), not from the best result so far. After a discard, the next round moves to the next-ranked bottleneck unless new profile evidence justifies staying; a discarded hypothesis returns only with such evidence. The stop rule below still applies: two consecutive rounds without a retained gain end the loop, whichever bottleneck they targeted.

## Independent challenge

Before accepting a round, obtain fresh independent review through exposed agents. Inspect capacity, counting the manager and active workers; run the two review lenses in separate sequential fresh contexts when they cannot fit together. Honor explicit model choices; otherwise inherit the configured model. Disclose an unavailable requested model rather than silently substituting it. In Codex, use `collaboration.spawn_agent` with `fork_turns: "none"`. Provide the request, constraints, skill, exact source states, diff, reproduction commands, and raw evidence paths. Clearly label implementer conclusions as unverified. Reviewers must inspect evidence and code themselves.

- Measurement reviewer: challenge comparability, sample sufficiency, benchmark relevance, overhead, noise, and interpretation. Independently reproduce the decisive comparison when feasible; otherwise state that runtime reproduction remains unverified.
- Regression reviewer: inspect the full experiment diff, exercise affected behavior, and challenge quality losses, resource shifts, accessibility damage, and edge cases. Read actual captures when visual behavior changes.

Use separate fresh agents for these lenses. They may read artifacts concurrently, but schedule measurement and other resource-heavy work serially. Agent availability alone does not prove that the required profiler, browser, or runtime is accessible to them. If independent review is unavailable, report that gap rather than substituting self-review and calling it independent.

Each reviewer returns confirmed, refuted, or unresolved findings with evidence paths and severity. A lack of findings alone cannot establish a performance gain. Reproduce confirmed findings, fix through the sole implementer, and repeat the affected measurement and regression checks on the resulting state.

## Stop and report

Default to at most five implementation rounds, fewer when the target is reached or further gains no longer justify the cost. Stop earlier when two consecutive rounds yield no retained, meaningful gain, or when further progress requires a missing capability or user-owned tradeoff. Respect any tighter user time or cost budget.

The orchestrator checks the final combined state with the decisive benchmark and appropriate project verification. Attribute gains both to the original baseline and, where useful, individual rounds. Independent wins do not guarantee that the combined changes remain faster.

Report one outcome:

- **Target met:** the declared budgets pass under the documented conditions, required reviews and regression checks pass, and no blocking finding remains. If the baseline already met them, say no optimization was needed.
- **Improved, target unmet:** retained gains are verified, but a budget or scope goal remains unmet.
- **Inconclusive:** evidence cannot support a reliable performance conclusion or required verification is missing.
- **No retained improvement:** tested candidates failed, regressed, or did not produce a meaningful gain.

Include a compact before/after table, tested conditions, kept and discarded changes, evidence paths, and unresolved limits. Claim only the devices, workloads, and environments actually tested. Clean up only processes and temporary resources created for this task.
