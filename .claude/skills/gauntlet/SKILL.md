---
name: gauntlet
description: "Only on explicit /gauntlet: draft → dare → final draft → why → rewrite → arena → commit, stop for /merge. Skills fully; other artifacts need declared apply method + real check."
disable-model-invocation: true
---

# Gauntlet

One command for the quality chain the owner ran by hand on a skill build: first-principles pass (dare), final draft, one fresh reviewer (why), rewrite, competing versions judged blind (arena), then a commit that waits for `/merge`. The owner typing `/gauntlet` authorizes every stage below for this run, including dare's four steps, which the owner otherwise starts by typing `/dare`.

Skip it for small edits, a single recommendation to pressure-test (`why`), a problem with no artifact yet to build (`dare` alone), or work whose candidates cannot be tested. The one measured run (a skill, `ui-quality`) took 14 Claude agent runs, 2 Codex runs and about 1 hour 40 minutes including owner waits, half of it in arena.

Gauntlet does not review code as code. `/merge`'s Codex review still runs on the result; on the measured run it found six real defects the chain had missed.

## Requirements

- A fresh-context Agent tool. Without one, stop before the contract: every stage depends on it.
- The called skills, read at run time: `dare`, `why`, `arena`. Look in the repo's `.claude/skills/<name>/SKILL.md` first, then `~/.claude/skills/<name>/SKILL.md`. Missing one, stop and name it. Record the path and SHA-256 of each file used in `state.md`.
- Use only the sections this file names. If a named heading is missing from a called skill, stop and say which; never guess its replacement.

## Run folder

`.tmp/gauntlet/<slug>/` in the repo that holds the artifact (in place for a non-repo artifact), with `dare/`, `why/` and `arena/` inside. Slug from the artifact name; an existing folder gets `-2`, `-3`. `state.md` records: current stage, contract version, artifact path, branch and worktree, called-skill paths and hashes, every gate decision in the owner's words. Write it at each stage boundary; re-read it after compaction or on resume and continue from the recorded stage.

## Stage 0: intake and contract

1. Find the artifact. A path or the conversation names it; if none exists yet, the owner's brief is the input and Stage 1 runs.
2. Decide where edits happen. An artifact already on a branch or open PR: that branch, in its worktree. Another repo artifact: a new worktree on freshly fetched `origin/<default>`, placed as the repo's rules require. A non-repo artifact: in place, with the original copied to the run folder first.
3. Fix the apply method and the real check:
   - Skill: candidates are applied by fresh agents to at least one saved case and one unlike live case. Fix one saved case per mode the acceptance conditions name (an audit mode gets a page with planted defects, a build mode gets a task brief plus a list of required outcomes, such as states covered, decisions saved and checks run). A mode without a case is waived by the owner at Gate 1 in their own words, or listed as untested in the report.
   - Saved cases are built now, after Gate 1 and before dare, by a fresh agent, so dare's tests and arena share them. Its answer key (planted defects for an audit case, required outcomes for a build case) goes to `parent/key.md` in the run folder, outside every folder a candidate or applicant reads; the contract names the case, never the key. The agent holds back about a third of the planted defects in `parent/key-held.md`. The parent does not read the held-back file; dare's tests, the final draft and the rewrite work from `key.md` only, and arena's judge scores against both files.
   - Real check for a skill: the repo's skill checks. In Harness Firmware repos: for a skill registered `native` in `.agents/skill-modes.json`, once the final replaces both runtime copies, `sync-codex-skills.mjs --baseline <name>` (a `disabled` skill has no port and skips this step); then, for every skill, `--check`, `test-codex-contract.mjs`, and the template manifest check where it exists. A drift or registration warning counts as a failure even though the script exits 0.
   - Any other type: the owner states how a candidate gets applied and one real check (tests, build, render, measurement). Without both, refuse the run. Label the run experimental in `state.md` and the report.
4. Draft `contract.md`, version 1, from the owner's words only: goal, constraints, authorization, acceptance conditions, apply method, real check. No preferred solution, no assessment. Show it. **Gate 1: wait for the owner's OK.** Only the owner amends it; keep earlier versions. Every later dispatch receives it verbatim.

