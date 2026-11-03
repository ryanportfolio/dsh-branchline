# Searcher: how people would look for this site

Input: `study/brief.md` + audience + offer reports. Main thread, or one subagent per persona on large sites; judgment work.

Real evidence first, labeled w/ source + date: Search Console queries if connected ([technical](technical.md) Search Console), site search logs if owner gives them, autocomplete + "People also ask" for a few top terms, only if owner OK'd it, in a headed browser by hand-like use (sample, never a scraper). Then fill the gaps by reasoning, labeled as guesses.

## Personas (3-6)

From audience groups only; no invented demographics. Each: who (role or situation), the job they're doing, what they already know (do they know this kind of tool exists? the site's name? its terms?), what would make them pick a result.

## Stages

Per persona, the searches at each stage that applies:

| Stage | Mindset | Typical shape |
|---|---|---|
| problem | has a problem, doesn't know solutions | "why does X", "how to stop X" |
| solution | knows a kind of solution exists | "X tool", "best way to X" |
| compare | weighing options | "X vs Y", "alternatives to Y", "X for <situation>" |
| act | ready to use one | "<site name>", "X free", "X online", "download X" |
| user | already uses the site | "<site> how to", feature names, errors |

## Query writing rules

- Write what a person would type, not what the site calls things. Site says "repository velocity" → people may type "fastest growing github repos". List both; step 3 decides.
- 2-4 variants per idea: short head term, longer specific phrasing, question form (AI asks), local/situational form if relevant.
- AI phrasing: full questions w/ context ("I maintain an open source project, how do I see which repos are trending this week?").
- Mark each: intent (learn / find a tool / compare / do), stage, persona, page that should answer it (existing URL or "missing").
- Drop queries the site can't honestly serve (offer doesn't cover it). No pages for queries the site has no real answer to.

## Output `searcher.md`

1. Personas.
2. Query table: query | variants | persona | stage | intent | answering page | notes.
3. Clusters: group queries one page could fully answer; name each cluster by its plainest phrasing.

Volume unknown: never estimate monthly searches. Priority comes later from fit + field evidence.
