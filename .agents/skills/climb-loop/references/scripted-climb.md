# Scripted climb

Fuzzy problem → eval → climb. Fits skill descriptions, kernel size, MCP or tool text, prompt behavior.

1. Mine own history for cases where agents did the wrong thing (session transcripts, review findings, `pitfalls.md`). Categorize.
2. Each case → eval with a programmatic pass condition. Run current state on every target model; record baseline (source run: about 60 of 88).
3. Climb to perfect on every target model. Commit; freeze cases.
4. Flip objective: cut cost (source run: tool descriptions to a third of their size) while staying perfect. Mid-climb regressions are expected (66 → 63 of 85); recover by changing the subject, never the cases.
5. Commit the eval with the change → later edits stay testable. Source run result: 52% fewer tokens, 78% with tool search on.

No council needed here; the project's normal PR review still applies.
