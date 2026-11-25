---
name: arena
description: "Parallel attempts at one task, blind judging, best ideas grafted onto strongest. Use: /arena, 'try a few approaches', 'build me options', bakeoffs, competing versions, stalled long-horizon or wow-loop step."
---

# Arena

Use when the right shape of a solution is unclear and building several real versions will show it. Triggers: `/arena`, "try a few approaches", "build me options", bakeoffs, competing versions, or a stalled `long-horizon` or `wow-loop` step.
Skip it for "arena" meaning a game level or map, work whose shape is obvious, tuning values of a settled design (`lab`), comparing options on paper (`dare`), or reviewing an existing diff (`impartial-review`).

## Before starting

Every candidate and the judge run with fresh context: Agent tool workers, plus Codex workers launched through the shared runner (`.claude/scripts/codex-run/codex-run.mjs`). If no fresh-context route exists, tell the user and stop. The parent never builds a candidate itself.

Arena permits work in scratch only. Commit, push, PR, merge, deploy, and installs each need their own authorization.

## The arena folder

Everything lives under `.tmp/arena/<slug>/`. These access rules carry the blinding and isolation.

| Path | Contents | Written by | Read by |
|---|---|---|---|
| `brief.md` | Artifact, inputs, and constraints | Parent | Candidates and parent |
| `criteria.md` | 3 to 6 pass/fail criteria an outsider could check, such as "adds a `--dry-run` flag that performs no writes" ("clean code" is too vague) | Parent | Parent and judge only; never copied into a candidate's folder or worktree |
| `c1/` ... `cN/` | One candidate's artifact plus `rationale.md`: the options it considered and dropped, with reasons | That candidate only, in this folder or its own git worktree | Parent only; the judge never sees `rationale.md` |
| `judge/` | Each artifact copied under a neutral letter, with names, angle, vendor, and model traces removed and content otherwise unaltered | Parent | Judge, read-only |
| `note.md` | The run record listed under "Done when" | Parent | Parent, then the user |

No two workers share a writable path. The parent holds the letter-to-candidate map until the verdict, then writes it to `note.md`. Record any trace that cannot be removed as a blinding limit.

## Workers

**Candidates.** Three by default; more on request or when the options are many. Each brief names a different angle, such as minimal change, failure-proof, or end-user-first. Agent workers run on Opus, the latest Fable, or higher, never `sonnet` or `haiku`. A user-chosen model that meets that floor wins.

Never start a worker with `isolation: "worktree"`: where a hook rewrites `git` to `rtk git`, Claude Code refuses nearly every git command in an isolated agent. A candidate that needs no git writes only in its `cN/` folder. For one that needs git, the parent runs `git worktree add --detach <main checkout>/../_wt/<repo>/arena-<slug>-cN` before starting it, outside the repo folder because the desktop app refuses writes to other worktrees inside it. The worktree starts from the last commit, so the parent copies in every uncommitted file the brief depends on, and later merges kept results into its own files instead of copying over them. The brief gives that absolute path and says to use it on every call (`git -C <path>`, `cd <path> && ...`), because the Bash working directory resets between calls. A new worktree has no `node_modules`; the brief says to install them. After the verdict, the parent copies what it keeps and removes these worktrees.

Mix vendors without asking. If Codex has an accepted route (a ChatGPT login or a `model_provider` gateway, as the `codex-review` preflight defines), one candidate and the judge run on Codex, role `sol`. `node "$RUNNER" --preflight` (runner lookup below) reports the route (`ready`). Only the user's explicit request skips Codex. No accepted route: all workers run on Claude, noted; never switch Codex to an API key or paid credits.

Launch Codex workers only through the runner, never a hand-built `codex exec` line, and never bypass approvals or the sandbox. Run it from the repo root; it resolves `--out`, `--prompt-file`, `--schema` and `--image` against that cwd, not `--cd`. The model pin lives in `models.json` next to the runner in use; a user-chosen model goes in as `--model <id>`. Each run is one background Bash call; poll `<out>/status.json`, then read `<out>/result.json` (a foreground call dies at 10 minutes). `--out` must be a new folder outside every `cN/` and `judge/`, for example `.tmp/arena/<slug>/runs/<worker>`.

