---
name: "sync-starter"
description: "Use when the user asks to pull template improvements into a spawned repo, compare starter drift, or push a generic improvement back to the starter."
---

# Two-way sync with the starter template

Spawned projects freeze the template at spawn date; the template keeps improving. This skill closes the gap in both directions. Template repo: `ryanportfolio/Harness-Firmware` (formerly `claude-starter`; the old URL redirects, but use the new one).

Both runtimes share this surface. Claude reads `CLAUDE.md` and `.claude/`; Codex reads `AGENTS.md` and `.agents/skills/`. Every skill is registered in `.agents/skill-modes.json` as `native`, with a maintained port in `.agents/skills/<name>/`, or `disabled` when it needs Claude-only tools. There are no generated adapters. `.agents/skill-sources.json` records the Claude skill hash each port matches, so the sync check warns about a Claude change without a port update.

## Direction A: pull template improvements into this project

### Step 1: wire the remote (once)

```
git remote get-url starter || git remote add starter https://github.com/ryanportfolio/Harness-Firmware.git
git fetch starter
```

### Step 2: diff the shared surface

Only these paths are sync candidates:

```
git diff --stat HEAD starter/main -- AGENTS.md .agents/CODEX-SKILL-COMPATIBILITY.md .agents/skill-modes.json .agents/skill-sources.json .agents/template-manifest.json .agents/skills .claude/skills .claude/hooks .claude/scripts .claude/output-styles .claude/settings.json
```

Diverged by design; never bulk-pull these:

- `CLAUDE.md` is project-configured (FILL IN sections replaced). If the template's kernel changed, read the template version (`git show starter/main:CLAUDE.md`) and hand-merge the relevant rule into the project copy.
- `.claude/reference/*` is project knowledge. The template only ships skeletons.

Template-only; never pull these. Every path under `templateOnly` in the template's `.agents/template-manifest.json` (`git show starter/main:.agents/template-manifest.json`). They maintain or distribute the template itself (its README, changelog, bootstrap scripts, CI workflow, research docs), and new projects are created without them. Leave them out of every selection, even when they differ.

Locked skills; never pull these. Read the project's own `.agents/skill-locks.json` (not the template's), shape `{"version": 1, "locks": {"<skill>": "<reason>"}}`. Every skill named under `locks` stays exactly as the project has it: never update, replace, or remove its `.claude/skills/<name>/` or `.agents/skills/<name>/` folder, and keep the project's own entries for it in `.agents/skill-modes.json` and `.agents/skill-sources.json`. Leave locked folders out of the diff (`':!.claude/skills/<name>' ':!.agents/skills/<name>'`) and out of every selection. A missing file means nothing is locked. A file that exists but cannot be read, is not valid JSON, or has no `locks` object stops the pull: report the error and pull nothing until it is fixed; never treat it as empty.

### Step 3: present and pick

Group the diff for the user: new skills, changed skills, Codex boundary and compatibility, hooks/scripts/settings. Give one line each on what changed; read the actual diff, do not guess from filenames. List each locked skill that was skipped with its reason from the lock file, so the user sees what they are not getting. Ask directly which to take, as a numbered list.

### Step 4: apply selectively

Compare maintained native bodies and every referenced resource, together with `.agents/skill-modes.json` and `.agents/skill-sources.json`. Reconcile each selected ownership change with its corresponding files. Preserve project customizations and deliberate disables; merge customized native files and registry entries instead of checking out whole directories. Sync never writes Codex skills; every port is maintained by hand. Take a skill's upstream `.agents/skill-sources.json` hash only with its unchanged upstream Claude skill; for a customized Claude skill registered `native`, update its Codex port and run `node .claude/scripts/sync-codex-skills.mjs --baseline <name>`. A `disabled` skill has no port and no recorded hash. Inspect the registry first to distinguish ownership. When merging registry files, keep every locked skill's entries as the project has them. Apply already-approved selections without another permission round.

```
git checkout starter/main -- <picked-paths>
```

Handle selected retirements explicitly before running the sync check: checkout does not remove files absent upstream. For this migration, remove `.agents/skills/unslop/SKILL.md` and `.claude/skills/writing-skills/SKILL.md`, plus any retired counterpart entrypoint left by an earlier partial sync. First inspect and back up local customizations; move useful behavior into the replacement skill or preserve it outside discovery. Keep supporting resources and licenses. Drop the `unslop` ownership entry; an inherited `writing-skills: disabled` entry may remain inert. Confirm no retired name retains a SKILL.md in either root before running the sync check. A retirement never removes a locked skill; report it instead.

