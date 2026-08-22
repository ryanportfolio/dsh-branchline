# Usage

## Setup

```powershell
git clone https://github.com/ryanportfolio/dsh-branchline.git
cd dsh-branchline
.\setup.ps1
```

Setup installs dependencies, builds the plugin, and links this checkout into the DSH Web profile. Re-run it after pulling plugin updates.

Start with `Start-Branchline.cmd`, or run:

```powershell
.\start-dsh.ps1 -Workspace C:\path\to\repo
```

The launcher remembers its last repository under `%LOCALAPPDATA%\DSH Branchline`. Set `DSH_REPO_ROOT` or pass `-RepositoryRoot` to add discovery roots. Browse works without either.

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

See [architecture.md](architecture.md) for mutation tokens, process isolation, Web request trust, and recovery rules.

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
