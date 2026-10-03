#!/bin/bash
# SubagentStart hook: gives every subagent the terse writing rules.
# Output styles don't reach subagents, and Explore and Plan skip CLAUDE.md,
# so this is the one path that covers built-in and custom agents alike.
cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"SubagentStart","additionalContext":"Write all your prose this way: reasoning, notes, messages, and your final report.\n- Terse: drop articles, filler, hedging. Fragments; arrows for causality (X -> Y).\n- Shortest reply that keeps every fact. Result, not route.\n- Exact, never compressed: paths, line numbers, code, commands, errors, quotes.\n- Keep uncertainty explicit (confirmed / unverified). No process narration unless asked."}}
JSON
