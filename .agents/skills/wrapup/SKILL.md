---
name: wrapup
description: "Use on $wrapup or when the user asks if a session is done, good to archive, or what is left: one verdict from git, the PR, scratch files and running servers or browsers."
---

# Wrap up

Answer "good to archive?" from evidence, not memory. Read-only until the user agrees to a fix. Script paths are from the repository root; in a personal install, use the `scripts/` folder in this skill's directory. It needs the servers skill beside it.

1. From the session's checkout, run `node .agents/skills/wrapup/scripts/wrapup.mjs` (add `--worktrees` for repo-wide cleanup). It fetches, then reports uncommitted changes, commits on no remote, this branch's PR, `.tmp/` scratch that removing the worktree would delete, servers and automation browsers still running from this checkout, and other worktrees that hold work or sit exactly on a merged PR head.
2. Add what only this session knows: browsers or terminals it started, spawned agents still running, and promises made earlier in the conversation that are not done.
3. Reply with the verdict first, one line: **Ready to archive** or **Not yet**, then each blocker with the action that clears it. Brief notes after. An open PR blocks: the session is not ready to archive until its PR is merged or closed. That includes PRs this session opened from other worktrees or repositories, which the script cannot see.
4. Offer the fixes as one go. Git pushes, PR changes and process kills follow `AGENTS.md` approval rules. Close only servers and browsers this session started (`node .agents/skills/servers/scripts/servers.mjs close <port> --yes`); remove only worktrees it created, after `rmdir` of their `node_modules` links. Never force-remove through a junction, touch other sessions' worktrees, or discard uncommitted work.

A merged PR with leftover local commits is a note, not a pass: check those commits were part of the merge before saying ready.
