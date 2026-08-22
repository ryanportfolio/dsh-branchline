# Public Worktree Studio Release Implementation Plan

> **For agentic workers:** Implement this plan task-by-task, in order. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a generic public fork of Worktree Studio that creates each DSH task from GitHub's current default-branch commit and ships a Windows launcher with no owner-specific paths.

**Architecture:** Keep the upstream DSH plugin and its safety model, then layer fresh-origin task creation, review-only delivery, and a generic Windows control panel on top. Generate the project README and every SVG from repository data so the front page stays accurate as the project changes.

**Tech Stack:** TypeScript 6, React 18, Vitest, Git worktrees, PowerShell 5.1/7, Node ESM README generators, GitHub Actions.

---

### Task 1: Prepare the public fork

**Files:**
- Preserve: `src/`, `tests/`, `cordis.patch.yml`, build configuration, licence, security policy
- Create: `docs/superpowers/plans/2026-08-22-public-release.md`
- Modify: `package.json`, `CHANGELOG.md`

- [ ] **Step 1: Start from upstream history**

Clone `Palaiologos1453/dsh-worktree-studio`, retain its MIT licence and upstream remote, and apply the tested fresh-origin changes as a new commit.

- [ ] **Step 2: Remove private identity and paths**

Run:

```powershell
rg -n -i --hidden -g '!node_modules/**' -g '!.git/**' 'owner-specific-root|private-project-name|@gmail|token=' .
```

Expected: no private path, email, or credential match. Test canaries and generic security terms may remain.

- [ ] **Step 3: Set public package metadata**

Use version `0.1.1-fresh.1`, repository `https://github.com/ryanportfolio/dsh-worktree-studio`, and description `Fresh GitHub worktrees for DeepSeek Harness, with a Windows launcher and review-only task board.`

- [ ] **Step 4: Verify inherited behaviour**

Run:

```powershell
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run build
pnpm run pack:check
```

Expected: 20 tests pass, typecheck passes, bundle builds, package dry-run passes.

### Task 2: Generalize the Windows launcher

**Files:**
- Create: `start-dsh.ps1`
- Create: `Start-DSH.cmd`
- Create: `setup.ps1`
- Test: `start-dsh.ps1 -SelfTest`

- [ ] **Step 1: Replace owner paths with discovery**

Discover repositories from `DSH_REPO_ROOT`, the current directory, and existing conventional folders under the user's home directory: `source`, `src`, `projects`, `repos`, and `Documents/GitHub`. Keep Browse available when discovery returns nothing.

- [ ] **Step 2: Store settings outside the checkout**

Use `%LOCALAPPDATA%\DSH Worktree Studio\launcher-settings.json`, falling back to `%USERPROFILE%\.dsh-worktree-studio\launcher-settings.json` only when `LOCALAPPDATA` is unavailable.

- [ ] **Step 3: Preserve safe process handling**

Keep DSH fingerprint checks before stopping a Node process. Keep asynchronous output handlers in compiled C# so Windows PowerShell worker threads never invoke PowerShell scriptblocks without a runspace.

- [ ] **Step 4: Add one-command local setup**

`setup.ps1` checks Node, Git, npm, and npx; runs `npm install`, `npm run build`, then installs the current checkout into the DSH Web profile with:

```powershell
npx -y "@deepseek-ai/dsh@0.1.1-rc.2" plugin --profile web add "link:<absolute-repository-path>"
```

- [ ] **Step 5: Test both PowerShell editions**

Run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-dsh.ps1 -SelfTest
pwsh.exe -NoProfile -File .\start-dsh.ps1 -SelfTest
```

Expected: async output, form creation, timer, selection, and close handlers pass in both.

### Task 3: Build the generated README

**Files:**
- Create: `scripts/readme/items.json`
- Create: `scripts/readme/panels.mjs`
- Create: `scripts/readme/cards.mjs`
- Create: `scripts/readme/readme.mjs`
- Create: `scripts/readme/build.mjs`
- Create: `assets/readme/*.svg`
- Create: `docs/usage.md`
- Generate: `README.md`

- [ ] **Step 1: Encode the design contract**

Put this contract beside the panel generator:

```text
Conceit: a Git switchyard routes origin/HEAD to isolated task sidings.
Orange marks the live remote commit and active route only.
Solid rails are verified Git paths; dashed rails are available task routes.
One monospace type system. No external requests, scripts, hover state, or opaque page background.
Every panel has wide light, wide dark, narrow light, and narrow dark variants.
Reduced motion restores the complete route and visible labels.
```

- [ ] **Step 2: Lock facts from source**

Compute test count from `tests/*.spec.ts*`, test-file count from the same directory, runtime dependency count from `package.json`, version from `package.json`, and workflow stages from `scripts/readme/items.json`.

- [ ] **Step 3: Generate two panels and four workflow cards**

Create a switchyard masthead plus a route panel. Generate cards for fresh remote base, isolated checkout, native DSH session, and review-only finish. Each asset gets four theme/width variants.

- [ ] **Step 4: Keep prose short**

README order: generated marker, masthead, one-sentence explanation, install command, reason for the fork, route panel, four workflow cards, five-step use section, verification facts, documentation links, licence and upstream credit. Move detailed commands and configuration to `docs/usage.md`.

- [ ] **Step 5: Verify the generated artifact**

Run:

```powershell
node scripts/readme/build.mjs
node scripts/readme/build.mjs
git diff --exit-code README.md assets/readme
```

Expected: second build produces no diff; every referenced asset exists; required install, usage, licence, and upstream links exist; each workflow item appears exactly once in the card grid.

### Task 4: Add CI and release metadata

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/pull_request_template.md`
- Create: `CONTRIBUTING.md`

- [ ] **Step 1: Gate README drift**

Add `npm run readme:build` followed by `git diff --exit-code README.md assets/readme` to Ubuntu CI.

- [ ] **Step 2: Keep code checks cross-platform**

Run typecheck, tests, bundle build, package dry-run, and launcher self-test on Windows. Run TypeScript and README checks on Ubuntu.

- [ ] **Step 3: Add contribution paths**

Bug reports request DSH version, Node version, Git version, operating system, reproduction, expected result, and redacted logs. Pull requests require tests and generated README checks when facts or assets change.

### Task 5: Review, publish, and verify GitHub

**Files:**
- Review: all tracked files
- Publish: `ryanportfolio/dsh-worktree-studio`

- [ ] **Step 1: Run secret and personal-data scan**

Run the path scan from Task 1 plus `git grep` for email addresses and common credential prefixes. Inspect every remaining hit.

- [ ] **Step 2: Render README specimens**

Render GitHub-flavoured Markdown at 880px light, 880px dark, and 390px narrow. Inspect SVG animation end state and reduced-motion state.

- [ ] **Step 3: Commit public history**

Create focused commits for plugin behaviour, generic launcher/setup, and generated README/metadata. Do not include build dependencies, state files, logs, or local settings.

- [ ] **Step 4: Create and push the public fork**

Create the public GitHub fork, set description to `Fresh GitHub worktrees for DeepSeek Harness, with a Windows launcher and review-only task board.`, and apply topics `deepseek-harness`, `dsh-plugin`, `git-worktree`, `windows`, `developer-tools`, and `ai-agents`.

- [ ] **Step 5: Verify the live repository**

Confirm visibility is public, default branch is `main`, README assets load in light and dark themes, install links resolve, CI starts, and the local branch matches the pushed commit.
