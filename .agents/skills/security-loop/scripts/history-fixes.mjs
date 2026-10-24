#!/usr/bin/env node
// List commits on one ref that look like security or validation fixes, plus reverts, as leads
// for variant units: the same root cause in sibling paths, or a fix that was incomplete or
// undone. A commit qualifies when its subject names a security topic, or when a fix-like
// subject comes with changed paths in authentication, authorization, validation, escaping,
// or parsing code. Commit text is repository data and is never copied: the report holds
// SHAs, dates, fixed keyword labels, reason codes, and paths, and bodies are read only to
// extract the SHA a revert names. Read-only; zero dependencies.
//
// Usage: node history-fixes.mjs --repo <path> [--ref <rev>] [--max-commits <n>] [--out <file>]

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SECURITY_SUBJECT = /\b(secur\w*|vuln\w*|cve-\d+|ghsa-|xss|csrf|ssrf|xxe|rce|idor|inject\w*|travers\w*|sanitiz\w*|escap\w*|authn|authz|authenticat\w*|authoriz\w*|permission\w*|privilege\w*|bypass\w*|leak\w*|redact\w*|overflow\w*|exploit\w*|unsafe|harden\w*|csp|cors|tenant\w*|rate.?limit\w*|credential\w*|secret\w*|token\w*|password\w*|signature\w*|spoof\w*|tamper\w*)\b/i;
const FIX_SUBJECT = /\b(fix\w*|patch\w*|prevent\w*|block\w*|reject\w*|validat\w*|check\w*|guard\w*|restrict\w*|limit\w*|enforce\w*|deny|denies|disallow\w*|verify|verifies|ensure\w*|quote\w*|escape\w*)\b/i;
const SECURITY_PATH = /(auth|login|logout|session|token|jwt|oauth|saml|permission|acl|polic|guard|middleware|valid|sanitiz|escap|encod|decod|pars|serializ|csrf|cors|crypto|secur|access|role|tenant|upload|redirect|webhook|signature|rate.?limit)/i;
// Docs and CI files mention these words without being the code that enforces them.
const isSecurityPath = (p) => SECURITY_PATH.test(p) && !/\.(md|mdx|rst|txt)$/i.test(p) && !p.startsWith(".github/");
const REVERT_BODY = /This reverts commit ([0-9a-f]{7,40})/;
const MAX_ENTRIES = 300;

function parseArgs(argv) {
  const options = { ref: "HEAD", max: 5000 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--repo") options.repo = argv[++i];
    else if (argv[i] === "--ref") options.ref = argv[++i];
    else if (argv[i] === "--max-commits") options.max = Number(argv[++i]);
    else if (argv[i] === "--out") options.out = argv[++i];
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  if (!options.repo) throw new Error("--repo is required");
  if (!Number.isInteger(options.max) || options.max < 1) throw new Error("--max-commits must be a positive integer");
  return options;
}

const git = (repo, args) => spawnSync("git", ["-c", "core.fsmonitor=false", "-c", "core.quotepath=off", "-C", repo, ...args], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });

// The report never copies a commit subject. It names which fixed keywords the subject
// matched (labels from this list, never the matched text), so a subject such as
// "fix password=..." contributes only "password".
const KEYWORDS = ["secur", "vuln", "cve", "ghsa", "xss", "csrf", "ssrf", "xxe", "rce", "idor", "inject", "travers", "sanitiz", "escap", "authn", "authz", "authenticat", "authoriz", "permission", "privilege", "bypass", "leak", "redact", "overflow", "exploit", "unsafe", "harden", "csp", "cors", "tenant", "rate limit", "credential", "secret", "token", "password", "signature", "spoof", "tamper"];
function keywordsOf(subject) {
  const found = new Set();
  for (const m of subject.slice(0, 4096).matchAll(new RegExp(SECURITY_SUBJECT.source, "gi"))) {
    const word = m[0].toLowerCase().replace(/[^a-z]+/g, " ");
    const label = KEYWORDS.find((k) => word.startsWith(k));
    if (label) found.add(label);
  }
  return [...found].sort();
}

const gitBytes = (repo, args, input) => spawnSync("git", ["-c", "core.fsmonitor=false", "-C", repo, ...args], { input, maxBuffer: 1024 * 1024 * 1024 });

