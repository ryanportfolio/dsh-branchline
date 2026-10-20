#!/usr/bin/env node
// Frozen review snapshot for impartial-review. Node only, no dependencies.
//
//   node snapshot.mjs [--base <ref>] [--merge-base] [--root <dir>] [--out <dir>]
//                     [--part-kb <n>] [--exclude <path>]...
//     Freezes the working tree (staged, unstaged and untracked files) against <ref> (default
//     HEAD; --merge-base uses the merge base of <ref> and HEAD) into <out> (default
//     <root>/.tmp/review-snapshots/<time>):
//       base/, head/            pre- and post-change copies of every changed text file
//       scope.patch             the diff between them
//       source-inventory.json   path, status and SHA-256 per changed path, absolute paths,
//                               scope hash, page index and the JS/TS dependency note
//       BRIEF.md                the scope section to paste into every reviewer prompt
//     CRLF becomes LF in the copies and the patch, so a line-ending flip is listed as
//     eol-only instead of showing as a whole-file rewrite. Copies and the patch over
//     --part-kb (default 48, under the Read tool's 256 KB and roughly 25k-token caps) or 1800
//     lines are also split into pages. Exits 1, writing no inventory or brief, when a changed
//     text path is missing from the patch or a changed path cannot be read.
//
//   node snapshot.mjs --verify <snapshot dir>
//     Rebuilds the scope from the workspace and exits 1 when it no longer matches.
//
// <ref> may also be a tree, such as the empty tree for a root commit, unless --merge-base is set.
// Binary files (a NUL byte in the first 8000 bytes, git's own test) are hashed, not copied.
// Patch and pages keep the original bytes, so text that is not UTF-8 is not altered. A dirty
// submodule is listed as not covered: only the commit it points at is snapshotted.
// The dependency note covers JS/TS import statements only: imports in changed files, and
// imports anywhere in the workspace that pointed at a deleted file.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";

const POSIX = process.platform !== "win32";
const slash = (p) => (POSIX ? p : p.replaceAll("\\", "/"));
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
// Path comparison key: lower case when the repository ignores case (core.ignorecase, the Windows
// default), as the file system does. Set once the root is known.
let FOLD = (p) => p;
const within = (p, prefix) => {
  const [a, b] = [FOLD(p), FOLD(prefix)];
  return a === b || a.startsWith(`${b}/`);
};
// True for a path.relative result that leaves the folder ("..", "../x"); "..reviews" stays inside.
const leaves = (rel) => rel === ".." || rel.startsWith(`..${path.sep}`) || rel.startsWith("../") || path.isAbsolute(rel);
const MAX_LINES = 1800; // under the Read tool's 2000-line default page
const CONTENT = new Set(["added", "modified", "deleted"]);

function git(cwd, args, { input, ok = [0] } = {}) {
  const r = spawnSync("git", args, { cwd, input, maxBuffer: 1 << 30 });
  if (r.error) throw r.error;
  if (!ok.includes(r.status)) throw new Error(`git ${args.join(" ")} failed (exit ${r.status}): ${r.stderr.toString().trim()}`);
  return r.stdout;
}
const gitText = (cwd, args) => git(cwd, args).toString("utf8").trim();

const isBinary = (buf) => buf !== null && buf.subarray(0, 8000).includes(0);

// Drops every CR that precedes an LF, byte by byte, so non-UTF-8 text survives unchanged.
function toLF(buf) {
  if (!buf.includes(0x0d)) return buf;
  const out = Buffer.allocUnsafe(buf.length);
  let n = 0;
  for (let i = 0; i < buf.length; i++) if (buf[i] !== 0x0d || buf[i + 1] !== 0x0a) out[n++] = buf[i];
  return out.subarray(0, n);
}

function eolOf(buf) {
  if (buf === null) return null;
  let crlf = 0;
  let lf = 0;
  for (let i = 0; i < buf.length; i++) if (buf[i] === 0x0a) buf[i - 1] === 0x0d ? crlf++ : lf++;
  return crlf && lf ? "mixed" : crlf ? "crlf" : lf ? "lf" : "none";
}

// Blob contents by object name, from one `git cat-file --batch` process.
function readBlobs(root, shas) {
  const blobs = new Map();
  if (!shas.length) return blobs;
  const out = git(root, ["cat-file", "--batch"], { input: `${shas.join("\n")}\n` });
  let i = 0;
  while (i < out.length) {
    const nl = out.indexOf(0x0a, i);
    const [sha, type, size] = out.subarray(i, nl).toString().split(" ");
    if (type === "missing" || size === undefined) throw new Error(`git object ${sha} is missing`);
    blobs.set(sha, out.subarray(nl + 1, nl + 1 + Number(size)));
    i = nl + 1 + Number(size) + 1;
  }
  return blobs;
}

// indexModes: path to index mode when core.fileMode is false, else null.
function readHead(root, p, indexModes) {
  const abs = path.join(root, p);
  let st;
  try {
    st = fs.lstatSync(abs);
  } catch (e) {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") return { kind: null, mode: null, bytes: null };
    throw new Error(`cannot read ${p}: ${e.code ?? e.message}`);
  }
  if (st.isSymbolicLink()) return { kind: "symlink", mode: "120000", bytes: Buffer.from(slash(fs.readlinkSync(abs))) };
  // A folder without its own .git is an uninitialized submodule when the index holds a gitlink
  // for it (its commit is the index entry); otherwise a file was replaced by a folder and is gone.
  if (st.isDirectory() && !fs.existsSync(path.join(abs, ".git"))) {
    const m = /^160000 ([0-9a-f]+) 0\t/.exec(git(root, ["ls-files", "-s", "-z", "--", `:(literal)${p}`]).toString("utf8"));
    if (!m) return { kind: null, mode: null, bytes: null };
    return { kind: "submodule", mode: "160000", dirty: null, bytes: Buffer.from(`Subproject commit ${m[1]}\n`) };
  }
  if (st.isDirectory()) {
    // Hash of its status and diff, so further edits inside it still change the scope hash.
    const status = git(abs, ["status", "--porcelain", "--untracked-files=all"]);
    const dirty = status.length ? sha256(Buffer.concat([status, git(abs, ["diff", "HEAD"])])) : null;
    return { kind: "submodule", mode: "160000", dirty, bytes: Buffer.from(`Subproject commit ${gitText(abs, ["rev-parse", "HEAD"])}\n`) };
  }
  // With core.fileMode false (the Windows default) git takes a file's mode from the index, and
  // an untracked file would be added as 100644.
  const mode = indexModes ? (indexModes.get(p) ?? "100644") : st.mode & 0o100 ? "100755" : "100644";
  return { kind: "file", mode, bytes: fs.readFileSync(abs) };
}

