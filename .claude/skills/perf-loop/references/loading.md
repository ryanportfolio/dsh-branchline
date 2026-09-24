# Loading and delivery

## Define readiness

Measure the journey the user needs: launch or navigation through visible content and a successful first action. Record intermediate milestones when they explain delay. A hidden spinner, earlier skeleton, or deferred handler does not establish readiness.

For web work, use relevant browser timing and interaction metrics with their exact collection method. Distinguish controlled lab results from field distributions. Use current official documentation if metric definitions, thresholds, or tool behavior need verification; a synthetic score alone is insufficient.

## Separate conditions

Keep distinct scenarios for cold cache, warm revisit, first installation or launch, and route transitions as relevant. Define which caches are cold: browser HTTP cache, service worker, application data, process state, CDN, or backend. Avoid claiming a fully cold run when only one layer was cleared.

Record connection and throttling settings, CPU conditions, service-worker state, origin, build identity, and data size. Separate time to first response, transfer, decompression, parsing, execution, layout, and application initialization where tools permit. Compare compressed transfer bytes and decoded size separately.

## Follow the critical path

Use a waterfall or trace to identify blocking requests, serial dependencies, unused payload, excessive startup execution, and contention. Evaluate asset changes, lazy loading, preload hints, caching, and code splitting against measured readiness. Additional requests and preloads can compete with critical work.

Check the first interaction and a later transition after deferring work. Check repeat visits and cache invalidation after caching changes. Preserve content completeness, image quality, text stability, navigation, authentication behavior, and accessible loading/error states.

Re-run against the actual optimized artifact. An unchanged development server, stale service worker, or old output directory can invalidate the comparison. Keep local benchmark conclusions distinct from deployment performance until that environment is measured within the user's authorization.
