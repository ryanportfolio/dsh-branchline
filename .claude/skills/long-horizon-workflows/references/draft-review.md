# Draft review of an hours-long round

Cross-vendor review of a draft Step and Done-check before briefs freeze them. Read at Plan when execution or the done-check runs for hours.

Hours-long execution or done-check (browser work, GPU timing, long batches) → draft
review after Current round block written, before briefs freeze it. One fresh read-only
peer, prefer other model family (custom-prompt `codex exec -s read-only` run, preflight +
CLI mechanics per `codex-review` skill; else fresh Claude subagent outside round script),
reads draft Step, Done-check + code the check exercises. One question: can check pass while
work wrong, fail while right, or not run as written? Concrete findings only: wrong impl
that passes (stub returning expected value, test never reaching changed path, check
reading file executor can write), correct result failing check read literally, or command
failing as written w/ cwd + output. "Could be stronger" ≠ finding. Manager fixes draft,
≤1 follow-up review of changed wording, then freezes. Peer sees only draft + code, never
executor report; auditor brief carries only frozen block, never peer critique. Cheap
rounds skip; inspector's `blocked: invalid check` covers them.