// Every path that differs between baseSha and the working tree, untracked files included,
// classified by content. Shared by snapshot and --verify.
function collect(root, baseSha, excluded) {
  const changes = new Map();
  const tokens = git(root, ["diff", "--no-renames", "--name-status", "-z", baseSha, "--"]).toString("utf8").split("\0");
  for (let i = 0; i + 1 < tokens.length; i += 2) changes.set(tokens[i + 1], false);
  for (const p of git(root, ["ls-files", "--others", "--exclude-standard", "-z"]).toString("utf8").split("\0")) if (p) changes.set(p, true);
  // Drop excluded paths before any of their content is read.
  for (const p of changes.keys()) if (excluded.some((x) => within(p, x))) changes.delete(p);

  const tree = new Map();
  for (const line of git(root, ["ls-tree", "-r", "-z", "--full-tree", baseSha]).toString("utf8").split("\0")) {
    const m = /^(\d+) (\w+) ([0-9a-f]+)\t(.*)$/s.exec(line);
    if (m && changes.has(m[4])) tree.set(m[4], { mode: m[1], type: m[2], sha: m[3] });
  }
  const blobs = readBlobs(root, [...new Set([...tree.values()].filter((t) => t.type === "blob").map((t) => t.sha))]);
  let indexModes = null;
  if (gitText(root, ["config", "--type=bool", "--default=true", "core.fileMode"]) === "false") {
    indexModes = new Map();
    for (const line of git(root, ["ls-files", "-s", "-z"]).toString("utf8").split("\0")) {
      const m = /^(\d+) [0-9a-f]+ \d\t(.*)$/s.exec(line);
      if (m && changes.has(m[2])) indexModes.set(m[2], m[1]);
    }
  }

  const entries = [];
  const uncovered = [];
  for (const [p, untracked] of [...changes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (excluded.some((x) => within(p, x))) continue;
    if (p.endsWith("/")) {
      uncovered.push(`nested repository, not snapshotted: ${p}`);
      continue;
    }
    const t = tree.get(p);
    const base = !t ? null : t.type === "commit" ? Buffer.from(`Subproject commit ${t.sha}\n`) : blobs.get(t.sha);
    const baseKind = !t ? null : t.type === "commit" ? "submodule" : t.mode === "120000" ? "symlink" : "file";
    const head = readHead(root, p, indexModes);
    if (base === null && head.bytes === null) continue; // staged add since deleted from disk
    // Edits inside a submodule are not captured; the commit it points at is.
    if (head.dirty) uncovered.push(`submodule with uncommitted changes, only its commit is snapshotted: ${p}`);
    const binary = isBinary(base) || isBinary(head.bytes);
    let status = base === null ? "added" : head.bytes === null ? "deleted" : "modified";
    if (status === "modified" && base.equals(head.bytes)) status = "mode-only";
    else if (status === "modified" && !binary && toLF(base).equals(toLF(head.bytes))) status = "eol-only";
    entries.push({
      path: p,
      status,
      untracked,
      kind: head.kind ?? baseKind,
      baseMode: t?.mode ?? null,
      headMode: head.mode,
      submoduleDirtyHash: head.dirty ?? null,
      binary,
      baseSha256: base === null ? null : sha256(base),
      headSha256: head.bytes === null ? null : sha256(head.bytes),
      baseBytes: base?.length ?? null,
      headBytes: head.bytes?.length ?? null,
      eol: { base: binary ? null : eolOf(base), head: binary ? null : eolOf(head.bytes) },
      _base: base,
      _head: head.bytes,
    });
  }
  const scopeHash = sha256(JSON.stringify([baseSha, entries.map((e) => [e.path, e.status, e.baseMode, e.headMode, e.baseSha256, e.headSha256, e.submoduleDirtyHash]), uncovered]));
  return { entries, uncovered, scopeHash };
}

// Patch and page text is handled as latin1 strings: one character per byte, so non-UTF-8
// content survives byte for byte and a string's length is its size in bytes.
const BYTES = "latin1";
const lineCount = (t) => (t.match(/\n/g)?.length ?? 0) + (t && !t.endsWith("\n") ? 1 : 0);

// Splits byte text into pages of at most `limit` bytes and `maxLines` lines, cutting between
// lines and inside a line only when that line alone is over the limit. Returns
// [{text, from, to}] with 1-based line numbers.
function paginate(text, limit, maxLines = MAX_LINES) {
  if (limit < 64 || maxLines < 1) throw new Error("page budget too small; raise --part-kb");
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const pages = [];
  let cur = [];
  let size = 0;
  let from = 1;
  const flush = (to) => {
    if (cur.length) pages.push({ text: cur.join(""), from, to });
    cur = [];
    size = 0;
  };
  lines.forEach((line, i) => {
    const n = i + 1;
    if (size + line.length > limit || cur.length >= maxLines) flush(n - 1);
    if (!cur.length) from = n;
    while (line.length > limit) {
      let end = limit;
      while (end > 0 && (line.charCodeAt(end) & 0xc0) === 0x80) end--; // keep UTF-8 sequences whole
      if (end === 0) end = limit;
      cur.push(line.slice(0, end));
      flush(n);
      from = n;
      line = line.slice(end);
    }
    cur.push(line);
    size += line.length;
  });
  flush(lines.length);
  return pages;
}

function writeFile(file, data, encoding = "utf8") {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data, encoding);
  return slash(file);
}

const fromBytes = (s) => Buffer.from(s, BYTES).toString("utf8");

// Undoes git's C-style quoting of one path token given as byte text.
function unquote(s) {
  const esc = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11 };
  const bytes = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "\\") bytes.push(s.charCodeAt(i));
    else if (/[0-7]/.test(s[i + 1])) {
      bytes.push(parseInt(s.slice(i + 1, i + 4), 8));
      i += 3;
    } else bytes.push(esc[s[++i]] ?? s.charCodeAt(i));
  }
  return Buffer.from(bytes).toString("utf8");
}

