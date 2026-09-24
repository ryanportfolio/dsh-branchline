#!/bin/bash
set -euo pipefail

# SessionStart hook
#
# Design principle: do work Claude can't do itself, surface things Claude can't
# otherwise see, and stay quiet about anything Claude can recompute on demand.
#
# CLOUD (CLAUDE_CODE_REMOTE=true):
#   - Auto-rebase current branch onto origin/main (cloud sandbox is isolated,
#     safe to rewrite)
#   - Print the universal-skills reminder block
#
# Note: we deliberately do NOT cat CLAUDE.md here. Claude Code auto-loads it as
# project memory, and SessionStart only injects context via stdout/additionalContext
# (not stderr), so a stderr cat was redundant noise, not context injection.
#
# LOCAL (CLAUDE_CODE_REMOTE unset):
#   - Read-only fetch from origin (prime the cache, no output)
#   - Print the universal-skills reminder block
#   - Never modify the working tree or any branch

# Retry a git fetch up to 4 times with exponential backoff (2s, 4s, 8s, 16s).
# The cloud sandbox's local git proxy occasionally returns transient 503s;
# without retries, a single blip surfaces as a SessionStart hook error.
# Usage: fetch_with_retry <args to pass to git fetch...>
fetch_with_retry() {
  local attempt=1
  local max_attempts=4
  local delay=2
  while [ "$attempt" -le "$max_attempts" ]; do
    if git fetch "$@" 2>&1; then
      return 0
    fi
    if [ "$attempt" -lt "$max_attempts" ]; then
      echo "[SessionStart] fetch attempt $attempt failed, retrying in ${delay}s..." >&2
      sleep "$delay"
      delay=$((delay * 2))
    fi
    attempt=$((attempt + 1))
  done
  return 1
}

# >>> caveman:directive:begin (managed by /init-project; delete the whole block,
# markers included, when prose mode is "normal" -- keep it in sync with the
# "Default prose mode" section of CLAUDE.md) >>>
# Print the caveman-ultra session default to STDOUT.
#
# CRITICAL: this goes to stdout, NOT stderr. SessionStart injects context only
# via stdout/additionalContext. stderr is user-visible diagnostic noise that
# Claude never sees. The caveman default lives in CLAUDE.md, but project memory
# is easy to miss at session start, so we re-assert it here as injected context
# to make it the first thing Claude acts on. Keep it on stdout or it does nothing.
print_caveman_directive() {
  cat <<'CAVEMAN'
[SessionStart] ACTIVE SESSION DEFAULT: caveman ultra (per CLAUDE.md).
BEFORE your first reply, invoke the `caveman` skill at ultra intensity (Skill tool,
args: "ultra") and apply that style to session replies:
terse, abbreviated, arrows for causality, full technical accuracy preserved. This
is the default for each new session. "stop caveman" / "normal mode" disables it
for the current session unless the user explicitly changes the standing default.
  - Prose only. Code, commits, PRs, file contents, and symbol/function/API/error
    strings stay normal and are never abbreviated.
  - Auto-clarity carve-outs: security warnings, irreversible-action confirmations,
    and ambiguous multi-step sequences drop to plain prose, then resume caveman.
  - The caveman skill also carries the always-on unslop contract; invoking it
    activates both. See "Built-in Unslop for session replies" in the skill body.
CAVEMAN
}
# <<< caveman:directive:end <<<

# Cleanup routing also applies when the optional Caveman activation block is removed.
# Keep this thin reminder aligned with CLAUDE.md and the skill entrypoints.
print_unslop_directive() {
  cat <<'UNSLOP'
[SessionStart] Cleanup routing (per CLAUDE.md): Caveman includes Unslop for
session replies. Use Writing for user-facing deliverables and explicit prose
cleanup; keep those artifacts in normal audience-appropriate prose. Explicit
code-diff cleanup follows Caveman's references/diff-cleanup.md. Commit messages
and PR bodies use normal prose and repository Git conventions. Preserve exact
technical content and explicit user voice choices; no separate Unslop skill
or inline kernel digest is required.
UNSLOP
}

# Print the fixed "universal skills" reminder block.
# Cross-cutting skills that apply to most sessions regardless of task; project-
# specific skills are not listed. Claude discovers those from the
# available-skills list.
print_skill_reminders() {
  cat >&2 <<'SKILLS'
[SessionStart] Universal skills. Invoke proactively when the trigger fires:
SKILLS
  # >>> caveman:reminder:begin (managed by /init-project; delete the whole block,
  # markers included, when prose mode is "normal") >>>
  cat >&2 <<'SKILLS'
  - caveman                       → FIRST, at session start: /caveman ultra (default prose mode)
SKILLS
  # <<< caveman:reminder:end <<<
  cat >&2 <<'SKILLS'
  - recall                        → BEFORE work in unfamiliar areas; /recall save <text> after gotchas
  - brainstorming                 → BEFORE designing new features or behavior changes
  - impartial-review              → AFTER substantive changes, before merging
SKILLS
}

