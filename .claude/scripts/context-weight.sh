#!/bin/bash
# context-weight.sh: approximate the per-turn "always-loaded" context cost.
#
# Measures what reloads every turn: the CLAUDE.md kernel, the global
# ~/.claude/CLAUDE.md, and every skill's injected name+description (the
# available-skills list). Reference files and skill BODIES are excluded:
# they load on demand and cost nothing until invoked.
#
# Token counts are chars/4, an approximation for trend lines, not billing.
# Run before and after an /optimize-context pass to prove the cut.
#
# Usage: bash .claude/scripts/context-weight.sh   (from the repo root)

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SKILLS_DIR="$ROOT/.claude/skills"

tok() { echo $(( ($1 + 3) / 4 )); }

total_chars=0

echo "== Always-loaded context weight =="
echo

# --- Kernels ---
for f in "$ROOT/CLAUDE.md" "$HOME/.claude/CLAUDE.md"; do
  if [ -f "$f" ]; then
    c=$(wc -c < "$f")
    total_chars=$((total_chars + c))
    printf '%-52s %7d chars  ~%5d tok\n' "${f/#$HOME/~}" "$c" "$(tok "$c")"
  fi
done

# --- Skill descriptions (frontmatter name + description = injected per turn) ---
echo
echo "-- Skill descriptions (injected into every turn's available-skills list) --"
skill_total=0
if [ -d "$SKILLS_DIR" ]; then
  tmp="$(mktemp)"
  for f in "$SKILLS_DIR"/*/SKILL.md; do
    [ -f "$f" ] || continue
    name=$(basename "$(dirname "$f")")
    # Extract the description value from YAML frontmatter, including
    # folded (>) multi-line continuation lines (indented under the key).
    desc=$(awk '
      NR==1 && /^---/ { fm=1; next }
      fm && /^---/ { exit }
      fm && /^description:/ { grab=1; sub(/^description:[ ]*>?[ ]*/,""); print; next }
      grab && /^[[:space:]]/ { sub(/^[[:space:]]+/,""); print; next }
      grab { exit }
    ' "$f")
    c=$(( ${#name} + ${#desc} ))
    skill_total=$((skill_total + c))
    printf '%d\t%s\n' "$c" "$name" >> "$tmp"
  done
  sort -rn "$tmp" | while IFS=$'\t' read -r c name; do
    printf '  %-40s %6d chars  ~%4d tok\n' "$name" "$c" "$(tok "$c")"
  done
  rm -f "$tmp"
  total_chars=$((total_chars + skill_total))
  printf '%-52s %7d chars  ~%5d tok\n' "  subtotal (skill descriptions)" "$skill_total" "$(tok "$skill_total")"
fi

# --- Not measurable from files (name them so they aren't forgotten) ---
echo
echo "-- Not measured (inspect in-session) --"
echo "  MCP tool lists + instruction blocks  -> 'claude mcp list', disconnect unused"
echo "  Bundled/marketplace skill descriptions -> skillOverrides in .claude/settings.json"
echo "  Auto-memory MEMORY.md index          -> per-machine, check its line count"

echo
printf '%-52s %7d chars  ~%5d tok\n' "TOTAL (file-measurable, per turn)" "$total_chars" "$(tok "$total_chars")"
