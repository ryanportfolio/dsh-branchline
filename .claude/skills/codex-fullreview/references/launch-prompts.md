# codex-fullreview: launch command and per-scope prompts

Mandatory read from `../SKILL.md` Step 3 before launch. Launch only through the trusted runner `$RUNNER` (SKILL.md Step 1; docs: `.claude/scripts/codex-run/README.md`) from the repository root; never a hand-built `codex exec` line, never the prompt as a CLI argument.

For example, a branch diff in a POSIX shell:
```bash
mkdir -p .tmp
RUN=$(mktemp -d "$PWD/.tmp/codex-fullreview-XXXXXXXX")
git fetch origin main
# Trusted runner: default branch copy, never the reviewed HEAD (rules below)
mkdir -p "$RUN/runner" && MSYS_NO_PATHCONV=1 git show origin/main:.claude/scripts/codex-run/codex-run.mjs > "$RUN/runner/codex-run.mjs"
MSYS_NO_PATHCONV=1 git show origin/main:.claude/scripts/codex-run/models.json > "$RUN/runner/models.json"
# Installed skill's runner (plugin cache, user-level install), trusted only outside the reviewed checkout
SKILL_DIR="<absolute folder holding the active SKILL.md>"   # codex-fullreview or astra-fullreview
SKILL_RUNNER=$(cd "$SKILL_DIR/../../scripts/codex-run" 2>/dev/null && pwd -P)
REPO_TOP=$(cd "$(git rev-parse --show-toplevel)" && pwd -P)
lc() { printf '%s/' "$1" | tr '[:upper:]' '[:lower:]'; }   # Windows paths keep the typed case
case "$(lc "$SKILL_RUNNER")" in "$(lc "$REPO_TOP")"*) SKILL_RUNNER= ;; esac
if [ -s "$RUN/runner/codex-run.mjs" ] && [ -s "$RUN/runner/models.json" ]; then
  RUNNER="$RUN/runner/codex-run.mjs"   # manifest: runner = origin/main $(git rev-parse origin/main)
elif [ -n "$SKILL_RUNNER" ] && [ -s "$SKILL_RUNNER/codex-run.mjs" ] && [ -s "$SKILL_RUNNER/models.json" ]; then
  RUNNER="$SKILL_RUNNER/codex-run.mjs"   # manifest: runner = installed skill's runner, $SKILL_RUNNER
elif [ -s "$HOME/.claude/scripts/codex-run/codex-run.mjs" ]; then
  RUNNER="$HOME/.claude/scripts/codex-run/codex-run.mjs"   # manifest: runner = user install
else
  echo "No trusted runner: stop and ask the user"; exit 1
fi
node "$RUNNER" --preflight
BASE=$(git merge-base origin/main HEAD); HEAD_SHA=$(git rev-parse HEAD)
MODEL=$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).roles.sol.model" "$(dirname "$RUNNER")/models.json")
# write $RUN/brief.md first (SKILL.md Step 3), unless fully blind
cat > "$RUN/prompt.md" <<EOF
Read .agents/skills/impartial-review/SKILL.md completely and act as its Manager on the branch diff: base $BASE, head $HEAD_SHA. Read the diff with git diff $BASE $HEAD_SHA. Spawn fresh-context sub-reviewers with spawn_agent, fork_turns "none", model $MODEL, reasoning_effort high, as the skill directs; each is a leaf reviewer. Start no codex exec or other reviewer CLI process; if agent tools are missing, say so in the report. Author brief: $RUN/brief.md; give it only to the intent reviewer, as the skill directs; every other sub-reviewer gets the diff without it. No file edits, no Git writes, no publication. Verify the sub-reviewers' findings and write the final verified report. First line: Scope: base $BASE, head $HEAD_SHA. Second line: Sub-reviewers: <number spawned>.
EOF
# Bash tool: run_in_background true; then poll $RUN/codex/status.json, read $RUN/codex/result.json
node "$RUNNER" --out "$RUN/codex" --role sol --sandbox read-only \
  --prompt-file "$RUN/prompt.md" --timeout-min 60 \
  --expect-read .agents/skills/impartial-review/SKILL.md --expect-diff "$BASE $HEAD_SHA" \
  --label codex-fullreview > "$RUN/runner.log" 2>&1
```

