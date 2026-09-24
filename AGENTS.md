# Codex Instructions

This is the Codex boundary for repositories using the AI Operating System starter. Claude Code keeps using `CLAUDE.md` and `.claude/` unchanged.

## Defaults

- Use Caveman Ultra for prose from the first reply, without asking or requiring `$caveman`. Keep code, commands, identifiers, errors, commits, PR text, and files normal.
- Caveman includes Unslop for all session replies. Use the Writing skill for user-facing deliverables such as website copy, product UI, onboarding, guides, and release notes; keep those artifacts in normal audience-appropriate prose.
- Use plain prose for security warnings, irreversible confirmations, and ambiguous multi-step decisions, then resume Ultra. A new session restores Ultra after the user temporarily disables it.
- When creating copy for a site, UI, or anything else: less is more. Simplicity is powerful. Complexity does not need to be complicated.
- Read only `CLAUDE.md`'s What this project is, Verification, and Environment & Deploy Target sections for configured project facts. Use `.claude/reference/` for architecture, commands, deployment, and pitfalls. Other `CLAUDE.md` workflow rules are not Codex instructions.
- Never execute `.claude/hooks/session-start.sh` in Codex.

## Capabilities

- Inspect tools exposed in the current session before using subagents, browser control, connectors, or interactive input. Config flags alone are not proof.
- Browser per session, never shared. The official playwright plugin holds one persistent profile; a second connection fails with "Browser is already in use ... use --isolated" and deadlocks. Parallel or subagent browser work uses the `playwright-iso` MCP server from `.mcp.json` (`@playwright/mcp --isolated`, in-memory profile) or `scripts/lib/launch-chrome.mjs`.
- Spawn subagents with fresh context (`fork_turns: "none"`) and a self-contained brief by default. Inherit conversation history only when the task specifically benefits from it. Independent reviewers always start fresh; report a capability gap if the exposed runtime cannot provide this.
- Serial fallback is valid only when independence is not part of the deliverable. `impartial-review`, `advocate`, and `why` require fresh independent context; if unavailable, report the gap.
- Claude `Workflow` programs are not Codex programs. Recreate their intent with exposed Codex agents or flag them blocked.
- Keep critical Codex rules here rather than in project hooks, which require separate trust and can be disabled.

## RTK

- When installed, prefer `rtk` for noisy supported reads: `rtk git status`, `rtk git diff`, `rtk git log`, `rtk git show`, `rtk rg`, and `rtk read`.
- Use `rtk test <command>` for failure-focused output; preserve its exit code and rerun natively when full success output is required as evidence.
- Use native commands for mutations, interactivity, unsupported syntax, exact-output parsing, and diagnosis when filtering hides detail.
- Codex has no Claude RTK rewrite hook here. Invoke `rtk` explicitly.

## Safety

- Caveman Ultra is a communication default, not side-effect authorization. Auto-merge and other persistent side-effect modes require explicit current-session intent.
- Standing exception: a confirmed project quirk that cost a retry, a backed-out change, or a user correction may be saved to `.claude/reference/pitfalls.md` without asking (see the recall skill). No other reference or memory write inherits this.
- Stage explicit paths, preserve unrelated changes, and verify before claiming completion.
- If a skill causes a permission request, pause, or unfinished authorized work, link the exact `SKILL.md`, quote the blocking instruction, and explain why existing authorization does not cover the action. Distinguish an explicit requirement from an interpretation; user instructions take precedence over skill guidelines within system and developer constraints.

## Shared Assets

- `.claude/skills/` remains Claude’s library. Codex uses maintained native skills and generated adapters under `.agents/skills/`, selected by `.agents/skill-modes.json`. Read native files directly and resolve resources there; adapters resolve resources from their canonical Claude skill. Treat `$ARGUMENTS` in adapters as invocation input.
- Read relevant `.claude/reference/` material before unfamiliar work and `.agents/CODEX-SKILL-COMPATIBILITY.md` before adapted, gated, or dangerous skills.
- After skill, ownership-mode, or legacy override changes run `node .claude/scripts/sync-codex-skills.mjs --write`. Sync preserves native files; do not hand-edit marked generated adapters. Use `addskill` for create/import/update/install; it uses built-in `skill-creator` for Codex authoring. Update `.agents/skill-capabilities.json` and run `node .claude/scripts/check-skill-capabilities.mjs` for coverage, resources and retired routes.
- For Codex setup, skills, or runtime troubleshooting, inspect local configuration, exposed tools, and relevant installed sources first. Consult official documentation when local evidence is insufficient or current product behavior needs verification.
- Tool mapping: `.agents/codex-tools.md`.

## Starter Maintenance

Only in the canonical `claude-starter` template repository: keep `bootstrap/` PowerShell 5.1 files ASCII-only and shell scripts LF. Claude gets its hooks and slash skills; Codex gets `AGENTS.md` and `.agents/skills/`. Keep private paths, tokens, and maintainer-only workflow out of defaults.
