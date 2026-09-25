# Usage

## Setup

```powershell
git clone https://github.com/ryanportfolio/dsh-branchline.git
cd dsh-branchline
.\setup.ps1
```

Setup installs dependencies, builds Branchline, and links the root plugin plus every permanent companion package under `packages/` into the DSH Web profile. Re-run it after pulling plugin updates.

Choose a known compatible DSH version before the first launch. This saves the selection without starting or stopping DSH:

```powershell
.\start-dsh.ps1 -SelectVersion 0.1.5-rc.2
```

Then start with `Start-Branchline.cmd`, or run:

```powershell
.\start-dsh.ps1 -Workspace C:\path\to\repo
```

The launcher remembers its last repository under `%LOCALAPPDATA%\DSH Branchline`. Set `DSH_REPO_ROOT` or pass `-RepositoryRoot` to add discovery roots. Browse works without either.

## Upgrading DSH

Click **Upgrade DSH**, then restart the launcher and press **Start**. The selected version is saved in `launcher-settings.json` under `%LOCALAPPDATA%\DSH Branchline` (or `DSH_LAUNCHER_HOME` when set), so upgrades leave the plugin checkout clean. An explicit `-Version` argument overrides the saved selection for that launch.

The launcher checks npm once per upgrade and prepares the settings file before stopping its DSH child process. Registry, validation, and preparation failures leave the running process and saved selection unchanged. Cancellation and an unchanged version also leave it running. After a successful selection, reopen the launcher to use it. A stop failure leaves the saved selection unchanged; a final disk failure may leave DSH stopped and requires checking the settings file before restarting.

If settings are missing or contain no valid saved version, startup stops with recovery instructions instead of choosing an older default. Run `-SelectVersion <known-compatible-version>` to save an explicit choice. For malformed or unreadable settings, restore a valid backup, fix file access, or move the settings file aside before selecting again. Keep that backup for any workspace or cache values you want to recover. `-Version` remains a one-launch override and never saves the version selection.

Choose a version compatible with your existing sessions. Selecting an older runtime does not migrate V3 session data and does not make downgrades safe.

Plugin synchronization compares dependency files across the full fetched fast-forward range, including changes before the final pulled commit.

## Model metadata

The permanent `dsh-openrouter-sync` and `dsh-session-extras` companions enhance the model picker with OpenRouter prices and minimum-context filters. The default **256k** filter keeps OpenRouter models with at least 256,000 context tokens; models from other providers are never hidden or priced using OpenRouter metadata.

Opening the model pane reads validated cached prices and context windows. That read never contacts OpenRouter and still gets context windows from the configured OpenRouter model list when the price cache is empty. Network refreshes happen only through the OpenRouter Sync settings page or its enabled daily refresh. Re-enter the model pane, or use **Retry**, to load newly refreshed metadata.

OpenRouter Sync also imports each model's advertised reasoning levels into the existing composer **Effort** menu, including the new-session composer. The first enabled refresh after this update backfills those levels even when the cached model list is recent. Automatic refresh opt-out remains respected.

The live route's recognized levels (minimal, low, medium, high, xhigh, and max) replace an existing effort map on refresh, so choices follow current route support. An optional `none` level appears as **Off** and sends `none`. Explicit `reasoningEfforts: false` remains an opt-out; missing or unusable metadata preserves the configured map or adapter fallback, and configured-only models remain unchanged. **Default** uses the existing DSH adapter behavior: in 0.1.1rc2, with no explicit effort or profile default, optional models offering **Off** send `none`, while mandatory-reasoning Muse omits the reasoning field.

## Fresh remote base

Leave **Base ref** empty. Branchline runs `git fetch origin --prune`, reads the branch advertised by `origin/HEAD`, resolves its remote-tracking commit, and records both the ref and commit.

An explicit base such as `origin/release` skips the fetch and resolves that local ref instead.

## Isolated checkout

Each task gets `dsh/<task>-<id>` under `$DSH_HOME/plugins/dsh-branchline/worktrees`. Creation does not switch, reset, stash, clean, or rewrite the selected checkout.

## Native DSH session

