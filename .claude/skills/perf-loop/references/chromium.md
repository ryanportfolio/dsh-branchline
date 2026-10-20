# Chromium traces and CDP

Read this when Chrome, Edge or another Chromium browser is the target and you need a performance trace, DevTools insights, runtime counters, CPU or network throttling, or a CPU profile. Playwright talks to Chromium over the Chrome DevTools Protocol (CDP), the same channel the DevTools panel and chrome-devtools-mcp use, so none of this needs a DevTools MCP server. Use the shared rendering, loading and resource guidance for acceptance criteria; this reference supplies the Chromium measurement path.

## Setup

Launch through `launchPlacedChrome()` (`scripts/lib/launch-chrome.mjs`): headed Chrome on the real GPU, placed out of the operator's way, one browser per script, so parallel subagents each get their own. It needs `playwright` or `playwright-core`. DevTools insights also need `@paulirish/trace_engine`, the trace engine from the DevTools Performance panel published to npm.

This workflow grants no permission to install tools. If a package is missing, ask; with approval, `npm i --no-save playwright-core @paulirish/trace_engine` keeps them out of `package.json`. In an unattended run without them, record insights as not measured and work from raw trace events or the CDP calls below.

Playwright launches Chromium with a temporary profile and removes it on `browser.close()`. Close in a `finally` block so failed runs clean up too; a crashed or killed run leaves a `playwright_chromiumdev_profile-*` folder in Temp. A persistent `--user-data-dir` follows the per-run scratch rule in SKILL.md: delete it when the run ends.

Preflight each method with one real capture and inspect its output before relying on it.

## Capture a trace

```js
import { launchPlacedChrome } from '../scripts/lib/launch-chrome.mjs'; // path from a script in .tmp/

// the categories the DevTools Performance panel records; insights need the disabled-by-default ones
const CATEGORIES = [
  '-*', 'devtools.timeline', 'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame', 'disabled-by-default-devtools.timeline.stack',
  'v8.execute', 'disabled-by-default-v8.cpu_profiler', 'blink.user_timing', 'blink.resource',
  'loading', 'latencyInfo', 'toplevel', 'disabled-by-default-lighthouse',
  'disabled-by-default-devtools.timeline.invalidationTracking', 'disabled-by-default-layout_shift.debug',
];

const browser = await launchPlacedChrome({ purpose: 'perf trace' });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await page.goto('about:blank');
await cdp.send('Performance.enable'); // counters start here, so enable before the scenario
await browser.startTracing(page, { path: tracePath, categories: CATEGORIES, screenshots: false });
await page.goto(url, { waitUntil: 'load' }); // or drive the interaction being measured
await page.waitForTimeout(4000);
await browser.stopTracing();
```

Start tracing before the navigation when you want load insights. A 4-second trace of a three.js example page came to about 24 MB, so write traces to the project's artifact location outside the repository and never commit them. Tracing adds overhead: traces locate causes, and acceptance timings come from matched, minimally instrumented runs.

## Read DevTools insights

```js
import { analyzeTrace } from '@paulirish/trace_engine/analyze-trace.mjs';

const { parsedTrace } = await analyzeTrace(tracePath);
for (const [navId, set] of parsedTrace.insights) {
  for (const [name, insight] of Object.entries(set.model)) {
    console.log(navId, name, insight.state, insight.metricSavings);
  }
  // an insight that throws is left out of set.model and lands here instead
  for (const [name, err] of Object.entries(set.modelErrors ?? {})) {
    console.log(navId, name, 'not computed:', err.message);
  }
}
```

Report anything in `modelErrors` as not measured. A missing insight is not a pass.

