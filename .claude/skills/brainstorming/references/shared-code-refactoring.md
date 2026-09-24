# Selective shared-code refactoring

Read this when the requested design, plan or review involves repeated operations across
callers, divergent copies of the same behavior, or a proposed shared boundary. A single
use or superficial similarity does not justify extraction. Review-only work produces
findings; this reference grants no implementation authority.

## Choose the boundary from the code

Inspect representative callers and search for all implementations of the operation.
Compare inputs, outputs, side effects and failure behavior. Reuse the project's existing
module, function or domain boundary when it fits. Keep duplication when the behaviors
have different reasons to change or sharing would require switches and special cases
that obscure the callers. Do not add a service layer or rewrite the architecture merely
to house a helper.

Extract an operation when sharing removes a concrete maintenance risk, such as a rule
that must stay consistent across several paths. Keep transport-specific request parsing,
response formatting and caller-specific decisions at their existing boundaries unless
the architecture already places them elsewhere.

Before moving code, identify authorization, tenant isolation, validation, transaction
ownership, idempotency, retries, cache behavior and audit effects that the operation
actually depends on. Preserve their ordering and guarantees. In particular, sharing must
not bypass a caller's policy or move work outside its transaction. Similar database
calls can have different policy; share only the common behavior those guarantees allow.

Make inputs and results explicit using the project's conventions. Preserve meaningful
distinctions such as success, absence, denial and failure instead of hiding them behind
a generic boolean or swallowed exception. Keep dependencies visible enough to exercise
the operation without inventing a parallel framework.

## Migrate and verify

Start with one representative caller and check its observable behavior, including a
relevant failure path and its policy or transaction boundary. Then migrate the remaining
intended callers in bounded steps. Search again for every caller and old implementation;
account for each as migrated or intentionally retained, with the reason. Check affected
interfaces, imports and compatibility before removing the old path.

A plan names the intended callers, preserved invariants, migration order and decisive
checks. A review tests the proposed boundary against actual callers and reports concrete
regressions or missed migration paths. A preference for abstraction is not a correctness
finding. Verification should cover behavior and relevant integration guarantees, rather
than only matching the extracted implementation.

Maintainers: keep this reference identical in the Claude and Codex `brainstorming`,
`writing-plans` and `impartial-review` folders and the Codex `external-review` folder.
Package each copy with its skill for standalone use.
