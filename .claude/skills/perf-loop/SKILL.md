---
name: perf-loop
description: "Measured optimization rounds with independent review: FPS, loading, latency, throughput, resources; no named target → triage every dimension first. Use: /perf-loop, broad perf requests. Skip isolated fixes."
---

# Performance loop

Goal: faster user-facing perf via reproducible experiments + independent review. Preserve behavior + quality. Target, constraints, authorization ← request. No named target → triage every applicable dimension first; user picks focus from its table before any round.

## Scope + measurement path

ID key user journeys, workload, target devices, existing perf budgets. Infer sane defaults from project; state them. Ask only when missing info changes goal or needs user-owned tradeoff. Audit request → stop at findings + recommendations.

Check exposed tools before promising profiling, browser capture, or independent review. Preflight chosen measurement method w/ 1 real run; inspect output. Missing capability → narrower claim: code inspection yields hypotheses, never proof of runtime gain. Report gap; finish useful authorized work w/o claiming full gate passed. For a named browser/device, preflight that target; another engine or emulated viewport supports only a separately labeled diagnostic. Record which timing, trace and memory methods actually work.

Load only relevant guidance:

- [Rendering and interaction](references/rendering.md): FPS, frame pacing, games, animation, responsiveness, visual quality.
- [Loading and delivery](references/loading.md): startup, page loads, assets, bundles, network requests, readiness.
- [Services and resources](references/services.md): APIs, DBs, throughput, memory, CPU, disk, sustained workloads.
- [Chromium](references/chromium.md): Chrome/Edge traces, DevTools insights, CDP counters, CPU + network throttling, CPU profiles via Playwright; no DevTools MCP needed.
- [Firefox](references/firefox.md): Firefox-specific capture, graphics diagnosis and memory tools when Firefox is a target or behaves differently from another browser.

Experiment evidence + before/after presentation → packaged [evidence report](references/evidence-report.md); measurement + review gates below still apply.

Existing project tools first. Workflow grants no permission to install tools, run disruptive prod load, publish changes, or alter unrelated infra.

## Triage when target open

Trigger: request names no specific metric/scenario (skill invoked alone, "make it faster", "optimize everything"). Follow [triage](references/triage.md): measure each applicable dimension vs a reference, profile just far enough to name its top contributor, present ranked table. No code changes during triage.

Then stop; wait for user to pick focus. Never pick for them. Unattended run → table = final report. Audit request may also end at table.

User names target → skip triage, mention it's available, go to baseline. Triage numbers = diagnostic only; chosen target always gets own full baseline.

## Repeatable baseline

Capture current working state incl. relevant uncommitted changes → baseline + candidate rebuildable w/o discarding user work. Record source state, build mode, commands, dep versions, device/runtime, dataset, scenario, sampling duration. Acceptance → representative optimized build; label diagnostic dev runs separately.

Control cache state, warmup, resolution, quality settings, concurrency, random seeds where useful, power/thermal. Cold + warm runs separate. Confirm intended build running. Record unavoidable diffs + their limits. Each run record identifies build, runtime, phase and sample duration; include URL/origin and renderer mode where relevant. A port alone is not build identity. Use existing diagnostics or a saved record; do not add product UI solely for this.

Separate relevant phases: initial startup, first action, steady animation, settled idle, hidden/resumed state and repeated navigation. Keep initial stalls in their own window; a rolling steady-state average must not erase them. Protect adjacent phases affected by a fix without expanding a narrow request into an unrelated audit.

Save the scenario, protocol and run identities before long runs. Pilot enough of the real journey to validate collection and settled-state signals, then expand for repeatability or suspected accumulation. If extra cycles cannot answer the question with available tools, change the measurement path instead of extending the run.

Repeat baseline enough to expose variation. Quick deterministic scenarios: ≥3 runs to start; expensive/noisy workloads need justified sample plan. Keep raw measurements, sample counts, units, distributions. Tiny sample ≠ reliable tail percentile. Fix measurement window + exclusion rules before evaluating candidates; keep + explain invalid runs, never silently drop inconvenient results.

Benchmarks serial on shared hw. Pause agent builds, tests, other benchmarks, profiling that compete for measured resources. Shared browser control: 1 owner at a time. Separate build outputs + ports when multiple envs needed. Never kill unrelated user processes to clean up a measurement.

Per-run scratch (browser profiles, user-data dirs, temp builds, raw dumps) → delete as each run ends, pass or fail, once the process using it has exited. Do it in harness code (`try/finally`, Node `fs.rm`), not a later shell step: agent command policies can refuse recursive shell deletes. Reuse 1 prepared template profile when the scenario needs no fresh state. Keep only artifacts the analysis needs: results, logs, captures. Long loop → check scratch size between rounds. Delete fails or is blocked → report path + size right away; never leave it silent.

## Set bar + profile

Before editing, define: primary outcome metric, practical success threshold, protected scenarios, regression tolerances. Existing budgets, else derive target from request + baseline; label inferred targets. No universal score targets or unsupported all-device promises.

