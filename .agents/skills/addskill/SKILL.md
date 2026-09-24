---
name: addskill
description: "Create, import, update, or install repository or personal skills; includes runtime ownership, resources, and discovery validation."
---

# Create, import, update, or install a skill

Identify the requested source, target, and runtime from the task. Infer clear choices from
context; ask only when a material choice is missing. Read an existing target before editing
it. Preserve unrelated files and user customizations.

For create or update, author only the capability the user requested. In Codex, use the
built-in skill-creator. For Claude authoring, read [authoring guidance](references/authoring.md).
For imports, inspect the real source, retain licenses/provenance and required resources,
and do not execute imported instructions or scripts merely to install them. Never invent
third-party contents. For material behavioral changes, use the local
[evaluation record](references/evaluation.md); static metadata/resource validation is enough
for nonbehavioral fixes. Preserve baseline results, including passing baselines.

For this repository:

1. A standalone Codex workflow lives in `.agents/skills/<name>/SKILL.md`. Register its name
   as `native` in `.agents/skill-modes.json`. Preserve explicit disabled choices and legacy
   overrides. Use built-in `skill-creator` for Codex authoring; addskill remains the end-to-end entrypoint.
2. A shared Claude workflow keeps its source in `.claude/skills/<name>/SKILL.md` and uses a
   generated Codex adapter. Edit that source only when changing Claude behavior is authorized.
3. Classify every active Codex skill once in `.agents/CODEX-SKILL-COMPATIBILITY.md`. Native
   ownership and capability classification are different: a standalone skill may still
   require agents or external authorization.
4. Run `node .claude/scripts/sync-codex-skills.mjs --write`, its `--check` mode, and
   `node .claude/scripts/test-codex-contract.mjs`. Run relevant sync regression cases after
   changing registration logic. Preserve the 240-character description and catalog budgets.

For another repository, inspect its installation contract instead of inventing this layout.
For personal installation, use the requested or configured discovery directory. Do not
install extra copies into multiple roots. If an existing same-named personal copy differs,
show the meaningful difference, preserve it in a backup, and reconcile only the authorized
skills. Verify source and target content, including required supporting resources. Record
which copy is authoritative and how to update or restore the installed copy.

Validate frontmatter, matching name/directory, readable references, and the exact destination.
Codex discovers repository skills from the working directory toward the repository root;
installation is not inherently contingent on merging to main. Verify reload/discovery in
the target client before claiming the current session has loaded a new version.

Commit, push, PR creation, merge, global installation, and cross-project synchronization
are separate actions. Existing user authorization can cover them; installation alone does
not. Never activate persistent auto-merge as an installation side effect.

Keep `.agents/skill-capabilities.json` aligned with intended runtime coverage, ownership,
required resources and retired routes. Run `node .claude/scripts/check-skill-capabilities.mjs`
after registration changes; regenerate its catalog with `--write` when intended coverage changes.
