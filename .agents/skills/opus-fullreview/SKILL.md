---
name: "opus-fullreview"
description: "Full multi-reviewer Claude review from Codex: Claude CLI runs impartial-review as Manager with fresh Opus sub-reviewers, then Codex verifies each finding. Use for $opus-fullreview or a full Claude/Opus review with sub-reviewers."
---

# Opus full review

Run one Claude CLI process in which Claude runs the repository's Claude `impartial-review` skill as Manager: it spawns fresh-context Opus sub-reviewers (the standard review areas, an open-lens reviewer, and an intent reviewer when a brief is supplied), verifies their findings, and writes one report. Then verify every finding in this Codex session. From Codex this is a cross-vendor review; say so in the result. `claude-review` is the single-reviewer alternative; keep the two entrypoints separate.

The requested review does not authorize fixes, commits, pushes, PRs, merges, posting, publication, or paid usage.

## 1. Fail-closed preflight

Run `claude --version`, `claude auth status`, and `claude -p --help`. Require:

- Local help supports every flag used below, including `--session-id`, `--restricted`, `--permission-prompts`, and `--output-format json`. A version number alone does not prove compatibility.
- `loggedIn: true`, `authMethod: claude.ai`, `apiProvider: firstParty`, and `subscriptionType: max`.
- None of `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_PROFILE`, `ANTHROPIC_DEFAULT_OPUS_MODEL`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, `CLAUDE_CODE_USE_FOUNDRY`, or `CLAUDE_CODE_USE_ANTHROPIC_AWS` in the child environment. Check presence only; never print values.
- `.claude/skills/impartial-review/SKILL.md` exists at the root of the reviewed repository. If it is absent, stop and point to `claude-review`; do not substitute a plain prompt and call it a full review.

Stop if subscription routing cannot be proven. Do not use `--bare`: it ignores Claude.ai login credentials. Do not probe models; a probe consumes usage. If Claude reports a plan limit, requests usage credits, or indicates pay-as-you-go billing, stop. Never accept or enable paid credits.

Model: the `opus` alias at `high` effort for the Manager and every sub-reviewer, unless the user names another model or effort. An alias is not evidence of the resolved version; Step 4 reads the resolved model from the transcripts.

## 2. Fix the scope

Use the scope named in the invocation input; otherwise prefer uncommitted work, then the latest commit, then the current branch against its remote default branch. Resolve exact revisions: a branch diff uses `git merge-base origin/<default> HEAD` as base after a fetch of the remote-tracking ref; a commit uses its parent, or the empty tree `4b825dc642cb6eb9a060e54bf8d69288fbee4904` for a root commit; uncommitted work uses `HEAD` plus staged, unstaged, and untracked content. A branch or commit review covers committed changes only: check `git status --porcelain` or state that dirty paths are excluded. State the scope before launch. Never push, post, edit, commit, or widen scope.

## 3. Launch the review

Create a unique `.tmp/opus-fullreview-*` directory atomically and exclude it from review scope. Generate a UUID for the Claude session. Record the run ID, absolute workspace, resolved base and head SHAs (plus diff identities and untracked path and content hashes for uncommitted work, or the excluded dirty path count otherwise), CLI version, session UUID, command, requested model and effort, whether a brief was supplied and its hash, and start time.

**Author brief.** By default write `$RUN/brief.md`. Its first line is exactly `Author brief <run directory name>`, a marker Step 4 uses to confirm which sub-reviewers received it. The rest is facts only: the goal in one or two sentences, the files or behaviors most likely to break, related work in flight (other PRs, merge order), and checks already run with their results. No verdicts or opinions. Skip it when the user asks for a fully blind review; the run then has no intent reviewer.

Disable Claude CLI's internal background-task wait ceiling for the review child by setting `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` in its environment. Otherwise print mode can terminate unfinished Agent tasks after 600 seconds and still exit 0 with only a progress message. Apply this to the spawned child, not machine-wide settings.

Prompt, for a branch diff (adapt the scope sentence for a commit or uncommitted work as in Step 2):

`Read .claude/skills/impartial-review/SKILL.md completely with the Read tool and act as its Manager on the branch diff: base <base>, head <head>. Read the diff with git diff <base> <head>. Dispatch every reviewer with the Agent tool, subagent_type general-purpose, model opus, in fresh context, as the skill directs; each is a leaf reviewer that spawns no agents and loads no skills. Prefer foreground Agent calls in bounded parallel batches. If any agents run in the background, wait for their actual results before returning; never finish with a progress-only message while reviewers remain active. Author brief: <path to brief.md>; give it only to the Bucket F intent reviewer, as the skill directs; every other reviewer gets the diff without it. No file edits, no Git writes, no publication. Verify the reviewers' findings and write the final verified report. First line: Scope: base <base>, head <head>. Second line: Sub-reviewers: <number spawned>.`

Drop the author-brief sentence for a fully blind review. Write the prompt to `$RUN/prompt.txt` and pass it on stdin, never as a positional argument: options that take a list of values, such as `--tools` or `--add-dir`, consume a prompt that follows them, and the run exits before any reviewer starts. Run from the repository root:

```bash
CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 claude -p --model opus --effort high --session-id "$SESSION" \
  --permission-mode plan --permission-prompts none --restricted \
  --tools "Read,Glob,Grep,Bash,Agent" --disable-slash-commands --strict-mcp-config \
  --no-chrome --output-format json \
  < "$RUN/prompt.txt" > "$RUN/result.json" 2> "$RUN/run.log"
```

