#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseJson, printWarnings, readRemovedSkills, readTemplateManifest } from "./removed-skills.mjs";

// Unreadable input fails with one line naming the file, not a stack trace.
process.on("uncaughtException", (error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..", "..");
const failures = [];
// Missing or unregistered skills are warnings: projects add and remove skills freely.
const warnings = [];
// Skills deleted on purpose and listed in .agents/removed-skills.json.
const removed = new Set(readRemovedSkills(root));
const maxCatalogChars = 7000;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function frontmatter(relativePath) {
  const text = read(relativePath);
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    failures.push(`${relativePath}: missing YAML frontmatter`);
    return { name: "", description: "" };
  }

  const lines = match[1].split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (!line || /^\s/.test(line) || /^#/.test(line) || /^[A-Za-z0-9_-]+:\s*/.test(line)) continue;
    failures.push(`${relativePath}:${index + 2}: invalid unindented frontmatter continuation`);
  }

  const value = (key) => {
    const index = lines.findIndex((line) => line.startsWith(`${key}:`));
    if (index < 0) return "";
    const raw = lines[index].slice(key.length + 1).trim();
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

const settings = exists(".claude/settings.json") ? parseJson(read(".claude/settings.json"), ".claude/settings.json") : {};
const disabled = new Set(
  Object.entries(settings.skillOverrides ?? {})
    .filter(([, state]) => state === "off")
    .map(([name]) => name),
);

const modes = exists(".agents/skill-modes.json") ? parseJson(read(".agents/skill-modes.json"), ".agents/skill-modes.json") : { skills: {} };
for (const [name, mode] of Object.entries(modes.skills)) if (mode === "disabled") disabled.add(name);
for (const name of disabled) if (exists(`.agents/skills/${name}/SKILL.md`)) warnings.push(`${name}: disabled skill remains discoverable in .agents/skills/`);
const skillsRoot = path.join(root, ".claude", "skills");
const canonicalEntries = fs.readdirSync(skillsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !disabled.has(entry.name) && !removed.has(entry.name))
  .filter((entry) => fs.existsSync(path.join(skillsRoot, entry.name, "SKILL.md")))
  .map((entry) => ({name: entry.name}));
const activeNames = new Set(canonicalEntries.map(entry => entry.name));
for (const [name, mode] of Object.entries(modes.skills)) if (mode === "native" && !disabled.has(name) && exists(`.agents/skills/${name}/SKILL.md`)) activeNames.add(name);
const skills = [...activeNames].map(name => ({name}))
  .map((entry) => {
    const canonicalPath = `.claude/skills/${entry.name}/SKILL.md`;
    const canonicalMetadata = exists(canonicalPath) ? frontmatter(canonicalPath) : {};
    if (canonicalMetadata.name && canonicalMetadata.name !== entry.name) {
      warnings.push(`${canonicalPath}: declared name ${canonicalMetadata.name} does not match directory ${entry.name}`);
    }
    const relativePath = `.agents/skills/${entry.name}/SKILL.md`;
    if (!exists(relativePath)) {
      warnings.push(modes.skills[entry.name] === "native"
        ? `${relativePath}: native Codex skill is missing; restore .agents/skills/${entry.name}/ or delete .claude/skills/${entry.name}/ too`
        : `${relativePath}: no native Codex port; write one under .agents/skills/${entry.name}/ and register it "native", or register ${entry.name} "disabled" in .agents/skill-modes.json`);
      return null;
    }
    const metadata = frontmatter(relativePath);
    if (metadata.name && metadata.name !== entry.name) {
      warnings.push(`${relativePath}: declared name ${metadata.name} does not match directory ${entry.name}`);
    }
    return {
      directory: entry.name,
      name: metadata.name || entry.name,
      description: metadata.description,
    };
  })
  .filter(Boolean);

let catalogChars = 0;
for (const skill of skills) {
  if (!skill.description) failures.push(`${skill.directory}: missing description`);
  catalogChars += skill.name.length + skill.description.length;
}
const duplicateNames = skills
  .map((skill) => skill.name)
  .filter((name, index, names) => names.indexOf(name) !== index);
for (const name of new Set(duplicateNames)) warnings.push(`${name}: duplicate active skill name`);
if (catalogChars > maxCatalogChars) {
  warnings.push(`Codex skill catalog is ${catalogChars} chars (max ${maxCatalogChars})`);
}

const compatibility = read(".agents/CODEX-SKILL-COMPATIBILITY.md");
const classifications = new Map();
for (const line of compatibility.split(/\r?\n/)) {
  const match = line.match(/^\|\s*(Native|Adapted|Capability-gated|Dangerous|Claude-only)\s*\|(.+)\|$/);
  if (!match) continue;
  for (const skill of match[2].matchAll(/`([^`]+)`/g)) {
    const statuses = classifications.get(skill[1]) ?? [];
    statuses.push(match[1]);
    classifications.set(skill[1], statuses);
  }
}

for (const skill of skills) {
  const statuses = classifications.get(skill.directory) ?? [];
  if (statuses.length !== 1) {
    warnings.push(`${skill.directory}: expected one compatibility classification in .agents/CODEX-SKILL-COMPATIBILITY.md, found ${statuses.length}`);
  }
}
for (const skill of classifications.keys()) {
  if (!disabled.has(skill) && !removed.has(skill) && !skills.some((entry) => entry.directory === skill)) {
    warnings.push(`${skill}: compatibility classification has no active Codex skill; delete its entry from .agents/CODEX-SKILL-COMPATIBILITY.md or restore the skill`);
  }
}

// The template manifest ships into projects; an unusable one fails here. Its full rules
// (which paths are template-only, skill groups) are checked in the template by
// bootstrap/tests/check-template-manifest.mjs.
readTemplateManifest(root);

// Content contracts for specific skills apply only while those skills are installed.
for (const runtime of [".claude", ".agents"]) {
  const profiles = `${runtime}/skills/init-project/references/profiles.md`;
  if (exists(`${runtime}/skills/init-project/SKILL.md`) && exists(profiles) && !read(profiles).includes(".agents/template-manifest.json")) {
    warnings.push(`${profiles}: cleanup contract does not point at .agents/template-manifest.json`);
  }
}

if (exists(".claude/skills/long-horizon/SKILL.md") && exists(".agents/skills/long-horizon/SKILL.md")) {
  const longHorizon = read(".claude/skills/long-horizon/SKILL.md");
  if (!longHorizon.includes("conversation history")) {
    warnings.push("long-horizon: canonical workflow does not explicitly isolate round contexts from manager conversation history");
  }
  const longHorizonCodex = read(".agents/skills/long-horizon/SKILL.md");
  if (!longHorizonCodex.includes('fork_turns: "none"')) {
    warnings.push('long-horizon: Codex workflow does not map a fresh round to fork_turns: "none"');
  }
  if (longHorizonCodex.includes("<!-- Generated by") || longHorizonCodex.includes(".claude/skills/long-horizon")) {
    warnings.push("long-horizon: Codex workflow must be a standalone native port that neither carries the generated marker nor points into .claude/skills/long-horizon");
  }
}

// The project creators live in bootstrap/, which only the template repository has. A project
// created from the template has no bootstrap/ folder, so these checks apply only where it exists.
if (exists("bootstrap")) {
  const corePath = "bootstrap/NewProjectCore.psm1";
  if (!exists(corePath)) {
    failures.push(`${corePath}: shared project generator is missing`);
  } else {
    const core = read(corePath);
    if (!core.includes("template-manifest.json")) failures.push(`${corePath}: cleanup does not read .agents/template-manifest.json`);
    for (const command of ["Test-NewProjectName", "Get-NewProjectMode", "Invoke-NewProject"]) {
      if (!core.includes(command)) failures.push(`${corePath}: does not expose ${command}`);
    }
    if (!core.includes("'archive'")) failures.push(`${corePath}: local repo copies must use a tracked Git archive`);
  }

  for (const wrapper of ["bootstrap/new-claude-project.ps1", "bootstrap/new-claude-project-ui.ps1"]) {
    const text = read(wrapper);
    if (!text.includes("NewProjectCore.psm1")) failures.push(`${wrapper}: does not load the shared project generator`);
    for (const duplicatedCommand of ["gh repo create", "robocopy"]) {
      if (text.includes(duplicatedCommand)) failures.push(`${wrapper}: duplicates core command ${duplicatedCommand}`);
    }
  }

  const releaseBuilderPath = "bootstrap/Build-NewClaudeProjectUIRelease.ps1";
  if (!exists(releaseBuilderPath)) {
    failures.push(`${releaseBuilderPath}: reproducible UI release builder is missing`);
  } else {
    const releaseBuilder = read(releaseBuilderPath);
    for (const asset of ["New-ClaudeProject-UI.cmd", "new-claude-project-ui.ps1", "NewProjectCore.psm1", "template"]) {
      if (!releaseBuilder.includes(asset)) failures.push(`${releaseBuilderPath}: release manifest omits ${asset}`);
    }
    if (!releaseBuilder.includes("archive")) failures.push(`${releaseBuilderPath}: template snapshot is not sourced from tracked Git files`);
  }

  const generatorSmokePath = "bootstrap/tests/Test-NewProjectGenerator.ps1";
  if (!exists(generatorSmokePath)) {
    failures.push(`${generatorSmokePath}: local generator smoke test is missing`);
  } else {
    const workflow = read(".github/workflows/validate-template.yml");
    if (!workflow.includes("windows-latest")) failures.push("validate-template.yml: generator smoke test needs a Windows runner");
    if (!workflow.includes("Test-NewProjectGenerator.ps1")) failures.push("validate-template.yml: generator smoke test is not wired into CI");
    if (!workflow.includes("check-template-manifest.mjs")) failures.push("validate-template.yml: template manifest check is not wired into CI");
  }

  const posixCreator = "bootstrap/new-claude-project.sh";
  if (!exists(posixCreator) || !read(posixCreator).includes("template-manifest.json")) failures.push(`${posixCreator}: cleanup does not read .agents/template-manifest.json`);
}

printWarnings(warnings);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}

console.log(`Codex contract checks passed (${skills.length} skills, ${catalogChars} catalog chars${warnings.length ? `, ${warnings.length} warning(s)` : ""}).`);
