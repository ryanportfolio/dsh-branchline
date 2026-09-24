---
name: "astra-review"
description: "Codex CLI review configured for gpt-6-astra at medium reasoning. Same verified CLI lifecycle as codex-review. Use for $astra-review or 'have Astra review this'."
---

# Astra review

Follow the complete execution contract of the native [codex-review](../codex-review/SKILL.md) skill: current local preflight, exact scope, unique run directory, source manifest, launch path (external-review first, selector fallback), process completion, report identity, finding verification, and honest attribution. This entrypoint changes only the defaults:

| Setting | Astra default |
|---|---|
| Model | `gpt-6-astra` |
| Effort | `medium`, regardless of diff size |
| Run directory prefix | `.tmp/astra-review-` |

Invoked from Codex, the reviewer shares the author's vendor: it supplies fresh context, not vendor independence. Say so in the result.

Skip the newest-Sol check in codex-review Step 1; this entrypoint never swaps Astra for Sol. Honor an explicit user model or effort choice. Confirm supported local options before inference; a model identifier in this file is not proof of availability. The invocation input carries scope as in codex-review.

Example for a branch diff after creating a fresh `$RUN` directory (POSIX shell):

```bash
mkdir -p .tmp
RUN=$(mktemp -d .tmp/astra-review-XXXXXXXX)
git fetch origin main
BASE=$(git merge-base origin/main HEAD); HEAD_SHA=$(git rev-parse HEAD)
# External-review path (.agents/skills/external-review/SKILL.md exists):
codex exec review "Read .agents/skills/external-review/SKILL.md completely and follow it for this review of the branch diff: base $BASE, head $HEAD_SHA. Read the diff with git diff $BASE $HEAD_SHA. Leaf review: no agents, no nested reviews, no edits." -m gpt-6-astra -c model_reasoning_effort=medium -o "$RUN/report.md" < /dev/null > "$RUN/run.log" 2>&1
# Selector path (no external-review skill):
codex exec review --base origin/main -m gpt-6-astra -c model_reasoning_effort=medium -o "$RUN/report.md" < /dev/null > "$RUN/run.log" 2>&1
```

Commit and uncommitted prompts, the root-commit and dirty-tree rules, the skill-load and scope-identity checks, prompt escaping, and path attribution follow codex-review.

On PowerShell, use a GUID-named directory and supported stdin and output redirection as described in codex-review. Distinct prefixes do not prevent collisions between two Astra invocations; every run must still be unique.

If Astra is unavailable, report that outcome. Do not silently inherit another model or attribute a fallback to Astra. Any authorized retry uses a new directory and reports its observed model and effort, or explicitly marks model resolution unverified. Keep lifecycle fixes in codex-review rather than forking them here.

The requested review does not authorize fixes, commits, pushes, PRs, merges, publication, machine configuration changes, or paid credit purchases.
