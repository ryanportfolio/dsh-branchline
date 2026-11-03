# Writing state file and briefs

Read at Plan before writing the state file or any brief; the last paragraph is what executors may run in parallel inside a round.

State file + briefs: write/edit via file-edit tool; shell/script string layers drop
backslashes, backticks. Re-read each saved brief before dispatch. Every brief: worker
appends each long-lived process it starts (pid, port, command) to `processes.log` in task
dir (Workflow engine: the round dir, where the script's release agent reads it). Hours-long
job brief: executor checks between batches that workspaces still whole
(`git worktree list`, sentinel file); mismatch → stop + report, no rebuild. Evidence from
another revision (line numbers, patch map) names that revision; executor finds cited code
by anchor text, not line number.

Within round, executor runs independent reads/searches/commands at once; fans out read-only
helper subagents, foreground, for research, search and probes. Parallel-writer work = several
steps: split in Remaining, run as parallel rounds.
