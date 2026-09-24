import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { compareCopies } from "./check-codex-skill-copies.mjs";

test("copy check detects resource drift and preserves personal content", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-copies-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const target = path.join(root, "target");
  for (const base of [source, target]) {
    fs.mkdirSync(path.join(base, "writing/references"), { recursive: true });
    fs.writeFileSync(path.join(base, "writing/SKILL.md"), "same");
    fs.writeFileSync(path.join(base, "writing/references/style.md"), "same");
  }
  assert.deepEqual(compareCopies(source, target, ["writing"])[0].differences, []);
  fs.writeFileSync(path.join(target, "writing/SKILL.md"), "custom");
  fs.unlinkSync(path.join(target, "writing/references/style.md"));
  fs.writeFileSync(path.join(target, "writing/personal.md"), "preserve");
  assert.deepEqual(compareCopies(source, target, ["writing"])[0].differences.sort(), ["changed: SKILL.md", "missing: references/style.md", "personal-only: personal.md"]);
  assert.equal(fs.readFileSync(path.join(target, "writing/personal.md"), "utf8"), "preserve");
  assert.deepEqual(compareCopies(source, target, ["not-installed"]), []);
  assert.throws(() => compareCopies(source, target, ["../escape"]), /Invalid skill name/);
  fs.symlinkSync(path.join(source, "writing"), path.join(target, "linked"), process.platform === "win32" ? "junction" : "dir");
  const withLink = compareCopies(source, target, ["linked", "writing"]);
  assert.match(withLink[0].unverified, /linked skills/);
  assert.equal(withLink[1].name, "writing");
  assert.equal(withLink[1].differences.length, 3);
  fs.symlinkSync(path.join(source, "absent"), path.join(target, "dangling"), process.platform === "win32" ? "junction" : "dir");
  assert.match(compareCopies(source, target, ["dangling"])[0].unverified, /linked skills/);
});

test("CLI compares enabled native modes and leaves disabled personal copies untouched", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-copy-cli-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (relative, content) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  write(".claude/scripts/check-codex-skill-copies.mjs", fs.readFileSync(new URL("./check-codex-skill-copies.mjs", import.meta.url)));
  write(".agents/skill-modes.json", JSON.stringify({ version: 1, skills: { active: "native", disabled: "disabled", legacy: "native", shared: "adapter" } }));
  write(".claude/settings.json", JSON.stringify({ skillOverrides: { legacy: "off" } }));
  write(".agents/skills/active/SKILL.md", "approved");
  for (const name of ["active", "disabled", "legacy", "shared"]) write(`personal/${name}/SKILL.md`, "approved");
  const run = () => spawnSync(process.execPath, [path.join(root, ".claude/scripts/check-codex-skill-copies.mjs"), path.join(root, "personal")], { encoding: "utf8" });
  const same = run();
  assert.equal(same.status, 0, same.stderr);
  assert.match(same.stdout, /Compared 1 existing copies/);
  assert.doesNotMatch(same.stdout, /personal[\\/](disabled|legacy|shared)/);
  write("personal/active/SKILL.md", "custom");
  const changed = run();
  assert.equal(changed.status, 1, changed.stderr);
  assert.match(changed.stdout, /changed: SKILL.md/);
  assert.equal(fs.readFileSync(path.join(root, "personal/active/SKILL.md"), "utf8"), "custom");
});

test("CLI accepts absent optional settings but rejects malformed settings", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-copy-optional-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (relative, content) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  write(".claude/scripts/check-codex-skill-copies.mjs", fs.readFileSync(new URL("./check-codex-skill-copies.mjs", import.meta.url)));
  write(".agents/skill-modes.json", JSON.stringify({ skills: { active: "native", disabled: "disabled" } }));
  write(".agents/skills/active/SKILL.md", "approved");
  write("personal/active/SKILL.md", "approved");
  write("personal/disabled/SKILL.md", "personal");
  const run = () => spawnSync(process.execPath, [path.join(root, ".claude/scripts/check-codex-skill-copies.mjs"), path.join(root, "personal")], { encoding: "utf8" });
  const absent = run();
  assert.equal(absent.status, 0, absent.stderr);
  assert.match(absent.stdout, /MATCH:.*[\\/]active/);
  assert.match(absent.stdout, /Compared 1 existing copies/);
  assert.equal(fs.existsSync(path.join(root, ".claude/settings.json")), false);
  write(".claude/settings.json", "{malformed");
  const malformed = run();
  assert.equal(malformed.status, 1, malformed.stderr);
  assert.match(malformed.stderr, /SyntaxError/);
  assert.doesNotMatch(malformed.stdout, /Compared/);
  assert.equal(fs.readFileSync(path.join(root, "personal/disabled/SKILL.md"), "utf8"), "personal");
});
