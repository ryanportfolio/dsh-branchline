---
name: writing-plans
description: "Use when a clear task needs a multi-step implementation plan, dependency ordering, or a durable handoff. Skip for routine changes that can be executed directly."
---

# Plan implementation

Turn the accepted goal into an executable sequence. Resolve material missing requirements
first; do not reopen choices the user already made. A request for a plan ends with a plan.
A request to implement continues into authorized work once the plan is ready.

Read the relevant code and repository instructions before naming files or commands. Use an
exposed planning tool if available; otherwise keep a short Markdown checklist. Save a plan
in the repository's preferred location when the user requests a document, a handoff needs
one, or the work must survive a context reset. Otherwise keep planning lightweight.

When planning extraction or migration of repeated operations, read
[selective shared-code refactoring](references/shared-code-refactoring.md).

Each step identifies:

- The observable outcome and affected files or interfaces.
- Prerequisites and unresolved decisions that could change the approach.
- A check that establishes completion at the claimed layer.

Order by dependencies and deliver a thin working path early. Make steps small enough to
verify independently. Distinguish local step checks from final integration acceptance.
Include code or exact commands where they remove ambiguity, not a second implementation
of the entire solution. Discover verifiable facts instead of filling the plan with placeholders.

Before execution, check scope coverage, dependencies, failure paths, and final acceptance.
Update the plan when evidence or user requirements change; preserve the reason for material
changes. Record blocked checks without marking them complete. Continue independent work.

Do not ask the user to choose an execution mechanism unless it changes a meaningful cost,
constraint, or outcome. Planning alone does not authorize delegation, package installation,
commit, push, merge, deployment, or a new sidebar task. Follow current authorization for
those actions. At handoff, include the workspace, current state, next action, and remaining
checks so another agent can continue without this conversation.
