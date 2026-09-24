---
name: handoff-audit
description: "Draft a self-contained audit prompt for a separate fresh session, with exact scope and falsifiable checks. Does not run the audit."
---

# Handoff for independent review

Resolve the requested target from the user and `$ARGUMENTS` first. Otherwise use the work just completed. For current work include staged, unstaged, and relevant untracked files; do not rely solely on main..HEAD. Identify the workspace, repo, branch, exact head and intended remote base SHAs, and dirty or untracked paths under audit. For commits or PRs preserve the requested target; a merged squash PR may require its merge commit and parent rather than the old branch history. State how the receiving session can access the exact working-tree contents when Git history alone cannot reproduce them.

Give a cold reviewer the original request, exact target, relevant environment limits, and concrete claims to falsify. Distinguish claims and prior conclusions from evidence. Provide raw file or log paths and reproduction commands; require the reviewer to inspect the evidence and derive their own verdict. Preserve unavailable-check limits. For moves or refactors, pin the pre-change Git reference and identify the symbols and permitted differences so the reviewer can check fidelity directly.

Default receiving instructions: read-only review; no edits, commits, pushes, subagents, nested reviews, or external posting. Carry repair or publication authorization only when the user explicitly supplied it, preserving its exact scope and limits. An audit request alone authorizes neither repair nor publication.

Ask for actionable findings with path:line, triggering conditions, impact, evidence, uncertainty, and a specific proposed fix. Tailor falsifiable checks to the actual claims and require suspected failures to be rechecked against real consumers, excluding substring matches and pointer comments. Include checked-and-fine areas and a calibrated recommendation; allow zero findings and mark unavailable checks as unverified.

Return one copyable fenced prompt. Do not run the review, spawn an auditor, create a task, edit code, or commit anything as part of drafting it. Save the prompt to a file only if requested. Any separately requested execution remains a separate task with its own scope and authorization.
