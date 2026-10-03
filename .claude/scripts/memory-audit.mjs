#!/usr/bin/env node

// memory-audit.mjs: read-side accounting for the harness's durable knowledge.
//
// A reference entry, memory file, or skill earns its keep when sessions read
// or invoke it. This script scans the local Claude Code session transcripts
// of the main checkout and its worktrees (~/.claude/projects/<munged-main>/
// and <munged-main>--claude-worktrees-<name>/): top-level <session>.jsonl
// files plus the subagent files under <session>/subagents/. It reports, per
// target, how often it was written versus read, plus pruning candidates:
// never-read files, dated reference entries older than six months, and
// never-invoked skills. It also reports recurring tool-error signatures,
// per-skill counts of sessions where the user set a standing rule, and
// token usage attributed at session level to the skills each session invoked.
// Output holds counts, skill names and normalized signatures only: no user
// text, file paths or session paths.
//
// Counts are FLOOR estimates: transcripts rotate and compact, reads made
// through the Bash tool (cat/grep) are not attributed, and everything is
// per-machine. Advisory only — a low count is a prompt to check, not a
// verdict. The /refine skill runs this in its tooling lens.
//
// Usage: node .claude/scripts/memory-audit.mjs [--json] [--project-dir <path>]
//   --project-dir  scan this transcript directory instead of deriving it from
//                  the working directory's main checkout (testing, or
//                  auditing another repo's history from here).
//
// Exit 0 always (2 on bad usage). Requires Node >= 18, no dependencies.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
let jsonMode = false;
let projectDirOverride = null;
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === "--json") jsonMode = true;
  else if (argv[i] === "--project-dir" && argv[i + 1]) {
    projectDirOverride = argv[i + 1];
    i += 1;
  } else {
    console.error("Usage: node .claude/scripts/memory-audit.mjs [--json] [--project-dir <path>]");
    process.exit(2);
  }
}

const root = process.cwd();
const projectsRoot = path.join(os.homedir(), ".claude", "projects");
const munge = (p) => path.resolve(p).replace(/[^A-Za-z0-9]/g, "-");

// History is keyed by the main checkout, not the cwd: from a worktree the cwd
// munges to that one worktree's dir. The common git dir is "<main>/.git" in a
// normal repo (git may print it relative to cwd); anything else (no git, not
// a repo, bare repo, submodule) falls back to the cwd.
function mainCheckout() {
  const out = spawnSync("git", ["rev-parse", "--git-common-dir"], { cwd: root, encoding: "utf8" });
  if (out.status !== 0 || !out.stdout?.trim()) return root;
  const commonDir = path.resolve(root, out.stdout.trim());
  return path.basename(commonDir) === ".git" ? path.dirname(commonDir) : root;
}

// The exact dir for the main checkout, plus its worktrees: worktrees under the
// repo munge to "<repo>--claude-worktrees-<name>" and hold their own history.
// A bare "-" prefix match would also catch sibling repos ("app-api" beside
// "app"), crediting their reads here, so only the worktree marker qualifies.
function transcriptDirs() {
  if (projectDirOverride) return fs.existsSync(projectDirOverride) ? [projectDirOverride] : [];
  if (!fs.existsSync(projectsRoot)) return [];
  const prefix = munge(mainCheckout());
  return fs
    .readdirSync(projectsRoot)
    .filter((name) => name === prefix || name.startsWith(`${prefix}--claude-worktrees-`))
    .map((name) => path.join(projectsRoot, name));
}

const normalize = (p) => String(p).replaceAll("\\", "/").toLowerCase();

const referenceDir = path.join(root, ".claude", "reference");
const referenceFiles = fs.existsSync(referenceDir)
  ? fs.readdirSync(referenceDir).filter((f) => f.endsWith(".md"))
  : [];

const skillsDir = path.join(root, ".claude", "skills");
const skillNames = fs.existsSync(skillsDir)
  ? fs.readdirSync(skillsDir).filter((d) => fs.existsSync(path.join(skillsDir, d, "SKILL.md")))
  : [];

const stats = {
  reference: Object.fromEntries(
    referenceFiles.map((f) => [f, { writes: 0, reads: 0, lastRead: null }]),
  ),
  referenceDirScans: 0,
  memory: {}, // basename -> {writes, reads}
  skills: Object.fromEntries(skillNames.map((s) => [s, 0])),
  sessionsWrote: 0,
  sessionsRead: 0,
  transcriptFiles: 0,
  dirs: [],
};

