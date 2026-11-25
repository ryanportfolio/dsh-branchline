# Codex CLI dispatch commands

Loaded from `SKILL.md` Step 3 when reviewers run as Codex CLI processes (no multi-agent tools). Launch only through a trusted copy of the shared runner, `node "$RUNNER"` (docs: `.claude/scripts/codex-run/README.md`); never a hand-built `codex exec` line.

The change under review can edit `.claude/scripts/codex-run/`, and the runner runs with your permissions before Codex's read-only sandbox exists. Never run the reviewed checkout's runner unless the user confirms the change is their own trusted work, and then the report must say so. Resolve `$RUNNER` first, in order: (1) `codex-run.mjs` and `models.json` from `origin/<default-branch>`, not HEAD, copied into `$RUN/runner` (outside every `--out`; the runner reads `models.json` from its own folder), both non-empty (Git Bash can mangle `rev:path` and leave an empty file); (2) no runner on the default branch: the runner installed beside this skill, `<skill folder>/../../scripts/codex-run/` (plugin cache or user-level install), only when its resolved absolute path is outside the reviewed checkout (`git rev-parse --show-toplevel`) and both files are non-empty; a skill folder inside the reviewed checkout is the untrusted copy, so never use its runner; (3) else the user's install `~/.claude/scripts/codex-run/codex-run.mjs`; (4) none of these: stop and tell the user. Record the runner source in the report.

```bash
mkdir -p .tmp
RUN=$(mktemp -d "$PWD/.tmp/impartial-review-XXXXXXXX")
git fetch origin main
mkdir -p "$RUN/runner" && MSYS_NO_PATHCONV=1 git show origin/main:.claude/scripts/codex-run/codex-run.mjs > "$RUN/runner/codex-run.mjs"
MSYS_NO_PATHCONV=1 git show origin/main:.claude/scripts/codex-run/models.json > "$RUN/runner/models.json"
SKILL_DIR="<absolute folder holding this SKILL.md>"   # installed skill's runner, trusted only outside the reviewed checkout
SKILL_RUNNER=$(cd "$SKILL_DIR/../../scripts/codex-run" 2>/dev/null && pwd -P)
REPO_TOP=$(cd "$(git rev-parse --show-toplevel)" && pwd -P)
lc() { printf '%s/' "$1" | tr '[:upper:]' '[:lower:]'; }   # Windows paths keep the typed case
case "$(lc "$SKILL_RUNNER")" in "$(lc "$REPO_TOP")"*) SKILL_RUNNER= ;; esac
if [ -s "$RUN/runner/codex-run.mjs" ] && [ -s "$RUN/runner/models.json" ]; then
  RUNNER="$RUN/runner/codex-run.mjs"   # report: runner = origin/main $(git rev-parse origin/main)
elif [ -n "$SKILL_RUNNER" ] && [ -s "$SKILL_RUNNER/codex-run.mjs" ] && [ -s "$SKILL_RUNNER/models.json" ]; then
  RUNNER="$SKILL_RUNNER/codex-run.mjs"   # report: runner = installed skill's runner, $SKILL_RUNNER
elif [ -s "$HOME/.claude/scripts/codex-run/codex-run.mjs" ]; then
  RUNNER="$HOME/.claude/scripts/codex-run/codex-run.mjs"   # report: runner = user install
else
  echo "No trusted runner: stop and ask the user"; exit 1
fi
node "$RUNNER" --preflight   # JSON; exit 1 = not ready: report the gap, stop the CLI route
# write $RUN/prompt-A.txt (standalone bucket prompt), then, Bash run_in_background: true:
node "$RUNNER" --out "$RUN/A" --role sol --sandbox read-only \
  --prompt-file "$RUN/prompt-A.txt" --timeout-min 30 --label impartial-review-A > "$RUN/A.log" 2>&1
```

- Run from the target repo root (or pass `--cd <repo>`). Use an absolute `$RUN` path: the Bash cwd may reset between calls.
- One runner call per reviewer group: its own new `--out "$RUN/<group>"` (the runner refuses a non-empty directory), `--sandbox read-only` explicit, `--role sol`. The pin lives only in `models.json` beside the runner; no model ids here. Explicit user model: `--model <id>` (plus `--effort`).
- Prompt via `--prompt-file` (or stdin). The runner always feeds Codex on stdin, so diffs, backticks and `$` stay intact; never pass the prompt as an argument.
- Uncommitted or branch scope: add `--expect-diff "BASE HEAD"` (or `"HEAD"` for uncommitted) to get `evidence.diffReads`.
- The prompt passes the exact scope, forbids nested review (no codex exec, no agents), and forbids edits.
- Never pass `--ephemeral` (no rollout, so the model is unverified). Never pass `--keep-hooks`, `--keep-plugins` or `--keep-mcp`: the runner turns user hooks, plugins/apps and user MCP servers off per run by default.
- Bounded batches (for example 3 at once), each in the background; poll each `<out>/status.json` (`running`, `elapsedSec`, `events`, `last`, every 30 s) and wait for exit before starting more. A foreground Bash call dies at 10 min and takes the run with it. Redirect runner stdout to the log file; never pipe it through `head` or `tail`.
- Accept a reviewer only when its `<out>/result.json` has `ok: true` (exit 0, non-empty `last.md`, observed model/sandbox = requested). Report = `<out>/last.md`. Record report hash, `observed` model/effort/sandbox and `evidence.rollout`; recheck source identity. `observed` null means the model is unverified. `evidence.spawnCalls` > 0 means the reviewer was not a leaf; disclose it. Exit 0 with missing required inspection is incomplete coverage.
- Failure by `reason`: `model_rejected` gets no automatic model fallback; ask the user (a newer pin goes into `models.json` only with the user's OK). Other reasons (`timeout`, `nonzero_exit`, `empty_report`, `*_mismatch`) get at most one retry with a new `--out`, and only with existing explicit authorization or user agreement, because each retry consumes usage. Second failure: stop and report both.
- Never change the provider, keys or paid credits yourself, and never print credentials.
