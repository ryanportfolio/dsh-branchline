#!/usr/bin/env node
/* Triage, label and close the dev servers, automation browsers and helper runtimes left running
   on this machine, by every session and app, not only the one asking.

   node <servers skill>/scripts/servers.mjs [list] [--here] [--json] [--old-hours N]
   node <servers skill>/scripts/servers.mjs register --port N | --pid N  --purpose "menu preview"
   node <servers skill>/scripts/servers.mjs close safe|stale|old|<port>|pid:<pid> [more targets] [--yes]

   Units. Every node, bun, deno and python process, every TCP listener on port 1024+ owned by a
   dev runtime (or by a recorded process), and every Chrome/Edge/Chromium started for automation
   (a --remote-debugging-* flag or its own --user-data-dir) is grouped with the processes that
   launched it: the unit root climbs through dev-runtime parents (npx -> node) and through
   one-shot launchers that have no other child (cmd /c, bash -c, powershell -Command). A unit
   closes as one tree from its root, so its leftover launchers go with it. A personal browser
   launched normally is never listed.

   Signals per unit:
     orphaned   the root's parent has exited (Windows keeps a dead parent's pid; a later process
                under that reused pid does not count): the shell or session that started it is gone
     owner      the first live ancestor that is not a launcher: a Claude session (and its project),
                Codex, the ChatGPT app, a terminal, Explorer
     folder     from a record, a `cd <path>` in its launcher, a path in its command line, or the
                owning Claude session's project; `gone` when that folder was deleted
     http       GET / on each listening port (loopback, 1.5 s): 5xx is a stale sign, 404 or no
                answer a weak one
     in use     another live process outside the unit names the port in a URL
                (`verify-*.mjs --base http://127.0.0.1:8349`) or holds a loopback connection to it
     duplicate  a process with the same command line as a listening server that holds no port
     protected  it, or a process under it, matches ~/.claude/servers-protect.txt (one port or name
                substring per line); never closed by this script

   Verdict per unit: keep (protected, in use, an app from a main checkout that answers, owned by
   an open session and young), safe to close (folder gone; orphaned and old, failing or silent;
   a helper runtime whose app has exited), or probably stale (everything in between). Helper
   runtimes with a live owner (Playwright MCP, Codex, the ChatGPT app, vercel CLI, scripts) are
   kept and summarised by kind; they close with their session or app.

   Records live in ~/.claude/servers-registry/<pid>.json and say who started a process and why,
   because Windows does not expose another process's working directory. A record only counts
   while its pid belongs to the same process: one that started after the record was written is
   a reused pid.

   Close. `safe` closes the safe-to-close group; `stale` closes units whose folder is gone; `old`
   closes recorded units and automation browsers that are old or gone; `<port>` closes the unit
   listening there; `pid:<pid>` closes that process and everything under it. Without --yes it
   only prints the plan. Before closing, each target is checked again against a fresh snapshot
   (same process, nothing protected under it), and each process in its tree is killed only if
   its pid still belongs to the process that snapshot saw. After closing it lists again and
   reports the node.exe count before and after. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REG = path.join(os.homedir(), '.claude', 'servers-registry');
const PROTECT = path.join(os.homedir(), '.claude', 'servers-protect.txt');
const DEV_RUNTIMES = /^(node|bun|deno|python[\d.]*|pythonw|ruby|php|java|dotnet|uvicorn|gunicorn|hugo|caddy|http-server|esbuild|vite)(\.exe)?$/i;
// non-listening processes worth explaining; java, dotnet and the rest only count when they listen
const HELPER_RUNTIMES = /^(node|bun|deno|python[\d.]*|pythonw)(\.exe)?$/i;
const BROWSERS = /^(chrome|msedge|chromium|chromium-browser|chrome-headless-shell|google chrome|google chrome for testing|microsoft edge)(\.exe)?$/i;
const SHELLS = /^(cmd|bash|sh|dash|zsh|powershell|pwsh)(\.exe)?$/i;
// agent CLIs that run on node: owners, never units
const AGENT_CLI = /@anthropic-ai[\\/]claude-code|[\\/]claude-code[\\/]cli\.|@openai[\\/]codex[\\/]/i;
const START_SLACK_MS = 10_000;
const PROBE_MS = 1500;

const sh = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20, windowsHide: true });
// paths differ only by case on case-sensitive filesystems (Linux), so fold case only where it does not
const fold = process.platform === 'win32' || process.platform === 'darwin' ? (s) => s.toLowerCase() : (s) => s;
export const same = (a, b) => !!a && !!b && fold(path.resolve(a)) === fold(path.resolve(b));
const isNode = (p) => /^node(\.exe)?$/i.test(p?.name || '');

/* Every process (with memory), every listening port (all ports: the protect list may name a low
   one) and loopback connections by client pid and remote port. Throws when the system query
   fails, so a failed query never looks like "nothing running" and never prunes records. */
