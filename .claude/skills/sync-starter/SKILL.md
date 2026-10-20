---
description: Use when the user asks to pull template improvements into a spawned repo, compare starter drift, or push a generic improvement back to the starter.
---

# sync-starter — two-way sync with the claude-starter template

Spawned projects freeze the template at spawn date; the template keeps improving. This skill closes the gap in both directions. Template repo: `ryanportfolio/Harness-Firmware` (formerly `claude-starter`; the old URL redirects, but use the new one).

## Direction A: Pull template improvements into this project

### Step 1: Wire the remote (once)

```
git remote get-url starter || git remote add starter https://github.com/ryanportfolio/Harness-Firmware.git
git fetch starter
```

### Step 2: Diff the shared surface

Only these paths are sync candidates:

```
git diff --stat HEAD starter/main -- AGENTS.md .agents/CODEX-SKILL-COMPATIBILITY.md .agents/skill-modes.json .agents/skill-sources.json .agents/template-manifest.json .agents/skills .claude/skills .claude/hooks .claude/scripts .claude/output-styles .claude/settings.json
```

**Diverged-by-design — NEVER bulk-pull these:**
- `CLAUDE.md` — project-configured (FILL IN sections replaced). If the template's kernel changed, read the template version (`git show starter/main:CLAUDE.md`), and hand-merge the relevant rule into the project copy.
- `.claude/reference/*` — project knowledge. Template only ships skeletons.

**Template-only: NEVER pull these.** Every path under `templateOnly` in the template's `.agents/template-manifest.json` (`git show starter/main:.agents/template-manifest.json`). They maintain or distribute the template itself (its README, changelog, bootstrap scripts, CI workflow, research docs), and new projects are created without them. Leave them out of every selection, even when they differ.

**Locked skills: NEVER pull these.** Read the project's own `.agents/skill-locks.json` (not the template's), shape `{"version": 1, "locks": {"<skill>": "<reason>"}}`. Every skill named under `locks` stays exactly as the project has it: never update, replace, or remove its `.claude/skills/<name>/` or `.agents/skills/<name>/` folder, and keep the project's own entries for it in `.agents/skill-modes.json` and `.agents/skill-sources.json`. Leave locked folders out of the diff (`':!.claude/skills/<name>' ':!.agents/skills/<name>'`) and out of every selection. A missing file means nothing is locked. A file that exists but cannot be read, is not valid JSON, or has no `locks` object stops the pull: report the error and pull nothing until it is fixed; never treat it as empty.

### Step 3: Present and pick

