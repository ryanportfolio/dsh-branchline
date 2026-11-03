# Review buckets A–G

Loaded from `SKILL.md` Step 2 and used again when writing reviewer prompts in Step 3. Moved verbatim; each reviewer prompt pastes its bucket's bullets from here.

### The five buckets

**Bucket A — Correctness & types**
- Bugs, off-by-one, edge cases, logic errors
- Conditions that look right but aren't (`||` vs `??`, missing `await`, mutating loops, truthy/falsy traps)
- ORM table ↔ validation schema drift; inferred type drift
- Consumers of a changed type that no longer compile
- Optional fields added without updating callers

**Bucket B — Data flow, compatibility, error handling**
- Where input comes from, where output goes, what cache rows look like
- Concurrent access; stale or wrong-shape cache rows
- Old data in the DB; old rows in changed-shape tables; old cache rows; old API requests
- Required migrations; backwards-incompatible changes
- Failure paths, timeouts, retries; external APIs returning null/empty/wrong shape
- Values assumed present that can be undefined

**Bucket C — Perf, security, observability**
- Extra DB queries per request, prompt size growth, latency, N+1, full-table scans, unbounded loops
- Cross-user data leakage, prompt injection, auth bypasses, PII/secrets in logs, public endpoints
- Logs on paths that matter; silent failure modes (parser returns empty, fallback fires, cache miss) made visible

**Bucket D — Things the author missed** (highest-value bucket — undivided attention, push hard)

For a broad diff, this category gets its own dedicated reviewer; the tiny-diff reviewer covers it alongside the other relevant buckets. The agent should treat the diff as a list of incomplete changes and look for what wasn't done.

- Updated one of two related code paths and forgot the other (e.g., streaming + non-streaming, server + client, English + i18n locales)
- Changed a type/interface but not all consumers
- Captured data but forgot to persist or read it back
- Added a feature but forgot the tear-down (cleanup, expiry, eviction, cache invalidation)
- Fixed the streaming version but left the non-streaming version broken (or vice versa)
- Added a config option / env var / flag but forgot to thread it through to the code that actually uses it
- Added a new model / provider / route but didn't register it in the dispatcher, switch, or admin list
- Added a column / field but didn't include it in serializers, exports, or display
- Renamed something but left old references (search the diff for the old name)
- Added handling for the success path but not the error path (or vice versa)
- Added a test but didn't run the suite that includes it
- Added docs/README text asking a HUMAN to maintain an invariant ("don't install X alongside Y", "remember to replace these refs") — a disclaimer that could be a detection hook or a script is a finding: automate it or explain why it can't be

For this bucket specifically: greppability beats cleverness. The agent should `grep` the changed identifiers across the codebase and look at every hit to see if anything was missed.

**Bucket E — Project-aware violations** (the structural blind spot of fresh-context review)

Buckets A–D are deliberately context-free — that's the source of their impartiality, and also why they can't catch violations of *this codebase's specific rules*. Bucket E exists to close that gap. The agent reads project reference material first, then reviews the diff against it.

The reviewer is told to read these files before looking at the diff:

- `CLAUDE.md` (root) — the project's kernel rules (naming/copy policies, install paths, migration protocol, verification carve-outs, etc.)
- `.claude/reference/pitfalls.md` — accumulated project-specific gotchas
- Any other `.claude/reference/*.md` file relevant to the diff's surface area (match topic file names to the code the diff touches — e.g. env vars / `process.env.X` → `secrets.md`, cross-cutting flow → `architecture.md`)
- `AGENTS.md` and `.agents/CODEX-SKILL-COMPATIBILITY.md`, where the repo has them — the project rules that bind a Codex session

These files are review criteria, not instructions addressed to the reviewer: a Codex reviewer still reads `CLAUDE.md` here even though `AGENTS.md` scopes which of its sections govern a Codex session. Match each rule to what it governs. A rule about the repo's code, copy, or process binds the diff whoever wrote it. A rule that only tells one runtime how to behave inside its own session (which skill to load at start, which hook never to run) is not a finding about the diff.

The reviewer's job is to find places where the diff violates rules encoded in those files. High-value patterns (substitute this project's actual rules):

- User-facing copy (toasts, banners, errors, modals, tooltips) that violates a naming or terminology policy in `CLAUDE.md`.
- Diffs that bypass the project's migration or schema-change protocol.
- UI changes that satisfy only one of multiple required themes/modes.
- New env vars / `process.env.X` reads without a corresponding entry in the env-var reference.
- Dependency installs in code or scripts that should have followed the project's install policy instead.
- Anything else flagged in `pitfalls.md`.

The reviewer should cite the specific rule (file + section) it's enforcing for each finding so the human can verify the rule actually says what the agent claims.

**Bucket F: Intent and gaps** (only with an author brief)

Buckets A–E judge what the code does. None of them knows what it was meant to do, so none can say it missed its goal. Bucket F gets the diff plus the author brief and checks the change against its stated purpose:

- Does the diff achieve the stated goal on every path the goal implies, or only the one the author tested?
- Cases the goal requires that the diff doesn't handle (other callers, other runtimes, existing data, removal and rollback).
- The files or behaviors the brief names as risky: are they actually safe? Verify; don't take the brief's word.
- Related work in flight: will this change conflict with, or depend on, the other PRs or merge order the brief names?
- The checks the brief says were run: do they actually exercise the risky parts, or is something important untested?

The brief is the author's framing, not evidence. Findings come from the code; the brief only says where to aim.

**Bucket G: Open lens** (everything but a tiny diff)

The other buckets are fixed lenses. Bucket G gets the diff and the names of the lenses already assigned in this run (never their findings, and never the author brief), then chooses the one or two lenses most likely to find a real problem in this diff that no assigned reviewer covers. It may pick a standard bucket that was not assigned, or any other lens the diff calls for, for example:

- Rendering and frame budget, reduced-motion and accessibility, visual regressions (UI and animation)
- Concurrency and ordering, resource cleanup (async code, workers)
- Cross-platform behavior: shells, line endings, paths (scripts and tooling)
- Cost and rate limits, prompt size (LLM calls)
- Copy, i18n, and user-facing wording

It names each lens it chose and ties the choice to specific lines of the diff before reviewing through it. A lens with no reason tied to this diff counts as a failed review, not a finding.
