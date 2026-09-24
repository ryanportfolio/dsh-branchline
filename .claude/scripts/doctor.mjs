#!/usr/bin/env node

// doctor.mjs: cross-platform install health check for this harness firmware repo.
//
// Verifies the wiring a session depends on: settings + SessionStart hook, skill
// frontmatter, Codex adapter sync, the reference library, leftover template
// markers, and plugin manifests. Reports an approximate always-loaded context
// weight as an INFO line.
//
// Usage: node .claude/scripts/doctor.mjs [--json]
// Exit 0 when nothing FAILs, 1 otherwise. Requires Node >= 18, no dependencies.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..", "..");
const args = new Set(process.argv.slice(2));
const jsonMode = args.has("--json");

for (const arg of args) {
  if (arg !== "--json") {
    console.error("Usage: node .claude/scripts/doctor.mjs [--json]");
    process.exit(2);
  }
}

const checks = [];

function record(id, status, detail) {
  checks.push({ id, status, detail });
}

function abs(relativePath) {
  return path.join(root, relativePath);
}

function exists(relativePath) {
  return fs.existsSync(abs(relativePath));
}

function read(relativePath) {
  return fs.readFileSync(abs(relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function frontmatter(relativePath) {
  const text = read(relativePath);
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;

  const lines = match[1].split(/\r?\n/);
  const value = (key) => {
    const index = lines.findIndex((line) => line.startsWith(`${key}:`));
    if (index < 0) return "";
    const raw = lines[index].slice(key.length + 1).trim();
    // Block scalars, including the chomping indicators: >, >-, >+, |, |-, |+.
    // Missing these read the indicator itself as the value, which silently
    // undercounts long folded descriptions in the context-weight line.
    if (/^[>|][-+]?$/.test(raw)) {
      const block = [];
      for (let cursor = index + 1; cursor < lines.length && /^\s/.test(lines[cursor]); cursor += 1) {
        block.push(lines[cursor].trim());
      }
      return block.join(" ").trim();
    }
    if (raw.startsWith('"')) return JSON.parse(raw);
    if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1).replaceAll("''", "'");
    return raw;
  };

  return { name: value("name"), description: value("description") };
}

function skillDirectories() {
  const skillsRoot = abs(".claude/skills");
  if (!fs.existsSync(skillsRoot)) return [];
  return fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => fs.existsSync(path.join(skillsRoot, entry.name, "SKILL.md")))
    .map((entry) => entry.name);
}

function walk(relativeDir) {
  const files = [];
  const base = abs(relativeDir);
  if (!fs.existsSync(base)) return files;
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    const child = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...walk(child));
    else files.push(child);
  }
  return files;
}

// --- settings + SessionStart hook ---
function checkSettings() {
  if (!exists(".claude/settings.json")) {
    record("settings", "FAIL", ".claude/settings.json is missing");
    return;
  }
  let settings;
  try {
    settings = readJson(".claude/settings.json");
  } catch (error) {
    record("settings", "FAIL", `.claude/settings.json does not parse: ${error.message}`);
    return;
  }
  record("settings", "PASS", ".claude/settings.json parses");

  const sessionStart = settings.hooks?.SessionStart ?? [];
  const commands = sessionStart
    .flatMap((matcher) => matcher.hooks ?? [])
    .map((hook) => hook.command ?? "");
  const wired = commands.some((command) => command.includes(".claude/hooks/session-start.sh"));
  const hookExists = exists(".claude/hooks/session-start.sh");

  if (!wired) {
    record("session-start-hook", "FAIL", "SessionStart hook does not invoke .claude/hooks/session-start.sh");
  } else if (!hookExists) {
    record("session-start-hook", "FAIL", "SessionStart hook is wired but .claude/hooks/session-start.sh is missing");
  } else {
    record("session-start-hook", "PASS", "SessionStart hook wired to .claude/hooks/session-start.sh");
  }
}

// --- skill frontmatter ---
function checkSkills() {
  const directories = skillDirectories();
  if (!directories.length) {
    record("skills", "WARN", "no skills found under .claude/skills/");
    return;
  }

  // An omitted name is legal here: the loaders default it to the folder name.
  const problems = [];
  let implicitNames = 0;
  for (const directory of directories) {
    const relativePath = `.claude/skills/${directory}/SKILL.md`;
    const metadata = frontmatter(relativePath);
    if (!metadata) {
      problems.push(`${directory}: missing YAML frontmatter`);
      continue;
    }
    if (!metadata.name) implicitNames += 1;
    else if (metadata.name !== directory) problems.push(`${directory}: name ${metadata.name} does not match folder`);
    if (!metadata.description) problems.push(`${directory}: missing description`);
  }

  if (problems.length) {
    record("skills", "FAIL", `${problems.length} skill frontmatter problem(s): ${problems.join("; ")}`);
    return;
  }
  record("skills", "PASS", `${directories.length} skills have valid frontmatter (${implicitNames} inherit the folder name)`);
}

