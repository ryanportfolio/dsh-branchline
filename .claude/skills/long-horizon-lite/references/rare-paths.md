# long-horizon-lite: dependency rounds, contract amendments, check-only repair, sections shipped as PRs

Four paths most runs never take. Read a path's section before taking it, and when resuming a run whose state file shows it under way: a block w/ an `Install` or `Repair` line or a Worker line that says `needs install`, an Amendments line marked `proposed`, `applying` or `declined`, a `Waiting` line that names a PR.

Restore command = the repo's own clean install from its lockfile (npm: `npm ci`). It adds no dependency and changes no tracked file: it makes a dependency folder hold what the checked-out lockfile names. No lockfile → the repo's install from the checked-out manifest w/ no package named, agreed w/ the user in the same approval. Never the approved install command itself: it changes the manifest, so run as a restore it would add the dependency before the executor starts and put it back after a revert.

## Dependency round

A round whose step adds, removes or updates a dependency, so it changes the manifest or the lockfile.

**Approval.** The user OKs each install: the exact command and the step it belongs to, asked at Start (mid-run: Unplanned need, below), recorded on the User decisions line. Say when asking that the OK covers four runs for each round of that step (a step whose round is closed or reverted gets a new round) and nothing else: the restore command that fills the round's own dependency folder, the approved command in the round, the restore command in the main workspace after the merge, and the restore command again if the merge is reverted. A restore that a restart cut short runs once more; say that too. No other install runs anywhere, and an OK for one step never carries to another.

**Unplanned need.** An executor reports that its step needs an install the user did not approve → it installed nothing. Write `needs install <command>, asked` on the block's Worker line, then ask the user, w/ the exact command; after a restart, ask again. Either answer closes the round, since its frozen Write scope and audit section lack the manifest + lockfile and its dependency folder is a link. Before closing, run Scope check + commit on what the executor left, no Gate: a worktree w/ uncommitted work cannot be removed. Its branch stays unmerged.

- OK → record it. Phase `closed (needs install)`. Step back to Remaining, marked as a dependency step w/ the approved command; its next round is a dependency round.
- No → Phase `closed (install declined)`. Step back to Remaining, to be planned w/o that dependency. Not possible w/o it → the user decides: a contract amendment, or the run reports the step unfinished.

**An installer ran unapproved.** At Scope check: a recorded link is no longer a link (`fs.lstatSync`), or the linked folder now holds fewer entries than the Links line recorded at Branch (`ls -A <folder> | wc -l`), or the executor reports that it ran one → an installer ran over the link. The count is checked even when the link survived: an installer that fails halfway may leave the link in place and the shared folder emptied (not reproduced). Commit what is inside Write scope (paths outside it → the Scope check question), close the round, its branch never merges, and tell the user: `npm ci` over a linked folder emptied the main workspace's folder, and `npm install <pkg>` replaced the link w/ a real folder (both reproduced, npm 11). Plan and dispatch nothing until the main workspace's folder is whole again: run the restore command there only on the user's OK, or let the user restore it; then plan the step again. The real folder now at the link's path goes the way of an own dependency folder (Cleanup, below) before Worktree cleanup step 3.

**Plan.** Block gets `Install: <approved command>; restore: <restore command>; main workspace: not yet`. Write scope includes the manifest + lockfile. A dependency round runs alone: plan it only when every other block is `merged` or `closed`, as the only round of its batch, and plan no other round until its own block is `merged` w/ `main workspace: installed`, or `closed`. Other rounds' worktrees link the main workspace's dependency folder, and the restore after the merge rewrites that folder under them.

**Branch.** No link. Write `own dependency folder: <path>` on the Links line, then run the restore command in the round worktree, output to a file. Exit code not 0 → the round cannot start: tell the user, and never fall back to a link. That folder must be gitignored; not ignored → add it to the file `git rev-parse --git-path info/exclude` names first.

**Execute.** Brief names the one approved command in place of "no installs". Every other install stays forbidden.

**Merge.** After `git merge --no-ff`, before the merged done-check: block says `main workspace: not yet` → run the restore command in the main workspace, then set `main workspace: installed`; it already says `installed` → do not run it again. Exit code not 0 → stop and tell the user; the merged check has not run, so revert nothing on its account. Skipped → correct code fails the merged check for a missing dependency and gets reverted (reproduced). Then Clean tree + done-check as usual. Mismatch → `git revert -m 1 <Round SHA>`, then the restore command in the main workspace again, set `main workspace: restored after revert`: the reverted lockfile no longer names the dependency, but it stays installed until restored (reproduced).

**Cleanup.** Before Worktree cleanup step 3, remove the round's own dependency folder: `fs.lstatSync` must say directory and not symbolic link, then `fs.rmSync(<path>, { recursive: true })`, which removes links inside it w/o following them. Package managers put links inside that folder, and `git worktree remove` deletes through those too (reproduced: a junction inside an ignored dependency folder, its target emptied, no `--force`). Not a real directory → leave it and show the user.

