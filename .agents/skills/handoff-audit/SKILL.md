---
name: handoff-audit
description: "Draft a self-contained audit prompt for a separate task or reviewer, with exact scope and falsifiable checks. Does not run the audit."
---

# Handoff for independent review

Resolve the requested target from the user's request and invocation input first; otherwise use the work just completed. For current work include staged, unstaged and relevant untracked files; do not rely solely on main..HEAD. Identify the workspace, repo, branch, exact head and intended remote base SHAs, and dirty or untracked paths under audit. For commits/PRs preserve the requested target; a merged squash PR may require its merge commit and parent, not the old branch history. When Git history alone cannot reproduce the working-tree contents, state how the reviewer can access them.

Give a cold reviewer the original request, exact target, relevant environment limits, and claims to falsify. Distinguish claims and prior conclusions from evidence. Give raw file/log paths and reproduction commands; the reviewer must inspect them and reach their own verdict, not trust the author's. Preserve unavailable-check limits. For moves or refactors, pin the pre-change Git reference and name the symbols and permitted differences so the reviewer can check fidelity directly.

Default receiving instructions: read-only review; no edits, commits, pushes, subagents, nested reviews or external posting. Carry repair or publication authorization only if the user explicitly supplied it, preserving its exact scope and limits. An audit request alone authorizes neither repair nor publication.

Ask for actionable findings with path:line, triggering conditions, impact, evidence, uncertainty and a specific proposed fix. Tailor falsifiable checks to the actual claims, and require suspected failures to be rechecked against real consumers, excluding substring matches and pointer comments. Include checked-and-fine areas and a calibrated recommendation. Allow zero findings and mark unavailable checks as unverified.

Return one copyable fenced prompt. Do not run the review, spawn a reviewer, create a task, edit code, or commit while drafting it. Save the prompt to a file only if requested. Any separately requested execution is its own task with its own scope and authorization.
