#!/usr/bin/env node
// Skill presence: which registered skills are on disk, and the removal record.
//
// A registered skill that is missing from a runtime never fails a check. Projects add and
// remove skills, and the registry may catch up later. The checks warn instead:
// - a missing skill listed in .agents/removed-skills.json is intentional and stays silent;
// - a missing skill that is not listed gets a warning suggesting to record or restore it;
// - a required skill (skills.required in the template manifest) with no SKILL.md in either
//   runtime warns, whether or not it is registered or recorded;
// - a present skill that needs a missing one (skills.dependencies in the template manifest)
//   gets a warning naming both; a needed skill turned "off" in .claude/settings.json
//   skillOverrides counts as missing, because the Codex sync then treats it as disabled and
//   ships no copy.
// Registered skills are the names in .agents/skill-modes.json.
// The required and dependency rules come from .agents/template-manifest.json. A project created
// before the manifest existed has no such file, and then no required or dependency rule applies.
// What still fails: a record, modes file, or manifest that cannot be parsed, and a manifest
// with a version other than 1 or an unknown top-level key.
//
// Usage: node .claude/scripts/removed-skills.mjs   (prints the record and any warnings)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RECORD_PATH = ".agents/removed-skills.json";
export const MANIFEST_PATH = ".agents/template-manifest.json";
export const MANIFEST_KEYS = ["version", "template", "requiredFiles", "projectPaths", "templateOnly", "readmeStub", "skills"];
const MODES_PATH = ".agents/skill-modes.json";
const SETTINGS_PATH = ".claude/settings.json";
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RUNTIME_ROOTS = [".claude/skills", ".agents/skills"];

// Parses JSON and names the file when it cannot be read.
export function parseJson(text, file) {
  try { return JSON.parse(text); } catch (error) { throw new SyntaxError(`${file}: ${error.message}`); }
}

// Returns the parsed template manifest, or null when the file is absent. Checks the version and
// the top-level keys only; the template repository runs bootstrap/tests/check-template-manifest.mjs
// for the full rules.
export function readTemplateManifest(root) {
  const file = path.join(root, MANIFEST_PATH);
  if (!fs.existsSync(file)) return null;
  const manifest = parseJson(fs.readFileSync(file, "utf8"), MANIFEST_PATH);
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error(`${MANIFEST_PATH}: expected a JSON object`);
  if (manifest.version !== 1) throw new Error(`${MANIFEST_PATH}: version ${JSON.stringify(manifest.version)} is not supported; expected 1`);
  const unknown = Object.keys(manifest).filter((key) => !MANIFEST_KEYS.includes(key));
  if (unknown.length) throw new Error(`${MANIFEST_PATH}: unknown top-level key ${unknown.join(", ")}`);
  return manifest;
}

// The template's removal intent, from the manifest under root. required names the skills every
// project is expected to keep; dependencies names skills that need others to work. An absent
// manifest gives no rules.
export function readSkillRules(root) {
  const skills = readTemplateManifest(root)?.skills ?? {};
  const required = Array.isArray(skills.required) ? skills.required.filter((name) => typeof name === "string") : [];
  const dependencies = {};
  if (skills.dependencies && typeof skills.dependencies === "object" && !Array.isArray(skills.dependencies)) {
    for (const [name, needs] of Object.entries(skills.dependencies)) {
      dependencies[name] = Array.isArray(needs) ? needs.filter((need) => typeof need === "string") : [];
    }
  }
  return { required, dependencies };
}