```bash
# Resolve $RUNNER in the same shell call as each launch: repo runner, then the one shipped beside this skill, then the user install
for RUNNER in .claude/scripts/codex-run/codex-run.mjs "<this skill's folder>/../../scripts/codex-run/codex-run.mjs" "$HOME/.claude/scripts/codex-run/codex-run.mjs" ""; do [ -f "$RUNNER" ] && break; done
test -n "$RUNNER" || echo "codex-run runner not found: stop and tell the user"
# Codex candidate: writes only inside its own folder or worktree (the sandbox enforces it)
node "$RUNNER" --out ".tmp/arena/<slug>/runs/cN" --role sol --sandbox workspace-write \
  --cd "<cN folder or worktree, absolute>" --prompt-file ".tmp/arena/<slug>/runs/cN-brief.md" --timeout-min 60 --label "arena cN"
# Codex judge: read-only; its prompt file holds criteria.md plus the instruction to read only judge/
node "$RUNNER" --out ".tmp/arena/<slug>/runs/judge" --role sol --sandbox read-only \
  --cd "<absolute path to .tmp/arena/<slug>/judge>" --prompt-file ".tmp/arena/<slug>/runs/judge-prompt.md" --timeout-min 30 --label "arena judge"
```

The candidate's prompt file is `brief.md` plus its angle; it never contains `criteria.md`. A worker counts only when `result.json` says `ok: true`; record its `observed` model in the worker table. The 60 and 30 minute caps are choices, not measurements; raise them with `--timeout-min` for large tasks. The runner turns off the user's Codex hooks, plugins and MCP servers for each run. The judge's read-only sandbox blocks writes, not reads outside `judge/`: say in its prompt to read nothing else, and record that limit under blinding.

For browser-rendered artifacts, each candidate brief includes the `CLAUDE.md` browser rule.

A candidate that returns nothing, or a Codex run that fails (`result.json` `ok: false`: sandbox block, `timeout`, `model_rejected`, any other `reason`), is a dropout. Record it with its `reason` and continue with the rest. Never rerun a rejected model on a different one without the user's OK.

**Baseline.** When the task improves an artifact that already exists, copy the current version unchanged into `c0/` with no `rationale.md`. It goes to the judge under a neutral letter like any candidate, and picking it is a valid outcome. A new artifact has no baseline; never build a stand-in. If its style or history would identify it to the judge, record that as a blinding limit.

**Judge.** Start it only after all candidates return. Fresh and read-only, it sees only `criteria.md` and `judge/`, and returns pass/fail per criterion with evidence for every letter, plus a recommended base.

## Deciding

Read every candidate completely, low scorers included, and score the criteria yourself. Before overruling the judge, recheck the evidence it cited.

The base is the candidate whose design the planned merges would disturb least; if still tied, the one with less code. Take at most one or two ideas from each other candidate and rewrite them to the base's conventions. A reader of the final artifact should not be able to tell where one candidate ends and another begins. When the baseline is chosen as the base, take an idea from another candidate only if that candidate passed a criterion the baseline failed; otherwise the current version stands unchanged.

If the candidates split over a basic premise, `brief.md` has a gap: that gap gets fixed in the brief and a new round runs; a merge of both premises is never the answer. If they all agree, still run the checks.

## Reruns

One rerun total, spent on either a split premise or a verification failure traced to the brief. If verification fails on something another candidate already solved, return to merging instead. More reruns need the user's OK.

## Done when

The artifact passes the real checks it claims (tests, build, render, measurement), and `note.md` lists, in this order:

1. A worker table: letter, model, vendor, angle, and outcome (returned, dropped, or blocked). A baseline appears as `c0`, angle "unchanged".
2. Blinding limits and the judge's verdict.
3. For each non-base candidate: every idea you looked at, marked taken or left, with the reason. Put the base choice and its reason at the top of this section.
4. Check commands and their results.

The parent writes the final artifact to the path the user named, or else where the base candidate's work belongs in the repo. Candidate folders stay in scratch.
