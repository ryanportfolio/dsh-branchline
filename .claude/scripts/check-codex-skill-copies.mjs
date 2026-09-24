import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function inventory(directory, prefix = "") {
  const files = new Map();
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`${full}: inspect linked resources separately`);
    if (entry.isDirectory()) {
      for (const pair of inventory(full, relative)) files.set(...pair);
    } else if (entry.isFile()) files.set(relative, fs.readFileSync(full));
  }
  return files;
}

export function compareCopies(sourceRoot, targetRoot, names) {
  const results = [];
  for (const name of names) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) throw new Error("Invalid skill name");
    const target = path.join(targetRoot, name);
    let sourceFiles, targetFiles;
    try {
      let targetEntry;
      try { targetEntry = fs.lstatSync(target); }
      catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      if (targetEntry.isSymbolicLink()) throw new Error("inspect linked skills separately");
      sourceFiles = inventory(path.join(sourceRoot, name));
      targetFiles = inventory(target);
    } catch (error) {
      results.push({ name, target, differences: [], unverified: error.message });
      continue;
    }
    const differences = [];
    for (const [file, bytes] of sourceFiles) {
      if (!targetFiles.has(file)) differences.push(`missing: ${file}`);
      else if (!bytes.equals(targetFiles.get(file))) differences.push(`changed: ${file}`);
    }
    for (const file of targetFiles.keys()) {
      if (!sourceFiles.has(file)) differences.push(`personal-only: ${file}`);
    }
    results.push({ name, target, differences });
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const targets = process.argv.slice(2);
  if (!targets.length) {
    console.error("Usage: node .claude/scripts/check-codex-skill-copies.mjs <personal-skills-root> [...roots]");
    process.exitCode = 2;
  } else {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const modes = JSON.parse(fs.readFileSync(path.join(root, ".agents/skill-modes.json"), "utf8")).skills;
    let overrides = {};
    try {
      overrides = JSON.parse(fs.readFileSync(path.join(root, ".claude/settings.json"), "utf8")).skillOverrides ?? {};
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const names = Object.entries(modes)
      .filter(([name, mode]) => mode === "native" && overrides[name] !== "off")
      .map(([name]) => name);
    let checked = 0;
    for (const target of targets) {
      for (const result of compareCopies(path.join(root, ".agents/skills"), path.resolve(target), names)) {
        checked++;
        console.log(`${result.unverified ? "UNVERIFIED" : result.differences.length ? "DIFF" : "MATCH"}: ${result.target}`);
        if (result.unverified) console.log(`  ${result.unverified}`);
        for (const difference of result.differences) console.log(`  ${difference}`);
        if (result.unverified || result.differences.length) process.exitCode = 1;
      }
    }
    console.log(`Compared ${checked} existing copies. No files changed.`);
  }
}
