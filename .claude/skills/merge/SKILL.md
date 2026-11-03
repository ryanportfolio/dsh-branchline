---
name: merge
description: "Merge PRs: 4 fresh-context self-reviewers + fixes, then Codex loop: /codex-fullreview, fix, /codex-review reruns (3 max) until clean, then CI + squash-merge. Only when user types /merge; then every session PR goes through it + merges."
disable-model-invocation: true
---

# Merge via Codex review loop

Finished work → merged PR: commit, push, open/reuse PR, self-review, Codex loop, CI, squash-merge. Same file at repo `.claude/skills/merge/SKILL.md` + global `~/.claude/skills/merge/SKILL.md`; copies identical.

## Merge mode

User-only start: user types `/merge`. Never self-start, even if PR looks ready.

`/merge` → merge mode ON for rest of session. Announce in plain prose ("Merge mode is on for this session: every PR gets a self-review, then the Codex loop, and merges when clean") so mode survives summaries. While ON:

- Immediately: every still-open PR this session opened or pushed to → all steps below, one PR at a time. Finished work w/o PR → Step 1 opens one. PRs session never touched → untouched unless user names them.
- After: every PR session opens/updates → same steps → merge, no further prompt. Re-read this file before each; post-summary, text may be gone from context.
- Each PR: own loop, own rerun budget.

Mode OFF when: user says so ("stop merging", "stop merge mode", "don't merge this one"), user switches to `/main`, or session ends. Hold on one PR → holds that PR only.

## Authorization

Per PR, mode authorizes:

- commit finished work, push, open/reuse PR;
- 4 self-review subagents before Codex round 1 (Step 2), plus again before a rerun when Step 3's large-fix rule applies, billed to user's Claude usage;
- 1× `/codex-fullreview` + ≤3 `/codex-review` reruns, each billed to user's Codex sub;
- in-scope fixes for confirmed findings, committed + pushed to PR branch;
- squash-merge once review loop + CI both pass at same head.

Review skills' "review ≠ fix authority" rule lifted for in-scope fixes only. Still NOT authorized: scope growth, design changes PR didn't make, force-push, admin bypass, direct push to target. Cap hit → that PR blocked; mode stays ON for others.

## Requirements

- `codex-review` + `codex-fullreview` skills, in repo `.claude/skills/` or `~/.claude/skills/`. Either missing → stop, say so.
- Codex reachable via route review skills accept: `codex login status` = ChatGPT login, or `config.toml` in `$CODEX_HOME` (default `~/.codex`) sets `model_provider` to gateway. Neither → stop before merge, report. Never substitute self-review + call gate passed.
- Claude Code `Agent` tool with `general-purpose` type for Step 2. Either missing → say so, skip to Step 3; Codex loop still runs in full.

## Step 1: Integrate

1. Inspect repo, remote, branch, working changes, existing PR. Target = task's or repo default. Keep unrelated work. Detached HEAD / on target → task branch before commit; respect user-chosen branch. Don't touch other checkouts w/o authorization.
2. Run relevant local checks. Stage explicit paths, inspect staged diff, commit, push. Never bypass hooks. Reuse branch's open PR (`gh pr list --head <branch>`); else create one. Title + description per `writing` skill's pull request form: title = effect, description opens w/ problem as user saw it, then fix, then validation; never a changed-file inventory. PR changes flows, boundaries, data model or state → description adds short Mermaid diagram of changed structure (GitHub renders it), so owner reads diagram instead of diff; repo keeps `.claude/reference/architecture.md` → same diagram there, same PR. No structural change (copy, styling, docs, config) → no diagram. Multiline bodies via file. Verify PR base, head, remote.
3. Fetch target, check mergeability. Resolve unambiguous conflicts, keep both sides' intent. Semantic conflicts → investigate; ask only if resolution needs user decision not yet made. Reverify affected behavior, push.

**Destination trust**, before session's first push to this repo. Print no credentials:

- Push remote: `git remote get-url --push --all origin | sed -E 's#://[^/@]*@#://#'`. Pipe strips a token embedded as `https://<token>@github.com/...` before output reaches transcript; never run it unpiped. More than 1 URL → stop, ask: `git push origin` sends to every URL, check covers only one.
- Active GitHub login only: `gh api user --jq .login`.
- Destination: `gh repo view --json nameWithOwner,visibility,viewerPermission,url`.
- Push remote must normalize to returned `nameWithOwner`; `viewerPermission` must be `WRITE`, `MAINTAIN`, or `ADMIN`.
- Include verified login, repo, visibility, permission, and `gh repo view` URL in every `git push` approval justification. Generic "push the branch" not enough: automatic reviewer can't infer destination owner or privacy.
- Every push names checked remote + PR head branch: `git push origin HEAD:refs/heads/<branch>`, `-u` only on branch's first push. Bare `git push` can follow `remote.pushDefault` or `branch.<name>.pushRemote` to an unchecked remote; refspec w/o destination (`HEAD`) can follow `remote.origin.push` or local branch name to wrong branch.
- Later pushes this session reuse the evidence only while push URL list unchanged.
- Remote not GitHub, queried repo does not match push remote, write permission absent, or check can't run → stop, ask user. Never weaken permissions, add global push allow-rule, or route around denial.

