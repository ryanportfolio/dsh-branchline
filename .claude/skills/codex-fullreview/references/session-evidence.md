# codex-fullreview: session-file evidence shapes and counting snippet

Mandatory read from `../SKILL.md` Step 4. Moved verbatim from Step 4. The session file is the `rollout-*-<id>.jsonl` named there.

In it:

- **Skill load**: a `custom_tool_call` named `exec` whose `input` (JavaScript source calling `tools.exec_command`) contains `.agents/skills/impartial-review/SKILL.md`, or a `function_call` whose `arguments` contain it. The snippet prints each match; confirm it reads the file chosen in Step 1 rather than searching for the path, and disclose a read of any other copy. A read command chained with others (for example `Get-Content <file>; git diff ...`) counts as a read; a `grep`, `rg`, `find`, or `ls` that only matches the path does not. An injected `<name>impartial-review</name>` block in a user-role message is an optional extra signal only: 0.156.0 injects none for exec prompts.
- **Spawn calls**: records with `"type":"response_item"` whose payload has `"type":"function_call"` and `"name":"spawn_agent"` (namespace `collaboration`); the `arguments` string holds `fork_turns`, `model`, and `reasoning_effort`. A call can fail, so calls are not sub-reviewers. Arguments that do not parse as JSON leave that call's settings unverified; the snippet reports them instead of crashing.
- **Spawned children**: other session files whose `session_meta` source carries `"thread_spawn":{"parent_thread_id":"<id>"`. Match that exact prefix: a bare `"parent_thread_id"` match also counts `guardian` sessions (`"subagent":{"other":"guardian"}`), which are not reviewers.

This format was confirmed on codex-cli 0.156.0: spawn calls and spawned children matched the shapes above, and the skill load appeared as a `custom_tool_call` exec read, with no injected block. Recheck it when the CLI version changes.

```bash
SID=$(sed -n 's/^session id: //p' "$RUN/run.log" | head -n 1)
node -e '
const fs = require("fs"), path = require("path");
const [sid, root, rawMarker] = process.argv.slice(1);
const marker = (rawMarker ?? "").trim();
const files = [];
const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/^rollout-.*\.jsonl$/.test(e.name)) files.push(p); } };
walk(root);
const own = files.find(f => f.endsWith(`-${sid}.jsonl`));
if (!own) { console.log("session file missing: spawn count and skill load unverified"); process.exit(2); }
const recs = fs.readFileSync(own, "utf8").split("\n").flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });
const parse = s => { try { return JSON.parse(s); } catch { return null; } };
const calls = recs.filter(j => j.payload?.type === "function_call" && j.payload.name === "spawn_agent").map(j => parse(j.payload.arguments));
const toolText = j => j.payload?.type === "custom_tool_call" && j.payload.name === "exec" ? String(j.payload.input ?? "") : j.payload?.type === "function_call" ? String(j.payload.arguments ?? "") : "";
const skillRe = /\.agents[\\/]+skills[\\/]+impartial-review[\\/]+SKILL\.md/;
const skillReads = recs.map(toolText).filter(t => skillRe.test(t));
const injected = recs.filter(j => j.payload?.type === "message" && j.payload.role === "user" && JSON.stringify(j.payload.content).includes("<name>impartial-review</name>")).length;
const stamp = path.basename(own).slice(8, 27);
const firstLine = f => { const fd = fs.openSync(f, "r"), b = Buffer.alloc(65536), parts = []; try { for (let n; (n = fs.readSync(fd, b, 0, b.length, null)) > 0;) { const i = b.subarray(0, n).indexOf(10); parts.push(Buffer.from(b.subarray(0, i < 0 ? n : i))); if (i >= 0) break; } } finally { fs.closeSync(fd); } return Buffer.concat(parts).toString("utf8"); };
const children = files.filter(f => f !== own && path.basename(f).slice(8, 27) >= stamp && firstLine(f).includes(`"thread_spawn":{"parent_thread_id":"${sid}"`));
const briefed = marker ? children.filter(f => fs.readFileSync(f, "utf8").includes(marker)).length : null;
console.log({ session: own, spawnCalls: calls.length, malformedSpawnArgs: calls.filter(a => !a).length, spawnedChildren: children.length, failedSpawns: calls.length - children.length, briefedChildren: briefed, skillReads: skillReads.length, skillInjected: injected });
for (const a of calls) console.log(a ? [a.task_name, a.fork_turns, a.model, a.reasoning_effort].join(" ") : "malformed spawn arguments: settings unverified");
for (const t of skillReads) console.log("skill read:", t.slice(0, 200));
' "$SID" "${CODEX_HOME:-$HOME/.codex}/sessions" "$(head -n 1 "$RUN/brief.md" 2>/dev/null)"
```
