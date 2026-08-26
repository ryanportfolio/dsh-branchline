# Reapplies the canonical-workspace-default overrides to the DSH client runtime
# bundle in the npx cache. Two overrides:
#
#   1. recentWorkspace() prefers non-worktree folders, so recency defaults to
#      the canonical local folder instead of the last-used worktree.
#   2. startSession() no longer anchors New Session to the current session's
#      workspace when that workspace is a worktree checkout.
#
# The npx cache drops the edits on cache eviction or a dsh version change; run
# this script again after that happens. Idempotent: each patch is skipped when
# its marker is already present.

$ErrorActionPreference = 'Stop'

$marker = 'dsh-core-override: canonical-workspace-default'

$originalRecent = @'
		/** Stable tie-breaking follows Host Workspace order. */
		function recentWorkspace(workspaces, sessions) {
			let selected;
			let selectedTime = Number.NEGATIVE_INFINITY;
			for (const workspace of workspaces) {
				let latest = Number.NEGATIVE_INFINITY;
				for (const sessionId of workspace.sessionIds) {
					const session = sessions[sessionId];
					if (session !== void 0) latest = Math.max(latest, session.updatedAt);
				}
				if (latest === Number.NEGATIVE_INFINITY) latest = Date.parse(workspace.createdAt);
				if (selected === void 0 || latest > selectedTime) {
					selected = workspace.workspaceId;
					selectedTime = latest;
				}
			}
			return selected;
		}
'@

$replacementRecent = @'
		/** Whether a workspace path points at a git-worktree checkout (any `worktrees` segment) rather than a canonical local folder. */
		function isWorktreeCheckout(path) {
			return path.split(/[\\/]+/u).some((segment) => segment.toLowerCase() === "worktrees");
		}
		/** Stable tie-breaking follows Host Workspace order. Canonical folders win recency over worktree checkouts, so a New Session defaults to the local folder (Claude Code style); pure recency applies when only worktrees exist. [dsh-core-override: canonical-workspace-default] */
		function recentWorkspace(workspaces, sessions) {
			let selected;
			let selectedTime = Number.NEGATIVE_INFINITY;
			let worktree;
			let worktreeTime = Number.NEGATIVE_INFINITY;
			for (const workspace of workspaces) {
				let latest = Number.NEGATIVE_INFINITY;
				for (const sessionId of workspace.sessionIds) {
					const session = sessions[sessionId];
					if (session !== void 0) latest = Math.max(latest, session.updatedAt);
				}
				if (latest === Number.NEGATIVE_INFINITY) latest = Date.parse(workspace.createdAt);
				if (isWorktreeCheckout(workspace.path)) {
					if (worktree === void 0 || latest > worktreeTime) {
						worktree = workspace.workspaceId;
						worktreeTime = latest;
					}
					continue;
				}
				if (selected === void 0 || latest > selectedTime) {
					selected = workspace.workspaceId;
					selectedTime = latest;
				}
			}
			return selected ?? worktree;
		}
'@

$originalSession = @'
			startSession(workspaceId) {
				const workspace = this.list.getSnapshot();
				const current = this.sessions.list.getSnapshot().current;
				const currentWorkspaceId = current === void 0 ? void 0 : workspace.items.find((item) => item.sessionIds.includes(current))?.workspaceId;
				const target = workspaceId ?? currentWorkspaceId ?? workspace.recentWorkspaceId;
'@

$replacementSession = @'
			startSession(workspaceId) {
				const workspace = this.list.getSnapshot();
				const current = this.sessions.list.getSnapshot().current;
				const currentWorkspace = current === void 0 ? void 0 : workspace.items.find((item) => item.sessionIds.includes(current));
				// A worktree session does not anchor New Session: the default falls through to the most recent canonical folder (Claude Code style). [dsh-core-override: canonical-workspace-default]
				const currentWorkspaceId = currentWorkspace === void 0 || isWorktreeCheckout(currentWorkspace.path) ? void 0 : currentWorkspace.workspaceId;
				const target = workspaceId ?? currentWorkspaceId ?? workspace.recentWorkspaceId;
'@

$targets = Get-ChildItem "$env:LOCALAPPDATA\npm-cache\_npx" -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    Join-Path $_.FullName 'node_modules\@deepseek-ai\dsh-client-runtime\lib\client.js'
} | Where-Object { Test-Path $_ }

if (-not $targets) {
    Write-Warning 'No dsh-client-runtime lib/client.js found under the npx cache.'
    exit 1
}

foreach ($file in $targets) {
    $text = Get-Content $file -Raw
    $changed = $false

    if (-not $text.Contains($marker)) {
        if (-not $text.Contains($originalRecent)) {
            Write-Warning "original recentWorkspace not found (dsh version changed?): $file"
        } else {
            $text = $text.Replace($originalRecent, $replacementRecent)
            $changed = $true
        }
    }

    if ($text.Contains($originalSession)) {
        $text = $text.Replace($originalSession, $replacementSession)
        $changed = $true
    }

    if (-not $changed) {
        Write-Host "already applied: $file"
        continue
    }

    Set-Content -Path $file -Value $text -NoNewline -Encoding UTF8
    node --check $file
    if ($LASTEXITCODE -ne 0) { throw "syntax check failed after patching $file" }
    Write-Host "patched: $file"
}
