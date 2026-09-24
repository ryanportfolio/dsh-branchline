# Optional setup profiles and starter cleanup

Use only the options relevant to the requested setup. Infer established choices; ask about
material missing preferences once. FILL IN markers mean facts are unknown, not that setup
or deletion is authorized. A configured project can receive a requested narrow update.

## Project and skill profiles

Offer web-app, backend/CLI/library, data/notebooks, or writing/docs when the project needs a
profile. Keep the full skill set by default. For projects without a UI, forge-repo-ui-skill
and lab are candidates to disable, not proof those workflows will never be useful.

An optional minimal preset omits situational extras: advocate, enhance-prompt, fable-mode,
forge-repo-ui-skill, handoff-audit, lab, and why. Caveman can also be omitted if it is not the
configured prose default. Preserve skills referenced by active instructions and user
customizations. Show the concrete selection before applying it unless already approved.
Prefer reversible discovery settings over deleting skill folders. A request for minimal
configuration does not by itself authorize deleting custom resources.

In this starter, inspect the current generator and ownership registry before applying
settings: Claude legacy skillOverrides and Codex .agents/skill-modes.json have distinct
roles. Preserve explicit native ownership and intentional disables. Regeneration updates
adapter-owned files; it does not overwrite or restore maintained native bodies/resources.
Use the runtime's supported setting only after verifying it in installed sources. Record
what should disappear from discovery and verify after reload; source edits alone do not
prove the running client loaded them.

## Prose mode

Preserve the user's established choice; otherwise explain the inherited Caveman Ultra
briefly and offer ultra/full/lite/normal if they want to change it. Code, commands, errors,
security explanations and irreversible confirmations retain normal technical prose.

For Claude, the project default may be present in both CLAUDE.md and the session-start
hook. Inspect them. This starter marks hook blocks caveman:directive, caveman:reminder,
and caveman:call. Change their level together for full/lite, or remove only those default
blocks and the default section for normal. Keep the skill available for explicit use.
Check remaining references and run bash -n on an edited shell hook; do not execute the
hook in Codex. For Codex, update the AGENTS.md default it actually reads; Claude hook
changes do not configure Codex. If both runtimes are in scope, keep both defaults aligned.

## Spawned-project cleanup

Distinguish a spawned project from a template maintenance checkout before cleanup. Inspect
origin, README and distribution assets together. A canonical template origin is evidence
to stop initialization; an ambiguous fork needs clarification. Preserve intentional
placeholders in template maintenance work.

Potential template-only paths are .claude-plugin/, bootstrap/,
.github/workflows/validate-template.yml, .github/ISSUE_TEMPLATE/, CHANGELOG.md, and
CONTRIBUTING.md. Compare each with the template and inspect project modifications and
references before proposing removal. Keep customized or used assets; never delete the
list blindly. Remove empty parent directories only if they remain inside the authorized
workspace. Existing authorization for this exact cleanup need not be requested again.

Seed commands and stack references from manifests, deployment from actual configuration
or user answers, and leave unknown facts explicit. Preserve useful architecture, secrets
and pitfalls entries. Replace a template README only when that change is in scope, using
real project facts. Adding a starter remote changes local Git configuration and requires
setup scope that includes it; preserve an existing remote rather than replacing it.

Validate changed configuration, links, hooks and ownership synchronization. Report kept
customizations, disabled capabilities, cleanup, unknowns, and reload limits. Setup does
not authorize installation, commit, push, merge or deployment by itself.