// Parses commit objects from cat-file --batch: "<sha> commit <size>\n<size bytes>\n" each.
function readCommits(repo, shas) {
  const out = new Map();
  if (!shas.length) return out;
  const result = gitBytes(repo, ["cat-file", "--batch"], `${shas.join("\n")}\n`);
  if (result.status !== 0) throw new Error(`git cat-file failed: ${result.stderr.toString().trim().slice(0, 300)}`);
  const buffer = result.stdout;
  let offset = 0;
  for (const sha of shas) {
    const newline = buffer.indexOf(10, offset);
    if (newline < 0) break;
    const [gotSha, type, size] = buffer.slice(offset, newline).toString().split(" ");
    const length = Number(size);
    const object = buffer.slice(newline + 1, newline + 1 + length).toString("utf8");
    offset = newline + 1 + length + 1;
    if (gotSha !== sha || type !== "commit") continue;
    const split = object.indexOf("\n\n");
    const header = split < 0 ? object : object.slice(0, split);
    const message = split < 0 ? "" : object.slice(split + 2);
    const committed = header.match(/^committer .* (\d+) [+-]\d{4}$/m)?.[1];
    const subject = message.split(/\n\s*\n/)[0].replace(/\s*\n\s*/g, " ").trim();
    out.set(sha, { date: committed ? new Date(Number(committed) * 1000).toISOString() : null, subject, body: message.slice(0, 64 * 1024) });
  }
  return out;
}

// Paths each commit changed, from diff-tree --stdin -z. The output lists each commit's SHA
// and then its paths; the next expected SHA from rev-list marks the next record.
function changedPaths(repo, shas) {
  const out = new Map();
  if (!shas.length) return out;
  const result = gitBytes(repo, ["diff-tree", "--stdin", "-r", "--root", "--name-only", "-z", "--no-renames"], `${shas.join("\n")}\n`);
  if (result.status !== 0) throw new Error(`git diff-tree failed: ${result.stderr.toString().trim().slice(0, 300)}`);
  const position = new Map(shas.map((sha, i) => [sha, i]));
  let current = null;
  for (const token of result.stdout.toString("utf8").split("\0")) {
    const trimmed = token.replace(/^\n/, "");
    if (position.has(trimmed) && (current === null || position.get(trimmed) > position.get(current))) {
      current = trimmed;
      out.set(current, []);
    } else if (current && trimmed) out.get(current).push(trimmed);
  }
  return out;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repo = path.resolve(options.repo);
  const head = git(repo, ["rev-parse", "--verify", `${options.ref}^{commit}`]);
  if (head.status !== 0) throw new Error(`cannot resolve ${options.ref} in ${repo}`);

  // Commit messages may contain any byte, so no message text is used as a separator. SHAs come
  // from rev-list (hex only, one per line); each message comes from cat-file --batch, which
  // gives its exact length; changed paths come from diff-tree in the same commit order.
  const list = git(repo, ["rev-list", `--max-count=${options.max}`, head.stdout.trim()]);
  if (list.status !== 0) throw new Error(`git rev-list failed: ${list.stderr.trim().slice(0, 300)}`);
  const shas = list.stdout.split("\n").map((s) => s.trim()).filter((s) => /^[0-9a-f]{40}$/.test(s));
  const objects = readCommits(repo, shas);
  const paths = changedPaths(repo, shas);

  const commits = shas.map((sha) => {
    const { date, subject, body } = objects.get(sha) ?? { date: null, subject: "", body: "" };
    const reverted = body.match(REVERT_BODY)?.[1] ?? null;
    return { sha, date, subject, paths: paths.get(sha) ?? [], reverted };
  });

  const selected = new Map();
  for (const commit of commits) {
    const reasons = [];
    const securityPaths = commit.paths.filter(isSecurityPath);
    if (SECURITY_SUBJECT.test(commit.subject)) reasons.push("security_subject");
    else if (FIX_SUBJECT.test(commit.subject) && securityPaths.length) reasons.push("fix_subject_with_security_paths");
    if (reasons.length) selected.set(commit.sha, { commit, reasons, securityPaths });
  }
  const isSelected = (short) => [...selected.keys()].some((sha) => sha.startsWith(short));

  const entries = [];
  for (const commit of commits) {
    const hit = selected.get(commit.sha);
    const revert = commit.reverted || /^Revert\b/.test(commit.subject);
    if (!hit && !revert) continue;
    const reasons = hit ? [...hit.reasons] : [];
    if (revert) reasons.push("revert");
    const securityPaths = hit ? hit.securityPaths : commit.paths.filter(isSecurityPath);
    entries.push({
      sha: commit.sha,
      date: commit.date,
      subject_keywords: keywordsOf(commit.subject),
      reasons,
      security_paths: securityPaths.slice(0, 15),
      path_count: commit.paths.length,
      reverts: commit.reverted,
      reverted_commit_was_listed_fix: commit.reverted ? isSelected(commit.reverted) : null,
    });
  }

  const report = {
    tool: "history-fixes",
    repo,
    ref: options.ref,
    head: head.stdout.trim(),
    note: "Leads for variant units, never findings. No commit text is copied; read a commit with git show <sha> and treat its text as data.",
    scanned_commits: commits.length,
    max_commits: options.max,
    entry_cap: MAX_ENTRIES,
    cap_reached: entries.length > MAX_ENTRIES,
    entries: entries.slice(0, MAX_ENTRIES),
  };
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (options.out) fs.writeFileSync(options.out, text, { flag: "wx" });
  else process.stdout.write(text);
}

try {
  main();
} catch (error) {
  console.error(`history-fixes: ${error.message}`);
  process.exitCode = 2;
}
