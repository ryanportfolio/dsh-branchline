# Safe Session Deletion Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mark archived sessions whose managed worktrees are proven safe to remove because their exact committed work is preserved on the freshly fetched default branch, and re-run the same proof before deletion.

**Architecture:** Branchline owns Git and GitHub proof: a clean worktree is safe when its exact HEAD is already an ancestor of the fetched default branch, or when GitHub reports a merged PR for that exact HEAD and the PR merge commit is an ancestor of the fetched default branch. `dsh-session-delete` combines that proof with runtime and shared-worktree checks, exposes batch status for archived rows, and requires a fresh safe proof inside guarded purge unless the user explicitly chooses the existing force path. `dsh-session-extras` renders compact status badges and explanations beside archived session titles.

**Tech Stack:** TypeScript, Git CLI, GitHub CLI, permanent DSH host/client bundles, React 18, Vitest, Testing Library.

---

### Task 1: Prove worktree preservation in Branchline

**Files:**
- Modify: `src/types.ts`
- Modify: `src/git.ts`
- Modify: `src/github.ts`
- Modify: `src/index.ts`
- Modify: `src/manager.ts`
- Test: `tests/git.spec.ts`
- Test: `tests/github.spec.ts`
- Test: `tests/manager.spec.ts`

- [ ] **Step 1: Write failing Git and GitHub proof tests**

Add tests asserting `GitClient.isAncestor(repository, ancestor, descendant)` maps exit codes `0` and `1` to booleans, and `GitHubClient.findMergedPullRequest(repository, branch, headCommit)` accepts only a merged PR whose `headRefOid` exactly equals the worktree HEAD.

- [ ] **Step 2: Run proof tests and confirm failure**

Run: `node_modules/.bin/vitest run tests/git.spec.ts tests/github.spec.ts`

Expected: FAIL because both proof methods are absent.

- [ ] **Step 3: Add public preservation types and proof methods**

Add `MergedPullRequestView`, `WorktreePreservationStatus`, and `WorktreePreservation` types. Add `GitClient.isAncestor()`. Add a bounded, argument-array-only `gh pr list --state merged --head <branch> --json number,url,mergedAt,mergeCommit,headRefOid` query that runs in the repository checkout and returns only an exact-HEAD match.

- [ ] **Step 4: Write failing manager safety tests**

Cover: dirty worktree is unsafe without network; exact HEAD already on fetched main is safe; squash-merged exact HEAD is safe only when its PR merge commit is on fetched main; GitHub/fetch uncertainty is `unknown`; a newer post-merge HEAD is unsafe.

- [ ] **Step 5: Implement manager assessment and guarded purge**

Expose `assessPreservation(id)` on `WorktreeStudioManager`. Add `PurgeOptions.requirePreserved`; when true, `purge()` recomputes worktree status plus remote/GitHub proof immediately before setting the purge marker and refuses every result except `safe`.

- [ ] **Step 6: Run core tests**

Run: `node_modules/.bin/vitest run tests/git.spec.ts tests/github.spec.ts tests/manager.spec.ts`

Expected: PASS.

### Task 2: Make deletion readiness explicit and enforce it

**Files:**
- Modify: `packages/dsh-session-delete/lib/index.js`
- Modify: `packages/dsh-session-delete/package.json`
- Test: `tests/session-delete.spec.ts`

- [ ] **Step 1: Write failing host tests**

Add cases for `safe`, `unsafe`, `unknown`, `no-worktree`, `running`, and `shared` readiness. Assert normal deletion calls `purge(taskId, { requirePreserved: true })`; unsafe/unknown states block normal deletion; explicit force remains available except for running/shared sessions.

- [ ] **Step 2: Add batch readiness API and preview fields**

Add `op: "readiness"` accepting at most 200 canonical session IDs. Return one compact result per ID. Preview must include:

```js
readiness: {
  status: "safe" | "unsafe" | "unknown" | "no-worktree" | "running" | "shared",
  label: string,
  detail: string,
  checkedAt: string,
}
```

Attached worktrees also expose the underlying preservation proof and derive blockers from that proof rather than the old immutable-base `commitsAhead` count.

- [ ] **Step 3: Require proof during normal purge**

Call `purge(taskId, { requirePreserved: force !== true })`. Keep force deletion visibly exceptional; never permit force while another session uses the same worktree or while the session runs.

- [ ] **Step 4: Run host tests**

Run: `node_modules/.bin/vitest run tests/session-delete.spec.ts`

Expected: PASS.

### Task 3: Show status beside archived session names and in confirmation

**Files:**
- Modify: `packages/dsh-session-extras/lib/client.cjs`
- Modify: `packages/dsh-session-extras/package.json`
- Modify: `packages/dsh-session-delete/lib/client.cjs`
- Test: `tests/session-extras.spec.tsx`
- Test: `tests/session-delete-client.spec.tsx`

- [ ] **Step 1: Write failing client tests**

Assert archived rows request statuses in one batch and render accessible badges: `✓ Safe to delete`, `! Work not preserved`, `? Could not verify`, `— No worktree`, and `● Running`. Assert the delete dialog displays the fresh proof and uses `Delete safely` only for green worktrees.

- [ ] **Step 2: Load batch status with archived sessions**

After `archived-list`, POST one `readiness` request containing all returned IDs. Merge results by session ID. A status request failure must render gray unknown badges, not green.

- [ ] **Step 3: Render accessible compact badges**

Put badge immediately before title. Use symbol plus color, `aria-label`, and a tooltip containing the concrete reason and check time; never rely on color alone.

- [ ] **Step 4: Render the same proof in deletion dialog**

Show a green preservation panel only for `safe`; show yellow/gray explanations otherwise. Keep `Delete anyway` for explicit force, and re-fetch preview before deleting.

- [ ] **Step 5: Run client tests**

Run: `node_modules/.bin/vitest run tests/session-extras.spec.tsx tests/session-delete-client.spec.tsx`

Expected: PASS.

### Task 4: Verify permanent bundle and generated artifacts

**Files:**
- Modify: `CHANGELOG.md`
- Regenerate: `README.md`
- Regenerate: `assets/readme/facts.json`
- Regenerate: `assets/readme/masthead-*.svg`

- [ ] **Step 1: Run syntax, type, and full test gates**

Run: `node --check packages/dsh-session-delete/lib/index.js`

Run: `node --check packages/dsh-session-delete/lib/client.cjs`

Run: `node --check packages/dsh-session-extras/lib/client.cjs`

Run: `node_modules/.bin/tsc -p tsconfig.json --noEmit`

Run: `node_modules/.bin/vitest run`

Expected: all pass.

- [ ] **Step 2: Verify permanent profile resolution**

Resolve both companion packages through `C:/Users/Home/.dsh/profiles/web`, import both host bundles by `file://` URL, and confirm their permanent bundle IDs still match their `cordis.patch.yml` rows.

- [ ] **Step 3: Regenerate README facts**

Run: `node scripts/readme/build.mjs`

Expected: README test count and SVG facts match the full suite.

- [ ] **Step 4: Review scope**

Run: `rtk git diff --check`

Run: `rtk git status`

Expected: only preservation proof, deletion readiness, archived badge UI, tests, changelog, plan, and generated README facts changed. Do not commit, push, or merge until the user explicitly requests shipping.
