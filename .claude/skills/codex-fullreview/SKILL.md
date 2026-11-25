---
name: codex-fullreview
description: "Full multi-agent Codex review: Codex (via the codex-run runner, role sol = newest Sol, high) runs impartial-review as Manager with fresh sub-reviewers, then each finding verified. Use: /codex-fullreview, 'full Codex review with sub-reviewers'."
---

# Codex full review: multi-agent second opinion

Run one Codex CLI process in which Codex runs the repository's `impartial-review` skill as Manager: it spawns fresh-context sub-reviewers over an exact scope, verifies their findings, and writes one report. Then verify every finding locally. From Claude this supplies a cross-vendor review; from Codex it supplies fresh context, not vendor independence. `codex-review` is the single-context alternative; keep the two entrypoints separate. This one defaults to Sol/high, and `astra-fullreview` supplies Astra/medium.

The requested review does not authorize fixes, publication, machine configuration changes, or paid credit purchases.

## Step 1: Preflight

Launch only through a trusted runner, `node "$RUNNER"` from the repository root; never hand-build a `codex exec` line. The reviewed change can edit the checkout's runner, which runs with your permissions outside Codex's sandbox. Never run the checkout's runner unless the user confirms the change is their own trusted work, and then the report must say so. After creating the run directory (Step 3), resolve `$RUNNER` per [references/launch-prompts.md](references/launch-prompts.md): the default branch's copy, else the installed skill's runner when it sits outside the reviewed checkout, else the user's install, else stop and tell the user. Record the runner source in the run metadata and the report.

Preflight: `node "$RUNNER" --preflight` prints JSON (`cli`, `login`, `chatgptLogin`, `gatewayProvider`, `ready`, `roles`); exit 1 means not ready. Record `cli` and the route. Checked on codex-cli 0.171.0; on another version, note it and check `codex exec --help` if a run fails on flags. Never probe models by spending usage.

**Require the native Manager skill.** Use `.agents/skills/impartial-review/SKILL.md` at the root of the reviewed repository. If the repository has none, use the global copy at `~/.agents/skills/impartial-review/SKILL.md`, expanded to an absolute path, and name that path wherever the prompts below say `.agents/skills/impartial-review/SKILL.md`. If neither exists, stop before inference: say that this entrypoint needs that skill and point to `codex-review`. Do not substitute a plain prompt and call it a full review.

**Model: runner role `sol`** (newest Sol, effort high). The pin lives only in `models.json` beside the runner (`roles.sol`); this skill names no model id. The prompt needs the literal id for sub-reviewers, so read it from the trusted runner's copy (Step 3). Newer Sol in `codex debug models` or developers.openai.com/api/docs/models → tell the user the pin is stale. Update `models.json` only with the user's OK, and never edit it during a review. An explicit user model or effort choice wins: keep `--role sol`, add `--model <id>` (`--effort <e>` if chosen), with the same id in the prompt, and keep it until the user changes it. `astra-fullreview` is exempt: it stays on Astra.

Accepted routes, either one: preflight reports `chatgptLogin: true`, or `gatewayProvider` is set (a gateway in `$CODEX_HOME/config.toml`, for example a CLIProxyAPI gateway over subscription accounts). Both are normal; record which one ran in the metadata, no caveat. When a gateway is set it carries the requests, whatever the login line says. When preflight reports `ready: false` (logged out or API-key login, and no gateway), stop before inference and ask the user to log in through their own terminal. The gateway is the user's own setup and its billing is their choice; never add, change or switch a provider, key or paid credits yourself, and never print credentials.

## Step 2: Identify scope

Use `$ARGUMENTS` if the user named a scope; otherwise infer from recent work. Resolve it to exact revisions before launch:

