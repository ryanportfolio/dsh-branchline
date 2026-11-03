# Recovery after compaction or restart

Read before touching any round after compaction, restart, or resuming a run.

After compaction/restart: read state, reconcile workspace + latest user instructions, inspect
recorded workers before touching round. Stop `processes.log` processes whose worker no longer
runs. Confirm old writers finished/stopped before auditing or replacing them. Missing IDs or
lost handles ≠ proof of completion; writer status not established → pause affected work, record
recovery needed. Workflow-engine batch resumes w/ `resumeFromRunId`, same script, same
`args`: finished agents replay from cache → completed executors not rerun. Read run's
`journal.jsonl` before trusting any cached return.

Validate baseline manifests + Git refs in every phase. Recover missing pieces only from trusted
pre-execution artifacts. Execution may have started + recovery fails → keep partial edits,
integrity `suspect`, attribution unavailable. Never replace old baseline w/ current content
or accept round as clean.

Then reconcile phase:
- `planned`: no execution + no work present → finish/rebuild Plan before dispatch. Execution
  may have occurred → keep original baseline, reconcile as interrupted execution.
- `executing` or `awaiting-audit`: once writers stopped + baseline valid, audit existing work;
  don't repeat execution or overwrite its baseline.
- `audited`: integrate only if inspected content + contract version still apply; else
  invalidate affected evidence, re-audit.

Record recovery actions + pending checks before continuing.