After creation, the client registers the worktree as a DSH Workspace and opens a Session there. Worktree state remains visible in the **Worktree tasks** board.

## Review-only finish

`allowDelivery` defaults to `false`. The client hides **Deliver**, and the Host rejects direct delivery calls. Commit and push the task branch, then use your normal pull-request flow.

**Archive** removes a clean linked worktree and retains its task record. **Discard** requires the exact task ID and can remove uncommitted task files.

### Safe session cleanup

Archived sessions show deletion-readiness beside their names. A green `✓` means the managed worktree is clean and its exact HEAD is proven on the freshly fetched remote default branch, either by commit ancestry or by an exact-head merged GitHub pull request whose merge commit is on that branch. `!` means repository work is not preserved, `?` means the proof could not be completed, `—` means no managed worktree is attached, and `●` means the session is running.

Normal deletion recomputes the proof inside the guarded purge immediately before removing the worktree and branch. Running or shared worktrees remain blocked; the explicit force path can bypass repository-preservation blockers. The safety claim covers tracked, untracked, and ignored local work. Known disposable ignored roots such as `node_modules` and build/cache folders are allowed. Other ignored paths, including `.env` files, block the green state because they may contain unique local data.

## Commands

```text
/branchline list
/branchline create <title>
/branchline inspect <id>
/branchline validate <id> <command...>
/branchline preview <id>
/branchline archive <id>
/branchline recover
```

## Configuration

| Field | Default | Purpose |
| --- | --- | --- |
| `managedRoot` | `$DSH_HOME/plugins/dsh-branchline/worktrees` | Plugin-created worktrees |
| `statePath` | `$DSH_HOME/plugins/dsh-branchline/tasks.json` | Atomic task state |
| `gitTimeoutMs` | `60000` | Git operation deadline |
| `validationTimeoutMs` | `600000` | Validation deadline |
| `requireValidation` | `true` | Bind delivery checks to validated content |
| `allowDelivery` | `false` | Enable guarded local merge delivery |
| `cloneRoot` | `~/CoreWise` | Directory that GitHub-sourced repositories clone into, one child per repository |
| `cloneTimeoutMs` | `600000` | Deadline for one `gh repo clone` operation |

GitHub sourcing requires the GitHub CLI (`gh`) on the Host `PATH` with an authenticated account; listing and cloning run through it, while all Git operations stay under the managed subprocess boundary.

See [architecture.md](architecture.md) for mutation tokens, process isolation, Web request trust, and recovery rules.

## Local DSH customizations

Three repo files capture machine-level DSH tweaks that live outside the plugin:

| File | Purpose |
| --- | --- |
| `scripts/dsh-core-overrides/apply-canonical-workspace-default.ps1` | Reapplies the canonical-workspace-default overrides to the DSH client runtime bundle in the npx cache: recency prefers canonical folders over worktree checkouts, and New Session does not anchor to a worktree session. Idempotent, verified with `node --check`. `-Root <node_modules\@deepseek-ai dir>` targets a scratch copy. |
| `scripts/dsh-core-overrides/apply-performance.ps1` | Patches the DSH bundles in the npx cache for memory and CPU. The patch table holds one set per dsh version; an install whose version has no set is skipped with a warning, and each patch also checks its own package version. **0.1.5-rc.2:** linear session list reconciliation, an off-stage session closing its history stream after 30 seconds (drafts, queue and pending sends stay), one abort promise per gateway stream read, and released input-queue and right-sidebar store subscriptions. **0.1.1-rc.2:** linear session list reconciliation; an off-stage session going cold after 30 seconds, so its live events are no longer assembled (pending approvals and questions, queue, drafts and scope stay; returning reloads it from history); the composer republishing only on queue changes and releasing its subscription; a lazy Trajectory snapshot; list views skipping content-equal session list updates; cheaper per-chunk assembly; running row sweeps animated with `transform` instead of `left`; a static running turn label and sidebar state dot. Each patch has its own `dsh-core-override: perf-<name>` marker; a file whose original text has changed is left untouched, and a hashed CSS asset that is absent is skipped with a warning. `-Root <dir>` targets a scratch copy instead of the npx cache. Tested by `scripts/test-dsh-perf-overrides.ps1 -Source <node_modules\@deepseek-ai dir>[;<dir>]`, one source per dsh version. |
| [settings-template.yaml](settings-template.yaml) | Reference template for `~/.dsh/settings.yaml`: shell deadlines, OpenRouter retry policy and timeouts, pinned and hand-defined models, default agent preset and model. |