| Scope | Base SHA | Head |
|---|---|---|
| Uncommitted work (staged + unstaged + untracked) | `git rev-parse HEAD` | working tree |
| Branch / PR diff | `git merge-base origin/<default-branch> HEAD` | `git rev-parse HEAD` |
| Single commit | `git rev-parse <SHA>^`; for a root commit, the empty tree `4b825dc642cb6eb9a060e54bf8d69288fbee4904` | `<SHA>`, resolved to a full SHA |

For a branch diff, fetch first (`git fetch origin <default-branch>`) and use the remote-tracking ref (`origin/main`, not `main`): fetch updates only the remote-tracking ref, so a local branch name can silently compare against a stale base. A branch review covers committed changes `base..head` only: check that `git status --porcelain` is clean first, or state that uncommitted edits are outside the reviewed scope. State the scope in your first sentence so the user can redirect.

## Step 3: Launch the review

Run from the repository root (or pass `--cd`). Create a new run directory atomically (`mktemp -d`); never reuse one from an earlier invocation. The runner's `--out` is a new subdirectory `$RUN/codex`; the runner refuses a non-empty one. Use plain exec mode (no `--review`) with `--sandbox read-only` passed explicitly: review mode exposes no agent-spawning tools, while plain exec exposes `spawn_agent`, `wait_agent`, and the other collaboration tools. Write the prompt to `$RUN/prompt.md` and pass it with `--prompt-file`; never pass the prompt as a CLI argument. The prompt tells Codex to read `.agents/skills/impartial-review/SKILL.md` completely and act as its Manager, states the exact scope, and fixes the sub-reviewer settings. Name the file: on codex-cli 0.156.0 a `$skill` mention in an exec prompt is not injected, so only a file read loads the skill.

**Mandatory read before launch:** [references/launch-prompts.md](references/launch-prompts.md) holds the branch-diff example runner command and the complete prompt for each scope (branch diff, single commit, uncommitted work). Read it completely and use the prompt for the resolved scope.

**Author brief.** By default, write `$RUN/brief.md` before launch and add this sentence to the prompt, after the scope: `Author brief: <path to brief.md>; give it only to the intent reviewer, as the skill directs; every other sub-reviewer gets the diff without it.` Its first line is exactly `Author brief <run directory name>` (for example `Author brief codex-fullreview-Ab12Cd34`), a marker Step 4 uses to confirm which sub-reviewers received it. The brief holds facts only: the goal in one or two sentences, the files or behaviors most likely to break, related work in flight (other PRs, merge order), and the checks already run with their results. No verdicts or opinions. The skill's diff-only reviewers never see it, so the run keeps a layer free of the author's framing, while the intent reviewer checks the change against its purpose. Skip the brief when the user asks for a fully blind review; the run then has no intent reviewer. Record in the metadata whether a brief was supplied and its hash.

A prompt file written by an unquoted heredoc expands `$BASE` and the other variables at write time; check that `prompt.md` holds real SHAs and no stray `$`. Do not pass `--ephemeral`: Step 4 reads the persisted session file (the runner persists it by default). The runner already disables user hooks, plugins/apps and user MCP servers per run; do not add `--keep-hooks`, `--keep-plugins` or `--keep-mcp`.

The prompt forbids the skill's CLI fallback on purpose. Nested `codex exec` processes bill separately, leave no parent link in the session files, and usually fail inside the read-only sandbox. A run without agent tools should report that gap, not hide it.

Timeout: `--timeout-min 60` (multi-agent runs take far longer than `codex-review`; the runner default of 30 is too short). Launch in the background (Bash `run_in_background: true`) with runner stdout redirected to `$RUN/runner.log`, never through `head` or `tail`; poll `$RUN/codex/status.json` (`running`, `elapsedSec`, `events`, `last`, written every 30 s) and wait for exit. A foreground tool call is killed at the harness ceiling (10 minutes for the Claude Code Bash tool) and takes the review with it. On timeout the runner kills the Codex process tree and reports reason `timeout`. On PowerShell, create a GUID-named run directory and keep every path inside it.

