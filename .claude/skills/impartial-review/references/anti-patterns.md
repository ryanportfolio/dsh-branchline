# Anti-patterns to avoid

Loaded from `SKILL.md` before the Step 6 report is presented. Moved verbatim.

- **Preserve fresh context even for tiny diffs.** Use one reviewer for a small change instead of reviewing your own work. Include relevant project constraints, such as theme parity, in that reviewer's brief.
- **Don't pass subagent findings through unchecked.** Verify every finding you intend to surface — not just the 🔴s, now that the finding stage over-reports by design. If a subagent hallucinates a function name or misreads the diff, the human pays the cost.
- **Don't praise the implementation.** "This looks well-structured" is not useful — find what's wrong.
- **Don't list findings in the order subagents returned them.** Severity-order globally so the human can triage top-down.
- **Don't mix "I haven't checked" with "I checked and it's fine."** They're different. State which.
- **Don't give generic advice ungrounded in the code.** Point at the specific line and say what to change.
- **Don't be defensive of code you wrote.** That's the easiest trap. Dispatching to fresh-context subagents is the structural fix; don't undermine it by overruling their findings without verification.
