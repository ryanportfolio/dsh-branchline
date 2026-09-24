---
name: astra-fullreview
description: "Full multi-agent Codex review on gpt-6-astra at medium reasoning. Same verified lifecycle as codex-fullreview. Use for /astra-fullreview or 'full Astra review with sub-reviewers'."
---

# Astra full review

Read `.claude/skills/codex-fullreview/SKILL.md` and follow its complete execution contract: local preflight, the required `.agents/skills/impartial-review/SKILL.md` check (when it is absent, stop and point to `astra-review`, not `codex-review`), exact scope, unique run directory, source manifest, plain `codex exec` launch that reads `.agents/skills/impartial-review/SKILL.md` by file and acts as its Manager, process completion, report identity, the sub-reviewer spawn count, finding verification, and honest attribution. This entrypoint changes only the defaults:

| Setting | Astra default |
|---|---|
| Model | `gpt-6-astra`, for the Manager and every sub-reviewer |
| Effort | `medium`, regardless of diff size |
| Run directory prefix | `.tmp/astra-fullreview-` |

Skip the newest-Sol check in `codex-fullreview` Step 1; this entrypoint never swaps Astra for Sol. Honor an explicit user model/effort choice. Confirm supported local options before inference; a model identifier in this file is not proof of availability. `$ARGUMENTS` carries scope as in `codex-fullreview`. Usage is higher than `astra-review`; say so before launch.

Example for a branch diff after creating a fresh `$RUN` directory (POSIX shell):

```bash
mkdir -p .tmp
RUN=$(mktemp -d .tmp/astra-fullreview-XXXXXXXX)
git fetch origin main
BASE=$(git merge-base origin/main HEAD); HEAD_SHA=$(git rev-parse HEAD)
codex exec -s read-only -m gpt-6-astra -c model_reasoning_effort=medium -o "$RUN/report.md" "Read .agents/skills/impartial-review/SKILL.md completely and act as its Manager on the branch diff: base $BASE, head $HEAD_SHA. Read the diff with git diff $BASE $HEAD_SHA. Spawn fresh-context sub-reviewers with spawn_agent, fork_turns \"none\", model gpt-6-astra, reasoning_effort medium, as the skill directs; each is a leaf reviewer. Start no codex exec or other reviewer CLI process; if agent tools are missing, say so in the report. No file edits, no Git writes, no publication. Verify the sub-reviewers' findings and write the final verified report. First line: Scope: base $BASE, head $HEAD_SHA. Second line: Sub-reviewers: <number spawned>." < /dev/null > "$RUN/run.log" 2>&1
```

Commit and uncommitted prompts (with the Astra model and effort in place of Sol and high), the root-commit base, the file-named skill invocation and prompt escaping, the session-file checks for skill load and spawned children, the scope-line check, and attribution follow `codex-fullreview`. Zero spawned children is reported as "no sub-reviewers ran", never hidden.

On PowerShell use a GUID-named directory and supported stdin/output redirection as described in `codex-fullreview`. Distinct prefixes do not prevent collisions between two Astra invocations; every run must still be unique.

If Astra is unavailable, report that outcome. Do not silently inherit another model or attribute a fallback to Astra. Any authorized retry uses a new directory and reports its observed model/effort, or explicitly marks model resolution unverified. Keep lifecycle fixes in `codex-fullreview` rather than forking them here.
