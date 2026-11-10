---
name: servers
description: "/servers, after starting a dev server, or user asks what's running, which port is which, why browsers or node.exe are open, or to close old servers and browsers."
---

# Servers and automation browsers

Script paths below are from the repository root; when this skill came from a plugin, use the `scripts/` folder in this skill's base directory instead, and keep running from the checkout.

`/servers` triages the whole machine, every session and app, not only what this session started. `.claude/skills/servers/scripts/servers.mjs` groups each dev server (listener on port 1024+ owned by node, bun, python and similar), automation browser (Chrome, Edge or Chromium started with a debugging flag or its own profile) and helper runtime (any other node, bun, deno or python process) with the launchers that started it (`npm` → `cmd /c` → `node`, `bash -c`), and judges the unit. A personal browser launched normally is never listed.

**Triage.** Run it and show the user the result:

```bash
node .claude/skills/servers/scripts/servers.mjs
```

It prints three groups, each row with a one-line reason, then the node.exe count by kind:

- **Safe to close**: its folder was deleted; orphaned (the shell or session that launched it has exited) and old, failing (5xx) or silent; a helper runtime such as a Playwright MCP whose session has exited.
- **Probably stale, your call**: orphaned but young; old with its session still open; failing; a duplicate that runs the same command as a listening server but holds no port.
- **Keep**: protected; in use (another live process names its port in a URL, such as `verify-*.mjs --base http://127.0.0.1:8349`, or holds a loopback connection to it); an app from a repository's main checkout that answers; young and owned by an open session. Helper runtimes with a live owner (Playwright MCP, Codex, the ChatGPT app, vercel CLI, scripts) are one line per kind; they close with their session or app.

Signals behind the verdicts: parent process and age from the process table, `GET /` on each port (1.5 s), whether the folder still exists, records, and `~/.claude/servers-protect.txt` (a port or name per line; protected rows are never closed, since closing kills the whole tree). `--here` limits the groups to this repository, `--all` lists every helper row, `--old-hours N` moves the old line (default 12), `--json` gives data. Add the user's own long-running apps to the protect file when they ask.

When the user asks "which port is X", answer from the folder and purpose columns and give the URL. When asked to "turn on" a server that is not listed, start it from the right checkout and record it.

**Record what you start.** Windows cannot tell which folder a running `npm run dev` belongs to, so after starting a server, record it from the checkout it serves:

```bash
node .claude/skills/servers/scripts/servers.mjs register --port 5173 --purpose "menu page preview"
```

`launchPlacedChrome()` records its browsers itself; pass `purpose` to label them.

**Close.** Show the triage, recommend the safe group, and close what the user approves. Without `--yes` the script only prints the plan:

```bash
node .claude/skills/servers/scripts/servers.mjs close safe --yes             # the safe-to-close group
node .claude/skills/servers/scripts/servers.mjs close 5173 pid:4120 --yes    # named rows: a port, or the pid a row shows
```

Each target closes with its whole tree and leftover launchers, after a fresh check that the pid still belongs to the same process and runs nothing protected. A pid inside a row closes only that process and what runs under it. `close stale` (folder gone) and `close old` (recorded rows and automation browsers, old or gone) still work. After closing, the script lists again and prints the node.exe count before and after; report both to the user.

Close what this session started without asking. Anything else, including every other session's servers, browsers and helpers, only after the user has seen the triage and agreed to those rows.
