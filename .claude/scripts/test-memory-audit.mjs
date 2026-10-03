import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./memory-audit.mjs", import.meta.url));
const munge = (p) => path.resolve(p).replace(/[^A-Za-z0-9]/g, "-");
const JSON_KEYS = [
  "reference", "referenceDirScans", "memory", "skills", "sessionsWrote", "sessionsRead",
  "transcriptFiles", "dirs", "staleEntries", "staleRetired", "neverRead", "neverInvoked",
  "patterns", "cost",
];

function tempDir(t, prefix) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// One assistant line per tool call, in the transcript's JSONL shape.
const toolLine = (name, input, timestamp = "2026-09-01T00:00:00.000Z") =>
  JSON.stringify({ timestamp, message: { content: [{ type: "tool_use", name, input }] } });

// Strip inherited GIT_* so a hook or outer repo cannot steer the child's git.
function childEnv(home, ceiling) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")));
  return { ...env, HOME: home, USERPROFILE: home, GIT_CEILING_DIRECTORIES: ceiling, GIT_CONFIG_NOSYSTEM: "1" };
}

function audit(cwd, args, env = process.env) {
  const run = spawnSync(process.execPath, [script, "--json", ...args], { cwd, env, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

test("reads recorded only in subagent files are counted; top-level counts unchanged", (t) => {
  const root = tempDir(t, "memory-audit-root-");
  const projectDir = tempDir(t, "memory-audit-project-");
  const ref = (name) => path.join(root, ".claude", "reference", name);
  write(ref("alpha.md"), "# alpha\n");
  write(ref("beta.md"), "# beta\n");
  write(path.join(root, ".claude", "skills", "demo", "SKILL.md"), "---\nname: demo\n---\n");

  write(path.join(projectDir, "sess-1.jsonl"), [
    toolLine("Read", { file_path: ref("alpha.md") }),
    toolLine("Grep", { path: ref("alpha.md"), pattern: "x" }),
    "not json {",
  ].join("\n"));
  const before = audit(root, ["--project-dir", projectDir]);
  assert.deepEqual(Object.keys(before), JSON_KEYS);
  assert.equal(before.reference["alpha.md"].reads, 2);
  assert.equal(before.reference["beta.md"].reads, 0);
  assert.equal(before.skills.demo, 0);
  assert.equal(before.transcriptFiles, 1);
  assert.equal(before.sessionsRead, 1);

  const subagents = path.join(projectDir, "sess-1", "subagents");
  write(path.join(subagents, "agent-a1.jsonl"), [
    toolLine("Read", { file_path: ref("beta.md") }, "2026-09-02T00:00:00.000Z"),
    toolLine("Skill", { skill: "demo" }),
  ].join("\n"));
  write(path.join(subagents, "agent-a1.meta.json"), toolLine("Read", { file_path: ref("beta.md") }));
  write(path.join(subagents, "workflows", "wf_1", "agent-a2.jsonl"), toolLine("Read", { file_path: ref("beta.md") }));
  // A workflow journal sits beside its agents; it is not a transcript.
  write(path.join(subagents, "workflows", "wf_1", "journal.jsonl"), toolLine("Read", { file_path: ref("beta.md") }));
  // A session whose top-level file has rotated away still counts on its own.
  write(path.join(projectDir, "sess-2", "subagents", "agent-a3.jsonl"), toolLine("Write", { file_path: ref("beta.md") }));
  const after = audit(root, ["--project-dir", projectDir]);
  assert.deepEqual(Object.keys(after), JSON_KEYS);
  assert.deepEqual(after.reference["alpha.md"], before.reference["alpha.md"]);
  assert.deepEqual(after.reference["beta.md"], { writes: 1, reads: 2, lastRead: "2026-09-02T00:00:00.000Z" });
  assert.equal(after.skills.demo, 1);
  assert.equal(after.transcriptFiles, 4);
  assert.equal(after.sessionsRead, 1, "a subagent read marks its parent session, not a new one");
  assert.equal(after.sessionsWrote, 1);
  assert.deepEqual(after.neverRead, []);
});

test("dirs come from the main checkout, so a worktree run sees every worktree", (t) => {
  if (spawnSync("git", ["--version"]).status !== 0) return t.skip("git not available");
  const base = tempDir(t, "memory-audit-git-");
  const home = path.join(base, "home");
  const main = path.join(base, "repo");
  const worktree = path.join(main, ".claude", "worktrees", "w1");
  const env = childEnv(home, base);
  const git = (cwd, ...args) => {
    const run = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd, env, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
  };
  fs.mkdirSync(main, { recursive: true });
  git(main, "init", "-q");
  git(main, "commit", "-q", "--allow-empty", "--no-verify", "-m", "init");
  git(main, "worktree", "add", "-q", worktree);

  const projects = path.join(home, ".claude", "projects");
  const expected = [munge(main), `${munge(main)}--claude-worktrees-w1`, `${munge(main)}--claude-worktrees-other`];
  for (const name of [...expected, `${munge(main)}-api`]) fs.mkdirSync(path.join(projects, name), { recursive: true });
  const names = (out) => out.dirs.map((d) => path.basename(d)).sort();

  assert.deepEqual(names(audit(worktree, [], env)), [...expected].sort());
  assert.deepEqual(names(audit(main, [], env)), [...expected].sort());

  // Outside any repo the cwd is the key, as before.
  const plain = path.join(base, "plain");
  fs.mkdirSync(plain);
  fs.mkdirSync(path.join(projects, munge(plain)));
  assert.deepEqual(names(audit(plain, [], env)), [munge(plain)]);
});

// Transcript lines in the shapes Claude Code writes: an assistant tool call
// with an id, the user-side tool result, an assistant usage line, a user turn.
const callLine = (id, name, input) =>
  JSON.stringify({ type: "assistant", message: { id: `msg-${id}`, content: [{ type: "tool_use", id, name, input }] } });
const errorLine = (id, text) =>
  JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, is_error: true, content: text }] } });