Both override scripts patch upstream code in place. The launcher runs them before it starts DSH, after any running instance is closed; with `-KeepExisting` and a DSH instance still running, it skips them. Failures, and a package that npx has not extracted yet, only log a warning and never block the launch. To run a script by hand, stop DSH first; the next start loads the patched bundles.

## Launcher controls

| Action | Result |
| --- | --- |
| **Start** | Starts DSH for the selected repository |
| **Stop** | Stops the verified local DSH process |
| **Open browser** | Opens the current DSH Web page |
| Close, choose **Yes** | Stops DSH, then closes the launcher |
| Close, choose **No** | Leaves DSH running and closes the launcher |

Node may print an `ExperimentalWarning` for `stripTypeScriptTypes`. DSH 0.1.1 uses that Node API for its TypeScript code runtime. The warning is written to stderr and does not mean startup failed.

## Automatic command guard

The optional permanent `dsh-command-guard` host bundle rejects broad process termination before the shared shell executes any part of a command. This prevents an agent's `taskkill /F /IM node.exe` from stopping DSH along with a preview server. Once the bundle is installed in the Web profile, the guard runs automatically on `shell.run` and `shell.start`, including the regular PowerShell tool, RTK, and agent or nested code calls that use those services. It requires no model prompt or per-command approval.

The guard recognizes `taskkill`, `Stop-Process`, stock aliases `spps` and `kill`, `pkill`, `killall`, pipelines, literal PowerShell or cmd wrappers, RTK command wrappers, and visible PowerShell `.Kill()` calls. Image names, filters, computed targets, encoded shell bodies, and compound termination commands are rejected. Ordinary reads pass unchanged; suspicious input is parsed by a trusted PowerShell helper receiving JSON on stdin. The helper parses command text as data and never executes it.

To stop a preview, identify its PID from a fresh process listing and submit a standalone command such as `Stop-Process -Id 12345 -Force` or `taskkill /PID 12345 /F`, substituting the actual preview PID. Only one explicit numeric PID is accepted. A fresh read-only process snapshot must prove the target exists, has an identifiable command line, and is neither the DSH host, a host ancestor, nor another identifiable DSH runtime or launcher. `/T` also checks every descendant. Missing process metadata, failed inspection, or a missing host process blocks the command.

Windows may retain the PID of an exited login process in the host's ancestry. When an upper ancestor is missing, the guard accepts only targets whose current parent chain reaches the DSH host without gaps or cycles; this also applies to every target affected by `/T`. External and orphaned previews remain blocked in that case. A numeric PID alone does not guarantee permission. Use DSH's existing `job_kill` for a background job it owns; internal subprocess cleanup remains available.

This guard prevents common accidents. It is not an arbitrary-code sandbox: external scripts, custom aliases, indirect OS APIs, obfuscated code, persistent PTY executors, and calls that bypass `ctx.shell.run/start` are outside its coverage. PID reuse between inspection and execution is still an OS race. The bundle changes no Windows permissions, process protections, runtime files, or global shell commands. A wider sandbox request does not disable it.

Install `packages/dsh-command-guard` as a linked dependency and add `dsh-command-guard` to the Web profile's `dsh.profile.bundles`, following the existing host-only RTK bundle pattern. Restart DSH when no agent work is running. The supplied bundle has no client code or settings toggle. Optional bundle config `statusEndpoint: true` enables `GET /api/dsh-command-guard/status` for loopback same-origin diagnostics. Its response reports attachment of both methods and contains no commands, process details, or user data; it cannot execute commands or disable protection. Disposing the last plugin owner restores the original method descriptors.

## Development

```powershell
npx -y pnpm@11.7.0 install --frozen-lockfile
npx -y pnpm@11.7.0 run typecheck
npx -y pnpm@11.7.0 test
npx -y pnpm@11.7.0 run build
npm run readme:build
```