# Weekly drift check against the claude-starter template. Quiet by design:
# no remote configured and no network reach -> silent no-op. Counts only
# shared-surface files the template actually ships (project-only additions
# are not drift). Prints to STDOUT so Claude sees it as injected context and
# can suggest /sync-starter.
check_starter_drift() {
  git rev-parse --git-dir >/dev/null 2>&1 || return 0

  # Skip inside the template repo itself: nothing to drift from.
  case "$(git remote get-url origin 2>/dev/null)" in
    *claude-starter*|*AI-Firmware*|*Harness-Firmware*) return 0 ;;
  esac

  local gitdir stamp
  gitdir=$(git rev-parse --git-dir)
  stamp="$gitdir/starter-drift-checked"
  if [ -f "$stamp" ]; then
    local now mtime
    now=$(date +%s)
    mtime=$(stat -c %Y "$stamp" 2>/dev/null || echo 0)
    if [ $((now - mtime)) -lt 604800 ]; then
      return 0
    fi
  fi
  touch "$stamp" 2>/dev/null || true

  local ref
  if git remote get-url starter >/dev/null 2>&1; then
    git fetch starter --quiet 2>/dev/null || return 0
    ref="starter/main"
  else
    # No named remote (fresh clone / cloud sandbox): try a direct fetch.
    # Fails silently when the repo is unreachable or auth is unavailable.
    git fetch --quiet https://github.com/ryanportfolio/Harness-Firmware.git main 2>/dev/null || return 0
    ref="FETCH_HEAD"
  fi

  local changed
  changed=$(git diff --name-only HEAD "$ref" -- \
    .claude/skills .claude/hooks .claude/scripts .claude/output-styles .claude/settings.json \
    .agents/skills .agents/skill-modes.json .agents/skill-capabilities.json 2>/dev/null) || return 0
  if [ -z "$changed" ]; then
    return 0
  fi

  # Membership test via ls-tree, NOT "git cat-file -e ref:path": the colon
  # argument gets mangled by MSYS path conversion under Git Bash on Windows.
  local template_files
  template_files=$(git ls-tree -r --name-only "$ref" 2>/dev/null) || return 0

  local f n=0
  while IFS= read -r f; do
    if [ -n "$f" ] && printf '%s\n' "$template_files" | grep -qxF "$f"; then
      n=$((n + 1))
    fi
  done <<EOF
$changed
EOF

  if [ "$n" -gt 0 ]; then
    echo "[SessionStart] claude-starter template differs on $n shared file(s). Run /sync-starter to review and pull selectively."
  fi
}

# Detect the template/plugin double-install footgun: this project ships the
# starter skills un-namespaced in .claude/skills/, AND the claude-starter
# plugin is enabled for it (project, local, or user scope). Both load ->
# every skill appears twice. Warn so Claude can tell the user the fix.
# Skipped inside the template repo itself (plugin installs there are tests).
check_plugin_overlap() {
  [ -d .claude/skills/sync-starter ] || return 0
  case "$(git remote get-url origin 2>/dev/null)" in
    *claude-starter*|*AI-Firmware*|*Harness-Firmware*) return 0 ;;
  esac
  if grep -hs '"claude-starter@[^"]*": *true' \
      .claude/settings.json .claude/settings.local.json \
      "$HOME/.claude/settings.json" 2>/dev/null | grep -q .; then
    echo "[SessionStart] The claude-starter PLUGIN is enabled for this project, but the project already ships the same skills un-namespaced in .claude/skills/, so every skill loads twice. Fix: 'claude plugin uninstall claude-starter' (keep the project copies; they are the tunable ones)."
  fi
}

# >>> caveman:call:begin (managed by /init-project; delete the whole block,
# markers included, when prose mode is "normal") >>>
# Inject the caveman-ultra default into context FIRST (stdout), before any git
# work or branch-specific exit. Independent of git state, so it runs every path.
print_caveman_directive
# <<< caveman:call:end <<<

# Always-on unslop directive (stdout, every path).
print_unslop_directive

# Weekly template drift nudge (quiet no-op when template is unreachable).
check_starter_drift

# Plugin/template overlap warning (stdout: Claude should see it and act).
check_plugin_overlap

# ---------- Cloud path ----------
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  echo "[SessionStart] Syncing branch with latest main..." >&2

  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

  if [ "$CURRENT_BRANCH" = "main" ]; then
    echo "[SessionStart] Already on main branch, skipping sync" >&2
    print_skill_reminders
    exit 0
  fi

  echo "[SessionStart] Fetching origin/main..." >&2
  if ! fetch_with_retry origin main; then
    echo "[SessionStart] Warning: Failed to fetch origin/main after 4 attempts; continuing without sync" >&2
    print_skill_reminders
    exit 0
  fi

  if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    echo "[SessionStart] Warning: Uncommitted changes detected, skipping sync" >&2
    print_skill_reminders
    exit 0
  fi

  echo "[SessionStart] Rebasing $CURRENT_BRANCH onto origin/main..." >&2
  if git rebase origin/main 2>&1; then
    echo "[SessionStart] ✓ Successfully rebased onto origin/main" >&2
  else
    echo "[SessionStart] Rebase failed, aborting..." >&2
    git rebase --abort 2>/dev/null || true

    echo "[SessionStart] Attempting merge with origin/main..." >&2
    if git merge origin/main --no-edit 2>&1; then
      echo "[SessionStart] ✓ Successfully merged origin/main" >&2
    else
      echo "[SessionStart] Warning: Merge failed, you may need to resolve conflicts manually" >&2
      git merge --abort 2>/dev/null || true
      print_skill_reminders
      exit 0
    fi
  fi

  print_skill_reminders
  exit 0
fi

# ---------- Local path ----------
# Skip silently if not a git repo
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

# Skip silently if no origin remote
if ! git remote get-url origin >/dev/null 2>&1; then
  exit 0
fi

# Quiet read-only fetch: prime the cache so subsequent git commands in this
# session see up-to-date refs. No output unless retries trigger a warning.
fetch_with_retry --all --prune --quiet 2>/dev/null || \
  echo "[SessionStart] Warning: fetch failed after 4 attempts; reporting from cached state" >&2

print_skill_reminders

exit 0