const usageLine = (id, usage, text = "part") =>
  JSON.stringify({ type: "assistant", message: { id, content: [{ type: "text", text }], usage } });
const userLine = (content, extra = {}) => JSON.stringify({ type: "user", ...extra, message: { role: "user", content } });

test("failure patterns, standing-rule sessions and deduplicated token cost", (t) => {
  const root = tempDir(t, "memory-audit-root-");
  const projectDir = tempDir(t, "memory-audit-project-");
  write(path.join(root, ".claude", "skills", "demo", "SKILL.md"), "---\nname: demo\n---\n");
  const secret = "secret-banana-plan";
  const u1 = { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 5 };
  const u2 = { input_tokens: 1, cache_creation_input_tokens: 2, cache_read_input_tokens: 3, output_tokens: 4 };
  const u3 = { input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 50 };

  // Same error in three sessions, differing only in paths and numbers.
  const enoent = (p, ms) => `<tool_use_error>ENOENT: no such file or directory, stat ${p} (after ${ms} ms)</tool_use_error>`;
  write(path.join(projectDir, "sess-a.jsonl"), [
    userLine(`From now on, keep the ${secret} out of the logs.`),
    callLine("tu-1", "Skill", { skill: "demo" }),
    callLine("tu-2", "Skill", { skill: "demo" }),
    callLine("tu-3", "Read", { file_path: String.raw`C:\Users\alice\proj-1\secret-file-1.txt` }),
    errorLine("tu-3", enoent(String.raw`C:\Users\alice\proj-1\secret-file-1.txt`, 12)),
    // One message split across three content-block lines, same id and usage.
    usageLine("m1", u1), usageLine("m1", u1), usageLine("m1", u1),
    usageLine("m2", u2),
  ].join("\n"));
  write(path.join(projectDir, "sess-b.jsonl"), [
    callLine("tu-4", "Skill", { skill: "demo" }),
    callLine("tu-5", "Read", { file_path: "/home/bob/secret-dir/secret-file-22.txt" }),
    errorLine("tu-5", enoent("/home/bob/secret-dir/secret-file-22.txt", 3407)),
    // Phrases inside a tool result are not a user turn.
    JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "tu-4", content: "always never" }] } }),
    usageLine("m3", u3),
  ].join("\n"));
  write(path.join(projectDir, "sess-c.jsonl"), [
    // A meta injection (skill body) is not a user turn either.
    userLine([{ type: "text", text: "Always do this, never that." }], { isMeta: true }),
    callLine("tu-6", "Skill", { skill: "demo" }),
    callLine("tu-7", "Read", { file_path: String.raw`D:\work\secret-file-9.txt` }),
    errorLine("tu-7", enoent(String.raw`D:\work\secret-file-9.txt`, 7)),
  ].join("\n"));
  // Two sessions only: below the three-session floor.
  for (const s of ["sess-d", "sess-e"]) {
    write(path.join(projectDir, `${s}.jsonl`), [callLine(`${s}-t`, "Bash", {}), errorLine(`${s}-t`, "Exit code 2\nboom")].join("\n"));
  }
  // A workflow journal with tool calls and usage must not count.
  write(path.join(projectDir, "sess-a", "subagents", "workflows", "wf_9", "journal.jsonl"), [
    callLine("tu-9", "Skill", { skill: "demo" }),
    usageLine("m9", u3),
  ].join("\n"));

  const out = audit(root, ["--project-dir", projectDir]);
  assert.deepEqual(Object.keys(out), JSON_KEYS);
  assert.equal(out.transcriptFiles, 5, "journal.jsonl is not a transcript");
  assert.equal(out.skills.demo, 4);

  assert.equal(out.patterns.signatures.length, 1);
  const [sig] = out.patterns.signatures;
  assert.equal(sig.sessions, 3);
  assert.deepEqual(sig.skills, ["demo"]);
  assert.match(sig.signature, /^Read: /);
  assert.match(sig.signature, /ENOENT/);
  assert.deepEqual(out.patterns.standingRuleSessions, { demo: 1 });

  assert.match(out.cost.attribution, /session-level/);
  assert.match(out.cost.attribution, /approximate/);
  assert.deepEqual(out.cost.totals, {
    input_tokens: 111, cache_creation_input_tokens: 102, cache_read_input_tokens: 1003, output_tokens: 59,
  });
  assert.deepEqual(out.cost.bySkill.demo, {
    invocations: 4, sessions: 3, medianOutputTokens: 9, medianUncachedInput: 100,
  });

  const run = spawnSync(process.execPath, [script, "--project-dir", projectDir], { cwd: root, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /failure patterns/);
  assert.match(run.stdout, /token cost \(attribution is session-level and approximate/);
  const shared = run.stdout + JSON.stringify({ patterns: out.patterns, cost: out.cost });
  for (const leak of [secret, "From now on", "secret-file", "secret-dir", "alice", "bob", "proj-", "sess-", path.basename(projectDir), "boom"]) {
    assert.ok(!shared.includes(leak), `output leaks ${leak}`);
  }
});

