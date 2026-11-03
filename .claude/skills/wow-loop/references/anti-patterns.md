# Anti-patterns

Read from section 8 of the wow-loop skill: check the run against this list before marking `passed`.

- Ending because the work looks done, rather than because critics armed with captures failed to break it.
- Any agent claiming a visual it did not read, or verifying a visual claim from code.
- Turning a user's score into a number anywhere in the loop: asking an agent for one, telling a critic the target, or reporting a computed one.
- One verdict for a whole set of items, or an average where the bar applies to each item.
- Parallel writers on shared paths or shared build dirs.
- One capture angle. Vary viewpoint, zoom, viewport, pointer, scroll, timing.
- Comparing against a memory of the reference instead of its stored captures in the same session.
- Fixing without reproducing, or closing a finding without a fresh capture.
- Marking a module passed while its dependents or the whole-deliverable checks are stale.
- Leaving an accepted, machine-checkable bar in `.tmp/` without offering to make it a test.
- Hiding residuals. Name them with causes.