Record PR number, target, head SHA.

## Step 2: Self-review

Goal: find + fix what Codex would find, so Codex rounds come back clean more often. Extra layer before Codex, never replaces it: Step 3 runs in full whatever self-review found.

**Areas.** Split change into 4 areas from what PR + session actually involve. Each area = distinct code paths or concerns, little overlap. Examples:

- crawler/CLI: fetching + IO; parsing; rule logic; comparison/diff output + docs.
- UI: behavior; states + edge cases; accessibility + layout; docs + tests.
- docs/skill-only PR: changed files or contracts a reviewer can check against the rest of the repo, grouped into 4.

More files or concerns than 4 → group them. Fewer distinct areas than 4 (tiny PR) → split whole diff by lens instead: false success; common real inputs; error + edge paths; docs vs code.

**Launch.** 4 `Agent` calls, 1 message, run in parallel. `subagent_type: "general-purpose"` on every call, never `"fork"` (fork inherits this conversation → reviewer shares author's reasoning, no longer fresh). `model` omitted, no `isolation` (worktree isolation breaks rtk git calls). Each brief standalone, reviewer has no session context:

- scope: repo path, base = `git merge-base origin/<target> <head>` SHA (not `origin/<target>` tip: once target moves, two-dot diff from tip shows target's new commits as PR reverts), head SHA, `git diff <base>..<head>` as the diff;
- files to read + area to cover; other 3 areas named, running in parallel, so it stays in its own;
- browser work (if any): own Chrome via repo's `launchPlacedChrome()` or `--window-position=-2400,-2400`, `--mute-audio`; never shared `mcp__playwright-iso__*` tools (one browser per session, other reviewers run at same time);
- bug classes in priority order: false success (reports pass/clean/done when it isn't), then wrong results on common real inputs, then crashes;
- PR's goal in 1-2 sentences + scope rule: finding only on another path, a rare input, a small perf cost, or extra compatibility = 🟢 unless it breaks the goal (security, auth, data loss keep impact severity); code, tests, guards or options the goal doesn't need = 🟢 finding, fix = smaller version;
- what earlier rounds already fixed (this session's fix commits + findings), so it hunts new bugs;
- rules: reproduce every bug before reporting it; fixtures + scratch only under `.tmp/selfreview/<area>/`; never edit repo files, never commit, never push;
- return: confirmed findings, each w/ severity (🔴/🟡/🟢), file:line, reproduction (command + observed vs expected), suggested fix; then separate list of unconfirmed suspicions.

**While running.** No edits, commits, or pushes: reviewers read working tree. Wait for all 4. Reviewer errors, returns nothing, or report cut off → relaunch that area once, same Launch settings; fails again → area uncovered: say so in report, never count it as clean.

**Triage.** Session verifies each reported finding itself (rerun reproduction or read code); reviewer's word ≠ proof. Then:

- Confirmed, in scope → re-grade by scope rule (Step 3 **Scope**), fix at cause, any severity; declined 🟢 → follow-up list.
- Unconfirmed suspicion → quick check; confirmed → fix, else note in report.
- Refuted → drop, list under "checked and fine".
- Fix needs user decision (behavior change, tradeoff, scope growth) → ask.

All self-review fixes = 1 commit naming findings. Rerun relevant existing local checks for each fix, push. Record head SHA → next Codex round reviews it (round 1, or the rerun a mid-loop self-review precedes). 0 confirmed → no commit, go to that round.

Self-review costs no Codex budget. Doesn't count as a Codex round.

## Step 3: Codex review loop

Each round: `git fetch origin <target>`, scope = full PR branch diff from `git merge-base origin/<target> <head>` to current head SHA. Each review skill's contract applies in full: preflight, background launch, own run dir, its 1 auto-retry, verify every finding.

**Round 1: `/codex-fullreview`.** 1 run, full PR diff. Counts only when its skill's evidence verifies the skill read and ≥1 sub-reviewer that completed (returned a final report), not just started. 0 completed = Manager alone = single-context, not full review. Completion unverified, plain-prompt attribution, fails after retry, or lacks verified scope identity (per its skill) → doesn't count: keep verified findings, stop, ask.

**Reruns: `/codex-review`.** After any round that pushed a commit → `/codex-review` alone, full PR diff at new head, not just fix delta. Same rule: failed/incomplete → stop loop, ask.

**Triage, after round finishes.** No edits while review runs: reviewers read working tree too, mid-review fix changes what they see. Then:

- Confirmed 🔴/🟡 → fix.
- Kept w/ caveat → fix if residual risk real; else record why it stays.
- Confirmed 🟢 → fix if small + in scope, only in round already needing rerun. Round w/o 🔴/🟡 → list 🟢 in report, head unchanged; 🟢 never triggers rerun alone.
- Refuted → drop, list under "checked and fine".
- Fix needs user decision (behavior change, tradeoff, scope growth) → ask. User may waive; record waiver.

**Scope.** Re-grade each confirmed finding by Step 2's scope rule, whatever label reviewer gave. Prefer fix that deletes or narrows code over new guard, option, cache or helper. Declined 🟢 → report's follow-up list, 1 line each. Before each push: `git diff --shortstat <merge-base> HEAD` vs before the round; diff grew more than its 🔴/🟡 fixes need → cut first.

Fix at cause, run relevant local checks, round's fixes = 1 commit naming findings, push. Leave unrelated work alone.

**Self-check before each rerun.** Codex round found something → after fixing, before push: session itself checks for related cases of same bug kind (same input class, same pattern in sibling code paths, same missing guard elsewhere). Reproduce each one found, fix in same commit. Goal: rerun doesn't find the sibling of a bug just fixed. Full 4-reviewer self-review (Step 2) only before round 1, plus again before a rerun when fixes are large (new module or code path, rewrite of a core function, or fix delta bigger than the original change in that area). Then: commit round's fixes locally, no push; run Step 2 on that head so reviewers see the fixes; its fixes = 2nd commit; push both together. Rerun budget unchanged.

**Loop end.** Pass = latest round, on current head, confirmed 0 🔴/🟡 (waived excluded). Round 1 passes → no rerun.

- Cap: 3 `/codex-review` reruns after round 1. Check budget before any fix/review. After 3rd rerun: no more commits, no more reviews; anything still needing fix (🔴, 🟡, real-risk caveat) or head moved → PR `blocked`: stop, report open items, leave unmerged. User can hand-fix, waive, or authorize more reruns.
- Commits loop didn't make (other session, teammate) → reviewed by next round, counts toward cap.
- Head moves after passing round → verdict void: another `/codex-review` if budget allows, else `blocked`.

## Step 4: CI

Inspect **all PR checks**: `gh pr checks <number> --json name,bucket,state,workflow,link` or current equivalent. Pending → bounded wait. Failed → diagnose, fix in scope; CI fix moves head → back through `/codex-review` round, same budget. Don't trust branch protection or `MERGEABLE` alone. Verify expected workflows actually ran. Absent/skipped/unavailable required check ≠ pass: explain, hold merge unless repo's established verification contract allows. No-CI repo → local verification contract, report that limit. Never admin-bypass checks.

## Step 5: Merge

1. Re-read PR head. ≠ head where loop + CI both passed → back to Step 3; verdict covers only head it saw.
2. Base drift: `git fetch origin <target>`; `gh pr view <number> --json mergeStateStatus`. `DIRTY` → Step 1.3. Files target changed since branch point (`git diff --name-only <merge-base> origin/<target>`, merge-base = `git merge-base origin/<target> <head>`) overlap PR's files (`git diff --name-only <merge-base> <head>`) → review + CI never saw that combination: `git merge origin/<target>` into branch (never rebase: force-push not authorized), local checks, push → back to Step 3 (`/codex-review` rerun, same budget) + Step 4. No overlap → continue.
3. Squash unless user/repo says otherwise: `gh pr merge <number> --squash --match-head-commit <verified-head>`. No head guard available → say so, use guarded API or hold; never merge unreviewed commits.
4. Confirm PR merged, fetch target, see merge commit. Keep branch unless user asked cleanup. Next change → new task branch from updated target, keep uncommitted work.

Never reset unrelated work, force-push, or push direct to target. Interrupted → inspect real Git + PR state before retry; lost response ≠ failed write. Pause only blocked action, finish independent authorized work, report exact blocker.

## Report

Per PR: self-review first: areas that returned a usable report (N of 4; name any uncovered area, or "skipped: no Agent tool"), confirmed findings (severity + 1 line each), fix commit SHA (or "0 confirmed"), suspicions left unconfirmed; any later full self-review same way, and each pre-rerun self-check's extra fixes in that round's line. Then each Codex round w/ source attribution as review skill presents it, surviving findings, fix commit SHAs, waivers + reasons, CI result. End w/ 1 line: `merged <PR URL> at <head SHA>`, or `blocked` + open items.

After merges land (each time no PR in flight is still pending), close w/ **ELI5 recap**: super-short bullets, plain words a 5-year-old gets, no jargon/SHAs/skill names, not caveman. One bullet per merged PR = what it's for; one bullet = what session did overall. Example:

- PR #12: the save button works again.
- PR #13: the page loads faster.
- Overall: fixed two things people kept tripping on.
