---
name: apply-firmware
description: "Use on /apply-firmware or to bring the current folder (a plain folder, an existing repo, or an older or partial firmware copy) up to full Harness Firmware in place. To mirror an external repo instead, use adopt-repo."
---

# apply-firmware: bring the current folder up to full firmware

`adopt-repo` pulls an external repo into a new mirror. This skill works in place: the folder you are in already holds the user's work (a plain folder, a git repo, or a project with an older or partial firmware copy). It adds every missing firmware piece, merges partial ones, and leaves the user's content alone.

Template: `ryanportfolio/Harness-Firmware`, default branch `main`. Read it from GitHub; never from a local checkout, which may be stale.

## Scope

The template's `.agents/template-manifest.json` defines the firmware layer: `projectPaths` is what a project gets (`CLAUDE.md`, `AGENTS.md`, `.claude/`, `.agents/`, `.mcp.json`, `.gitignore`, `.gitattributes`, `docs/codex-skills.md`, `scripts/lib/` at the time of writing), and `templateOnly` is what stays in the template (README, GUIDE, LICENSE, CHANGELOG, `bootstrap/`, `docs/specs/` and the other showcase and design files). `detect.mjs` reads both, so the scope follows the template. Its `skills` block holds the groups, the required skills, which skills need which (`dependencies`) and the `minimal` preset.

Out of scope unless the user asks: everything in `templateOnly`. Never touch `.claude/settings.local.json`, `.claude/worktrees/`, or app code, manifests, and build config.

## Preflight (stop conditions)

1. Target is the session working directory unless the user named another. Stop if it is a drive root, the home directory, or `~/.claude`.
2. Stop if `origin` is the template itself (`ryanportfolio/Harness-Firmware` or `claude-starter`); that is template maintenance, not a project. `detect.mjs` exits with code 3 in that case, so a script can gate on it.
3. If the folder sits inside a larger git repo (`git rev-parse --show-toplevel` differs from the folder), confirm the user wants firmware at this subfolder rather than the repo root.
4. Non-git folder: offer `git init` first so every change is reviewable and reversible. Proceed without git only if the user declines; backups below still apply.
5. Dirty git tree: fine, but touch only firmware-layer paths, and name any dirty firmware file in the preview so its uncommitted edits are treated as user content.

## Step 1: fetch the template

Clone to a short path outside the target (Windows loses files past 260 characters with `core.longpaths` off; a silent loss is easy to miss):

```
git clone --filter=blob:none https://github.com/ryanportfolio/Harness-Firmware <short-scratch>/hf
```

`--filter=blob:none` keeps full history without blobs, which the detector uses to spot stale-but-unedited template copies. Compare `git ls-files | wc -l` in the clone with `gh api repos/ryanportfolio/Harness-Firmware/git/trees/main?recursive=1 --jq '[.tree[]|select(.type=="blob")]|length'`.

## Step 2: detect (read-only)

```
node <this-skill>/scripts/detect.mjs --target <folder> --template <short-scratch>/hf
```

Add `--json` for machine-readable output. It stops with exit code 2 when the template manifest is unreadable, has a `version` other than 1, or has a top-level key it does not know; the template is then newer than this skill, so update the skill from the template before going on. It classifies every firmware-layer file:

| Class | Meaning | Default action |
|---|---|---|
| ADD | Absent locally | Copy from template |
| UPDATE-STALE | Byte-identical to an older template version on `main` (unmerged branches do not count), so the user never edited it | Refresh to current template |
| MERGE | Kernel sections, JSON keys, ignore lines | Additive merge (rules below) |
| CONFLICT | Differs from every template version: the user edited it | Ask per file |
| OK | Identical, or existing `.claude/reference/*` project knowledge | Nothing |
| RETIRED | Unedited copy of a file the template once shipped and has since deleted (for example `.agents/skill-capabilities.json` and its checker), or of a template leftover | Offer removal; keep on no |
| SKIPPED | Skill the project listed in `.agents/removed-skills.json` (required skills excepted) | Do not re-add |
| PROJECT-ONLY | Local firmware-layer file the template lacks (custom skill, extra reference) | Keep |

Skill folders are summarized as `n/total files`, so a partial skill shows up as partial.

A template leftover is a folder under `.claude/skills/` or `.agents/skills/` with no `SKILL.md`, no `.claude-plugin/plugin.json`, and no `.agents/skill-modes.json` entry: files a retired skill left behind, such as `writing-skills`. Leftovers are never added; detect names the ones the template still carries on one `template leftovers ignored` line, and an edited project copy counts as PROJECT-ONLY. Every other `.agents/skills/` file is classified like any other file; the template ships no generated adapters.

