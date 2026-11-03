# Codex CLI dispatch commands

Loaded from `SKILL.md` Step 3 when reviewers run as `codex exec` processes (no multi-agent tools). Moved verbatim.

```bash
mkdir -p .tmp
RUN=$(mktemp -d .tmp/impartial-review-XXXXXXXX)
codex exec -m gpt-6.1-sol -c model_reasoning_effort=high -s read-only \
  -o "$RUN/A.md" - < "$RUN/prompt-A.txt" > "$RUN/A.log" 2>&1
```

Write each bucket prompt to `$RUN/prompt-<bucket>.txt` and feed it on stdin with `-`. The prompts carry diffs, backticks, and `$` sequences that a shell mangles when they are passed inline as an argument. Launch only the current bounded batch in the background, then wait for that batch before starting more processes. Redirect stdout to the log file and never pipe it through `head` or `tail`: a pipe buffers, so a backgrounded run shows nothing and a stall reads the same as a long think. `-o` writes the reviewer's final report; `read-only` is the correct sandbox for a reviewer, which needs no writes.
