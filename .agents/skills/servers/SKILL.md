---
name: servers
description: "Use on $servers, after starting a dev server, or when the user asks what is running, which port is which, why browsers are open, or to close old servers and browsers."
---

# Servers and automation browsers

Script paths are from the repository root; in a personal install, use the `scripts/` folder in this skill's directory.

`.agents/skills/servers/scripts/servers.mjs` lists dev servers (listeners on port 1024+ owned by node, bun, python and similar) and automation browsers (Chrome, Edge or Chromium started with a debugging flag or their own profile). A personal browser launched normally is never listed.

After starting a server, record it from the checkout it serves, since Windows cannot tell which folder a running `npm run dev` belongs to: `node .agents/skills/servers/scripts/servers.mjs register --port 5173 --purpose "menu page preview"`. `launchPlacedChrome()` records its own browsers; pass `purpose` to label them.

List with `node .agents/skills/servers/scripts/servers.mjs` (`--here` for this repository, `--json` for data). Flags: `gone` (worktree deleted), `old` (older than `--old-hours`, default 12), `unknown` (a server with no record or folder), `protected` (it or a process under it is in `~/.claude/servers-protect.txt`; never closed). Answer "which port is X" from the purpose and folder columns, with the URL.

Close by showing the plan first: `close stale` (gone rows), `close old` (recorded rows and automation browsers, old or gone), or `close <port>` / `close pid:<pid>`; add `--yes` to act. `stale` and `old` skip unknown and protected rows, and closing kills the process tree. A server running under a recorded launcher (`npm run dev` recorded, vite listening) closes with that launcher; `pid:<pid>` closes exactly one process. Close what this session started; anything else only after the user saw the list and agreed, under `AGENTS.md` approval rules.
