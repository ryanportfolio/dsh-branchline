#!/usr/bin/env node
// Detect the project's stacks at the repo root and build a GitHub Actions CI
// workflow for them. /init-project runs this during setup.
//
//   node .claude/scripts/write-ci-workflow.mjs [--root <dir>] [--write] [--force]
//
// Default: print the detected stacks (stderr) and the workflow it would write
// (stdout); write nothing.
// --write: write .github/workflows/ci.yml; refuses if the file exists.
// --force: with --write, replace an existing .github/workflows/ci.yml.
//
// Only the repo root is inspected. Projects in subfolders (monorepos) are not
// detected; edit the generated file for those.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Current major versions, checked with
// gh api repos/<owner>/<action>/releases/latest --jq .tag_name
// astral-sh/setup-uv publishes no floating major tag, so it is pinned to a release.
export const ACTIONS = {
  checkout: "actions/checkout@v7",
  setupNode: "actions/setup-node@v7",
  setupPython: "actions/setup-python@v7",
  setupGo: "actions/setup-go@v7",
  setupUv: "astral-sh/setup-uv@v10.2.0",
  setupPnpm: "pnpm/action-setup@v6",
  setupBun: "oven-sh/setup-bun@v2",
};

const FIRMWARE_CHECK = ".claude/scripts/sync-codex-skills.mjs";
const NPM_DEFAULT_TEST = /no test specified/i;
const TYPECHECK_SCRIPTS = ["typecheck", "type-check", "check-types", "tsc"];
const SKIP_DIRS = new Set(["node_modules", "venv", "env", "__pycache__", "build", "dist", "target", "site-packages"]);

const exists = (root, rel) => fs.existsSync(path.join(root, rel));
const read = (root, rel) => {
  try {
    return fs.readFileSync(path.join(root, rel), "utf8");
  } catch {
    return "";
  }
};
const firstLine = (text) => text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";

function detectNode(root) {
  if (!exists(root, "package.json")) return null;
  let pkg = {};
  try {
    pkg = JSON.parse(read(root, "package.json"));
  } catch {
    pkg = {};
  }
  const scripts = pkg.scripts && typeof pkg.scripts === "object" ? pkg.scripts : {};
  const packageManager = typeof pkg.packageManager === "string" ? pkg.packageManager : "";

  let pm = "npm";
  let lockfile = null;
  if (exists(root, "bun.lock") || exists(root, "bun.lockb")) {
    pm = "bun";
    lockfile = exists(root, "bun.lock") ? "bun.lock" : "bun.lockb";
  } else if (exists(root, "pnpm-lock.yaml")) {
    pm = "pnpm";
    lockfile = "pnpm-lock.yaml";
  } else if (exists(root, "yarn.lock")) {
    pm = "yarn";
    lockfile = "yarn.lock";
  } else if (exists(root, "package-lock.json")) {
    lockfile = "package-lock.json";
  }
  const yarnMajor = Number((packageManager.match(/^yarn@(\d+)/) ?? [])[1] ?? 0);
  const yarnBerry = pm === "yarn" && (yarnMajor >= 2 || exists(root, ".yarnrc.yml"));

  let versionFile = null;
  let version = "lts/*";
  for (const f of [".nvmrc", ".node-version"]) {
    if (exists(root, f)) {
      versionFile = f;
      version = firstLine(read(root, f)) || f;
      break;
    }
  }
  if (!versionFile && typeof pkg.engines?.node === "string") {
    versionFile = "package.json";
    version = pkg.engines.node;
  }

  const run = { npm: "npm run", pnpm: "pnpm run", yarn: "yarn run", bun: "bun run" }[pm];
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  // A root tsconfig with project references (often `files: []`) checks nothing under plain
  // `tsc --noEmit`; build mode checks every referenced project. tsc accepts --noEmit with
  // --build from TypeScript 5.6 and rejects the pair before that (TS5094), so an older or
  // unknown declared version gets plain `tsc -b`, which emits per each project's config.
  // Plain `tsc -b` is also the choice when the references form a chain (see buildNoEmitSafe).
  const [, tsMajor, tsMinor = "0"] = String(deps.typescript ?? "").match(/(\d+)(?:\.(\d+))?/) ?? [];
  const buildNoEmit = Number(tsMajor) > 5 || (Number(tsMajor) === 5 && Number(tsMinor) >= 6);
  // A function, so buildNoEmitSafe (which may run tsc) runs only when this fallback is used.
  const tscCommand = () => {
    const tscArgs = !hasReferences(read(root, "tsconfig.json")) ? "--noEmit" : buildNoEmit && buildNoEmitSafe(root) ? "-b --noEmit" : "-b";
    return `${{ npm: "npx tsc", pnpm: "pnpm exec tsc", yarn: "yarn tsc", bun: "bunx tsc" }[pm]} ${tscArgs}`;
  };

  const commands = [];
  const typecheckScript = TYPECHECK_SCRIPTS.find((s) => typeof scripts[s] === "string");
  if (typecheckScript) commands.push({ name: "Typecheck", run: `${run} ${typecheckScript}` });
  else if (exists(root, "tsconfig.json") && deps.typescript) commands.push({ name: "Typecheck", run: tscCommand() });
  if (typeof scripts.test === "string" && !NPM_DEFAULT_TEST.test(scripts.test)) commands.push({ name: "Test", run: `${run} test` });
  if (typeof scripts.build === "string") commands.push({ name: "Build", run: `${run} build` });

  let install;
  if (pm === "npm") install = lockfile ? "npm ci" : "npm install";
  else if (pm === "pnpm") install = "pnpm install --frozen-lockfile";
  else if (pm === "yarn") install = yarnBerry ? "yarn install --immutable" : "yarn install --frozen-lockfile";
  else install = "bun install --frozen-lockfile";

  return { stack: "node", pm, lockfile, packageManager, yarnBerry, version, versionFile, install, commands };
}