// Runs git diff --no-index over base/ and head/, strips the base/ and head/ folder names from
// file headers, and returns one section per file with the path it covers.
function diffSnapshot(out) {
  const raw = git(out, [
    "-c", "core.quotePath=false", "-c", "core.autocrlf=false", "-c", "core.safecrlf=false",
    "diff", "--no-index", "--no-renames", "--no-ext-diff", "--no-color", "--no-textconv", "--text",
    "--src-prefix=a/", "--dst-prefix=b/", "base", "head",
  ], { ok: [0, 1] }).toString(BYTES);
  const sections = [];
  let header = false;
  for (const line of raw.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    if (line.startsWith("diff --git ")) {
      header = true;
      // "a/<4-char folder>/P b/<4-char folder>/P", or the same with each side quoted.
      const rest = line.slice(11).replace(/\n$/, "");
      let p;
      let text;
      if (rest.startsWith('"')) {
        const m = /^"a\/(?:base|head)\/((?:[^"\\]|\\.)*)" "b\/(?:base|head)\//.exec(rest);
        if (!m) throw new Error(`unexpected diff header: ${fromBytes(rest)}`);
        p = unquote(m[1]);
        text = `diff --git "a/${m[1]}" "b/${m[1]}"\n`;
      } else {
        const raw = rest.slice(7, 7 + (rest.length - 15) / 2);
        p = fromBytes(raw);
        text = `diff --git a/${raw} b/${raw}\n`;
      }
      sections.push({ path: p, text });
      continue;
    }
    if (line.startsWith("@@")) header = false;
    const fixed = header ? line.replace(/^(--- |\+\+\+ )("?[ab]\/)(?:base|head)\//, "$1$2") : line;
    sections[sections.length - 1].text += fixed;
  }
  return sections;
}

// Patch pages: whole file sections packed together while they fit; a section over the limit
// is cut at hunk boundaries, then at lines, with its file header repeated on every piece
// unless the header itself takes more than half a page.
function patchParts(sections, limit) {
  const units = [];
  for (const s of sections) {
    if (s.text.length <= limit && lineCount(s.text) <= MAX_LINES) {
      units.push({ text: s.text, paths: [s.path] });
      continue;
    }
    const lines = s.text.match(/[^\n]*\n|[^\n]+$/g);
    const first = Math.max(1, lines.findIndex((l) => l.startsWith("@@")));
    const head = lines.slice(0, first).join("");
    if (head.length > limit / 2 || first > MAX_LINES / 2) {
      for (const page of paginate(s.text, limit)) units.push({ text: page.text, paths: [s.path] });
      continue;
    }
    const hunks = [];
    for (const l of lines.slice(first)) {
      if (l.startsWith("@@") || !hunks.length) hunks.push("");
      hunks[hunks.length - 1] += l;
    }
    for (const hunk of hunks) {
      for (const page of paginate(hunk, limit - head.length, MAX_LINES - first)) units.push({ text: head + page.text, paths: [s.path] });
    }
  }
  const parts = [];
  for (const u of units) {
    const last = parts[parts.length - 1];
    const joined = last && last.text + u.text;
    if (last && joined.length <= limit && lineCount(joined) <= MAX_LINES) {
      last.text = joined;
      for (const p of u.paths) if (!last.paths.includes(p)) last.paths.push(p);
    } else parts.push({ text: u.text, paths: [...u.paths] });
  }
  return parts;
}

// --- JS/TS import closure ------------------------------------------------------------------

const JS = /\.(?:[cm]?[jt]sx?)$/;
const EXTS = [".ts", ".tsx", ".mts", ".cts", ".d.ts", ".js", ".jsx", ".mjs", ".cjs", ".json"];
// Static `import ... from "x"` and `import "x"` are found by importStatements, which bounds its
// look-ahead; a single regex for them backtracks badly on long whitespace runs.
const IMPORT_RES = [
  /\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s+from\s+["']([^"'\n]+)["']/g,
  /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
];

// Code with comments blanked out (newlines kept, so positions and line numbers hold). Strings and
// regex literals are copied whole, so "/*" inside either is not a comment. Single and double
// quoted strings and regex literals end at a line break; template literals span lines, and the
// code inside their `${...}` is scanned as code. A "/" starts a regex literal where an operand is
// expected: at the start, after an operator or opening bracket, after a keyword such as `return`,
// or after the closing parenthesis of `if`, `while`, `for` or `with`. A "/*" never closed is not
// a comment (that would be a syntax error), so a misread cannot blank the rest of the file.
const REGEX_AFTER = new Set("(,=:[!&|?{};+-*%<>~^".split(""));
const REGEX_KEYWORDS = new Set(["return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "yield", "await", "instanceof"]);
const CONTROL = new Set(["if", "while", "for", "with"]);
function stripComments(text) {
  let out = "";
  let quote = null;
  // The last significant character outside comments, and the identifier it ends, if any.
  let last;
  let token = "";
  let inWord = false;
  // Open "(" with the identifier before each; true after a control statement's ")".
  const parens = [];
  let afterControl = false;
  // Brace depth in code, and the depth at which each open `${` returns to its template.
  let depth = 0;
  const templates = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      // Template text is blanked too: an import path is never written in backticks, so example
      // code inside a template (generated files, fixtures) is not read as imports.
      const keep = quote !== "`" || c === "`" || c === "\n" || (c === "$" && text[i + 1] === "{");
      out += keep ? c : " ";
      if (c === "\\") out += quote === "`" ? (text[++i] === "\n" ? "\n" : " ") : (text[++i] ?? "");
      else if (quote === "`" && c === "$" && text[i + 1] === "{") {
        out += "{";
        i++;
        templates.push(depth++);
        [quote, last, token, inWord, afterControl] = [null, "{", "", false, false];
      } else if (c === quote || (c === "\n" && quote !== "`")) quote = null;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i);
      const stop = end < 0 ? text.length : end;
      out += " ".repeat(stop - i);
      i = stop - 1;
      inWord = false;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end >= 0) {
        out += text.slice(i, end + 2).replace(/[^\n]/g, " ");
        i = end + 1;
        inWord = false;
        continue;
      }
    }
    if (c === "/" && (last === undefined || REGEX_AFTER.has(last) || REGEX_KEYWORDS.has(token) || (last === ")" && afterControl))) {
      let j = i + 1;
      let inClass = false;
      for (; j < text.length && text[j] !== "\n"; j++) {
        if (text[j] === "\\") j++;
        else if (text[j] === "[") inClass = true;
        else if (text[j] === "]") inClass = false;
        else if (text[j] === "/" && !inClass) break;
      }
      const stop = Math.min(j + 1, text.length);
      out += text.slice(i, stop);
      i = stop - 1;
      [last, token, inWord, afterControl] = [")", "", false, false]; // a regex literal is an operand
      continue;
    }
    if (c === "}" && templates.length && depth - 1 === templates.at(-1)) {
      out += c;
      depth--;
      templates.pop();
      quote = "`";
      continue;
    }
    out += c;
    if (/[\w$]/.test(c)) {
      token = inWord ? token + c : c;
      inWord = true;
      last = c;
      afterControl = false;
      continue;
    }
    inWord = false;
    if (/\s/.test(c)) continue;
    afterControl = false;
    if (c === "(") parens.push(token);
    else if (c === ")") afterControl = CONTROL.has(parens.pop());
    else if (c === "{") depth++;
    else if (c === "}") depth = Math.max(0, depth - 1);
    [last, token] = [c, ""];
    if (c === '"' || c === "'" || c === "`") [quote, last] = [c, ")"]; // a string is an operand
  }
  return out;
}