## Stage 1: first draft (only when none exists)

Write it through the artifact's usual create route (`addskill` for a skill, `writing` for prose, the repo's normal path for code or design), held to the contract. Then continue.

## Stage 2: dare

Read dare's `SKILL.md` and follow its "Orchestration" section with its D, A, R and E subsections, and its "Boundaries". This stage changes three things:

- The contract is `contract.md` from Stage 0; do not write a second one.
- Problem statement for D, saved as `dare/problem.md`: what this artifact must achieve and how it is built, with the draft's path. Artifacts go to `dare/`, not `.tmp/dare/`.
- **Gate 2:** stop only when D names a deeper problem; otherwise record "none" in `state.md` and continue. **Gate 3:** A's audit table; always stop and wait, never take dare's unattended path. In chat show the load-bearing rows (facts the draft gets wrong, gaps, unknowns) and a count of the rest; the full table stays in `dare/audit.md`.

E's runnable tests execute as dare says, against `parent/key.md` only. A test that needs a fresh agent applying the skill to a case runs inside arena's application runs instead; record it as deferred in `dare/report.md`. Unmatched findings in E's output may be held-back defects: check them for false positives, but do not add them to the draft as targets. Skip dare's "Output" section: no stop for a single next action and no `writing-plans` hand-off. Write `dare/report.md` with the audit table, solutions, test results and the owner's reclassifications, then continue.

## Stage 3: final draft

Rewrite the artifact from the dare report, held to the contract. In `final-draft-notes.md`, mark each audit entry that changed the draft and each solution taken or left, with the reason.

## Stage 4: why

Read why's `SKILL.md` and run its Steps 2 and 3 only, on the final draft: ground the facts the draft leans on, then one fresh reviewer that gets the draft and `contract.md`, not the conversation. Skip Step 4 and self-run's wait for an answer. Save the reviewer's findings and your grounding to `why/findings.md`.

## Stage 5: rewrite

Fold the findings in as you judge best, held to the contract. In `why/applied.md`, mark each finding taken or left, with the reason.

## Stage 6: arena

Read arena's `SKILL.md` and follow all of it, with `arena/` as its folder:

- The rewritten draft is baseline `c0`.
- `criteria.md` comes from a fresh agent that gets `contract.md`, the artifact type and the apply method, before any candidate starts. The parent edits a criterion only to make it checkable, and logs the change.
- Candidates are applied as Stage 0 fixed: for a skill, fresh application runs, each seeing only its lettered candidate and the case. Dare tests deferred to arena run here. The parent copies both key files into `judge/`, and the judge scores the application outputs against them.
- A non-base candidate's tested fix for a defect the base still has is a repair, not one of arena's one or two ideas per candidate. Take it, or list it in the report as a known defect.

Arena's own rerun limit and authorization rules hold. Its final artifact replaces the draft at the artifact's path; for a skill with a Codex port, it replaces both runtime copies.

Before Stage 7, scan the final for repo rules the criteria do not cover: commands valid in the shell the runtime uses, no machine-specific paths in anything that ships, and the repo's writing rules. Fix what the scan finds.

## Stage 7: check and stop

1. Run the real check. A failure goes back to the arena base for a fix; run the check again. Report what still fails rather than shipping it.
2. Repo artifact: stage explicit paths and commit on the branch. Do not push. If merge mode is on in this session, continue into the merge loop. Otherwise stop with one line: type `/merge` to push, open or update the PR, run the Codex review loop and merge.
3. Non-repo artifact: stop at the final file path.

## Report

Contract version; each stage's artifact path and outcome; gate decisions in the owner's words; the dare audit summary; why findings taken and left; arena's worker table, verdict and grafts; real-check commands and results; held-back defects caught per candidate; modes left untested; experimental label if set; the next step, with a note that `/merge`'s Codex review has not yet run.

## Boundaries

- Never push, open a PR, merge or deploy. `/merge` does that, started by the owner.
- Never skip dare, and never edit `dare`, `why` or `arena` during a run.
- Each called skill's model, fresh-context and browser rules apply inside its stage. Never claim a stage ran isolated when it did not.
