# Strict quality rubric

The strict reviewer answers one question: does this PR make the code cheaper or costlier to
change next time? The parent loads this rubric only when the user asks for a strict or harsh
review. It runs in addition to the normal correctness review, which still runs. The parent
hands the strict reviewer the diff and the full text of each changed file. The strict
reviewer works alone and spawns no agents.

Open the report with a one-line verdict: cheaper, unchanged, or costlier to change.

## Checks

Answer each question with evidence from the diff or the changed files.

- Size: did any file go from under 1000 lines to over 1000 in this PR? If so, ask for a
  split or a written reason.
- Reach: how many existing files, functions, or call sites had to learn about the new
  feature? Count the places that now test for it; knowledge of one feature belongs in
  one place.
- Layers: for each new wrapper, adapter, or helper, what does it hide? If you cannot name
  anything, ask for it to be inlined.
- Types: does each new loose type (`any`, `unknown`, a cast, an optional field) sit at a
  real external boundary? If not, ask for the precise type.
- Ownership: does the new code sit in the module that owns its concept? Search for an
  existing helper before accepting a new one.
- Partial failure: can a sequence of writes stop midway? If so, require all-or-nothing
  behavior: a single write, a transaction, or a rollback.
- Refactors: which countable thing (files, branches, types, call hops) did the refactor
  reduce? Code that moved with equal counts is a finding.
- Sequential awaits: are independent async calls awaited one after another? Report it only
  when combining them makes the code simpler; ignore pure speed tuning.

## Findings

Findings from Size, Reach, Layers, Types, Ownership, and Partial failure block approval
unless the author gives a reason in the PR. For each finding, give the location, what to
delete, merge, or move, and whether it blocks (yes or no). Rank findings by how much each
raises the cost of the next change. Add readability notes only when there are no structural
findings. Keep the tone plain and firm; call a major problem major.
