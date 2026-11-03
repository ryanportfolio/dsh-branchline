# Round baseline

What a round baseline holds and how it is taken. Read at Plan before taking or validating any baseline.

Baseline = workspace before its executor ran. Rounds never commit between selves → HEAD
always wrong reference: would attribute earlier rounds' verified edits + pre-existing user
changes to this executor. Take as manifest file under task's `.tmp` dir: path + content
hash for every file under Write scope (incl. outside repo), every untracked file, every
tracked file w/ uncommitted changes. Git workspace: also pin tracked snapshot: `git stash
create` (touches neither tree nor index; empty output means clean, use HEAD) +
`git update-ref refs/long-horizon/<task-slug>/round-<N>-c<index> <sha>` so gc can't prune
it across sessions. Git ops unavailable → equivalent immutable snapshot + content manifest
valid. Include relevant ignored generated artifacts explicitly; name unavailable coverage,
don't call it clean. Record deleted paths. Sizes/mtimes ≠ baseline; hashes are.
`.claude/skills/long-horizon/scripts/manifest.mjs` builds
(`<root> <out.json> --ref <ref> [Write scope and ignored paths]`) + diffs
(`--diff <out.json>`). Workflow engine: the round's baseline agent builds the candidate
workspaces and takes every baseline as the script's first stage, at the manifest paths +
ref names already in the Current round block. Agent engine: Manager builds workspaces and
takes baselines inline before spawning executors.
