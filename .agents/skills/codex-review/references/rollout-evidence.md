# Run evidence

Mandatory read from Step 4 of [../SKILL.md](../SKILL.md) before collecting evidence. The runner reads the session rollouts itself and writes `$RUN/codex/result.json`; there is no snippet to run and no `run.log` header to read. The rules for reading the output (skill not loaded, findings source, spawn calls, scope identity, failures and the retry) stay in SKILL.md Step 4.

## result.json fields

| Field | Meaning |
|---|---|
| `ok`, `reason` | `reason` is one of `timeout`, `model_rejected`, `nonzero_exit`, `empty_report`, `schema_output_not_json`, `review_not_finished`, `model_mismatch`, `sandbox_mismatch`, `effort_mismatch`; null when ok |
| `exitCode`, `timedOut`, `durationSec`, `threadId` | process facts; `threadId` is the session id |
| `requested` | role, model, effort, sandbox asked for |
| `observed` | model, effort, sandbox from the rollout's `turn_context` (the review sibling's first); null means no rollout was found, so resolution is unverified |
| `usage` | tokens from `turn.completed`; review mode reports zeros there (the reviewer runs in a sibling thread), so treat review usage as unknown, not free |
| `errors`, `notices`, `warnings` | turn errors; CLI notices (config warnings); unverified-model warning |
| `reportPath`, `reportBytes` | `last.md` (the `-o` final message) |
| `evidence.rollout` | parent rollout `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*-<threadId>.jsonl`; null leaves everything below unverified |
| `evidence.reviewSiblings`, `reviewRollout` | review mode: sibling rollouts with `parent_thread_id` equal to the thread and `subagent: review`; evidence is taken from it only when there is exactly 1 |
| `evidence.exitedReviewMode` | count of `ExitedReviewMode` items in the parent; the last one is written to `review-output.json` |
| `evidence.toolCalls` | `custom_tool_call` exec and `function_call` records counted |
| `evidence.spawnCalls` | `function_call` records named `spawn_agent`; expect 0 |
| `evidence.diffReads` | commands containing `git diff <base> <head>`, `git diff <base>..<head>` or `git show <head>` (or `git diff <head>` for one SHA), from `--expect-diff` |
| `evidence.untrackedListed` | a command contained `--untracked-files=all` |
| `evidence.expectedReads`, `expectedReadSamples` | commands matching the `--expect-read` path, excluding ones that start with `rg`, `grep`, `find` or `ls`; the first 3 samples (200 chars) |

## Notes

- The parent rollout holds only the `EnteredReviewMode` and `ExitedReviewMode` items; the reviewer's turn lives in the sibling (`multi_agent_version: disabled`, so no spawn tools).
- Skill load: confirm each `expectedReadSamples` entry reads the file. A read chained with other commands (for example `Get-Content <file>; git diff ...`) counts. The runner skips only commands that *start* with `rg`, `grep`, `find` or `ls`; a chained search that merely matches the path still needs rejecting by eye.
- The runner does not check for an injected `<name>external-review</name>` block in a user-role message. It is an optional extra signal only: 0.156.0 injects none for exec prompts.
- `--ephemeral` writes no rollout: never use it for reviews.
- Raw event stream: `$RUN/codex/events.jsonl`; CLI stderr: `$RUN/codex/stderr.log`; exact command: `$RUN/codex/run.json`. Record the relevant fields in the manifest.
