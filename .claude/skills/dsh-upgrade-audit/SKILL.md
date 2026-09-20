---
description: Use when a DSH launcher notice says a newer @deepseek-ai/dsh is available. Audits the pinned-to-latest gap (what's new, what of ours breaks, fix-ahead plan) BEFORE the Upgrade DSH button is pressed.
---

# DSH Upgrade Audit

Trigger: user sees `NOTICE: DSH update available` in the launcher log, or asks "should we upgrade DSH".

Outcome: a breakage verdict per out-of-tree package + a fix-ahead plan, so the Upgrade DSH button in `start-dsh.ps1` is pressed only when safe. Do NOT perform the upgrade; the button owns that.

## Step 1: Establish the gap

- Read the pin: `$Version` default in `start-dsh.ps1` (top `param` block).
- Read the notice state: `launcher-settings.json` under `%LOCALAPPDATA%\DSH Branchline` (`updateCheck.knownLatest`).
- Confirm latest: `npm view @deepseek-ai/dsh dist-tags.latest` (per-tag `npm view @deepseek-ai/dsh@<v> ...`, never bare `npm view dsh` — wrong package). Skip `x.y.z-alpha` tags unless the user asks; recommend the newest `rc`.
- Get the delta source: GitHub releases API per tag (`/repos/<owner>/deepseek-harness/releases/tags/<tag>`, `body` field) — the `/releases` list page scrapes empty.

## Step 2: Inventory ours

- Profile patch: `~/.dsh/profiles/web/cordis.patch.yml` (usually limits-only, safe).
- Out-of-tree packages: `~/.dsh/profiles/web/package.json` `link:` deps pointing into this repo's `packages/`.
- Repo skills/workflows that touch DSH APIs (grep for `workflow`/`subagent` tool use vs doc prose — prose is not usage).
- No dynamic plugins to check: `cordis_inspect_self` with no IDs lists session plugins; empty means none.

## Step 3: Pull new-version type defs, compare

For each first-party package ours touches (`dsh-session-query`, `dsh-session-persistence`, `dsh-agent`, `dsh-session`, `dsh-persona`, `dsh-system-prompt`, UI packages):

- `npm pack @deepseek-ai/<pkg>@<new-ver>` into a temp dir (one subdir per package — tarballs all contain `package/` and collide).
- Read `lib/types/*.d.ts`. Compare against our call sites (grep `packages/` for `locate|loaded.events|.events\b|sessions.get|agents.(get|create|resume)|systemPrompt.section|connection.api|slots.inject`).
- Slot names: check the UI package's `client/contract/slots.d.ts` `SlotMap` — a slot that still exists needs no client change.
- Known break classes (verify, don't assume): Session format migration (one-way, originals preserved); `Session.events` removal; `SessionPersistence.locate` removal (handles-only API); `AgentRegistry` handle semantics; persona prefix/suffix split; slot renames (`conversation.*`); `workflow`-tool default removal (only matters if repo code calls the DSH workflow tool — Claude/Codex CLI workflows are unaffected).

## Step 4: Verdict per plugin

Report three buckets with file:line evidence:

- **Safe**: signatures/slots unchanged in new defs. Name the check.
- **Breaks**: missing method / changed signature, with practical loss ("could do before, can't after until rebuilt").
- **Needs runtime test**: structural casts over controller/connection faces that types can't confirm — verify by clicking after upgrade.

Recommend fix-ahead vs fix-after per break: a missing-method break gets a dual-path shim (feature-detect, old path byte-identical) built and tested on the current version BEFORE upgrade. Anything needing the new runtime waits until after.

## Step 5: Fix-ahead (only for shimmable breaks)

- Implement behind feature detection (`typeof svc.method === 'function'`), old branch untouched.
- Fail closed: genuine absence -> null/no-op; corruption/ambiguity/permission errors -> throw, never silent success that lets destructive follow-ons proceed.
- Verify with throwaway probes under `.tmp/` (deleted after): `node --check`, stub-ctx both-branches test, `git diff --stat` shows only the target file.
- For non-trivial fixes use the `long-horizon` skill (fresh executor + frozen-brief auditor rounds). Queue `codex-review` after, verify each finding, fold real ones into a hardening round. Allow a 25-minute timeout for `codex exec` reviews — they stream nothing until done, and a 5-minute cap times out mid-review.

## Anti-patterns

- Don't claim breakage from release-note prose alone — confirm against the new `.d.ts`.
- Don't touch the upgrade pin as part of the audit — the launcher button owns the pin switch.
- Don't propose 0.1.6-alpha (or any alpha) unless asked; newest rc is the recommendation.
- Don't mistake doc prose for API use when grepping skills (`workflow`/`subagent` words in guides are not tool calls).
- Don't run `npm view dsh` (a dead 2016 package) — always scope `@deepseek-ai/dsh`.
