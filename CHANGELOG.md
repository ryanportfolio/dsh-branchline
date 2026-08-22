# Changelog

All notable changes to this project are documented in this file.

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
