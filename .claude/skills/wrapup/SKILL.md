---
name: wrapup
description: "Use on /wrapup or when the user asks if a session is done, good to archive, or what is left: one verdict from git, the PR, scratch files and running servers or browsers."
---

# Wrap up

Answer "good to archive?" from evidence, not memory. Read-only until the user agrees to a fix. Script paths are from the repository root; when this skill came from a plugin, use the `scripts/` folder in this skill's base directory instead, and keep running from the checkout. It needs the servers skill installed beside it.

1. From the session's checkout, run `node .claude/skills/wrapup/scripts/wrapup.mjs`. Add `--worktrees` when the user asks about cleanup across the repo. It fetches, then reports:
   - uncommitted changes and commits that are on no remote;
   - this branch's PR and its state;
   - `.tmp/` scratch that removing the worktree would delete;
   - servers and automation browsers still running from this checkout (through `.claude/skills/servers/scripts/servers.mjs`);
   - other worktrees of the repo: holding work, or sitting exactly on a merged PR head and removable.
2. Add what only this session knows: browsers opened through MCP tools, background tasks or agents still running, task chips you offered, worktrees you created by hand, and promises made earlier in the conversation that are not done.
3. Reply with the verdict first, one line: **Ready to archive**, or **Not yet**, then each blocker with the action that clears it (commit and push, merge or close PR #N, stop the server on :PORT, copy `.tmp/` findings somewhere durable). Notes that do not block go after, briefly. An open PR blocks: the session is not ready to archive until its PR is merged or closed. That includes PRs this session opened from other worktrees or repositories, which the script cannot see.
4. Offer the fixes as one go. With the user's yes: push, close the servers and browsers this session started (`node .claude/skills/servers/scripts/servers.mjs close <port> --yes`), and remove only worktrees this session created, after removing their `node_modules` links with `rmdir`. Never `git worktree remove --force` through a junction, never delete other sessions' worktrees, never discard uncommitted work.

A merged PR with leftover local commits is a note, not a pass: check that those commits were part of the merge before saying ready.
