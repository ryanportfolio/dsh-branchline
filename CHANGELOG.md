# Changelog

All notable changes to this project are documented in this file.

## Unreleased

### Added

- Archived-session safety badges backed by a fresh default-branch fetch and exact-head GitHub merge proof, with the same proof enforced again before normal worktree deletion and unknown ignored local data treated as unsafe.
- Permanent session deletion with an explicit confirmation dialog, durable session cleanup, and guarded removal of attached Branchline worktrees and branches.
- Preserve OpenRouter image-input capabilities and configured-only model fields across catalog refreshes.
- Permanent `dsh-openrouter-sync` companion package, installed with the other workspace companions and verified in CI.
- OpenRouter cost chips and minimum-context filters in the enhanced model picker, defaulting to models with at least 256,000 context tokens.
- `scripts/dsh-core-overrides/apply-canonical-workspace-default.ps1`, which reapplies the canonical-workspace-default overrides to the DSH client runtime bundle in the npx cache after cache eviction or a `dsh` version change.
- `scripts/dsh-core-overrides/apply-performance.ps1`, which patches the dsh 0.1.5-rc.2 bundles in the npx cache: linear session list reconciliation (upstream 53046b21b4), off-stage sessions closing their history stream after 30 seconds, one abort promise per gateway stream read (upstream 4cfd292a7b), and released input-queue (upstream ba51e5483e) and right-sidebar store (upstream 490a79c693) subscriptions. Tested by `scripts/test-dsh-perf-overrides.ps1`.
- A dsh 0.1.1-rc.2 set in `apply-performance.ps1`, whose patch table is now keyed by dsh version: off-stage sessions go cold after 30 seconds so their live events stop being assembled, the composer input shell republishes only on queue changes and releases its subscription, the Trajectory view snapshot is computed on first read, the session list views skip content-equal updates, per-chunk assembly skips a settled visibility scan, running row sweeps animate `transform` instead of `left`, and the running turn label and sidebar state dot are static. Checked by `scripts/dsh-core-overrides/smoke-performance-011.mjs`.
- A host patch in the dsh 0.1.1-rc.2 set throttles the `subagentTiming` projection: it advanced its `through` timestamp on every event of a running subagent turn, so each streamed token broadcast a projection and made every client rebuild its session list (about 35 frames per second with a few busy sessions). It now advances at most once per second; the only reader shows whole seconds and uses the live clock while a turn runs.
- The launcher reapplies both DSH core override scripts before it starts DSH. It skips them while a DSH instance kept by `-KeepExisting` is still running, and a failure only logs a warning.
- `docs/settings-template.yaml`, a reference template for the `~/.dsh/settings.yaml` customizations this setup relies on: shell deadlines, OpenRouter retry policy and timeouts, pinned and custom models, default agent preset and model.

### Fixed

- `apply-canonical-workspace-default.ps1` found no original text on an unpatched bundle when the script was checked out with CRLF line endings; it now matches LF bundles, reads and writes UTF-8 without a BOM on Windows PowerShell 5.1, and accepts `-Root` for scratch copies.
- Allow permanent deletion of idle sessions by closing client selection and disposing the exact tracked Agent lifecycle handle; active model or tool work remains blocked.
- Raise the OpenRouter routing proxy request limit from 8 MiB to 64 MiB and return a descriptive 413 response when it is exceeded.
- Show OpenRouter input/output prices without dollar signs and emphasize only the numeric values.
- Backfill OpenRouter price metadata when legacy sync state has a recent catalog refresh but no cost cache.
- Keep OpenRouter metadata reads cache-only, validate cached rows, refresh metadata when the picker is reopened, and avoid filtering or pricing models from other providers.

## 0.3.0 - 2026-08-24

### Added

- Composer tool-row **worktree** quick action: one click creates a task from the current session's repository at the freshly fetched origin default branch and opens the new session on it. Task, branch, and workspace naming lead with the source repository's name (workspace titled `<repo> wt HH:MM`).
- **GitHub** source in the create-task form: searchable list of the authenticated `gh` account's repositories, with `owner/name` and URL paste support, local-clone markers, and idempotent cloning into the configured clone root before task creation. Picking a repository prefills the task title with its name.
- `cloneRoot` (default `~/CoreWise`) and `cloneTimeoutMs` configuration.

## 0.2.0 - 2026-08-22

### Changed

- Renamed the standalone project, npm package, launcher, Web task board, and human command to DSH Branchline.
- Moved plugin state defaults to `$DSH_HOME/plugins/dsh-branchline` and launcher settings to `%LOCALAPPDATA%\DSH Branchline`.
- Detached public branding from the Worktree Studio fork while retaining upstream MIT credit and Git history.
- Added a manual GitHub Actions trigger alongside push and pull-request checks.

### Migration

- Run `dsh plugin --profile web remove dsh-worktree-studio`, then rerun `setup.ps1` from this checkout.
- Existing Worktree Studio task state stays in its old directory. Configure `managedRoot` and `statePath` explicitly if it must be reused.

## 0.1.1-fresh.1 - 2026-08-22

### Added

- Fresh `origin` default-branch discovery for tasks created without an explicit base ref.
- Review-only mode, enabled by default, with Host enforcement and matching Web controls.
- Recorded base refs in task state and dashboard responses.
- Generic Windows repository launcher and one-command local setup.

### Fixed

- Reset inherited `GIT_CONFIG_COUNT` inside managed Git subprocesses so filtered Harness environments cannot leave Git with an incomplete command-line config.
- Keep the Web board's **All repositories** filter selected after its initial default workspace is applied.
- Preserve executable search paths in scrubbed Git and validation subprocess environments.
- Keep asynchronous launcher output callbacks outside PowerShell runspaces.

## 0.1.1 - 2026-08-19

### Fixed

- Confirm existing worktree paths through Git identity during recovery when Windows path formatting differs from `git worktree list` output.
- Serialize Windows fixture files in CI to avoid subprocess and worktree metadata contention.

## 0.1.0 - 2026-08-19

### Added

- Session-linked Web task board and `/worktree-studio` human command.
- Branch-backed linked worktree creation with native DSH Workspace and Session opening.
- Content-level change tokens covering tracked diffs and non-ignored untracked file bytes.
- Validation results bound to exact change tokens, with bounded stdout and stderr.
- Checkout-safe `git merge-tree` preview and guarded non-fast-forward delivery.
- Explicit archive and discard flows, atomic state, cross-process mutation locking, and restart recovery.
- Loopback same-origin Web request checks and managed subprocess execution with ambient credential scrubbing.
- English and Chinese product copy and documentation.
