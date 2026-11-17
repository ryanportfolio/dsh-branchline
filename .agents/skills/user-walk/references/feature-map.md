# Feature map

Same entry format and citation rules as `product-walkthrough`'s `references/inventory.md`. Tour-only fields (Non-obvious, Demo idea) dropped; walk fields (Goal, Start, Known path, Known steps) added. A tour can start from this map once those two fields are added back. Rules repeated here so this skill works without the other installed.

## File

`map.md` in run folder. Header: date, commit read (the one the target serves, preconditions 1; say so when it is not `origin/<default>`), URL to walk, account or seeded data used. Then one entry per feature:

```markdown
#### 4. Keep a copy of your audit
- **UI copy:** button "Download report" (`src/components/Report.tsx:88`)
- **What:** saves the finished audit as a PDF (`src/lib/pdf.ts:12-40`).
- **Reach:** `/audit/<id>` once a run finishes. Screens: `/` → `/audit/<id>`.
- **Availability:** everyone, no account.
- **Caveats:** button renders only after the run completes (`src/components/Report.tsx:80`).
- **Goal:** "Get a copy of your results for example.com that you can keep."
- **Start:** `/`
- **Known path:** fill page URL field → click "Audit" → click "Download report"
- **Known steps:** 3 (replayed <date>; code said 3)
```

## Rules

- Every fact cites `file:line` or a dated live source. Read path end to end, server included: a button can exist and still be gated, rate-limited or plan-limited.
- Feature = something a user does, named in user's words. Not a component, not a route.
- Record conditions exactly: plan, role, flag, platform. Role-gated features → walk only with a test account of that role; else list as not walked.
- **Known path** = fewest driver actions from Start to done. Driver counts `click`, `fill`, `select`, `hover`, `press`, `scroll`, `back`, `home`; waiting and reading are free. Scrolls count when the control or answer is out of view at 1280 × 800; replay measures them.
- Done = the goal is complete on screen (file saved, answer readable), not a matching heading. Code shows no screen answers it → Known steps `none`.
- **Goal** = the outcome, in user's words, with any input the walker needs (a URL to audit, sample text). Never the UI label, route or button text: "Download report" → "get a copy you can keep". A goal naming the label tests reading, not finding.
- **Start** = where a first-time user lands: home page, or post-login page for signed-in features. Deep link only when users really arrive there (email link).
- Path that needs a skip-list action (pay, delete, send) → `Not walked: skip list`; check it from code only.
- Note in entry when a destructive or costly step has no confirmation or undo (`From code` finding for report).
- More than ~20 features → ask owner which to walk. Default: everything reachable from main navigation; list rest as not walked.
- Product bugs met while reading or replaying → separate list for owner.

## `.claude/reference/features.md`

Committed shared vocabulary, so sessions and owner call features by same names. Table columns: Feature, What it does, Where (route or screen). Never step counts, walk results or `file:line`: they change with every UI edit and live in run output.

File missing (repos that took this skill through `sync-starter`) → create it with the template's header and table. Each run: diff map against it. Replace the "none yet" placeholder row on the first run. Add new features, fix renamed or moved ones, remove gone ones; keep owner's wording where still true. Edit only rows the map changed. List changed rows in report. This edit is part of a user-walk request; commit follows repo git rules.