On native Windows, replace `Bash` in `--tools` with `PowerShell`. The shell example above is POSIX syntax, including its `<` input redirection; do not paste it into PowerShell. Use a Node launcher with `env: { ...process.env, CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '0' }`, pass the prompt through the spawned child's stdin, and redirect its output to the run files. This scopes the variable to the child without changing machine settings. `--disable-slash-commands` keeps the child from invoking skills, including a Claude review skill that would recurse; the Manager loads `impartial-review` by reading the file. Do not pass `--no-session-persistence`: Step 4 reads the saved transcripts. `--restricted` ignores user and project settings files, so a `CLAUDE_CODE_SUBAGENT_MODEL` set there does not apply; the prompt names the sub-reviewer model instead.

Run it in the background and poll its process, logs and session transcripts with bounded waits; a full review takes longer than `claude-review`. Inspect new records in the Manager and sub-reviewer JSONL files from Step 4 for tool activity, completed results, errors or blocked input. Final JSON output and stderr may stay empty during normal work; reasoning can also leave transcripts unchanged. Bounded polling is not a review deadline. Let the review run as long as needed unless the user requests a cutoff. Elapsed time or quiet files alone do not prove a stall. On an explicit terminal failure or a demonstrated deadlock, stop only this process, keep partial output, and report the failed attempt. If input is required, ask the user; do not turn inactivity into an automatic stop.

## 4. Collect and bind evidence

Accept the result only after the process exits 0, `result.json` parses, its `is_error` is false, its `session_id` equals the recorded UUID, the reviewed source is unchanged, and the required reviewers returned completed results which the Manager verified. Check `run.log` for the CLI warning `Background tasks still running after` followed by `terminating`; its presence makes the run incomplete. A progress-only result or terminated unfinished reviewers also makes the review incomplete even with exit 0 and `is_error: false`; retain the artifacts but do not accept or present it as a completed full review. Write its `result` field to `$RUN/report.md` and record the report hash. Take the resolved models from `modelUsage` in `result.json` and from the transcripts below, never from the alias.

The transcripts live under `~/.claude/projects/<workspace slug>/`: the Manager in `<session>.jsonl`, and each sub-reviewer in `<session>/subagents/agent-<id>.jsonl` with a sibling `agent-<id>.meta.json` holding `agentType` and `spawnDepth`. Find the Manager file by globbing `~/.claude/projects/*/<session>.jsonl`. Then check:

- **Skill load:** a Manager `tool_use` of `Read` whose `file_path` ends in `.claude/skills/impartial-review/SKILL.md` in the reviewed repository. Without it, attribute the run as a plain custom-prompt review, never as impartial-review.
- **Sub-reviewers that ran and completed:** the `agent-*.meta.json` files with `spawnDepth` 1 establish which reviewers started, not which finished. Count one as completed only when its Agent call or background-task result delivered a final reviewer report to the Manager, corroborated by that leaf's final report and no outstanding tool calls in its transcript. An agent ID, a launch acknowledgment, a progress sentence or a cancellation is not completion. If record shapes prevent confirmation, mark completion unverified. Report completed and started counts separately. Any `spawnDepth` above 1 means a reviewer spawned its own agent, against the leaf rule: disclose it. No subagent files in a readable session means no sub-reviewers ran.
- **Models:** the `message.model` values on assistant records in each sub-reviewer transcript. Disclose any reviewer that did not run on the requested model.
- **Intent reviewer:** the sub-reviewer transcripts that contain the brief's first line, trimmed. Exactly one means it ran; zero with a brief means `brief supplied, intent reviewer not run`; more than one means the brief reached a diff-only reviewer, so disclose it.
- **Scope identity:** the report's `Scope:` line matches the recorded base and head.

A missing transcript or a record shape that does not match leaves the affected count unverified; say so, never report it as zero. One invocation per request: no automatic retry, model fallback, or effort downgrade. Ask before another usage-consuming run.

## 5. Verify every finding

The Manager's verification ran without this session's context; it does not replace yours. Check every finding, all severities, against the local code and callers: **Confirmed** (evidence supports it), **Refuted** (evidence disproves it; list it under `Dismissed` with the reason), or **Kept with caveat** (state the missing check). Treat BLOCKING findings adversarially.

## 6. Present

Order confirmed findings as BLOCKING, SHOULD-FIX, then NITPICK, each with `path:line`, impact, and fix; keep the Manager's blind / intent / both tag when the intent reviewer ran. Then checked-and-fine items, the Manager's list of skipped standard areas with reasons, the open-lens reviewer's chosen lenses, dismissed findings, and a concrete merge recommendation. Attribute: `Claude (<resolved models and effort, or requested with resolution unverified>) ran <impartial-review as Manager (skill read verified) | a plain custom prompt> over <scope at source identity>, scope identity <verified | unverified>, with <C of S sub-reviewers completed | no sub-reviewers ran | completion/count unverified>, intent reviewer <ran with brief | brief supplied, intent reviewer not run | brief reached N reviewers | not run: no brief | unverified>; M of T findings survived verification. Cross-vendor from Codex.` Include the run directory and session UUID.

## Common mistakes

| Mistake | Required response |
|---|---|
| API or provider variable present | Stop before inference |
| `--no-session-persistence` or `--bare` | Evidence or subscription auth is lost; do not use them |
| Invoking impartial-review as a skill | Skills are disabled on purpose; the Manager reads the file |
| Counting Agent calls in the Manager transcript as reviewers | Count sub-reviewer transcripts with `spawnDepth` 1 |
| Internal 600-second background wait ceiling | Set `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` for the child; wait for completed reviewer results |
| Exit 0 and a progress-only result | Incomplete review; preserve output and disclose missing coverage |
| Prompt passed as a trailing argument | A list-valued option such as `--add-dir` swallows it; pass the prompt on stdin |
| Failed or stalled run | Report once; ask before retrying |
