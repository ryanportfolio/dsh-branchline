# OpenRouter Model Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a permanent, portable OpenRouter metadata plugin and a model picker that defaults to models with at least 256,000 context tokens without hiding or pricing other providers incorrectly.

**Architecture:** Version `dsh-openrouter-sync` as a Branchline workspace companion package. Its metadata endpoint serves validated cached pricing plus context windows from cached or configured OpenRouter models and never performs network I/O. `dsh-session-extras` fetches metadata when the model pane opens, validates the response, and applies it only to the OpenRouter provider.

**Tech Stack:** DSH Cordis host/client bundles, JavaScript, React 18, Vitest, Testing Library, PowerShell 5.1.

---

### Task 1: Version and harden the metadata producer

**Files:**
- Create: `packages/dsh-openrouter-sync/package.json`
- Create: `packages/dsh-openrouter-sync/cordis.patch.yml`
- Create: `packages/dsh-openrouter-sync/lib/index.js`
- Create: `packages/dsh-openrouter-sync/lib/client.cjs`
- Test: `tests/openrouter-sync.spec.ts`

- [ ] **Step 1: Write failing host tests**

Cover per-million pricing conversion, positive integer contexts, configured-model context fallback, malformed cached rows, and a cache-only `GET ?op=costs` whose test fetch spy remains unused.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `pnpm exec vitest run tests/openrouter-sync.spec.ts`
Expected: FAIL because the in-repository package does not exist.

- [ ] **Step 3: Add the permanent package and cache-only endpoint**

Copy the existing permanent package into `packages/dsh-openrouter-sync`. Normalize cached rows with finite, nonnegative costs and positive integer contexts. Fill missing contexts from `llm-pi-ai.providers.openrouter.models`. Return cached metadata without calling OpenRouter; only automatic or explicit refresh paths may use the network.

- [ ] **Step 4: Run the focused host tests**

Run: `pnpm exec vitest run tests/openrouter-sync.spec.ts`
Expected: PASS.

### Task 2: Correct and harden model-picker behavior

**Files:**
- Modify: `packages/dsh-session-extras/lib/client.cjs`
- Test: `tests/session-extras.spec.tsx`

- [ ] **Step 1: Write failing client tests**

Load the permanent client bundle through a fake module loader and capture the model-picker slot. Verify the default threshold shows 256,000-token OpenRouter models, hides 255,999-token models, never filters or prices another provider with a colliding model id, suppresses malformed costs, and retries metadata whenever the model pane is re-entered.

- [ ] **Step 2: Run the focused client test and confirm failure**

Run: `pnpm exec vitest run tests/session-extras.spec.tsx`
Expected: FAIL against binary thresholds, provider-agnostic lookups, and one-shot loading.

- [ ] **Step 3: Implement minimal client corrections**

Use decimal thresholds `128000`, `256000`, `512000`, and `1000000`, retaining `256000` as the default. Validate nested metadata rows, fetch on model-pane entry, show filters only with usable context metadata, and scope costs/filtering to `group.id === "openrouter"`.

- [ ] **Step 4: Run focused client tests**

Run: `pnpm exec vitest run tests/session-extras.spec.tsx`
Expected: PASS.

### Task 3: Integrate package, docs, and smoke verification

**Files:**
- Modify: `scripts/verify-companion-plugins.mjs`
- Modify: `package.json`
- Modify: `packages/dsh-session-extras/package.json`
- Modify: `setup.ps1`
- Modify: `docs/usage.md`
- Modify: `CHANGELOG.md`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Register every companion package in smoke verification and setup**

Discover `packages/dsh-*` manifests in the verifier, include workspace companions in the published package, and have setup link the root plus each companion into the Web profile. Keep PowerShell 5.1 syntax and ASCII-only launcher/setup text.

- [ ] **Step 2: Refresh workspace lockfile without changing dependency versions**

Run: `pnpm install --lockfile-only --offline`
Expected: a `packages/dsh-openrouter-sync` importer and no downloaded packages.

- [ ] **Step 3: Document behavior**

Describe the 256k default, OpenRouter-only prices, cached metadata behavior, manual refresh path, and permanent companion installation in usage docs and Unreleased changelog.

### Task 4: Verify and ship

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run focused and repository gates**

Run: `node scripts/verify-companion-plugins.mjs`, `pnpm run typecheck`, `pnpm test`, `pnpm run build`, `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-dsh.ps1 -SelfTest`, and `pwsh.exe -NoProfile -File .\start-dsh.ps1 -SelfTest`.
Expected: all commands exit 0.

- [ ] **Step 2: Commit and push explicit paths**

Commit only this plan, the metadata packages, tests, setup/verifier integration, lockfile, and documentation on `codex/openrouter-model-metadata`; push with upstream tracking.

- [ ] **Step 3: Open and merge the PR**

Create a PR targeting `main`, confirm checks and mergeability, then squash-merge without deleting the session branch.
