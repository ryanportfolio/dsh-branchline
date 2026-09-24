---
name: handoff-audit
description: "Draft a self-contained audit prompt for a separate task or reviewer, with exact scope and falsifiable checks. Does not run the audit."
---

# Handoff for independent review

Resolve the requested target first. For current work include staged, unstaged and relevant untracked files; do not rely solely on main..HEAD. For commits/PRs pin exact head and base SHAs using the intended remote base. A merged squash PR may require its merge commit and parent, not the old branch history.

Provide a cold reviewer the repo/workspace, exact target, original reference, relevant environment limits, and claims to falsify. Distinguish claims from evidence. Give raw file/log paths and reproduction commands; the reviewer must inspect them, not trust the author's verdict. Preserve unavailable-check limits.

Default receiving instructions: read-only review; no edits, commits, pushes, subagents, nested reviews or external posting. Carry repair or publication authorization only if the user explicitly supplied it. An audit request alone is not repair authorization.

Ask for actionable findings with path:line, triggering conditions, impact, evidence, uncertainty and a specific proposed fix; include checked-and-fine areas and a calibrated recommendation. Allow zero findings. Return one copyable fenced prompt, not a new task or an executed review unless separately requested.
