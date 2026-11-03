# long-horizon: state file template

Copy this block into `.tmp/long-horizon/<task-slug>/state.md` when creating the file; use its Current rounds block as the field list at every Plan and when rebuilding the file after drift.

```markdown
# Contract  (original retained; explicit user changes recorded as amendments)
Goal: <one paragraph>
Acceptance: <the checks that prove it done, as a numbered list>
Version: <current contract version>

# Amendments
- <version, explicit user instruction, changed checks, affected steps and claims>

# Verified progress
- <claim> — contract version: <version>; evidence: <file/command/output the auditor saw>

# Remaining
1. <step sized for one fresh context>; depends on: <step numbers or none>; writes: <paths>

# Current rounds  (one block per active round; scope and checks fixed at Plan, except for explicit user amendments)
Round: <N>   Batch: <B>   Phase: planned | executing | awaiting-audit | audited
Contract version: <version used for this round>
Workspace: <absolute root the executor writes; any other workspace the round reads, marked read-only>
Workers: <agent/process IDs, role, last observed status; update as workers start or stop>
Step: <the one Remaining step this round works>
Done-check: <commands, cwd, and the expected result; the auditor runs them itself>
Write scope: <paths the executor may change; test and gate definitions only if the step is about them>
Baseline: <manifest path> + <git ref>  (see Plan; the auditor diffs against this, never HEAD)
Auditor brief: <path>  (written at Plan, dispatched byte for byte)
Residue: <paths a failed earlier round left changed, and whether they were reverted or kept>

# Dead ends  (approaches that failed audit; do not retry without new evidence)
- <approach>: <why it failed, one line>

# Method notes  (rules later rounds must follow, such as how to measure)
- <rule>: source round <N>; unconfirmed / confirmed in round <M> / dropped

# Audit log
- round N (batch B): <step> — <status>/<integrity>/<contract>, <one-line evidence>
```

Why the Dead ends section matters:

Dead ends = memory. Unrecorded failed approach gets re-proposed rounds later; re-walking it costs full round.
