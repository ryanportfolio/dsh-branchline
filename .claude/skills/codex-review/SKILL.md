---
description: "Cross-vendor second opinion: Codex CLI (codex exec review, gpt-6.1-sol, high) over PR, branch, commit, or uncommitted diff, then each finding verified. Use: /codex-review, 'have Codex/Sol review this'."
---

# Codex review — cross-vendor second opinion

Run one fresh Codex CLI review and verify every finding locally. From Claude this supplies cross-vendor review; from Codex it supplies fresh context, not vendor independence. Keep the model-specific entrypoints separate: this defaults to Sol/high, and `astra-review` supplies Astra/medium. Honor explicit user model and effort choices rather than silently replacing them.

The requested review does not authorize fixes, publication, machine configuration changes, or paid credit purchases.

## Step 1: Preflight

Inspect `codex --version`, `codex login status`, and `codex exec review --help` locally before inference. Verify current support for the selector, the custom `[PROMPT]` argument, model/effort configuration, and output options used below; examples are not product guarantees. Do not probe models by spending usage.

**Model: always the newest Sol, named by its exact id.** `-m` takes a literal model id; there is no "latest Sol" alias, so the command pins one. The pin is `gpt-6.1-sol`. Before launch, check the `model` in `~/.codex/config.toml` and the Sol entries at developers.openai.com/api/docs/models. If a newer Sol exists, run with its exact id and tell the user the pin is stale. Do not edit the pins during the review: bumping every copy that pins `gpt-6.1-sol` (this skill's `.claude` and `.agents` copies, `codex-fullreview`, the global copies in `~/.claude/skills/` and `~/.agents/skills/`, and the Codex example in `impartial-review`) is a separate change the user authorizes. An explicit user model choice still wins. `astra-review` is exempt: it stays on Astra.

Accepted routes, either one: `codex login status` reports a ChatGPT login, or `config.toml` in `$CODEX_HOME` (default `~/.codex`) sets `model_provider` to a gateway, for example a CLIProxyAPI gateway over subscription accounts. Both are normal; record which one ran in the run metadata and add no caveat. When a gateway is set it carries the requests, whatever the login line says. Stop before inference only when neither holds (logged out or API-key login, and no gateway): ask the user to log in through their own terminal. The gateway is the user's own setup and its billing is their choice; never add, change or switch a provider, key or paid credits yourself, and never print credentials.

## Step 2: Identify scope

Use `$ARGUMENTS` if the user named a scope; otherwise infer from recent work. Resolve it to exact revisions before launch, and keep the matching `codex exec review` selector for the fallback path in Step 3:

| Scope | Base SHA | Head | Fallback selector |
|---|---|---|---|
| Uncommitted work (staged + unstaged + untracked) | `git rev-parse HEAD` | working tree | `--uncommitted` |
| Branch / PR diff | `git merge-base origin/<default-branch> HEAD` | `git rev-parse HEAD` | `--base origin/<default-branch>` |
| Single commit | `git rev-parse <SHA>^`, or the empty tree for a root commit | `<SHA>`, resolved to a full SHA | `--commit <SHA>` |

For a branch diff, fetch first (`git fetch origin <default-branch>`) and use the **remote-tracking ref** (`origin/main`, not `main`): fetch updates only the remote-tracking ref, so a local branch name can silently compare against a stale base. The external-review path reviews committed changes `base..head` only; with a dirty tree, state that uncommitted edits are outside the reviewed scope. The `--base` selector also reviews working-tree edits, so a branch review on the selector path requires a clean `git status --porcelain`: with a dirty tree, stop and ask the user to commit or set the edits aside, or review a clean worktree checked out at head. A root commit has no `<SHA>^`: on the external-review path use the empty tree `4b825dc642cb6eb9a060e54bf8d69288fbee4904` (`git hash-object -t tree /dev/null` in a SHA-1 repository) as base; the selector path keeps `--commit <SHA>`. State the scope in your first sentence so the user can redirect.

## Step 3: Launch the review

Run from the repository root. Create a new run directory atomically; never reuse one from an earlier invocation. Record the resolved scope in its manifest (below) before choosing the launch path.

**Pick the launch path.** The CLI rejects a scope selector combined with a custom prompt, so each run uses exactly one of these:

- **External-review path**, when the reviewed repository has `.agents/skills/external-review/SKILL.md`: review mode with a custom prompt and no selector. The prompt tells the reviewer to read that file completely and follow it, states the exact scope, and restates the leaf rules in one line. Name the file, not `$external-review`: on codex-cli 0.156.0 a `$skill` mention in a `codex exec review` prompt is not injected, and the skill's `allow_implicit_invocation: false` policy (kept so ordinary sessions never pick it up) hides it from the reviewer's skills list, so a mention alone never loads it. Review mode exposes no agent-spawning tools; with a bare selector the reviewer can auto-load a multi-agent review skill, fail to spawn agents, and report that as a gap. The external-review file pins it to a single-context leaf review of the recorded scope.
- **Selector path**, when that file is absent: the selector from Step 2 and Codex's built-in review rubric, unchanged.

Mandatory read before launching: [references/launch-example.md](references/launch-example.md), the full command for both paths; it sets `$RUN`, `$BASE`, `$HEAD_SHA` for the Step 4 snippet.

On the external-review path each scope has its own complete prompt. Substitute the resolved SHAs; append only a focus the user requests (below):

- Branch diff: `Read .agents/skills/external-review/SKILL.md completely and follow it for this review of the branch diff: base <base-sha>, head <head-sha>. Read the diff with git diff <base-sha> <head-sha>. Leaf review: no agents, no nested reviews, no edits.`
- Single commit, where base is the parent or, for a root commit, the empty tree from Step 2: `Read .agents/skills/external-review/SKILL.md completely and follow it for this review of commit <head-sha>: base <base-sha>, head <head-sha>. Read the diff with git diff <base-sha> <head-sha>. Leaf review: no agents, no nested reviews, no edits.`
- Uncommitted work: `Read .agents/skills/external-review/SKILL.md completely and follow it for this review of the uncommitted working tree (staged, unstaged, untracked) against head <head-sha>. Read tracked changes with git diff <head-sha>, list files with git status --porcelain --untracked-files=all, and read each untracked file's contents. Leaf review: no agents, no nested reviews, no edits.`

The prompts need no literal `$`; if you add one, escape it (`\$` in bash, `` `$ `` in PowerShell) or the shell expands it.

Launch it as a background or detached process and poll its log and exit status; a foreground tool call is killed at the harness ceiling (10 minutes for the Claude Code Bash tool) and takes the review with it, while a background call is not (verified 2026-09-19 with a 20 s job under a 3 s cap). Adapt shell quoting and stdin closure to the active runtime. On PowerShell, create a GUID-named directory and use supported process redirection or `cmd /c` for `< NUL`; PowerShell does not support `<` redirection. Keep report/log paths inside that unique directory. Redirect complete output to a file, never through `head` or `tail`.

Before launch, write run metadata: run ID, absolute workspace, requested scope, resolved base/head SHAs, CLI version, launch path (external-review or selector), command, requested model/effort, and start time. For uncommitted work, add staged/unstaged diff identities and relevant untracked path/content hashes; a HEAD SHA alone does not identify that content. For a branch or commit scope the working tree is out of scope: record the dirty path count from `git status --porcelain --untracked-files=all` and note those paths as excluded, without hashing them. Exclude task-owned report artifacts from the requested review. Use an isolated snapshot if concurrent writers cannot stop. Do not silently expand scope to unrelated changes.

The two paths supply different rubrics: `external-review` on one, the CLI's built-in review rubric on the other. For a special focus the user requests, append it to the external-review prompt; on the selector path, replace the selector with a prompt-only invocation that states the exact scope. Describe which rubric was actually supplied. Preserve least privilege; do not bypass approvals or sandbox protections for a reviewer. The one exception is auto-approving a user-approved browser MCP server (below).

**Live browser, when the user asks for or approves one.** Mandatory read before such a run: [references/live-browser.md](references/live-browser.md). Give the reviewer a fresh throwaway profile on local or test URLs only, never a signed-in or production app, and say in the prompt not to submit forms or change data.

Default effort is `high`; for a broad diff, `medium` is a planning option only when the user did not explicitly select effort. Astra retains its own medium default. State the selected setting before launch; runtime duration is not predictable from file count alone.

Monitor the task-owned process and logs with bounded waits. Log silence alone does not prove a stall. Record observed process status, elapsed time, and the agreed timeout; if stalled or timed out, terminate only this review process, preserve its partial output, and report the failed attempt. The one automatic retry described below then applies; any further run needs user agreement.

## Step 4: Collect and bind evidence

Accept a report only after this process exits successfully, the report is non-empty in this run's newly created directory, and the source manifest still matches the reviewed state. Record exit code, end time, report hash, and the model, effort, and session id from the `run.log` header (its `model:`, `reasoning effort:`, and `session id:` lines). The reviewer rollout's `turn_context` repeats them, and the snippet below prints them as a cross-check: disclose a mismatch with the header. If the header does not reveal model resolution, label the model as requested but unverified; never infer a resolved model from the entrypoint title.

**Read the session files, not `run.log`, for tool-call evidence.** `run.log` echoes the prompt and the diff, so a grep there for the skill path proves nothing. Skill reads, spawn calls, and diff reads come from the rollouts only; model, effort, and session id come from the `run.log` header. Mandatory read at this step: [references/rollout-evidence.md](references/rollout-evidence.md); run its snippet and record the output in the manifest.

- **Skill not loaded** (zero `skillReads` on the external-review path): attribute the run as a plain custom-prompt review, never as external-review. Review mode forces its own output schema, so external-review's `Scope:`, `Unavailable checks`, and `Verdict:` lines never reach the `-o` report. They are not a load signal on this path, and their absence is not a failure.
- **Findings**: on 0.156.0 the `-o` report can hold only `overall_explanation`. When it lacks per-finding detail, take the findings from `review_output` in the parent's `ExitedReviewMode`, which the snippet prints. In review mode, no `ExitedReviewMode` means the review did not finish; a plain `codex exec` browser run never has one (Step 3).
- **Nonzero `spawnCalls`** contradicts the leaf rules: disclose it.
- A plain `codex exec` browser run (Step 3) has no review sibling, so this snippet does not apply: take its evidence from the run's own rollout as the last paragraph of [references/live-browser.md](references/live-browser.md) describes; mandatory re-read at this step. The sibling requirements below are review-mode only.
- In review mode, a missing parent, not exactly one review sibling, or records that do not match these shapes leave skill load, spawn count, and scope identity unverified; say so, never report them as zero.

Check scope identity from the reviewer's commands. It is verified only when `diffReads` is at least 1 for the recorded SHAs (`git diff <base> <head>` or `git diff <base>..<head>`), and, for uncommitted work, `untrackedListed` is true and the manifest's dirty paths and hashes still match the working tree. Otherwise scope identity is unverified and the attribution says so. On the selector path the CLI builds the diff from the selector, and the parent and sibling layout was confirmed only for the custom-prompt path; run the same snippet with the resolved base and head, and treat scope identity as unverified when the reviewer's commands show no diff read against the recorded SHAs.

Nonzero exit, missing/empty report, or changed source means the review is failed or stale, not clean. Surface the relevant error with secrets redacted. A successful process that could not inspect code or run required checks has an incomplete review: retain useful findings but disclose missing coverage. Sandbox or network failures do not by themselves establish a code defect or a passing gate.

A failed run gets one automatic retry before you ask. Failed means a model rejection (for example `model_not_found` or `unknown provider for model <id>`), a nonzero exit, a missing or empty report, or a stall or timeout. The retry needs no further permission, runs in a new run directory, and depends on the cause:

- Model rejection: never drop `-m`/`-c`. Without `-m` the run inherits the `model` in `~/.codex/config.toml`, which can be a different reviewer family (Astra, say) than the one requested. Run `codex debug models` and look for a newer Sol slug; the catalog can still list a retired id, so a listed slug is a candidate, not proof of availability. When the rejected id is this skill's default pin and exactly one newer Sol appears, retry on it and tell the user the pin is stale. When the user chose the model, or no single newer Sol appears, skip the retry and ask which model to use; an explicit user model choice stays until the user changes it.
- Any other failure: retry the same command unchanged.
- Changed source: no retry. The reviewed content moved, so report the run as stale.

If the retry fails too, stop, report both attempts with their errors, and ask. Attribute the result to the model on the `run.log` header's `model:` line, or state that resolution remains unverified.

## Step 5: Verify every finding (precision stage)

Cross-vendor does not mean correct — Codex hallucinates too, and it reviewed without this session's context. Before surfacing, run a real check (`grep` call sites, read the cited lines) on **every** finding, all severities. Each one gets:

- **Confirmed** — evidence found, pass it through
- **Refuted** — checked and not real, drop it (optionally note under "checked and fine")
- **Kept with caveat** — one-line note on the residual uncertainty

Drop only on evidence, never because a finding "seems minor". Treat BLOCKING findings adversarially — try to refute each before accepting.

## Step 6: Present

Use the `impartial-review` presentation format: findings severity-ordered globally (🔴 BLOCKING, 🟡 SHOULD-FIX, 🟢 NITPICK), each with `path:line`, concrete description, and a specific fix. Map Codex's native labels onto that scheme during verification (e.g. P0/P1/critical → 🔴, P2/major → 🟡, P3/minor → 🟢), re-ranking where your verification disagrees. Grade against the change's goal: a finding limited to another code path, a rare input, a small performance cost, or extra compatibility is 🟢 whatever Codex labeled it, unless it breaks the goal; security, auth, and data-loss findings keep their impact severity. Then "Things I checked and verified fine" (merge Codex's list with your verification results); then a "Recommendation" that is concrete about merge readiness. Attribute the source using recorded run metadata: "Codex (<observed model and effort, or requested setting with resolution unverified>) reviewed <scope at source identity> via <external-review (skill read verified) | built-in rubric with `--base`/`--commit`/`--uncommitted` | custom prompt>, scope identity <verified | unverified>; N of M findings survived verification." Include material unavailable checks and the run evidence path.

Zero findings plus verified coverage and local checks supports a clean review of that scope. State merge readiness only when the relevant project gates and exact source identity also support it; the review itself does not authorize merging.

## Common mistakes

- A stale report from a previous attempt is not this process's result; unique directories plus process/source identity are required.
- Authentication, model aliases, flags, sandbox behavior, and billing may change; inspect local evidence instead of applying a historical machine repair automatically.
- A fresh same-vendor reviewer is independent context, not a cross-vendor opinion.
- A selector plus a custom prompt is rejected by the CLI. Where `.agents/skills/external-review/SKILL.md` exists, a bare selector is the wrong path, not the safer default: the reviewer may load a multi-agent skill it cannot run and report a gap instead of reviewing.
- Invoking `$external-review` by name instead of naming its file: on codex-cli 0.156.0 the mention is not injected and the skill is hidden from the reviewer's list, so it never loads.
- Taking evidence from the parent rollout alone: in review mode the reviewer's tool calls live in the sibling rollout, and the findings array lives in `ExitedReviewMode.review_output`.
- Do not pass findings through unchecked, treat review agreement as proof, or hide missing evidence behind exit code 0.
- Dropping `-m` after a model rejection: the run inherits the `~/.codex/config.toml` default, a different model than requested, and the attribution then names the wrong reviewer.
- Loosening the sandbox so a reviewer can run a browser. Give it the Playwright MCP server over CDP (Step 3) and keep `sandbox_mode` read-only.
- Do not widen scope, retry more than once, downgrade a requested model, repair machine-global configuration, or publish under review-only authorization.