export function snapshot() {
  if (process.platform === 'win32') {
    // Windows PowerShell writes in the console code page unless told otherwise; paths and
    // command lines with non-ASCII characters would reach Node garbled
    const ps = `$ErrorActionPreference='Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$l = @(Get-NetTCPConnection -State Listen | Select-Object @{n='port';e={[int]$_.LocalPort}}, @{n='pid';e={[int]$_.OwningProcess}}, @{n='addr';e={[string]$_.LocalAddress}} -Unique)
$c = @(Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | Where-Object { $_.RemoteAddress -eq '127.0.0.1' -or $_.RemoteAddress -eq '::1' } | Select-Object @{n='pid';e={[int]$_.OwningProcess}}, @{n='rport';e={[int]$_.RemotePort}} -Unique)
$p = @(Get-CimInstance Win32_Process | Select-Object @{n='pid';e={[int]$_.ProcessId}}, @{n='ppid';e={[int]$_.ParentProcessId}}, @{n='name';e={$_.Name}}, @{n='cmd';e={$_.CommandLine}}, @{n='mem';e={[double]$_.WorkingSetSize}}, @{n='start';e={if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString('o') }}})
@{ listeners = $l; conns = $c; procs = $p } | ConvertTo-Json -Depth 3 -Compress`;
    const r = sh('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps]);
    if (r.status !== 0) throw new Error(`process snapshot failed: ${(r.stderr || '').trim().split('\n')[0]}`);
    const data = JSON.parse(r.stdout);
    const procs = [].concat(data.procs || []);
    if (!procs.length) throw new Error('process snapshot returned no processes');
    return { listeners: [].concat(data.listeners || []), conns: [].concat(data.conns || []), procs };
  }
  const ps = sh('ps', ['-eo', 'pid=,ppid=,rss=,lstart=,args=']);
  if (ps.status !== 0) throw new Error(`ps failed: ${(ps.stderr || '').trim()}`);
  // executable names come from comm, which keeps spaces ("Google Chrome" on macOS)
  const comm = new Map(sh('ps', ['-eo', 'pid=,comm=']).stdout.split('\n').map((l) => l.trim().match(/^(\d+)\s+(.*)$/)).filter(Boolean).map((m) => [+m[1], path.basename(m[2])]));
  const procs = ps.stdout.split('\n').filter(Boolean).map((line) => {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\w+\s+\w+\s+\d+\s+[\d:]+\s+\d+)\s+(.*)$/);
    if (!m) return null;
    const cmd = m[5];
    return { pid: +m[1], ppid: +m[2], mem: +m[3] * 1024, start: new Date(m[4]).toISOString(), cmd, name: comm.get(+m[1]) || path.basename(cmd.split(' ')[0]) };
  }).filter(Boolean);
  if (!procs.length) throw new Error('ps returned no processes');
  const lsofTcp = (state) => {
    const r = sh('lsof', ['-nP', '-iTCP', `-sTCP:${state}`, '-Fpn']);
    if (r.error) throw new Error(`lsof unavailable: ${r.error.message}`);
    // lsof exits 1 with no output when nothing matches; anything else, or 1 with errors, is a failure
    if (r.status > 1 || (r.status === 1 && (r.stderr || '').trim())) throw new Error(`lsof failed: ${(r.stderr || '').trim().split('\n')[0] || `exit ${r.status}`}`);
    const out = [];
    let pid = null;
    for (const line of (r.stdout || '').split('\n')) {
      if (line.startsWith('p')) pid = +line.slice(1);
      else if (line.startsWith('n') && pid !== null) out.push({ pid, name: line.slice(1) });
    }
    return out;
  };
  const listeners = lsofTcp('LISTEN').map(({ pid, name }) => {
    const i = name.lastIndexOf(':');
    return { pid, port: +name.slice(i + 1), addr: name.slice(0, i).replace(/^\[|\]$/g, '') };
  });
  const conns = lsofTcp('ESTABLISHED').map(({ pid, name }) => {
    const [, remote = ''] = name.split('->');
    return /^(127\.0\.0\.1|\[::1\]):/.test(remote) ? { pid, rport: +remote.split(':').pop() } : null;
  }).filter(Boolean);
  return { listeners, conns, procs };
}

/* The git worktree or repository root that contains `p`, walking up; null if none. */
function repoRoot(p) {
  for (let d = path.resolve(p); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    if (path.dirname(d) === d) return null;
  }
}

/* Absolute paths in a command line, and whether the worktree they point into still exists. */
function worktreeOf(cmd) {
  // quoted paths whole (they may hold spaces), then bare ones
  const text = String(cmd || '');
  const quoted = [...text.matchAll(/"((?:[A-Za-z]:[\\/]|\/)[^"]+)"|'((?:[A-Za-z]:[\\/]|\/)[^']+)'/g)].map((m) => m[1] || m[2]);
  const bare = text.replace(/"[^"]*"|'[^']*'/g, ' ').match(/[A-Za-z]:[\\/][^"'\s]+|\/(?:home|Users|srv|opt|var|tmp|mnt)\/[^"'\s]+/g) || [];
  const paths = [...quoted, ...bare];
  for (const p of paths) {
    const m = p.replace(/\\/g, '/').match(/^(.*?\/\.claude\/worktrees\/[^/]+)/);
    if (m) return { worktree: path.normalize(m[1]), gone: !fs.existsSync(m[1]) };
    if (/[\\/]Program Files|[\\/]AppData[\\/]|[\\/]nodejs[\\/]|[\\/]usr[\\/]|[\\/]\.cache[\\/]|[\\/]\.codex[\\/]/i.test(p)) continue;
    const root = repoRoot(p.split(/[\\/]node_modules[\\/]/)[0]);
    if (root) return { worktree: root, gone: false };
  }
  return null;
}

/* The folder a shell launcher changed into (`cd /c/Users/x/repo && npm run dev`), or null.
   Git Bash paths (/c/Users/...) become Windows paths. */
