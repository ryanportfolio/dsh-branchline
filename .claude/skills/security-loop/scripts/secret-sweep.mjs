#!/usr/bin/env node
// Scan every commit reachable from any ref (merges diffed against their first parent, so
// conflict resolutions are included) for credential-shaped values and committed key or env
// files. Prints a JSON report that never contains a matched value: only the pattern, location,
// a redacted preview and a short hash, so the report can enter an agent's context safely.
// Read-only; zero dependencies.
//
// Usage: node secret-sweep.mjs --repo <path> [--out <file>]

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline";
import { spawn, spawnSync } from "node:child_process";

const PATTERNS = [
  ["private_key", /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/g, 0],
  ["aws_access_key_id", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, 0],
  ["github_token", /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g, 0],
  ["github_fine_grained_pat", /\bgithub_pat_[A-Za-z0-9_]{60,255}\b/g, 0],
  ["anthropic_key", /\bsk-ant-[A-Za-z0-9_-]{20,}/g, 0],
  ["openai_key", /\bsk-(?!ant-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}/g, 0],
  ["slack_token", /\bxox[abposr]-[A-Za-z0-9-]{10,}/g, 0],
  ["stripe_live_key", /\b[rs]k_live_[A-Za-z0-9]{20,}/g, 0],
  ["google_api_key", /\bAIza[0-9A-Za-z_-]{35}\b/g, 0],
  ["jwt", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, 0],
  ["connection_string_password", /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqps?):\/\/[^:\s/@]+:([^@\s]{6,})@/g, 1],
  ["generic_secret_assignment", /\b(?:api[_-]?key|secret[_-]?key|client[_-]?secret|secret|access[_-]?token|auth[_-]?token|token|passw(?:or)?d)\b["']?\s*[:=]\s*["']([^"'\s]{16,})["']/gi, 1],
];
const PLACEHOLDER = /example|sample|dummy|placeholder|changeme|your[_-]|xxxx|\*\*\*\*|<[^>]*>|\$\{|process\.env|test/i;
const SENSITIVE_FILE = /(^|\/)(\.env(\.[^/]+)?|id_(rsa|dsa|ecdsa|ed25519)|[^/]+\.(pem|p12|pfx|key|keystore|jks)|credentials\.json|service-account[^/]*\.json)$/i;
const SENSITIVE_FILE_ALLOWED = /\.(example|sample|template|dist)$|(^|\/)\.env\.(example|sample|template)$/i;
const MAX_UNIQUE = 500;

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--repo") options.repo = argv[++i];
    else if (argv[i] === "--out") options.out = argv[++i];
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  if (!options.repo) throw new Error("--repo is required");
  return options;
}

const git = (repo, args) => spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const shortHash = (value) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
const redact = (value) => `${value.slice(0, 4)}... (${value.length} chars)`;
const nulList = (text) => text.split("\0").map((entry) => entry.replace(/^\r?\n+/, "")).filter(Boolean);

// Git C-quotes a patch path that holds non-ASCII bytes, quotes, backslashes, or control characters.
function unquoteGitPath(raw) {
  if (!raw.startsWith('"') || !raw.endsWith('"') || raw.length < 2) return raw;
  const simple = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, "\\": 92 };
  const bytes = [];
  const body = raw.slice(1, -1);
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch !== "\\") { bytes.push(...Buffer.from(ch, "utf8")); continue; }
    const next = body[i + 1];
    if (next === undefined) { bytes.push(92); break; }
    if (/[0-7]/.test(next ?? "")) { bytes.push(parseInt(body.slice(i + 1, i + 4), 8)); i += 3; continue; }
    bytes.push(simple[next] ?? next.charCodeAt(0));
    i += 1;
  }
  return Buffer.from(bytes).toString("utf8");
}