test("unlisted free text in an error line never reaches output; the signature still collapses", (t) => {
  const root = tempDir(t, "memory-audit-root-");
  const projectDir = tempDir(t, "memory-audit-project-");
  const words = ["secretbanana", "zebracorn", "mangoplex", "Bearer", "quuxwidget", "ELEPHANTINE"];
  const sessions = ["s1", "s2", "s3"];
  sessions.forEach((s, i) => {
    write(path.join(projectDir, `${s}.jsonl`), [
      callLine(`${s}-a`, "WebFetch", {}),
      errorLine(`${s}-a`, `Bearer secretbanana rejected by zebracorn gateway mangoplex (request ${100 + i})`),
      callLine(`${s}-b`, "Bash", {}),
      errorLine(`${s}-b`, `Exit code 1\nquuxwidget ELEPHANTINE: permission denied after ${i + 2} tries\nsecond line zebracorn`),
      callLine(`${s}-c`, "Read", {}),
      errorLine(`${s}-c`, `EACCES: permission denied, open '/srv/mangoplex/${i}.txt'`),
    ].join("\n"));
  });

  const out = audit(root, ["--project-dir", projectDir]);
  const bySig = Object.fromEntries(out.patterns.signatures.map((p) => [p.signature, p.sessions]));
  assert.deepEqual(bySig, {
    "Bash: Exit code 1 | <w>: permission denied after <w>": 3,
    "Read: EACCES: permission denied open <str>": 3,
    "WebFetch: <w> rejected by <w> gateway <w> request <n>": 3,
  });

  const run = spawnSync(process.execPath, [script, "--project-dir", projectDir], { cwd: root, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /3 sessions {2}WebFetch: <w> rejected by <w> gateway <w> request <n>/);
  const shared = (run.stdout + JSON.stringify({ patterns: out.patterns, cost: out.cost })).toLowerCase();
  for (const leak of words) assert.ok(!shared.includes(leak.toLowerCase()), `output leaks ${leak}`);
});

test("a namespaced Skill call is keyed without its prefix in every section", (t) => {
  const root = tempDir(t, "memory-audit-root-");
  const projectDir = tempDir(t, "memory-audit-project-");
  write(path.join(root, ".claude", "skills", "demo", "SKILL.md"), "---\nname: demo\n---\n");
  const usage = { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 2 };
  ["n1", "n2", "n3"].forEach((s, i) => {
    write(path.join(projectDir, `${s}.jsonl`), [
      ...(i === 0 ? [userLine("From now on, check first.")] : []),
      callLine(`${s}-k`, "Skill", { skill: i === 2 ? "demo" : "some-plugin:demo" }),
      callLine(`${s}-r`, "Read", {}),
      errorLine(`${s}-r`, "ENOENT: no such file or directory"),
      usageLine(`${s}-m`, usage),
    ].join("\n"));
  });

  const out = audit(root, ["--project-dir", projectDir]);
  assert.equal(out.skills.demo, 3);
  assert.deepEqual(out.patterns.signatures, [
    { signature: "Read: ENOENT: no such file or directory", sessions: 3, skills: ["demo"] },
  ]);
  assert.deepEqual(out.patterns.standingRuleSessions, { demo: 1 });
  assert.deepEqual(Object.keys(out.cost.bySkill), ["demo"]);
  assert.deepEqual(out.cost.bySkill.demo, { invocations: 3, sessions: 3, medianOutputTokens: 2, medianUncachedInput: 1 });
  assert.ok(!JSON.stringify(out).includes("some-plugin"));
});