function cdTarget(cmd) {
  const m = String(cmd || '').match(/(?:^|[\s;&('"])cd\s+(?:\/d\s+)?("([^"]+)"|([^\s;&|)'"]+))/);
  if (!m) return null;
  let p = m[2] || m[3];
  if (process.platform === 'win32') p = p.replace(/^\/([a-zA-Z])\//, (_, d) => `${d.toUpperCase()}:/`);
  if (!path.isAbsolute(p)) return null;
  const wt = p.replace(/\\/g, '/').match(/^(.*?\/\.claude\/worktrees\/[^/]+)/);
  if (wt) return { worktree: path.normalize(wt[1]), gone: !fs.existsSync(wt[1]) };
  if (!fs.existsSync(p)) return { worktree: path.normalize(p), gone: true };
  return { worktree: repoRoot(p) || path.normalize(p), gone: false };
}

/* checkout (a repository's main folder), worktree (a linked worktree), or other. */
function folderKind(dir) {
  if (!dir) return null;
  if (/[\\/]\.claude[\\/]worktrees[\\/]|[\\/]_wt[\\/]/i.test(dir)) return 'worktree';
  try { return fs.statSync(path.join(dir, '.git')).isDirectory() ? 'checkout' : 'worktree'; } catch { return 'other'; }
}

/* Worktree roots of the repository containing `cwd` (its main checkout and linked worktrees).
   Throws when git cannot list them, so a failure never reads as "no worktrees". */
export function repoWorktrees(cwd = process.cwd()) {
  const r = sh('git', ['-C', cwd, 'worktree', 'list', '--porcelain']);
  if (r.status !== 0) throw new Error(`git worktree list failed: ${(r.stderr || '').trim().split('\n')[0]}`);
  return r.stdout.split(/\r?\n/).filter((l) => l.startsWith('worktree ')).map((l) => path.normalize(l.slice(9)));
}

/* Throws on a record it cannot read: a lost record would turn a recorded server into an
   unknown one. Records are written whole (temp file, then rename), so a partial one is real
   damage; one removed by a concurrent prune is skipped. */
export function readRegistry() {
  if (!fs.existsSync(REG)) return new Map();
  const out = new Map();
  for (const f of fs.readdirSync(REG)) {
    if (!f.endsWith('.json')) continue;
    let text;
    try { text = fs.readFileSync(path.join(REG, f), 'utf8'); }
    catch (err) { if (err.code === 'ENOENT') continue; throw new Error(`cannot read server record ${path.join(REG, f)}: ${err.message}`); }
    let rec;
    try { rec = JSON.parse(text); } catch { rec = null; }
    if (!rec || !Number.isInteger(rec.pid) || !rec.recordedAt) throw new Error(`damaged server record ${path.join(REG, f)}; delete it after checking which process it described`);
    out.set(rec.pid, rec);
  }
  return out;
}

/* A record describes this process only if the process was already running when it was written. */
function recordMatches(rec, proc) {
  if (!rec || !proc?.start) return false;
  // procStart comes from the same snapshot query, so the same process reports the same value
  if (rec.procStart) return Date.parse(rec.procStart) === Date.parse(proc.start);
  return Date.parse(proc.start) <= Date.parse(rec.recordedAt) + START_SLACK_MS;
}

/* Record who started a process and why. */
export function registerProcess({ pid, port = null, kind = 'server', purpose = '', cwd = process.cwd(), procStart = null }) {
  fs.mkdirSync(REG, { recursive: true });
  const rec = {
    pid, port, kind, purpose, procStart,
    worktree: repoRoot(cwd) || path.resolve(cwd),
    session: process.env.CLAUDE_CODE_SESSION_ID || process.env.CODEX_THREAD_ID || null,
    recordedAt: new Date().toISOString(),
  };
  const file = path.join(REG, `${pid}.json`);
  fs.writeFileSync(`${file}.${process.pid}.tmp`, JSON.stringify(rec, null, 1));
  fs.renameSync(`${file}.${process.pid}.tmp`, file);
  return rec;
}

/* Find the browser process launched with a unique marker argument and record it.
   Used by scripts/lib/launch-chrome.mjs, whose Playwright Browser object does not expose a pid. */
export function registerByMarker(marker, { kind = 'browser', purpose = '', cwd = process.cwd() } = {}) {
  const proc = snapshot().procs.find((p) => (p.cmd || '').includes(marker) && !/--type=/.test(p.cmd || ''));
  return proc ? registerProcess({ pid: proc.pid, kind, purpose, cwd, procStart: proc.start }) : null;
}

function protectedList() {
  if (!fs.existsSync(PROTECT)) return [];
  return fs.readFileSync(PROTECT, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
}

/* The real parent of `proc`, or null. Windows keeps a dead parent's pid as ParentProcessId, so a
   process that started later under that reused pid is not an ancestor. */
function parentOf(proc, byPid) {
  const parent = proc && byPid.get(proc.ppid);
  if (!parent || parent.pid === proc.pid) return null;
  return Date.parse(parent.start) <= Date.parse(proc.start) ? parent : null;
}

/* pid -> real child pids, using parentOf. */
function childMap(procs) {
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const kids = new Map();
  for (const p of procs) { const parent = parentOf(p, byPid); if (parent) kids.set(parent.pid, [...(kids.get(parent.pid) || []), p.pid]); }
  return kids;
}

/* The pid and everything under it, as the tree kill would reach it. */
function treeOf(pid, kids) {
  const out = [];
  for (const stack = [pid]; stack.length;) {
    const p = stack.pop();
    if (out.includes(p)) continue;
    out.push(p);
    stack.push(...(kids.get(p) || []));
  }
  return out;
}

/* Whether the pid, or a process under it, matches the protect list in this snapshot. */
function runsProtected(pid, { listeners, procs }, protect = protectedList()) {
  if (!protect.length) return false;
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const portsOf = new Map();
  for (const l of listeners) portsOf.set(l.pid, [...(portsOf.get(l.pid) || []), String(l.port)]);
  return treeOf(pid, childMap(procs)).some((q) => {
    const p = byPid.get(q);
    const ports = portsOf.get(q) || [];
    // a number is a port: as a substring it would match digits in any long command line
    return protect.some((x) => (/^\d+$/.test(x) ? ports.includes(x) : (p?.name || '').includes(x) || (p?.cmd || '').includes(x)));
  });
}

/* A one-shot launcher: cmd /c, bash -c, powershell -Command. An interactive shell is not one. */
function isLauncher(p) {
  if (!SHELLS.test(p?.name || '')) return false;
  const c = ` ${p.cmd || ''} `;
  // cmd /k and powershell -NoExit stay open as the user's terminal after their command
  if (/^cmd/i.test(p.name)) return /\s\/[cC]\s/.test(c) && !/\s\/[kK]\s/.test(c);
  if (/^(powershell|pwsh)/i.test(p.name)) return /\s-(c|command|file|encodedcommand)\s/i.test(c) && !/\s-noexit\s/i.test(c);
  return /\s-[a-z]*c\s/.test(c);
}

const isAutomationBrowser = (p) => BROWSERS.test(p.name || '') && !/--type=/.test(p.cmd || '') && /--remote-debugging-(port|pipe)|--user-data-dir/.test(p.cmd || '');

/* Who a live non-launcher ancestor is, in words. */
function ownerLabel(o) {
  if (!o) return null;
  const n = (o.name || '').toLowerCase().replace(/\.exe$/, '');
  const c = o.cmd || '';
  if (n === 'claude' || AGENT_CLI.test(c) && /claude/i.test(c)) {
    if (/AnthropicClaude[\\/]app-/i.test(c) && !/--project-config-root/.test(c)) return 'the Claude app';
    const m = c.match(/--project-config-root\s+(?:"([^"]+)"|(\S+))/);
    return `a Claude session${m ? ` in ${path.basename(m[1] || m[2])}` : ''}`;
  }
  if (n === 'codex' || /@openai[\\/]codex/i.test(c)) return 'Codex';
  if (n === 'chatgpt') return 'the ChatGPT app';
  if (n === 'code' || n === 'cursor' || n === 'windsurf') return `${o.name} (editor)`;
  if (n === 'explorer') return 'Explorer (a shortcut or startup item)';
  if (/^(windowsterminal|openconsole|conhost|powershell|pwsh|cmd|bash|zsh|sh|wezterm-gui|alacritty|iterm2|terminal)$/.test(n)) return `a terminal (${o.name})`;
  if (/^(svchost|taskhostw|services|launchd|systemd)$/.test(n)) return 'a system task';
  return o.name;
}

const scriptName = (cmd) => {
  const m = String(cmd || '').match(/(?:^|[\s"'\\/])([\w.@-]+\.(?:mjs|cjs|js|ts|py))(?=["'\s]|$)/i);
  return m ? m[1] : null;
};

/* Every unit on the machine, without HTTP probes. */
function analyze(snap, { oldHours = 12 } = {}) {
  const snappedAt = Date.now();
  const { listeners, conns, procs } = snap;
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const kids = childMap(procs);
  const reg = readRegistry();
  // prune records whose process is gone or was replaced, but never one written after this snapshot began
  for (const [pid, rec] of reg) {
    if (recordMatches(rec, byPid.get(pid))) continue;
    if (Date.parse(rec.recordedAt) < snappedAt) fs.rmSync(path.join(REG, `${pid}.json`), { force: true });
    reg.delete(pid);
  }
  const protect = protectedList();
  // this script and the processes that run it are never units
  const self = new Set();
  for (let p = byPid.get(process.pid); p; p = parentOf(p, byPid)) self.add(p.pid);
  // this session's own process: the first ancestor that is neither a launcher nor a dev runtime.
  // Ancestors above it (the desktop app, Explorer) are shared with every other session.
  let selfOwner = parentOf(byPid.get(process.pid), byPid);
  // an agent CLI running on node (npm-installed Claude Code, Codex) is the session process itself
  while (selfOwner && !AGENT_CLI.test(selfOwner.cmd || '') && (isLauncher(selfOwner) || DEV_RUNTIMES.test(selfOwner.name || ''))) selfOwner = parentOf(selfOwner, byPid);
  const recordFor = (pid) => {
    for (let p = byPid.get(pid), hops = 0; p && hops < 8; p = parentOf(p, byPid), hops++) if (reg.has(p.pid)) return reg.get(p.pid);
    return null;
  };
  const portsOf = new Map();
  for (const l of listeners) if (l.port >= 1024) portsOf.set(l.pid, [...(portsOf.get(l.pid) || []), l]);
  const isAgent = (p) => AGENT_CLI.test(p.cmd || '');

  // seeds: listening dev runtimes and recorded processes, automation browsers, helper runtimes
  const seeds = new Set();
  for (const p of procs) {
    if (self.has(p.pid) || isAgent(p)) continue;
    if (portsOf.has(p.pid) && (DEV_RUNTIMES.test(p.name || '') || recordFor(p.pid))) seeds.add(p.pid);
    else if (HELPER_RUNTIMES.test(p.name || '') || isAutomationBrowser(p) || reg.has(p.pid)) seeds.add(p.pid);
  }
  // climb through dev-runtime parents and through one-shot launchers with no other child
  const rootOf = (pid) => {
    let p = byPid.get(pid);
    for (let hops = 0; hops < 12; hops++) {
      const parent = parentOf(p, byPid);
      if (!parent || self.has(parent.pid) || isAgent(parent)) break;
      const devParent = DEV_RUNTIMES.test(parent.name || '');
      if (!devParent && !(isLauncher(parent) && (kids.get(parent.pid) || []).length === 1)) break;
      p = parent;
    }
    return p.pid;
  };
  const roots = new Set();
  for (const s of seeds) {
    let r = rootOf(s);
    // a recorded launcher above the root (`npm run dev` recorded) owns it
    const rec = recordFor(r);
    if (rec && rec.pid !== r && !self.has(rec.pid)) r = rec.pid;
    roots.add(r);
  }
  // a root inside another root's tree belongs to that unit
  const memberOf = new Map();
  const units = [];
  const sorted = [...roots].sort((a, b) => Date.parse(byPid.get(a).start) - Date.parse(byPid.get(b).start));
  for (const r of sorted) {
    if (memberOf.has(r)) continue;
    const members = treeOf(r, kids).filter((q) => !self.has(q));
    for (const q of members) memberOf.set(q, r);
    units.push({ root: r, members });
  }

  const now = Date.now();
  const cmdKey = (c) => fold(String(c || '').replace(/\s+/g, ' ').trim());
  const out = units.map(({ root, members }) => {
    const rp = byPid.get(root);
    const mp = members.map((q) => byPid.get(q)).filter(Boolean);
    const listen = mp.filter((p) => portsOf.has(p.pid) && !BROWSERS.test(p.name || ''));
    const ports = [...new Set(listen.flatMap((p) => portsOf.get(p.pid).map((l) => l.port)))].sort((a, b) => a - b);
    const addrs = new Map();
    for (const p of listen) for (const l of portsOf.get(p.pid)) addrs.set(l.port, [...(addrs.get(l.port) || []), l.addr]);
    const browsers = mp.filter(isAutomationBrowser);
    const cmds = mp.map((p) => p.cmd || '').join('\n');
    const kind = ports.length ? 'server'
      : /@playwright[\\/]mcp|playwright-mcp/i.test(cmds) ? 'playwright-mcp'
      : /codex-runtimes|OpenAI[\\/]Codex[\\/]runtimes|cua_node/i.test(cmds) ? 'codex'
      : /[\\/]vercel[\\/]|\bvercel(\.cmd|\.js)?\b/i.test(cmds) ? 'vercel'
      : mp.some((p) => HELPER_RUNTIMES.test(p.name || '') && !/npm-cli\.js|npx-cli\.js/.test(p.cmd || '')) ? 'script'
      // a browser stays a browser when a one-shot shell above it became the root
      : browsers.length ? 'browser'
      : 'launcher';
    // owner: first live ancestor above the root that is not a launcher
    let owner = parentOf(rp, byPid);
    const chain = [];
    while (owner && isLauncher(owner) && !self.has(owner.pid) && chain.length < 12) { chain.push(owner); owner = parentOf(owner, byPid); }
    // orphaned when the walk ends at an exited process, even past a live launcher with other children
    const orphan = !owner;
    // a record on a member counts too: launchPlacedChrome records the browser under its script
    const rec = recordFor(listen[0]?.pid ?? root) || recordFor(root) || reg.get(members.find((q) => reg.has(q))) || null;
    const fromCd = [...mp, ...chain].map((p) => cdTarget(p.cmd)).find(Boolean);
    const fromCmd = (listen.length ? listen : mp).map((p) => worktreeOf(p.cmd)).find(Boolean) || chain.map((p) => worktreeOf(p.cmd)).find(Boolean);
    const wt = rec ? { worktree: rec.worktree, gone: !fs.existsSync(rec.worktree) } : fromCd || fromCmd || null;
    const ownerText = ownerLabel(owner);
    const sessionProject = !wt && owner && /Claude session in /.test(ownerText || '') ? ownerText.replace(/^a Claude session in /, '') : null;
    // in use: a live process outside the unit names a port in a URL, or holds a loopback connection to it
    const inUse = [];
    for (const port of ports) {
      const url = new RegExp(`(?:127\\.0\\.0\\.1|localhost|0\\.0\\.0\\.0|\\[::1\\]):${port}(?!\\d)`, 'i');
      for (const p of procs) {
        if (memberOf.get(p.pid) === root || self.has(p.pid) || SHELLS.test(p.name || '') || /--type=/.test(p.cmd || '')) continue;
        if (url.test(p.cmd || '')) inUse.push({ pid: p.pid, port, why: `${scriptName(p.cmd) || p.name} (pid ${p.pid}) names :${port}` });
      }
      for (const c of conns) {
        if (c.rport !== port || memberOf.get(c.pid) === root || self.has(c.pid)) continue;
        const p = byPid.get(c.pid);
        if (p && !inUse.some((u) => u.pid === p.pid)) inUse.push({ pid: p.pid, port, why: `${p.name} (pid ${p.pid}) is connected to :${port}` });
      }
    }
    const ageH = rp.start ? (now - Date.parse(rp.start)) / 36e5 : null;
    const flags = [];
    if (wt?.gone) flags.push('gone');
    if (ageH !== null && ageH > oldHours) flags.push('old');
    if (!rec && !wt && kind === 'server') flags.push('unknown');
    if (orphan) flags.push('orphaned');
    if (inUse.length) flags.push('in-use');
    if (runsProtected(root, snap, protect)) flags.push('protected');
    const session = process.env.CLAUDE_CODE_SESSION_ID || process.env.CODEX_THREAD_ID || null;
    return {
      pid: root, kind, ports, addrs: Object.fromEntries(addrs), name: rp.name, cmd: rp.cmd || '', start: rp.start,
      listenerPids: listen.map((p) => p.pid), members, memberStarts: Object.fromEntries(mp.map((p) => [p.pid, p.start])), procs: mp.length,
      nodeCount: mp.filter(isNode).length, memMB: Math.round(mp.reduce((s, p) => s + (p.mem || 0), 0) / 2 ** 20),
      browsers: browsers.length, script: scriptName(listen[0]?.cmd || rp.cmd) || scriptName(cmds),
      ageH: ageH === null ? null : +ageH.toFixed(1),
      worktree: wt?.worktree || null, folderKind: wt?.gone ? null : folderKind(wt?.worktree), sessionProject,
      purpose: rec?.purpose || '', session: rec?.session || null, recorded: !!rec, recordPid: rec?.pid ?? null,
      // owned by this session's process, or by a launcher this script runs under; never by a shared ancestor
      mine: !!(rec?.session && rec.session === session) || !!(owner && (owner.pid === selfOwner?.pid || (self.has(owner.pid) && isLauncher(owner)))),
      orphan, owner: owner ? { pid: owner.pid, name: owner.name, label: ownerText } : null, inUse, flags,
    };
  });
  // a helper with the same command line as a listening server, holding no port, is a duplicate
  const serving = new Map();
  for (const u of out) if (u.kind === 'server') for (const pid of u.listenerPids) serving.set(cmdKey(byPid.get(pid).cmd), u);
  for (const u of out) {
    if (u.kind === 'server') continue;
    const twin = u.members.map((q) => serving.get(cmdKey(byPid.get(q)?.cmd))).find(Boolean);
    if (twin) { u.duplicateOf = { pid: twin.pid, ports: twin.ports }; u.flags.push('duplicate'); }
  }
  // node.exe processes that belong to no unit: agent CLIs, this check, anything else
  const loose = procs.filter((p) => isNode(p) && !memberOf.has(p.pid));
  return { units: out, nodeTotal: procs.filter(isNode).length, nodeMB: Math.round(procs.filter(isNode).reduce((s, p) => s + (p.mem || 0), 0) / 2 ** 20), loose: loose.map((p) => ({ pid: p.pid, self: self.has(p.pid), agent: isAgent(p) })) };
}

/* Servers and automation browsers (the rows `wrapup` reads), without probes. */
export function scan({ oldHours = 12 } = {}) {
  return analyze(snapshot(), { oldHours }).units.filter((u) => u.kind === 'server' || u.browsers || u.recorded)
    .sort((a, b) => (a.ports[0] || 1e9) - (b.ports[0] || 1e9));
}

/* GET / on a loopback port: a status code, or timeout / refused / not HTTP. */
function probe(port, addrs = []) {
  const host = addrs.some((a) => a === '127.0.0.1' || a === '0.0.0.0' || a === '*') || !addrs.length ? '127.0.0.1'
    : addrs.some((a) => a === '::1' || a === '::') ? '::1' : addrs[0];
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: '/', timeout: PROBE_MS, headers: { 'user-agent': 'servers-skill-probe' } }, (res) => {
      resolve(String(res.statusCode));
      res.destroy();
    });
    req.on('timeout', () => { resolve('timeout'); req.destroy(); });
    req.on('error', (err) => resolve(err.code === 'ECONNREFUSED' ? 'refused' : 'not HTTP'));
  });
}

const fmtAge = (h) => (h === null ? '?' : h < 1 ? `${Math.round(h * 60)}m` : h < 48 ? `${h}h` : `${Math.round(h / 24)}d`);

/* keep | safe | probable, with a one-line reason. */
function verdict(u, oldHours) {
  const age = fmtAge(u.ageH);
  const old = u.flags.includes('old');
  const who = u.owner?.label ? `${u.owner.label}${u.owner.label.startsWith('a terminal') || u.owner.label.startsWith('Explorer') ? '' : ' (open)'}` : null;
  const codes = Object.values(u.http || {});
  const bad = codes.length && codes.some((c) => /^5/.test(c)) && !codes.some((c) => /^[23]/.test(c));
  const ok = codes.some((c) => /^[23]|^40[13]$/.test(c));
  const weak = !ok && !bad && codes.some((c) => c === '404' || c === 'timeout');
  const httpText = codes.length ? Object.entries(u.http).map(([p, c]) => `:${p} ${c}`).join(', ') : '';
  const tail = (s) => [s, httpText && `answers ${httpText}`].filter(Boolean).join('; ');
  const helper = { 'playwright-mcp': 'Playwright MCP', codex: 'Codex runtime', vercel: 'vercel CLI', script: `script ${u.script || u.name}`, launcher: 'npm/npx launcher', browser: 'automation browser' }[u.kind];

  if (u.flags.includes('protected')) return ['keep', tail('protected in servers-protect.txt')];
  if (u.inUse.length) return ['keep', tail(`in use: ${u.inUse.slice(0, 2).map((x) => x.why).join('; ')}`)];
  if (u.flags.includes('gone')) return ['safe', tail(`its folder was deleted (${u.worktree})`)];
  if (u.kind === 'server') {
    if (u.folderKind === 'checkout' && ok) return ['keep', tail(`app from the ${path.basename(u.worktree)} main checkout, ${age} old`)];
    if (u.orphan) return (old || bad || weak) ? ['safe', tail(`orphaned ${age}: the shell or session that started it has exited`)]
      : ['probable', tail(`orphaned, started ${age} ago: the shell or session that started it has exited`)];
    if (bad) return ['probable', tail(`failing, ${age} old, started by ${who || 'unknown'}`)];
    if (old) return ['probable', tail(`${age} old (over ${oldHours}h); started by ${who || 'unknown'}`)];
    return ['keep', tail(`${age} old, started by ${who || 'unknown'}`)];
  }
  if (u.duplicateOf) return ['probable', `same command as :${u.duplicateOf.ports.join(',:')} (pid ${u.duplicateOf.pid}) but holds no port; the other copy has it`];
  if (u.orphan) {
    // a script may be a long job the user started on purpose; helpers and browsers are not
    if (u.kind === 'script') return old ? ['probable', `orphaned ${helper}, ${age}: whatever started it has exited`] : ['keep', `${helper}, ${age}, still running on its own`];
    return old || u.kind !== 'browser' ? ['safe', `orphaned ${helper}, ${age}: the session or script that started it has exited`] : ['probable', `orphaned ${helper}, ${age}: its script exited`];
  }
  if (u.kind === 'browser' && old) return ['probable', `${helper}, ${age} old, under ${who || 'unknown'}`];
  return ['keep', `${helper}${u.browsers && u.kind !== 'browser' ? ` with ${u.browsers} automation browser${u.browsers > 1 ? 's' : ''}` : ''}, under ${who || 'unknown'}; closes with it`];
}

/* Every unit with probes and verdicts, plus the node.exe count by kind. */
export async function triage({ oldHours = 12, snap = snapshot() } = {}) {
  const a = analyze(snap, { oldHours });
  await Promise.all(a.units.filter((u) => u.kind === 'server').map(async (u) => {
    u.http = Object.fromEntries(await Promise.all(u.ports.map(async (p) => [p, await probe(p, u.addrs[p])])));
  }));
  for (const u of a.units) [u.verdict, u.why] = verdict(u, oldHours);
  const byKind = {};
  for (const u of a.units) if (u.nodeCount) byKind[u.kind] = (byKind[u.kind] || 0) + u.nodeCount;
  for (const l of a.loose) { const k = l.self ? 'this check' : l.agent ? 'agent CLI' : 'other'; byKind[k] = (byKind[k] || 0) + 1; }
  return { ...a, nodeByKind: byKind };
}

const KIND_LABEL = { server: 'servers', 'playwright-mcp': 'Playwright MCP', codex: 'Codex runtimes', vercel: 'vercel CLI', script: 'scripts', launcher: 'npm/npx launchers', browser: 'automation browsers', 'this check': 'this check', 'agent CLI': 'agent CLIs', other: 'other' };

const KIND_ONE = { 'playwright-mcp': 'Playwright MCP', codex: 'Codex runtime', vercel: 'vercel CLI', script: 'script', launcher: 'npm/npx launcher', browser: 'automation browser' };

function where(u) {
  if (u.worktree) return u.worktree.replace(os.homedir(), '~');
  if (u.sessionProject) return `(session in ${u.sessionProject})`;
  return '(unknown folder)';
}

function fmt(u) {
  const id = u.ports.length ? ':' + u.ports.join(',:') : `pid:${u.pid}`;
  const label = u.purpose ? ` "${u.purpose}"` : '';
  const what = u.kind === 'server' ? '' : ` ${KIND_ONE[u.kind] || u.kind}`;
  return `${id.padEnd(13)} pid ${String(u.pid).padEnd(6)} ${fmtAge(u.ageH).padStart(4)} ${String(u.memMB).padStart(5)} MB  ${where(u)}${label}${what}${u.mine ? ' (this session)' : ''}`;
}

function printTriage(t, { full = false } = {}) {
  const groups = { safe: [], probable: [], keep: [] };
  for (const u of t.units) groups[u.verdict].push(u);
  const byPort = (a, b) => (a.ports[0] || 1e9) - (b.ports[0] || 1e9) || (b.ageH || 0) - (a.ageH || 0);
  const line = (u) => `  ${fmt(u)}\n      ${u.why}`;
  const shown = (u) => full || u.kind === 'server' || u.kind === 'browser' || u.browsers || u.recorded || u.duplicateOf || u.orphan;
  console.log(`Safe to close (${groups.safe.length})`);
  for (const u of groups.safe.sort(byPort)) console.log(line(u));
  if (!groups.safe.length) console.log('  nothing');
  console.log(`\nProbably stale, your call (${groups.probable.length})`);
  for (const u of groups.probable.sort(byPort)) console.log(line(u));
  if (!groups.probable.length) console.log('  nothing');
  console.log(`\nKeep (${groups.keep.length})`);
  for (const u of groups.keep.filter(shown).sort(byPort)) console.log(line(u));
  if (!groups.keep.length) console.log('  nothing');
  // helpers with a live owner, one line per kind
  const helpers = new Map();
  for (const u of groups.keep.filter((x) => !shown(x))) {
    const h = helpers.get(u.kind) || { n: 0, node: 0, mb: 0, owners: new Map(), scripts: new Set() };
    h.n++; h.node += u.nodeCount; h.mb += u.memMB;
    const o = u.owner?.label || (u.orphan ? 'nothing (orphaned)' : 'unknown');
    h.owners.set(o, (h.owners.get(o) || 0) + 1);
    if (u.script && u.kind === 'script') h.scripts.add(u.script);
    helpers.set(u.kind, h);
  }
  for (const [kind, h] of helpers) {
    const owners = [...h.owners].map(([o, n]) => (n > 1 ? `${n}x ${o}` : o)).join(', ');
    const names = h.scripts.size ? ` [${[...h.scripts].slice(0, 6).join(', ')}]` : '';
    console.log(`  ${KIND_LABEL[kind] || kind} x${h.n}${names}: ${h.node} node.exe, ${h.mb} MB; under ${owners}; each closes with its session or app`);
  }
  const parts = Object.entries(t.nodeByKind).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${KIND_LABEL[k] || k}`);
  console.log(`\nnode.exe on this machine: ${t.nodeTotal} (${t.nodeMB} MB) = ${parts.join(', ') || 'none'}`);
}

/* Kill each { pid, start } in order, but only while the pid still belongs to the process that
   started at `start`; the check sits right before each kill, so a pid reused since the snapshot
   is left alone. Returns pid -> killed | gone | changed | failed. */
function killVerified(entries) {
  const result = new Map();
  if (!entries.length) return result;
  if (process.platform === 'win32') {
    // Windows PowerShell 5.1 emits a parsed JSON array as one object; foreach enumerates it
    const ps = `$list = $env:SERVERS_KILL_LIST | ConvertFrom-Json
foreach ($e in $list) {
  # a failed query is not proof the process is gone
  try { $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($e.pid)" -ErrorAction Stop } catch { "$($e.pid) failed"; continue }
  if (-not $p) { "$($e.pid) gone"; continue }
  if ($p.CreationDate.ToUniversalTime().ToString('o') -ne $e.start) { "$($e.pid) changed"; continue }
  try { Stop-Process -Id $e.pid -Force -ErrorAction Stop; "$($e.pid) killed" }
  catch { if (Get-Process -Id $e.pid -ErrorAction SilentlyContinue) { "$($e.pid) failed" } else { "$($e.pid) killed" } }
}`;
    const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true, env: { ...process.env, SERVERS_KILL_LIST: JSON.stringify(entries) } });
    for (const line of (r.stdout || '').split(/\r?\n/)) { const m = line.trim().match(/^(\d+) (\w+)$/); if (m) result.set(+m[1], m[2]); }
    for (const e of entries) if (!result.has(e.pid)) result.set(e.pid, 'failed');
    return result;
  }
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (err) { return err.code !== 'ESRCH'; } };
  for (const e of entries) {
    const ps = sh('ps', ['-o', 'lstart=', '-p', String(e.pid)]);
    if (ps.status !== 0 || !ps.stdout.trim()) { result.set(e.pid, 'gone'); continue; }
    if (new Date(ps.stdout.trim()).toISOString() !== e.start) { result.set(e.pid, 'changed'); continue; }
    try { process.kill(e.pid, 'SIGTERM'); }
    catch (err) { result.set(e.pid, err.code === 'ESRCH' ? 'gone' : 'failed'); continue; }
    // SIGTERM can be handled or ignored: only an exit within the wait counts as closed
    const wait = new Int32Array(new SharedArrayBuffer(4));
    for (let i = 0; i < 30 && alive(e.pid); i++) Atomics.wait(wait, 0, 0, 100);
    result.set(e.pid, alive(e.pid) ? 'failed' : 'killed');
  }
  return result;
}

/* The pid and everything under it in `snap`, deepest first, as { pid, start }. */
function killOrder(pid, snap) {
  const byPid = new Map(snap.procs.map((p) => [p.pid, p]));
  const kids = childMap(snap.procs);
  const order = [];
  const visit = (p) => { if (order.includes(p)) return; for (const c of kids.get(p) || []) visit(c); order.push(p); };
  visit(pid);
  return order.map((p) => ({ pid: p, start: byPid.get(p).start }));
}

async function main(argv) {
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const has = (k) => argv.includes(k);
  const cmd = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'list';
  const oldHours = +opt('--old-hours', 12);

  if (cmd === 'register') {
    const snap = snapshot();
    let pid = opt('--pid') ? +opt('--pid') : null;
    const port = opt('--port') ? +opt('--port') : null;
    if (!pid && port) pid = snap.listeners.find((l) => l.port === port)?.pid ?? null;
    const proc = snap.procs.find((p) => p.pid === pid);
    if (!proc) { console.error('register: no such process; pass --pid, or --port of a listening server'); return 1; }
    const rec = registerProcess({ pid, port, kind: opt('--kind', 'server'), purpose: opt('--purpose', ''), procStart: proc.start });
    console.log(`recorded pid ${rec.pid}${port ? ` :${port}` : ''} in ${rec.worktree}${rec.purpose ? ` "${rec.purpose}"` : ''}`);
    return 0;
  }

  const t = await triage({ oldHours });
  if (has('--here')) {
    const trees = repoWorktrees();
    t.units = t.units.filter((u) => u.worktree && trees.some((w) => same(w, u.worktree)));
  }

  if (cmd === 'list') {
    if (has('--json')) { console.log(JSON.stringify(t, null, 1)); return 0; }
    printTriage(t, { full: has('--all') });
    if (t.units.some((u) => u.verdict === 'safe')) console.log('\nClose the safe group: close safe --yes; or name rows: close <port> pid:<pid> --yes');
    return 0;
  }

  if (cmd === 'close') {
    const wanted = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--old-hours');
    if (!wanted.length) { console.error('close: give safe, stale, old, a port, or pid:<pid>'); return 1; }
    const targets = new Map();
    const exact = new Set();
    for (const w of wanted) {
      const pick = w === 'safe' ? t.units.filter((u) => u.verdict === 'safe')
        : w === 'stale' ? t.units.filter((u) => u.flags.includes('gone') && !u.flags.includes('unknown'))
        : w === 'old' ? t.units.filter((u) => (u.recorded || u.kind === 'browser') && (u.flags.includes('old') || u.flags.includes('gone')))
        : /^pid:\d+$/.test(w) ? (() => {
          const pid = +w.slice(4);
          const unit = t.units.find((u) => u.pid === pid);
          if (unit) return [unit];
          // a process inside a unit: exactly that process and what runs under it
          const host = t.units.find((u) => u.members.includes(pid));
          if (!host) return [];
          exact.add(pid);
          // identity from the triage snapshot, so a pid reused since then fails the check before the kill
          return [{ ...host, pid, ports: [], why: `part of pid ${host.pid}; closes only this process and what runs under it`, start: host.memberStarts[pid] }];
        })()
        : /^\d+$/.test(w) ? t.units.filter((u) => u.ports.includes(+w))
        : null;
      if (pick === null) { console.error(`close: unknown target ${w}`); return 1; }
      if (!pick.length) console.log(`no match for ${w}`);
      for (const u of pick) targets.set(u.pid, u);
    }
    const blocked = [...targets.values()].filter((u) => u.flags.includes('protected'));
    const go = [...targets.values()].filter((u) => !u.flags.includes('protected'));
    for (const u of blocked) console.log(`skip (protected, or runs a protected process) ${fmt(u)}`);
    if (!go.length) { console.log('Nothing to close.'); return 0; }
    for (const u of go) {
      console.log(`${has('--yes') ? 'closing' : 'would close'} ${fmt(u)}\n      ${u.why}${u.procs > 1 && !exact.has(u.pid) ? `\n      with ${u.procs - 1} process${u.procs > 2 ? 'es' : ''} under it` : ''}`);
      if (u.inUse?.length) console.log(`      note: ${u.inUse.map((x) => x.why).join('; ')}`);
    }
    if (!has('--yes')) { console.log('Re-run with --yes to close these.'); return 0; }
    const protect = protectedList();
    const closed = new Set();
    let failed = 0;
    for (const u of go) {
      // a target under one closed earlier went with it; never signal its pid a second time
      if (closed.has(u.pid)) { console.log(`closed with its parent: pid ${u.pid}`); continue; }
      const snap = snapshot();
      const now = snap.procs.find((p) => p.pid === u.pid);
      if (!now) { console.log(`already gone: pid ${u.pid}`); fs.rmSync(path.join(REG, `${u.pid}.json`), { force: true }); continue; }
      if (now.start !== u.start) { failed++; console.error(`skipped pid ${u.pid}: it now belongs to a different process`); continue; }
      // a protected process may have started under it since the list was built
      if (runsProtected(u.pid, snap, protect)) { failed++; console.error(`skipped pid ${u.pid}: it now runs a protected process`); continue; }
      const res = killVerified(killOrder(u.pid, snap).filter((e) => !closed.has(e.pid)));
      for (const [pid, st] of res) if (st === 'killed' || st === 'gone') { closed.add(pid); fs.rmSync(path.join(REG, `${pid}.json`), { force: true }); }
      const bad = [...res].filter(([, st]) => st === 'failed').map(([pid]) => pid);
      if (bad.length) { failed++; console.error(`failed to close pid ${bad.join(', ')} (under pid ${u.pid})`); }
      if (!closed.has(u.pid) && !bad.includes(u.pid)) { failed++; console.error(`skipped pid ${u.pid}: it changed while closing`); }
    }
    console.log(`\nclosed ${closed.size} process${closed.size === 1 ? '' : 'es'}${failed ? `, ${failed} target${failed === 1 ? '' : 's'} not closed` : ''}\n`);
    const after = await triage({ oldHours });
    printTriage(after);
    console.log(`node.exe before ${t.nodeTotal}, after ${after.nodeTotal}`);
    return failed ? 1 : 0;
  }

  console.error(`unknown command: ${cmd}`);
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => { console.error(err.message); process.exitCode = 1; });
}
