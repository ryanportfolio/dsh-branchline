# Loading and delivery

## Readiness

Measure journey user needs: launch/navigation → visible content → successful first action. Record intermediate milestones when they explain delay. Hidden spinner, earlier skeleton, deferred handler ≠ readiness. A loader may become the measured paint element; identify what FCP/LCP represents and retain separate content-reveal and successful-first-action milestones.

Web: relevant browser timing + interaction metrics w/ exact collection method. Keep lab results distinct from field distributions. Metric definitions, thresholds, tool behavior need checking → current official docs. Synthetic score alone insufficient.

## Separate conditions

Distinct scenarios for cold cache, warm revisit, first install/launch, route transitions as relevant. Define which caches are cold: browser HTTP cache, service worker, app data, process state, CDN, backend. Only 1 layer cleared → don't claim fully cold. Track first-use shader compilation, texture upload and font readiness when relevant; warming these away invalidates an initial-startup claim.

Record connection + throttling settings, CPU conditions, service-worker state, origin, build identity, data size. Split time to first response, transfer, decompression, parsing, execution, layout, app init where tools permit. Compare compressed transfer bytes + decoded size separately.

## Critical path

Waterfall or trace → find blocking requests, serial deps, unused payload, excessive startup execution, contention. Judge asset changes, lazy loading, preload hints, caching, code splitting vs measured readiness. Extra requests + preloads can compete w/ critical work.

After deferring work → check first interaction + a later transition. After caching changes → check repeat visits + cache invalidation. Preserve content completeness, image quality, text stability, navigation, auth behavior, accessible loading/error states.

Re-run vs actual optimized artifact. Unchanged dev server, stale service worker, old output dir → comparison invalid. Local benchmark conclusions ≠ deployment perf until that env measured within user's authorization.