function importsOf(text) {
  const code = stripComments(text);
  const breaks = [];
  for (let i = code.indexOf("\n"); i >= 0; i = code.indexOf("\n", i + 1)) breaks.push(i);
  // 1-based line of an offset: one more than the number of line breaks before it.
  const lineAt = (at) => {
    let lo = 0;
    let hi = breaks.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (breaks[mid] < at) lo = mid + 1;
      else hi = mid;
    }
    return lo + 1;
  };
  const found = [];
  for (const re of IMPORT_RES) {
    for (const m of code.matchAll(re)) found.push({ specifier: m[1], line: lineAt(m.index) });
  }
  // `import "x"`, or `import <bindings> from "x"` where the bindings hold only names, braces,
  // commas, `*` and whitespace, within LOOK characters of the keyword. A longer run is reported
  // with a null specifier so the caller can list it as not checked.
  const LOOK = 20000;
  const clause = /[\w$*{},\s]/;
  // Not after a quote, "-", "." or "$": skips text such as '--import' and obj.import.
  for (const m of code.matchAll(/(?<![\w$.'"`-])import\b/g)) {
    let i = m.index + 6;
    const stop = Math.min(code.length, i + LOOK);
    while (i < stop && /\s/.test(code[i])) i++;
    if (code[i] === '"' || code[i] === "'") {
      const s = /["']([^"'\n]+)["']/y;
      s.lastIndex = i;
      const q = s.exec(code);
      if (q && q[0][0] === q[0].at(-1)) found.push({ specifier: q[1], line: lineAt(m.index) });
      continue;
    }
    if (i === m.index + 6) continue; // no whitespace after the keyword: `import(`, `import.meta`
    for (; i < stop && clause.test(code[i]); i++) {
      if (code.startsWith("from", i) && /\W/.test(code[i - 1]) && !/[\w$]/.test(code[i + 4] ?? "")) {
        const s = /from\s*["']([^"'\n]+)["']/y;
        s.lastIndex = i;
        const q = s.exec(code);
        // A binding named `from` (`import { from } from "x"`) is not followed by a string.
        if (q) {
          found.push({ specifier: q[1], line: lineAt(m.index) });
          break;
        }
      }
    }
    if (i === stop && stop < code.length) found.push({ specifier: null, line: lineAt(m.index) });
  }
  return found;
}

// Files a root-relative target may resolve to. The "<dir>/package.json" + ENTRY item stands for
// the files that folder's package.json entry fields name; dependencyNote expands it. The marker
// keeps it apart from an import that names a package.json file itself.
const ENTRY = "?entry";
function variants(target) {
  const list = [target, ...EXTS.map((e) => target + e), ...EXTS.map((e) => `${target}/index${e}`), `${target}/package.json${ENTRY}`];
  // A ".js"-style import may name a TypeScript source or declaration file.
  const swap = { ".js": [".ts", ".tsx", ".d.ts"], ".jsx": [".tsx", ".d.ts"], ".mjs": [".mts", ".d.mts"], ".cjs": [".cts", ".d.cts"] }[path.posix.extname(target)];
  if (swap) list.push(...swap.map((e) => target.slice(0, -path.posix.extname(target).length) + e));
  return list;
}

const candidates = (fromPath, spec) => variants(path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), spec.replace(/[?#].*$/, ""))));

// Folders from the importing file's folder up to the root, as root-relative paths ("." last).
function ancestors(fromPath) {
  const dirs = [];
  for (let dir = path.posix.dirname(fromPath); ; dir = path.posix.dirname(dir)) {
    dirs.push(dir);
    if (dir === ".") return dirs;
  }
}

// JSON with comments and trailing commas, as tsconfig allows.
function parseJsonc(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      const end = /"(?:[^"\\]|\\.)*"/y;
      end.lastIndex = i;
      const m = end.exec(text);
      if (!m) throw new Error("unterminated string");
      out += m[0];
      i += m[0].length - 1;
    } else if (c === "/" && text[i + 1] === "/") i = text.indexOf("\n", i) < 0 ? text.length : text.indexOf("\n", i) - 1;
    else if (c === "/" && text[i + 1] === "*") i = text.indexOf("*/", i + 2) < 0 ? text.length : text.indexOf("*/", i + 2) + 1;
    else out += c;
  }
  // Comments are gone and strings were copied whole, so a comma before } or ] here is trailing.
  let json = "";
  const closes = /\s*[}\]]/y;
  for (let i = 0; i < out.length; i++) {
    closes.lastIndex = i + 1;
    if (out[i] === '"') {
      const end = /"(?:[^"\\]|\\.)*"/y;
      end.lastIndex = i;
      const m = end.exec(out);
      json += m[0];
      i += m[0].length - 1;
    } else if (out[i] !== "," || !closes.test(out)) json += out[i];
  }
  return JSON.parse(json.replace(/^\uFEFF/, ""));
}

// The file an `extends` entry names: a relative or absolute path (".json" optional), or a
// package path looked up in node_modules folders above the config. Null when none is readable.
function extendsTarget(dir, spec) {
  spec = spec.replaceAll("\\", "/");
  const tries = [];
  if (/^\.{1,2}(?:\/|$)/.test(spec) || path.isAbsolute(spec)) {
    const f = path.resolve(dir, spec);
    tries.push(f, `${f}.json`);
  } else {
    for (let d = dir; ; d = path.dirname(d)) {
      const f = path.join(d, "node_modules", spec);
      // A bare package name may point at its config through package.json "tsconfig".
      try {
        const named = JSON.parse(fs.readFileSync(path.join(f, "package.json"), "utf8").replace(/^\uFEFF/, "")).tsconfig;
        if (typeof named === "string") tries.push(path.resolve(f, named));
      } catch {}
      tries.push(f, `${f}.json`, path.join(f, "tsconfig.json"));
      if (path.dirname(d) === d) break;
    }
  }
  return (
    tries.find((f) => {
      try {
        return fs.statSync(f).isFile();
      } catch {
        return false;
      }
    }) ?? null
  );
}

