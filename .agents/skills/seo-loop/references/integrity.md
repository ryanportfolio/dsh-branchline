# Integrity: edits this skill may not make

Search engines + answer engines reward cheap-to-fake signals: dates, stats, quotes, author names, question headings, schema, keyword-matched titles. Faked one may score + harms site: Google's [spam policies](https://developers.google.com/search/docs/essentials/spam-policies) cover most; an engine quoting an invented number quotes the owner saying it. Read before any copy/markup edit; include in every subagent + reviewer brief.

## Never

- **Invent facts.** No stat, quote, source, price, date, award, client, author, credential, affiliation not on the proof sheet (study) or on the owner-confirmed fact list in `plan.md`. Proof-sheet facts found only in code/data need that confirmation too. Approving a draft ≠ confirming its facts. Gap → mark `owner input needed`, don't ship.
- **Take the field's facts or text.** Competitor figures, claims, testimonials, feature lists never become ours. Borrow vocabulary + coverage ideas only; no copied or lightly reworded passages.
- **Bump dates.** `dateModified`, visible "updated" dates, sitemap `lastmod` change only w/ real content change on that page; never computed at build or request time.
- **Show bots something else.** No user-agent/bot-IP branches changing content, links, markup ([cloaking](https://developers.google.com/search/docs/essentials/spam-policies)). Same for AI-only variants: `llms.txt`, Markdown copy, data files must not say what page doesn't.
- **Hide text/links, or stuff keywords.** One page, one query cluster, in natural wording; no lists of query variants in titles, headings, alt text, copy or footers.
- **Mark up invisible content.** Structured data = content visitor sees on that page ([structured data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)). No `AggregateRating`/`Review` of own business or products written by the business ([self-serving reviews](https://developers.google.com/search/docs/appearance/structured-data/review-snippet)).
- **Generate pages at scale** for queries: per-city, per-keyword, templated pages w/ swapped nouns ([doorway + scaled content abuse](https://developers.google.com/search/docs/essentials/spam-policies)). Swap test: city or keyword can be swapped and text still works → doorway. New pages need owner go + reason a visitor wants each.
- **Pad.** No FAQ blocks, question headings, "What is X?" openers added only for engines; no copy added to reach a length. Add only what answers a real visitor question the searcher step found; owner decides.
- **Buy, swap, plant links**; no sitewide footer links to other properties.
- **Redirect sneakily**: redirect sends everyone same place.
- **Change policy alone**: training-crawler rules, CDN/firewall bot settings, section-wide noindex, robots.txt rules, canonical targets, URL structure, redirects + redirect maps = owner's call.

## Allowed w/o asking

Fixes making existing truth readable: wrong status codes, broken redirect chains, a duplicate canonical tag, sitemap listing pages robots.txt blocks, hreflang pairs, valid JSON-LD for content already on page, server-rendered main content, real dates from content history exposed in markup, internal links between pages that really relate. New redirects, robots.txt edits, canonical target changes → "Change policy alone".

New/rewritten copy (titles, descriptions, H1s, intros, answer passages, headings, new sections) → `writing` skill, proof-sheet facts only, owner approves before ship.

## Reviewer brief: integrity lens

For every changed visible string, attribute, JSON-LD field in the diff:

1. Trace each factual claim to a visible proof-sheet row or the owner-confirmed fact list. Code-only fact w/o confirmation, or untraceable → finding.
2. Compare shipped copy word for word vs the approved draft. Drift → finding.
3. Compare structured data vs rendered page. Markup w/o visible content → finding.
4. Check copy vs `field/*.md` notes: passage copied or closely reworded from a field site → finding.
5. Fetch 1 changed page w/ normal browser UA, `GPTBot` UA, `Googlebot` UA; content must match.
6. Every date change ↔ real content change in same diff; date computed at build or request time → finding.
7. Flag any "Never" pattern, even when checks improved.

Each finding: confirmed / refuted / unresolved + file + line.