The insight names match the DevTools Performance panel: `LCPBreakdown`, `LCPDiscovery`, `RenderBlocking`, `NetworkDependencyTree`, `CLSCulprits`, `INPBreakdown`, `DocumentLatency`, `Cache`, `ImageDelivery`, `FontDisplay`, `ThirdParties`, `DOMSize`, `ForcedReflow`, `DuplicatedJavaScript`, `LegacyJavaScript`, `ModernHTTP`, `SlowCSSSelector`, `Viewport` and `CharacterSet`. Each has a `state` (`pass`, `fail` or `informative`), `metricSavings`, and its own detail fields, for example `RenderBlocking.renderBlockingRequests` and `Cache.requests` with a `ttl` per request. `LCPBreakdown` gives `lcpMs` plus `subparts` such as `ttfb` and `renderDelay`, each with a `range` in microseconds.

Each navigation gets its own insight set. The period before the first navigation, or the whole trace when there is none, gets a `NO_NAVIGATION` set, which the engine drops when it is shorter than 5 seconds, every insight passes, and it has no LCP, interaction or layout shift. A 3-second trace of steady animation on a loaded page was dropped this way and returned zero insight sets. To get insights such as `INPBreakdown` and `ForcedReflow` without a navigation, perform the real input during the trace or record for at least 5 seconds. Frame and long-task data below does not depend on insight sets.

## Frames, long tasks and user timing

These come from `parsedTrace.data` and work with or without a navigation.

- **Frames:** `parsedTrace.data.Frames.frames`, each with `duration` in microseconds plus `dropped` and `isPartial` flags. A main-thread stall shows up as a run of dropped frames at normal duration, not as one long frame: a 120 ms block on a 100 Hz display produced 11 dropped 10 ms frames and a maximum frame duration of 10.1 ms. Count dropped frames alongside duration percentiles, or the stall disappears.
- **Long tasks:** `[...parsedTrace.data.Renderer.entryToNode.keys()]`, filtered to `name === 'RunTask'` with `dur > 50_000` (microseconds). `Renderer.allTraceEntries` was empty in the tested engine version.
- **User timing:** `parsedTrace.data.UserTimings.performanceMeasures` lists the app's `performance.measure()` spans; add sparse marks around app phases to line the trace up with the journey.
- Other handlers include `NetworkRequests`, `LayoutShifts`, `Memory`, `GPU`, `Samples`, `Screenshots`, `Workers`, `AnimationFrames` and `Invalidations`.

The engine package mirrors DevTools internals and its field names can move between versions (0.0.66 was tested). Print the keys of an object before depending on a path.

## Counters, throttling and CPU profiles

Send these through the `cdp` session from the capture snippet.

- **Counters:** `Performance.getMetrics` returns `JSHeapUsedSize`, `Nodes`, `LayoutCount`, `RecalcStyleCount`, `ScriptDuration`, `TaskDuration` and more. Durations are in seconds and accumulate from `Performance.enable`. Enabling it after the load makes the load's work read as zero.
- **CPU throttling:** `Emulation.setCPUThrottlingRate({ rate: 6 })` slows the renderer's main thread only, not the GPU. Verify it with a fixed JavaScript loop timed before and after (37 ms became 245 ms at 6x); rAF frame rate on a light or GPU-bound scene can stay unchanged, as it did at 100 fps. Set the rate back to 1 afterwards.
- **Network throttling:** call `Network.enable`, then `Network.setCacheDisabled({ cacheDisabled: true })` for a cold HTTP cache, then `Network.emulateNetworkConditions({ offline: false, latency, downloadThroughput, uploadThroughput })` with throughput in bytes per second. Record the exact values: a 150 ms, 1.6 Mbps profile took one page load from 2.8 s to 5.1 s. Use a fresh context per cold run, and note that this clears only the HTTP cache.
- **CPU profile:** `Profiler.enable`, `Profiler.start`, then `Profiler.stop` returns a profile you can save as `.cpuprofile` and open in DevTools. To name the top contributors, sum `timeDeltas` per sampled node's `callFrame` and sort by self time.

## When chrome-devtools-mcp is available

It reads the same CDP data and runs the same DevTools trace engine, so it adds convenience, not measurements. The path above keeps headed real-GPU Chrome, window placement and one browser per subagent. Use the MCP only if it is already enabled and the project's one-browser rule allows it.