const READ_TOOLS = new Set(["Read", "Grep", "Glob"]);
const WRITE_TOOLS = new Set(["Edit", "Write", "NotebookEdit"]);

// One key per skill in every section: "plugin:refine" and "refine" are the
// same skill, so the namespace prefix is dropped.
const skillKey = (raw) => String(raw).trim().split(":").pop().trim();

function classify(name, input, session, timestamp) {
  const target = input?.file_path ?? input?.path ?? input?.notebook_path ?? "";
  const norm = normalize(target);

  if (name === "Skill" && input?.skill) {
    const skill = skillKey(input.skill);
    if (skill in stats.skills) stats.skills[skill] += 1;
    return;
  }

  const isRead = READ_TOOLS.has(name);
  const isWrite = WRITE_TOOLS.has(name);
  if (!isRead && !isWrite) return;

  if (norm.includes("/.claude/reference/")) {
    const base = norm.slice(norm.lastIndexOf("/") + 1);
    const key = referenceFiles.find((f) => f.toLowerCase() === base);
    if (key) {
      if (isWrite) {
        stats.reference[key].writes += 1;
        session.wrote = true;
      } else {
        const entry = stats.reference[key];
        entry.reads += 1;
        session.read = true;
        // ISO timestamps compare as strings; keep the newest, since files
        // are visited in directory order, not chronological order.
        if (timestamp && (!entry.lastRead || timestamp > entry.lastRead)) {
          entry.lastRead = timestamp;
        }
      }
    } else if (isRead) {
      // Grep/Glob over the whole directory: a read, but not attributable.
      stats.referenceDirScans += 1;
      session.read = true;
    }
    return;
  }

  // Legacy per-machine auto-memory store: ~/.claude/projects/<dir>/memory/.
  // Keyed by store dir + basename: the base repo and each worktree can hold
  // their own store, and merging them by basename alone would let one read
  // make every same-named copy look used.
  if (norm.includes("/.claude/projects/") && (norm.includes("/memory/") || norm.endsWith("/memory.md"))) {
    const base = norm.slice(norm.lastIndexOf("/") + 1);
    const store = norm.match(/\/\.claude\/projects\/([^/]+)\//)?.[1] ?? "unknown-store";
    const entry = (stats.memory[`${store}/${base}`] ??= { writes: 0, reads: 0 });
    if (isWrite) {
      entry.writes += 1;
      session.wrote = true;
    } else {
      entry.reads += 1;
      session.read = true;
    }
  }
}

// Subagent transcripts live under <session>/subagents/; workflow agents sit
// deeper (subagents/workflows/<run>/agent-<id>.jsonl), so walk the whole tree.
// Only agent-*.jsonl files are transcripts: a workflow run also keeps a
// journal.jsonl beside its agents.
function subagentFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return subagentFiles(full);
    return e.name.startsWith("agent-") && e.name.endsWith(".jsonl") ? [full] : [];
  });
}

// Group files by session: <uuid>.jsonl plus <uuid>/subagents/**. sessionsRead
// and sessionsWrote count sessions, so a subagent's read marks its parent.
function sessionFiles(dir) {
  const sessions = new Map();
  const add = (id, files) => sessions.set(id, [...(sessions.get(id) ?? []), ...files]);
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith(".jsonl")) add(e.name.slice(0, -6), [{ file: path.join(dir, e.name), subagent: false }]);
    else if (e.isDirectory()) {
      add(e.name, subagentFiles(path.join(dir, e.name, "subagents")).map((file) => ({ file, subagent: true })));
    }
  }
  return [...sessions.values()].filter((files) => files.length > 0);
}