Profile actual slow scenario. Rank bottlenecks by measured contribution, user impact, confidence, fix cost. Suspected bottlenecks = hypotheses. Prefer end-to-end wins over proxy wins (smaller bundle w/ unchanged readiness; higher FPS w/ worse input latency).

When expensive components overlap, isolate them before an architectural rewrite: reproduce each alone, together, and with startup staggered as relevant. Use the smallest reversible experiment that distinguishes competing explanations. Workers can relieve main-thread contention while still competing for graphics resources. Isolation runs are diagnostic: prefer existing controls; record temporary edits and restore the source before acceptance runs. A retained change needs its own candidate comparison. Audit-only requests use existing controls unless code edits are authorized.

## Bounded experiments

1 implementer/round, 1 testable hypothesis; small coupled change OK when needed to test it. Experiment record → project's existing artifact location, else task-local dir:

| Field | Evidence to record |
| --- | --- |
| Scenario and source states | Workload, baseline and candidate identifiers, reproduction commands |
| Bottleneck and hypothesis | Profile evidence and expected effect on the primary metric |
| Change and constraints | Files changed and behavior or quality that must be preserved |
| Measurements | Raw evidence paths, run counts, absolute values, variation, and deltas |
| Regression checks | Protected scenarios and functional or visual evidence |
| Verdict | Keep, discard, or inconclusive, with the reason |

Same workload after each change. Alternate baseline/candidate runs when practical → detect env drift. Diagnostic profiler traces ≠ minimally instrumented acceptance runs; keep measurement overhead comparable. Report absolute + relative change w/ clear direction of improvement.

Check correctness + affected user journeys alongside perf. Preserve features, visual fidelity, a11y, security, data integrity, existing resource constraints. Cutting resolution, effects, content, durability, or other quality → explicit agreement needed when it changes intended experience. Moving work into first interaction or growing memory to cut latency = tradeoff; measure it.

Keep: repeatable, practically meaningful gains w/ no disallowed regressions. Failed experiment → revert only this round's edits. Gain within run variation → inconclusive. Meaningful win → re-profile; bottleneck may move. Never keep speculative changes just because they look efficient.

Next hypothesis ← whole experiment record (kept, discarded, inconclusive + why), not best result so far. After discard → next-ranked bottleneck unless new profile evidence justifies staying; discarded hypothesis returns only w/ such evidence. Stop rule still applies: 2 consecutive rounds w/o retained gain → loop ends, whichever bottleneck targeted.

## Independent challenge

Before accepting a round → fresh independent review via exposed agents. Check capacity, counting manager + active workers; lenses don't fit together → separate sequential fresh contexts. Honor explicit model choices; else inherit configured model. Requested model unavailable → disclose, never silently substitute. Claude Code: exposed `Agent` tool, standalone brief, fresh context, no conversation inheritance. Other runtimes: exposed fresh-context equivalent; config alone ≠ availability. Brief = request, constraints, skill, exact source states, diff, reproduction commands, raw evidence paths. Label implementer conclusions unverified. Reviewers inspect evidence + code themselves.

- Measurement reviewer: challenge comparability, sample sufficiency, benchmark relevance, overhead, noise, interpretation. Reproduce decisive comparison when feasible; else state runtime reproduction unverified.
- Regression reviewer: inspect full experiment diff, exercise affected behavior, challenge quality losses, resource shifts, a11y damage, edge cases. Visual change → read actual captures.

Separate fresh agent per lens. Concurrent artifact reads OK; measurement + other resource-heavy work serial. Agent availability ≠ access to required profiler, browser, runtime. Independent review unavailable → report gap; self-review ≠ independent.

Each reviewer → confirmed / refuted / unresolved findings w/ evidence paths + severity. No findings ≠ proof of gain. Confirmed finding → reproduce, fix via sole implementer, rerun affected measurement + regression checks on resulting state.

## Stop + report

Default ≤5 implementation rounds; fewer when target reached or further gains not worth cost. Stop early: 2 consecutive rounds w/o retained meaningful gain, or progress needs missing capability / user-owned tradeoff. Respect tighter user time/cost budget.

Orchestrator checks final combined state w/ decisive benchmark + appropriate project verification. Recheck affected first-use, idle and navigation behavior; delayed work must not simply move a stall into the next action. Attribute gains vs original baseline and, where useful, per round. Independent wins ≠ guaranteed combined speedup.

Report one outcome:

- **Target met:** declared budgets pass under documented conditions, required reviews + regression checks pass, no blocking finding left. Baseline already met them → say no optimization needed.
- **Improved, target unmet:** retained gains verified; budget or scope goal still unmet.
- **Inconclusive:** evidence can't support reliable perf conclusion, or required verification missing.
- **No retained improvement:** tested candidates failed, regressed, or gave no meaningful gain.

Include compact before/after table, tested conditions, kept + discarded changes, evidence paths, unresolved limits. Claim only devices, workloads, envs actually tested. Clean up only processes + temp resources this task created; report any scratch still on disk w/ path + size.
