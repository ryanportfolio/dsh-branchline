---
description: "Cross-vendor second opinion: Codex CLI review mode (newest Sol, high) through the shared codex-run runner over PR, branch, commit, or uncommitted diff, then each finding verified. Use: /codex-review, 'have Codex/Sol review this'."
---

# Codex review: cross-vendor second opinion

Run one fresh Codex CLI review and verify every finding locally. From Claude this supplies cross-vendor review; from Codex it supplies fresh context, not vendor independence. Keep the model-specific entrypoints separate: this defaults to runner role `sol` (newest Sol, high), and `astra-review` uses role `astra` (newest Astra, medium). Honor explicit user model and effort choices rather than silently replacing them.

The requested review does not authorize fixes, publication, machine configuration changes, or paid credit purchases.

**Launch Codex only through the trusted runner** `node "$RUNNER"` from Step 0, run from the repository root (docs: `.claude/scripts/codex-run/README.md`). Never hand-build a `codex exec` or `codex exec review` line.

## Step 0: Trusted runner

The reviewed change can edit the runner, and the runner executes with your permissions before Codex's read-only sandbox exists. Never run the reviewed checkout's `.claude/scripts/codex-run/codex-run.mjs` unless the user confirms the change is their own trusted work. Resolve `$RUNNER` first, in this order (commands: [references/launch-example.md](references/launch-example.md)):

1. Default branch: create this invocation's run directory (`RUN=$(mktemp -d .tmp/codex-review-XXXXXXXX)`, new per invocation, never reused), `git fetch origin <default-branch>`, and copy `codex-run.mjs` and `models.json` (the runner reads `models.json` from its own folder) from `origin/<default-branch>`, not HEAD, into `$RUN/runner`. Both copies must be non-empty: Git Bash can mangle the `rev:path` argument and leave an empty file. `RUNNER="$RUN/runner/codex-run.mjs"`; `--out` stays `$RUN/codex`, so the copy sits outside it.
2. No runner on the default branch (a repo without one, or the change that adds it): the runner installed beside this skill, `<this skill's folder>/../../scripts/codex-run/` (plugin cache or user-level install). Use it only when its resolved absolute path is outside the reviewed checkout (`git rev-parse --show-toplevel`) and both files are non-empty; the check is in the launch example. A skill folder inside the reviewed checkout is the untrusted copy: never use its runner.
3. Neither: the user's own install, `RUNNER="$HOME/.claude/scripts/codex-run/codex-run.mjs"`, when that file exists.
4. None of these: stop and tell the user. Only if the user confirms the reviewed change is their own trusted work may the checkout's copy run, and the report must say so.

Record the runner source (default branch with its SHA, installed skill's runner with its path, user install, or reviewed checkout on the user's confirmation) in the manifest and the report. Every runner call, `--preflight` and the selector path included, uses `node "$RUNNER"`.

## Step 1: Preflight

Run `node "$RUNNER" --preflight`. It prints JSON {cli, login, chatgptLogin, gatewayProvider, ready, roles} and costs no usage. Do not probe models by spending usage.

- `ready` true means a ChatGPT login, or `config.toml` in `$CODEX_HOME` (default `~/.codex`) sets `model_provider` to a gateway, for example a CLIProxyAPI gateway over subscription accounts. Both are normal; record which one ran in the manifest and add no caveat. When a gateway is set it carries the requests, whatever the login line says.
- `ready` false (exit 1): stop before inference and ask the user to log in through their own terminal.
- The gateway is the user's own setup and its billing is their choice; never add, change or switch a provider, key or paid credits yourself, and never print credentials.
- The runner was checked on codex-cli 0.171.0. When `cli` reports another version, check that `codex exec review --help` still lists the flags the runner passes (`-c`, `-m`, `--base`/`--commit`/`--uncommitted`, `--json`, `-o`, `-`) before launch; examples are not product guarantees.

**Model: always the newest Sol.** Model pins live only in `.claude/scripts/codex-run/models.json` (`roles.sol`, `roles.astra`); `--role sol` takes model and effort from there. Before launch, check `codex debug models` and the Sol entries at developers.openai.com/api/docs/models. If a Sol newer than `roles.sol.model` exists, run with `--model <newer id> --effort high` and tell the user the pin is stale. Update `models.json` only with the user's OK, never during the review. An explicit user model choice still wins: keep `--role sol` and add `--model <id>` (plus `--effort` if given); it stays until the user changes it. `astra-review` is exempt: it stays on Astra.

