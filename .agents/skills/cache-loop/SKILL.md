---
name: cache-loop
description: Use for caching or stale content
---

# Cache loop

Make reusable responses cheap to load again while ensuring changed content reaches users. Work within the existing framework and host. Prefer built-in asset hashing and invalidation before adding custom machinery.

## Establish the actual delivery path

Inspect the source revision, build output, host configuration, middleware, redirects, service workers, and representative live responses. Identify which layer owns each response. A repository file may be served through a function or rewritten to HTML.

Record a compact baseline: URL class, status, content type, browser policy, shared-cache policy, validators, size, and observed cache source. Include HTML, JS/CSS, fonts, images, video, and relevant dynamic endpoints. Inspect cookies, authorization, query parameters, locale, and other response variants before proposing shared caching.

Use available HTTP tools immediately. Preflight browser measurement with one real navigation before promising cache-hit evidence. If one browser bridge is unsupported, investigate other available methods; continue HTTP/build checks and label the browser evidence gap. A different browser cannot establish acceptance for the user's named browser.

## Choose policies by response behavior

Use these starting points, then adapt to the product's freshness requirements:

| Response | Browser policy | Shared-cache decision |
| --- | --- | --- |
| Public assets whose URL changes when their bytes change | `public, max-age=31536000, immutable` | Cache aggressively |
| Public HTML and mutable asset URLs | `no-cache` or `max-age=0, must-revalidate` | Independently choose a bounded lifetime when invalidation and variants are understood |
| Public data with accepted staleness | Explicit bounded lifetime | Cache only safe methods and correctly keyed variants |
| Sensitive, authenticated, cart/session, or mutation responses | Usually `private, no-store` | Bypass shared storage |
| Missing assets, failures, or temporary compatibility redirects | Avoid inheriting long asset lifetimes | Explicit short policy or `no-store` appropriate to recovery |

`no-cache` permits storage with validation; `no-store` prevents storage. Do not classify every API or search URL as private by name alone: establish what it contains. Treat unknown personalization conservatively until verified.

Keep browser and CDN lifetimes separate. CDN purge or deployment invalidation does not clear a browser's fresh cached response. An ETag does not update a resource while the browser may reuse it without validation. Read [Vercel delivery](references/vercel.md) when that host applies; check current provider documentation for other hosts.

## Make aggressive asset caching safe

Use existing content-hashed filenames when available. For a custom static site, read [Asset versioning](references/asset-versioning.md) before building a manifest or rewriting URLs.

Require these properties before assigning a long immutable lifetime:

- Changing delivered bytes changes the URL, including dependencies that affect the delivered file.
- Build output, HTML, CSS, lazy imports, workers, and server-rendered responses agree on the asset version.
- Old open tabs and old HTML have a defined path through deployment changes. Retain old versioned files when possible.
- Asset rules cannot make missing files, private source, fallback HTML, or error responses cache for a year.

Preserve native video ranges, MIME types, compression negotiation, validators, and conditional requests. Serve large static files directly when the host supports it. Keep secret files, source templates, internal manifests, and local tooling out of public output.

## Verify behavior, not configuration alone

Run the relevant build and existing checks. Inspect real GET responses and bodies on the intended deployment; HEAD alone can miss a rewrite or handler difference. Follow redirects deliberately and record their policies too.

Cover the changed behavior:

1. Cold load with a fresh browser context. Record transferred bytes and requests without assuming the CDN is cold.
2. Normal revisit in that same context with caching enabled. Distinguish memory cache, disk cache, 304 validation, service worker, and CDN responses. A CDN HIT can still transfer the full body to the browser.
3. A new release with a representative asset change. Reuse the warmed browser context from step 2 and navigate normally, without a hard reload or cache disabling. Verify HTML is revalidated or refetched and requests the new asset URL. If a service worker exists, exercise its update/activation path with the previous worker already controlling the page. Separately keep an old page open and verify its lazy resources still work. If deployment is not authorized, exercise two local builds and report production freshness as unverified.
4. Missing or obsolete asset URLs, errors, private routes, and safe session checks. Verify broad header rules do not override their policy. Check two isolated sessions if response sharing is in scope.
5. Video byte ranges and conditional requests when affected. Check bytes and status, not just header presence.

Record browser/version, source revision, target, cache state, measurement method, and before/after results. DevTools cache disabling, hard reload, fresh contexts, and request `no-cache` headers can change the scenario. Keep them out of the normal-revisit measurement. Resource Timing size alone is insufficient proof of a cache hit, especially across origins.

For a named Firefox/Safari/mobile target, collect that target's evidence or state the gap. Headless or emulated runs must be labeled; they do not establish physical-device animation performance. Cache success does not establish smooth rendering, lower memory, or faster first-ever visits. Use separate performance profiling for those claims.

## Finish within the authorized scope

Make changes reviewable and honor the repository's review process. Publishing, merging, deployment, account changes, and destructive purges need task authorization; this skill does not grant it. Do not add a service worker, replace the host, or introduce a second CDN unless the requested outcome requires it.

Report what changed, the route policies, measured repeat-load benefit, freshness/privacy checks, and remaining gaps. Distinguish local checks, preview evidence, and production evidence. Stop after the agreed checks pass; broaden testing only for a concrete unresolved risk or failure.