Links in the firmware layer are listed under SYMLINKS and never followed; a copy through one can land outside the folder, so decide each by hand. A shallow template clone gets a WARNING line: stale detection then sees only part of the history, so re-clone as in Step 1.

Skill dependencies: detect lists DEPENDENCY GAPS, computed over the skills the project will have (present, plus ADD, minus SKIPPED): each `skills.dependencies` need missing from that set, marked when the project recorded it as removed, and each `skills.required` skill the project recorded as removed (it is kept or added anyway, so the record needs fixing). Say so in the preview. Adding the dependency is the default; leaving it out means the dependent skill cannot run.

## Step 3: preview and ask

Show one grouped preview before writing anything: additions (counts plus skill names), stale refreshes, each MERGE with its concrete additions, each CONFLICT with a short diff summary read from the actual files, anything skipped, and every dependency gap. Ask in plain chat, numbered, for:

- each CONFLICT: keep mine (default), take template, or hand-merge;
- each kernel section present in both but differing: keep mine (default) or show the template text so the user can adopt parts;
- any JSON scalar conflict (for example a different `outputStyle`): keep mine by default.

ADD, UPDATE-STALE, and additive MERGE items apply on one approval of the preview. Nothing the user edited is replaced without an explicit per-item yes.

## Step 4: apply

Before replacing or rewriting any existing file, copy it to `.tmp/apply-firmware-backup-<timestamp>/<same path>` and make sure `.tmp/` is gitignored.

- **ADD / UPDATE-STALE**: copy from the clone, preserving path. Copy whole skill folders including `references/`, `scripts/`, `assets/`, and license files.
- **CLAUDE.md**: missing file gets the template kernel. Existing file: append missing `##` sections in template order, keep every project section and every configured FILL IN answer, never rewrite a section the user changed without approval. Missing rows in the reference-library table get added.
- **AGENTS.md**: same section merge; it owns Codex runtime safety, so missing sections matter.
- **`.claude/settings.json`**: deep merge. Add missing keys, union arrays (`permissions.allow`, `permissions.deny`), keep project hooks and add template hooks whose `command` is absent (detect lists them as hook additions, by command). Keep the project value on scalar conflicts unless approved.
- **`.mcp.json`**: add missing `mcpServers` entries; a same-name server with a different config is a CONFLICT.
- **`.agents/skill-modes.json`**: add missing entries; keep project entries, including deliberate `disabled` choices. Leave out entries for SKIPPED skills; detect already drops them from the keys to add.
- **`.agents/removed-skills.json`**: the project's record; keep it as is. Copy the template's empty record only when the file is missing.
- **RETIRED**: delete only the files the user approved; back them up first like any replaced file.
- **`.gitignore` / `.gitattributes`**: append missing lines under a `# Harness` comment; never reorder or drop existing lines.
- **`.claude/reference/*`**: add missing skeleton files only. Existing files are project knowledge.
- **Codex skills**: after skills and registries are in place, run `node .claude/scripts/sync-codex-skills.mjs --write` (it generates nothing; it deletes old generated adapters), then `--check`, `node .claude/scripts/test-codex-contract.mjs`, and `node .claude/scripts/removed-skills.mjs` (warns on a missing skill not recorded as removed, and on a skill whose dependency is missing). Never add a generated adapter.

## Step 5: configure

If the kernel has FILL IN markers after merging, or the project has no `.github/workflows/ci.yml`, run the `init-project` skill: it fills the markers from the detected stack, applies the skill profile and prose default, writes project CI with `.claude/scripts/write-ci-workflow.mjs`, and wires the `starter` remote. Pass it this folder's facts rather than re-asking. Adding a `starter` remote needs the user's yes; keep an existing one. Once the remote exists, later updates go through `sync-starter` instead of this skill.

## Step 6: verify and report

Rerun `detect.mjs`. Expected result: ADD and UPDATE-STALE are empty; MERGE lists only items the user chose to keep; CONFLICT and RETIRED list only declined items. Validate every JSON file parses, `bash -n .claude/hooks/*.sh`, and that the skill folder names match their frontmatter `name`.

Report: files added, refreshed, merged (with the keys and sections), conflicts kept or replaced, backup path, validation output, remaining FILL IN markers, and that the running session needs a restart to load new skills and settings.

## Hard rules

- Never overwrite user-edited content without a per-item yes; back up anything replaced.
- Never commit, push, create remotes, or install dependencies as part of applying; those need their own request.
- Never modify app code, manifests, or build config.
- Never bulk-copy `.claude/` over the folder; that clobbers settings and project knowledge.
- Delete the scratch template clone when done.