// `baseUrl` and `paths` after applying a config's `extends` chain (later entries and the config
// itself override earlier ones), each with the folder of the config that set it. `incomplete`
// is true when a config in the chain could not be read.
function effectiveOptions(file, seen) {
  if (seen.has(file)) return { incomplete: true }; // extends cycle
  let json;
  try {
    json = parseJsonc(fs.readFileSync(file, "utf8"));
  } catch {
    return { incomplete: true };
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) return { incomplete: true };
  const dir = path.dirname(file);
  const out = { incomplete: false };
  for (const spec of json.extends === undefined ? [] : [].concat(json.extends)) {
    const target = extendsTarget(dir, String(spec));
    const o = target ? effectiveOptions(target, new Set([...seen, file])) : { incomplete: true };
    if (o.baseUrl) out.baseUrl = o.baseUrl;
    if (o.paths) out.paths = o.paths;
    out.incomplete ||= o.incomplete;
  }
  const opts = json.compilerOptions ?? {};
  if (typeof opts.baseUrl === "string") out.baseUrl = { value: opts.baseUrl.replaceAll("\\", "/"), dir };
  if (opts.paths && typeof opts.paths === "object") out.paths = { value: opts.paths, dir };
  return out;
}

// Path aliases for a file, from the nearest tsconfig.json (or jsconfig.json) above it, as
// TypeScript picks it: { root, base, configDir, paths, incomplete }, where `base` is the absolute
// folder alias targets resolve from (`baseUrl` when set, else the folder of the config that set
// `paths`) and `configDir` is the picked config's folder, which `${configDir}` in `baseUrl` or a
// target stands for even when an extended config set it. Null when no config applies or none in
// the chain sets `paths` or `baseUrl` and the chain was read whole.
function pathAliases(root, fromPath, cache) {
  let config = null;
  for (const dir of ancestors(fromPath)) {
    const key = `dir:${dir}`;
    if (!cache.has(key)) cache.set(key, ["tsconfig.json", "jsconfig.json"].map((n) => path.join(root, dir, n)).find((f) => fs.existsSync(f)) ?? null);
    config = cache.get(key);
    if (config) break;
  }
  if (!config) return null;
  if (!cache.has(config)) {
    const o = effectiveOptions(config, new Set());
    const configDir = slash(path.dirname(config));
    const base = o.baseUrl ? path.resolve(o.baseUrl.dir, o.baseUrl.value.replaceAll("${configDir}", () => configDir)) : o.paths?.dir;
    const found = o.paths || o.baseUrl;
    cache.set(config, found ? { root, base, configDir, paths: o.paths?.value ?? null, baseUrl: !!o.baseUrl, incomplete: o.incomplete } : o.incomplete ? { incomplete: true } : null);
  }
  return cache.get(config);
}

// A target path made root-relative, or kept absolute when it lies outside the root.
function underRoot(root, abs) {
  const rel = path.relative(root, abs);
  return leaves(rel) ? slash(abs) : slash(rel) || ".";
}

