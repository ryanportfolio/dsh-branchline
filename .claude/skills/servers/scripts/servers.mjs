#!/usr/bin/env node
/* List, label and close the dev servers and automation browsers that sessions leave running.

   node <servers skill>/scripts/servers.mjs [list] [--here] [--json] [--old-hours N]
   node <servers skill>/scripts/servers.mjs register --port N | --pid N  --purpose "menu preview"
   node <servers skill>/scripts/servers.mjs close stale|old|<port>|pid:<pid> [--yes]

   What counts: TCP listeners on port 1024+ owned by a dev runtime (node, bun, deno, python, ...)
   or by a recorded process, and Chrome/Edge/Chromium browser processes started for automation
   (a --remote-debugging-* flag or their own --user-data-dir). A personal browser launched
   normally has neither and is never listed.

   Records live in ~/.claude/servers-registry/<pid>.json and say who started a process and why,
   because Windows does not expose another process's working directory: `npm run dev` from a
   worktree looks the same as one from any other folder. A record only counts while its pid
   belongs to the same process: one that started after the record was written is a reused pid.

   Flags per row:
     gone      its worktree no longer exists on disk (a server left running after cleanup)
     old       older than --old-hours (default 12)
     unknown   a server with no record and no worktree path in its command line; never closed
               by `stale`/`old` (automation browsers are never unknown: their flags identify them)
     protected it, or a process under it, is listed in ~/.claude/servers-protect.txt (one port or
               name substring per line); never closed by this script, since closing kills the tree
   `close stale` closes rows flagged gone; `close old` closes recorded rows and automation
   browsers flagged old or gone, so a long-running tool found only by its path is never swept up.
   A server running under a recorded launcher (`npm run dev` recorded, vite listening) closes
   with its launcher, which could otherwise restart it; `pid:<pid>` closes exactly one process.
   Without --yes it only prints the plan. Before closing, each row is checked again against a
   fresh snapshot (same process, nothing protected under it), and each process in its tree is
   killed only if its pid still belongs to the process that snapshot saw. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REG = path.join(os.homedir(), '.claude', 'servers-registry');
const PROTECT = path.join(os.homedir(), '.claude', 'servers-protect.txt');
const DEV_RUNTIMES = /^(node|bun|deno|python[\d.]*|pythonw|ruby|php|java|dotnet|uvicorn|gunicorn|hugo|caddy|http-server|esbuild|vite)(\.exe)?$/i;
const BROWSERS = /^(chrome|msedge|chromium|chromium-browser|chrome-headless-shell|google chrome|google chrome for testing|microsoft edge)(\.exe)?$/i;
const START_SLACK_MS = 10_000;

const sh = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20, windowsHide: true });
// paths differ only by case on case-sensitive filesystems (Linux), so fold case only where it does not
const fold = process.platform === 'win32' || process.platform === 'darwin' ? (s) => s.toLowerCase() : (s) => s;
export const same = (a, b) => !!a && !!b && fold(path.resolve(a)) === fold(path.resolve(b));

/* Every process and every listening port (all ports: the protect list may name a low one).
   Throws when the system query fails, so a failed query never looks like "nothing running"
   and never prunes records. */