// Failure signature: tool name plus the first line of the error, with quoted
// strings, paths, file names, hex ids and digits replaced so the same failure
// on different inputs collapses into one line. Every remaining word must be
// on a fixed list of error vocabulary; any other word becomes <w>, so free
// text (names, tokens, prose) never reaches the output. A run of adjacent
// placeholders collapses into one. A Bash failure's first line is only
// "Exit code N", so its next line joins it, filtered the same way.
const ERROR_WORDS = new Set(`
  a an the and or but if of to in on at by for from with without into as is are was were be been
  being has have had do does did doesn't don't didn't can can't cannot could couldn't should must
  may might will would won't isn't aren't wasn't not no nor none any all only this that it its
  there than then yet still already before after while when since until again first last next
  more too many much less least most other same new old empty null undefined true false nan
  error errors err failed failure fail fails failing fatal warning warn exception panic abort
  aborted crash crashed not found no such file files directory directories dir folder path paths
  permission permissions denied access allowed disallowed forbidden unauthorized authentication
  auth authorization credentials token login logged required requires require timeout timed out
  time exit exited code codes status signal killed terminated interrupted cancelled canceled
  command commands cannot invalid unknown unrecognized unsupported unexpected expected refused
  reset connection connect connected network host hostname port socket request requests
  response server client gateway service unavailable bad internal http https url missing exists
  exist existing already busy blocked block rejected reject limit limits exceeded exceeds exceed
  maximum minimum max min size large long short tokens token lines line column character
  characters bytes byte syntax parse parsing parsed module modules package import export
  resolve resolved resolving load loading loaded read reading write writing written edit
  editing open opened close closed create created delete deleted remove removed rename copy
  move stat mkdir spawn run running execute executing executed process tool tools input output
  argument arguments parameter parameters option options flag value values type types key
  keys field property properties object array string number boolean function method call
  called match matches matched matching occurrence occurrences unique multiple replace
  replacement modified changed unchanged since yet user hook hooks denied sibling result
  results content contents data format encoding json yaml content memory disk space full
  quota rate retry retries attempt attempts reached depth recursion stack overflow
  heap version versions branch commit repository repo remote merge conflict conflicts
  checkout worktree git nothing working tree clean ahead behind diverged pull push fetch
  test tests passed skipped assertion assert config configuration setting settings
  environment variable variables defined declared supported support available install
  installed dependency dependencies build compile compilation compiled lint check checks
  ms seconds second minutes minute s bad many unable ok fatal usage help see did mean
  proceed want wants doesn't rejected stopped stop continue skip skipping ignored ignore
  denied dangerous sandbox mode plan approve approval approved below above threshold you your
  looking saw need needs specific range offset session followed wait waiting condition started
  shorter around returned schema validation latter use work sleep sleeps chain launch iterate
  pass window local temp background outline pretooluse posttooluse
`.trim().split(/\s+/));
const ERRNO_CODES = new Set(`
  ENOENT EACCES EPERM EEXIST EISDIR ENOTDIR ENOTEMPTY EBUSY EMFILE ENFILE ENOSPC EROFS EXDEV
  ELOOP ENAMETOOLONG EINVAL EAGAIN EPIPE ECONNREFUSED ECONNRESET ECONNABORTED ETIMEDOUT
  EHOSTUNREACH ENETUNREACH EADDRINUSE EADDRNOTAVAIL ENOTFOUND EAI_AGAIN ENOTSUP ENOSYS
  ECANCELED EBADF EINTR EIO ENOMEM ECHILD ESRCH ENOEXEC EPROTO ESPIPE ETXTBSY EFBIG EDQUOT
  ESTALE ENOTCONN ENOTSOCK EOF ERR_MODULE_NOT_FOUND ERR_REQUIRE_ESM ERR_INVALID_ARG_TYPE
  ERR_INVALID_ARG_VALUE ERR_UNKNOWN_FILE_EXTENSION ERR_UNHANDLED_REJECTION ERR_STREAM_PREMATURE_CLOSE
`.trim().split(/\s+/));
const isPlaceholder = (t) => t.startsWith("<");