// Root-relative files an alias specifier may resolve to, or null when no alias matches. As in
// TypeScript, an exact key wins, then the wildcard key with the longest prefix before its "*".
// With `baseUrl` set and no key matching, a bare specifier is tried under `baseUrl`.
function aliasCandidates(aliases, spec) {
  // Drop a query or hash suffix; a leading "#" is part of the name (`#utils`).
  const cut = spec.slice(1).search(/[?#]/);
  if (cut >= 0) spec = spec.slice(0, cut + 1);
  let best = null;
  for (const [key, targets] of Object.entries(aliases.paths ?? {})) {
    const star = key.indexOf("*");
    if (star < 0) {
      if (spec === key) {
        best = { key, targets, capture: "" };
        break;
      }
      continue;
    }
    const [pre, post] = [key.slice(0, star), key.slice(star + 1)];
    const hit = spec.length >= pre.length + post.length && spec.startsWith(pre) && spec.endsWith(post);
    if (hit && (!best || pre.length > best.pre.length)) best = { key, pre, targets, capture: spec.slice(pre.length, spec.length - post.length) };
  }
  if (!best && aliases.baseUrl && !spec.startsWith("/")) return { key: "baseUrl", baseUrl: true, list: variants(underRoot(aliases.root, path.resolve(aliases.base, spec))) };
  if (!best || !Array.isArray(best.targets)) return null;
  // Targets may be absolute (a drive-letter path on Windows); outside the root they stay absolute.
  const list = best.targets.flatMap((t) => {
    // Replacement callbacks keep "$&" and similar in names literal.
    const target = String(t).replaceAll("\\", "/").replaceAll("${configDir}", () => aliases.configDir);
    return variants(underRoot(aliases.root, path.resolve(aliases.base, target.replace("*", () => best.capture))));
  });
  return { key: best.key, list };
}

// Package lookup: true when `name` is installed or declared in a package.json from the file's
// folder up to the root. With `scope` set, true when any package of that scope is.
function packageDeclared(root, fromPath, name, scope = false) {
  for (const dir of ancestors(fromPath)) {
    const base = path.join(root, dir);
    if (fs.existsSync(path.join(base, "node_modules", name))) return true;
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(base, "package.json"), "utf8").replace(/^\uFEFF/, ""));
      const names = [pkg.name, ...["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].flatMap((k) => Object.keys(pkg[k] ?? {}))];
      if (names.some((n) => (scope ? n?.startsWith(`${name}/`) : n === name))) return true;
    } catch {}
  }
  return false;
}

// `excluded`: root-relative paths left out of the scope, the snapshot folder among them.
function dependencyNote(root, entries, excluded) {
  const isFile = (p) => {
    try {
      return fs.statSync(path.resolve(root, p)).isFile();
    } catch {
      return false;
    }
  };
  const unresolvedDeps = [];
  const unchecked = [];
  const configs = new Map();
  const unread = "the tsconfig.json or jsconfig.json, or a config it extends, could not be read";
  const scheme = (s) => /^[a-z][\w+.-]*:/i.test(s);
  const nameOf = (s) => s.split("/").slice(0, s.startsWith("@") ? 2 : 1).join("/");
  // A bare specifier no alias resolves still loads from packages, as in TypeScript. A built-in
  // is checked with its subpath (`fs/promises` is one, `fs/not-real` is not).
  const isPackage = (from, s) => !s.startsWith("/") && (isBuiltin(s) || packageDeclared(root, from, nameOf(s)));
  // Replaces each folder package.json item (see variants) with the files its entry fields name
  // (types, typings, main, module, and string targets under exports "."). A package.json without
  // them adds nothing: the folder's index files are already candidates. A missing package.json
  // stays as its own path, so the deleted-file scan still sees a deleted one.
  const expand = (list) =>
    list.flatMap((c) => {
      if (!c.endsWith(ENTRY)) return [c];
      const file = c.slice(0, -ENTRY.length);
      let pkg;
      try {
        pkg = JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8").replace(/^\uFEFF/, ""));
      } catch {
        return fs.existsSync(path.resolve(root, file)) ? [] : [file];
      }
      const dot = pkg?.exports?.["."] ?? (typeof pkg?.exports === "string" ? pkg.exports : null);
      const strings = (v, depth = 0) => (typeof v === "string" ? [v] : v && typeof v === "object" && depth < 4 ? Object.values(v).flatMap((x) => strings(x, depth + 1)) : []);
      const fields = [pkg?.types, pkg?.typings, pkg?.main, pkg?.module, ...strings(dot)].filter((f) => typeof f === "string");
      const dir = file.slice(0, -"/package.json".length);
      return fields.flatMap((f) => variants(path.posix.normalize(path.posix.join(dir, f.replaceAll("\\", "/")))).filter((x) => !x.endsWith(ENTRY)));
    });
  // How a relative or tsconfig/jsconfig alias specifier resolves: { relative, baseUrl, key, list,
  // incomplete }, where `list` holds the root-relative files it may name. Null when no alias
  // applies and the config chain was read whole.
  const local = (from, s) => {
    if (s.startsWith(".")) return { relative: true, list: expand(candidates(from, s)) };
    const aliases = pathAliases(root, from, configs);
    if (!aliases) return null;
    const hit = (aliases.paths || aliases.baseUrl) && aliasCandidates(aliases, s);
    return hit ? { key: hit.key, baseUrl: hit.baseUrl, list: expand(hit.list), incomplete: aliases.incomplete } : aliases.incomplete ? { incomplete: true } : null;
  };
  const changed = entries.filter((e) => JS.test(e.path) && !e.binary && (e.status === "added" || e.status === "modified"));
  for (const e of changed) {
    for (const { specifier: s, line } of importsOf(toLF(e._head).toString("utf8"))) {
      if (s === null) {
        unchecked.push({ from: e.path, line, specifier: "import", reason: "import bindings longer than 20,000 characters; not read" });
        continue;
      }
      const at = { from: e.path, line, specifier: s };
      if (scheme(s)) {
        if (s.startsWith("node:") && !isBuiltin(s)) unresolvedDeps.push({ ...at, reason: "not a Node built-in" });
        continue;
      }
      let files = local(e.path, s);
      if (files?.list?.some(isFile)) continue;
      // Nothing under baseUrl: classify the specifier as a package import.
      if (files?.baseUrl) files = files.incomplete ? { incomplete: true } : null;
      if (files?.relative) {
        unresolvedDeps.push({ ...at, reason: "no file at this relative path" });
        continue;
      }
      if (isPackage(e.path, s)) continue;
      const name = nameOf(s);
      const scope = s.startsWith("@") && name.split("/")[0];
      if (files?.list && files.incomplete) unchecked.push({ ...at, reason: `no file at path alias "${files.key}", but ${unread}` });
      else if (files?.list) unresolvedDeps.push({ ...at, reason: `no file at path alias "${files.key}"` });
      else if (files?.incomplete) unchecked.push({ ...at, reason: `not resolved: ${unread}` });
      else if (isBuiltin(name)) unresolvedDeps.push({ ...at, reason: `not a Node built-in: "${name}" has no such subpath` });
      else if (/^(?:@\/|[~#/$])/.test(s)) unchecked.push({ ...at, reason: "path alias not set in tsconfig.json or jsconfig.json, or an absolute path" });
      // No package of this scope anywhere: more likely a bundler alias (vite, webpack) than a
      // missing package.
      else if (scope && !packageDeclared(root, e.path, scope, true)) unchecked.push({ ...at, reason: `no package of scope ${scope} is declared; likely a bundler alias, not resolved` });
      else unresolvedDeps.push({ ...at, reason: `package "${name}" is not declared in a package.json up to the root and not installed` });
    }
  }
  // Workspace files that imported a file this change deletes.
  // Keyed by FOLD, so `./foo` matches a deleted `Foo.ts` where the file system ignores case.
  const deleted = new Map(entries.filter((e) => e.status === "deleted").map((e) => [FOLD(e.path), e.path]));
  let scanned = 0;
  if (deleted.size) {
    const all = git(root, ["ls-files", "-co", "--exclude-standard", "-z"]).toString("utf8").split("\0");
    const changedSet = new Set(changed.map((e) => e.path));
    for (const p of all) {
      if (!JS.test(p) || changedSet.has(p) || excluded.some((x) => within(p, x)) || !isFile(p)) continue;
      const file = path.join(root, p);
      if (fs.statSync(file).size > 1 << 20) continue;
      scanned++;
      for (const { specifier: s, line } of importsOf(fs.readFileSync(file, "utf8"))) {
        const files = s === null || scheme(s) ? null : local(p, s);
        const gone = deleted.get(FOLD(files?.list?.find((x) => deleted.has(FOLD(x))) ?? ""));
        if (!gone || files.list.some(isFile) || (!files.relative && isPackage(p, s))) continue;
        const at = { from: p, line, specifier: s };
        // An unread config could override the alias, so the break is not certain.
        if (files.incomplete) unchecked.push({ ...at, reason: `may import ${gone}, which this change deletes, but ${unread}` });
        else unresolvedDeps.push({ ...at, reason: `imports ${gone}, which this change deletes` });
      }
    }
  }
  return {
    scope: "JS/TS import statements only (import, export from, dynamic import, require) found by pattern, not a compiler: imports in changed files, plus workspace files importing a deleted file. Path aliases from the nearest tsconfig.json or jsconfig.json, with its `extends` chain, are resolved; aliases set only in a bundler config, re-exported names and type-level breakage are not checked.",
    changedFilesChecked: changed.length,
    workspaceFilesScanned: scanned,
    unresolvedDeps,
    unchecked,
  };
}

// --- brief -----------------------------------------------------------------------------------

function brief(inv) {
  const L = [];
  const kb = (n) => `${Math.ceil(n / 1024)} KB`;
  L.push("# Frozen review snapshot", "");
  L.push(`Scope hash: \`${inv.scopeHash}\``);
  L.push(`Base: \`${inv.base.ref}\` = \`${inv.base.sha}\`${inv.base.mergeBase ? " (merge base with HEAD)" : ""}; HEAD \`${inv.head}\`; taken ${inv.created}`);
  L.push(`Workspace: \`${inv.workspace}\``, `Snapshot: \`${inv.snapshot}\``, "");
  L.push("## How to read this scope", "");
  if (inv.patch.parts.length > 1) {
    L.push(`- The change under review is \`${inv.patch.path}\` (${kb(inv.patch.bytes)}). It is over the page limit: read it through these parts, in order:`);
    for (const p of inv.patch.parts) L.push(`  - \`${p.path}\` (${p.files.length} file${p.files.length === 1 ? "" : "s"}: ${p.files.slice(0, 3).join(", ")}${p.files.length > 3 ? ", ..." : ""})`);
  } else L.push(`- The change under review is \`${inv.patch.path}\` (${kb(inv.patch.bytes)}).`);
  L.push(
    `- Changed files: the post-change copy is under \`${inv.snapshot}/head/\` and the pre-change copy under \`${inv.snapshot}/base/\`. Line endings are LF in both copies and in the patch.`,
    `- Unchanged files (callers, imports, config, tests) are read from the workspace, \`${inv.workspace}\`.`,
    "- Resolve every path against those two locations only, never against another checkout, worktree or clone. When a path is missing from both, report the absolute paths you tried.",
    `- A copy listed with pages below is over ${kb(inv.partLimitBytes)} or ${MAX_LINES} lines: read its pages, or read it with an offset and limit.`,
    "- The snapshot is read-only. If the workspace copy of a changed file differs from the snapshot copy, the snapshot is the scope under review.",
    "",
  );
  const content = inv.files.filter((f) => CONTENT.has(f.status) && !f.binary);
  L.push(`## Changed files (${content.length})`, "");
  for (const f of content) {
    const pages = [...(f.pages.head ?? []), ...(f.pages.base ?? [])];
    const newMode = f.status === "added" && f.headMode && f.headMode !== "100644" ? `, mode ${f.headMode}` : "";
    L.push(`- ${f.status}${f.untracked ? " (untracked)" : ""}: \`${f.path}\`${newMode}`);
    for (const p of pages) L.push(`  - page \`${p.path}\`, lines ${p.lines}`);
  }
  // A dirty submodule on an unchanged commit is listed under "Not covered" instead.
  const modes = inv.files.filter((f) => (f.status === "mode-only" && !f.submoduleDirtyHash) || (f.baseMode && f.headMode && f.baseMode !== f.headMode));
  if (modes.length) {
    L.push("", "## File mode or type changes (not shown in the patch; review them: 100755 is executable, 120000 a symlink, 160000 a submodule)", "");
    for (const f of modes) L.push(`- ${f.status}: \`${f.path}\` (${f.baseMode} to ${f.headMode})`);
  }
  const eol = inv.files.filter((f) => f.status === "eol-only");
  if (eol.length) {
    L.push("", `## Line-ending changes only (${eol.length}; not in the patch; not findings)`, "");
    for (const f of eol.slice(0, 20)) L.push(`- \`${f.path}\` (${f.eol.base} to ${f.eol.head})`);
    if (eol.length > 20) L.push(`- ${eol.length - 20} more, listed in \`${inv.snapshot}/source-inventory.json\``);
  }
  const bin = inv.files.filter((f) => f.binary);
  if (bin.length) {
    L.push("", "## Binary files (hashed, not copied, not in the patch)", "");
    for (const f of bin) L.push(`- ${f.status}: \`${f.path}\` (${f.baseBytes ?? 0} to ${f.headBytes ?? 0} bytes)`);
  }
  if (inv.uncovered.length) {
    L.push("", "## Not covered", "");
    for (const u of inv.uncovered) L.push(`- ${u}`);
  }
  const d = inv.dependencyNote;
  L.push("", "## Dependency note", "", d.scope, "");
  if (!d.unresolvedDeps.length) L.push(`unresolvedDeps: none (${d.changedFilesChecked} changed JS/TS files checked).`);
  else {
    L.push("unresolvedDeps:");
    for (const u of d.unresolvedDeps) L.push(`- \`${u.from}:${u.line}\` imports \`${u.specifier}\`: ${u.reason}`);
  }
  if (d.unchecked.length) L.push("", `Not checked: ${d.unchecked.map((u) => `\`${u.specifier}\` (${u.from}:${u.line})`).join(", ")}`);
  L.push(
    "",
    "## Every finding states",
    "",
    `- \`Scope: ${inv.scopeHash.slice(0, 12)}\`, the first 12 characters of the scope hash above.`,
    "- `Evidence: read-only` when the finding rests on reading files, or `Evidence: executed` plus each command run and its result.",
    "- `Files read:` the absolute paths read for that finding.",
    "",
  );
  return L.join("\n");
}

// --- main ------------------------------------------------------------------------------------

function parseArgs(argv) {
  const o = { base: "HEAD", mergeBase: false, root: process.cwd(), out: null, partKb: 48, exclude: [], verify: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--base") o.base = val();
    else if (a === "--merge-base") o.mergeBase = true;
    else if (a === "--root") o.root = val();
    else if (a === "--out") o.out = val();
    else if (a === "--part-kb") o.partKb = Number(val());
    else if (a === "--exclude") o.exclude.push(val());
    else if (a === "--verify") o.verify = val();
    else throw new Error(`unknown argument ${a}`);
  }
  if (!(o.partKb >= 4 && o.partKb <= 256)) throw new Error("--part-kb must be between 4 and 256");
  return o;
}

// Paths inside root, relative and with forward slashes; paths outside root are dropped.
function relInside(root, abs) {
  const rel = path.relative(root, abs);
  return !rel || leaves(rel) ? null : slash(rel);
}

function caseRule(root) {
  return gitText(root, ["config", "--type=bool", "--default=false", "core.ignorecase"]) === "true" ? (p) => p.toLowerCase() : (p) => p;
}

function verify(dir) {
  const inv = JSON.parse(fs.readFileSync(path.join(dir, "source-inventory.json"), "utf8"));
  const root = inv.workspace;
  FOLD = caseRule(root);
  const excluded = [...inv.excluded, relInside(root, path.resolve(dir))].filter(Boolean);
  const now = collect(root, inv.base.sha, excluded);
  const then = new Map(inv.files.map((f) => [f.path, f]));
  const drift = [];
  for (const e of now.entries) {
    const f = then.get(e.path);
    if (!f) drift.push(`new change: ${e.path}`);
    else if (f.headSha256 !== e.headSha256 || f.status !== e.status || f.headMode !== e.headMode || f.submoduleDirtyHash !== e.submoduleDirtyHash) drift.push(`changed since snapshot: ${e.path}`);
    then.delete(e.path);
  }
  for (const p of then.keys()) drift.push(`no longer changed: ${p}`);
  // The copies, pages and patch reviewers read must still be what the snapshot wrote.
  const altered = [];
  for (const a of inv.artifacts ?? []) {
    let now = null;
    try {
      now = sha256(fs.readFileSync(a.path));
    } catch {}
    if (now !== a.sha256) altered.push(`snapshot file ${now === null ? "missing" : "changed"}: ${a.path}`);
  }
  if (!inv.artifacts) altered.push("inventory lists no snapshot file hashes; snapshot files not checked");
  const head = gitText(root, ["rev-parse", "HEAD"]);
  const match = now.scopeHash === inv.scopeHash && !altered.length;
  console.log(JSON.stringify({ match, scopeHash: inv.scopeHash, now: now.scopeHash, headThen: inv.head, headNow: head, drift: [...drift, ...altered] }, null, 1));
  if (!match) process.exitCode = 1;
}

function snapshot(o) {
  const root = path.resolve(gitText(path.resolve(o.root), ["rev-parse", "--show-toplevel"]));
  FOLD = caseRule(root);
  // A tree base (such as the empty tree for a root commit) works for a plain comparison.
  let baseSha;
  try {
    baseSha = gitText(root, ["rev-parse", "--verify", `${o.base}^{commit}`]);
  } catch (e) {
    if (o.mergeBase) throw e;
    baseSha = gitText(root, ["rev-parse", "--verify", `${o.base}^{tree}`]);
  }
  if (o.mergeBase) baseSha = gitText(root, ["merge-base", baseSha, "HEAD"]);
  const head = gitText(root, ["rev-parse", "HEAD"]);
  const out = path.resolve(o.out ?? path.join(root, ".tmp", "review-snapshots", `${new Date().toISOString().replace(/[:.]/g, "-")}-${baseSha.slice(0, 7)}`));
  if (fs.existsSync(out) && fs.readdirSync(out).length) throw new Error(`${slash(out)} is not empty`);
  const excluded = [...new Set([relInside(root, out), ...o.exclude.map((x) => relInside(root, path.resolve(x)))].filter(Boolean))];
  const limit = o.partKb * 1024;

  const { entries, uncovered, scopeHash } = collect(root, baseSha, excluded);
  // Every file reviewers read, with its hash, so --verify can tell when one was altered.
  const artifacts = [];
  const put = (file, data, encoding) => {
    const written = writeFile(file, data, encoding);
    artifacts.push({ path: written, sha256: sha256(fs.readFileSync(file)) });
    return written;
  };
  fs.mkdirSync(path.join(out, "base"), { recursive: true });
  fs.mkdirSync(path.join(out, "head"), { recursive: true });
  const files = entries.map((e) => {
    const f = { ...e, base: null, head: null, workspacePath: slash(path.join(root, e.path)), pages: {} };
    delete f._base;
    delete f._head;
    if (e.binary) return f;
    for (const side of ["base", "head"]) {
      const bytes = e[`_${side}`];
      if (bytes === null) continue;
      const lf = toLF(bytes);
      f[side] = put(path.join(out, side, ...e.path.split("/")), lf);
      const text = lf.toString(BYTES);
      if (lf.length > limit || lineCount(text) > MAX_LINES) {
        const pages = paginate(text, limit);
        f.pages[side] = pages.map((pg, i) => ({
          path: put(path.join(out, "pages", side, ...`${e.path}.part-${String(i + 1).padStart(3, "0")}-of-${String(pages.length).padStart(3, "0")}.txt`.split("/")), pg.text, BYTES),
          lines: `${pg.from}-${pg.to}`,
        }));
      }
    }
    return f;
  });

  const sections = diffSnapshot(out);
  const patchText = sections.map((s) => s.text).join("");
  const patchPath = put(path.join(out, "scope.patch"), patchText, BYTES);
  const inPatch = new Set(sections.map((s) => s.path));
  const required = files.filter((f) => CONTENT.has(f.status) && !f.binary).map((f) => f.path);
  const missing = required.filter((p) => !inPatch.has(p));
  const requiredSet = new Set(required);
  const unexpected = [...inPatch].filter((p) => !requiredSet.has(p));
  if (missing.length || unexpected.length) {
    throw new Error(
      `scope.patch does not match the changed paths; no inventory written.${missing.length ? `\n  missing from the patch: ${missing.join(", ")}` : ""}${unexpected.length ? `\n  in the patch but not a content change: ${unexpected.join(", ")}` : ""}`,
    );
  }
  const parts = patchText.length > limit || lineCount(patchText) > MAX_LINES ? patchParts(sections, limit) : [];
  const partEntries = parts.map((p, i) => ({
    path: put(path.join(out, "scope.patch.parts", `part-${String(i + 1).padStart(3, "0")}-of-${String(parts.length).padStart(3, "0")}.patch`), p.text, BYTES),
    bytes: p.text.length,
    files: p.paths,
  }));

  const inv = {
    tool: ".claude/skills/impartial-review/scripts/snapshot.mjs",
    created: new Date().toISOString(),
    workspace: slash(root),
    snapshot: slash(out),
    base: { ref: o.base, sha: baseSha, mergeBase: o.mergeBase },
    head,
    scopeHash,
    partLimitBytes: limit,
    excluded,
    uncovered,
    patch: { path: patchPath, bytes: patchText.length, sha256: sha256(Buffer.from(patchText, BYTES)), parts: partEntries },
    counts: Object.fromEntries(["added", "modified", "deleted", "eol-only", "mode-only"].map((s) => [s, files.filter((f) => f.status === s).length])),
    files,
    artifacts,
    dependencyNote: dependencyNote(root, entries, excluded),
  };
  inv.counts.binary = files.filter((f) => f.binary).length;
  writeFile(path.join(out, "source-inventory.json"), `${JSON.stringify(inv, null, 1)}\n`);
  writeFile(path.join(out, "BRIEF.md"), brief(inv));
  const c = inv.counts;
  console.log(`snapshot ${slash(out)}`);
  console.log(`scope ${scopeHash}`);
  console.log(`files ${files.length}: ${c.added} added, ${c.modified} modified, ${c.deleted} deleted, ${c["eol-only"]} eol-only, ${c["mode-only"]} mode-only, ${c.binary} binary`);
  console.log(`patch ${inv.patch.bytes} bytes${partEntries.length ? ` in ${partEntries.length} parts` : ""}; unresolvedDeps ${inv.dependencyNote.unresolvedDeps.length}${uncovered.length ? `; uncovered: ${uncovered.join("; ")}` : ""}`);
}

try {
  const o = parseArgs(process.argv.slice(2));
  if (o.verify) verify(o.verify);
  else snapshot(o);
} catch (e) {
  console.error(`snapshot.mjs: ${e.message}`);
  process.exit(1);
}
