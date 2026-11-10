---
name: servers
description: "After starting a dev server, or user asks what's running, which port is which, why browsers or node.exe are open, or to close old servers and browsers."
---

# Servers and automation browsers

Script paths are from the repository root; in a personal install, use the `scripts/` folder in this skill's directory.

The triage covers the whole machine, every session and app, not only what this session started. `.agents/skills/servers/scripts/servers.mjs` groups each dev server (listener on port 1024+ owned by node, bun, python and similar), automation browser (Chrome, Edge or Chromium started with a debugging flag or its own profile) and helper runtime (any other node, bun, deno or python process) with the launchers that started it (`npm`, `cmd /c`, `bash -c`), and judges the unit. A personal browser launched normally is never listed.

Run `node .agents/skills/servers/scripts/servers.mjs` and show the user the result: three groups with a one-line reason per row, then the node.exe count by kind.

- Safe to close: folder deleted; orphaned (its launching shell or session has exited) and old, failing (5xx) or silent; a helper runtime such as a Playwright MCP whose session has exited.
- Probably stale, the user's call: orphaned but young; old with its session still open; failing; a duplicate running the same command as a listening server without holding a port.
- Keep: protected; in use (another live process names its port in a URL, such as `verify-*.mjs --base http://127.0.0.1:8349`, or holds a loopback connection to it); an app from a repository's main checkout that answers; young and owned by an open session. Helper runtimes with a live owner (Playwright MCP, Codex, the ChatGPT app, vercel CLI, scripts) are one line per kind and close with their session or app.

The verdicts use parent process and age, `GET /` on each port (1.5 s), whether the folder exists, records, and `~/.claude/servers-protect.txt` (a port or name per line; protected rows are never closed, since closing kills the tree). Options: `--here` (this repository), `--all` (every helper row), `--old-hours N` (default 12), `--json`. Add the user's own long-running apps to the protect file when they ask. Answer "which port is X" from the folder and purpose columns, with the URL.

After starting a server, record it from the checkout it serves, since Windows cannot tell which folder a running `npm run dev` belongs to: `node .agents/skills/servers/scripts/servers.mjs register --port 5173 --purpose "menu page preview"`. `launchPlacedChrome()` records its own browsers; pass `purpose` to label them.

Close by showing the triage first and recommending the safe group: `close safe` (the safe group) or `close <port> pid:<pid> ...` (named rows); add `--yes` to act, since without it the script only prints the plan. Each target closes with its whole tree and leftover launchers after a fresh check that the pid is the same process and runs nothing protected; a pid inside a row closes only that process and what runs under it. `close stale` and `close old` still work. After closing, the script lists again with the node.exe count before and after; report both. Close what this session started; anything else, including other sessions' servers, browsers and helpers, only after the user saw the triage and agreed to those rows, under `AGENTS.md` approval rules.
