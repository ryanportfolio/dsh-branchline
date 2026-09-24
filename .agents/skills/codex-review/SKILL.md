---
name: "codex-review"
description: "Second-opinion review. Drives OpenAI Codex CLI (codex exec review, gpt-6-sol, high reasoning) over a PR, branch, commit, or uncommitted diff, then verifies each finding. Trigger: $codex-review, \"have Codex/Sol review this\"."
---

# Codex review

Run one fresh Codex CLI review and verify every finding locally. Invoked from Codex, the reviewer shares the author's vendor: it supplies fresh context, not vendor independence. Say so in the result; never call it a cross-vendor review. Keep the model-specific entrypoints separate: this skill defaults to Sol at high effort, and `astra-review` supplies Astra at medium. Honor explicit user model and effort choices rather than silently replacing them.

The requested review does not authorize fixes, commits, pushes, PRs, merges, publication, machine configuration changes, or paid credit purchases.

## Step 1: Preflight

Inspect `codex --version`, `codex login status`, and `codex exec review --help` locally before inference. Verify current support for the selector, the custom `[PROMPT]` argument, model and effort configuration, and output options used below; examples are not product guarantees. Do not probe models by spending usage.

**Model: always the newest Sol, named by its exact id.** `-m` takes a literal model id; there is no "latest Sol" alias, so the command pins one. The pin is `gpt-6-sol`. Before launch, check the `model` in `~/.codex/config.toml` and the Sol entries at developers.openai.com/api/docs/models. If a newer Sol exists, run with its exact id and tell the user the pin is stale. Do not edit pins during the review: bumping every copy that pins `gpt-6-sol` (the `.claude` and `.agents` copies of this skill, the global `~/.claude/skills/codex-review`, `codex-fullreview`, and the Codex example in `impartial-review`) is a separate change the user authorizes. An explicit user model choice still wins. `astra-review` is exempt: it stays on Astra.

Require the intended ChatGPT subscription authentication route. If logged out, ask the user to log in through their own terminal. If authentication or billing is ambiguous, stop before inference; never print credentials or switch to an API key or paid credits. A user-authorized alternative route must be explicit.

## Step 2: Identify scope

Use the scope named in the invocation input; otherwise infer it from recent work. Resolve it to exact revisions before launch, and keep the matching `codex exec review` selector for the fallback path in Step 3:

| Scope | Base SHA | Head | Fallback selector |
|---|---|---|---|
| Uncommitted work (staged, unstaged, untracked) | `git rev-parse HEAD` | working tree | `--uncommitted` |
| Branch or PR diff | `git merge-base origin/<default-branch> HEAD` | `git rev-parse HEAD` | `--base origin/<default-branch>` |
| Single commit | `git rev-parse <SHA>^`, or the empty tree for a root commit | `<SHA>`, resolved to a full SHA | `--commit <SHA>` |

For a branch diff, fetch first (`git fetch origin <default-branch>`) and use the remote-tracking ref (`origin/main`, not `main`). A fetch updates only the remote-tracking ref, so a local branch name can silently compare against a stale base. The external-review path reviews committed changes `base..head` only; with a dirty tree, state that uncommitted edits are outside the reviewed scope. The `--base` selector also reviews working-tree edits, so a branch review on the selector path requires a clean `git status --porcelain`: with a dirty tree, stop and ask the user to commit or set the edits aside, or review a clean worktree checked out at head. A root commit has no `<SHA>^`: on the external-review path use the empty tree `4b825dc642cb6eb9a060e54bf8d69288fbee4904` (`git hash-object -t tree /dev/null` in a SHA-1 repository) as base; the selector path keeps `--commit <SHA>`. State the scope in your first sentence so the user can redirect.

## Step 3: Launch the review

Run from the repository root. Create a new run directory atomically; never reuse one from an earlier invocation. Record the resolved scope in its manifest (below) before choosing the launch path.