export function snapshot() {
  if (process.platform === 'win32') {
    // Windows PowerShell writes in the console code page unless told otherwise; paths and
    // command lines with non-ASCII characters would reach Node garbled
    const ps = `$ErrorActionPreference='Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$l = @(Get-NetTCPConnection -State Listen | Select-Object @{n='port';e={[int]$_.LocalPort}}, @{n='pid';e={[int]$_.OwningProcess}} -Unique)
$p = @(Get-CimInstance Win32_Process | Select-Object @{n='pid';e={[int]$_.ProcessId}}, @{n='ppid';e={[int]$_.ParentProcessId}}, @{n='name';e={$_.Name}}, @{n='cmd';e={$_.CommandLine}}, @{n='start';e={if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString('o') }}})
@{ listeners = $l; procs = $p } | ConvertTo-Json -Depth 3 -Compress`;
    const r = sh('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps]);
    if (r.status !== 0) throw new Error(`process snapshot failed: ${(r.stderr || '').trim().split('\n')[0]}`);
    const data = JSON.parse(r.stdout);
    const procs = [].concat(data.procs || []);
    if (!procs.length) throw new Error('process snapshot returned no processes');
    return { listeners: [].concat(data.listeners || []), procs };
  }
  const ps = sh('ps', ['-eo', 'pid=,ppid=,lstart=,args=']);
  if (ps.status !== 0) throw new Error(`ps failed: ${(ps.stderr || '').trim()}`);
  // executable names come from comm, which keeps spaces ("Google Chrome" on macOS)
  const comm = new Map(sh('ps', ['-eo', 'pid=,comm=']).stdout.split('\n').map((l) => l.trim().match(/^(\d+)\s+(.*)$/)).filter(Boolean).map((m) => [+m[1], path.basename(m[2])]));
  const procs = ps.stdout.split('\n').filter(Boolean).map((line) => {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\w+\s+\w+\s+\d+\s+[\d:]+\s+\d+)\s+(.*)$/);
    if (!m) return null;
    const cmd = m[4];
    return { pid: +m[1], ppid: +m[2], start: new Date(m[3]).toISOString(), cmd, name: comm.get(+m[1]) || path.basename(cmd.split(' ')[0]) };
  }).filter(Boolean);
  if (!procs.length) throw new Error('ps returned no processes');
  const lsof = sh('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn']);
  if (lsof.error) throw new Error(`lsof unavailable: ${lsof.error.message}`);
  // lsof exits 1 with no output when nothing listens; anything else, or 1 with errors, is a failure
  if (lsof.status > 1 || (lsof.status === 1 && (lsof.stderr || '').trim())) throw new Error(`lsof failed: ${(lsof.stderr || '').trim().split('\n')[0] || `exit ${lsof.status}`}`);
  const listeners = [];
  for (const line of (lsof.stdout || '').split('\n')) {
    if (line.startsWith('p')) listeners.push({ pid: +line.slice(1), port: null });
    else if (line.startsWith('n') && listeners.length) {
      const port = +line.split(':').pop();
      const last = listeners[listeners.length - 1];
      if (last.port === null) last.port = port; else listeners.push({ pid: last.pid, port });
    }
  }
  return { listeners: listeners.filter((l) => l.port !== null), procs };
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
    if (/[\\/]Program Files|[\\/]AppData[\\/]|[\\/]nodejs[\\/]|[\\/]usr[\\/]/i.test(p)) continue;
    const root = repoRoot(p.split(/[\\/]node_modules[\\/]/)[0]);
    if (root) return { worktree: root, gone: false };
  }
  return null;
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
    return protect.some((x) => ports.includes(x) || (p?.name || '').includes(x) || (p?.cmd || '').includes(x));
  });
}

