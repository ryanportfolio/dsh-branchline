#!/usr/bin/env node
// Baseline manifest for long-horizon rounds. Node only, no dependencies.
//
//   node manifest.mjs <workspace root> <out.json> [--ref <ref>] [path ...]
//     sha256 of every tracked file with uncommitted changes, every untracked file, and every
//     file under each extra path (Write scope, ignored generated artifacts, paths outside the
//     root). Records deleted paths, HEAD and a `git stash create` snapshot; --ref pins the
//     snapshot with `git update-ref` so gc cannot prune it.
//
//   node manifest.mjs --diff <baseline.json> [<current.json>]
//     Rebuilds the manifest now over the baseline's coverage plus every path changed since its
//     snapshot (commits included), optionally saves it, and prints added, modified, deleted.
//
// Links and junctions are recorded by target and never followed; on POSIX an executable file's
// entry ends in +x. Nested node_modules and .git folders are skipped unless passed as an extra
// path themselves. Anything that could not be inspected is listed under `uncovered`, never
// reported as clean or deleted.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DELETED = "DELETED";
const POSIX = process.platform !== "win32";
const slash = (p) => (POSIX ? p : p.replaceAll("\\", "/")); // a POSIX name may contain \

// Output on success, null on any git failure.
function git(root, args) {
  try {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

const keyOf = (root, abs) => {
  const rel = path.relative(root, abs);
  return rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel) ? slash(abs) : slash(rel);
};
const absOf = (root, key) => path.resolve(root, key); // also normalizes an absolute key's separators
const within = (key, prefix) => key === prefix || key.startsWith(`${prefix}/`);

// The nearest folder between `stop` (exclusive) and `abs` that is now a link or junction.
function linkedAncestor(stop, abs) {
  for (let dir = path.dirname(abs); dir !== stop && dir.startsWith(stop + path.sep); dir = path.dirname(dir)) {
    try {
      if (fs.lstatSync(dir).isSymbolicLink()) return dir;
    } catch {}
  }
  return null;
}

function walk(root, abs, files, uncovered) {
  const key = keyOf(root, abs);
  try {
    const st = fs.lstatSync(abs);
    if (st.isSymbolicLink()) files[key] = `link:${slash(fs.readlinkSync(abs))}`;
    else if (st.isFile()) files[key] = createHash("sha256").update(fs.readFileSync(abs)).digest("hex") + (POSIX && st.mode & 0o100 ? "+x" : "");
    else if (st.isDirectory()) {
      for (const e of fs.readdirSync(abs)) if (e !== ".git" && e !== "node_modules") walk(root, path.join(abs, e), files, uncovered);
    } else files[key] = "special"; // socket, FIFO or device
  } catch (e) {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") files[key] = DELETED;
    else {
      delete files[key];
      uncovered.push(`unreadable: ${key} (${e.code ?? e.message})`);
    }
  }
}

// Paths `git status` reports; a rename or copy contributes both its new and its old path.
function statusPaths(root) {
  const out = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (out === null) return null;
  const tokens = out.split("\0").filter(Boolean);
  const paths = [];
  for (let i = 0; i < tokens.length; i++) {
    paths.push(tokens[i].slice(3));
    if (/[RC]/.test(tokens[i].slice(0, 2))) paths.push(tokens[++i]);
  }
  return paths;
}

function build(rootArg, out, { ref = null, extras: given = [], cover = [], exclude = [] } = {}) {
  let root = path.resolve(rootArg);
  const files = Object.create(null); // a file may be named __proto__ or constructor
  const uncovered = [];
  const top = git(root, ["rev-parse", "--show-toplevel"]);
  const at = root;
  if (top) root = path.resolve(top.trim()); // porcelain paths are relative to the top level
  const extras = given.map((x) => keyOf(root, path.resolve(at, x)));
  const status = top ? statusPaths(root) : null;
  if (top && status === null) throw new Error("git status failed");
  if (!top) {
    uncovered.push("not a git workspace: whole root walked, no snapshot");
    walk(root, root, files, uncovered);
  } else {
    for (const p of status) walk(root, path.resolve(root, p), files, uncovered);
  }
  for (const x of extras) walk(root, absOf(root, x), files, uncovered);
  // A covered path whose folder became a link is gone from the tree; record the link instead
  // of reading through it.
  const extraRoots = extras.map((x) => absOf(root, x));
  for (const k of cover) {
    const abs = absOf(root, k);
    const stop = path.isAbsolute(k) ? extraRoots.find((x) => abs.startsWith(x + path.sep)) : root;
    const link = stop && linkedAncestor(stop, abs);
    if (link) {
      files[keyOf(root, abs)] = DELETED;
      walk(root, link, files, uncovered);
    } else walk(root, abs, files, uncovered);
  }
  for (const f of [out, ...exclude]) if (f) delete files[keyOf(root, path.resolve(f))];
  let head = null;
  let snapshot = null;
  if (top) {
    head = (git(root, ["rev-parse", "--verify", "--quiet", "HEAD"]) ?? "").trim() || null;
    if (head) {
      const stash = git(root, ["-c", "user.name=long-horizon", "-c", "user.email=long-horizon@localhost", "stash", "create"]);
      if (stash === null) throw new Error("git stash create failed");
      snapshot = stash.trim() || head;
      if (ref && git(root, ["update-ref", ref, snapshot]) === null) throw new Error(`git update-ref ${ref} failed`);
    } else uncovered.push("no commit yet: no snapshot");
  }
  const manifest = { root: slash(root), head, snapshot, ref, taken: new Date().toISOString(), extras, uncovered, files };
  if (out) fs.writeFileSync(out, JSON.stringify(manifest, null, 1));
  return manifest;
}

// What a path not covered at baseline held then: its snapshot entry as a manifest value,
// DELETED when the snapshot lacks it, or null when the snapshot cannot be read.
function snapshotValue(root, snapshot, key, now) {
  if (!snapshot || path.isAbsolute(key)) return DELETED;
  const out = git(root, ["ls-tree", "-z", snapshot, "--", key]);
  if (out === null) return null;
  const m = /^(\d+) blob ([0-9a-f]+)\t/.exec(out);
  if (!m) return DELETED;
  const [, mode, blob] = m;
  if (mode === "120000") {
    const target = git(root, ["cat-file", "blob", blob]);
    return target === null ? null : `link:${slash(target)}`;
  }
  if (now === DELETED || now.startsWith("link:") || now === "special") return "tracked";
  const current = git(root, ["hash-object", "--", key]);
  if (current === null) return null;
  const exec = POSIX && mode === "100755";
  return current.trim() === blob && exec === now.endsWith("+x") ? now : "tracked";
}

function diff(baselineFile, out) {
  const base = JSON.parse(fs.readFileSync(baselineFile, "utf8"));
  const root = base.root;
  const uncoveredSince = [];
  let since = [];
  if (base.snapshot) {
    const listed = git(root, ["diff", "--no-renames", "--name-only", "-z", base.snapshot]);
    if (listed === null) uncoveredSince.push(`snapshot ${base.snapshot} unavailable: paths committed since the baseline are not covered`);
    else since = listed.split("\0").filter(Boolean);
  }
  const cur = build(root, out, { extras: base.extras, cover: [...Object.keys(base.files), ...since], exclude: [baselineFile] });
  const unreadableIn = (list) => list.filter((u) => u.startsWith("unreadable: ")).map((u) => u.slice(12).replace(/ \([^)]*\)$/, ""));
  const before = unreadableIn(base.uncovered ?? []);
  // Content unknown at baseline or now cannot be classified; it stays under uncovered.
  const unknown = [...before, ...unreadableIn(cur.uncovered)];
  const uncovered = [...uncoveredSince, ...before.map((k) => `unreadable at baseline: ${k}`), ...cur.uncovered];
  const result = { added: [], modified: [], deleted: [] };
  for (const k of new Set([...Object.keys(base.files), ...Object.keys(cur.files)])) {
    if (unknown.some((u) => within(k, u))) continue;
    const now = cur.files[k] ?? DELETED;
    let was = Object.hasOwn(base.files, k) ? base.files[k] : undefined;
    if (was === undefined) was = snapshotValue(root, base.snapshot, k, now);
    if (was === null) {
      uncovered.push(`snapshot entry unreadable: ${k}`);
      continue;
    }
    if (was === now) continue;
    if (was === DELETED) result.added.push(k);
    else if (now === DELETED) result.deleted.push(k);
    else result.modified.push(k);
  }
  for (const list of Object.values(result)) list.sort();
  return { baseline: slash(path.resolve(baselineFile)), root, headAtBaseline: base.head, headNow: cur.head, uncovered, ...result };
}

const argv = process.argv.slice(2);
const usage = "usage: node manifest.mjs <root> <out.json> [--ref <ref>] [path ...]\n       node manifest.mjs --diff <baseline.json> [<current.json>]";
try {
  if (argv[0] === "--diff" && argv[1]) {
    console.log(JSON.stringify(diff(argv[1], argv[2] ?? null), null, 1));
  } else if (argv.length >= 2 && !argv[0].startsWith("--")) {
    const [root, out, ...rest] = argv;
    const i = rest.indexOf("--ref");
    const ref = i >= 0 ? rest[i + 1] : null;
    if (i >= 0 && !ref) {
      console.error(usage);
      process.exit(2);
    }
    const extras = i >= 0 ? rest.filter((_, j) => j !== i && j !== i + 1) : rest;
    const m = build(root, out, { ref, extras });
    console.log(`files ${Object.keys(m.files).length}, snapshot ${m.snapshot ?? "none"}${m.uncovered.length ? `, uncovered: ${m.uncovered.join("; ")}` : ""}`);
  } else {
    console.error(usage);
    process.exit(2);
  }
} catch (e) {
  console.error(`manifest.mjs: ${e.message}`);
  process.exit(1);
}
