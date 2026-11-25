# Launch example

Mandatory read from Step 3 of [../SKILL.md](../SKILL.md) before launching. Path choice, run metadata, and the rules for a requested focus stay in SKILL.md Step 3. Runner docs: `.claude/scripts/codex-run/README.md`.

For example, a branch diff in a POSIX shell, run from the repository root:

```bash
mkdir -p .tmp
RUN=$(mktemp -d .tmp/codex-review-XXXXXXXX)
git fetch origin main

# Trusted runner (SKILL.md Step 0): default branch copy, never the reviewed HEAD
mkdir -p "$RUN/runner" && MSYS_NO_PATHCONV=1 git show origin/main:.claude/scripts/codex-run/codex-run.mjs > "$RUN/runner/codex-run.mjs"
MSYS_NO_PATHCONV=1 git show origin/main:.claude/scripts/codex-run/models.json > "$RUN/runner/models.json"
# Installed skill's runner (plugin cache, user-level install). Codex ports in .agents/skills/ use ../../../.claude/scripts/codex-run
SKILL_DIR="<absolute folder holding this SKILL.md>"
# Trusted only outside the reviewed checkout (case-insensitive prefix check: Windows paths keep the typed case)
SKILL_RUNNER=$(cd "$SKILL_DIR/../../scripts/codex-run" 2>/dev/null && pwd -P)
REPO_TOP=$(cd "$(git rev-parse --show-toplevel)" && pwd -P)
lc() { printf '%s/' "$1" | tr '[:upper:]' '[:lower:]'; }
case "$(lc "$SKILL_RUNNER")" in "$(lc "$REPO_TOP")"*) SKILL_RUNNER= ;; esac
if [ -s "$RUN/runner/codex-run.mjs" ] && [ -s "$RUN/runner/models.json" ]; then
  RUNNER="$RUN/runner/codex-run.mjs"   # manifest: runner = origin/main $(git rev-parse origin/main)
elif [ -n "$SKILL_RUNNER" ] && [ -s "$SKILL_RUNNER/codex-run.mjs" ] && [ -s "$SKILL_RUNNER/models.json" ]; then
  RUNNER="$SKILL_RUNNER/codex-run.mjs"   # manifest: runner = installed skill's runner, $SKILL_RUNNER
elif [ -s "$HOME/.claude/scripts/codex-run/codex-run.mjs" ]; then
  RUNNER="$HOME/.claude/scripts/codex-run/codex-run.mjs"   # manifest: runner = user install
else
  echo "No trusted runner: stop and ask the user (SKILL.md Step 0)"; exit 1
fi
node "$RUNNER" --preflight
BASE=$(git merge-base origin/main HEAD); HEAD_SHA=$(git rev-parse HEAD)
# write "$RUN/manifest.md" now (SKILL.md Step 3)

# External-review path (.agents/skills/external-review/SKILL.md exists):
cat > "$RUN/prompt.md" <<EOF
Read .agents/skills/external-review/SKILL.md completely and follow it for this review of the branch diff: base $BASE, head $HEAD_SHA. Read the diff with git diff $BASE $HEAD_SHA. Leaf review: no agents, no nested reviews, no edits.
EOF
node "$RUNNER" --review --role sol --prompt-file "$RUN/prompt.md" \
  --expect-diff "$BASE $HEAD_SHA" --expect-read .agents/skills/external-review/SKILL.md \
  --out "$RUN/codex" --label "codex-review branch $BASE..$HEAD_SHA" > "$RUN/runner.log" 2>&1

# Selector path (no external-review skill):
node "$RUNNER" --review --role sol --base origin/main \
  --expect-diff "$BASE $HEAD_SHA" --out "$RUN/codex" > "$RUN/runner.log" 2>&1
```

- Single commit: selector `--commit "$HEAD_SHA"`, `--expect-diff "$BASE $HEAD_SHA"` with `BASE` = parent or the empty tree for a root commit. Smoke-tested 2026-11-22 on codex-cli 0.171.0: `ok`, 1 review sibling, `exitedReviewMode` 1, `diffReads` 0 (the selector reviewer read the change with `git show <sha>`, so scope identity stays unverified on this path).
- Uncommitted work: selector `--uncommitted`, `--expect-diff "$HEAD_SHA"` (one SHA means `git diff <head>`); the runner also sets `untrackedListed`.
- Explicit user model or effort: keep `--role sol` and add `--model <id>`; add `--effort <e>` only when the user picks one.
- Run the whole `node "$RUNNER" ...` line through Bash `run_in_background`; a foreground call dies at the 10-minute ceiling. Poll `cat "$RUN/codex/status.json"`; after exit read `$RUN/codex/result.json`, `$RUN/codex/review-output.json`, and `$RUN/codex/last.md`. `runner.log` holds only the 30 s progress lines and the final `OK` or `FAILED: <reason>` line. Redirect complete output to a file, never through `head` or `tail`.
- PowerShell: `>` re-encodes native output (UTF-16 on Windows PowerShell 5.1), which breaks the runner copy; run the two `git show` lines through `cmd /c` or Git Bash. No `<` redirection and no heredoc. Write the prompt with the Write tool and pass `--prompt-file`. The runner sends the prompt to codex on stdin, so `$` and backticks in it are safe; only the shell that writes the file can expand `$`.

External-review prompts per scope (substitute the resolved SHAs; append only a focus the user requests):

- Branch diff: `Read .agents/skills/external-review/SKILL.md completely and follow it for this review of the branch diff: base <base-sha>, head <head-sha>. Read the diff with git diff <base-sha> <head-sha>. Leaf review: no agents, no nested reviews, no edits.`
- Single commit, where base is the parent or, for a root commit, the empty tree from Step 2: `Read .agents/skills/external-review/SKILL.md completely and follow it for this review of commit <head-sha>: base <base-sha>, head <head-sha>. Read the diff with git diff <base-sha> <head-sha>. Leaf review: no agents, no nested reviews, no edits.`
- Uncommitted work: `Read .agents/skills/external-review/SKILL.md completely and follow it for this review of the uncommitted working tree (staged, unstaged, untracked) against head <head-sha>. Read tracked changes with git diff <head-sha>, list files with git status --porcelain --untracked-files=all, and read each untracked file's contents. Leaf review: no agents, no nested reviews, no edits.`