Group the diff for the user: **new skills** / **changed skills** / **Codex boundary+compatibility** / **hooks+scripts+settings**, one line each on what changed (read the actual diff, don't guess from filenames). List each locked skill that was skipped with its reason from the lock file, so the user sees what they are not getting. Ask which to take (plain chat, numbered).

### Step 4: Apply selectively

Compare maintained native bodies and every referenced resource, together with `.agents/skill-modes.json` and `.agents/skill-sources.json`. Reconcile each selected ownership change with its corresponding files. Preserve project customizations and deliberate disables; merge customized native files and registry entries instead of checking out whole directories. Sync never writes Codex skills; every port is maintained by hand. Take a skill's upstream `.agents/skill-sources.json` hash only with its unchanged upstream Claude skill; for a customized Claude skill registered `native`, update its Codex port and run `node .claude/scripts/sync-codex-skills.mjs --baseline <name>`. A `disabled` skill has no port and no recorded hash. Inspect the registry first to distinguish ownership. When merging registry files, keep every locked skill's entries as the project has them. Apply already-approved selections without another permission round.

```
git checkout starter/main -- <picked-paths>
```

Handle selected retirements explicitly before running the sync check: checkout does not remove
files absent upstream. For this migration, remove `.agents/skills/unslop/SKILL.md`
and `.claude/skills/writing-skills/SKILL.md`, plus any retired counterpart entrypoint
left by an earlier partial sync. First inspect and back up local customizations;
move useful behavior into the replacement skill or preserve it outside discovery.
Keep supporting resources and licenses. Drop the `unslop` ownership entry; an
inherited `writing-skills: disabled` entry may remain inert. Confirm no retired
name retains a SKILL.md in either root before running the sync check. A retirement never
removes a locked skill; report it instead.

For `settings.json`: merge, don't overwrite — the project may have its own permission additions. Read both, union the `allow` lists, keep project-specific hooks.

After any skill, sync script, compatibility matrix, or `skillOverrides` change, run
`node .claude/scripts/sync-codex-skills.mjs --write` (it deletes leftover generated
adapters and warns about unregistered skills or Claude skills that drifted from their port),
and `node .claude/scripts/test-codex-contract.mjs`. Stage
`.agents/skill-sources.json` and any deleted adapter files along with the selected pulled paths.

### Step 5: Ship

Only when shipping is authorized, branch, stage exactly the selected pulled paths plus `.agents/skill-sources.json` and deleted adapter paths, commit (`Sync from claude-starter: <what>`), push, and open a PR, per the project's git rule.

## Direction B: Push a generic improvement back to the template

When the user authorized propagation of a generic skill fix / new skill / hook improvement made in THIS project:

A lock in the project's `.agents/skill-locks.json` changes nothing in this direction. It keeps template changes out of the project; it does not block or require pushing a skill back.

1. **Genericize first.** Strip project-specific names, paths, URLs, stack assumptions — the same scrub discipline the template was built with. If it can't be genericized, it doesn't go back.
2. **Get the change to the template repo:**
   - If this machine has the template checked out locally (e.g. `~/code/Harness-Firmware`), apply the change there directly.
   - Otherwise clone it to scratch: `git clone https://github.com/ryanportfolio/Harness-Firmware .tmp/Harness-Firmware`, apply, push from there.
3. Commit to the template on a branch, push, open the PR (or follow an explicit user-approved branch strategy). **Use a PR for `bootstrap/`, `.claude/hooks/`, or `settings.json` by default**: those are the spawn-critical surface, and the `validate-template` Action's `generator-smoke` job exists because spawn time is the worst possible moment for them to fail. Skill or doc prose is a different blast radius; a broken `.ps1` is not.
   - CI gates **both** `push` and `pull_request`, so direct-to-main is still checked — just after the change is live to everyone spawning a project, which is why PR is the default.
   - That dual trigger means a PR shows two check runs and sits at `mergeStateStatus: UNSTABLE` until the second finishes. Wait for it (`gh run watch <id> --exit-status`); don't merge on the first green.
   - The template allows squash only: `gh pr merge <n> --squash`.
   - If the change touched a skill registered `native`, update its Codex version in `.agents/skills/` to match, run `node .claude/scripts/sync-codex-skills.mjs --baseline <name>`, then `node .claude/scripts/sync-codex-skills.mjs --check`. A `disabled` (Claude-only) skill takes no port or baseline; run `--check` only. CI runs the same check and warns when a Claude skill changed without a re-baseline, or when a skill has no `native` or `disabled` entry.
4. **Bump the plugin version** when the change touches the shared surface (`.claude/skills`, `.claude/hooks`, `.claude/output-styles`, `.claude/settings.json`): edit `version` in the template's `.claude-plugin/plugin.json` — patch for fixes, minor for new skills. Plugin installs only receive updates when this number changes; spawned projects get changes via Direction A regardless.
5. Mention that other spawned projects pick it up via Direction A.

## Anti-patterns

- Don't `git checkout starter/main -- .claude` wholesale — it clobbers diverged-by-design files.
- Don't overwrite `settings.json` — union the permission lists.
- Don't pull a `templateOnly` path from the template's manifest into the project.
- Don't update, replace, or remove a skill the project lists in `.agents/skill-locks.json`, and don't ignore a lock file you cannot read.
- Don't push project-flavored content back to the template — genericize or leave it.
- Don't treat a CLAUDE.md diff as pullable — kernel changes are always a hand-merge.
- Don't ship a generated `.agents/skills/` adapter. Write a native port under
  `.agents/skills/<name>/` and register it `native`, or register the skill `disabled`.
- Don't sync on every session. This is occasional maintenance, user-triggered.