**Resume.** `own dependency folder` on the Links line and no executor dispatched yet → run the restore command in the round worktree again. Merge found, no revert → go on from Merge step 3, which runs the restore only while the block says `not yet`. Revert found and the block does not say `restored after revert` → run it there now.

## Contract amendment

**Gate.** The contract changes only on the user's explicit OK, given in this session, to the exact change: old text, new text, and the audit runs it costs. A request relayed by another session or agent is not that OK. The Manager never proposes an amendment to get a failing round or section through; when the fix-planning subagent reports that a finding needs one, write an Amendments line marked `proposed` w/ the finding reference, show the user its proposed text w/ its reasons and the cost, and wait; after a restart, ask again. The user says no → mark it `declined`; the user names another fix, or the run ends w/ the Completion report. Never plan a fix round for that finding meanwhile.

**Affected**, read off files, not judged: a round is affected when its audit section names an acceptance check whose text the amendment changes or removes, or when the amendment changes its step's text. A changed Goal affects every round. A new acceptance check affects no existing round: it gets new steps. A changed step's round is affected whether merged or not. An amendment that drops a step already merged says whether its code stays (the round keeps its section, audited as written) or goes (a new step removes it); it does not say → ask.

**Cost, told before the OK.** Affected rounds of the current section that already have a Sol verdict are audited again: at most their count / 3 rounded up in extra Sol runs. New and changed steps add rounds, which raises the expected minimum the usual way. The user's OK to the amendment w/ these counts is the OK for those runs.

**Apply**, in order. After a restart redo it from step 1; every step is safe to repeat.

1. Amendments line (a new one, or the `proposed` one), marked `applying`: `v<n+1>`, the user's instruction quoted, old → new text per changed check or step, affected rounds, extra runs. While any line says `applying`: no Plan, dispatch, merge or audit launch.
2. Wait for every audit run still out and collect it. Version still names the old one until step 7, so those reports are accepted under it.
3. Contract block → current text (Goal, Acceptance, Sections). Remaining gets the new steps and the changed steps not yet merged, as named cases; a changed step that is already merged gets its new wording in step 5, not a second round. A dropped step leaves Remaining, started or not. The Amendments line keeps the old text. An open-ended new check → bound it w/ the user as at Start.
4. Affected rounds not yet merged → stop the executor (not established that it stopped → wait), run Scope check + commit on what it left, no Gate, so the worktree can be removed; Phase `closed (amended v<n+1>)`, branch stays unmerged, step back to Remaining in its new wording; a dropped step does not go back. Unaffected rounds go on unchanged.
5. Affected merged rounds of the current section → first set the block's Step line and the Provisional line to the step's new wording (old wording to the Audit log); then a new audit section from the amended contract + block, in a new file `evidence/round-<N>/section-v<n+1>.md`; a frozen file is never edited. Block's Audit section line → new path + sha256, old one to the Audit log. Its Sol verdict, pass or fail, is void: Audit log `void by v<n+1>`, Provisional line back to `Sol: none yet`, and it joins the next Sol group. Fix steps planned from a voided fail and not yet started leave Remaining (their finding judged the old contract); fix rounds already merged stay, rounds like any other. Unaffected rounds keep section + verdict. Three or more rounds now w/o a verdict → Sol checkpoints as after a merge, once step 7 is done.
6. A section already verified, shipped or not, is never reopened: its audits judged a head that later rounds have moved past. What the amendment changes there becomes new steps in the current or a later section, the changed acceptance check moves to that section's list on the Sections line, and each Verified progress line the change touches gets `superseded by v<n+1>`. Those steps' rounds are audited like any other, against the amended check.
7. Version → `v<n+1>`, Codex runs line → new expected minimum, Amendments line → `applied`. Back to the Round loop.

**Version in audits.** Every Audit runs line and every prompt carries the version current at launch. Accept needs it to equal the state file's Version when the run is collected. Not equal → the report is turned away, which is not a failed run: never rerun that prompt; build a new one from the rounds' current sections in a new run dir. A voided verdict counts as neither pass nor fail under Stagnation.

## Check-only repair

For a round Sol marked `blocked` whose code is right and whose done-check is wrong. That call belongs to the fix-planning subagent, after it read the report and the code; the Manager never makes it. It returns, 6 lines or fewer: the finding reference (`<report path>#<round>.<n>`) and what the check must observe instead, as the step's named cases. It finds the code wrong too → a normal fix step, no repair.

