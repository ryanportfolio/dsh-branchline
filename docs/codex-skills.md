# Codex skills

Capability catalog for the skills shipped in `.claude/skills/` and `.agents/skills/`. Generated from `.agents/skill-capabilities.json` by `node .claude/scripts/check-skill-capabilities.mjs --write`; do not edit the table by hand.

<!-- skill-capability-catalog:start -->
| Skill | Coverage | Codex owner | Required capabilities | Shared contracts | Runtime exceptions |
|---|---|---|---|---|---|
| addskill | claude, codex | native | No additional gate | authorization, proportion | Codex authors through built-in skill-creator; Claude uses packaged authoring guidance. Both use addskill for the full lifecycle. |
| adopt-repo | claude, codex | native | No additional gate | authorization | None |
| advocate | claude, codex | native | fresh-context-review | independence | None |
| arena | claude, codex | native | fresh-context-review | independence | None |
| astra-fullreview | claude | none | authenticated-codex-cli | independence, evidence | Claude launcher for a full multi-agent Codex review on gpt-6-astra; from Codex use $impartial-review directly. |
| astra-review | claude, codex | native | authenticated-codex-cli | evidence | A Codex author and Astra reviewer share a vendor; the requested model must be verified or uncertainty disclosed. |
| babysit-ci | claude, codex | native | No additional gate | authorization | None |
| brainstorming | claude, codex | native | No additional gate | proportion | None |
| bro | claude, codex | native | No additional gate | style | None |
| caveman | claude, codex | native | No additional gate | style | None |
| claude-review | claude, codex | native | subscription-routed-claude-cli | evidence | Cross-vendor only when the author runtime uses a different vendor; subscription routing is proved locally. |
| codex-fullreview | claude | none | authenticated-codex-cli | independence, evidence | Claude launcher for a full multi-agent Codex review; from Codex use $impartial-review directly. |
| codex-review | claude, codex | native | authenticated-codex-cli | evidence | A Codex author and Codex reviewer share a vendor; fresh context does not imply cross-vendor review. |
| dare | claude, codex | native | fresh-context-review | independence | None |
| dsh-plugin-permanent | claude, codex | adapter | No additional gate | scope | None |
| dsh-upgrade-audit | claude, codex | adapter | No additional gate | evidence, authorization | None |
| enhance-prompt | claude, codex | native | No additional gate | proportion | None |
| external-review | codex | native | No additional gate | independence, evidence | Codex-only leaf review invoked by the codex-review and astra-review launchers in both runtimes; it has no Claude counterpart. |
| fable-mode | claude, codex | native | No additional gate | proportion | None |
| forge-repo-ui-skill | claude, codex | native | No additional gate | authorization | None |
| handoff-audit | claude, codex | native | No additional gate | evidence | None |
| impartial-review | claude, codex | native | fresh-context-review | independence, evidence | Codex may use authenticated leaf CLI processes when exposed agents are absent; fresh context remains required. |
| init-project | claude, codex | native | No additional gate | authorization | Claude hook management remains Claude-specific; Codex does not execute Claude hooks. |
| lab | claude, codex | native | files, preview-server, browser | scope | None |
| long-horizon | claude, codex | native | fresh-context-review | independence, evidence | None |
| long-horizon-workflows | claude | none | fresh-context-review, workflow-tool | independence, evidence | Claude Code only: rounds run through the Claude Code Workflow tool, which Codex does not expose; Codex uses long-horizon. |
| optimize-context | claude, codex | native | No additional gate | scope | Measure the executing runtime catalog/kernel and verify retrieval after relocation; Claude hook measurements are not Codex measurements. |
| perf-loop | claude, codex | native | fresh-context-review, repeatable-measurement | independence, evidence | None |
| recall | claude, codex | native | No additional gate | authorization | None |
| refine | claude, codex | native | No additional gate | authorization, proportion | None |
| session-hub | claude, codex | native | writable-hub-location | scope | None |
| showpiece | claude, codex | native | No additional gate | scope | None |
| sync-starter | claude, codex | native | No additional gate | authorization | None |
| why | claude, codex | native | fresh-context-review | independence | None |
| wow-loop | claude, codex | native | fresh-context-review, visual-capture | independence, evidence | None |
| writing | claude, codex | native | No additional gate | style | None |
| writing-plans | claude, codex | native | No additional gate | proportion | None |
<!-- skill-capability-catalog:end -->
