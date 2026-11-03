# Candidates: angles, blinding, grafting, cost

Detail for rounds with more than one candidate, including the Pick step. Read at Plan when any round sets `Candidates:` above 1.

Angles come from the script's constant list, assigned by index; the executor brief never
names an angle. Candidates read nothing of each other; the panel sees candidates by index
only and never an executor's return value. Blinding limit, recorded in the Audit log: the
workspace path shows the candidate index, nothing else. A grafter is a second writer in the
base workspace, so the final audit covers its edits too. A pick inspection runs the
done-check in the candidate's workspace before the audit and saves the executor's delta,
the check's own changes and a post-check manifest, so the audit attributes executor, check
and grafter edits separately instead of excluding whole paths. Candidates split over a basic
premise → the panel reports it, the round returns `blocked: brief gap`; fix the brief, run a
new round; a merge of both premises is never the answer.

Cost: a 3-candidate round spends about 3 executors + 3 inspectors + judges + 1 grafter before
its audit. Spend it where the shape is unclear; keep mechanical rounds at 1.

3. **Pick** (rounds with several candidates): one inspector per candidate workspace (manifest
diff + done-check, serial when `Serial candidates: yes`), then the blind panel, then at most
one grafter in the base. A pick inspection saves the executor's delta (taken before its
check), the paths the check changed, and a post-check manifest; the audit attributes the
executor's and the grafter's edits separately from those and judges both. In a serial
round, a release agent stops every process in the round's `processes.log` after each
executor, each inspection and the grafter, and the round blocks unless it reports every
process gone and every port free, so one candidate's server never answers the next
one's check. Agent engine: same agents, same inputs, Manager holds the
index-to-angle map and never shows the panel an executor's report. No candidate passes its
own check → round fails on the base's inspection, audit skipped.
