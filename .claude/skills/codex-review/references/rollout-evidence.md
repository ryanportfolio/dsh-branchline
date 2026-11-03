# Rollout evidence

Mandatory read from Step 4 of [../SKILL.md](../SKILL.md) before collecting evidence. `$RUN`, `$BASE`, and `$HEAD_SHA` come from [launch-example.md](launch-example.md). The rules for reading the output (skill not loaded, findings source, spawn calls, scope identity, failures and the retry) stay in SKILL.md Step 4.

Take the `session id: <id>` line from the `run.log` header. These `codex exec review` patterns were confirmed on codex-cli 0.156.0:

- **Parent rollout** `${CODEX_HOME:-~/.codex}/sessions/YYYY/MM/DD/rollout-*-<id>.jsonl` holds only the `EnteredReviewMode` and `ExitedReviewMode` items. `ExitedReviewMode.review_output` carries `findings`, `overall_correctness`, `overall_explanation`, and `overall_confidence_score`.
- **Reviewer rollout**: a sibling file whose `session_meta` has `"parent_thread_id":"<id>"` and `"source":{"subagent":"review"}` (and `"multi_agent_version":"disabled"`, so no spawn tools). The reviewer's turn lives there; take all evidence below from it.
- **Skill load**: a `custom_tool_call` named `exec` whose `input` (JavaScript source calling `tools.exec_command`) contains `.agents/skills/external-review/SKILL.md`, or a `function_call` whose `arguments` contain it. The snippet prints each match; confirm it reads the file rather than searching for the path. A read command chained with others (for example `Get-Content <file>; git diff ...`) counts as a read; a `grep`, `rg`, `find`, or `ls` that only matches the path does not. An injected `<name>external-review</name>` block in a user-role message is an optional extra signal only: 0.156.0 injects none for exec prompts.
- **Spawn calls**: `function_call` records named `spawn_agent`. Expect zero.
- **Commands**: the `custom_tool_call` exec `input` and `function_call` `arguments` strings.

```bash
SID=$(sed -n 's/^session id: //p' "$RUN/run.log" | head -n 1)
node -e '
const fs = require("fs"), path = require("path");
const [sid, root, base, head] = process.argv.slice(1);
const files = [];
const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/^rollout-.*\.jsonl$/.test(e.name)) files.push(p); } };
walk(root);
const load = f => fs.readFileSync(f, "utf8").split("\n").flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });
const firstLine = f => { const fd = fs.openSync(f, "r"), b = Buffer.alloc(65536), parts = []; try { for (let n; (n = fs.readSync(fd, b, 0, b.length, null)) > 0;) { const i = b.subarray(0, n).indexOf(10); parts.push(Buffer.from(b.subarray(0, i < 0 ? n : i))); if (i >= 0) break; } } finally { fs.closeSync(fd); } return Buffer.concat(parts).toString("utf8"); };
const own = files.find(f => f.endsWith(`-${sid}.jsonl`));
if (!own) { console.log("parent rollout missing: skill load, spawns, scope identity, and findings unverified"); process.exit(2); }
const exited = load(own).filter(j => j.payload?.item?.type === "ExitedReviewMode").map(j => j.payload.item.review_output);
const stamp = path.basename(own).slice(8, 27);
const siblings = files.filter(f => { if (f === own || path.basename(f).slice(8, 27) < stamp) return false; const m = firstLine(f); return m.includes(`"parent_thread_id":"${sid}"`) && m.includes(`"source":{"subagent":"review"}`); });
if (siblings.length !== 1) { console.log({ parent: own, reviewSiblings: siblings.length, note: "need exactly one review sibling: skill load, spawns, and scope identity unverified" }); process.exit(3); }
const recs = load(siblings[0]);
const meta = recs[0]?.type === "session_meta" ? recs[0].payload : {};
const turn = recs.find(j => j.type === "turn_context")?.payload ?? {};
const toolText = j => j.payload?.type === "custom_tool_call" && j.payload.name === "exec" ? String(j.payload.input ?? "") : j.payload?.type === "function_call" ? String(j.payload.arguments ?? "") : "";
const texts = recs.map(toolText).filter(Boolean);
const skillRe = /\.agents[\\/]+skills[\\/]+external-review[\\/]+SKILL\.md/;
const skillReads = texts.filter(t => skillRe.test(t));
const injected = recs.filter(j => j.payload?.type === "message" && j.payload.role === "user" && JSON.stringify(j.payload.content).includes("<name>external-review</name>")).length;
const spawnCalls = recs.filter(j => j.payload?.type === "function_call" && j.payload.name === "spawn_agent").length;
const wanted = head ? [`git diff ${base} ${head}`, `git diff ${base}..${head}`] : [`git diff ${base}`];
const diffReads = texts.filter(t => wanted.some(w => t.includes(w))).length;
const untrackedListed = texts.some(t => t.includes("--untracked-files=all"));
console.log({ parent: own, sibling: siblings[0], multiAgent: meta.multi_agent_version, turnModel: turn.model, turnEffort: turn.effort, toolCalls: texts.length, skillReads: skillReads.length, skillInjected: injected, spawnCalls, diffReads, untrackedListed, exitedReviewMode: exited.length });
for (const t of skillReads) console.log("skill read:", t.slice(0, 200));
console.log(JSON.stringify(exited.at(-1) ?? null, null, 2));
' "$SID" "${CODEX_HOME:-$HOME/.codex}/sessions" "$BASE" "$HEAD_SHA"
```

For a single commit pass its base and head. For uncommitted work pass the head SHA and an empty string (`"$HEAD_SHA" ""`); the check then looks for `git diff <head-sha>`. Record the output in the manifest.
