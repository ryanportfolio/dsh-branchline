#!/usr/bin/env node
/* Is this checkout safe to archive? Collects the facts a session needs before it says yes.

   node <wrapup skill>/scripts/wrapup.mjs [--json] [--worktrees]

   Checks, for the checkout in the current directory:
     uncommitted   modified, staged or untracked files (git status)
     unpushed      commits at HEAD that no remote has
     pr            this branch's pull request and its state, via gh when available
     scratch       ignored scratch folders (.tmp/) that removing this worktree would delete
     running       dev servers and automation browsers started from this checkout
     worktrees     other worktrees of this repository, main checkout included: linked ones sitting
                   exactly on a merged PR head are cleanup candidates (the main checkout never is),
                   dirty or unpushed ones hold work
   Prints BLOCKED with the reasons, or READY. An open PR blocks READY: a session is not ready to
   archive while its PR waits to merge. A check that cannot run blocks READY: missing
   evidence is never read as "nothing to worry about". Exit code 0 either way; 2 when not a git
   checkout. Read-only apart from a `git fetch`. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, repoWorktrees, same } from '../../servers/scripts/servers.mjs';

const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 32 << 20 });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || r.error?.message || '').trim() };
};
const git = (args, cwd) => run('git', args, cwd);

/* File count and size under `dir`; a missing folder is empty, any other read error is reported. */
function dirStats(dir) {
  let files = 0, bytes = 0;
  if (!fs.existsSync(dir)) return { files, bytes };
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) walk(p);
      else { files++; try { bytes += fs.statSync(p).size; } catch (err) { if (err.code !== 'ENOENT') throw err; } }
    }
  };
  try { walk(dir); } catch (err) { return { files, bytes, error: err.message }; }
  return { files, bytes };
}

function defaultBranch(cwd) {
  const r = git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], cwd);
  return r.ok ? r.out.replace(/^origin\//, '') : 'main';
}

/* Branch -> commit on origin, read from the remote itself: a clone whose fetch refspec covers
   only main has no remote-tracking ref for other branches, so --remotes alone undercounts. */
function remoteHeads(cwd) {
  const r = git(['ls-remote', '--heads', 'origin'], cwd);
  if (!r.ok) return null;
  return new Map(r.out.split('\n').filter(Boolean).map((l) => { const [sha, ref] = l.split(/\s+/); return [ref.replace('refs/heads/', ''), sha]; }));
}

/* Commits at the checkout's HEAD that no live branch on origin has; null when that cannot be
   established. Only heads origin reports right now count: a cached remote-tracking ref can
   outlive the branch it tracked. The checkout's own branch head is fetched if missing. */
function unpushedCount(cwd, branch, heads) {
  if (!heads) return null;
  const own = branch ? heads.get(branch) : null;
  if (own && git(['rev-parse', 'HEAD'], cwd).out === own) return 0;
  if (own && !git(['cat-file', '-e', `${own}^{commit}`], cwd).ok) git(['fetch', '--quiet', 'origin', `refs/heads/${branch}`], cwd);
  // one batch lookup for which live heads this clone has, one rev-list fed through stdin
  const shas = [...new Set(heads.values())];
  const count = () => {
    const have = spawnSync('git', ['cat-file', '--batch-check'], { cwd, input: shas.join('\n') + '\n', encoding: 'utf8', windowsHide: true });
    if (have.status !== 0) return null;
    const lines = have.stdout.split('\n').filter(Boolean);
    const live = lines.filter((l) => / commit /.test(l)).map((l) => l.split(' ')[0]);
    const missing = lines.filter((l) => / missing$/.test(l)).map((l) => l.split(' ')[0]);
    const r = spawnSync('git', ['rev-list', '--count', 'HEAD', '--stdin'], { cwd, input: live.map((s) => `^${s}`).join('\n') + '\n', encoding: 'utf8', windowsHide: true });
    return r.status === 0 ? { n: +r.stdout.trim(), missing } : null;
  };
  let c = count();
  // a clone that fetches only main lacks other branch tips; one of them may already hold HEAD's
  // commits, so before calling anything unpushed, fetch those tips and count again
  if (c && c.n && c.missing.length) {
    const f = spawnSync('git', ['fetch', '--quiet', '--no-tags', '--stdin', 'origin'], { cwd, input: c.missing.join('\n') + '\n', encoding: 'utf8', windowsHide: true });
    if (f.status !== 0) return null;
    c = count();
    if (c && c.missing.length) return null;
  }
  return c ? c.n : null;
}

