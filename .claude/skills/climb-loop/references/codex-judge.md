# Codex judge call

Loaded from SKILL.md section 1 before the first Codex judge call.

## Runner lookup

Resolve `$RUNNER` before preflight, in the same shell call as each runner command (shell variables do not carry over). Working directory stays the target repo root. Order: the repo's own runner; the runner shipped beside this skill (Claude skill: `$SKILL_DIR/../../scripts/`; Codex port: `$SKILL_DIR/../../../.claude/scripts/`); the user's install. None found → stop and tell the user. Model pins = `models.json` next to the runner in use.

```bash
for RUNNER in .claude/scripts/codex-run/codex-run.mjs "$SKILL_DIR/../../scripts/codex-run/codex-run.mjs" "$SKILL_DIR/../../../.claude/scripts/codex-run/codex-run.mjs" "$HOME/.claude/scripts/codex-run/codex-run.mjs" ""; do [ -f "$RUNNER" ] && break; done
test -n "$RUNNER" || echo "codex-run runner not found: stop and tell the user"
```

Runner resolves `--out`, `--prompt-file`, `--schema`, `--image` against its own cwd (repo root), not `--cd`. `$ROLE` = seat's role from the table. `$SKILL_DIR` = absolute path of this active climb-loop skill folder (the one holding this file), so the schema loads wherever the skill is installed. Brief on stdin (or `--prompt-file`); runner places every `-i` before codex's `-` (stdin prompt), so multi-value `-i` cannot swallow it. `--image` order = attachment order the brief states. `--out` must be new or empty (`$RUN/codex`; extra calls `$RUN/call-<k>/codex`). Persisted run (no `--ephemeral`): runner then reads the rollout and verifies model, effort and sandbox; `--ephemeral` leaves all three unverified. Each call is still a new Codex thread, never resumed. Never pass `--keep-hooks`, `--keep-plugins` or `--keep-mcp` to a judge. Default `--timeout-min 30` (kills process tree, `reason: timeout`). Launch in the background (a foreground tool call can die at 10 min), poll `$RUN/codex/status.json` (first write after 30 s; `running` → `done`/`failed`):

```bash
node "$RUNNER" --cd "$JUDGE" --skip-git-repo-check \
  --role "$ROLE" --sandbox read-only \
  --schema "$SKILL_DIR/references/rank.schema.json" \
  --out "$RUN/codex" \
  --image "$JUDGE/A-sidebar-dark.png" --image "$JUDGE/B-sidebar-dark.png" --image "$JUDGE/C-sidebar-dark.png" \
  < "$JUDGE/brief.md"
```

Runner files in `$RUN/codex/`: `result.json` {ok, reason, exitCode, observed {model, effort, sandbox}, usage, errors, evidence}, `output.json` (schema-parsed final message), `last.md`, `run.json` (exact command, disabled MCP names), `events.jsonl`, `stderr.log`. Exit 0 ok, 1 run failed, 2 bad arguments. `reason: model_rejected` → run `codex debug models`, tell the user, ask which model before any retry.

Runner tested on codex-cli 0.171.0; preflight `cli` differs → check `codex exec --help` still lists `-i/--image`, `-s/--sandbox`, `-C/--cd`, `--skip-git-repo-check`, `--output-schema`, `-o`, `--json`, `-c` before launch.

Blinding: `run.json` `mcpDisabled` lists the user MCP servers turned off; a `warnings` entry there ("codex mcp list failed ...") means user MCP servers stayed on for that call. Record it as a blinding limit.