function errorText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.filter((b) => b?.type === "text").map((b) => b.text).join("\n");
  return "";
}
function filterWords(line) {
  const replaced = line
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, " <str> ")
    .replace(/(?:[A-Za-z]:)?(?:[\\/]?[\w.@~+-]+)?(?:[\\/][\w.@~+-]*)+/g, " <path> ")
    .replace(/\b[\w-]+(?:\.[\w-]+)*\.[A-Za-z][A-Za-z0-9]{0,7}\b/g, " <file> ")
    .replace(/\b0x[0-9a-f]+\b|\b(?=[\w-]*\d)(?=[\w-]*[a-z])[\w-]{8,}\b/gi, " <id> ")
    .replace(/\d+/g, " <n> ");
  const out = [];
  for (const raw of replaced.match(/<(?:str|path|file|id|n)>|[A-Za-z][A-Za-z_']*|:/g) ?? []) {
    const word = raw.replace(/'+$/, "");
    const tok = isPlaceholder(raw) || raw === ":" || ERRNO_CODES.has(word) || ERROR_WORDS.has(word.toLowerCase())
      ? (isPlaceholder(raw) ? raw : word)
      : "<w>";
    const prev = out[out.length - 1];
    if (prev && isPlaceholder(tok) && isPlaceholder(prev)) {
      if (prev !== tok) out[out.length - 1] = "<w>"; // mixed run: one generic placeholder
      continue;
    }
    if (tok === ":" && (prev === undefined || prev === ":")) continue;
    out.push(tok);
  }
  return out.join(" ").replace(/ :/g, ":");
}
function signature(tool, content) {
  const lines = errorText(content)
    .replace(/<\/?tool_use_error>/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  const exit = lines[0].match(/^Exit code (\d+)$/);
  let norm = exit ? `Exit code ${exit[1].length <= 3 ? exit[1] : "<n>"}` : filterWords(lines[0]);
  if (exit && lines[1]) norm += ` | ${filterWords(lines[1])}`;
  return `${tool}: ${norm.slice(0, 160)}`;
}

// Refine's standing-rule phrases (.claude/skills/refine/SKILL.md), matched in
// genuine user turns only: top-level transcript, not a meta injection, compact
// summary or tool result, with harness-inserted tags stripped (a slash
// command's arguments stay, since the user typed them).
const STANDING_RULE = /\b(?:from now on|going forward|every time|always|never|i already told you|why do you keep)\b/i;
const MACHINE_TAGS = /<(system-reminder|task-notification|local-command-stdout|local-command-stderr|local-command-caveat|command-name|command-message|bash-stdout|bash-stderr)>[\s\S]*?<\/\1>/g;
function userTurnText(obj) {
  if (obj.type !== "user" || obj.isMeta || obj.isSidechain || obj.isCompactSummary) return "";
  const content = obj.message?.content;
  const text = typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.filter((b) => b?.type === "text").map((b) => b.text).join("\n")
      : "";
  return String(text ?? "").replace(MACHINE_TAGS, " ");
}

const USAGE_FIELDS = ["input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens"];
const seenMessages = new Set(); // message ids already summed, across sessions
const signatureSessions = new Map(); // signature -> [session record]
const sessionRecords = [];

function scanFile(file, session, subagent) {
  stats.transcriptFiles += 1;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (
      !line.includes('"tool_use"') &&
      !line.includes('"tool_result"') &&
      !line.includes('"usage"') &&
      !line.includes('"type":"user"')
    ) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const message = obj?.message;
    const usage = message?.usage;
    if (usage && typeof usage === "object") {
      // One line per content block, each repeating the message's id and
      // usage: keep one per id, the one with the most output (streaming).
      const id = message.id ?? obj.requestId;
      if (id == null) session.usage.push(usage);
      else {
        const prev = session.usageById.get(id);
        if (!prev || (Number(usage.output_tokens) || 0) > (Number(prev.output_tokens) || 0)) {
          session.usageById.set(id, usage);
        }
      }
    }
    if (!subagent && !session.standingRule && STANDING_RULE.test(userTurnText(obj))) {
      session.standingRule = true;
    }
    const content = message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === "tool_use" && block.name) {
        classify(block.name, block.input, session, obj.timestamp ?? null);
        if (block.id) session.toolNames.set(block.id, block.name);
        if (block.name === "Skill" && block.input?.skill) {
          const skill = skillKey(block.input.skill);
          if (skill) session.skills.set(skill, (session.skills.get(skill) ?? 0) + 1);
        }
      } else if (block?.type === "tool_result" && block.is_error === true) {
        const sig = signature(session.toolNames.get(block.tool_use_id) ?? "unknown", block.content);
        if (sig) session.errors.add(sig);
      }
    }
  }
}

