# Lens: what counts as a problem

For any two pieces of code ask: would a real change need both? Wrong answers fall in three groups, plus special cases. Each problem needs the listed evidence; without it, drop.

## Hidden links: a change in one place silently needs another

| Shape | Evidence |
|---|---|
| Copied logic or values (constants, validation rules, formulas) | every copy's `path:line`; at least one copy already drifted, or co-change pair |
| Module reads global, env, file or shared state another module sets | writer + reader `path:line`; no import or parameter connects them |
| Feature spread over layer folders (`routes/`, `services/`, `views/`) | co-change pairs with `crossDir: true` and high `share`, whose `commonDir` is only a shared root (`src`, `.`); same feature name in each folder |
| Call order or convention callers must know (init before use, `close()` after every write) | callers that follow it + at least one that doesn't, or a bug fix commit that added it |
| Parallel lists that must match (route table + nav menu + sitemap, enum + switch per value) | every list `path:line`; an entry present in one, missing in another |

## Needless links: coupled code with separate reasons to change

| Shape | Evidence |
|---|---|
| Callers reach into internals (private fields, inner structure, file layout of another module) | caller `path:line` + internal it touches; a commit where an internal change forced a caller change |
| Import points from a rarely changed module to a frequently changed one | import edge; `fileChanges` counts from `co-change.json` showing the imported side changes far more |
| Shared function carrying a flag or branch that serves one caller | parameter `path:line` + the one caller |
| Thin module whose interface mirrors its body, so callers change with every internal edit | interface vs body size; co-change between module and its callers |

## Surplus: code with nothing of its own to change for

| Shape | Evidence |
|---|---|
| Pass-through wrapper | wrapper body forwards unchanged; caller list |
| Extension point, option or config that never varies | every call site passes the same value, or one implementation only |
| Dead code | no reference (grep across repo incl. dynamic lookups, routes, config, tests); not an entry point |
| Comment restating what the next line does, or narrating history ("fixed in round 3") | comment `path:line`. Keep why-comments, comments naming an outside fact the code can't show, and TODOs naming a known gap |
| Test that can't fail (passes if code returns nothing) or tests internals instead of behavior | test `path:line` + what it asserts |

## Special cases: design signals

Branches and workarounds that serve one situation rather than falling out of the general design:

- `if` on one id, name, value or env
- parameter added for one caller
- swallowed exception (empty or log-only catch)
- retry, sleep or timeout outside timing code
- skipped or disabled test
- flag set by one module to stop another's behavior

List each with `path:line` + the situation it handles (from code or `git log -L`/blame). Not a fix target one by one: redesign uses them to find what the system actually needs. Rule 4 in SKILL.md: a special case that guards data, security, accessibility or a needed fallback stays (fix may move it).

## Not problems

Style, naming taste, formatting, file length alone, missing patterns or best practices with no change they make harder, duplication whose copies change for different reasons (keep it), a library's public API and test seams (fakes, injection points) even with one implementation, vendored and generated code (read for links only).