function prFor(branch, cwd) {
  if (!run('gh', ['--version']).ok) return { unavailable: 'gh not installed' };
  const r = run('gh', ['pr', 'list', '--head', branch, '--state', 'all', '--limit', '1', '--json', 'number,state,url,headRefOid'], cwd);
  if (!r.ok) return { unavailable: r.err.split('\n')[0] || 'gh failed' };
  return JSON.parse(r.out || '[]')[0] || null;
}

/* Branch -> head commits of its merged pull requests. Squash merges leave the branch's own
   commits off main, so "merged" means the worktree sits exactly on a merged PR head. */
function mergedPrHeads(cwd) {
  const r = run('gh', ['pr', 'list', '--state', 'merged', '--limit', '300', '--json', 'headRefName,headRefOid'], cwd);
  const heads = new Map();
  if (!r.ok) return heads;
  try {
    for (const p of JSON.parse(r.out)) heads.set(p.headRefName, [...(heads.get(p.headRefName) || []), p.headRefOid]);
  } catch {}
  return heads;
}

function worktrees(cwd, here, base, heads) {
  const r = git(['worktree', 'list', '--porcelain'], cwd);
  if (!r.ok) return [];
  const merged = new Set(git(['branch', '--format=%(refname:short)', '--merged', `origin/${base}`], cwd).out.split('\n').filter(Boolean));
  const prHeads = mergedPrHeads(cwd);
  // the first entry is the main checkout: checked for held work, never a cleanup candidate
  return r.out.split(/\r?\n\r?\n/).map((block, i) => {
    const wt = { path: '', branch: null, main: i === 0 };
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('worktree ')) wt.path = path.normalize(line.slice(9));
      if (line.startsWith('branch ')) wt.branch = line.slice(7).replace('refs/heads/', '');
      if (line === 'prunable' || line.startsWith('prunable ')) wt.prunable = true;
    }
    return wt;
  }).filter((wt) => wt.path && !same(wt.path, here)).map((wt) => {
    if (wt.main && !fs.existsSync(wt.path)) return { ...wt, state: 'check failed' };
    if (wt.prunable || !fs.existsSync(wt.path)) return { ...wt, state: 'missing folder (git worktree prune)' };
    const status = git(['status', '--porcelain'], wt.path);
    if (!status.ok) return { ...wt, state: 'check failed' };
    const dirty = status.out.split('\n').filter(Boolean).length;
    const head = git(['rev-parse', 'HEAD'], wt.path).out;
    const isMerged = !!wt.branch && (merged.has(wt.branch) || (prHeads.get(wt.branch) || []).includes(head));
    const unpushed = isMerged ? 0 : unpushedCount(wt.path, wt.branch, heads);
    let state = dirty ? `${dirty} uncommitted` : unpushed === null ? 'check failed' : unpushed ? `${unpushed} unpushed` : isMerged && !wt.main ? 'merged, removable' : 'clean';
    // ignored scratch is invisible to git status, and removing the worktree deletes it
    const scratch = state === 'merged, removable' ? dirStats(path.join(wt.path, '.tmp')) : null;
    if (scratch?.error) state = 'check failed';
    else if (scratch?.files) state += ` (deletes .tmp/: ${scratch.files} file(s), ${(scratch.bytes / 1e6).toFixed(1)} MB)`;
    return { ...wt, dirty, unpushed, scratch, state };
  });
}