for (const dir of transcriptDirs()) {
  stats.dirs.push(dir);
  for (const files of sessionFiles(dir)) {
    const session = {
      wrote: false,
      read: false,
      standingRule: false,
      skills: new Map(),
      toolNames: new Map(),
      errors: new Set(),
      usage: [],
      usageById: new Map(),
    };
    for (const { file, subagent } of files) scanFile(file, session, subagent);
    if (session.wrote) stats.sessionsWrote += 1;
    if (session.read) stats.sessionsRead += 1;

    const tokens = Object.fromEntries(USAGE_FIELDS.map((f) => [f, 0]));
    const counted = [...session.usage];
    for (const [id, usage] of session.usageById) {
      if (seenMessages.has(id)) continue; // resumed sessions copy earlier lines
      seenMessages.add(id);
      counted.push(usage);
    }
    for (const usage of counted) {
      for (const f of USAGE_FIELDS) tokens[f] += Number(usage[f]) || 0;
    }
    const record = { skills: session.skills, standingRule: session.standingRule, tokens };
    sessionRecords.push(record);
    for (const sig of session.errors) {
      const list = signatureSessions.get(sig) ?? [];
      list.push(record);
      signatureSessions.set(sig, list);
    }
  }
}

const median = (values) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

const MIN_PATTERN_SESSIONS = 3;
const patterns = {
  signatures: [...signatureSessions]
    .filter(([, records]) => records.length >= MIN_PATTERN_SESSIONS)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([sig, records]) => ({
      signature: sig,
      sessions: records.length,
      skills: [...new Set(records.flatMap((r) => [...r.skills.keys()]))].sort(),
    })),
  standingRuleSessions: {},
};

const cost = {
  attribution:
    "session-level, approximate: each skill is credited with the full token totals of every session that invoked it; uncached input = input_tokens + cache_creation_input_tokens",
  totals: Object.fromEntries(USAGE_FIELDS.map((f) => [f, 0])),
  bySkill: {},
};
const skillSessions = new Map(); // skill -> [{invocations, record}]
for (const record of sessionRecords) {
  for (const f of USAGE_FIELDS) cost.totals[f] += record.tokens[f];
  for (const [skill, invocations] of record.skills) {
    const list = skillSessions.get(skill) ?? [];
    list.push({ invocations, record });
    skillSessions.set(skill, list);
  }
}
for (const skill of [...skillSessions.keys()].sort()) {
  const list = skillSessions.get(skill);
  patterns.standingRuleSessions[skill] = list.filter((s) => s.record.standingRule).length;
  cost.bySkill[skill] = {
    invocations: list.reduce((n, s) => n + s.invocations, 0),
    sessions: list.length,
    medianOutputTokens: median(list.map((s) => s.record.tokens.output_tokens)),
    medianUncachedInput: median(
      list.map((s) => s.record.tokens.input_tokens + s.record.tokens.cache_creation_input_tokens),
    ),
  };
}

// Stale dated entries. Reference headings carry their date in parentheses,
// "## <title> (YYYY-MM-DD)" or "## <title> (YYYY-MM-DD, amended YYYY-MM-DD)",
// where the first date is when the entry was recorded. The older
// "### YYYY-MM-DD: <title>" form is still accepted. Entries retired by recall
// leave a "retired YYYY-MM-DD: <old claim>; reason: ..." line; those are
// listed separately once old enough to prune.
const SIX_MONTHS_MS = 183 * 24 * 60 * 60 * 1000;
const HEADING_PATTERNS = [
  /^##\s+(?<title>.+?)\s+\((?<date>\d{4}-\d{2}-\d{2})[^)]*\)\s*$/gm,
  /^###\s+(?<date>\d{4}-\d{2}-\d{2}):?\s*(?<title>.*)$/gm,
];
const RETIRED_PATTERN = /^retired\s+(?<date>\d{4}-\d{2}-\d{2}):\s*(?<claim>.*)$/gm;
const isStale = (date) => {
  const age = Date.now() - Date.parse(date);
  return Number.isFinite(age) && age > SIX_MONTHS_MS;
};
const staleEntries = [];
const staleRetired = [];
for (const file of referenceFiles) {
  const text = fs.readFileSync(path.join(referenceDir, file), "utf8");
  for (const pattern of HEADING_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const { date, title } = match.groups;
      if (isStale(date)) staleEntries.push({ file, date, title: title.trim() });
    }
  }
  for (const match of text.matchAll(RETIRED_PATTERN)) {
    const { date, claim } = match.groups;
    if (isStale(date)) staleRetired.push({ file, date, claim: claim.trim() });
  }
}

const hasHistory = stats.transcriptFiles > 0;
const neverRead = hasHistory
  ? referenceFiles.filter((f) => stats.reference[f].reads === 0)
  : [];