## Step 2: Identify scope

Use `$ARGUMENTS` if the user named a scope; otherwise infer from recent work. Resolve it to exact revisions before launch, and keep the matching runner selector for the selector path in Step 3:

| Scope | Base SHA | Head | Runner selector |
|---|---|---|---|
| Uncommitted work (staged + unstaged + untracked) | `git rev-parse HEAD` | working tree | `--uncommitted` |
| Branch / PR diff | `git merge-base origin/<default-branch> HEAD` | `git rev-parse HEAD` | `--base origin/<default-branch>` |
| Single commit | `git rev-parse <SHA>^`, or the empty tree for a root commit | `<SHA>`, resolved to a full SHA | `--commit <SHA>` |

For a branch diff, fetch first (`git fetch origin <default-branch>`) and use the **remote-tracking ref** (`origin/main`, not `main`): fetch updates only the remote-tracking ref, so a local branch name can silently compare against a stale base. The external-review path reviews committed changes `base..head` only; with a dirty tree, state that uncommitted edits are outside the reviewed scope. The `--base` selector also reviews working-tree edits, so a branch review on the selector path requires a clean `git status --porcelain`: with a dirty tree, stop and ask the user to commit or set the edits aside, or review a clean worktree checked out at head. A root commit has no `<SHA>^`: on the external-review path use the empty tree `4b825dc642cb6eb9a060e54bf8d69288fbee4904` (`git hash-object -t tree /dev/null` in a SHA-1 repository) as base; the selector path keeps `--commit <SHA>`. State the scope in your first sentence so the user can redirect.

## Step 3: Launch the review

Run from the repository root (or pass `--cd <repo>`). Use the run directory Step 0 created; never reuse one from an earlier invocation. The runner writes into a new subdirectory, `--out "$RUN/codex"`, and refuses a non-empty one; the manifest and prompt live in `$RUN`, outside `--out`. Record the resolved scope in the manifest (below) before choosing the launch path.

**Pick the launch path.** The CLI rejects a scope selector combined with a custom prompt, and the runner enforces it (a selector means no prompt), so each run uses exactly one of these:

- **External-review path**, when the reviewed repository has `.agents/skills/external-review/SKILL.md`: `--review` with the prompt passed by `--prompt-file` and no selector. The prompt tells the reviewer to read that file completely and follow it, states the exact scope, and restates the leaf rules in one line. Name the file, not `$external-review`: on codex-cli 0.156.0 a `$skill` mention in a review prompt is not injected, and the skill's `allow_implicit_invocation: false` policy (kept so ordinary sessions never pick it up) hides it from the reviewer's skills list, so a mention alone never loads it. Review mode exposes no agent-spawning tools; with a bare selector the reviewer can auto-load a multi-agent review skill, fail to spawn agents, and report that as a gap. The external-review file pins it to a single-context leaf review of the recorded scope. Add `--expect-read .agents/skills/external-review/SKILL.md`.
- **Selector path**, when that file is absent: `--review` plus the selector from Step 2 and Codex's built-in review rubric, unchanged.
- Both paths: always `--expect-diff "<base> <head>"` (uncommitted work: `--expect-diff "<head>"`).

Mandatory read before launching: [references/launch-example.md](references/launch-example.md), the commands for both paths, the complete prompt for each scope, and the background launch with polling.

Runner defaults: sandbox `read-only` (passed explicitly and checked in the rollout), user hooks, plugins, apps and MCP servers off for the run, `--timeout-min 30`, and the `--json` event stream. Preserve least privilege; do not bypass approvals or sandbox protections for a reviewer. The one exception is auto-approving a user-approved browser MCP server (below).

**Launch in the background only.** A foreground tool call is killed at the harness ceiling (10 minutes for the Claude Code Bash tool) and takes the review with it. Run the runner through Bash `run_in_background` and poll `$RUN/codex/status.json` (first written after 30 s; `running`, then `done` or `failed`) with bounded waits. Log silence alone does not prove a stall. If the run stalls past the agreed timeout, kill only this run's process tree (pid in `$RUN/codex/pid`), preserve its partial output, and report the failed attempt; the runner's own `--timeout-min` does the same and sets `reason: timeout`. The one automatic retry described below then applies; any further run needs user agreement.

