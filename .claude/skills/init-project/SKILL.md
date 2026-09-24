---
name: init-project
description: "Configure a starter project when setup is requested, using detected project facts and only necessary user questions."
---

# Configure a starter

Run setup only when requested. FILL IN markers signal unknown facts, not authorization to edit the project. Inspect manifests, current project instructions, reference indexes and existing setup before asking questions. Reuse configured facts; never guess a deployment target or verification capability. Detect read-only and never switch the session's worktree to another branch; see [branch placement](#pitfall-branch-placement).

Ask only for consequential facts that cannot be detected. Draft or apply the requested narrow configuration and reference changes. Preserve the separate Codex and Claude runtime boundaries; shared architecture and commands can remain shared references. Avoid deleting template/plugin directories or adding remotes without checking their actual use and authorization.

For optional project profiles, full/minimal skill selection, prose defaults, template
cleanup, or starter-remote wiring, use [setup profiles](references/profiles.md). Preserve
useful capabilities and customizations; defaults are candidates, not automatic deletions.
Read ownership settings before changing discovery, including maintained Codex natives.

Validate affected JSON, scripts, skill synchronization and links. Configuration changes can break behavior, so never recommend immediate merge merely because they are not app code. Report remaining unknowns. Setup does not imply dependency installation, commit, push, PR or deployment.

## Pitfall: branch placement

When the repo has an `origin` remote, setup commits land on a branch from freshly fetched `origin/main` (or the default branch); a local-only project with no remote yet keeps its current branch. Never switch the session's own worktree to another branch. If the app code lives only on an unmerged branch, read it without checking it out (`git show <ref>:<path>`, `git ls-tree -r <ref>`), then ask the user where the setup PR should land before writing anything. Switching the checked-out branch reloads skills and hooks from that branch, and a PR based on a feature branch carries its unmerged commits.
