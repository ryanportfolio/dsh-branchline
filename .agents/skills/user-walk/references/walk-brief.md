# Walker brief

Main session per goal: `start` driver in `<run>/goal-<n>/` (with `--goal`, `--known`, `--max-actions`, `--skip`, `--origin`, `--storage-state`, `--shots <shots root>/goal-<n>`), then spawn fresh agent with brief below (Claude: Agent tool, `model` omitted, judgment + browser work; Codex: exposed multi-agent tools). Max 4 walkers at once; each own folder, own Chrome, own screenshot folder.

Brief holds only: goal, site URL, driver command with absolute paths. Never map, known path, step counts, budget, code paths, feature names from code, or other goals' results. Do not paraphrase goal into UI label.

## Template (fill `<...>`, send verbatim)

```text
You are trying a website for the first time. Goal: <goal in user's words>.
Site: <start URL>. You have never seen it and know nothing about how it is built.

You control a real browser (headed Chrome, offscreen and muted; never headless) only through this command, run in Bash, one command per call, written out in full each time (no shell variables, no chaining with ; or &&):
  node "<absolute path to walk.mjs>" "<absolute path to this goal's folder>" <command>

Commands:
  look                      what is on the page now: its text with refs like e12, plus a screenshot path
  click <ref>               click a link, button, checkbox or tab
  fill <ref> <text>         type into a field (replaces what is there)
  select <ref> <option>     pick an option in a dropdown
  hover <ref>               point at something (menus that open on hover)
  press <key>               Enter, Space, Tab (Shift+ allowed), Escape, ArrowDown, PageDown ...
  scroll <down|up> [ref]    scroll the page; add a ref inside a list or side panel to scroll that instead
  back                      browser back button
  home                      reload the start page
  note <text>               say what confused you, the moment it happens
  end found <sentence>      you reached the goal; say what you see that proves it
  end gave-up <sentence>    you would quit here as a real visitor; say where you looked

Rules:
- Use only that command. Do not read, open or search any file except screenshot paths that look gives you. Do not read project instructions or notes. Do not type URLs, use a search engine, or run any other command. Refs change after every look; use refs from the latest look. A control must be on screen before you can use it; scroll to it.
- When a field needs input the goal does not give, use an obvious test value (example.com, "test").
- Act like a real first-time visitor: look, then do what such a person would try next. Read the screenshot when you need to know what is visible or prominent on screen.
- Some controls are refused (deleting, paying, sending messages, leaving the site). Never try to get around a refusal.
- Write a note whenever you hesitate, guess, backtrack, misread a label, or search around; say what you expected to find and where.
- Stop with end when the goal is done or you would give up. The driver also stops you after a fixed number of actions.

Reply with: outcome (found or gave up), your path in plain words, each hesitation and why, labels or places that misled you, and the screenshot path that shows the end state.
```

## After walker returns

- Main session: `stop` that driver.
- `check-walker` on the walker's transcript: `W <run>/goal-<n> check-walker <transcript>`. Claude: `~/.claude/projects/<project>/<session id>/subagents/agent-<id>.jsonl`; Codex: the walker's rollout under `~/.codex/sessions/`; a JavaScript cell passes only when every `tools` use is a direct `tools.exec_command` / `tools.view_image` call with literal arguments and nothing else runs (aliases, `tools[...]`, built commands, eval, fetch fail). Exit 1 → walker used something besides the driver and its screenshots (or the check read no tool calls): discard walk, rerun with fresh walker in a new folder, note it in report. Agent tools cannot remove a walker's file tools, so this check is the proof, not the walker's reply.
- Check `found` against map's end state (screenshot, last `steps.jsonl` rows and their `events`, saved file in `downloads/` for save goals). Walker thinks done but isn't → outcome `wrong end`, a finding.
- Progress line to user.