**Pick the launch path.** The CLI rejects a scope selector combined with a custom prompt, so each run uses exactly one of these:

- **External-review path**, when the reviewed repository has `.agents/skills/external-review/SKILL.md`: review mode with a custom prompt and no selector. The prompt tells the reviewer to read that file completely and follow it, states the exact scope, and restates the leaf rules in one line. Name the file, not `$external-review`: on codex-cli 0.156.0 a `$skill` mention in a `codex exec review` prompt is not injected, and the skill's `allow_implicit_invocation: false` policy (kept so ordinary sessions never pick it up) hides it from the reviewer's skills list, so a mention alone never loads it. Review mode exposes no agent-spawning tools; with a bare selector the child reviewer can auto-load a multi-agent review skill, fail to spawn agents, and report that as a gap. The external-review file pins it to a single-context leaf review of the recorded scope.
- **Selector path**, when that file is absent: the selector from Step 2 and Codex's built-in review rubric, unchanged.

For example, a branch diff in a POSIX shell:

```bash
mkdir -p .tmp
RUN=$(mktemp -d .tmp/codex-review-XXXXXXXX)
git fetch origin main
BASE=$(git merge-base origin/main HEAD); HEAD_SHA=$(git rev-parse HEAD)
# External-review path (.agents/skills/external-review/SKILL.md exists):
codex exec review "Read .agents/skills/external-review/SKILL.md completely and follow it for this review of the branch diff: base $BASE, head $HEAD_SHA. Read the diff with git diff $BASE $HEAD_SHA. Leaf review: no agents, no nested reviews, no edits." -m gpt-6-sol -c model_reasoning_effort=high -o "$RUN/report.md" < /dev/null > "$RUN/run.log" 2>&1
# Selector path (no external-review skill):
codex exec review --base origin/main -m gpt-6-sol -c model_reasoning_effort=high -o "$RUN/report.md" < /dev/null > "$RUN/run.log" 2>&1
```

On the external-review path each scope has its own complete prompt. Substitute the resolved SHAs; append only a focus the user requests (below):

- Branch diff: `Read .agents/skills/external-review/SKILL.md completely and follow it for this review of the branch diff: base <base-sha>, head <head-sha>. Read the diff with git diff <base-sha> <head-sha>. Leaf review: no agents, no nested reviews, no edits.`
- Single commit, where base is the parent or, for a root commit, the empty tree from Step 2: `Read .agents/skills/external-review/SKILL.md completely and follow it for this review of commit <head-sha>: base <base-sha>, head <head-sha>. Read the diff with git diff <base-sha> <head-sha>. Leaf review: no agents, no nested reviews, no edits.`
- Uncommitted work: `Read .agents/skills/external-review/SKILL.md completely and follow it for this review of the uncommitted working tree (staged, unstaged, untracked) against head <head-sha>. Read tracked changes with git diff <head-sha>, list files with git status --porcelain --untracked-files=all, and read each untracked file's contents. Leaf review: no agents, no nested reviews, no edits.`

