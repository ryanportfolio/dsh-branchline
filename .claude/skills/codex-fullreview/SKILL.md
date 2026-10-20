---
name: codex-fullreview
description: "Full multi-agent Codex review: codex exec runs $impartial-review as Manager with fresh-context sub-reviewers (gpt-6.1-sol, high), then each finding is verified. Trigger: /codex-fullreview, \"full Codex review with sub-reviewers\"."
---

# Codex full review: multi-agent second opinion

Run one Codex CLI process in which Codex runs the repository's `impartial-review` skill as Manager: it spawns fresh-context sub-reviewers over an exact scope, verifies their findings, and writes one report. Then verify every finding locally. From Claude this supplies a cross-vendor review; from Codex it supplies fresh context, not vendor independence. `codex-review` is the single-context alternative; keep the two entrypoints separate. This one defaults to Sol/high, and `astra-fullreview` supplies Astra/medium. Honor explicit user model and effort choices rather than silently replacing them.

The requested review does not authorize fixes, publication, machine configuration changes, or paid credit purchases.

## Step 1: Preflight

Inspect `codex --version`, `codex login status`, and `codex exec --help` locally before inference. Verify current support for `-s/--sandbox read-only`, `-m/--model`, `-c/--config`, `-o/--output-last-message`, and the positional `[PROMPT]` after the options; examples are not product guarantees. Do not probe models by spending usage.

**Require the native Manager skill.** Use `.agents/skills/impartial-review/SKILL.md` at the root of the reviewed repository. If the repository has none, use the global copy at `~/.agents/skills/impartial-review/SKILL.md`, expanded to an absolute path, and name that path wherever the prompts below say `.agents/skills/impartial-review/SKILL.md`. If neither exists, stop before inference: say that this entrypoint needs that skill and point to `codex-review`. Do not substitute a plain prompt and call it a full review.

**Model: always the newest Sol, named by its exact id.** `-m` takes a literal model id; there is no "latest Sol" alias, so the command pins one. The pin is `gpt-6.1-sol`. Before launch, check the `model` in `~/.codex/config.toml` and the Sol entries at developers.openai.com/api/docs/models. If a newer Sol exists, run with its exact id and tell the user the pin is stale. Do not edit the pins during the review: bumping every copy that pins `gpt-6.1-sol` (this skill, the `.claude` and `.agents` copies of `codex-review`, the global copies in `~/.claude/skills/` and `~/.agents/skills/`, and the Codex example in `impartial-review`) is a separate change the user authorizes. An explicit user model choice still wins. `astra-fullreview` is exempt: it stays on Astra.

Accepted routes, either one: `codex login status` reports a ChatGPT login, or `config.toml` in `$CODEX_HOME` (default `~/.codex`) sets `model_provider` to a gateway, for example a CLIProxyAPI gateway over subscription accounts. Both are normal; record which one ran in the run metadata and add no caveat. When a gateway is set it carries the requests, whatever the login line says. Stop before inference only when neither holds (logged out or API-key login, and no gateway): ask the user to log in through their own terminal. The gateway is the user's own setup and its billing is their choice; never add, change or switch a provider, key or paid credits yourself, and never print credentials.

## Step 2: Identify scope

Use `$ARGUMENTS` if the user named a scope; otherwise infer from recent work. Resolve it to exact revisions before launch:

| Scope | Base SHA | Head |
|---|---|---|
| Uncommitted work (staged + unstaged + untracked) | `git rev-parse HEAD` | working tree |
| Branch / PR diff | `git merge-base origin/<default-branch> HEAD` | `git rev-parse HEAD` |
| Single commit | `git rev-parse <SHA>^`; for a root commit, the empty tree `4b825dc642cb6eb9a060e54bf8d69288fbee4904` | `<SHA>`, resolved to a full SHA |

For a branch diff, fetch first (`git fetch origin <default-branch>`) and use the remote-tracking ref (`origin/main`, not `main`): fetch updates only the remote-tracking ref, so a local branch name can silently compare against a stale base. A branch review covers committed changes `base..head` only: check that `git status --porcelain` is clean first, or state that uncommitted edits are outside the reviewed scope. State the scope in your first sentence so the user can redirect.

## Step 3: Launch the review