const neverInvoked = hasHistory ? skillNames.filter((s) => stats.skills[s] === 0) : [];
const memoryFiles = Object.keys(stats.memory);
const memoryNeverRead = memoryFiles.filter((f) => stats.memory[f].reads === 0);

if (jsonMode) {
  console.log(
    JSON.stringify({ ...stats, staleEntries, staleRetired, neverRead, neverInvoked, patterns, cost }, null, 2),
  );
  process.exit(0);
}

console.log(
  `memory-audit: ${stats.transcriptFiles} transcript file(s) in ${stats.dirs.length} project dir(s)`,
);
console.log(
  "counts are floor estimates: rotated history and Bash-tool reads (cat/grep) are not attributed\n",
);

if (!hasHistory) {
  console.log("no transcripts found for this checkout — nothing to audit on this machine.");
  process.exit(0);
}

const pad = (s, n) => String(s).padEnd(n);
console.log(pad("reference file", 36) + pad("writes", 8) + pad("reads", 7) + "last read");
for (const f of referenceFiles) {
  const r = stats.reference[f];
  console.log(pad(f, 36) + pad(r.writes, 8) + pad(r.reads, 7) + (r.lastRead?.slice(0, 10) ?? "-"));
}
if (stats.referenceDirScans > 0) {
  console.log(`(+${stats.referenceDirScans} directory-level scans, not attributed per file)`);
}
console.log(
  `sessions touching reference or memory: wrote ${stats.sessionsWrote}, read ${stats.sessionsRead}`,
);

if (neverRead.length > 0) {
  console.log(`\nnever read: ${neverRead.join(", ")} — pruning candidates; check before cutting.`);
}
if (staleEntries.length > 0) {
  console.log("\ndated entries older than 6 months (moment or standing truth?):");
  for (const e of staleEntries) console.log(`  ${e.file}  ${e.date}  ${e.title}`);
}
if (staleRetired.length > 0) {
  console.log("\nretired lines older than 6 months (prune candidates):");
  for (const e of staleRetired) console.log(`  ${e.file}  ${e.date}  ${e.claim}`);
}
if (memoryFiles.length > 0) {
  console.log(
    `\nlegacy auto-memory store: ${memoryFiles.length} file(s) touched, ${memoryNeverRead.length} never read.`,
  );
  console.log("archive candidates: migrate keepers to .claude/reference/, delete the rest.");
}
if (neverInvoked.length > 0) {
  console.log(`\nskills never invoked on this machine: ${neverInvoked.join(", ")}`);
  console.log("(description-matched auto-invocations count too, so zero means zero here)");
}

console.log(`\nfailure patterns (tool errors in ${MIN_PATTERN_SESSIONS}+ sessions; candidates for refine, not verdicts):`);
if (patterns.signatures.length === 0) console.log("  none");
for (const p of patterns.signatures) {
  console.log(`  ${p.sessions} sessions  ${p.signature}`);
  console.log(`    skills in those sessions: ${p.skills.join(", ") || "-"}`);
}
const ruleSkills = Object.entries(patterns.standingRuleSessions).filter(([, n]) => n > 0);
if (ruleSkills.length > 0) {
  console.log("sessions where the user set a standing rule, per invoked skill:");
  for (const [skill, n] of ruleSkills) console.log(`  ${pad(skill, 34)}${n}`);
}

const fmt = (n) => n.toLocaleString("en-US");
console.log("\ntoken cost (attribution is session-level and approximate: a skill is credited");
console.log("with the full totals of every session that invoked it):");
console.log(
  `  totals: input ${fmt(cost.totals.input_tokens)}, cache write ${fmt(cost.totals.cache_creation_input_tokens)}, ` +
    `cache read ${fmt(cost.totals.cache_read_input_tokens)}, output ${fmt(cost.totals.output_tokens)}`,
);
const costSkills = Object.entries(cost.bySkill).sort((a, b) => b[1].sessions - a[1].sessions || a[0].localeCompare(b[0]));
if (costSkills.length > 0) {
  console.log(`  ${pad("skill", 34)}${pad("calls", 7)}${pad("sessions", 10)}${pad("median out", 12)}median uncached in`);
  for (const [skill, c] of costSkills) {
    console.log(
      `  ${pad(skill, 34)}${pad(c.invocations, 7)}${pad(c.sessions, 10)}${pad(fmt(c.medianOutputTokens), 12)}${fmt(c.medianUncachedInput)}`,
    );
  }
}