export function wrapup(cwd = process.cwd()) {
  const top = git(['rev-parse', '--show-toplevel'], cwd);
  if (!top.ok) return null;
  const here = path.normalize(top.out);
  const blockers = [];
  const notes = [];
  if (!git(['fetch', '--quiet', 'origin'], here).ok) notes.push('git fetch failed; remote state may be stale');
  const base = defaultBranch(here);
  const branch = git(['branch', '--show-current'], here).out || null;
  const statusRun = git(['status', '--porcelain'], here);
  const status = statusRun.ok ? statusRun.out.split('\n').filter(Boolean) : [];
  const heads = remoteHeads(here);
  if (!heads) blockers.push('could not reach origin to confirm the work is on GitHub');
  const unpushed = unpushedCount(here, branch, heads);
  const head = git(['rev-parse', 'HEAD'], here).out;
  const pr = branch && branch !== base ? prFor(branch, here) : null;
  const scratch = ['.tmp'].map((d) => ({ dir: d, ...dirStats(path.join(here, d)) })).filter((s) => s.files || s.error);
  let running = [];
  let runningError = null;
  try {
    const trees = [here, ...repoWorktrees(here)];
    running = scan().filter((r) => r.worktree && trees.some((t) => same(t, r.worktree)));
  } catch (err) { runningError = err.message; }
  const others = worktrees(here, here, base, heads);

  if (!statusRun.ok) blockers.push(`git status failed: ${statusRun.err.split('\n')[0]}`);
  if (status.length) blockers.push(`${status.length} uncommitted change(s) in ${here}`);
  if (unpushed === null) { if (heads) blockers.push('could not count commits missing from the remote'); }
  else if (unpushed && pr?.state === 'MERGED' && pr.headRefOid === head) notes.push(`HEAD is the merged head of PR #${pr.number}; its commits are on main through the merge`);
  else if (unpushed) blockers.push(`${unpushed} commit(s) at HEAD not on any remote`);
  if (!branch) notes.push('detached HEAD');
  if (pr?.state === 'OPEN') blockers.push(`PR #${pr.number} is open, not merged (${pr.url})`);
  if (pr?.unavailable) blockers.push(`PR check failed: ${pr.unavailable}`);
  for (const s of scratch) {
    if (s.error) blockers.push(`could not inspect ${s.dir}/ (${s.error}); removing this worktree may delete files in it`);
    else notes.push(`${s.dir}/ holds ${s.files} file(s), ${(s.bytes / 1e6).toFixed(1)} MB; removing this worktree deletes them`);
  }
  const mine = running.filter((r) => same(r.worktree, here));
  if (mine.length) blockers.push(`${mine.length} server(s)/browser(s) still running from this checkout`);
  if (running.length > mine.length) notes.push(`${running.length - mine.length} server(s)/browser(s) running from other worktrees of this repo`);
  if (runningError) blockers.push(`running-process check failed: ${runningError}`);
  const holding = others.filter((w) => w.dirty || w.unpushed);
  const removable = others.filter((w) => w.state.startsWith('merged') || w.state.startsWith('missing'));
  const unchecked = others.filter((w) => w.state === 'check failed');
  if (holding.length) notes.push(`${holding.length} other worktree(s) hold uncommitted or unpushed work`);
  if (removable.length) notes.push(`${removable.length} other worktree(s) are merged or missing and can be removed`);
  if (unchecked.length) notes.push(`${unchecked.length} other worktree(s) could not be checked`);

  return { checkout: here, branch, base, verdict: blockers.length ? 'BLOCKED' : 'READY', blockers, notes, uncommitted: status, unpushed, pr, scratch, running, worktrees: others };
}

function main(argv) {
  const r = wrapup();
  if (!r) { console.error('wrapup: not inside a git checkout'); return 2; }
  if (argv.includes('--json')) { console.log(JSON.stringify(r, null, 1)); return 0; }
  console.log(`${r.verdict}: ${r.checkout} (${r.branch || 'detached'} -> ${r.base})`);
  for (const b of r.blockers) console.log(`  blocker: ${b}`);
  for (const n of r.notes) console.log(`  note: ${n}`);
  if (r.uncommitted.length) console.log(`  uncommitted:\n${r.uncommitted.slice(0, 20).map((s) => `    ${s}`).join('\n')}`);
  for (const s of r.running) console.log(`  running: ${s.ports.length ? ':' + s.ports.join(',:') : s.kind} pid ${s.pid} ${s.worktree}${s.purpose ? ` "${s.purpose}"` : ''}`);
  if (argv.includes('--worktrees')) for (const w of r.worktrees.filter((w) => w.state !== 'clean')) console.log(`  worktree: ${w.path} [${w.branch || 'detached'}] ${w.state}`);
  else if (r.worktrees.some((w) => w.state !== 'clean')) console.log('  (--worktrees lists the other worktrees)');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