1. Save the subagent's lines to `evidence/round-<N>/repair-<k>-plan.md`. Then block: `Repair <k>: started; finding <reference>; plan <path>; worktrees <path>, <path>`, before anything else.
2. New check file `evidence/round-<N>/repair-<k>-check.<ext>`, written from the step's cases + the plan file; the frozen check is never edited. Add `check <path> sha256 <hash>` to the Repair line: that hash is the one to recompute before each run of this check.
3. `git worktree add --detach <path> <Round SHA>` and `git worktree add --detach <path> "<Round SHA>^1"`, both outside the repo folder. Link the same dependencies from the main workspace into both, each link written on the Links line before it is made. Unlinked, the check fails in both because its runner cannot start, which proves nothing (reproduced).
   - This round is a dependency round, or a later block has an `Install` line → the main workspace's folder matches neither commit, so no links: each worktree gets its own dependency folder from the restore command, only on the user's OK (Dependency round: Branch, Cleanup). No OK → the round stays `blocked` and the user decides what happens to it.
4. Run the new check in each, w/ Clean tree → `evidence/round-<N>/repair-<k>-round.log` and `repair-<k>-parent.log`. The original `done-check.log` stays as it is: the first Sol report cites it. Required: at the Round SHA, exit code + expected line match; at the first parent it fails, and because the step's outcome is missing, not because the command cannot start.
5. Remove both worktrees per Worktree cleanup, whether the repair held or not.
6. Both held → new audit section `evidence/round-<N>/section-repair-<k>.md` from contract + block: same step, the new check as its Done-check, the finding reference from the Repair line, the `Check replaced` line filled. Then, in this order: Provisional line → `Sol: none yet`; block's Done-check line → new check + sha256, Audit section line → new path + sha256, `Done-check log` → the repair round log (old values to the Audit log); `Repair <k>: held` last. The round rejoins the next Sol group, and that verdict passing closes it.
7. Either run missed → `Repair <k>: failed`, Audit log. It counts toward the Stagnation limit for that step. Below the limit → the subagent gets the plan + both log paths and returns another check (repair `<k+1>`) or a fix step.

**Resume**, by the last Repair line:

- `started`: plan file missing → run the fix-planning subagent again. Else remove its worktrees per Worktree cleanup if they exist, then redo from step 2. Nothing cites an unfinished repair's logs, so they may be overwritten.
- `failed`, and no fix step cites that finding → step 7's subagent now.
- `held` → the round waits for its Sol group like any merged round. A fail from that later run is a new report, planned as usual.

## Section shipped as its own PR

For a section the contract marks `ships: own PR`, once it is verified. The last section needs none of this: Completion.

The PR carries everything on the task branch since its Task base, so every section verified there since the last shipped one ships w/ it. Say so at Start when a section marked `with the task` comes before one marked `own PR`, and name them all on the Shipped line.

A squash merge leaves the task branch's commits out of the default branch, so a later section built on the old branch puts the shipped section's commits into the next PR (reproduced). So each later section runs on a new task branch.

1. Finish Worktree cleanup for the section's rounds. Commit, push and PR follow repo rules, as do the reviews that PR needs; look for an existing PR of the branch first, merged ones included (`gh pr list --head <task branch> --state all`). This skill authorizes none of them: neither repo rules nor the user allow it → ask the user.
2. `Waiting: merge of <PR URL>, next branch <name per repo rules>`. Plan no step of the next section. Tell the user the run waits on that merge. Never merge the PR unless repo rules or the user say so.
3. Each time the run resumes: `gh pr view <PR URL> --json state,mergeCommit`. `OPEN` → still waiting. `CLOSED` → ask the user. `MERGED` → step 4.
4. In the main workspace, w/ Clean tree: `git fetch origin <default branch>`; `git merge-base --is-ancestor <mergeCommit oid> origin/<default branch>` must succeed (it fails → fetch once more, then ask the user); then `git switch --no-track -c <next branch> origin/<default branch>`. `--no-track`: without it the new branch tracks the default branch (reproduced). The branch already exists → it is this handoff's (a restart after this step) only when it holds the merge commit and nothing the default branch lacks: `git merge-base --is-ancestor <mergeCommit oid> <next branch>` and `git merge-base --is-ancestor <next branch> origin/<default branch>` both succeed → `git switch <next branch>` and go on. Else it is someone's other work: take another name, write it on the Waiting line, and cut that.
5. Lockfile differs between the old branch and the new base (`git diff --quiet <old task branch> HEAD -- <lockfile>` exits 1) → the default branch moved the dependencies: show the user, and run the restore command in the main workspace on their OK, or let them restore it themselves. Then record `dependencies match <new base SHA>` on the User decisions line; this step is skipped once that is recorded. Neither → wait here: every check would run against dependencies the new base does not name.
6. State, last, so a restart before it redoes steps 3 to 5: `Shipped` line ← the sections the PR carried, old branch, audited head, PR, merge commit. Task branch ← the new one, Task base ← `git rev-parse HEAD`, the next section's base ← the same SHA, `Waiting: nothing`. The old branch stays: deleting it needs the user's OK.

The last section's Astra run covers `<Task base>..HEAD` w/ the Task base of the current branch, never the first branch's base: that diff would hold the squash commit and other people's commits (reproduced). Its prompt names the shipped sections on the `Shipped before the base commit` line.

Commits a shipped PR took after its audited head (review fixes) are not this run's audited work: list them at Completion.