Run from the repository root. Create a new run directory atomically; never reuse one from an earlier invocation. Use plain `codex exec` in the read-only sandbox, not `codex exec review`: review mode exposes no agent-spawning tools, while plain `codex exec` exposes `spawn_agent`, `wait_agent`, and the other collaboration tools. The prompt tells Codex to read `.agents/skills/impartial-review/SKILL.md` completely and act as its Manager, states the exact scope, and fixes the sub-reviewer settings. Name the file: on codex-cli 0.156.0 a `$skill` mention in an exec prompt is not injected, so only a file read loads the skill. For example, a branch diff in a POSIX shell:

```bash
mkdir -p .tmp
RUN=$(mktemp -d .tmp/codex-fullreview-XXXXXXXX)
git fetch origin main
BASE=$(git merge-base origin/main HEAD); HEAD_SHA=$(git rev-parse HEAD)
codex exec -s read-only -m gpt-6.1-sol -c model_reasoning_effort=high -o "$RUN/report.md" "Read .agents/skills/impartial-review/SKILL.md completely and act as its Manager on the branch diff: base $BASE, head $HEAD_SHA. Read the diff with git diff $BASE $HEAD_SHA. Spawn fresh-context sub-reviewers with spawn_agent, fork_turns \"none\", model gpt-6.1-sol, reasoning_effort high, as the skill directs; each is a leaf reviewer. Start no codex exec or other reviewer CLI process; if agent tools are missing, say so in the report. Author brief: $RUN/brief.md; give it only to the intent reviewer, as the skill directs; every other sub-reviewer gets the diff without it. No file edits, no Git writes, no publication. Verify the sub-reviewers' findings and write the final verified report. First line: Scope: base $BASE, head $HEAD_SHA. Second line: Sub-reviewers: <number spawned>." < /dev/null > "$RUN/run.log" 2>&1
```

Each scope has its own complete prompt. Substitute the resolved SHAs; append only a focus the user requests:

- Branch diff: the prompt in the example above (drop its author-brief sentence for a fully blind review).
- Single commit, where base is the parent or, for a root commit, the empty tree: `Read .agents/skills/impartial-review/SKILL.md completely and act as its Manager on commit <head-sha>: base <base-sha>, head <head-sha>. Read the diff with git diff <base-sha> <head-sha>. Spawn fresh-context sub-reviewers with spawn_agent, fork_turns "none", model gpt-6.1-sol, reasoning_effort high, as the skill directs; each is a leaf reviewer. Start no codex exec or other reviewer CLI process; if agent tools are missing, say so in the report. No file edits, no Git writes, no publication. Verify the sub-reviewers' findings and write the final verified report. First line: Scope: base <base-sha>, head <head-sha>. Second line: Sub-reviewers: <number spawned>.`
- Uncommitted work: `Read .agents/skills/impartial-review/SKILL.md completely and act as its Manager on the uncommitted working tree (staged, unstaged, untracked) against head <head-sha>. Read tracked changes with git diff <head-sha>, list files with git status --porcelain --untracked-files=all, and read each untracked file's contents. Spawn fresh-context sub-reviewers with spawn_agent, fork_turns "none", model gpt-6.1-sol, reasoning_effort high, as the skill directs; each is a leaf reviewer. Start no codex exec or other reviewer CLI process; if agent tools are missing, say so in the report. No file edits, no Git writes, no publication. Verify the sub-reviewers' findings and write the final verified report. First line: Scope: uncommitted, head <head-sha>, paths <every dirty path, comma-separated>. Second line: Sub-reviewers: <number spawned>.`

**Author brief.** By default, write `$RUN/brief.md` before launch and add this sentence to the prompt, after the scope: `Author brief: <path to brief.md>; give it only to the intent reviewer, as the skill directs; every other sub-reviewer gets the diff without it.` Its first line is exactly `Author brief <run directory name>` (for example `Author brief codex-fullreview-Ab12Cd34`), a marker Step 4 uses to confirm which sub-reviewers received it. The brief holds facts only: the goal in one or two sentences, the files or behaviors most likely to break, related work in flight (other PRs, merge order), and the checks already run with their results. No verdicts or opinions. The skill's diff-only reviewers never see it, so the run keeps a layer free of the author's framing, while the intent reviewer checks the change against its purpose. Skip the brief when the user asks for a fully blind review; the run then has no intent reviewer. Record in the metadata whether a brief was supplied and its hash.

