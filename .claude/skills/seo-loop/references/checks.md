# Checks: meaning, source, usual fix location

seo-check: can search engines fetch, index + attribute each URL. willaicite: can answer engines fetch a page, read it w/o JS, find something to quote. Neither measures rankings, traffic, real citations.

Sources = Google Search Central. Re-read page before quoting a rule to owner in a report; Google moves + revises them (robots.txt spec moved to `developers.google.com/crawling`, 2025).

## seo-check rules

`fail` = page kept out of index, split across URLs, or signal ignored. `warn` = costs crawl, clarity, snippet control. `info` = human look, never a round target alone.

| Rule | Sev | Meaning | Usual fix location | Source |
|---|---|---|---|---|
| `robots-server-error`, `robots-unreachable` | fail | robots.txt 5xx, 429 or no answer → Google stops crawling site first 12 h | host/server config, static file | [robots.txt spec](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec) |
| `robots-blocks-root` | fail | Googlebot disallowed from `/` (often staging robots.txt shipped) | `robots.txt` or framework robots route | same |
| `start-unreadable`, `start-noindex` | fail | start URL: no HTML, blocked, or noindex | env-dependent noindex, auth middleware | [block indexing](https://developers.google.com/search/docs/crawling-indexing/block-indexing) |
| `needs-public-origin` | fail | local run, robots.txt sitemap line, sitemap or canonical names production origin, start page links only to one other origin (`start-links-other-origin`), or local start URL redirects off the machine → run incomplete | rerun w/ `--public-origin <prod origin>` (measurement setup, not the site) | |
| `parse-error` | fail | page HTML couldn't be read by the checker | check the page by hand; report the checker bug | |
| `http-error`, `http-no-content`, `fetch-error` | fail | linked/sitemap URL → 4xx/5xx, a 3xx with nothing to follow, 204/205 (nothing to index), or no answer | the link, route, or redirect map | [HTTP status codes](https://developers.google.com/crawling/docs/troubleshooting/http-status-codes) |
| `sitemap-unreachable`, `sitemap-invalid`, `sitemap-bad-url`, `sitemap-too-large` | fail | declared sitemap unreadable (error, robots-blocked, blocked redirect), cut off, malformed or a nested index, over 50 MB or 50,000 URLs, or a `<loc>` or robots.txt `Sitemap:` line that isn't an absolute URL | sitemap generator config | [build a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) |
| `sitemap-url-blocked`, `sitemap-url-noindex` | fail | sitemap asks Google to index a URL that says "don't" (meta robots, or X-Robots-Tag on any file type) | sitemap filter or page robots setting | same |
| `canonical-multiple`, `canonical-invalid` | fail | >1 rel=canonical, or one that isn't a valid http(s) URL → Google ignores it | layout head + page head both emit one | [consolidate duplicate URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls) |
| `canonical-target-bad` | fail | canonical → error, redirect, noindex or blocked URL | canonical builder (slash, host, locale prefix) | same |
| `hreflang-invalid`, `hreflang-no-return`, `hreflang-target-blocked` | fail | code outside ISO 639-1 language + optional script + ISO 3166-1 alpha-2 region (`eng`, `es-419`, `en-UK` fail), one-way pair, or alternate robots-blocked so Google cannot confirm the pair | i18n head component | [localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions) |
| `jsonld-invalid` | fail | JSON-LD won't parse → whole block lost | structured-data component (trailing commas, unescaped quotes) | [structured data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies) |
| `title-missing`, `title-empty` | fail | no title for Google to start from | layout head, page metadata | [title links](https://developers.google.com/search/docs/appearance/title-link) |
| `redirect-chain` | warn | >1 hop | redirect rules: old URL → final URL | [redirects](https://developers.google.com/search/docs/crawling-indexing/301-redirects) |
| `sitemap-url-redirects`, `sitemap-url-canonicalized` | warn | sitemap lists non-canonical URL | sitemap generator (slash, host, locale) | sitemap page |
| `sitemap-missing`, `sitemap-redirect`, `sitemap-foreign-url`, `sitemap-empty` | warn | no sitemap (a single-page app answering `/sitemap.xml` with HTML counts as none), an empty one, or one Google may reject | generator config, robots.txt `Sitemap:` line | sitemap page |
| `not-in-sitemap`, `orphan` | warn | sitemap + internal links disagree on which pages exist (`not-in-sitemap` only when every sitemap file was read) | generator filter, navigation | sitemap page |
| `canonical-in-body`, `canonical-relative`, `canonical-fragment` | warn | canonical Google ignores or may misread (Google: no `#fragment` in a canonical) | head component | canonical page |
| `head-ended-early` | warn | an element that doesn't belong in `<head>` (img, div, svg, text) ends it for Google; metadata after it is ignored | layout head, injected widgets | [valid page metadata](https://developers.google.com/search/docs/crawling-indexing/valid-page-metadata) |
| `hreflang-relative`, `hreflang-no-self`, `hreflang-target-redirects` | warn | hreflang set Google may not trust (an alternate that redirects is not the page it names) | i18n head component | localized versions |
| `title-duplicate`, `description-duplicate` | warn | several indexable pages look like one page | per-page metadata defaults | title links, [snippets](https://developers.google.com/search/docs/appearance/snippet) |
| `description-missing` | warn | Google writes own snippet | page metadata | snippets |
| `title-multiple` | warn | >1 `<title>` in `<head>`; Google reads the first | layout head + page head both emit one | title links |
| `viewport-missing` | warn | Google indexes mobile rendering | layout head | [mobile-first indexing](https://developers.google.com/search/docs/crawling-indexing/mobile/mobile-sites-mobile-first-indexing) |
| `jsonld-no-type` | warn | JSON-LD naming nothing | structured-data component | sd policies |
| `noindex`, `canonical-missing`, `canonical-other-origin`, `linked-url-blocked`, `linked-url-redirects`, `title-long`, `h1-missing`, `img-alt-missing`, `robots-missing`, `sitemap-not-declared`, `sitemap-other-origin`, `sitemap-files-skipped`, `canonical-not-checked`, `start-redirects`, `listed-url-other-origin`, `listed-url-invalid`, `start-links-other-origin`, `page-truncated` | info | look + decide; often intended | | |

Noindex = a standalone `noindex` or `none` in meta robots (anywhere in the page) or X-Robots-Tag, or a past `unavailable_after` (a full date with its year); a directive prefixed for another crawler (`bingbot: noindex`) does not count. `title-long` = 70-char display heuristic, not a Google limit. `h1-missing`, `img-alt-missing` help people + image search; Google requires neither. A11y → `ui-quality`.

Not covered: JS-added tags (compare rendered DOM in headed Chrome when framework injects head tags), rich-result eligibility ([Rich Results Test](https://search.google.com/test/rich-results)), Core Web Vitals (`perf-loop`), Search Console data ([technical](technical.md) Search Console).

## willaicite dimensions

`--json` → `dimensions[]`: `key`, `weight`, `score` (null = couldn't verify), `evidence[]` (`pass`/`fail`/`warn`/`info`/`unverified` + message), `recommendations[]` (`action`, `why`, `impact`, `effort`). Round target = a `fail`/`warn` evidence line, not score. Severity = willaicite's own evidence status. Evidence has no ids → failure gone while its dimension has `unverified` evidence in later run = not comparable (diff exit 2), not fixed. Fetches: page, homepage, about page, + sitemap pages only if its 10-fetch budget allows (often 0-2; may pick blocked or broken URLs, so read `pagesAudited`).

| Key | Moves it honestly | Gaming risk for integrity reviewer |
|---|---|---|
| `crawlerAccess` | robots.txt groups for retrieval crawlers; CDN/firewall bot rules (outside repo → report exact setting) | changing training-crawler rules w/o owner's licensing call |
| `renderability` | server rendering or prerender of main content | bots get different page than people (cloaking) |
| `answerReadiness` | plain answer near top, headings matching real questions | FAQ blocks/question headings added only to score; cited replication: formatting-only edits ~useless. v1.4.0 gives +15 for any FAQ heading or FAQPage markup, no cited evidence; controlled vendor tests found no citation effect; Google dropped FAQ rich results May 2026 → never add an FAQ to move this |
| `topicalFocus` | title, H1, description naming page's one topic | keyword stuffing |
| `evidenceDensity` | real figures, quotes, source links owner stands behind | invented stats, quotes, citations |
| `structuredData` | JSON-LD of what page visibly shows | markup for absent content; self-serving reviews; FAQPage scores +15 again here (same caveat as answerReadiness) |
| `freshness` | visible + machine-readable dates changing only w/ real edits | date bumps w/o content change |
| `entityEeat` | real author, org, about page | invented people, credentials, affiliations |
| `seoFoundation` | self-referencing canonicals, unique titles + descriptions | none beyond seo-check rules |

`llmsTxt` = informational, unscored. Google's [AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide): AI search optimization "still SEO"; `llms.txt` + "chunking" not needed for Google Search. Other engines' `llms.txt` use unconfirmed. Never sell `llms.txt` as ranking/citation lever.

## Crawler claims

Each crawler reported w/ every use it controls; never merged w/ another token. willaicite's report labels each token retrieval or training: use its labels + list ([registry](https://willaicite.com/crawlers), `src/aiBots.ts`). Googlebot isn't in that list → seo-check's robots rules cover it.

- Retrieval (block = no citations from that engine), e.g. `OAI-SearchBot`, `ChatGPT-User`, `Claude-SearchBot`, `Claude-User`, `PerplexityBot`, `Perplexity-User`, `Bingbot` (Copilot), `Applebot`; `Googlebot` feeds Search, AI Overviews, AI Mode.
- Training (owner's licensing call, no effect on search citations), e.g. `GPTBot`, `ClaudeBot`, `CCBot`, `Applebot-Extended`, `meta-externalagent`.
- `Google-Extended`: Gemini model training **and** grounding in Gemini Apps + Vertex AI Grounding with Google Search; no effect on Google Search inclusion or ranking, incl. AI Overviews/AI Mode (served from `Googlebot`). Blocking it can remove a site from Gemini-grounded answers → owner's call w/ both uses named ([Google common crawlers](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers#google-extended)).
- AI Overviews/AI Mode controls: Google's [AI features page](https://developers.google.com/search/docs/appearance/ai-features); read before advising.
