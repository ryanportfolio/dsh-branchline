# State

Read from section 3 of the wow-loop skill before writing `state.json` or recomputing a fingerprint.

## `state.json` schema

```json
{
  "task": {"goal": "", "scope": "", "constraints": [], "worktree": ""},
  "contract": {"spec": "spec.md", "bar": "bar.md", "version": 1, "amendments": [], "reference": ""},
  "target": {"user_wording": "", "amendment": "", "standing": false},
  "modules": {"<id>": {"paths": [], "gen_dirs": [], "deps": [], "items": [], "fingerprint": "", "phase": "pending|building|reviewing|passed", "rounds": 0, "checks": []}},
  "checks": {"<id>": {"status": "pending|passed|failed|unavailable|stale", "module": "", "gating": true, "evidence": [], "contract_version": 1}},
  "findings": {"<id>": {"check": "", "module": "", "severity": "blocker|major|minor", "gating": true, "evidence": [], "status": "open|fixed|refuted|waived", "note": ""}},
  "rounds": [{"n": 1, "module": "", "approach": "", "outcome": "", "reports": []}],
  "limits": {"per_module": 4, "total": 12, "used": 0, "user_override": null},
  "outcome": "in_progress|passed|blocked|budget_exhausted",
  "next_action": ""
}
```

## Fingerprint

**Fingerprint.** Content plus path, over the module's tracked and untracked files and its ignored generated dirs. `git diff` misses staged and untracked; `git ls-files --ignored` filters to ignored-only. Use:

```bash
{ git ls-files -z --cached --others --exclude-standard -- <module paths>; [ -n "<gen_dirs>" ] && find <gen_dirs> -type f -print0 2>/dev/null; } \
| sort -zu | while IFS= read -r -d '' f; do [ -f "$f" ] && printf '%s %s\n' "$f" "$(git hash-object "$f")"; done \
| git hash-object --stdin | cut -c1-12
```

Include relevant configuration, assets, stored reference captures, and rendered outputs in the content manifest, recording missing/deleted paths. Bind runtime captures to the actual served build and capture conditions. The shell pipeline is an example; an equivalent path/content manifest is valid on another runtime.

A bare `find` with no path scans the whole worktree, including this state dir, and would churn every fingerprint; the guard above skips it when `gen_dirs` is empty. Whole-deliverable fingerprint is the hash of the module fingerprints in ID order.

## Re-firing

`/loop /wow-loop <slug>` re-fires only while this session stays open. Across sessions the state file is the continuity; the user re-invokes with the slug.