The prompts need no literal `$`; if you add one, escape it (`\$` in bash, `` `$ `` in PowerShell) or the shell expands it. Do not pass `--ephemeral`: Step 4 reads the persisted session file.

The prompt forbids the skill's CLI fallback on purpose. Nested `codex exec` processes bill separately, leave no parent link in the session files, and usually fail inside the read-only sandbox. A run without agent tools should report that gap, not hide it.

Launch it as a background or detached process and poll its log and exit status; a foreground tool call is killed at the harness ceiling (10 minutes for the Claude Code Bash tool) and takes the review with it. Adapt shell quoting and stdin closure to the active runtime. On PowerShell, create a GUID-named directory and use supported process redirection or `cmd /c` for `< NUL`; PowerShell does not support `<` redirection. Keep report and log paths inside that unique directory. Redirect complete output to a file, never through `head` or `tail`.

Before launch, write run metadata: run ID, absolute workspace, requested scope, resolved base/head SHAs, CLI version, launch path (impartial-review Manager), command, requested model/effort, and start time. For uncommitted work, add staged/unstaged diff identities and relevant untracked path/content hashes; a HEAD SHA alone does not identify that content. For a branch or commit scope the working tree is out of scope: record the dirty path count from `git status --porcelain --untracked-files=all` and note those paths as excluded, without hashing them. Exclude task-owned report artifacts from the requested review. Use an isolated snapshot if concurrent writers cannot stop. Do not silently expand scope to unrelated changes.

For a special focus the user requests, append it to the prompt. Preserve least privilege; do not bypass approvals or sandbox protections for the Manager or its sub-reviewers. Default effort is `high`; for a broad diff, `medium` is a planning option only when the user did not explicitly select effort. State the selected setting before launch. Runtime is longer than `codex-review` and not predictable from file count.

Monitor the task-owned process with bounded waits. The parent `run.log` can stay silent while sub-reviewers work; their session files (Step 4) growing under `${CODEX_HOME:-~/.codex}/sessions` is progress. Record observed process status, elapsed time, and the agreed timeout; if stalled or timed out, terminate only this review process, preserve its partial output, and report the failed attempt. The one automatic retry described below then applies; any further run needs user agreement.

## Step 4: Collect and bind evidence

Accept a report only after this process exits successfully, the report is non-empty in this run's newly created directory, and the source manifest still matches the reviewed state. Record exit code, end time, report hash, and the model, effort, and session id from the `run.log` header (its `model:`, `reasoning effort:`, and `session id:` lines); take them from the header, not from session files. If the header does not reveal model resolution, label the model as requested but unverified; never infer a resolved model from the entrypoint title.

**Read the session file, not `run.log`, for tool-call evidence.** `run.log` echoes the skill text and the diff, so a grep there for the skill path or for `spawn_agent` proves nothing. Skill reads, spawn calls, and spawned children come from the session files only. Take the `session id: <id>` line from the `run.log` header; the session file is `${CODEX_HOME:-~/.codex}/sessions/YYYY/MM/DD/rollout-*-<id>.jsonl`. In it:

- **Skill load**: a `custom_tool_call` named `exec` whose `input` (JavaScript source calling `tools.exec_command`) contains `.agents/skills/impartial-review/SKILL.md`, or a `function_call` whose `arguments` contain it. The snippet prints each match; confirm it reads the file chosen in Step 1 rather than searching for the path, and disclose a read of any other copy. A read command chained with others (for example `Get-Content <file>; git diff ...`) counts as a read; a `grep`, `rg`, `find`, or `ls` that only matches the path does not. An injected `<name>impartial-review</name>` block in a user-role message is an optional extra signal only: 0.156.0 injects none for exec prompts.
- **Spawn calls**: records with `"type":"response_item"` whose payload has `"type":"function_call"` and `"name":"spawn_agent"` (namespace `collaboration`); the `arguments` string holds `fork_turns`, `model`, and `reasoning_effort`. A call can fail, so calls are not sub-reviewers. Arguments that do not parse as JSON leave that call's settings unverified; the snippet reports them instead of crashing.
- **Spawned children**: other session files whose `session_meta` source carries `"thread_spawn":{"parent_thread_id":"<id>"`. Match that exact prefix: a bare `"parent_thread_id"` match also counts `guardian` sessions (`"subagent":{"other":"guardian"}`), which are not reviewers.

This format was confirmed on codex-cli 0.156.0: spawn calls and spawned children matched the shapes above, and the skill load appeared as a `custom_tool_call` exec read, with no injected block. Recheck it when the CLI version changes.

```bash
SID=$(sed -n 's/^session id: //p' "$RUN/run.log" | head -n 1)
node -e '
const fs = require("fs"), path = require("path");
const [sid, root, rawMarker] = process.argv.slice(1);
const marker = (rawMarker ?? "").trim();
const files = [];
const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/^rollout-.*\.jsonl$/.test(e.name)) files.push(p); } };
walk(root);
const own = files.find(f => f.endsWith(`-${sid}.jsonl`));
if (!own) { console.log("session file missing: spawn count and skill load unverified"); process.exit(2); }
const recs = fs.readFileSync(own, "utf8").split("\n").flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });
const parse = s => { try { return JSON.parse(s); } catch { return null; } };
const calls = recs.filter(j => j.payload?.type === "function_call" && j.payload.name === "spawn_agent").map(j => parse(j.payload.arguments));
const toolText = j => j.payload?.type === "custom_tool_call" && j.payload.name === "exec" ? String(j.payload.input ?? "") : j.payload?.type === "function_call" ? String(j.payload.arguments ?? "") : "";
const skillRe = /\.agents[\\/]+skills[\\/]+impartial-review[\\/]+SKILL\.md/;
const skillReads = recs.map(toolText).filter(t => skillRe.test(t));
const injected = recs.filter(j => j.payload?.type === "message" && j.payload.role === "user" && JSON.stringify(j.payload.content).includes("<name>impartial-review</name>")).length;
const stamp = path.basename(own).slice(8, 27);
const firstLine = f => { const fd = fs.openSync(f, "r"), b = Buffer.alloc(65536), parts = []; try { for (let n; (n = fs.readSync(fd, b, 0, b.length, null)) > 0;) { const i = b.subarray(0, n).indexOf(10); parts.push(Buffer.from(b.subarray(0, i < 0 ? n : i))); if (i >= 0) break; } } finally { fs.closeSync(fd); } return Buffer.concat(parts).toString("utf8"); };
const children = files.filter(f => f !== own && path.basename(f).slice(8, 27) >= stamp && firstLine(f).includes(`"thread_spawn":{"parent_thread_id":"${sid}"`));
const briefed = marker ? children.filter(f => fs.readFileSync(f, "utf8").includes(marker)).length : null;
console.log({ session: own, spawnCalls: calls.length, malformedSpawnArgs: calls.filter(a => !a).length, spawnedChildren: children.length, failedSpawns: calls.length - children.length, briefedChildren: briefed, skillReads: skillReads.length, skillInjected: injected });
for (const a of calls) console.log(a ? [a.task_name, a.fork_turns, a.model, a.reasoning_effort].join(" ") : "malformed spawn arguments: settings unverified");
for (const t of skillReads) console.log("skill read:", t.slice(0, 200));
' "$SID" "${CODEX_HOME:-$HOME/.codex}/sessions" "$(head -n 1 "$RUN/brief.md" 2>/dev/null)"
```

Record the session file path and all counts in the manifest.

- **Sub-reviewers that ran = spawned children.** Disclose `spawnCalls - spawnedChildren` as failed spawns. If children exceed calls, or the session file is missing or does not match this shape, the count is unverified: report it that way, never as zero and never as the Manager's own claim.
- **Intent reviewer = children whose session file contains the brief's first-line marker** (`briefedChildren`; `null` when no brief was supplied). Exactly one means the intent reviewer ran. Zero with a brief supplied means it did not run: the attribution says `brief supplied, intent reviewer not run`, never `ran with brief`. More than one means the brief reached a diff-only reviewer, so that run has no diff-only layer free of the author's framing; disclose it. An unreadable session file leaves the intent reviewer unverified.
- **Zero children** in a readable session file means **no sub-reviewers ran**: the run was a single-context review by the Manager, and the attribution says so plainly.
- A spawn with `fork_turns` other than `"none"`, or with a different model or effort, is disclosed with its actual settings.
- **Skill not loaded**: with no skill read, secondary signals are the report's `Scope:` and `Sub-reviewers:` lines and spawned children. With none of these, attribute the run as a plain custom-prompt review, never as impartial-review.

Check scope identity: the report's `Scope:` line must match the recorded base and head, and for uncommitted work its dirty path list (and hashes where recorded) must match the manifest. A missing line leaves scope identity unverified, and the attribution must say so. A mismatched line means the report does not cover the recorded scope.

Nonzero exit, missing/empty report, or changed source means the review is failed or stale, not clean. Surface the relevant error with secrets redacted. A successful process that could not inspect code or run required checks has an incomplete review: retain useful findings but disclose missing coverage. The read-only sandbox applies to the Manager and its sub-reviewers; a check that needs writes, installs, or network is unavailable, not passed. Sandbox or network failures do not by themselves establish a code defect or a passing gate.

A failed run gets one automatic retry before you ask. Failed means a model rejection (for example `model_not_found` or `unknown provider for model <id>`), a nonzero exit, a missing or empty report, or a stall or timeout. The retry needs no further permission, runs in a new run directory, and depends on the cause:

- Model rejection: never drop `-m`/`-c`. Without `-m` the run inherits the `model` in `~/.codex/config.toml`, which can be a different reviewer family (Astra, say) than the one requested. Run `codex debug models` and look for a newer Sol slug; the catalog can still list a retired id, so a listed slug is a candidate, not proof of availability. When the rejected id is this skill's default pin and exactly one newer Sol appears, retry on it, substituting it for every `gpt-6.1-sol` in the command, including the `model` the prompt passes to sub-reviewers, and tell the user the pin is stale. When the user chose the model, or no single newer Sol appears, skip the retry and ask which model to use; an explicit user model choice stays until the user changes it.
- Any other failure: retry the same command unchanged.
- Changed source: no retry. The reviewed content moved, so report the run as stale.

If the retry fails too, stop, report both attempts with their errors, and ask. Attribute the result to the model on the `run.log` header's `model:` line, or state that resolution remains unverified.

## Step 5: Verify every finding (precision stage)

The Manager's verification is same-vendor and ran without this session's context; it does not replace yours. Before surfacing, run a real check (`grep` call sites, read the cited lines) on **every** finding, all severities. Each one gets:

- **Confirmed**: evidence found, pass it through.
- **Refuted**: checked and not real, drop it (optionally note under "checked and fine").
- **Kept with caveat**: one-line note on the residual uncertainty.

Drop only on evidence, never because a finding "seems minor". Treat BLOCKING findings adversarially: try to refute each before accepting.

## Step 6: Present

Use the `impartial-review` presentation format: findings severity-ordered globally (🔴 BLOCKING, 🟡 SHOULD-FIX, 🟢 NITPICK), each with `path:line`, concrete description, and a specific fix. Map Codex's native labels onto that scheme during verification (P0/P1/critical → 🔴, P2/major → 🟡, P3/minor → 🟢), re-ranking where your verification disagrees; then "Things I checked and verified fine" (merge Codex's list with your verification results); then a "Recommendation" that is concrete about merge readiness.

Attribute the source using recorded run metadata: "Codex (<observed model and effort, or requested setting with resolution unverified>) ran <impartial-review as Manager (skill read verified) | a plain custom prompt> over <scope at source identity>, scope identity <verified | unverified>, with <N sub-reviewers (fork_turns none: K; F failed spawns) | no sub-reviewers ran | spawn count unverified>, intent reviewer <ran with brief | brief supplied, intent reviewer not run | brief reached N reviewers | not run: no brief | unverified>, open-lens reviewer <chose LENSES, per the Manager's report | not run>; M of T findings survived verification." When the intent reviewer ran, keep the Manager's blind / intent / both tag on each finding. Carry the Manager's list of skipped standard areas and their reasons into the report; a skipped area with no stated reason is a coverage gap to disclose. Include material unavailable checks, the run directory, and the session file the count came from.

Zero findings plus verified coverage and local checks supports a clean review of that scope. State merge readiness only when the relevant project gates and exact source identity also support it; the review itself does not authorize merging.

## Common mistakes

- `codex exec review` for this entrypoint: review mode has no agent tools, so the Manager cannot spawn anyone.
- A stale report or session file from a previous attempt is not this process's result; unique directories plus process, session, and source identity are required.
- Counting `spawn_agent` mentions in `run.log`, counting spawn calls as sub-reviewers (a call can fail), or matching a bare `"parent_thread_id"` (it also counts guardian sessions). Sub-reviewers are children under `"thread_spawn"`.
- Calling a zero-spawn run a multi-agent review, or hiding an unverified count behind the Manager's own claim.
- Authentication, model aliases, flags, sandbox behavior, session file format, and billing may change; inspect local evidence instead of applying a historical machine repair automatically.
- Do not pass findings through unchecked, treat reviewer agreement as proof, or hide missing evidence behind exit code 0.
- Do not widen scope, retry more than once, downgrade a requested model, repair machine-global configuration, or publish under review-only authorization.
