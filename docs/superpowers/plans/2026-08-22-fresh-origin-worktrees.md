# Fresh Origin Worktrees Implementation Plan

> **For agentic workers:** Implement this plan task-by-task, in order. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every default DSH task fetch GitHub's default branch and create an isolated branch/worktree from that exact remote commit without changing the primary checkout.

**Architecture:** Extend Worktree Studio's managed Git client with a fresh-origin base resolver. Keep its durable task registry, native DSH Workspace/Session opening, Windows subprocess adapter, archive/discard safety, and explicit human delivery flow. Configure review-only delivery by default and make the Desktop launcher start DSH without checking out or syncing the selected primary repository.

**Tech Stack:** TypeScript 6, Node.js 24, Git 2.53, Vitest, React, DeepSeek Harness 0.1.0-rc.7, PowerShell 5.1/7.

---

## File map

- `src/git.ts`: fetch `origin`, discover its symbolic default branch, and return the fetched commit.
- `src/manager.ts`: use the fresh remote base when no explicit base ref is supplied; enforce review-only delivery policy.
- `src/types.ts`: expose the recorded base ref and delivery policy to clients.
- `src/store.ts`: read old task records and new optional `baseRef` records safely.
- `src/index.ts`: add `allowDelivery`, defaulting to `false`.
- `src/client/WorktreeStudio.tsx`: default the base field to fresh origin and suppress delivery when disabled.
- `src/client/locales.ts`: explain fresh-origin default and review-only behavior.
- `tests/git.spec.ts`: verify default-branch discovery and fetched commit selection.
- `tests/manager.spec.ts`: verify a dirty primary checkout stays unchanged and remote advancement becomes the next task base.
- `tests/client.spec.tsx`: verify the create request omits `baseRef` by default and review-only UI cannot deliver.
- `README.md`, `docs/architecture.md`, `CHANGELOG.md`: document fork behavior and rollback.
- `C:\Users\Home\Desktop\start-dsh.ps1`: pin compatible DSH and remove primary-checkout sync from Start.

### Task 1: Fresh remote base resolver

**Files:**
- Modify: `src/git.ts`
- Test: `tests/git.spec.ts`

- [ ] **Step 1: Write failing tests**

Create a bare `origin`, clone it, advance `main`, and assert:

```ts
const base = await client.fetchDefaultBase(repository)
expect(base.ref).toBe('refs/remotes/origin/main')
expect(base.commit).toBe(git(repository, ['rev-parse', 'origin/main']))
```

Also initialize an origin with `master` and verify symbolic HEAD discovery does not hard-code `main`.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `pnpm vitest run tests/git.spec.ts`

Expected: failure because `fetchDefaultBase` does not exist.

- [ ] **Step 3: Implement fetch and discovery**

Add:

```ts
export interface RemoteBase {
  readonly remote: string
  readonly branch: string
  readonly ref: string
  readonly commit: string
}

async fetchDefaultBase(repository: string, remote = 'origin'): Promise<RemoteBase> {
  await this.checked(repository, ['fetch', '--prune', remote])
  const symbolic = await this.raw(repository, [
    'symbolic-ref', '--quiet', '--short', `refs/remotes/${remote}/HEAD`,
  ])
  const ref = symbolic.exitCode === 0
    ? symbolic.stdout.trim()
    : await this.remoteHeadFromLsRemote(repository, remote)
  const prefix = `${remote}/`
  if (!ref.startsWith(prefix) || ref.length === prefix.length) {
    throw new StudioError('git-failure', `remote ${remote} did not report a default branch`)
  }
  return {
    remote,
    branch: ref.slice(prefix.length),
    ref: `refs/remotes/${ref}`,
    commit: await this.resolveCommit(repository, ref),
  }
}
```

The `ls-remote --symref <remote> HEAD` fallback must parse only `ref: refs/heads/<name>\tHEAD`, reject malformed output, and resolve the already-fetched tracking ref.

- [ ] **Step 4: Run focused tests**

Expected: both `main` and `master` fixtures pass.

### Task 2: Default task creation and persisted provenance

**Files:**
- Modify: `src/types.ts`
- Modify: `src/store.ts`
- Modify: `src/manager.ts`
- Test: `tests/manager.spec.ts`

- [ ] **Step 1: Add failing dirty-primary and remote-advance tests**

```ts
await writeFile(join(repository, 'README.md'), 'dirty primary\n')
const task = await manager.create({ repository, title: 'Fresh task' })
expect(task.baseRef).toBe('origin/main')
expect(readFileSync(join(repository, 'README.md'), 'utf8')).toBe('dirty primary\n')
expect(git(task.path, ['status', '--porcelain'])).toBe('')
```

Advance origin, create a second task, and require its `baseCommit` to equal the new `origin/main` commit.

- [ ] **Step 2: Run tests and confirm old HEAD behavior fails**

Run: `pnpm vitest run tests/manager.spec.ts`

- [ ] **Step 3: Implement default-base selection**

Use fresh origin only when `baseRef` is absent or blank:

```ts
const requestedBase = request.baseRef?.trim()
const freshBase = requestedBase === undefined || requestedBase === ''
  ? await this.git.fetchDefaultBase(identity.topLevel)
  : undefined
const baseRef = freshBase?.ref.replace(/^refs\/remotes\//u, '') ?? requestedBase as string
const baseCommit = freshBase?.commit ?? await this.git.resolveCommit(identity.topLevel, baseRef)
```

