---
description: Use when adding or creating any DSH (DeepSeek Harness) plugin, panel, tool, or UI feature. Author plugins the permanent profile-bundle way, never the temporary dynamic way (cordis_define/cordis_run), which dies on restart.
---

# DSH Plugin — Permanent Authoring

Every DSH plugin must be permanent by default. The temporary dynamic mechanism (`cordis_define` → `cordis_run`) lives only in process memory: a DSH restart (start-dsh.ps1) wipes all definitions, packages, grants, and runs. Use it only for a throwaway experiment inside one session; never for anything the user expects to keep.

Permanent plugins are packages under `packages/<name>/` in this repo, linked into the web profile individually — see `packages/dsh-session-extras` and `packages/dsh-openrouter-sync` for installed examples.

## Step 1: Scaffold the package

Create `packages/<name>/` with:

- **`package.json`** — `type: module`, `main: lib/index.js`, `exports` for `.` (host), `./client` → `lib/client.cjs`, `./package.json`, `./cordis.patch.yml`; plus `dsh.bundle.patch` → `./cordis.patch.yml`, and `dsh.client` with `platform: "web"` and an `inject` list of the `@deepseek-ai/dsh-client-*` packages the bundle depends on.
- **`cordis.patch.yml`** — one insert row: `- insert: [- id: <name>, name: "<name>"]`. The row id MUST equal the client bundle id.
- **`lib/index.js`** — the host plugin, plain ESM named exports: `export const name`, `export const inject`, `export function apply(ctx)`. No `harness`. Client↔host calls go over an HTTP route: `ctx.webServer.register({ kind: "exact", path: "/api/<name>", handler })`, registered inside `ctx.inject(["webServer"], ...)`, guarded by the loopback-same-origin check (copy it from `packages/dsh-session-extras/lib/index.js`).
- **`lib/client.cjs`** — the browser bundle in the exact shipped format: `window.__ModuleLoader__.load({ id: "<name>", factory: (require) => { ... } })`. Inside the factory: `const react = require("react")`, export the plugin via `exports.apply` / `exports.inject`, and `return module.exports`. No `host.call`, no `styles`, no bare `React` builtin. Talk to the host with `fetch("/api/<name>", ...)` and inject CSS manually (create a `<style>` tag with `data-plugin-css`). Client services come from `inject: ["slots", "sessions", "conversation", "modelDirectories", ...]`.

## Step 2: Wire the profile

Edit `C:\Users\Home\.dsh\profiles\web\package.json`:

- Add `"<name>": "link:C:/Users/Home/CoreWise/dsh-branchline/packages/<name>"` under `dependencies`.
- Add `"<name>"` to the `dsh.profile.bundles` array.

Create the node_modules link (the loader resolves rows through it):

```powershell
New-Item -ItemType Junction -Path "$env:USERPROFILE\.dsh\profiles\web\node_modules\<name>" -Target "C:\Users\Home\CoreWise\dsh-branchline\packages\<name>"
```

## Step 3: Verify before restart

- `node --check` on `lib/client.cjs`.
- Import the host: `node -e "import('file:///C:/Users/Home/CoreWise/dsh-branchline/packages/<name>/lib/index.js').then(m => console.log(m.name, m.inject))"` — note the `file://` URL; a raw Windows path fails.
- Resolve from the profile: `node -e "console.log(require.resolve('<name>', { paths: ['C:/Users/Home/.dsh/profiles/web'] }))"`.

## Step 4: Ship the plugin

A completed plugin is shipped, not left in the working tree. The user asks for the plugin; the PR is part of completing it and needs no separate request. Ship once Step 3 passes and **before** restarting: the restart ends the authoring session, so the PR cannot wait for runtime confirmation — if the post-restart check fails, fix forward with a second PR.

- Ship to this repo — `ryanportfolio/dsh-branchline`, checkout `C:\Users\Home\CoreWise\dsh-branchline` — never to fullbuild.ai, even when the authoring session's working directory is another repo or worktree. Branch, commit, and PR from the dsh-branchline checkout.
- Branch `feat/<name>` from `main` and stage only the package's files. The machine-local wiring (profile `package.json` rows, the node_modules junction) never enters the commit.
- Check for an existing open PR for the branch before opening a new one.
- Match the repo's commit-message convention, ending with its `Co-authored-by:` trailer.
- Wait for CI to go green, squash-merge (the default), then sync local `main`.
- Done when: the PR is merged, local `main` matches `origin/main`, and the PR URL has been reported.

## Step 5: Restart and confirm

Changes load only on the next `start-dsh.ps1` run — there is no hot reload for profile bundles. After restart, test the feature; a boot failure shows in the console (bad bundle id or bad inject name).

## Anti-patterns

- Don't use `cordis_define`/`cordis_run` for anything permanent — it is process-local and gone on restart.
- Don't use `harness.handle` (host) or `host.call`/`styles`/bare `React` (client) in permanent code — those are dynamic-only builtins.
- Don't skip the node_modules junction — the row won't resolve.
- Don't let the row id and client bundle id diverge.
- Don't edit shipped deployment files (`config/agent-presets` under the install) — only the user profile and this repo's `packages/` sources.
- Don't expect edits to appear without a restart.
