#!/usr/bin/env node
// List pairs of files that change in the same commits, as evidence for hidden links: two files
// that keep changing together are coupled, whether or not either one imports the other.
// Commits that touch more than --max-files files (formatting sweeps, renames, vendoring) are
// skipped because every pair inside them would look coupled. Merge commits are skipped. Lockfiles
// and paths matching --exclude are ignored. Read-only; zero dependencies.
//
// Usage: node co-change.mjs --repo <path> [--ref <rev>] [--max-commits <n>] [--max-files <n>]
//          [--min-together <n>] [--top <n>] [--exclude <regex>] [--out <file.json>]
//
// Output: a summary table on stdout; with --out, the full result as JSON. For each pair:
// `together` (commits touching both), each file's own change count, `share` (together divided
// by the smaller change count, rounded down, so 1 means one file never changed without the
// other), `crossDir` (true when the files sit in different folders) and `commonDir` (the deepest
// folder holding both; `src` for `src/api/cart.ts` and `src/ui/cart.tsx`). The JSON also
// holds `fileChanges`: every file's change count in the commits used, for comparing how often
// an importer and the module it imports change.

import fs from "node:fs";
import { spawnSync } from "node:child_process";

const LOCKFILE = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|uv\.lock|Pipfile\.lock|composer\.lock|Gemfile\.lock|go\.sum)$/;

function parseArgs(argv) {
  const o = { ref: "HEAD", maxCommits: 3000, maxFiles: 25, minTogether: 3, top: 60 };
  const num = (name, value) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a positive integer`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    // An empty or missing value would otherwise become a match-everything --exclude or a skipped --out.
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v === "" || v.startsWith("--")) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--repo") o.repo = value();
    else if (a === "--ref") o.ref = value();
    else if (a === "--max-commits") o.maxCommits = num(a, value());
    else if (a === "--max-files") o.maxFiles = num(a, value());
    else if (a === "--min-together") o.minTogether = num(a, value());
    else if (a === "--top") o.top = num(a, value());
    else if (a === "--exclude") o.exclude = new RegExp(value());
    else if (a === "--out") o.out = value();
    else throw new Error(`unknown argument ${a}`);
  }
  if (!o.repo) throw new Error("--repo is required");
  if (o.ref.startsWith("-")) throw new Error("--ref must be a revision");
  return o;
}

function readCommits(o) {
  // -z keeps paths unquoted and byte-exact; \x1e marks the start of each commit.
  const r = spawnSync(
    "git",
    ["-C", o.repo, "log", "-z", "--no-merges", "--no-renames", "--name-only",
      "--format=%x1e%H", `--max-count=${o.maxCommits}`, o.ref, "--"],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 },
  );
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`git log failed: ${r.stderr.trim()}`);
  const commits = [];
  for (const block of r.stdout.split("\x1e").slice(1)) {
    const [sha, ...rest] = block.split("\0");
    const files = rest.map((f, i) => (i === 0 ? f.replace(/^\n/, "") : f)).filter(Boolean);
    commits.push({ sha, files: [...new Set(files)].filter((f) => !LOCKFILE.test(f) && !(o.exclude && o.exclude.test(f))) });
  }
  return commits;
}

const dirOf = (f) => (f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : ".");
function commonDir(a, b) {
  const x = dirOf(a).split("/");
  const y = dirOf(b).split("/");
  let n = 0;
  while (n < x.length && n < y.length && x[n] === y[n]) n++;
  return n ? x.slice(0, n).join("/") : ".";
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const commits = readCommits(o);
  const changes = new Map();
  const pairs = new Map();
  let used = 0;
  let skippedLarge = 0;
  for (const { files } of commits) {
    if (files.length > o.maxFiles) { skippedLarge++; continue; }
    if (files.length === 0) continue;
    used++;
    for (const f of files) changes.set(f, (changes.get(f) || 0) + 1);
    const sorted = [...files].sort();
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = `${sorted[i]}\0${sorted[j]}`;
        pairs.set(key, (pairs.get(key) || 0) + 1);
      }
    }
  }
  const rows = [];
  for (const [key, together] of pairs) {
    if (together < o.minTogether) continue;
    const [a, b] = key.split("\0");
    const ca = changes.get(a);
    const cb = changes.get(b);
    // Rounded down, so 1 only when one file never changed without the other.
    const share = Math.floor((together * 100) / Math.min(ca, cb)) / 100;
    rows.push({ a, b, together, changesA: ca, changesB: cb, share, crossDir: dirOf(a) !== dirOf(b), commonDir: commonDir(a, b) });
  }
  if (commits.length > 0 && used === 0) {
    throw new Error(`all ${commits.length} commits were filtered out (--exclude, lockfiles, or --max-files ${o.maxFiles}); no evidence produced`);
  }
  rows.sort((x, y) => y.together - x.together || y.share - x.share || (x.a + x.b).localeCompare(y.a + y.b));
  const result = {
    repo: o.repo, ref: o.ref, commitsRead: commits.length, commitsUsed: used, commitsSkippedLarge: skippedLarge,
    maxFiles: o.maxFiles, minTogether: o.minTogether, pairCount: rows.length, pairs: rows,
    fileChanges: Object.fromEntries([...changes].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))),
  };
  if (o.out) fs.writeFileSync(o.out, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`commits read ${commits.length}, used ${used}, skipped as too large ${skippedLarge}; pairs with >= ${o.minTogether} shared commits: ${rows.length}`);
  console.log("together\tshare\tcommonDir\ta\tb");
  for (const r of rows.slice(0, o.top)) console.log(`${r.together}\t${r.share}\t${r.commonDir}\t${r.a}\t${r.b}`);
  if (rows.length > o.top) console.log(`... ${rows.length - o.top} more${o.out ? ` in ${o.out}` : "; pass --out for all"}`);
}

try { main(); } catch (e) { console.error(`co-change: ${e.message}`); process.exitCode = 1; }