The prompts need no literal `$`; if you add one, escape it (`\$` in bash, `` `$ `` in PowerShell) or the shell expands it.

Launch it as a background or detached process and poll its log and exit status. A foreground shell call can hit the runtime's command timeout and take the review with it. Adapt shell quoting and stdin closure to the active shell. On PowerShell, create a GUID-named directory and use supported process redirection or `cmd /c` for `< NUL`; PowerShell does not support `<` redirection. Keep report and log paths inside that unique directory. Redirect complete output to a file, never through `head` or `tail`.

Before launch, write run metadata: run ID, absolute workspace, requested scope, resolved base and head SHAs, CLI version, launch path (external-review or selector), command, requested model and effort, and start time. For uncommitted work, add staged and unstaged diff identities and relevant untracked path and content hashes; a HEAD SHA alone does not identify that content. For a branch or commit scope the working tree is out of scope: record the dirty path count from `git status --porcelain --untracked-files=all` and note those paths as excluded, without hashing them. Exclude task-owned report artifacts from the requested review. Use an isolated snapshot if concurrent writers cannot stop. Do not silently expand scope to unrelated changes.

The two paths supply different rubrics: `external-review` on one, the CLI's built-in review rubric on the other. For a special focus the user requests, append it to the external-review prompt; on the selector path, replace the selector with a prompt-only invocation that states the exact scope. Describe which rubric was actually supplied. Preserve least privilege; do not bypass approvals or sandbox protections for the reviewer. The reviewer is a leaf: it must not dispatch a review of its own.

Default effort is `high`. For a broad diff, `medium` is a planning option only when the user did not explicitly select effort. Astra keeps its own medium default. State the selected setting before launch; runtime duration is not predictable from file count alone.

Monitor the task-owned process and logs with bounded waits. Log silence alone does not prove a stall. Record observed process status, elapsed time, and the agreed timeout. If stalled or timed out, terminate only this review process, preserve its partial output, and report the failed attempt. Do not start another usage-consuming run without existing explicit retry authorization or user agreement.

## Step 4: Collect and bind evidence

Accept a report only after this process exits successfully, the report is non-empty in this run's newly created directory, and the source manifest still matches the reviewed state. Record exit code, end time, report hash, and the model, effort, and session id from the `run.log` header (its `model:`, `reasoning effort:`, and `session id:` lines). The reviewer rollout's `turn_context` repeats them, and the snippet below prints them as a cross-check: disclose a mismatch with the header. If the header does not reveal model resolution, label the model as requested but unverified; never infer a resolved model from the entrypoint name.

**Read the session files, not `run.log`, for tool-call evidence.** `run.log` echoes the prompt and the diff, so a grep there for the skill path proves nothing. Skill reads, spawn calls, and diff reads come from the rollouts only; model, effort, and session id come from the `run.log` header. Take the `session id: <id>` line from the `run.log` header. These `codex exec review` patterns were confirmed on codex-cli 0.156.0:

- **Parent rollout** `${CODEX_HOME:-~/.codex}/sessions/YYYY/MM/DD/rollout-*-<id>.jsonl` holds only the `EnteredReviewMode` and `ExitedReviewMode` items. `ExitedReviewMode.review_output` carries `findings`, `overall_correctness`, `overall_explanation`, and `overall_confidence_score`.
- **Reviewer rollout**: a sibling file whose `session_meta` has `"parent_thread_id":"<id>"` and `"source":{"subagent":"review"}` (and `"multi_agent_version":"disabled"`, so no spawn tools). The reviewer's turn lives there; take all evidence below from it.
- **Skill load**: a `custom_tool_call` named `exec` whose `input` (JavaScript source calling `tools.exec_command`) contains `.agents/skills/external-review/SKILL.md`, or a `function_call` whose `arguments` contain it. The snippet prints each match; confirm it reads the file rather than searching for the path. A read command chained with others (for example `Get-Content <file>; git diff ...`) counts as a read; a `grep`, `rg`, `find`, or `ls` that only matches the path does not. An injected `<name>external-review</name>` block in a user-role message is an optional extra signal only: 0.156.0 injects none for exec prompts.
- **Spawn calls**: `function_call` records named `spawn_agent`. Expect zero.
- **Commands**: the `custom_tool_call` exec `input` and `function_call` `arguments` strings.

```bash
SID=$(sed -n 's/^session id: //p' "$RUN/run.log" | head -n 1)
node -e '
const fs = require("fs"), path = require("path");
const [sid, root, base, head] = process.argv.slice(1);
const files = [];
const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/^rollout-.*\.jsonl$/.test(e.name)) files.push(p); } };
walk(root);
const load = f => fs.readFileSync(f, "utf8").split("\n").flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });
const firstLine = f => { const fd = fs.openSync(f, "r"), b = Buffer.alloc(65536), parts = []; try { for (let n; (n = fs.readSync(fd, b, 0, b.length, null)) > 0;) { const i = b.subarray(0, n).indexOf(10); parts.push(Buffer.from(b.subarray(0, i < 0 ? n : i))); if (i >= 0) break; } } finally { fs.closeSync(fd); } return Buffer.concat(parts).toString("utf8"); };
const own = files.find(f => f.endsWith(`-${sid}.jsonl`));
if (!own) { console.log("parent rollout missing: skill load, spawns, scope identity, and findings unverified"); process.exit(2); }
const exited = load(own).filter(j => j.payload?.item?.type === "ExitedReviewMode").map(j => j.payload.item.review_output);
const stamp = path.basename(own).slice(8, 27);
const siblings = files.filter(f => { if (f === own || path.basename(f).slice(8, 27) < stamp) return false; const m = firstLine(f); return m.includes(`"parent_thread_id":"${sid}"`) && m.includes(`"source":{"subagent":"review"}`); });
if (siblings.length !== 1) { console.log({ parent: own, reviewSiblings: siblings.length, note: "need exactly one review sibling: skill load, spawns, and scope identity unverified" }); process.exit(3); }
const recs = load(siblings[0]);
const meta = recs[0]?.type === "session_meta" ? recs[0].payload : {};
const turn = recs.find(j => j.type === "turn_context")?.payload ?? {};
const toolText = j => j.payload?.type === "custom_tool_call" && j.payload.name === "exec" ? String(j.payload.input ?? "") : j.payload?.type === "function_call" ? String(j.payload.arguments ?? "") : "";
const texts = recs.map(toolText).filter(Boolean);
const skillRe = /\.agents[\\/]+skills[\\/]+external-review[\\/]+SKILL\.md/;
const skillReads = texts.filter(t => skillRe.test(t));
const injected = recs.filter(j => j.payload?.type === "message" && j.payload.role === "user" && JSON.stringify(j.payload.content).includes("<name>external-review</name>")).length;
const spawnCalls = recs.filter(j => j.payload?.type === "function_call" && j.payload.name === "spawn_agent").length;
const wanted = head ? [`git diff ${base} ${head}`, `git diff ${base}..${head}`] : [`git diff ${base}`];
const diffReads = texts.filter(t => wanted.some(w => t.includes(w))).length;
const untrackedListed = texts.some(t => t.includes("--untracked-files=all"));
console.log({ parent: own, sibling: siblings[0], multiAgent: meta.multi_agent_version, turnModel: turn.model, turnEffort: turn.effort, toolCalls: texts.length, skillReads: skillReads.length, skillInjected: injected, spawnCalls, diffReads, untrackedListed, exitedReviewMode: exited.length });
for (const t of skillReads) console.log("skill read:", t.slice(0, 200));
console.log(JSON.stringify(exited.at(-1) ?? null, null, 2));
' "$SID" "${CODEX_HOME:-$HOME/.codex}/sessions" "$BASE" "$HEAD_SHA"
```

For a single commit pass its base and head. For uncommitted work pass the head SHA and an empty string (`"$HEAD_SHA" ""`); the check then looks for `git diff <head-sha>`. Record the output in the manifest.

- **Skill not loaded** (zero `skillReads` on the external-review path): attribute the run as a plain custom-prompt review, never as external-review. Review mode forces its own output schema, so external-review's `Scope:`, `Unavailable checks`, and `Verdict:` lines never reach the `-o` report. They are not a load signal on this path, and their absence is not a failure.
- **Findings**: on 0.156.0 the `-o` report can hold only `overall_explanation`. When it lacks per-finding detail, take the findings from `review_output` in the parent's `ExitedReviewMode`, which the snippet prints. No `ExitedReviewMode` means the review did not finish.
- **Nonzero `spawnCalls`** contradicts the leaf rules: disclose it.
- A missing parent, not exactly one review sibling, or records that do not match these shapes leave skill load, spawn count, and scope identity unverified; say so, never report them as zero.

Check scope identity from the reviewer's commands. It is verified only when `diffReads` is at least 1 for the recorded SHAs (`git diff <base> <head>` or `git diff <base>..<head>`), and, for uncommitted work, `untrackedListed` is true and the manifest's dirty paths and hashes still match the working tree. Otherwise scope identity is unverified and the attribution says so. On the selector path the CLI builds the diff from the selector, and the parent and sibling layout was confirmed only for the custom-prompt path; run the same snippet with the resolved base and head, and treat scope identity as unverified when the reviewer's commands show no diff read against the recorded SHAs.

Nonzero exit, a missing or empty report, or changed source means the review failed or is stale, not clean. Surface the relevant error with secrets redacted. A successful process that could not inspect code or run required checks produced an incomplete review: keep useful findings but disclose missing coverage. Sandbox or network failures do not by themselves establish a code defect or a passing gate.

One invocation per request unless retries are already explicitly authorized. Model rejection is a failure, not permission to silently drop `-m` or `-c`. Offer a locally supported alternative, keep an explicit model choice until the user changes it, and use a new run directory for an authorized retry. Attribute any fallback to the model actually observed, or state that resolution remains unverified.

## Step 5: Verify every finding

A second opinion is not automatically correct. The reviewer can hallucinate, and it reviewed without this session's context. Before surfacing anything, run a real check (search call sites, read the cited lines) on every finding, all severities. Each one gets:

- **Confirmed:** evidence found; pass it through.
- **Refuted:** checked and not real; drop it, optionally noting it under "checked and fine".
- **Kept with caveat:** one-line note on the residual uncertainty.

Drop only on evidence, never because a finding seems minor. Treat BLOCKING findings adversarially: try to refute each before accepting it.

## Step 6: Present

Order findings by severity globally (🔴 BLOCKING, 🟡 SHOULD-FIX, 🟢 NITPICK), each with `path:line`, a concrete description, and a specific fix. Map Codex's native labels onto that scheme during verification (for example P0, P1, or critical to 🔴, P2 or major to 🟡, P3 or minor to 🟢), re-ranking where your verification disagrees. Then list "Things I checked and verified fine" (merge Codex's list with your verification results), then a "Recommendation" that is concrete about merge readiness.

Attribute the source from recorded run metadata: "Codex (<observed model and effort, or requested setting with resolution unverified>) reviewed <scope at source identity> via <external-review (skill read verified) | built-in rubric with `--base`/`--commit`/`--uncommitted` | custom prompt>, scope identity <verified | unverified>; N of M findings survived verification." State that the review ran from Codex and is same-vendor. Include material unavailable checks and the run evidence path.

Zero findings plus verified coverage and local checks supports a clean review of that scope. State merge readiness only when the relevant project gates and exact source identity also support it; the review itself does not authorize merging.

## Common mistakes

- A stale report from a previous attempt is not this process's result; unique directories plus process and source identity are required.
- Authentication, model ids, flags, sandbox behavior, and billing may change; inspect local evidence instead of applying a historical machine repair automatically.
- A fresh same-vendor reviewer is independent context, not a cross-vendor opinion.
- A selector plus a custom prompt is rejected by the CLI. Where `.agents/skills/external-review/SKILL.md` exists, a bare selector is the wrong path, not the safer default: the reviewer may load a multi-agent skill it cannot run and report a gap instead of reviewing.
- Invoking `$external-review` by name instead of naming its file: on codex-cli 0.156.0 the mention is not injected and the skill is hidden from the reviewer's list, so it never loads.
- Taking evidence from the parent rollout alone: in review mode the reviewer's tool calls live in the sibling rollout, and the findings array lives in `ExitedReviewMode.review_output`.
- Do not pass findings through unchecked, treat review agreement as proof, or hide missing evidence behind exit code 0.
- Do not widen scope, retry, downgrade a requested model, repair machine-global configuration, or publish under review-only authorization.