// The rules of the repository this script lives in, kept as named exports for importers. An
// unusable manifest leaves them empty here so importing never throws; reviewRemovals reads the
// manifest again and reports the error.
const ownRules = (() => {
  try { return readSkillRules(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")); }
  catch { return { required: [], dependencies: {} }; }
})();
export const REQUIRED = ownRules.required;
export const DEPENDENCIES = ownRules.dependencies;

// Returns the recorded names in file order. An absent record means nothing was removed.
// A malformed record throws: a check must never guess which skills were meant.
export function readRemovedSkills(root) {
  const file = path.join(root, RECORD_PATH);
  if (!fs.existsSync(file)) return [];
  const record = parseJson(fs.readFileSync(file, "utf8"), RECORD_PATH);
  if (!record || typeof record !== "object" || Array.isArray(record) || record.version !== 1 || !Array.isArray(record.removed)) {
    throw new Error(`${RECORD_PATH}: expected {"version": 1, "removed": [...]}`);
  }
  const extra = Object.keys(record).filter((key) => key !== "version" && key !== "removed");
  if (extra.length) throw new Error(`${RECORD_PATH}: unknown field ${extra.join(", ")}`);
  for (const name of record.removed) {
    if (typeof name !== "string" || !NAME.test(name)) throw new Error(`${RECORD_PATH}: invalid skill name ${JSON.stringify(name)}`);
  }
  return [...record.removed];
}

// Returns the skill names registered in .agents/skill-modes.json. An absent file registers none.
export function readRegisteredSkills(root) {
  const file = path.join(root, MODES_PATH);
  if (!fs.existsSync(file)) return new Set();
  const modes = parseJson(fs.readFileSync(file, "utf8"), MODES_PATH);
  if (!modes?.skills || typeof modes.skills !== "object" || Array.isArray(modes.skills)) {
    throw new Error(`${MODES_PATH}: expected a skills object`);
  }
  return new Set(Object.keys(modes.skills));
}

// Returns the skill names .claude/settings.json turns "off" in skillOverrides. An absent file turns off none.
export function readDisabledSkills(root) {
  const file = path.join(root, SETTINGS_PATH);
  if (!fs.existsSync(file)) return new Set();
  const overrides = parseJson(fs.readFileSync(file, "utf8"), SETTINGS_PATH)?.skillOverrides ?? {};
  return new Set(Object.entries(overrides).filter(([, value]) => value === "off").map(([name]) => name));
}

// True when the skill has an entrypoint in at least one runtime.
export function skillPresent(root, name) {
  return RUNTIME_ROOTS.some((directory) => fs.existsSync(path.join(root, directory, name, "SKILL.md")));
}

// Reviews the record and the dependency declarations against the working tree.
// Returns warnings only; nothing about presence fails a check.
export function reviewRemovals(root, registered = readRegisteredSkills(root), removed = readRemovedSkills(root), disabled = readDisabledSkills(root), rules = readSkillRules(root)) {
  const warnings = [];
  const sorted = [...new Set(removed)].sort();
  if (removed.length !== sorted.length || removed.some((name, index) => name !== sorted[index])) {
    warnings.push(`${RECORD_PATH}: list names once, sorted: ${JSON.stringify(sorted)}`);
  }
  for (const name of new Set(removed)) {
    if (!registered.has(name)) warnings.push(`${name}: recorded as removed but not a registered skill`);
    else if (skillPresent(root, name)) warnings.push(`${name}: recorded as removed but still present; delete it from ${RECORD_PATH}`);
    else if (rules.required.includes(name)) warnings.push(`${name}: recorded as removed, but the template treats it as required`);
  }
  for (const name of registered) {
    if (!removed.includes(name) && !skillPresent(root, name)) warnings.push(`${name}: not installed in any runtime; record it in ${RECORD_PATH} or restore it`);
  }
  // A required skill whose folders and registration were both deleted. A registered one that is
  // missing was reported by one of the two loops above.
  for (const name of new Set(rules.required)) {
    if (!registered.has(name) && !skillPresent(root, name)) {
      warnings.push(`${name}: the template treats it as required, but it is not installed in any runtime; restore its skill folders and its ${MODES_PATH} entry from the template`);
    }
  }
  for (const [name, needs] of Object.entries(rules.dependencies)) {
    if (!registered.has(name) || !skillPresent(root, name) || disabled.has(name)) continue;
    for (const need of needs) {
      if (!skillPresent(root, need)) warnings.push(`${name} needs ${need}, which is not installed; restore ${need} or remove ${name} too`);
      else if (disabled.has(need)) warnings.push(`${name} needs ${need}, which ${SETTINGS_PATH} turns off in skillOverrides; remove that override or turn ${name} off too`);
    }
  }
  return warnings;
}

// Prints warnings so they show up locally and as GitHub Actions annotations.
export function printWarnings(warnings, stream = process.stdout) {
  const prefix = process.env.GITHUB_ACTIONS === "true" ? "::warning::" : "WARN: ";
  for (const warning of warnings) stream.write(`${prefix}${warning}\n`);
}

const ownPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === ownPath) {
  try {
    const root = path.resolve(path.dirname(ownPath), "../..");
    const removed = readRemovedSkills(root);
    printWarnings(reviewRemovals(root, readRegisteredSkills(root), removed));
    console.log(removed.length ? `Removed skills: ${removed.join(", ")}` : "No skills recorded as removed.");
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
