#!/usr/bin/env bash
# Generates every concept image written by make-prompts.mjs, a few at a time, through the shared
# Codex runner (.claude/scripts/codex-run/codex-run.mjs in this repo; docs in its README.md).
# Usage (from the workspace root): bash run-batch.sh <scratch dir> [parallel, default 3]
# Reruns skip images this script already accepted (out/<name>.png.ok marker), so a failed or interrupted
# batch resumes where it stopped.
set -u

dir=${1:?usage: run-batch.sh <scratch dir> [parallel]}
parallel=${2:-3}
case "$parallel" in
  ''|*[!0-9]*|0) echo "parallel must be a positive whole number, got '$parallel'" >&2; exit 1 ;;
esac

# The runner lives in the repo, not in a personal install: look in the workspace's git root first,
# then in the repo this script ships in (four levels up from <skills dir>/redesign-concepts/scripts/).
runner=""
for root in "$(git rev-parse --show-toplevel 2>/dev/null)" \
            "$(cd "$(dirname "$0")/../../../.." 2>/dev/null && pwd)"; do
  root=${root%$'\r'}
  if [ -n "$root" ] && [ -f "$root/.claude/scripts/codex-run/codex-run.mjs" ]; then
    runner="$root/.claude/scripts/codex-run/codex-run.mjs"; break
  fi
done
[ -n "$runner" ] || { echo "codex runner not found: no .claude/scripts/codex-run/codex-run.mjs in the git root or next to this script" >&2; exit 1; }

# The image tool needs a direct ChatGPT login; a gateway login alone does not expose it.
preflight=$(node "$runner" --preflight 2>&1)
case "$preflight" in
  *'"chatgptLogin": true'*) ;;
  *) echo "codex is not logged in with ChatGPT. Run 'codex login' first. Preflight said:" >&2
     echo "$preflight" >&2; exit 1 ;;
esac

mkdir -p "$dir/out" "$dir/logs" "$dir/runs"

# Valid = a PNG signature and at least 100 KB. A generated screen is hundreds of KB or more;
# a few KB means it was drawn in code or cut short.
valid() {
  [ -f "$1" ] || return 1
  [ "$(head -c 8 "$1" | od -An -tx1 | tr -d ' \n')" = "89504e470d0a1a0a" ] || return 1
  [ "$(wc -c < "$1" | tr -d ' ')" -ge 100000 ]
}

# Accepted = valid and marked: the marker is written only after the runner reported ok and the PNG
# passed. A valid PNG without it may come from a failed or unchecked run (e.g. an interrupted batch).
accepted() { valid "$1" && [ -f "$1.ok" ]; }

run_one() {
  local prompt=$1 name out ref code run reason
  name=$(basename "$prompt" .txt)
  out="$dir/out/$name.png"
  if accepted "$out"; then echo "skip $name (already generated)"; return 0; fi
  # A stale marker must not outlive the attempt it belonged to.
  rm -f "$out.ok"
  # A leftover is kept for inspection but moved aside so this run regenerates it.
  if valid "$out"; then
    mv -f "$out" "$dir/out/$name.unconfirmed.png"
    echo "retry $name: valid PNG without an acceptance marker (unchecked run), moved to out/$name.unconfirmed.png"
  elif [ -e "$out" ]; then
    mv -f "$out" "$dir/out/$name.rejected.png"
  fi
  local args=()
  # Strip \r: a refs file edited on a CRLF checkout would otherwise pass "path\r" to codex.
  while IFS= read -r ref || [ -n "$ref" ]; do
    ref=${ref%$'\r'}
    [ -n "$ref" ] && args+=(--image "$ref")
  done < "${prompt%.txt}.refs"
  if [ ${#args[@]} -eq 0 ]; then echo "FAILED $name: no refs in ${prompt%.txt}.refs"; return 1; fi
  # The runner refuses a non-empty --out, so every attempt gets its own run folder.
  run="$dir/runs/$name-$(date +%Y%m%d-%H%M%S)-$BASHPID"
  # --role astra: model pin in models.json next to the runner.
  # model_provider=openai: a proxy provider in ~/.codex/config.toml hides image_gen.
  # workspace-write: the default read-only sandbox blocks the save.
  node "$runner" --out "$run" --role astra --sandbox workspace-write \
    --config model_provider=openai --timeout-min 20 --label "redesign-concepts $name" \
    "${args[@]}" --prompt-file "$prompt" > "$dir/logs/$name.log" 2>&1
  code=$?
  reason=$(grep -o '"reason": *"[^"]*"' "$run/result.json" 2>/dev/null | sed 's/.*"\([^"]*\)"$/\1/')
  # A valid PNG from a run the runner failed (model or sandbox mismatch, timeout) is not accepted.
  ok=no; grep -q '"ok": *true' "$run/result.json" 2>/dev/null && ok=yes
  if [ "$ok" = yes ] && valid "$out"; then
    : > "$out.ok"
    echo "done $name ($(wc -c < "$out" | tr -d ' ') bytes)"
  elif [ -e "$out" ]; then
    mv -f "$out" "$dir/out/$name.rejected.png"
    echo "FAILED $name: runner did not report ok, or output is not a valid PNG of 100 KB or more (runner exit $code${reason:+, $reason}), moved to out/$name.rejected.png; see $dir/logs/$name.log and $run"
    return 1
  else
    echo "FAILED $name: no image (runner exit $code${reason:+, $reason}), see $dir/logs/$name.log and $run"
    return 1
  fi
}

for prompt in "$dir"/prompts/*.txt; do
  [ -e "$prompt" ] || { echo "no prompts in $dir/prompts; run make-prompts.mjs first" >&2; exit 1; }
  while [ "$(jobs -rp | wc -l)" -ge "$parallel" ]; do sleep 2; done
  run_one "$prompt" &
done
wait

missing=0
for prompt in "$dir"/prompts/*.txt; do
  accepted "$dir/out/$(basename "$prompt" .txt).png" || missing=$((missing + 1))
done
if [ "$missing" -eq 0 ]; then echo "All images generated in $dir/out."
else echo "$missing image(s) missing or invalid; rerun the same command to retry them."; exit 1; fi