- Trusted runner, in order: (1) `codex-run.mjs` and `models.json` from `origin/<default-branch>`, not HEAD, copied into `$RUN/runner`, outside `--out` (the runner reads `models.json` from its own folder). Both copies must be non-empty: Git Bash can mangle the `rev:path` argument and leave an empty file. (2) No runner on the default branch (a repo without one, or the change that adds it): the runner installed beside the active skill, `<skill folder>/../../scripts/codex-run/` (plugin cache or user-level install), only when its resolved absolute path is outside the reviewed checkout (`git rev-parse --show-toplevel`) and both files are non-empty. A skill folder inside the reviewed checkout is the untrusted copy: never use its runner. (3) Else the user's install `~/.claude/scripts/codex-run/codex-run.mjs`. (4) None of these: stop and tell the user. Only if the user confirms the reviewed change is their own trusted work may `.claude/scripts/codex-run/codex-run.mjs` from the checkout run, and the report must say so. PowerShell: `>` re-encodes native output (UTF-16 on Windows PowerShell 5.1); run the two `git show` lines through `cmd /c` or Git Bash.
- The heredoc is unquoted on purpose: `$BASE`, `$HEAD_SHA`, `$RUN` and `$MODEL` expand when the file is written. The prompt reaches Codex on stdin, so nothing expands after that. Check `prompt.md` before launch.
- Explicit user model or effort: keep `--role sol` and add `--model <id>`, plus `--effort <e>` only when the user picks one, and put the same values in the prompt's `model` and `reasoning_effort`. The `--effort medium` planning option changes both.
- Fallback Manager skill copy (SKILL.md Step 1): replace `.agents/skills/impartial-review/SKILL.md` in the prompt and in `--expect-read` with its absolute path.
- Report: `$RUN/codex/last.md`. Evidence: `$RUN/codex/result.json` (`threadId`, `evidence.rollout`, `spawnCalls`, `expectedReads`, `diffReads`).
- `--expect-diff` counts only the Manager's own `git diff BASE HEAD` reads (`diffReads`). Uncommitted scope: `--expect-diff "$HEAD_SHA"` (also sets `untrackedListed`). Commit scope: `"<base-sha> <head-sha>"`.

Each scope has its own complete prompt. Substitute the resolved SHAs and `$MODEL`; append only a focus the user requests:

- Branch diff: the prompt in the example above (drop its author-brief sentence for a fully blind review).
- Single commit, where base is the parent or, for a root commit, the empty tree: `Read .agents/skills/impartial-review/SKILL.md completely and act as its Manager on commit <head-sha>: base <base-sha>, head <head-sha>. Read the diff with git diff <base-sha> <head-sha>. Spawn fresh-context sub-reviewers with spawn_agent, fork_turns "none", model <MODEL>, reasoning_effort high, as the skill directs; each is a leaf reviewer. Start no codex exec or other reviewer CLI process; if agent tools are missing, say so in the report. No file edits, no Git writes, no publication. Verify the sub-reviewers' findings and write the final verified report. First line: Scope: base <base-sha>, head <head-sha>. Second line: Sub-reviewers: <number spawned>.`
- Uncommitted work: `Read .agents/skills/impartial-review/SKILL.md completely and act as its Manager on the uncommitted working tree (staged, unstaged, untracked) against head <head-sha>. Read tracked changes with git diff <head-sha>, list files with git status --porcelain --untracked-files=all, and read each untracked file's contents. Spawn fresh-context sub-reviewers with spawn_agent, fork_turns "none", model <MODEL>, reasoning_effort high, as the skill directs; each is a leaf reviewer. Start no codex exec or other reviewer CLI process; if agent tools are missing, say so in the report. No file edits, no Git writes, no publication. Verify the sub-reviewers' findings and write the final verified report. First line: Scope: uncommitted, head <head-sha>, paths <every dirty path, comma-separated>. Second line: Sub-reviewers: <number spawned>.`

When a brief is supplied for a single commit or uncommitted work, insert the author-brief sentence after the scope, as in the branch prompt.