Before launch, write the manifest (`$RUN/manifest.md`): run ID, absolute workspace, requested scope, resolved base/head SHAs, launch path (external-review or selector), requested role/model/effort, and start time. The runner adds `$RUN/codex/run.json` (exact command, requested model/effort/sandbox, selector, disabled MCP names). For uncommitted work, add staged/unstaged diff identities and relevant untracked path/content hashes; a HEAD SHA alone does not identify that content. For a branch or commit scope the working tree is out of scope: record the dirty path count from `git status --porcelain --untracked-files=all` and note those paths as excluded, without hashing them. Exclude task-owned report artifacts from the requested review. Use an isolated snapshot if concurrent writers cannot stop. Do not silently expand scope to unrelated changes.

The two paths supply different rubrics: `external-review` on one, the CLI's built-in review rubric on the other. For a special focus the user requests, append it to the external-review prompt; on the selector path, drop the selector and run `--review` with a prompt that states the exact scope and the focus. Describe which rubric was actually supplied.

**Live browser, when the user asks for or approves one.** Mandatory read before such a run: [references/live-browser.md](references/live-browser.md). Give the reviewer a fresh throwaway profile on local or test URLs only, never a signed-in or production app, and say in the prompt not to submit forms or change data.

Default effort is `high`; for a broad diff, `medium` is a planning option only when the user did not explicitly select effort. Astra retains its own medium default. State the selected setting before launch; runtime duration is not predictable from file count alone.

## Step 4: Collect and bind evidence

Accept a report only after the runner exits, `$RUN/codex/result.json` has `ok: true`, the report is non-empty in this run's newly created directory, and the source manifest still matches the reviewed state. Mandatory read at this step: [references/rollout-evidence.md](references/rollout-evidence.md) (the `result.json` field map). Record in the manifest: `exitCode`, `durationSec`, `threadId`, report hash, `observed` {model, effort, sandbox}, and the `evidence` counts.

- **Model resolution**: `observed` comes from the rollout's `turn_context`. When it is null (no rollout found), label the model as requested but unverified; never infer a resolved model from the entrypoint title. The runner itself fails a run on `model_mismatch` or `sandbox_mismatch`.
- **Skill not loaded** (external-review path, `evidence.expectedReads` is 0): attribute the run as a plain custom-prompt review, never as external-review. Check that each `expectedReadSamples` entry actually reads the file. Review mode forces its own output schema, so external-review's `Scope:`, `Unavailable checks`, and `Verdict:` lines never reach `last.md`. They are not a load signal on this path, and their absence is not a failure.
- **Findings**: `$RUN/codex/review-output.json` (`ExitedReviewMode.review_output`: `findings`, `overall_correctness`, `overall_explanation`, `overall_confidence_score`). `last.md` can hold only `overall_explanation`. In review mode, no `ExitedReviewMode` means the review did not finish (`reason: review_not_finished`); a plain `codex exec` browser run never has one, so take its evidence as [references/live-browser.md](references/live-browser.md) describes (mandatory re-read at this step).
- **Nonzero `evidence.spawnCalls`** contradicts the leaf rules: disclose it.
- In review mode, `evidence.rollout` null or `evidence.reviewSiblings` other than 1 leaves skill load, spawn count, and scope identity unverified; say so, never report them as zero.

Scope identity is verified only when `evidence.diffReads` is at least 1 and, for uncommitted work, `evidence.untrackedListed` is true and the manifest's dirty paths and hashes still match the working tree. Otherwise scope identity is unverified and the attribution says so. On the selector path the CLI builds the diff from the selector (the selector reviewer may read the change with `git show <sha>`); treat scope identity as unverified when the reviewer's commands show no diff read against the recorded SHAs.

A failed `ok`, an empty report, or changed source means the review is failed or stale, not clean. Surface `errors` and `stderr.log` with secrets redacted. A successful process that could not inspect code or run required checks has an incomplete review: retain useful findings but disclose missing coverage. Sandbox or network failures do not by themselves establish a code defect or a passing gate.

A failed run gets one automatic retry before you ask. The retry needs no further permission, runs in a new run directory with a new `--out`, and depends on the `reason` in `result.json`:

