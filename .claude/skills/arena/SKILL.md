---
name: arena
description: Builds parallel attempts at one task, judges them blind, and grafts the best ideas onto the strongest. Use for /arena, "try a few approaches", "build me options", bakeoffs, competing versions, or a stalled long-horizon or wow-loop step.
---

# Arena

Use when the right shape of a solution is unclear and building several real versions will show it. Triggers: `/arena`, "try a few approaches", "build me options", bakeoffs, competing versions, or a stalled `long-horizon` or `wow-loop` step.
Skip it for "arena" meaning a game level or map, work whose shape is obvious, tuning values of a settled design (`lab`), comparing options on paper (`dare`), or reviewing an existing diff (`impartial-review`).

## Before starting

Every candidate and the judge run with fresh context: Agent tool workers, plus `codex exec` processes for Codex workers. If no fresh-context route exists, tell the user and stop. The parent never builds a candidate itself.

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

**Candidates.** Three by default; more on request or when the options are many. Each brief names a different angle, such as minimal change, failure-proof, or end-user-first. Agent workers run with `isolation: "worktree"` on Opus, the latest Fable, or higher, never `sonnet` or `haiku`. A user-chosen model that meets that floor wins.

Mix vendors without asking. If `codex login status` reports a ChatGPT (subscription) login, one candidate and the judge run through `codex exec` with the Sol model id that `codex-review` pins. Take flags from local `codex exec --help`, and never bypass approvals or the sandbox. Only the user's explicit request skips Codex. Logged out, logged in with an API key, or unclear billing: all workers run on Claude, noted; never switch Codex to an API key or paid credits.

For browser-rendered artifacts, each candidate brief includes the `CLAUDE.md` browser rule.

A candidate that returns nothing, or a Codex run the sandbox blocks, is a dropout. Record it and continue with the rest.

**Judge.** Start it only after all candidates return. Fresh and read-only, it sees only `criteria.md` and `judge/`, and returns pass/fail per criterion with evidence for every letter, plus a recommended base.

## Deciding

Read every candidate completely, low scorers included, and score the criteria yourself. Before overruling the judge, recheck the evidence it cited.

The base is the candidate whose design the planned merges would disturb least; if still tied, the one with less code. Take at most one or two ideas from each other candidate and rewrite them to the base's conventions. A reader of the final artifact should not be able to tell where one candidate ends and another begins.

If the candidates split over a basic premise, `brief.md` has a gap: that gap gets fixed in the brief and a new round runs; a merge of both premises is never the answer. If they all agree, still run the checks.

## Reruns

One rerun total, spent on either a split premise or a verification failure traced to the brief. If verification fails on something another candidate already solved, return to merging instead. More reruns need the user's OK.

## Done when

The artifact passes the real checks it claims (tests, build, render, measurement), and `note.md` lists, in this order:

1. A worker table: letter, model, vendor, angle, and outcome (returned, dropped, or blocked).
2. Blinding limits and the judge's verdict.
3. For each non-base candidate: every idea you looked at, marked taken or left, with the reason. Put the base choice and its reason at the top of this section.
4. Check commands and their results.

The parent writes the final artifact to the path the user named, or else where the base candidate's work belongs in the repo. Candidate folders stay in scratch.
