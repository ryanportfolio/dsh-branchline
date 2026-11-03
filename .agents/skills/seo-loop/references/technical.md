# Technical: crawl checks, measuring, deploy

Technical health = can engines fetch, index, attribute + read each page. Two deterministic tools; rule meanings + fix locations: [checks](checks.md).

## Tools

```
node .agents/skills/seo-loop/scripts/seo-check.mjs <url> --out <dir>/seo.json [--max-pages 200] [--urls list.txt | --include list.txt] [--public-origin https://prod.example]
npx -y github:ryanportfolio/willaicite#v1.4.0 <page-url> --json --out <dir>/geo-<slug>.json
node .agents/skills/seo-loop/scripts/seo-check.mjs diff <before.json> <after.json>
```

- seo-check: Node 20+, no deps. Crawl, status + redirects, robots.txt, sitemap, canonical, noindex, hreflang, titles, descriptions, JSON-LD syntax. Exit 0 no fail, 1 fail findings, 2 incomplete. 200 ms between fetches on prod, none on localhost; never lower on prod. Same `--max-pages` both sides of a diff. Follows every link, so sort/filter/page query links can fill the budget; truncated crawl → orphan + sitemap results partial (say so).
- Local preview of a site w/ a production origin → always `--public-origin <prod origin>`, else run incomplete (`needs-public-origin`).
- Exit 2 for a page that still exists → crawl: rerun w/ `--include <file listing it>`; `--urls` run: add it to the list (flags don't combine); budget hit: rerun both w/ higher `--max-pages`.
- willaicite (owner's AI-readiness audit): AI crawler access per bot incl. firewall blocks, raw-HTML renderability, answer-readiness, topical focus, evidence, structured data, freshness, entity, SEO foundation. Pinned tag; never `npx geo-audit` (unrelated npm pkg). Always exits 0, prints a score even for a dead page → validity = diff's job. No origin flag: on localhost a correct canonical to prod reads "points away" (seoFoundation drops) → known artifact, never "fix" it. Overall score = context, never a target; round target = a fail/warn evidence line.
- Paths: `<run>/tech/round-<n>/`; study baseline on prod = `round-0-prod`, local build baseline = `round-0`. `<slug>` = URL path, `/` → `-`, start page = `home`.

## Baseline

1. Both tools on the measure target (no local target yet → live prod, read-only) → `round-0-prod`, else `round-0`; key pages for willaicite ≤5 (start page + 1 per template + owner's picks). Read output, not only exit codes.
2. Run again → round-0b; diff. Anything fixed/new → find drift cause (date-relative text, A/B, random content), record before any change.
3. Triage table: finding (rule, or willaicite dimension + evidence line) | pages | severity | why ([checks](checks.md)) | fix location | effort | owner input? Order: access + indexing fails → other fails → warns; tie → key pages first, then page count. Info → count line.

## Measuring

- Default target: production build served locally (host's build + preview cmd). Record commit SHA, cmds, URL; confirm served page = that build (a just-changed string in HTML).
- Before first local build: read build + start cmds and data config. Run only the site process (no workers, jobs, migrations against anything but a local DB), w/ production credentials kept out of env; never fill a missing DB/API URL from the host's variables (`vercel env pull`, `railway variables`). Can't separate → no local target.
- Site needs data it can't get locally (private DB/CMS/API, no seed or dump from owner) → no local target. Never write fixture data and score it; never build a stand-in renderer fed by prod. Staging DB counts only if owner confirms it is a separate database; prod's replica, pooler or public proxy URL is prod. Owner-supplied dump w/ private rows (users, emails, sessions, tokens) → outside repo + run folder, loaded only into a local DB; dump + DB deleted at cleanup and named in report.
- Never measure a deploy preview: hosts run every service on one w/ inherited prod tokens, Vercel previews send noindex + sit behind login, per-push URLs break diffs.
- No local target → propose `live` (below); owner says no → plan only.
- Dev server = diagnostic only.

## Live mode (owner opts in)

Each batch deployed, then measured on prod. Fits: small site, deploy + rollback in minutes.

- Before first deploy, record deploy cmd (or merge → auto-deploy) + rollback cmd to the previous build. Rollback unknown → no deploy.
- Deploy from a clean checkout at the merge SHA (CLI deploys can upload another folder: `railway up` from a worktree uploaded the main checkout).
- Before-state = seo-check + willaicite (key + changed existing pages) on prod just before deploy; new pages: first valid prod run = baseline. After deploy: confirm the change is on prod (a changed string), hit each changed route once, then crawl + diff vs that before-state.
- Regression or target finding still there → roll back unless owner says keep; done when a recrawl diffs exit 0 vs before-state; then revert the PR so source = prod.
- Owner's go per deploy, or a standing go the owner states for this site this session. Robots, noindex, canonical, redirect changes always need their own yes: rollback restores the site, not what Googlebot already fetched.

## Diff gate

Exit 0 nothing new. Exit 1 regression: new fail/warn, warn → fail, duplicate group grew, indexable page `LOST` (now noindex, blocked, broken, canonical/redirect to non-indexable, or no longer found), lower willaicite dimension score. Exit 2 not comparable: incomplete run, different origins (new baseline), budget hit on one side only, earlier page not rechecked, finding gone w/o its URL rechecked. Info ignored.

Pass = exit 0, or exit 1 w/ every regression line expected. Exit 2 may print nothing or only a partial summary to stdout (reason on stderr): judge by exit code, never read it as clean; restore comparability (Tools), rerun, still 2 → fail.

- Before a batch, write expected regression lines: each `NEW`/`WORSE`/`LOST`/`GREW` = rule + URL pattern (rule alone lets a real regression elsewhere pass); each falling `SCORE` = dimension + willaicite file. A script matches those stdout lines to the list; `FIXED`, `CHANGED`, rising `SCORE` and the summary line are not regressions. Exit 1 passes only if every regression line matches and stderr holds no not-comparable note.
- Consolidated page (301 or canonical) → not `LOST` while its target is indexable.

## Search Console (optional, owner connects)

Read-only, never a gate (data lags days, effects weeks). At re-check: per changed page, URL Inspection verdict, Google's chosen canonical vs ours, last crawl time (before deploy → "not recrawled yet"); Search Analytics clicks/impressions/position for equal whole-week windows before vs after deploy, untouched pages as control, reported "observed, not attributed". Connected at study time → its queries feed step 2 now. Never use the Indexing API (Google limits it to JobPosting and BroadcastEvent pages).