async function scanHistory(repo) {
  const found = new Map();
  const child = spawn("git", ["-C", repo, "log", "--all", "-p", "--diff-merges=first-parent", "--no-color", "--no-ext-diff", "--no-textconv", "-U0", "--format=commit %H"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  let commit = null;
  let file = null;
  // File headers sit between a "diff --git" line and the first hunk; an added line such as
  // "++ retries;" also starts with "+++ " inside a hunk.
  let inHeader = false;
  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.startsWith("commit ")) { commit = line.slice(7, 47); inHeader = false; continue; }
    if (line.startsWith("diff --git ")) { inHeader = true; file = null; continue; }
    if (line.startsWith("@@")) { inHeader = false; continue; }
    if (inHeader) {
      if (line.startsWith("+++ ")) {
        // Git ends the header with a tab when an unquoted path contains a space.
        const target = unquoteGitPath(line.slice(4).replace(/\t$/, ""));
        file = target === "/dev/null" ? null : target.replace(/^b\//, "");
      }
      continue;
    }
    if (!line.startsWith("+") || file === null) continue;
    const text = line.slice(1);
    for (const [name, regex, group] of PATTERNS) {
      regex.lastIndex = 0;
      for (const match of text.matchAll(regex)) {
        const value = match[group];
        if (!value) continue;
        const key = `${name}:${shortHash(value)}`;
        let entry = found.get(key);
        if (!entry) {
          if (found.size >= MAX_UNIQUE) continue;
          entry = { pattern: name, value, files: new Set(), commits: new Set(), likely_placeholder: PLACEHOLDER.test(value) };
          found.set(key, entry);
        }
        entry.files.add(file);
        entry.commits.add(commit);
      }
    }
  }
  const code = await new Promise((resolve) => child.on("close", resolve));
  if (code !== 0) throw new Error(`git log failed (${code}): ${stderr.trim().slice(0, 500)}`);
  return [...found.values()];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repo = path.resolve(options.repo);
  const head = git(repo, ["rev-parse", "HEAD"]);
  if (head.status !== 0) throw new Error(`not a git repository: ${repo}`);

  const matches = await scanHistory(repo);
  const findings = matches.map((entry) => {
    // The value travels as a git argument, never to stdout.
    const inHead = git(repo, ["grep", "-q", "-F", "-e", entry.value, "HEAD", "--"]).status === 0;
    return {
      pattern: entry.pattern,
      files: [...entry.files].slice(0, 10),
      commits: [...entry.commits].slice(-5),
      commit_count: entry.commits.size,
      in_head: inHead,
      likely_placeholder: entry.likely_placeholder,
      redacted: redact(entry.value),
      value_sha256_12: shortHash(entry.value),
    };
  });
  findings.sort((a, b) => Number(a.likely_placeholder) - Number(b.likely_placeholder) || Number(b.in_head) - Number(a.in_head) || a.pattern.localeCompare(b.pattern));

  // -z turns off path quoting, so non-ASCII and unusual names arrive as written.
  const everTracked = new Set(nulList(git(repo, ["log", "--all", "--name-only", "-z", "--diff-merges=first-parent", "--format="]).stdout));
  const headTracked = new Set(nulList(git(repo, ["ls-tree", "-r", "--name-only", "-z", "HEAD"]).stdout));
  const sensitiveFiles = [...everTracked]
    .filter((file) => SENSITIVE_FILE.test(file) && !SENSITIVE_FILE_ALLOWED.test(file))
    .sort()
    .map((file) => ({ path: file, in_head: headTracked.has(file) }));

  const report = {
    repo,
    head: head.stdout.trim(),
    scanned: "all refs, added lines only",
    unique_match_cap: MAX_UNIQUE,
    cap_reached: matches.length >= MAX_UNIQUE,
    findings,
    sensitive_files: sensitiveFiles,
  };
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (options.out) fs.writeFileSync(options.out, text, { flag: "wx" });
  else process.stdout.write(text);
}

main().catch((error) => {
  console.error(`secret-sweep: ${error.message}`);
  process.exitCode = 2;
});