// tsconfig.json is JSON with comments and trailing commas, and may start with a byte order mark.
// Drops all three outside strings: the mark, comments on the first pass, then commas followed only
// by whitespace and a closing bracket.
function stripJsonc(text) {
  text = text.replace(/^\uFEFF/, "");
  const pass = (src, other) => {
    let out = "";
    let quote = false;
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        out += c;
        if (c === "\\") out += src[++i] ?? "";
        else if (c === '"') quote = false;
      } else if (c === '"') {
        quote = true;
        out += c;
      } else {
        const skip = other(src, i);
        if (skip === null) out += c;
        else i = skip;
      }
    }
    return out;
  };
  // Each handler returns null to keep the character, or the index of the last character dropped.
  const comments = (s, i) => {
    if (s[i] !== "/" || (s[i + 1] !== "/" && s[i + 1] !== "*")) return null;
    const close = s[i + 1] === "/" ? s.indexOf("\n", i) : s.indexOf("*/", i + 2);
    if (close < 0) return s.length;
    return s[i + 1] === "/" ? close - 1 : close + 1;
  };
  const trailingCommas = (s, i) => (s[i] === "," && /^\s*[}\]]/.test(s.slice(i + 1)) ? i : null);
  return pass(pass(text, comments), trailingCommas);
}
// True when a tsconfig lists at least one project reference.
function hasReferences(tsconfig) {
  const text = stripJsonc(tsconfig);
  try {
    const refs = JSON.parse(text).references;
    return Array.isArray(refs) && refs.length > 0;
  } catch {
    return /"references"\s*:\s*\[\s*\{/.test(text);
  }
}
// `tsc -b --noEmit` turns off emit in every project, and tsc rejects a project that has input
// files of its own and references another project that does not emit (TS6310). The pair is safe
// only when the root tsconfig has no inputs (`files` and `include` empty or absent, but not both
// absent, counting values inherited through `extends`) and each project it references references
// nothing further: the layout Vite generates. Anything else, or a tsconfig or base that cannot be
// read, gets plain `tsc -b`.
function buildNoEmitSafe(root) {
  const parse = (file) => {
    try {
      return JSON.parse(stripJsonc(fs.readFileSync(file, "utf8")));
    } catch {
      return null;
    }
  };
  const rootConfig = path.join(root, "tsconfig.json");
  // A base path starting `./` or `../`, or an absolute one, is tried as written and then with
  // `.json`, as tsc does. A package base is left to tsc itself (tscInputs): its lookup rules
  // (exports, typesVersions, nested node_modules) are too many to copy reliably.
  let packageBase = false;
  const resolveBase = (from, spec) => {
    if (typeof spec !== "string") return null;
    const s = spec.replaceAll("\\", "/");
    if (!path.isAbsolute(s) && !s.startsWith("./") && !s.startsWith("../")) {
      packageBase = true;
      return null;
    }
    const base = path.resolve(path.dirname(from), s);
    return [base, `${base}.json`].find((f) => fs.existsSync(f) && fs.statSync(f).isFile()) ?? null;
  };
  // The root's `files` and `include` as the project's own TypeScript resolves them, through
  // `tsc --showConfig`. null when TypeScript is not installed in node_modules or tsc fails, for
  // example on a base it cannot find. --showConfig leaves out an empty list and the default
  // `include` alike, so output with neither key counts as no inputs only when the root itself
  // sets `files`, which turns the default `include` off.
  const tscInputs = (top) => {
    const tsc = path.join(root, "node_modules", "typescript", "bin", "tsc");
    if (!fs.existsSync(tsc)) return null;
    const r = spawnSync(process.execPath, [tsc, "-p", rootConfig, "--showConfig"], { cwd: root, encoding: "utf8", timeout: 60_000 });
    let shown;
    try {
      shown = r.status === 0 ? JSON.parse(r.stdout) : null;
    } catch {
      return null;
    }
    if (!shown || (shown.files === undefined && shown.include === undefined && !Array.isArray(top.files))) return null;
    return { files: shown.files ?? [], include: shown.include ?? [] };
  };
  // `files` and `include` as tsc resolves them: a config's own value wins, then the last base that
  // sets it. null when the config or a base it needs cannot be read here.
  const inputs = (file, depth = 0) => {
    const config = depth > 8 ? null : parse(file);
    if (!config) return null;
    const own = { files: config.files, include: config.include };
    for (const spec of [config.extends ?? []].flat().reverse()) {
      if (own.files !== undefined && own.include !== undefined) break;
      const base = resolveBase(file, spec);
      const inherited = base && inputs(base, depth + 1);
      if (!inherited) return null;
      own.files ??= inherited.files;
      own.include ??= inherited.include;
    }
    return own;
  };
  const top = parse(rootConfig);
  if (!top) return false;
  const own = inputs(rootConfig) ?? (packageBase ? tscInputs(top) : null);
  if (!own) return false;
  const empty = (v) => Array.isArray(v) && v.length === 0;
  // Without `include`, `files` decides: absent means every file, `[]` means none.
  const noInputs = own.include === undefined ? empty(own.files) : empty(own.include) && (own.files === undefined || empty(own.files));
  if (!noInputs) return false;
  return top.references.every((ref) => {
    let file = path.resolve(root, String(ref?.path ?? ""));
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "tsconfig.json");
    const project = parse(file);
    return project !== null && !(Array.isArray(project.references) && project.references.length > 0);
  });
}

// Finds test_*.py or *_test.py within a few levels, skipping hidden and build folders.
function hasPythonTestFiles(dir, depth = 0) {
  if (depth > 3) return false;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const e of entries) {
    if (e.isFile() && /^(test_.*|.*_test)\.py$/.test(e.name)) return true;
  }
  for (const e of entries) {
    if (e.isDirectory() && !e.name.startsWith(".") && !SKIP_DIRS.has(e.name) && hasPythonTestFiles(path.join(dir, e.name), depth + 1)) return true;
  }
  return false;
}

