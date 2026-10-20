# Vercel delivery

Confirm the project, framework output, deployed revision, and actual response owner before editing headers. Use the authenticated CLI where available. Inspect a preview before production when the task permits it; deployment requires task authorization.

## Provider-specific behavior

Vercel's CDN evaluates `Vercel-CDN-Cache-Control`, then `CDN-Cache-Control`, then `Cache-Control`. The Vercel-specific header is consumed by the platform. Function `Cache-Control` takes precedence over the same header in configuration. Vercel can consume shared-cache directives before forwarding a response, so browser-visible headers alone do not establish CDN policy. Verify current behavior in [Vercel's cache-control documentation](https://vercel.com/docs/caching/cache-control-headers).

Use browser `Cache-Control` for browser freshness and a targeted CDN header for a distinct shared lifetime. For public HTML, pair browser revalidation with a bounded edge lifetime only after checking variants and deployment invalidation. For private responses, inspect all three layers; a CDN override must not accidentally enable shared storage.

## Deployment checks learned from custom static output

- Prefer framework or host static output for versioned files. A fallback function should handle only the routes it needs.
- Inspect generated deployment configuration as well as `vercel.json`. Rewrites, clean URLs, and function responses may change the effective result.
- Give HTML and mutable aliases a freshness policy separate from versioned assets. Verify headers on a real missing asset, a private route, and relevant redirects after wildcard rules apply.
- Package the generated manifest with fallback functions. Check static and dynamic pages emit the identical asset prefix; do not recalculate it from packaged files.
- For old tabs loading lazy chunks after a deploy, inspect [Skew Protection](https://vercel.com/docs/skew-protection) before inventing asset-retention machinery. Verify current plan/framework support, effective settings, and which requests carry the deployment ID. Custom fetches and raw asset paths may need explicit handling. If unavailable or incomplete, test a compatible retention/recovery approach and report the remaining gap. Do not upgrade a paid plan without authorization.
- Confirm the runtime/build public origin and canonical host. Verify HTTPS and WWW redirects without confusing a redirect cache hit with an asset cache hit.
- Upload success does not prove readiness. Wait for Ready, verify aliases, and check live bodies, MIME types, range requests, and final headers.
- Preview authentication can interfere with cache measurements. Label authenticated preview evidence and verify the public target separately when authorized.

An `x-vercel-cache` HIT describes the platform layer. Prove browser reuse separately through a normal repeat navigation with browser caching enabled.

General semantics: [MDN Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control). Check current provider documentation when adapting these rules; do not assume another host uses Vercel's precedence or deployment invalidation.
