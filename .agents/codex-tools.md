# Codex Tool Mapping

Use the available Codex equivalent, not a memorized tool name.

| Claude | Codex |
|---|---|
| `Task` / `Agent` | Inspect current tools, then use exposed multi-agent tools |
| Parallel tasks | Spawn concurrently and wait for required results |
| `TodoWrite` | `update_plan` |
| `Skill` | Follow the natively selected skill |
| File and shell tools | Use native Codex tools |
| `AskUserQuestion` | Current input tool, or ask directly |
| `Workflow` | No direct equivalent; manually orchestrate agents |

`multi_agent = true` does not prove a session exposes agent tools. If unavailable, fall back to the main thread only when independence is not part of the result. Never claim `$impartial-review`, `$advocate`, or `$why` ran as designed without an independent agent. Code-mode `wait` resumes an exec cell; it is not a subagent wait tool. Git and outward actions still follow `AGENTS.md`.