Before launch, write run metadata `$RUN/manifest.json`: run ID, absolute workspace, requested scope, resolved base/head SHAs, CLI version, route, launch path (impartial-review Manager), runner command, requested role/model/effort, and start time. The runner also writes `$RUN/codex/run.json` (exact codex argv, requested model/effort/sandbox, disabled MCP names). For uncommitted work, add staged/unstaged diff identities and relevant untracked path/content hashes; a HEAD SHA alone does not identify that content. For a branch or commit scope the working tree is out of scope: record the dirty path count from `git status --porcelain --untracked-files=all` and note those paths as excluded, without hashing them. Exclude task-owned report artifacts from the requested review. Use an isolated snapshot if concurrent writers cannot stop. Do not silently expand scope to unrelated changes.

For a special focus the user requests, append it to the prompt. Preserve least privilege; do not bypass approvals or sandbox protections for the Manager or its sub-reviewers. Default effort is `high` (role `sol`); for a broad diff, `--effort medium` (with the same effort in the prompt) is a planning option only when the user did not explicitly select effort. State the selected setting before launch. Runtime is longer than `codex-review` and not predictable from file count.

Monitor the task-owned process with bounded waits. `status.json` `events` can stall while sub-reviewers work; their session files (Step 4) growing under `${CODEX_HOME:-~/.codex}/sessions` is progress. Record observed status, elapsed time, and the timeout; if stalled, terminate only this run's process tree (pid in `$RUN/codex/pid`), preserve its partial output, and report the failed attempt. The one automatic retry described below then applies; any further run needs user agreement.

## Step 4: Collect and bind evidence

Read `$RUN/codex/result.json` after the runner exits. Accept the report (`$RUN/codex/last.md`) only when `ok: true` (runner exit 0: process exit 0, non-empty report, observed model and sandbox match the requested ones) and the source manifest still matches the reviewed state. Record `exitCode`, `durationSec`, report hash, `threadId`, `observed` {model, effort, sandbox} (read by the runner from the rollout `turn_context`), and `usage`. If `observed` is null or `warnings` says unverified, label the model as requested but unverified; never infer a resolved model from the entrypoint title. Never scrape `events.jsonl` or `stderr.log` for model or session id: `--json` prints no header.

**Tool-call evidence comes from session files only.** `events.jsonl` and `prompt.md` echo the skill path and the diff, so a grep there for the skill path or for `spawn_agent` proves nothing. The Manager's session file is `evidence.rollout`; `evidence.spawnCalls` counts its `spawn_agent` calls and `evidence.toolCalls` its tool calls. Skill-load count: launch with `--expect-read .agents/skills/impartial-review/SKILL.md` (the relative form matches relative and absolute reads; for the fallback copy, pass its absolute path, which misses a read through `~` or a relative path, so recheck by hand when the count is 0), then read `evidence.expectedReads` and `expectedReadSamples` and confirm the samples read the Step 1 file. The runner does not count spawned children or the brief marker.

**Mandatory read before counting:** [references/session-evidence.md](references/session-evidence.md) gives the record shapes for skill load, spawn calls, and spawned children, and the Node snippet that counts them. Read it completely and run the snippet with `SID` taken from `result.json` `threadId`; the rules below interpret its output. The snippet's `spawnCalls` must equal `evidence.spawnCalls`; a mismatch leaves the count unverified.

Record `evidence.rollout` and all counts in the manifest.

