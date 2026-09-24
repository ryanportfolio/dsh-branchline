# Evaluate a workflow change

Keep one compact record with the task's evidence, using the template below. Link it from existing task state or the refinement report so a later task can find and update it. Store only the evidence needed to assess the claim, following the project's data-handling rules. Trial logs stay out of always-loaded instructions and durable project memory.

Before trials, fix the predicted behavior, acceptance criteria, targeted scenario, and a neighboring scenario that could regress. Preserve the old state and fingerprint both versions, including the evaluator. Compare under the same relevant model, context, tools, inputs, and attempt/resource budget. Record unavailable conditions and confounds. If the candidate or criteria change, start a new comparison and keep the earlier result.

Use fresh validation context when available; report the limit when it is unavailable. A changed evaluator needs an independent anchor against the original claim, such as unchanged external tests or separately judged raw outcomes. Easier grading cannot establish improvement. A passing baseline may remain passing; do not manufacture a failure.

Use the existing verification semantics directly, without requiring another skill:

- `VERIFIED`: the valid comparison meets the claimed improvement threshold without an evident confound.
- `NOT VERIFIED`: behavior is unchanged, worsens, or misses the threshold.
- `INCONCLUSIVE`: a missing baseline, failed measurement, noise, or mismatched conditions prevents a valid comparison.

Local acceptance can rest on scoped correctness or regression checks even when benefit is unmeasured. Give that decision its own reason and rollback reference; preserve negative and inconclusive results. Later use remains `pending` until another task supplies evidence. Invocation alone establishes use, not benefit. Neither retention nor a complete record authorizes publication, global copying, or broader scope.

## Record template

```markdown
# Refinement: <short name>

## Claim and comparison plan (before trials)
- Friction evidence and smallest changed surface:
- Predicted observable change and improvement threshold:
- Scope and existing authority:
- Baseline, candidate, evaluator references/fingerprints:
- Targeted scenario and acceptance criteria:
- Neighboring scenario and regression criteria:
- Shared model, context, tools, inputs, attempt/resource budget:
- Unavailable conditions; independent anchor if evaluator changes:

## Results and local decision
- Raw evidence pointers: baseline / candidate / neighboring checks:
- Observations, delta, and confounds:
- Improvement verdict: VERIFIED / NOT VERIFIED / INCONCLUSIVE
- Retain locally / revise / revert, and reason:
- Diff or backup and rollback reference:

## Later use
- Status: pending / observed
- Later task, changed version, and evidence of invocation:
- Outcome and comparison evidence, if any:
- Benefit: unmeasured / <supported verdict and bounded claim>
```

Maintainers: keep this resource identical in the Claude and Codex `refine` and `addskill` folders. Each copy belongs beside its skill so a personal installation works without the repository.
