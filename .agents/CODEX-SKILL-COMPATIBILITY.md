# Codex Skill Compatibility

`.claude/skills/` remains Claude's source. An adapter exposes a workflow; it does not prove every runtime capability exists.

`.agents/skill-modes.json` declares `native`, `adapter`, or `disabled`; omitted names
retain adapter behavior. Maintain native skills directly in `.agents/skills/<name>/`;
they do not load Claude workflow bodies. Sync preserves native content and validates
metadata and local references. Legacy `skillOverrides: off` remains disabled. Move a
maintained skill outside discovery explicitly before disabling it. Ownership is separate
from the capability classifications below. `writing-skills` and `unslop` entrypoints are
retired in both runtimes. Use `addskill` for create/import/update/install; it uses built-in
`skill-creator` as the Codex authoring mechanism.

Personal installations are explicit copies of these sources. See `docs/codex-skills.md`
for comparison, backup, reconciliation, and discovery checks.

- **Native**: direct mapping.
- **Adapted**: Codex paths, approvals, or UI substitutions.
- **Capability-gated**: requires a currently exposed tool.
- **Claude-only**: no faithful Codex implementation.
- **Dangerous**: explicit authorization required for Git, deploy, migration, publish, or persistent side effects.

| Status | Skills |
|---|---|
| Native | `addskill`, `babysit-ci`, `brainstorming`, `bro`, `caveman`, `enhance-prompt`, `external-review`, `fable-mode`, `forge-repo-ui-skill`, `handoff-audit`, `recall`, `refine`, `session-hub`, `showpiece`, `writing`, `writing-plans` |
| Adapted | `astra-review`, `claude-review`, `codex-review`, `init-project`, `lab`, `optimize-context`, `sync-starter` |
| Capability-gated | `advocate`, `arena`, `dare`, `impartial-review`, `long-horizon`, `perf-loop`, `why`, `wow-loop` |
| Dangerous | `adopt-repo` |
| Claude-only | `astra-fullreview`, `codex-fullreview`, `long-horizon-workflows` |

`advocate`, `arena`, `dare`, `impartial-review`, `long-horizon`, and `why` require fresh independent context; do not replace them with self-review and call it equivalent. `wow-loop` is maintained as a native Codex skill with durable review state and fresh-context critics; its capability-gated classification remains unchanged. It additionally requires screenshot capture for visual work; without it, say so rather than substituting a code read for a visual verdict. `claude-review` is cross-vendor only from Codex; it must fail closed unless Claude CLI proves subscription routing and it never opts into paid usage. `codex-review` and `astra-review` from the Codex runtime lose their cross-vendor property (reviewer shares the author's vendor); it still provides fresh context, but say so instead of claiming vendor independence. `impartial-review` dispatched from Codex has the same limit; when that session exposes no agent tools, separate read-only `codex exec` processes with bounded concurrency are the fallback that keeps reviewer context fresh, and self-review is not; read its gate as agent tools or an authenticated Codex CLI. Those child processes are leaf reviewers and must not dispatch a review of their own. `external-review` is a Codex-only, single-context leaf review invoked explicitly by the `codex-review` and `astra-review` launchers in both runtimes; it needs no agent tools, and one reviewer's fresh context is its designed coverage, not a gap. `codex-fullreview` and `astra-fullreview` are Claude launchers that run `impartial-review` inside `codex exec`; Claude-only rows are disabled for Codex and need no adapter, so from Codex use `impartial-review` directly. Current system, developer, sandbox, approval, and user instructions win. Resolve generated-adapter resources from `.claude/skills/<name>/` and standalone resources from their Codex skill directory and never claim a gated workflow ran unless its tools were used.

`perf-loop` is a standalone Codex skill requiring fresh independent measurement and regression reviewers, plus a working measurement path for each performance claim. Benchmarks and competing resource-heavy work run serially on shared hardware. Missing capabilities permit scoped progress but leave the full verification gate incomplete.

`node .claude/scripts/test-codex-contract.mjs` verifies that every active skill has exactly one classification and that Codex routing metadata stays within its context budget.

`unslop` and `writing-skills` are retired from both discovery catalogs. Route cleanup to
Caveman/Writing and authoring to addskill. Legacy licensed writing-skills resources remain.
Run `node .claude/scripts/check-skill-capabilities.mjs` to check intended runtime coverage,
ownership, resource closure and retirement. The generated catalog is in `docs/codex-skills.md`.