function detectPython(root) {
  const rootFiles = fs.readdirSync(root);
  const requirements = rootFiles.filter((f) => /^requirements.*\.txt$/.test(f)).sort();
  const hasPyproject = exists(root, "pyproject.toml");
  const hasSetupPy = exists(root, "setup.py");
  if (!hasPyproject && !hasSetupPy && requirements.length === 0) return null;

  const pyproject = read(root, "pyproject.toml");
  const setupCfg = read(root, "setup.cfg");
  // A tool counts as installed only when its name appears in a dependency list the install step
  // installs. Extras and groups the install step does not select do not count. Neither does a
  // declaration with an environment marker (`pytest; sys_platform == "win32"`): pip and uv skip it
  // when the marker is false, and the generated job runs on ubuntu.
  const mentions = (text, name) => new RegExp(`(^|[^A-Za-z0-9_.[-])${name}([^A-Za-z0-9_.-]|$)`, "m").test(text);
  const unmarkedLines = (text) => text.split(/\r?\n/).filter((l) => !l.includes(";")).join("\n");
  // Double-quoted TOML strings are decoded first, so an escaped `;` still reads as a marker.
  const unmarkedStrings = (toml) =>
    [...toml.matchAll(/"((?:[^"\\\n]|\\.)*)"|'([^'\n]*)'/g)]
      .map((m) => (m[1] === undefined ? m[2] : tomlUnescape(m[1])))
      .filter((s) => !s.includes(";"))
      .join("\n");
  // pip joins backslash-continued lines before it drops comments.
  const requirementsText = (f) => unmarkedLines(read(root, f).replace(/\\\r?\n/g, "").replace(/(^|\s)#.*$/gm, ""));
  const projectDeps = tomlArray(sectionOf(pyproject, "project"), "dependencies");
  const uv = exists(root, "uv.lock");

  let versionFile = null;
  let version = "3.x";
  if (exists(root, ".python-version")) {
    versionFile = ".python-version";
    version = firstLine(read(root, ".python-version")) || version;
  } else {
    const m = pyproject.match(/^\s*requires-python\s*=\s*["']([^"']+)["']/m);
    if (m) {
      versionFile = "pyproject.toml";
      version = m[1];
    }
  }

  let typechecker = null;
  if (/^\s*\[tool\.mypy[\].]/m.test(pyproject) || exists(root, "mypy.ini") || exists(root, ".mypy.ini") || /^\s*\[mypy\]/m.test(read(root, "setup.cfg"))) typechecker = "mypy";
  else if (/^\s*\[tool\.pyright\]/m.test(pyproject) || exists(root, "pyrightconfig.json")) typechecker = "pyright";

  // A tests/ folder alone is not enough: it may hold another stack's tests.
  const hasTests = hasPythonTestFiles(root);
  const commands = [];
  let install = [];
  if (uv) {
    install = ["uv sync --locked"];
    // uv sync installs [project].dependencies and the default groups: dev, unless
    // [tool.uv] default-groups names others. Extras need --extra, so they do not count.
    const toolUv = sectionOf(pyproject, "tool.uv");
    const groups = sectionOf(pyproject, "dependency-groups");
    let synced = [projectDeps];
    if (/^\s*default-groups\s*=\s*["']all["']/m.test(toolUv)) synced.push(groups, tomlArray(toolUv, "dev-dependencies"));
    else {
      const named = tomlArray(toolUv, "default-groups");
      const names = named ? [...named.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]) : ["dev"];
      synced.push(...names.map((g) => tomlArray(groups, g)));
      // Legacy [tool.uv] dev-dependencies belong to the dev group.
      if (names.includes("dev")) synced.push(tomlArray(toolUv, "dev-dependencies"));
    }
    synced = unmarkedStrings(synced.join("\n"));
    const uvRun = (tool) => (mentions(synced, tool) ? `uv run ${tool}` : `uv run --with ${tool} ${tool}`);
    if (typechecker === "mypy") commands.push({ name: "Typecheck", run: `${uvRun("mypy")} .` });
    if (typechecker === "pyright") commands.push({ name: "Typecheck", run: uvRun("pyright") });
    if (hasTests) commands.push({ name: "Test", run: uvRun("pytest") });
  } else {
    install = ["python -m pip install --upgrade pip"];
    const main = requirements.includes("requirements.txt")
      ? ["requirements.txt", ...requirements.filter((f) => /^requirements[-_](dev|test|tests)\.txt$/.test(f))]
      : requirements;
    for (const f of main) install.push(`pip install -r ${shellWord(f)}`);
    const fromPyproject = sectionRange(pyproject, "project").start >= 0;
    const installable = hasSetupPy || fromPyproject || sectionRange(pyproject, "build-system").start >= 0;
    // Package metadata comes from [project] when present, else from setup.cfg. setup.py is
    // Python code and is not parsed, so its dependencies never count as installed.
    const depsOf = fromPyproject ? projectDeps : iniValue(sectionOf(setupCfg, "options"), "install_requires");
    const extraOf = (x) =>
      fromPyproject ? tomlArray(sectionOf(pyproject, "project.optional-dependencies"), x) : iniValue(sectionOf(setupCfg, "options.extras_require"), x);
    const extras = installable ? ["dev", "test", "tests"].filter((x) => extraOf(x).trim()) : [];
    if (installable) install.push(extras.length ? `pip install -e ".[${extras.join(",")}]"` : "pip install -e .");
    // Only what pip installs above counts: other extras and [dependency-groups] are skipped.
    const unmarked = fromPyproject ? unmarkedStrings : unmarkedLines;
    const installedFrom = installable ? [depsOf, ...extras.map(extraOf)].map(unmarked) : [];
    const installed = [...main.map(requirementsText), ...installedFrom].join("\n");
    const extra = [];
    if (hasTests && !mentions(installed, "pytest")) extra.push("pytest");
    if (typechecker && !mentions(installed, typechecker)) extra.push(typechecker);
    if (extra.length) install.push(`pip install ${extra.join(" ")}`);
    if (typechecker === "mypy") commands.push({ name: "Typecheck", run: "mypy ." });
    if (typechecker === "pyright") commands.push({ name: "Typecheck", run: "pyright" });
    if (hasTests) commands.push({ name: "Test", run: "python -m pytest" });
  }
  return { stack: "python", uv, version, versionFile, install, commands, typechecker, hasTests };
}

// Line range of one [section] in a TOML or INI file: its header up to the next header.
// The header may have spaces inside the brackets and a trailing comment.
function sectionRange(toml, name) {
  const lines = toml.split(/\r?\n/);
  const header = new RegExp(`^\\s*\\[\\s*${escapeRegExp(name)}\\s*\\]\\s*([#;].*)?$`);
  const start = lines.findIndex((l) => header.test(l));
  const end = start < 0 ? -1 : lines.findIndex((l, i) => i > start && /^\s*\[/.test(l));
  return { lines, start, end: end < 0 ? lines.length : end };
}
function sectionOf(toml, name) {
  const { lines, start, end } = sectionRange(toml, name);
  return start < 0 ? "" : lines.slice(start + 1, end).join("\n");
}
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Escape sequences of a TOML basic string; an invalid one is left as written.
const TOML_ESCAPES = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", e: "\x1b", '"': '"', "\\": "\\" };
const tomlUnescape = (s) =>
  s.replace(/\\(?:u([0-9A-Fa-f]{4})|U([0-9A-Fa-f]{8})|(.))/g, (m, u4, u8, c) => {
    if (c !== undefined) return TOML_ESCAPES[c] ?? m;
    const cp = parseInt(u4 ?? u8, 16);
    return cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
  });
// POSIX shell word: plain when safe, otherwise single-quoted, so `requirements dev.txt` stays one argument.
const shellWord = (s) => (/^[A-Za-z0-9_./=+-]+$/.test(s) ? s : `'${s.replaceAll("'", "'\\''")}'`);
// Text of the array in `key = [...]` within one TOML section, comments dropped; "" when absent.
function tomlArray(section, key) {
  const m = new RegExp(`^[ \\t]*["']?${escapeRegExp(key)}["']?[ \\t]*=[ \\t]*\\[`, "m").exec(section);
  if (!m) return "";
  let out = "";
  let depth = 0;
  let quote = null;
  for (let i = m.index + m[0].length - 1; i < section.length; i++) {
    const c = section[i];
    if (quote) {
      out += c;
      if (c === "\\" && quote === '"') out += section[++i] ?? "";
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "#") {
      const nl = section.indexOf("\n", i);
      i = nl < 0 ? section.length : nl - 1;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "[") depth++;
    else if (c === "]" && --depth === 0) return out + c;
    out += c;
  }
  return out;
}
// Value of `key = ...` within one INI section, with its indented continuation lines; "" when absent.
function iniValue(section, key) {
  const lines = section.split(/\r?\n/);
  const i = lines.findIndex((l) => new RegExp(`^${escapeRegExp(key)}[ \\t]*[=:]`).test(l));
  if (i < 0) return "";
  const out = [lines[i].replace(/^[^=:]*[=:]/, "")];
  for (const l of lines.slice(i + 1)) {
    if (l.trim() && !/^\s/.test(l)) break;
    if (!/^\s*[#;]/.test(l)) out.push(l);
  }
  return out.join("\n");
}

function detectRust(root) {
  if (!exists(root, "Cargo.toml")) return null;
  const locked = exists(root, "Cargo.lock");
  return {
    stack: "rust",
    locked,
    commands: [
      { name: "Build", run: locked ? "cargo build --locked" : "cargo build" },
      { name: "Test", run: "cargo test" },
    ],
  };
}

function detectGo(root) {
  if (!exists(root, "go.mod")) return null;
  const m = read(root, "go.mod").match(/^go\s+(\S+)/m);
  return {
    stack: "go",
    version: m ? m[1] : null,
    commands: [
      { name: "Vet", run: "go vet ./..." },
      { name: "Build", run: "go build ./..." },
      { name: "Test", run: "go test ./..." },
    ],
  };
}

function defaultBranch(root) {
  const r = spawnSync("git", ["-C", root, "symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], { encoding: "utf8" });
  const ref = r.status === 0 ? r.stdout.trim() : "";
  return ref.startsWith("origin/") ? ref.slice("origin/".length) : "main";
}

export function detect(root) {
  const stacks = [detectNode(root), detectPython(root), detectRust(root), detectGo(root)].filter(Boolean);
  return { stacks, firmware: exists(root, FIRMWARE_CHECK), branch: defaultBranch(root) };
}

// YAML scalar: plain when unambiguous, otherwise single-quoted. No flow indicators ([]{},)
// stay plain, so a value is also safe inside a flow sequence such as `branches: [...]`.
function q(value) {
  const s = String(value);
  if (/^[A-Za-z0-9_./][A-Za-z0-9_./ =-]*$/.test(s) && !/\s$/.test(s) && !/^(true|false|yes|no|on|off|null|~|[0-9.]+)$/i.test(s)) return s;
  return `'${s.replaceAll("'", "''")}'`;
}

// One command stays on the run line; several become a literal block, run in order.
const step = (name, run) =>
  Array.isArray(run) && run.length > 1
    ? [`      - name: ${q(name)}`, "        run: |", ...run.map((r) => `          ${r}`)]
    : [`      - name: ${q(name)}`, `        run: ${q([run].flat()[0])}`];
const uses = (action, withs = {}) => {
  const out = [`      - uses: ${action}`];
  const keys = Object.keys(withs);
  if (keys.length) {
    out.push("        with:");
    for (const k of keys) out.push(`          ${k}: ${q(withs[k])}`);
  }
  return out;
};
const job = (id, name, body) => [`  ${id}:`, `    name: ${q(name)}`, "    runs-on: ubuntu-latest", "    steps:", ...body, ""];

function nodeJob(n) {
  const body = [...uses(ACTIONS.checkout)];
  if (n.pm === "bun") {
    body.push(...uses(ACTIONS.setupBun));
  } else {
    if (n.pm === "pnpm") {
      // pnpm/action-setup reads the version from packageManager in package.json when present.
      body.push(...uses(ACTIONS.setupPnpm, n.packageManager.startsWith("pnpm@") ? {} : { version: "latest" }));
    }
    const withs = n.versionFile ? { "node-version-file": n.versionFile } : { "node-version": n.version };
    const cache = n.lockfile && !n.yarnBerry ? n.pm : null;
    if (cache) withs.cache = cache;
    body.push(...uses(ACTIONS.setupNode, withs));
    if (n.yarnBerry) body.push(...step("Enable Yarn through Corepack", "npm install -g corepack && corepack enable"));
  }
  body.push(...step("Install dependencies", n.install));
  for (const c of n.commands) body.push(...step(c.name, c.run));
  return job("node", "Node", body);
}

function pythonJob(p) {
  const body = [...uses(ACTIONS.checkout)];
  if (p.uv) body.push(...uses(ACTIONS.setupUv));
  else body.push(...uses(ACTIONS.setupPython, p.versionFile ? { "python-version-file": p.versionFile } : { "python-version": p.version }));
  body.push(...step("Install dependencies", p.install));
  for (const c of p.commands) body.push(...step(c.name, c.run));
  return job("python", "Python", body);
}

function rustJob(r) {
  const body = [...uses(ACTIONS.checkout)];
  for (const c of r.commands) body.push(...step(c.name, c.run));
  return job("rust", "Rust", body);
}

function goJob(g) {
  const body = [...uses(ACTIONS.checkout), ...uses(ACTIONS.setupGo, { "go-version-file": "go.mod" })];
  for (const c of g.commands) body.push(...step(c.name, c.run));
  return job("go", "Go", body);
}

export const NOTICE =
  "No build, test or typecheck command was detected. Edit .github/workflows/ci.yml when the project has one.";

export function render(detected) {
  const { stacks, firmware, branch } = detected;
  const runnable = stacks.filter((s) => s.commands.length > 0);
  const lines = [
    "# Generated by /init-project (.claude/scripts/write-ci-workflow.mjs). Safe to edit:",
    "# the script only replaces this file when run with --force.",
    `# Detected at the repo root: ${stacks.length ? stacks.map((s) => s.stack).join(", ") : "nothing"}.`,
    "# Projects in subfolders (monorepos) are not detected; add jobs for them by hand.",
    "",
    "name: CI",
    "",
    "on:",
    "  push:",
    `    branches: [${q(branch)}]`,
    "  pull_request:",
    "",
    "concurrency:",
    "  group: ${{ github.workflow }}-${{ github.ref }}",
    "  cancel-in-progress: true",
    "",
    "permissions:",
    "  contents: read",
    "",
    "jobs:",
  ];
  for (const s of runnable) {
    if (s.stack === "node") lines.push(...nodeJob(s));
    if (s.stack === "python") lines.push(...pythonJob(s));
    if (s.stack === "rust") lines.push(...rustJob(s));
    if (s.stack === "go") lines.push(...goJob(s));
  }
  if (runnable.length === 0) {
    // Says plainly that nothing is checked, instead of a job that passes for no reason.
    lines.push(...job("project", "Project checks (none detected)", step("No project checks detected", `echo "::notice title=No CI commands detected::${NOTICE}"`)));
  }
  if (firmware) {
    lines.push(
      ...job("firmware", "Firmware", [
        ...uses(ACTIONS.checkout),
        ...step("Codex skills registered and in sync with their Claude source", `node ${FIRMWARE_CHECK} --check`),
      ]),
    );
  }
  while (lines.at(-1) === "") lines.pop();
  return `${lines.join("\n")}\n`;
}

export function summarize(detected) {
  const out = [];
  if (detected.stacks.length === 0) out.push("No stack detected at the repo root.");
  for (const s of detected.stacks) {
    let what = s.stack;
    if (s.stack === "node") what += ` (${s.pm}${s.lockfile ? `, ${s.lockfile}` : ", no lockfile"}; Node ${s.version}${s.versionFile ? ` from ${s.versionFile}` : ""})`;
    if (s.stack === "python") what += ` (${s.uv ? "uv" : "pip"}; Python ${s.version}${s.versionFile ? ` from ${s.versionFile}` : ""})`;
    if (s.stack === "rust") what += s.locked ? " (Cargo.lock)" : " (no Cargo.lock)";
    if (s.stack === "go") what += s.version ? ` (Go ${s.version} from go.mod)` : "";
    const cmds = s.commands.map((c) => c.run).join("; ");
    out.push(`- ${what}: ${cmds || "no build, test or typecheck command found"}`);
  }
  out.push(detected.firmware ? `- firmware: node ${FIRMWARE_CHECK} --check` : "- firmware: not present, no firmware job");
  out.push(`- push trigger branch: ${detected.branch}`);
  return out.join("\n");
}

function parseArgs(argv) {
  const opts = { root: process.cwd(), write: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--write") opts.write = true;
    else if (a === "--force") opts.force = true;
    else if (a === "--root" && argv[i + 1]) opts.root = path.resolve(argv[++i]);
    else throw new Error(`Unknown argument: ${a}\nUsage: node .claude/scripts/write-ci-workflow.mjs [--root <dir>] [--write] [--force]`);
  }
  if (opts.force && !opts.write) throw new Error("--force only applies with --write.");
  return opts;
}

export function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  if (!fs.existsSync(opts.root) || !fs.statSync(opts.root).isDirectory()) {
    console.error(`Not a directory: ${opts.root}`);
    return 2;
  }
  const detected = detect(opts.root);
  const yaml = render(detected);
  const target = path.join(opts.root, ".github", "workflows", "ci.yml");
  // The summary goes to stderr so stdout is the workflow alone, ready to redirect and diff.
  console.error("Detected:");
  console.error(summarize(detected));
  if (!opts.write) {
    console.error(`\nWorkflow for .github/workflows/ci.yml (not written; rerun with --write):\n`);
    process.stdout.write(yaml);
    return 0;
  }
  if (fs.existsSync(target) && !opts.force) {
    console.error(`\n.github/workflows/ci.yml already exists; not overwriting. Compare it with the print-mode output, then rerun with --write --force to replace it.`);
    return 1;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, yaml);
  console.log(`\nWrote .github/workflows/ci.yml`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