// --- Codex adapter sync ---
function checkCodexSync() {
  const syncScript = ".claude/scripts/sync-codex-skills.mjs";
  if (!exists(syncScript)) {
    record("codex-sync", "WARN", `${syncScript} is absent; skipping adapter drift check`);
    return;
  }
  const result = spawnSync(process.execPath, [abs(syncScript), "--check"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.error) {
    record("codex-sync", "FAIL", `could not run ${syncScript}: ${result.error.message}`);
    return;
  }
  if (result.status === 0) {
    record("codex-sync", "PASS", "Codex adapters are current and registered standalone skills are present");
    return;
  }
  const drift = `${result.stderr ?? ""}${result.stdout ?? ""}`
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .join(" | ");
  record("codex-sync", "FAIL", `adapter drift; run sync-codex-skills.mjs --write: ${drift}`);
}

// --- reference library ---
function checkReference() {
  const core = [
    "architecture.md",
    "pitfalls.md",
    "commands.md",
    "secrets.md",
    "tech-stack.md",
    "deployment.md",
  ];
  const missing = core.filter((file) => !exists(`.claude/reference/${file}`));
  if (missing.length) {
    record("reference", "FAIL", `.claude/reference/ missing: ${missing.join(", ")}`);
    return;
  }
  record("reference", "PASS", `.claude/reference/ has all ${core.length} core files`);
}

// --- leftover template markers ---
function checkTemplateMarkers() {
  const targets = ["CLAUDE.md", ...walk(".claude/reference")].filter((file) => exists(file));
  const hits = [];
  for (const file of targets) {
    const lines = read(file).split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      if (line.includes("FILL IN")) hits.push(`${file}:${index + 1}`);
    }
  }
  if (hits.length) {
    record("template-markers", "WARN", `${hits.length} FILL IN marker(s); run /init-project: ${hits.join(", ")}`);
    return;
  }
  record("template-markers", "PASS", "no FILL IN markers left in CLAUDE.md or .claude/reference/");
}

// --- plugin manifests (template-only; absence is fine) ---
function checkPluginManifests() {
  const manifests = [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"];
  const present = manifests.filter((file) => exists(file));
  if (!present.length) {
    record("plugin-manifests", "PASS", ".claude-plugin/ absent (expected in a spawned project)");
    return;
  }
  const broken = [];
  for (const file of present) {
    try {
      readJson(file);
    } catch (error) {
      broken.push(`${file}: ${error.message}`);
    }
  }
  if (broken.length) {
    record("plugin-manifests", "WARN", `manifest does not parse: ${broken.join("; ")}`);
    return;
  }
  record("plugin-manifests", "PASS", `${present.length} plugin manifest(s) parse`);
}

// --- always-loaded context weight (never fails) ---
function checkContextWeight() {
  let chars = 0;
  const parts = [];
  if (exists("CLAUDE.md")) {
    const kernel = read("CLAUDE.md").length;
    chars += kernel;
    parts.push(`CLAUDE.md ${kernel}`);
  }
  let skillChars = 0;
  for (const directory of skillDirectories()) {
    const metadata = frontmatter(`.claude/skills/${directory}/SKILL.md`);
    if (!metadata) continue;
    skillChars += (metadata.name || directory).length + metadata.description.length;
  }
  chars += skillChars;
  parts.push(`skill descriptions ${skillChars}`);
  const tokens = Math.round(chars / 4);
  // Same accounting as .claude/scripts/context-weight.sh (kernel chars + every
  // skill's injected name+description, at chars/4), minus the machine-global
  // ~/.claude/CLAUDE.md that script also counts. Expect a small delta, not a
  // different number.
  record("context-weight", "INFO", `~${tokens} tok always-loaded, repo files only (${chars} chars: ${parts.join(", ")})`);
}

checkSettings();
checkSkills();
checkCodexSync();
checkReference();
checkTemplateMarkers();
checkPluginManifests();
checkContextWeight();

const failed = checks.filter((check) => check.status === "FAIL").length;
const warned = checks.filter((check) => check.status === "WARN").length;

if (jsonMode) {
  console.log(JSON.stringify({ ok: failed === 0, failed, warned, checks }, null, 2));
  process.exit(failed ? 1 : 0);
}

for (const check of checks) {
  const line = `${check.status.padEnd(4)} ${check.id.padEnd(18)} ${check.detail}`;
  if (check.status === "FAIL") console.error(line);
  else console.log(line);
}
console.log(`\n${checks.length} checks, ${failed} failed, ${warned} warnings.`);
process.exit(failed ? 1 : 0);
