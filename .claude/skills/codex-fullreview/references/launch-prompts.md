# codex-fullreview: launch command and per-scope prompts

Mandatory read from `../SKILL.md` Step 3 before launch. Moved verbatim from Step 3.

For example, a branch diff in a POSIX shell:
```bash
mkdir -p .tmp
RUN=$(mktemp -d .tmp/codex-fullreview-XXXXXXXX)
git fetch origin main
BASE=$(git merge-base origin/main HEAD); HEAD_SHA=$(git rev-parse HEAD)
codex exec -s read-only -m gpt-6.1-sol -c model_reasoning_effort=high -o "$RUN/report.md" "Read .agents/skills/impartial-review/SKILL.md completely and act as its Manager on the branch diff: base $BASE, head $HEAD_SHA. Read the diff with git diff $BASE $HEAD_SHA. Spawn fresh-context sub-reviewers with spawn_agent, fork_turns \"none\", model gpt-6.1-sol, reasoning_effort high, as the skill directs; each is a leaf reviewer. Start no codex exec or other reviewer CLI process; if agent tools are missing, say so in the report. Author brief: $RUN/brief.md; give it only to the intent reviewer, as the skill directs; every other sub-reviewer gets the diff without it. No file edits, no Git writes, no publication. Verify the sub-reviewers' findings and write the final verified report. First line: Scope: base $BASE, head $HEAD_SHA. Second line: Sub-reviewers: <number spawned>." < /dev/null > "$RUN/run.log" 2>&1
```

Each scope has its own complete prompt. Substitute the resolved SHAs; append only a focus the user requests:

- Branch diff: the prompt in the example above (drop its author-brief sentence for a fully blind review).
- Single commit, where base is the parent or, for a root commit, the empty tree: `Read .agents/skills/impartial-review/SKILL.md completely and act as its Manager on commit <head-sha>: base <base-sha>, head <head-sha>. Read the diff with git diff <base-sha> <head-sha>. Spawn fresh-context sub-reviewers with spawn_agent, fork_turns "none", model gpt-6.1-sol, reasoning_effort high, as the skill directs; each is a leaf reviewer. Start no codex exec or other reviewer CLI process; if agent tools are missing, say so in the report. No file edits, no Git writes, no publication. Verify the sub-reviewers' findings and write the final verified report. First line: Scope: base <base-sha>, head <head-sha>. Second line: Sub-reviewers: <number spawned>.`
- Uncommitted work: `Read .agents/skills/impartial-review/SKILL.md completely and act as its Manager on the uncommitted working tree (staged, unstaged, untracked) against head <head-sha>. Read tracked changes with git diff <head-sha>, list files with git status --porcelain --untracked-files=all, and read each untracked file's contents. Spawn fresh-context sub-reviewers with spawn_agent, fork_turns "none", model gpt-6.1-sol, reasoning_effort high, as the skill directs; each is a leaf reviewer. Start no codex exec or other reviewer CLI process; if agent tools are missing, say so in the report. No file edits, no Git writes, no publication. Verify the sub-reviewers' findings and write the final verified report. First line: Scope: uncommitted, head <head-sha>, paths <every dirty path, comma-separated>. Second line: Sub-reviewers: <number spawned>.`