Persist optional `baseRef`. `store.ts` must keep old records valid when the field is missing.

- [ ] **Step 4: Run manager tests**

Expected: dirty primary remains dirty and unchanged; each task starts at freshly fetched remote HEAD.

### Task 3: Review-only delivery default

**Files:**
- Modify: `src/index.ts`
- Modify: `src/manager.ts`
- Modify: `src/types.ts`
- Modify: `src/client/WorktreeStudio.tsx`
- Modify: `src/client/locales.ts`
- Test: `tests/manager.spec.ts`
- Test: `tests/client.spec.tsx`

- [ ] **Step 1: Write failing policy tests**

Construct options with `allowDelivery: false`; require `deliver()` to throw `delivery-disabled`. Render a dashboard with `deliveryEnabled: false`; require no enabled Deliver control.

- [ ] **Step 2: Implement configuration and projection**

```ts
allowDelivery: schema.boolean().default(false)
```

Add `deliveryEnabled` to `DashboardView`. Before any delivery checks:

```ts
if (!this.options.allowDelivery) {
  throw new StudioError('delivery-disabled', 'local merge delivery is disabled; review and integrate the branch externally')
}
```

Keep preview/review available. Hide the Deliver action when disabled and show `Review only: branch remains intact`.

- [ ] **Step 3: Run manager and client tests**

Expected: Host rejects delivery and UI does not offer it by default.

### Task 4: Product copy and documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `CHANGELOG.md`
- Modify: `src/client/locales.ts`

- [ ] **Step 1: Replace HEAD-first instructions**

Document exact default flow:

```text
fetch origin --prune -> resolve origin/HEAD -> snapshot commit -> git worktree add -b dsh/<task>-<id> <managed-path> <commit>
```

- [ ] **Step 2: Document explicit-base escape hatch**

An entered `baseRef` bypasses default discovery. The empty field means fresh GitHub default branch.

- [ ] **Step 3: Document review-only delivery and rollback**

Rollback is uninstalling the local plugin and restoring the Desktop launcher backup. Existing worktrees and branches remain ordinary Git objects.

### Task 5: Build and adversarial tests

**Files:**
- Verify: all source and test files

- [ ] **Step 1: Install locked development dependencies**

Run: `pnpm install --frozen-lockfile`

- [ ] **Step 2: Run complete verification**

```text
pnpm run typecheck
pnpm test
pnpm run build
pnpm run pack:check
```

- [ ] **Step 3: Run real Git fixture**

Create disposable bare origin and dirty primary clone. Create a task through manager code. Verify task HEAD equals fetched origin default HEAD and primary status/hash are unchanged. Advance origin and repeat.

- [ ] **Step 4: Commit skipped**

No commit, push, PR, or merge was requested. Preserve upstream clone plus local diff for review.

### Task 6: Durable source and DSH installation

**Files:**
- Create: `C:\Users\Home\CoreWise\dsh-worktree-studio-corewise\`
- Modify: `C:\Users\Home\.dsh\profiles\web\package.json` through `dsh plugin`

- [ ] **Step 1: Copy verified source**

Copy the tested checkout to `C:\Users\Home\CoreWise\dsh-worktree-studio-corewise` without overwriting an existing directory.

- [ ] **Step 2: Install through official DSH plugin command**

```powershell
npx -y @deepseek-ai/dsh@0.1.0-rc.7 plugin --profile web add "link:C:/Users/Home/CoreWise/dsh-worktree-studio-corewise"
```

- [ ] **Step 3: Verify profile metadata**

Require both local plugin dependency and bundle entry to exist. Do not print credential files.

### Task 7: Launcher integration and live proof

**Files:**
- Modify: `C:\Users\Home\Desktop\start-dsh.ps1`
- Preserve: timestamped Desktop backup

- [ ] **Step 1: Patch launcher**

Pin `0.1.0-rc.7`. Remove `Sync to main` and `Sync before start` controls and calls. Start the selected repository exactly as-is.

- [ ] **Step 2: Run PowerShell parser and callback tests**

Run `-SelfTest` under Windows PowerShell 5.1 and PowerShell 7. Expected: timer, selection, and close callbacks pass.

- [ ] **Step 3: Start DSH and verify plugin load**

Open DSH Web, verify `/api/dsh-worktree-studio` responds from loopback same-origin client, and verify `Worktree tasks` appears.

- [ ] **Step 4: Create a disposable task from a dirty primary checkout**

Verify fetched remote default SHA equals task base SHA; task path is outside primary checkout; primary branch/status remain unchanged; DSH creates a native Workspace and Session at task path.

- [ ] **Step 5: Archive disposable task safely**

Archive only after verifying its checkout is clean. Confirm Git removes the linked worktree but leaves primary checkout unchanged.

## Self-review

- Spec coverage: fresh GitHub default base, Windows support, dirty-primary isolation, DSH Workspace/Session opening, review-only delivery, launcher separation, live proof, rollback.
- Placeholder scan: no unfinished implementation markers.
- Type consistency: `RemoteBase`, `baseRef`, `allowDelivery`, and `deliveryEnabled` flow from Git through manager, state, API, and UI.
