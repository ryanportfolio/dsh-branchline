---
name: "optimize-context"
description: "Use when the user asks to reduce per-turn context or token load, trim kernels, skills, or connectors, or propagate a generic context optimization to the starter."
---

# Reduce measured context load

Inspect the active runtime, loaded instructions, exposed tools, and discovered skills before changing configuration. Find repeated material with little decision value. Preserve required rules and useful capabilities; removing bytes does not establish a runtime token saving.

## Establish a baseline

- Codex: inspect applicable `AGENTS.md` files, exposed skill names and descriptions, ownership in `.agents/skill-modes.json`, maintained native resources, and installed discovery roots. Inspect current configuration and exposed tools; Claude `skillOverrides` does not establish Codex visibility. The repository generator may consume legacy overrides, so inspect that mapping before editing them. Use a native shell or small script to count bytes/characters for the exact selected files and discovered descriptions; label this a file/catalog estimate, not measured runtime tokens.
- Claude surfaces, when the request covers them: inspect applicable `CLAUDE.md` files, indexed memory, skill descriptions, `.claude/settings.json`, and configured connectors as files. `bash .claude/scripts/context-weight.sh` estimates file-measurable Claude instruction weight; inspect its coverage and do not treat it as the full model input. Establish supported Claude connector or visibility controls from current local Claude CLI help and configuration; if that CLI is unavailable, report those controls as unverified.
- Record runtime/version when available, exact file scope, baseline counts, and any actual usage telemetry separately. Account totals or one completion's token count do not isolate the changed instructions.

## Choose the smallest useful change

Thin a kernel or index by moving conditional detail into a referenced resource. Keep important durable rules in the runtime's durable carrier (`AGENTS.md` for Codex, `CLAUDE.md` for Claude). Relocation preserves content only when the destination and pointer exist; it can change whether and when guidance is retrieved. Test a representative task that needs the moved guidance before claiming preserved behavior.

Cut duplication, stale facts, and filler. Preserve current explicit user preferences and technical meaning. A behavioral deletion needs authority under the current request; do not infer it from a generic desire for fewer tokens.

For skill visibility or connectors, inspect the actual runtime's supported controls, scope, and reload behavior first. Distinguish project, personal, plugin, and account-owned sources. Disabling a capability can affect other projects; describe that scope and use only authorized controls. Do not assume a file edit controls an account connector or plugin. Prefer changing precise discovery descriptions over hiding useful skills merely to lower a count.

For Claude legacy visibility values or plugin commands, verify current schema/help and installation rather than relying on remembered enum values or scope claims. For Codex, edit maintained native skills directly in `.agents/skills/<name>/`, change adapter-owned descriptions in the canonical `.claude/skills/<name>/SKILL.md`, and reconcile any `.agents/skill-modes.json` or `.agents/skill-capabilities.json` change with its files. Then run from the repository root:

```
node .claude/scripts/sync-codex-skills.mjs --write
node .claude/scripts/test-codex-contract.mjs
node .claude/scripts/check-skill-capabilities.mjs
```

The generator regenerates adapter-owned content only and preserves natives. `test-codex-contract.mjs` checks that Codex routing metadata stays within its context budget. Include the generated `.agents/skills/` changes with the edit.

## Verify and report

Repeat the same measurement on the same file/catalog scope. Check links, required contracts, and representative retrieval where behavior changed. Report byte/character deltas separately from token estimates and actual runtime telemetry. Never extrapolate a local estimate into per-turn savings without observed evidence.

Already-loaded context may persist: verify discovery and tool exposure in a fresh session or supported reload. If no reload is possible, report that check as pending, with the exact expected change; successful file writes do not prove discovery changed.

## Propagation

Only propagate generic changes when already authorized. Use `$sync-starter` for selective ownership-aware comparison and application. Project knowledge, personal voice, account connector choices, and local paths stay local. Preserve receiving-project customizations and deliberate disables. Installation or local optimization does not itself authorize commits, pushes, or publication.
