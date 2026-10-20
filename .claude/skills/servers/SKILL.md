---
name: servers
description: "Use on /servers, after starting a dev server, or when the user asks what is running, which port is which, why browsers are open, or to close old servers and browsers."
---

# Servers and automation browsers

Script paths below are from the repository root; when this skill came from a plugin, use the `scripts/` folder in this skill's base directory instead, and keep running from the checkout.

`.claude/skills/servers/scripts/servers.mjs` lists dev servers (listeners on port 1024+ owned by node, bun, python and similar) and automation browsers (Chrome, Edge or Chromium started with a debugging flag or their own profile). A personal browser launched normally is never listed.

**Record what you start.** Windows cannot tell which folder a running `npm run dev` belongs to, so after starting a server, record it from the checkout it serves:

```bash
node .claude/skills/servers/scripts/servers.mjs register --port 5173 --purpose "menu page preview"
```

`launchPlacedChrome()` records its browsers itself; pass `purpose` to label them.

**List.** `node .claude/skills/servers/scripts/servers.mjs` prints port, pid, age, folder, purpose and flags; `--here` limits it to this repository, `--json` gives data. Flags:

- `gone`: its worktree was deleted; the server outlived its checkout.
- `old`: older than `--old-hours` (default 12).
- `unknown`: a server with no record and no folder in its command line.
- `protected`: it, or a process under it, is listed in `~/.claude/servers-protect.txt` (a port or name per line); the script never closes it, since closing kills the whole tree.

When the user asks "which port is X", answer from the purpose and folder columns and give the URL. When asked to "turn on" a server that is not listed, start it from the right checkout and record it.

**Close.** Show the plan first, then close:

```bash
node .claude/skills/servers/scripts/servers.mjs close stale        # gone-worktree rows
node .claude/skills/servers/scripts/servers.mjs close old          # recorded rows and automation browsers, old or gone
node .claude/skills/servers/scripts/servers.mjs close 5173 --yes   # one port, with its recorded launcher; pid:<pid> for exactly one process
```

`stale` and `old` skip unknown and protected rows. Closing kills the whole process tree. Close what this session started without asking; anything else only after the user has seen the list and agreed.
