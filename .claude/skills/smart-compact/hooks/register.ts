import type { EngineInterface, Register } from 'claude-code'

// Asked of a fork of the session, which sees the whole transcript. Its answer is
// passed to /compact as the custom instructions the summarizer follows.
const REVIEW_PROMPT = `Review this whole conversation so far and write the custom instructions to pass to /compact. The summarizer reads them as directions for what to keep, so write imperatives to it.

Keep, in priority order:

1. The user's goal for the session and any standing instructions or preferences they gave in it (style, scope limits, things to never do).
2. Current state: repo, branch, worktree path, PR URL, last commit SHA, deploy or preview URL, files created or changed.
3. Decisions made and the reason for each, including options the user rejected.
4. What is verified and how, and what is still unverified.
5. Open work: the next concrete step, pending questions to the user, background tasks still running.
6. Failed approaches and gotchas that would otherwise be retried.
7. Exact identifiers to keep verbatim: paths, commands, error strings, IDs, numbers.

Tell the summarizer to drop resolved tangents, raw tool output, superseded plans, and anything re-readable from files or CLAUDE.md. Never invent a fact; if a state item is unknown, leave it out. Keep the block under about 300 words; cut from the bottom of the priority list first.

Return exactly one fenced \`text\` block and nothing else. When the session's replies follow a named style or output style (caveman ultra, for example), make the first line \`Always use <that style>.\` so it survives the compaction; otherwise leave that line out.

\`\`\`text
Always use <reply style>.
Goal: <one line>.
Keep: <standing user instructions>.
State: <branch, worktree, PR, SHA, files>.
Decisions: <decision, why>; ...
Verified: <what, how>. Unverified: <what>.
Next: <next step>; open questions: <...>.
Don't retry: <failed approach, cause>.
Verbatim: <paths, commands, errors>.
Drop tool output, resolved tangents, and superseded plans.
\`\`\`

Omit any line with nothing to say.`

// The fork answers with one fenced `text` block; take its body.
const fencedBody = (reply: string) => {
  const match = reply.match(/```(?:text)?\r?\n([\s\S]*?)\r?\n```/)
  return (match ? match[1] : reply).trim()
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'smart-compact',
      description: 'Write custom /compact instructions from this session, then compact with them',
    })
    return next(e)
  })

  on('command.run', { command: 'smart-compact' }, async $ => {
    $.ui.status('smart-compact: writing instructions')
    const reply = await $.model.fork({ prompt: REVIEW_PROMPT })
    if (!reply.isAnswered) {
      $.ui.status(undefined)
      return { text: `review failed (${reply.reason}); nothing compacted. Run /compact yourself.` }
    }

    const instructions = fencedBody(reply.text)
    $.ui.status('smart-compact: compacting')
    // The engine refuses to run a command from inside this hook, which still
    // holds the command's turn; run it from a timer once the command finishes.
    $.clock.after(500, () => void compactWhenIdle($, instructions, 10))

    return { text: `compacting with these instructions:\n\n${instructions}` }
  })
}

const compactWhenIdle = async ($: EngineInterface, instructions: string, triesLeft: number) => {
  try {
    // `$.session.compact` is refused in SDK sessions (the desktop app's Code
    // tab); running `/compact` itself works in those and in the terminal.
    await $.command.run({ command: 'compact', args: instructions })
    $.ui.status(undefined)
  } catch (err) {
    // Retry only the refusal for a command run from inside a hook that still
    // holds the turn; a cancelled or interrupted /compact stays cancelled.
    if (triesLeft > 1 && /hook/i.test(String(err))) {
      $.clock.after(1000, () => void compactWhenIdle($, instructions, triesLeft - 1))
      return
    }
    $.ui.status(undefined)
    $.ui.log(`smart-compact: compaction failed (${String(err)}). Paste the instructions above after /compact.`)
  }
}
