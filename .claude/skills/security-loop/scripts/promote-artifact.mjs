#!/usr/bin/env node
// Copy declared evidence files from an agent's scratch folder into its retained artifacts folder.
// The parent runs this after the agent and every process it started have exited. Scratch is
// treated as hostile: no links, no special files, no hard-linked files, no files that change
// while being read, and explicit size limits. Zero dependencies; works on Windows and POSIX.
//
// Usage:
//   node promote-artifact.mjs --scratch <dir> --artifacts <dir> [--max-file <bytes>] [--max-total <bytes>] <relative-path>...
// Prints one JSON line per file. Exit 0 = all promoted, 1 = at least one rejected, 2 = usage error.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const WINDOWS_DEVICE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9]|conin\$|conout\$)(\..*)?$/i;

function parseArgs(argv) {
  const options = { maxFile: 256 * 1024, maxTotal: 2 * 1024 * 1024, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${arg} needs a value`);
      return argv[++i];
    };
    if (arg === "--scratch") options.scratch = value();
    else if (arg === "--artifacts") options.artifacts = value();
    else if (arg === "--max-file") options.maxFile = Number(value());
    else if (arg === "--max-total") options.maxTotal = Number(value());
    else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else options.files.push(arg);
  }
  if (!options.scratch || !options.artifacts) throw new Error("--scratch and --artifacts are required");
  for (const key of ["maxFile", "maxTotal"]) {
    if (!Number.isSafeInteger(options[key]) || options[key] <= 0) throw new Error(`${key} must be a positive integer`);
  }
  if (options.files.length === 0) throw new Error("name at least one scratch-relative file");
  return options;
}

function components(relative) {
  if (typeof relative !== "string" || relative.length === 0) throw new Error("empty path");
  if (path.isAbsolute(relative) || /^[a-zA-Z]:/.test(relative) || relative.startsWith("\\\\")) {
    throw new Error("absolute path");
  }
  const parts = relative.split(/[\\/]/);
  for (const part of parts) {
    if (part === "" || part === "." || part === "..") throw new Error("empty, '.' or '..' component");
    if (/[\u0000-\u001f:*?"<>|]/.test(part)) throw new Error("reserved character in component");
    if (/[. ]$/.test(part)) throw new Error("component ends with a dot or space");
    if (WINDOWS_DEVICE.test(part)) throw new Error("Windows device name");
  }
  return parts;
}

function realDirectory(dir, label) {
  const stat = fs.lstatSync(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${label} is not a real directory`);
  return stat;
}

const posixNoFollow = Number.isInteger(fs.constants.O_NOFOLLOW) && fs.constants.O_NOFOLLOW !== 0
  ? fs.constants.O_NOFOLLOW
  : 0;
const posixNonBlock = Number.isInteger(fs.constants.O_NONBLOCK) && fs.constants.O_NONBLOCK !== 0
  ? fs.constants.O_NONBLOCK
  : 0;

function existingBytes(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) throw new Error(`artifacts folder holds a link: ${entry.name}`);
    if (stat.isDirectory()) total += existingBytes(full);
    else total += stat.size;
  }
  return total;
}

function readSource(scratchRoot, parts, maxFile) {
  let current = scratchRoot;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    realDirectory(current, "source parent");
  }
  const leaf = path.join(current, parts.at(-1));
  const before = fs.lstatSync(leaf);
  if (before.isSymbolicLink()) throw new Error("source is a link");
  if (!before.isFile()) throw new Error("source is not a regular file");
  if (before.nlink !== 1) throw new Error("source has more than one hard link");
  if (before.size > maxFile) throw new Error(`source exceeds ${maxFile} bytes`);

  const fd = fs.openSync(leaf, fs.constants.O_RDONLY | posixNoFollow | posixNonBlock);
  try {
    const opened = fs.fstatSync(fd);
    const same = (a, b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.nlink === b.nlink;
    if (!opened.isFile() || !same(opened, before)) throw new Error("source changed while it was opened");
    const buffer = Buffer.alloc(before.size + 1);
    let read = 0;
    while (read < buffer.length) {
      const count = fs.readSync(fd, buffer, read, buffer.length - read, null);
      if (count === 0) break;
      read += count;
    }
    if (read !== before.size) throw new Error("source size changed while it was read");
    const after = fs.fstatSync(fd);
    if (!same(after, before)) throw new Error("source changed while it was read");
    return buffer.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

function writeDestination(artifactsRoot, parts, data) {
  let current = artifactsRoot;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    try {
      realDirectory(current, "destination parent");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      fs.mkdirSync(current);
      realDirectory(current, "destination parent");
    }
  }
  const leaf = path.join(current, parts.at(-1));
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | posixNoFollow;
  const fd = fs.openSync(leaf, flags, 0o600);
  let complete = false;
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) throw new Error("destination is not a fresh regular file");
    let written = 0;
    while (written < data.length) {
      const count = fs.writeSync(fd, data, written, data.length - written, written);
      if (count <= 0) throw new Error("destination write made no progress");
      written += count;
    }
    complete = true;
  } finally {
    fs.closeSync(fd);
    // This call created the file exclusively, so removing a partial copy cannot touch anything else.
    if (!complete) fs.rmSync(leaf, { force: true });
  }
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`usage error: ${error.message}`);
    return 2;
  }
  const scratchRoot = path.resolve(options.scratch);
  const artifactsRoot = path.resolve(options.artifacts);
  let total;
  try {
    realDirectory(scratchRoot, "scratch root");
    realDirectory(artifactsRoot, "artifacts root");
    total = existingBytes(artifactsRoot);
  } catch (error) {
    console.error(`setup error: ${error.message}`);
    return 2;
  }

  let rejected = 0;
  for (const file of options.files) {
    const result = { file, status: "promoted" };
    try {
      const parts = components(file);
      const data = readSource(scratchRoot, parts, options.maxFile);
      if (total + data.length > options.maxTotal) throw new Error(`cumulative size would exceed ${options.maxTotal} bytes`);
      writeDestination(artifactsRoot, parts, data);
      total += data.length;
      result.bytes = data.length;
      result.sha256 = crypto.createHash("sha256").update(data).digest("hex");
    } catch (error) {
      result.status = "rejected";
      result.reason = error.code === "EEXIST" ? "destination already exists" : error.message;
      rejected++;
    }
    console.log(JSON.stringify(result));
  }
  return rejected === 0 ? 0 : 1;
}

process.exitCode = main();
