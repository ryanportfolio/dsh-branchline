---
name: session-hub
description: "Coordinate parallel Claude Code sessions via a shared append-only HTML hub. Use on /session-hub, 'run parallel sessions on this', joining a hub, or proactively when edits or commits this session did not make appear in the checkout."
---

# session-hub: shared ledger for parallel sessions

One effort, several sessions, one hub file every session reads and appends to. The hub is the durable record: who is working, what scope each session owns, what happened when. The user leaves it open in a browser and watches all lanes at once.

## When to use, when not

- Use when the effort splits into scopes different sessions can own without touching the same files: separate directories, repos, or lanes (build vs docs vs verification tooling).
- Skip when all sessions would edit the same few files. Parallelism there loses to merge conflicts; run serial instead and say so.
- Skip for single-session tasks. The hub earns its overhead only with 2+ concurrent sessions.
- Never open a second hub for an effort. Before creating one, check the established effort location (Desktop or authorized workspace) for an existing `HUB-*.html` and join it.

## Hub file

- Location: the user's Desktop when accessible and authorized; otherwise use an authorized workspace location and share its absolute path with every participant. Name it `HUB-<effort-slug>.html`, one per effort.
- Self-contained HTML with `<meta http-equiv="refresh" content="15">` so an open browser tab updates itself. No external assets, no scripts required.
- Created once from `template.html` in this skill's directory (fill the title placeholder). Never rewrite the file wholesale after creation.
- Two permanent anchors: `<!-- HUB:ROSTER:END -->` and `<!-- HUB:LOG:END -->`. Every write is an insert immediately before one of them. Append-only: never edit or delete another session's entries, including typos; correct with a new entry.

The hub is a cooperative ownership ledger, not an OS lock or atomic transaction. Use exposed messaging and nonoverlapping file ownership; verify inserts survived after writing. If concurrent writes keep colliding, designate one writer or serialize updates. Do not claim the HTML enforces exclusivity.

## Protocol

1. **Join.** Read the whole hub first. Then add one roster row before the ROSTER anchor: session role name, start time, scope claimed, branch or worktree. Pick a short role name (`turret-build`, `docs-pass`, `verify-rig`), not a model name; it is the session's identity in every entry.
2. **Scope claims are exclusive.** Claim explicit paths or globs. Touching a file inside another session's claim requires an ask entry in the log and that session's OK entry (or the user overriding in chat). This exclusivity is the point of the hub; without it parallel sessions corrupt each other's work.
3. **Log entries** go before the LOG anchor: local time, role name, one of `status` / `finding` / `ask` / `ok` / `done`, then a terse line with paths or commit SHAs as evidence. Get the time from the shell (`date +%H:%M`); never guess it.
4. **Cadence.** Re-read the hub at natural boundaries: before starting a new task, after each commit, before claiming new scope, before answering an ask. No polling loops unless the user asks for one.
5. **Finish.** Post a `done` entry with verification evidence (command output, screenshot path, final SHA), then update your own roster row's status cell to done. Your roster row is the one exception to "never edit existing entries", and only its status cell.
6. **Write races.** Anchored inserts from two sessions can collide; on an edit mismatch, re-read the file and retry once. If entries interleave out of time order, leave them; order within a minute does not matter.
7. **Cross-session messages.** Where the harness exposes SendMessage, use it for urgent interrupts only; the hub stays the record. Anything decided over a direct message gets a log entry too.

## Entry examples

```html
<tr><td>14:02</td><td>turret-build</td><td>status</td><td>tracking clamp landed, commit 3f1c2aa, starting speed tuning</td></tr>
<tr><td>14:05</td><td>docs-pass</td><td>ask</td><td>turret-build: may I edit src/main.ts header comment? inside your claim</td></tr>
<tr><td>14:06</td><td>turret-build</td><td>ok</td><td>docs-pass: yes, header comment only</td></tr>
<tr><td>14:31</td><td>verify-rig</td><td>done</td><td>headed run clean, screenshot .tmp/verify/final.png, all checklist items pass</td></tr>
```
