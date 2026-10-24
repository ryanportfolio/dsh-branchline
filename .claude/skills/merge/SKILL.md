---
name: merge
description: "Merge PRs via Codex loop: /codex-fullreview, fix, /codex-review reruns (3 max) until clean, then CI + squash-merge. Only when user types /merge; then every session PR goes through it + merges."
disable-model-invocation: true
---

# Merge via Codex review loop

Finished work → merged PR: commit, push, open/reuse PR, Codex loop, CI, squash-merge. Same file at repo `.claude/skills/merge/SKILL.md` + global `~/.claude/skills/merge/SKILL.md`; copies identical.

## Merge mode

User-only start: user types `/merge`. Never self-start, even if PR looks ready.

`/merge` → merge mode ON for rest of session. Announce in plain prose ("Merge mode is on for this session: every PR goes through the Codex loop and merges when clean") so mode survives summaries. While ON:

- Immediately: every still-open PR this session opened or pushed to → all steps below, one PR at a time. Finished work w/o PR → Step 1 opens one. PRs session never touched → untouched unless user names them.
- After: every PR session opens/updates → same steps → merge, no further prompt. Re-read this file before each; post-summary, text may be gone from context.
- Each PR: own loop, own rerun budget.

Mode OFF when: user says so ("stop merging", "stop merge mode", "don't merge this one"), user switches to `/main`, or session ends. Hold on one PR → holds that PR only.

## Authorization

Per PR, mode authorizes:

- commit finished work, push, open/reuse PR;
- 1× `/codex-fullreview` + ≤3 `/codex-review` reruns, each billed to user's Codex sub;
- in-scope fixes for confirmed findings, committed + pushed to PR branch;
- squash-merge once review loop + CI both pass at same head.

Review skills' "review ≠ fix authority" rule lifted for in-scope fixes only. Still NOT authorized: scope growth, design changes PR didn't make, force-push, admin bypass, direct push to target. Cap hit → that PR blocked; mode stays ON for others.

## Requirements

- `codex-review` + `codex-fullreview` skills, in repo `.claude/skills/` or `~/.claude/skills/`. Either missing → stop, say so.
- Codex reachable via route review skills accept: `codex login status` = ChatGPT login, or `config.toml` in `$CODEX_HOME` (default `~/.codex`) sets `model_provider` to gateway. Neither → stop before merge, report. Never substitute self-review + call gate passed.

## Step 1: Integrate

1. Inspect repo, remote, branch, working changes, existing PR. Target = task's or repo default. Keep unrelated work. Detached HEAD / on target → task branch before commit; respect user-chosen branch. Don't touch other checkouts w/o authorization.
2. Run relevant local checks. Stage explicit paths, inspect staged diff, commit, push. Never bypass hooks. Reuse branch's open PR (`gh pr list --head <branch>`); else create one, description = final behavior + validation. PR changes flows, boundaries, data model or state → description adds short Mermaid diagram of changed structure (GitHub renders it), so owner reads diagram instead of diff; repo keeps `.claude/reference/architecture.md` → same diagram there, same PR. No structural change (copy, styling, docs, config) → no diagram. Multiline bodies via file. Verify PR base, head, remote.
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

## Step 2: Review loop

Each round: `git fetch origin <target>`, scope = full PR branch diff vs `origin/<target>` at current head SHA. Each review skill's contract applies in full: preflight, background launch, own run dir, its 1 auto-retry, verify every finding.

**Round 1: `/codex-fullreview`.** 1 run, full PR diff. Must spawn ≥1 sub-reviewer; 0 = Manager alone = single-context, not full review. Fails after retry, or lacks verified scope identity (per its skill) → doesn't count: keep verified findings, stop, ask.

**Reruns: `/codex-review`.** After any round that pushed a commit → `/codex-review` alone, full PR diff at new head, not just fix delta. Same rule: failed/incomplete → stop loop, ask.

**Triage, after round finishes.** No edits while review runs: reviewers read working tree too, mid-review fix changes what they see. Then:

- Confirmed 🔴/🟡 → fix.
- Kept w/ caveat → fix if residual risk real; else record why it stays.
- Confirmed 🟢 → fix if small + in scope, only in round already needing rerun. Round w/o 🔴/🟡 → list 🟢 in report, head unchanged; 🟢 never triggers rerun alone.
- Refuted → drop, list under "checked and fine".
- Fix needs user decision (behavior change, tradeoff, scope growth) → ask. User may waive; record waiver.

Fix at cause, run relevant local checks, round's fixes = 1 commit naming findings, push. Leave unrelated work alone.

**Loop end.** Pass = latest round, on current head, confirmed 0 🔴/🟡 (waived excluded). Round 1 passes → no rerun.

- Cap: 3 `/codex-review` reruns after round 1. Check budget before any fix/review. After 3rd rerun: no more commits, no more reviews; anything still needing fix (🔴, 🟡, real-risk caveat) or head moved → PR `blocked`: stop, report open items, leave unmerged. User can hand-fix, waive, or authorize more reruns.
- Commits loop didn't make (other session, teammate) → reviewed by next round, counts toward cap.
- Head moves after passing round → verdict void: another `/codex-review` if budget allows, else `blocked`.

## Step 3: CI

Inspect **all PR checks**: `gh pr checks <number> --json name,bucket,state,workflow,link` or current equivalent. Pending → bounded wait. Failed → diagnose, fix in scope; CI fix moves head → back through `/codex-review` round, same budget. Don't trust branch protection or `MERGEABLE` alone. Verify expected workflows actually ran. Absent/skipped/unavailable required check ≠ pass: explain, hold merge unless repo's established verification contract allows. No-CI repo → local verification contract, report that limit. Never admin-bypass checks.

## Step 4: Merge

1. Re-read PR head. ≠ head where loop + CI both passed → back to Step 2; verdict covers only head it saw.
2. Squash unless user/repo says otherwise: `gh pr merge <number> --squash --match-head-commit <verified-head>`. No head guard available → say so, use guarded API or hold; never merge unreviewed commits.
3. Confirm PR merged, fetch target, see merge commit. Keep branch unless user asked cleanup. Next change → new task branch from updated target, keep uncommitted work.

Never reset unrelated work, force-push, or push direct to target. Interrupted → inspect real Git + PR state before retry; lost response ≠ failed write. Pause only blocked action, finish independent authorized work, report exact blocker.

## Report

Per PR: each round w/ source attribution as review skill presents it, surviving findings, fix commit SHAs, waivers + reasons, CI result. End w/ 1 line: `merged <PR URL> at <head SHA>`, or `blocked` + open items.

After merges land (each time no PR in flight is still pending), close w/ **ELI5 recap**: super-short bullets, plain words a 5-year-old gets, no jargon/SHAs/skill names, not caveman. One bullet per merged PR = what it's for; one bullet = what session did overall. Example:

- PR #12: the save button works again.
- PR #13: the page loads faster.
- Overall: fixed two things people kept tripping on.
