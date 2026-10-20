# Optional setup profiles and starter cleanup

Use only the options relevant to the requested setup. Infer established choices; ask about
material missing preferences once. FILL IN markers mean facts are unknown, not that setup
or deletion is authorized. A configured project can receive a requested narrow update.

## Project and skill profiles

Offer web-app, backend/CLI/library, data/notebooks, or writing/docs when the project needs a
profile. Keep the full skill set by default. For projects without a UI, forge-repo-ui-skill
and lab are candidates to disable, not proof those workflows will never be useful.

An optional minimal preset omits the situational extras listed under
`skills.presets.minimal.omit` in `.agents/template-manifest.json`; never omit a skill
listed under `skills.required`. Caveman can also be omitted if it is not the configured
prose default. Preserve skills referenced by active instructions and user customizations.
Show the concrete selection before applying it unless already approved. Prefer reversible
discovery settings over deleting skill folders. A request for minimal configuration does
not by itself authorize deleting custom resources. A profile or preset never deletes or
replaces a skill listed in `.agents/skill-locks.json`; a lock file that exists but cannot be
read or parsed stops the profile change with the error.

In this starter, inspect the Codex sync check and ownership registry before applying
settings: Claude legacy skillOverrides and Codex .agents/skill-modes.json have distinct
roles. Preserve explicit native ownership and intentional disables. Each Claude skill is
registered `native`, with a maintained port in `.agents/skills/<name>/`, or `disabled`;
`node .claude/scripts/sync-codex-skills.mjs --check` warns when one is not and never generates or
restores Codex bodies/resources.
Use the runtime's supported setting only after verifying it in installed sources. Record
what should disappear from discovery and verify after reload; source edits alone do not
prove the running client loaded them.

## Prose mode

Preserve the user's established choice; otherwise explain the inherited Caveman Ultra
briefly and offer normal prose if they want to turn it off. Ultra is the only level. Code, commands, errors,
security explanations and irreversible confirmations retain normal technical prose.

For Claude, the project default may be present in CLAUDE.md, the session-start hook, and
the subagent hook (`.claude/hooks/subagent-start.sh` plus its `SubagentStart` entry in
`.claude/settings.json`). Inspect them. This starter marks hook blocks caveman:directive,
caveman:reminder, and caveman:call. For normal, remove those default blocks, the default
section, and the subagent hook's writing-rule lines. Keep the subagent hook and its
`SubagentStart` entry for its rule that subagents collect their helpers' results. Keep the
skill available for explicit use.
Check remaining references and run bash -n on an edited shell hook; do not execute the
hook in Codex. For Codex, update the AGENTS.md default it actually reads; Claude hook
changes do not configure Codex. If both runtimes are in scope, keep both defaults aligned.

## Spawned-project cleanup

Distinguish a spawned project from a template maintenance checkout before cleanup. Inspect
origin, README and distribution assets together. A canonical template origin is evidence
to stop initialization; an ambiguous fork needs clarification. Preserve intentional
placeholders in template maintenance work.

Potential template-only paths are the `templateOnly` entries in
`.agents/template-manifest.json` (read the template's copy when the project has none). The
template README among them is replaced from `readmeStub`, not deleted. Compare each path
with the template and inspect project modifications and references before proposing
removal. Keep customized or used assets; never delete the list blindly. Remove empty parent
directories only if they remain inside the authorized workspace. Existing authorization for
this exact cleanup need not be requested again.

Seed commands and stack references from manifests, deployment from actual configuration
or user answers, and leave unknown facts explicit. Preserve useful architecture, secrets
and pitfalls entries. Replace a template README only when that change is in scope, using
real project facts. Adding a starter remote changes local Git configuration and requires
setup scope that includes it; preserve an existing remote rather than replacing it.

Validate changed configuration, links, hooks and ownership synchronization. Report kept
customizations, disabled capabilities, cleanup, unknowns, and reload limits. Setup does
not authorize installation, commit, push, merge or deployment by itself.