export function scan({ oldHours = 12 } = {}) {
  const snappedAt = Date.now();
  const snap = snapshot();
  const { listeners, procs } = snap;
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const reg = readRegistry();
  // prune records whose process is gone or was replaced, but never one written after this snapshot began
  for (const [pid, rec] of reg) {
    if (recordMatches(rec, byPid.get(pid))) continue;
    if (Date.parse(rec.recordedAt) < snappedAt) fs.rmSync(path.join(REG, `${pid}.json`), { force: true });
    reg.delete(pid);
  }
  const protect = protectedList();
  /* A recorded ancestor labels its children: `npm run dev` records the npm pid, vite listens. */
  const recordFor = (pid) => {
    for (let p = byPid.get(pid), hops = 0; p && hops < 8; p = parentOf(p, byPid), hops++) if (reg.has(p.pid)) return reg.get(p.pid);
    return null;
  };

  const rows = new Map();
  const add = (pid, kind, port) => {
    const p = byPid.get(pid);
    if (!p) return;
    const row = rows.get(pid) || { pid, kind, ports: [], name: p.name, cmd: p.cmd || '', start: p.start };
    if (port) row.ports.push(port);
    rows.set(pid, row);
  };
  for (const l of listeners) {
    if (l.port < 1024) continue;
    const p = byPid.get(l.pid);
    if (p && (DEV_RUNTIMES.test(p.name) || recordFor(l.pid))) add(l.pid, 'server', l.port);
  }
  for (const p of procs) {
    if (!BROWSERS.test(p.name) || /--type=/.test(p.cmd || '')) continue;
    if (/--remote-debugging-(port|pipe)|--user-data-dir/.test(p.cmd || '') || reg.has(p.pid)) add(p.pid, 'browser');
  }
  for (const [pid, r] of reg) if (!rows.has(pid)) add(pid, r.kind || 'server', r.port);

  const now = Date.now();
  return [...rows.values()].map((row) => {
    const rec = recordFor(row.pid);
    const wt = rec ? { worktree: rec.worktree, gone: !fs.existsSync(rec.worktree) } : worktreeOf(row.cmd);
    const ageH = row.start ? (now - Date.parse(row.start)) / 36e5 : null;
    const flags = [];
    if (wt?.gone) flags.push('gone');
    if (ageH !== null && ageH > oldHours) flags.push('old');
    if (!rec && !wt && row.kind !== 'browser') flags.push('unknown');
    if (runsProtected(row.pid, snap, protect)) flags.push('protected');
    return { ...row, ageH: ageH === null ? null : +ageH.toFixed(1), worktree: wt?.worktree || null, purpose: rec?.purpose || '', session: rec?.session || null, recorded: !!rec, recordPid: rec?.pid ?? null, flags };
  }).sort((a, b) => (a.ports[0] || 1e9) - (b.ports[0] || 1e9));
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

function fmt(r) {
  const age = r.ageH === null ? '?' : r.ageH < 1 ? `${Math.round(r.ageH * 60)}m` : `${r.ageH}h`;
  const where = r.worktree ? r.worktree.replace(os.homedir(), '~') : '(unknown folder)';
  const label = r.purpose ? ` "${r.purpose}"` : '';
  const flags = r.flags.length ? ` [${r.flags.join(', ')}]` : '';
  return `${(r.ports.length ? ':' + r.ports.join(',:') : r.kind).padEnd(14)} pid ${String(r.pid).padEnd(7)} ${age.padStart(5)}  ${where}${label}${flags}`;
}

function main(argv) {
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

  const all = scan({ oldHours });
  let rows = all;
  if (has('--here')) {
    const trees = repoWorktrees();
    rows = rows.filter((r) => r.worktree && trees.some((t) => same(t, r.worktree)));
  }

  if (cmd === 'list') {
    if (has('--json')) { console.log(JSON.stringify(rows, null, 1)); return 0; }
    if (!rows.length) { console.log('Nothing running.'); return 0; }
    for (const r of rows) console.log(fmt(r));
    return 0;
  }

  if (cmd === 'close') {
    const target = argv[1];
    if (!target) { console.error('close: give stale, old, a port, or pid:<pid>'); return 1; }
    const explicit = /^\d+$|^pid:/.test(target);
    const pick = target === 'stale' ? rows.filter((r) => r.flags.includes('gone'))
      : target === 'old' ? rows.filter((r) => (r.recorded || r.kind === 'browser') && (r.flags.includes('old') || r.flags.includes('gone')))
      : target.startsWith('pid:') ? rows.filter((r) => r.pid === +target.slice(4))
      : rows.filter((r) => r.ports.includes(+target));
    // a server under a recorded launcher (`npm run dev` recorded, vite listening) closes through
    // the launcher, which could otherwise start it again; pid:<pid> closes exactly that process
    const launcherOf = (r) => (r.recordPid && r.recordPid !== r.pid && all.find((x) => x.pid === r.recordPid)) || r;
    const targets = new Map();
    for (const r of pick) {
      const l = target.startsWith('pid:') ? r : launcherOf(r);
      if (l !== r) console.log(`${r.ports.length ? ':' + r.ports.join(',:') : `pid ${r.pid}`} runs under recorded launcher pid ${l.pid}; the launcher and everything under it close together`);
      targets.set(l.pid, l);
    }
    const blocked = [...targets.values()].filter((r) => r.flags.includes('protected'));
    const go = [...targets.values()].filter((r) => !r.flags.includes('protected') && (explicit || !r.flags.includes('unknown')));
    for (const r of blocked) console.log(`skip (protected, or runs a protected process) ${fmt(r)}`);
    if (!go.length) { console.log('Nothing to close.'); return 0; }
    for (const r of go) console.log(`${has('--yes') ? 'closing' : 'would close'} ${fmt(r)}`);
    if (!has('--yes')) { console.log('Re-run with --yes to close these.'); return 0; }
    const protect = protectedList();
    const closed = new Set();
    let failed = 0;
    for (const r of go) {
      // a row under one closed earlier went with it; never signal its pid a second time
      if (closed.has(r.pid)) { console.log(`closed with its parent: pid ${r.pid}`); continue; }
      const snap = snapshot();
      const now = snap.procs.find((p) => p.pid === r.pid);
      if (!now) { console.log(`already gone: pid ${r.pid}`); fs.rmSync(path.join(REG, `${r.pid}.json`), { force: true }); continue; }
      if (now.start !== r.start) { failed++; console.error(`skipped pid ${r.pid}: it now belongs to a different process`); continue; }
      // a protected process may have started under it since the list was built
      if (runsProtected(r.pid, snap, protect)) { failed++; console.error(`skipped pid ${r.pid}: it now runs a protected process`); continue; }
      const res = killVerified(killOrder(r.pid, snap).filter((e) => !closed.has(e.pid)));
      for (const [pid, st] of res) if (st === 'killed' || st === 'gone') closed.add(pid);
      const bad = [...res].filter(([, st]) => st === 'failed').map(([pid]) => pid);
      if (bad.length) { failed++; console.error(`failed to close pid ${bad.join(', ')} (under pid ${r.pid})`); }
      if (closed.has(r.pid)) fs.rmSync(path.join(REG, `${r.pid}.json`), { force: true });
      else if (!bad.includes(r.pid)) { failed++; console.error(`skipped pid ${r.pid}: it changed while closing`); }
    }
    return failed ? 1 : 0;
  }

  console.error(`unknown command: ${cmd}`);
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (err) { console.error(err.message); process.exitCode = 1; }
}
