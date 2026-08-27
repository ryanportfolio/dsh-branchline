# Usage

## Setup

```powershell
git clone https://github.com/ryanportfolio/dsh-branchline.git
cd dsh-branchline
.\setup.ps1
```

Setup installs dependencies, builds Branchline, and links the root plugin plus every permanent companion package under `packages/` into the DSH Web profile. Re-run it after pulling plugin updates.

Start with `Start-Branchline.cmd`, or run:

```powershell
.\start-dsh.ps1 -Workspace C:\path\to\repo
```

The launcher remembers its last repository under `%LOCALAPPDATA%\DSH Branchline`. Set `DSH_REPO_ROOT` or pass `-RepositoryRoot` to add discovery roots. Browse works without either.

## Model metadata

The permanent `dsh-openrouter-sync` and `dsh-session-extras` companions enhance the model picker with OpenRouter prices and minimum-context filters. The default **256k** filter keeps OpenRouter models with at least 256,000 context tokens; models from other providers are never hidden or priced using OpenRouter metadata.

Opening the model pane reads validated cached prices and context windows. That read never contacts OpenRouter and still gets context windows from the configured OpenRouter model list when the price cache is empty. Network refreshes happen only through the OpenRouter Sync settings page or its enabled daily refresh. Re-enter the model pane, or use **Retry**, to load newly refreshed metadata.

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

Two repo files capture machine-level DSH tweaks that live outside the plugin:

| File | Purpose |
| --- | --- |
| `scripts/dsh-core-overrides/apply-canonical-workspace-default.ps1` | Reapplies the canonical-workspace-default overrides to the DSH client runtime bundle in the npx cache: recency prefers canonical folders over worktree checkouts, and New Session does not anchor to a worktree session. Rerun by hand after cache eviction or a `dsh` version change; idempotent, verified with `node --check`. |
| [settings-template.yaml](settings-template.yaml) | Reference template for `~/.dsh/settings.yaml`: shell deadlines, OpenRouter retry policy and timeouts, pinned and hand-defined models, default agent preset and model. |

The override script patches upstream runtime code in place and is never run by the launcher; applying it stays a manual step.

## Launcher controls

| Action | Result |
| --- | --- |
| **Start** | Starts DSH for the selected repository |
| **Stop** | Stops the verified local DSH process |
| **Open browser** | Opens the current DSH Web page |
| Close, choose **Yes** | Stops DSH, then closes the launcher |
| Close, choose **No** | Leaves DSH running and closes the launcher |

Node may print an `ExperimentalWarning` for `stripTypeScriptTypes`. DSH 0.1.1 uses that Node API for its TypeScript code runtime. The warning is written to stderr and does not mean startup failed.

## Development

```powershell
npx -y pnpm@11.7.0 install --frozen-lockfile
npx -y pnpm@11.7.0 run typecheck
npx -y pnpm@11.7.0 test
npx -y pnpm@11.7.0 run build
npm run readme:build
```
