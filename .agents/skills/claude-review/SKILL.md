---
name: "claude-review"
description: "Use when the user says $claude-review, asks Claude or Fable to review code written in Codex, or requests a cross-vendor review through Claude CLI."
---

# Claude review

Run one fresh Claude CLI reviewer, then verify its findings in the current session. Default to the locally supported `fable` model alias at high effort under the user's Claude subscription. Honor explicit user model and effort choices within the authorized route; an alias is not evidence of the resolved model version. From Codex this is a cross-vendor review; state that in the result.

The requested review does not authorize fixes, commits, pushes, PRs, merges, posting, publication, or paid usage.

## 1. Fail-closed preflight

Run `claude --version` and `claude auth status`. Require:

- The installed CLI supports the model alias and every flag used below, as checked through current local help. The previous contract required at least 2.1.257; a version number alone does not prove compatibility.
- `loggedIn: true`, `authMethod: claude.ai`, `apiProvider: firstParty`, and `subscriptionType: max`.
- No `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_PROFILE`, `ANTHROPIC_DEFAULT_FABLE_MODEL`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, `CLAUDE_CODE_USE_FOUNDRY`, or `CLAUDE_CODE_USE_ANTHROPIC_AWS` in the child process environment. Check presence only; never print values.

Stop if subscription routing cannot be proven. Do not use `--bare`: it ignores Claude.ai login credentials. Do not make a model probe, because a probe consumes usage.

Confirm the intended subscription route from current local authentication evidence; do not treat historical version or plan details as a permanent product guarantee. If Claude reports a plan limit, requests usage credits, or indicates pay-as-you-go billing, stop. Never accept or enable paid credits for the user.

## 2. Fix the scope

Use the scope named in the invocation input; otherwise prefer uncommitted work, then the latest commit, then the current branch against its remote default branch. Support:

| Requested scope | Reviewer instruction |
|---|---|
| Uncommitted | Inspect staged, unstaged, and untracked work |
| Branch or PR | Compare the named head against the fetched remote-tracking base |
| Commit | Inspect the exact SHA and its parent |

State the scope before launching. A fetch may refresh a remote-tracking base, but never push, post, edit, commit, or widen scope.

## 3. Run one local review

Create a unique `.tmp/claude-review-*` directory atomically and exclude it from review scope. Record the run ID, absolute workspace, resolved base and head SHAs, staged and unstaged diff and relevant untracked path and content hashes, CLI version, command, requested model and effort, and start time. Stop competing writers or review an isolated snapshot; a HEAD SHA alone cannot identify dirty content.

Put the exact scope and review rubric in the prompt. The reviewer must inspect relevant code and call sites, report only actionable bugs or regressions, include `path:line`, explain impact, and propose a specific fix. It is a leaf reviewer: no edits, subagents, nested review processes, or skill invocation.

Run from the repository root, adapting quoting to the active shell:

```bash
claude -p --model fable --effort high \
  --permission-mode plan --permission-prompts none --restricted \
  --tools "Read,Glob,Grep,Bash" --disable-slash-commands --strict-mcp-config \
  --no-session-persistence --no-chrome --output-format text \
  "<review prompt with exact scope>" > "$RUN/report.md" 2> "$RUN/run.log"
```

On native Windows, replace `Bash` in `--tools` with `PowerShell`.

`--disable-slash-commands` keeps the child Claude process from loading this repository's Claude `claude-review` skill and invoking itself recursively. Keep the run in the foreground, or monitor its process and log if background execution is required.

Success requires this process to exit 0 with a non-empty report in its new directory and an unchanged reviewed source manifest. Record process outcome, end time, report hash, and the model and effort actually reported; if resolution is not exposed, mark it unverified. Missing required inspection or tests still means incomplete coverage even when the process exits 0. On failure, empty output, model rejection, auth ambiguity, or a billing prompt, show the relevant error and stop. One invocation per request. No automatic retry, model fallback, effort downgrade, or silent widening; ask before another usage-consuming run.

## 4. Verify every finding

Treat Claude's report as candidates, not conclusions. Check every finding against the local code and call sites, all severities:

- **Confirmed:** evidence supports it; present it.
- **Refuted:** evidence disproves it; list it under `Dismissed` with the reason.
- **Kept with caveat:** evidence is incomplete; state the missing check.

Order confirmed findings as BLOCKING, SHOULD-FIX, then NITPICK. Include `path:line`, impact, and fix. End with checked-and-fine items, dismissed findings, and a concrete merge recommendation. Attribute the run from its metadata: `Claude (<observed model/effort, or requested settings with resolution unverified>) reviewed <scope at source identity>; N of M findings survived verification.` Include missing coverage and the evidence path.

## Optional ultrareview

Use `claude ultrareview` only when the user explicitly requests `ultra` and separately confirms after hearing that it uploads repository state, uses Anthropic's managed model fleet rather than the local `fable` alias, and may consume a free run or paid usage credits. Invoking `$claude-review` alone is not that consent. Use `--no-post`; posting remains a separate explicit action. Never substitute ultrareview after a local-review failure.

## Common mistakes

| Mistake | Required response |
|---|---|
| API or provider variable present | Stop before inference |
| Old CLI or rejected `fable` model alias | Stop; do not probe or substitute |
| Failed or stalled run | Report once; ask before retrying |
| Claude finding sounds plausible | Verify it locally before surfacing |
