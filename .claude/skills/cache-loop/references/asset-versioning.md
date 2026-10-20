# Asset versioning for custom sites

Read this when the build does not already produce reliable content-hashed assets. These rules come from a static-site migration with server-rendered fallback routes, workers, fonts, and video; adapt them to the actual build.

## One build, one mapping

Generate a manifest once during the build. Both static output and runtime handlers must consume that artifact. Hashing the asset tree at function startup repeats disk work, can read megabytes of video, and can produce different versions when function packaging contains a different subset of files.

Hash deterministically: normalized relative paths, explicit ordering, file boundaries, relevant input bytes, and transformation inputs. Exclude timestamps, absolute machine paths, and unrelated files. Per-file hashes preserve reuse when unrelated assets change. A shared build prefix is simpler but invalidates the whole group; choose that tradeoff explicitly.

For files that refer to other assets, derive versions from the resulting dependency mapping. A changed worker or imported chunk must not leave a parent with the same URL and different delivered bytes. An unchanged input build should produce identical public paths. A changed relevant input should invalidate every affected output.

## Rewrite only asset references

Cover actual reference locations: HTML attributes and `srcset`, CSS URLs/imports, JS module imports, lazy chunks, worker constructors, posters, and runtime-generated markup. Prefer parsers or explicit build mappings. Broad string replacement can rewrite search text, inline data, external links, and content that merely resembles a path.

Keep query strings and fragments in their correct positions. Resolve relative paths from the referencing file. Avoid adding a version prefix twice. Rewrite only known public resources; do not turn arbitrary filesystem paths into public routes.

Preserve text encoding. Decoding legacy bytes as UTF-8 and encoding them again can corrupt them. Use the project's known encoding or a byte-preserving transform for an ASCII-only replacement, and verify unrelated bytes remain unchanged. Never transform binary assets as text. Check MIME type and body signatures to catch HTML fallback responses masquerading as JS or images.

## Release overlap and failure handling

Prefer retaining old hashed resources across the supported overlap window so an old page can finish loading a lazy chunk after a deployment. Exercise this with the cache empty for that old chunk.

Never silently serve current bytes under an old immutable asset URL. A temporary redirect to a current URL is only a compatibility choice after proving the consumer can accept that replacement; it is unsafe as a blanket fix for code or data whose contracts changed. Give temporary redirects a recovery-friendly cache policy. Return an explicit missing-resource response if compatibility cannot be guaranteed, and handle reload/recovery at the application level where appropriate.

Test actual responses for unknown hashes and missing files. Catch-all routes and wildcard headers can accidentally return cacheable HTML or cacheable 404s. Keep generated manifests private unless their contents are deliberately public.

## Useful build checks

- Same inputs produce the same mapping; a relevant byte change invalidates affected URLs.
- Static HTML and runtime HTML use the same generated mapping.
- Query strings, fragments, relative paths, and lazy resources still resolve.
- Unchanged portions of transformed legacy files and all binary files preserve their bytes.
- Function startup reads manifest metadata without scanning or hashing the asset tree.
- Old-page/new-release and missing-asset cases have a verified outcome.
