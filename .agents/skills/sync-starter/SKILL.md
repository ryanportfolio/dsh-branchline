---
name: "sync-starter"
description: "Use when the user asks to pull template improvements into a spawned repo, compare starter drift, or push a generic improvement back to the starter."
---

# Two-way sync with the starter template

Spawned projects freeze the template at spawn date; the template keeps improving. This skill closes the gap in both directions. Template repo: `ryanportfolio/Harness-Firmware` (formerly `claude-starter`; the old URL redirects, but use the new one).

Both runtimes share this surface. Claude reads `CLAUDE.md` and `.claude/`; Codex reads `AGENTS.md` and `.agents/skills/`. Each `.agents/skills/<name>/` is either a maintained native skill or a generated adapter, as declared in `.agents/skill-modes.json` (omitted names are adapters). Maintained natives are edited directly; adapters are regenerated from `.claude/skills/<name>/` and never hand-edited.

## Direction A: pull template improvements into this project

### Step 1: wire the remote (once)

```
git remote get-url starter || git remote add starter https://github.com/ryanportfolio/Harness-Firmware.git
git fetch starter
```

### Step 2: diff the shared surface

Only these paths are sync candidates:

```
git diff --stat HEAD starter/main -- AGENTS.md .agents/CODEX-SKILL-COMPATIBILITY.md .agents/skill-modes.json .agents/skill-capabilities.json .agents/skills .claude/skills .claude/hooks .claude/scripts .claude/output-styles .claude/settings.json
```

Diverged by design; never bulk-pull these:

- `CLAUDE.md` is project-configured (FILL IN sections replaced). If the template's kernel changed, read the template version (`git show starter/main:CLAUDE.md`) and hand-merge the relevant rule into the project copy.
- `.claude/reference/*` is project knowledge. The template only ships skeletons.

### Step 3: present and pick

Group the diff for the user: new skills, changed skills, Codex boundary and compatibility, hooks/scripts/settings. Give one line each on what changed; read the actual diff, do not guess from filenames. Ask directly which to take, as a numbered list.

### Step 4: apply selectively

Compare maintained native bodies and every referenced resource, together with `.agents/skill-modes.json` and `.agents/skill-capabilities.json`. Reconcile each selected ownership change with its corresponding files. Preserve project customizations and deliberate disables; merge customized native files and registry entries instead of checking out whole directories. The generator preserves native files and only regenerates adapter-owned content. Inspect the registry first to distinguish ownership. Apply already-approved selections without another permission round.

```
git checkout starter/main -- <picked-paths>
```

Handle selected retirements explicitly before regenerating: checkout does not remove files absent upstream. For this migration, remove `.agents/skills/unslop/SKILL.md` and `.claude/skills/writing-skills/SKILL.md`, plus any retired counterpart entrypoint left by an earlier partial sync. First inspect and back up local customizations; move useful behavior into the replacement skill or preserve it outside discovery. Keep supporting resources and licenses. Drop the `unslop` ownership entry; an inherited `writing-skills: disabled` entry may remain inert. Confirm no retired name retains a SKILL.md in either root before running the generator.

For `.claude/settings.json`: merge, do not overwrite. The project may have its own permission additions. Read both, union the `allow` lists, keep project-specific hooks.

After any skill, generator, compatibility matrix, ownership, or `skillOverrides` change, run these Node scripts from the repository root:

```
node .claude/scripts/sync-codex-skills.mjs --write
node .claude/scripts/test-codex-contract.mjs
node .claude/scripts/check-skill-capabilities.mjs
```

For intentional registry changes, regenerate the capability catalog with `node .claude/scripts/check-skill-capabilities.mjs --write`. Stage generated `.agents/skills/` changes even when only the generator changed, along with the selected pulled paths.

### Step 5: ship

Only when shipping is authorized: branch, stage exactly the selected pulled paths plus regenerated adapter paths, commit (`Sync from claude-starter: <what>`), push, and open a PR, following the project's git rules in `AGENTS.md`.

## Direction B: push a generic improvement back to the template

When the user authorized propagation of a generic skill fix, new skill, or hook improvement made in this project:

1. **Genericize first.** Strip project-specific names, paths, URLs, and stack assumptions, with the same scrub discipline the template was built with. If it cannot be genericized, it does not go back.
2. **Get the change to the template repo.**
   - If this machine has the template checked out locally (e.g. `~/code/Harness-Firmware`), apply the change there directly.
   - Otherwise clone it to scratch: `git clone https://github.com/ryanportfolio/Harness-Firmware .tmp/Harness-Firmware`, apply, push from there.
3. **Commit to the template on a branch, push, open the PR** (or follow an explicit user-approved branch strategy). Use a PR for `bootstrap/`, `.claude/hooks/`, or `settings.json` by default: those are the spawn-critical surface, and the `validate-template` Action's `generator-smoke` job exists because spawn time is the worst moment for them to fail. Skill or doc prose has a smaller blast radius; a broken `.ps1` does not.
   - CI gates both `push` and `pull_request`, so direct-to-main is still checked, but only after the change is live to everyone spawning a project. That is why PR is the default.
   - The dual trigger means a PR shows two check runs and sits at `mergeStateStatus: UNSTABLE` until the second finishes. Wait for it (`gh run watch <id> --exit-status`); do not merge on the first green.
   - The template allows squash only: `gh pr merge <n> --squash`, when merging is authorized.
   - If the change touched a skill, run `node .claude/scripts/sync-codex-skills.mjs --check` and include any regenerated adapters; CI fails on stale ones.
4. **Bump the plugin version** when the change touches the shared surface (`.claude/skills`, `.claude/hooks`, `.claude/output-styles`, `.claude/settings.json`): edit `version` in the template's `.claude-plugin/plugin.json`, patch for fixes, minor for new skills. Plugin installs only receive updates when this number changes; spawned projects get changes through Direction A regardless.
5. Mention that other spawned projects pick it up through Direction A.

## Anti-patterns

- Do not `git checkout starter/main -- .claude` wholesale; it clobbers diverged-by-design files.
- Do not overwrite `settings.json`; union the permission lists.
- Do not push project-flavored content back to the template; genericize or leave it.
- Do not treat a `CLAUDE.md` diff as pullable; kernel changes are always a hand-merge.
- Do not hand-edit generated `.agents/skills/` adapters; update the canonical Claude skill and regenerate. Edit maintained native skills directly in `.agents/skills/<name>/`.
- Do not sync on every session. This is occasional maintenance, user-triggered.
