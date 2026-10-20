# Project CI

A new project has no CI of its own: the template's `validate-template.yml` is removed when the project is created. Setup gives it one with `.claude/scripts/write-ci-workflow.mjs`.

## Steps

1. From the repo root, run `node .claude/scripts/write-ci-workflow.mjs` in the shell. It writes nothing. It prints the detected stacks to stderr and the workflow it would write to stdout.
2. Show the user the detected stacks and the workflow, then ask the user directly before writing it.
3. On approval, run `node .claude/scripts/write-ci-workflow.mjs --write`. It creates `.github/workflows/ci.yml`.
4. If `.github/workflows/ci.yml` already exists, `--write` refuses and exits non-zero. Save the proposed file with `node .claude/scripts/write-ci-workflow.mjs > .tmp/ci.yml` (create `.tmp/` first if it is missing), show `git diff --no-index .github/workflows/ci.yml .tmp/ci.yml`, and ask before running `--write --force`. `--force` replaces the whole file, including any hand edits.

## What it detects

Only files at the repo root count. Each detected stack gets its own job:

- Node (`package.json`): the package manager comes from the lockfile and the Node version from `.nvmrc`, `.node-version` or `engines.node`. Only scripts that exist become steps: a typecheck script, `test` (not npm's default placeholder) and `build`. Without a typecheck script, a `tsconfig.json` plus a `typescript` dependency adds `tsc --noEmit`; when that `tsconfig.json` lists project references it adds `tsc -b` instead. It adds `--noEmit` only when the declared TypeScript is 5.6 or later (older versions reject the pair) and the root `tsconfig.json` has no inputs of its own (`files: []` or `include: []`, counting values inherited through `extends`; a base from a package is read through the installed TypeScript with `tsc --showConfig`, so install dependencies first or it counts as unknown) and references projects that reference nothing further; when a project references another, `--noEmit` fails with TS6310, so plain `tsc -b` runs and emits per each project's config.
- Python (`pyproject.toml`, `requirements*.txt` or `setup.py`): uv when `uv.lock` exists, otherwise pip. pytest runs when tests exist; mypy or pyright runs only when configured.
- Rust (`Cargo.toml`): `cargo build`, with `--locked` when `Cargo.lock` exists, then `cargo test`.
- Go (`go.mod`): `go vet`, `go build` and `go test`.

A `firmware` job runs `node .claude/scripts/sync-codex-skills.mjs --check` when that script exists. If the project later drops the Codex skills, remove the job.

When no stack command is found, the workflow has a step that posts a notice saying so, and no step that pretends to test anything. Tell the user CI checks nothing for the project yet.

## Adapt by hand

- Projects in subfolders (monorepos) and other stacks are not detected. Edit `ci.yml` yourself: add a job per package, or set `defaults.run.working-directory`.
- Review the generated commands. Tests that need a database, secrets or other services fail until the workflow provides them.
- The file is the project's to edit. Do not claim CI passes until a run on GitHub shows it; writing the file does not commit or push it. Git and outward actions follow `AGENTS.md`.
