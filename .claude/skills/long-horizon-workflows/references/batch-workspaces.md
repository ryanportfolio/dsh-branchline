# Batch base, candidate workspaces, integration

How the Manager pins a batch base and builds candidate workspaces, then integrates audited rounds into main; also engine capacity. Read at Plan before building workspaces or sizing a batch, and again before integrating a batch.

Base of a batch, taken once by the Manager at Plan in the main workspace: `git stash create`
(empty output: use HEAD) → `git update-ref refs/long-horizon/<task-slug>/batch-<B> <sha>`,
then `manifest.mjs` on main over the union of the batch's write scopes (conflict reference
for integration). Never HEAD: drops earlier rounds' uncommitted verified work. Every
candidate workspace of every round in the batch is a detached worktree at that sha, built by
the round's baseline agent inside the script (Workflow engine) or by the Manager before
dispatch (Agent engine): `git worktree add --detach <path> <sha>`, copy in every untracked
file of main (`git ls-files --others --exclude-standard`), then the ignored artifacts the
step needs: a junction or symlink into main only for an artifact no step of the batch
writes, since a write through the link reaches main and every other candidate and the
manifest records the link, not its target; anything a step installs, updates or builds
into (dependencies under an install step, build output) is copied. Then take that
workspace's Baseline. Never plain copy of Git checkout: copied `.git` file still points at
original's index + HEAD. Plain copies only for non-Git workspaces. Round Baseline stays the
attribution reference; checkout filters (e.g. `core.autocrlf`) can make round bytes differ
from main's.

Workflow engine: one call per batch, `args.rounds` holding every round; the script runs the
rounds side by side and each round's stages in order. Agent engine: all executors in one msg;
each auditor once its executor stops. Integrate after whole batch audited:

1. Each passed round: apply manifest diff of its base workspace to main verbatim: copy each added/modified path from that workspace, delete each deleted path. Main file not matching main's pre-checkout hashes (or present where none recorded) = conflict → step back to Remaining for later batch; not Dead end.
2. Failed round's delta stays out of main. Save as patch under `evidence/round-<N>/` (recovery brief may cite); record in Residue as not applied.
3. Before removing any round workspace, candidates included: stop every process its round started (per `processes.log`), confirm gone; else old server answers step-4 check or holds its port. Step 4 starts any server it needs from main. Then copy every cited evidence file living in it (done-check output, ignored artifacts) into `evidence/round-<N>/`. Then unlink dep links in it (`rmdir` on junction/symlink), then `git worktree remove --force <path>`: dirty by design, so plain `git worktree remove` refuses; forcing before unlinking deletes through link into shared target.
4. Separate-workspace verdicts don't prove steps work together or survive workspace removal (e.g. link into removed worktree). After removal, one fresh auditor runs every applied round's done-check in main workspace before any enters Verified progress. Step failing there → Remaining w/ that output; its applied paths → Residue w/ revert-or-keep decision.

Capacity: the engine runs about `min(16, CPUs - 2)` agents at once per call and queues the
rest, so a large batch finishes, only later. The session's workflow size guideline (under 10
agents) is advisory; invoking this skill is the user's request for batch scale. Count tokens,
not slots: every candidate multiplies the executor cost of its round.