- **Sub-reviewers that ran = spawned children.** Disclose `spawnCalls - spawnedChildren` as failed spawns. If children exceed calls, or the session file is missing or does not match this shape, the count is unverified: report it that way, never as zero and never as the Manager's own claim.
- **Intent reviewer = children whose session file contains the brief's first-line marker** (`briefedChildren`; `null` when no brief was supplied). Exactly one means the intent reviewer ran. Zero with a brief supplied means it did not run: the attribution says `brief supplied, intent reviewer not run`, never `ran with brief`. More than one means the brief reached a diff-only reviewer, so that run has no diff-only layer free of the author's framing; disclose it. An unreadable session file leaves the intent reviewer unverified.
- **Zero children** in a readable session file means **no sub-reviewers ran**: the run was a single-context review by the Manager, and the attribution says so plainly.
- A spawn with `fork_turns` other than `"none"`, or with a different model or effort, is disclosed with its actual settings.
- **Skill not loaded**: with no skill read, secondary signals are the report's `Scope:` and `Sub-reviewers:` lines and spawned children. With none of these, attribute the run as a plain custom-prompt review, never as impartial-review.

Check scope identity: the report's `Scope:` line must match the recorded base and head, and for uncommitted work its dirty path list (and hashes where recorded) must match the manifest. A missing line leaves scope identity unverified, and the attribution must say so. A mismatched line means the report does not cover the recorded scope.

Nonzero exit, missing/empty report, or changed source means the review is failed or stale, not clean. Surface the relevant error with secrets redacted. A successful process that could not inspect code or run required checks has an incomplete review: retain useful findings but disclose missing coverage. The read-only sandbox applies to the Manager and its sub-reviewers; a check that needs writes, installs, or network is unavailable, not passed. Sandbox or network failures do not by themselves establish a code defect or a passing gate.

A failed run gets one automatic retry before you ask. Failed means `result.json` has `ok: false`, or you killed a stalled run. The retry needs no further permission, runs in a new run directory, and depends on the `result.json` `reason`:

- `model_rejected`: never drop `--role`/`--model`. The runner refuses a run without one, so it never inherits the `model` in `config.toml`, which can be a different reviewer family (Astra, say). Run `codex debug models` and look for a newer Sol slug; the catalog can still list a retired id, so a listed slug is a candidate, not proof of availability. When the rejected id is the `roles.sol` pin and exactly one newer Sol appears, retry with `--model <new id> --effort <same effort>`, put the same id in the prompt's sub-reviewer `model`, and tell the user the pin is stale. Update `models.json` only with the user's OK. When the user chose the model, or no single newer Sol appears, skip the retry and ask which model to use; an explicit user model choice stays until the user changes it.
- `model_mismatch` / `sandbox_mismatch`: the run did not use the requested settings. Retry unchanged once; if the same happens again, stop, report observed against requested, and never accept it as the requested reviewer.
- `timeout`, `nonzero_exit`, `empty_report`, or a stall you killed: retry the same command unchanged with a new `--out`.
- Changed source: no retry. The reviewed content moved, so report the run as stale.

If the retry fails too, stop, report both attempts with their `reason` and `errors` (secrets redacted), and ask. Attribute the result to `result.json` `observed.model`, or state that resolution remains unverified.

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

- `--review` (review mode) for this entrypoint: review mode has no agent tools, so the Manager cannot spawn anyone.
- A stale report or session file from a previous attempt is not this process's result; unique directories plus process, session, and source identity are required.
- A hand-built `codex exec` line, the prompt as a CLI argument, or a hard-coded model id instead of `--role sol`.
- Counting `spawn_agent` mentions in `events.jsonl` or `prompt.md`, counting spawn calls as sub-reviewers (a call can fail), or matching a bare `"parent_thread_id"` (it also counts guardian sessions). Sub-reviewers are children under `"thread_spawn"`.
- Calling a zero-spawn run a multi-agent review, or hiding an unverified count behind the Manager's own claim.
- Authentication, model aliases, flags, sandbox behavior, session file format, and billing may change; inspect local evidence instead of applying a historical machine repair automatically.
- Do not pass findings through unchecked, treat reviewer agreement as proof, or hide missing evidence behind exit code 0.
- Do not widen scope, retry more than once, downgrade a requested model, repair machine-global configuration, or publish under review-only authorization.
