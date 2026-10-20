# Firefox performance

Read this when Firefox is a target or behaves differently from another browser. Use the shared rendering, loading and resource guidance for acceptance criteria; this reference supplies the Firefox measurement path.

## Establish the measurement path

Record the exact Firefox version/channel, OS, GPU/driver and graphics configuration, viewport, actual device pixel ratio, display refresh rate, profile/extensions, cache state and build identifier. Reproduce the reported configuration first. A clean profile can isolate extensions or preferences, but is a separate diagnostic condition. Do not silently disable hardware acceleration or change graphics preferences to obtain a passing result.

Each run launched with its own `-profile <dir>` leaves 50 to 150 MB on disk. One loop that kept every run's profile filled about 33 GB in a day. Delete a run's profile when that run ends: confirm no `firefox.exe` command line still names the directory, then remove it from the harness code. When the scenario needs no fresh state, copy one prepared template profile per run instead of building a new one.

Check the exposed browser/automation tools. A Chromium browser panel, Chromium-specific protocol command or mobile-sized viewport cannot establish Firefox or physical-device performance. Probe the required method with one real capture. Report a bridge's unsupported command as a tool limitation, not evidence that Firefox lacks the capability. If direct control is unavailable, prepare the exact scenario and request one bounded user capture with its build identity when interactive; an unattended run records Firefox as not measured. Continue source diagnosis without claiming Firefox acceptance.

Check observed timestamp precision and `crossOriginIsolated`; record relevant timer-precision or fingerprinting-resistance settings when they affect the measurements. Treat in-page intervals as quantized at that precision. If a budget needs finer timing, use suitable native profiler evidence or mark the result inconclusive. Do not weaken privacy settings to obtain passing numbers; an authorized settings change is a separate diagnostic condition.

## Capture the failing interval

Use Firefox Profiler through its available UI or automation. Select a preset suited to the complaint and verify that the capture includes the relevant content process, workers and graphics activity where supported. Start before the triggering navigation or interaction and capture promptly after the hitch. Its rolling buffer can discard the initial stall if recording continues too long.

Add sparse UserTiming markers with `performance.mark()` / `performance.measure()` around useful application phases: initialization, asset readiness, scene creation, loader exit, first interaction and teardown. These appear as UserTiming markers in the profiler. Markers describe application events; an upload/submission marker does not prove a frame was presented.

Locate the worst interval, then test the explanation: application execution, style/layout/paint, image decode, upload/shader work, GC/CC or another competing component. Availability of a track or counter varies; state what the recording actually supports. Inspect other processes/threads when the content main thread does not explain the symptom. A worker's steady callback rate alone cannot rule out graphics contention.

Keep startup and steady-state windows separate. Preserve the initial gaps instead of replacing them with the latest rolling average. Native traces locate causes; final timing comparisons use matched, minimally instrumented runs. Do not require publishing a profile: keep local captures local unless sharing is authorized.

## Investigate retained memory

Pilot repeated navigation using settled page states. If memory or old page objects keep growing, switch to Firefox's Memory tool: compare heap snapshots at equivalent lifecycle points and inspect dominators and retaining paths. Enable allocation stacks before reproducing the allocation when needed; their overhead belongs in a diagnostic run.

Use `about:memory` for broader process memory reports and GC/CC controls. Save before/after reports using the same procedure. Natural-idle and forced-collection results answer different questions; keep collection outside timing runs. A JavaScript heap snapshot does not account for every native or GPU allocation. Console variables, remote object handles and instrumentation can themselves retain inspected objects; release those references before judging collection.

## Maintained sources

Consult current official documentation when UI, preset names or supported APIs differ from this guidance:

- [Record and capture a Firefox profile](https://firefox-source-docs.mozilla.org/performance/reporting_a_performance_problem.html)
- [Timestamp precision and isolation](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now#security_requirements)
- [Animation callback timestamps](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame#parameters)
- [UserTiming markers in page code](https://firefox-source-docs.mozilla.org/tools/profiler/instrumenting-javascript.html)
- [Memory snapshots](https://firefox-source-docs.mozilla.org/devtools-user/memory/index.html)
- [Dominators and retaining paths](https://firefox-source-docs.mozilla.org/devtools-user/memory/dominators_view/index.html)
- [Process memory reports and collection controls](https://firefox-source-docs.mozilla.org/performance/memory/about_colon_memory.html)
