# State file template

Template for `.tmp/long-horizon/<task-slug>/state.md`; the rules for keeping it true stay in SKILL.md under State file.

```markdown
# Contract  (original retained; explicit user changes recorded as amendments)
Goal: <one paragraph>
Acceptance: <the checks that prove it done, as a numbered list>
Version: <current contract version>

# Amendments
- <version, explicit user instruction, changed checks, affected steps and claims>

# Verified progress
- <claim>: contract version <version>; evidence: <file/command/output the auditor saw>

# Remaining
1. <step sized for one fresh context>; depends on: <step numbers or none>; writes: <paths>

# Current batch
Batch: <B>   Rounds: <N1, N2, ...>   Engine: workflow | agent
Base: <git ref pinned from main at Plan> + <main manifest path over the union of write scopes>
Batch of one because: <the Parallel rounds rule that forbade more, or "no other step ready">
Workers: <workflow runId + transcript dir, or agent IDs; role; last observed status>

# Current rounds  (one block per active round; scope and checks fixed at Plan, except for explicit user amendments)
Round: <N>   Phase: planned | executing | awaiting-audit | audited
Contract version: <version used for this round>
Workspaces: <one absolute root per candidate; in-place round: the main workspace>
Step: <the one Remaining step this round works>
Done-check: <commands, cwd relative to the workspace root, and the expected result; the auditor runs them itself>
Write scope: <paths the executor may change; test and gate definitions only if the step is about them>
Candidates: <count and the one-line reason, per Candidates below>
Judges: <total verdict count including the inspector, and the one-line reason for that number>
Serial candidates: yes | no  <yes when execution or the done-check binds a port, device or timing measurement; candidates then run one at a time>
Baseline: <manifest path per candidate> + <git ref per candidate>  (taken by the baseline agent; the auditor diffs against this, never HEAD)
Executor brief: <path>  (written at Plan)
Auditor brief: <path>  (written at Plan, dispatched byte for byte)
Residue: <paths a failed earlier round left changed, and whether they were reverted or kept>

# Dead ends  (approaches that failed audit; do not retry without new evidence)
- <approach>: <why it failed, one line>

# Method notes  (rules later rounds must follow, such as how to measure)
- <rule>: source round <N>; unconfirmed / confirmed in round <M> / dropped

# Audit log
- round N (batch B): <step>: <status>/<integrity>/<contract>, <candidates built, base picked>, <one-line evidence>, <runId or agent IDs>
```
