# Launch example

Mandatory read from Step 3 of [../SKILL.md](../SKILL.md) before launching. Path choice, run metadata, the complete prompt for each scope, and the rules for a requested focus stay in SKILL.md Step 3.

For example, a branch diff in a POSIX shell:

```bash
mkdir -p .tmp
RUN=$(mktemp -d .tmp/codex-review-XXXXXXXX)
git fetch origin main
BASE=$(git merge-base origin/main HEAD); HEAD_SHA=$(git rev-parse HEAD)
# External-review path (.agents/skills/external-review/SKILL.md exists):
codex exec review "Read .agents/skills/external-review/SKILL.md completely and follow it for this review of the branch diff: base $BASE, head $HEAD_SHA. Read the diff with git diff $BASE $HEAD_SHA. Leaf review: no agents, no nested reviews, no edits." -m gpt-6.1-sol -c model_reasoning_effort=high -o "$RUN/report.md" < /dev/null > "$RUN/run.log" 2>&1
# Selector path (no external-review skill):
codex exec review --base origin/main -m gpt-6.1-sol -c model_reasoning_effort=high -o "$RUN/report.md" < /dev/null > "$RUN/run.log" 2>&1
```