For `.claude/settings.json`: merge, do not overwrite. The project may have its own permission additions. Read both, union the `allow` lists, keep project-specific hooks.

After any skill, sync script, compatibility matrix, ownership, or `skillOverrides` change, run these Node scripts from the repository root:

```
node .claude/scripts/sync-codex-skills.mjs --write
node .claude/scripts/test-codex-contract.mjs
```

`--write` deletes leftover generated adapters and warns about unregistered skills or Claude skills that drifted from their port. Stage `.agents/skill-sources.json` and any deleted adapter files along with the selected pulled paths.

### Step 5: ship

Only when shipping is authorized: branch, stage exactly the selected pulled paths plus `.agents/skill-sources.json` and deleted adapter paths, commit (`Sync from claude-starter: <what>`), push, and open a PR, following the project's git rules in `AGENTS.md`.

## Direction B: push a generic improvement back to the template

When the user authorized propagation of a generic skill fix, new skill, or hook improvement made in this project:

A lock in the project's `.agents/skill-locks.json` changes nothing in this direction. It keeps template changes out of the project; it does not block or require pushing a skill back.

1. **Genericize first.** Strip project-specific names, paths, URLs, and stack assumptions, with the same scrub discipline the template was built with. If it cannot be genericized, it does not go back.
2. **Get the change to the template repo.**
   - If this machine has the template checked out locally (e.g. `~/code/Harness-Firmware`), apply the change there directly.
   - Otherwise clone it to scratch: `git clone https://github.com/ryanportfolio/Harness-Firmware .tmp/Harness-Firmware`, apply, push from there.
3. **Commit to the template on a branch, push, open the PR** (or follow an explicit user-approved branch strategy). Use a PR for `bootstrap/`, `.claude/hooks/`, or `settings.json` by default: those are the spawn-critical surface, and the `validate-template` Action's `generator-smoke` job exists because spawn time is the worst moment for them to fail. Skill or doc prose has a smaller blast radius; a broken `.ps1` does not.
   - CI gates both `push` and `pull_request`, so direct-to-main is still checked, but only after the change is live to everyone spawning a project. That is why PR is the default.
   - The dual trigger means a PR shows two check runs and sits at `mergeStateStatus: UNSTABLE` until the second finishes. Wait for it (`gh run watch <id> --exit-status`); do not merge on the first green.
   - The template allows squash only: `gh pr merge <n> --squash`, when merging is authorized.
   - If the change touched a skill, update its Claude version in `.claude/skills/` to match when it has one. Once the Codex port and the Claude version match, run `node .claude/scripts/sync-codex-skills.mjs --baseline <name>` for that `native` skill, then `node .claude/scripts/sync-codex-skills.mjs --check`. Never baseline a Claude change the Codex port does not reflect. A `disabled` (Claude-only) skill takes no port or baseline; run `--check` only. CI runs the same check and warns when a Claude skill changed without a re-baseline, or when a skill has no `native` or `disabled` entry.
4. **Bump the plugin version** when the change touches the shared surface (`.claude/skills`, `.claude/hooks`, `.claude/output-styles`, `.claude/settings.json`): edit `version` in the template's `.claude-plugin/plugin.json`, patch for fixes, minor for new skills. Plugin installs only receive updates when this number changes; spawned projects get changes through Direction A regardless.
5. Mention that other spawned projects pick it up through Direction A.

## Anti-patterns

- Do not `git checkout starter/main -- .claude` wholesale; it clobbers diverged-by-design files.
- Do not overwrite `settings.json`; union the permission lists.
- Do not pull a `templateOnly` path from the template's manifest into the project.
- Do not update, replace, or remove a skill the project lists in `.agents/skill-locks.json`, and do not ignore a lock file you cannot read.
- Do not push project-flavored content back to the template; genericize or leave it.
- Do not treat a `CLAUDE.md` diff as pullable; kernel changes are always a hand-merge.
- Do not ship a generated `.agents/skills/` adapter. Write a native port under `.agents/skills/<name>/` and register it `native`, or register the skill `disabled`.
- Do not sync on every session. This is occasional maintenance, user-triggered.