- `model_rejected`: never drop `--role` or `--model`. Without one the runner refuses, and a hand-built run would inherit the `model` in `~/.codex/config.toml`, which can be a different reviewer family (Astra, say) than the one requested. Run `codex debug models` and look for a newer Sol slug; the catalog can still list a retired id, so a listed slug is a candidate, not proof of availability. When the rejected id is the default pin and exactly one newer Sol appears, retry with `--model <id>` and tell the user the pin is stale. When the user chose the model, or no single newer Sol appears, skip the retry and ask which model to use; an explicit user model choice stays until the user changes it.
- `timeout`, `nonzero_exit`, `empty_report`, `review_not_finished`, `model_mismatch`, `sandbox_mismatch`, `effort_mismatch`: retry the same command once with a new `--out`.
- Changed source: no retry. The reviewed content moved, so report the run as stale.

If the retry fails too, stop, report both attempts with their `reason` and errors, and ask. Attribute the result to `observed.model`, or state that resolution remains unverified.

## Step 5: Verify every finding (precision stage)

Cross-vendor does not mean correct: Codex hallucinates too, and it reviewed without this session's context. Before surfacing, run a real check (`grep` call sites, read the cited lines) on **every** finding, all severities. Each one gets:

- **Confirmed**: evidence found, pass it through
- **Refuted**: checked and not real, drop it (optionally note under "checked and fine")
- **Kept with caveat**: one-line note on the residual uncertainty

Drop only on evidence, never because a finding "seems minor". Treat BLOCKING findings adversarially: try to refute each before accepting.

## Step 6: Present

Use the `impartial-review` presentation format: findings severity-ordered globally (🔴 BLOCKING, 🟡 SHOULD-FIX, 🟢 NITPICK), each with `path:line`, concrete description, and a specific fix. Map Codex's native labels onto that scheme during verification (e.g. P0/P1/critical → 🔴, P2/major → 🟡, P3/minor → 🟢), re-ranking where your verification disagrees. Grade against the change's goal: a finding limited to another code path, a rare input, a small performance cost, or extra compatibility is 🟢 whatever Codex labeled it, unless it breaks the goal; security, auth, and data-loss findings keep their impact severity. Then "Things I checked and verified fine" (merge Codex's list with your verification results); then a "Recommendation" that is concrete about merge readiness. Attribute the source using recorded run metadata: "Codex (<observed model and effort, or requested setting with resolution unverified>) reviewed <scope at source identity> via <external-review (skill read verified) | built-in rubric with `--base`/`--commit`/`--uncommitted` | custom prompt>, scope identity <verified | unverified>; N of M findings survived verification." Include material unavailable checks and the `$RUN` path.

Zero findings plus verified coverage and local checks supports a clean review of that scope. State merge readiness only when the relevant project gates and exact source identity also support it; the review itself does not authorize merging.

## Common mistakes

- Hand-building `codex exec` or `codex exec review` instead of the runner loses the explicit sandbox, hook and MCP isolation, the timeout, and the model check.
- A stale report from a previous attempt is not this process's result; a new run directory per attempt is required, and never read a previous attempt's `result.json`.
- Authentication, model ids, flags, sandbox behavior, and billing may change; inspect local evidence instead of applying a historical machine repair automatically.
- A fresh same-vendor reviewer is independent context, not a cross-vendor opinion.
- A selector plus a custom prompt is rejected by the CLI. Where `.agents/skills/external-review/SKILL.md` exists, a bare selector is the wrong path, not the safer default: the reviewer may load a multi-agent skill it cannot run and report a gap instead of reviewing.
- Invoking `$external-review` by name instead of naming its file: on codex-cli 0.156.0 the mention is not injected and the skill is hidden from the reviewer's list, so it never loads.
- Taking `last.md` as the findings list: the findings live in `review-output.json`.
- Do not pass findings through unchecked, treat review agreement as proof, or hide missing evidence behind `ok: true`.
- Editing model pins anywhere but `.claude/scripts/codex-run/models.json`, or editing it without the user's OK.
- Loosening the sandbox so a reviewer can run a browser. Give it the Playwright MCP server over CDP (Step 3) and keep the sandbox read-only.
- Do not widen scope, retry more than once, downgrade a requested model, repair machine-global configuration, or publish under review-only authorization.
