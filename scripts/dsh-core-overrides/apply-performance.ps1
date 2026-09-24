# Reapplies the DSH performance overrides to the 0.1.5-rc.2 bundles in the npx
# cache. Five patches, each backported from an upstream fix or written for this
# setup:
#
#   perf-list-cache-linear         session-controller: session list entry-cache
#                                  prune uses a Set instead of O(n^2) scans
#                                  (upstream 53046b21b4).
#   perf-session-park              session-controller: a session that leaves the
#                                  stage closes its history stream after a 30 s
#                                  grace period; scope, drafts, queue and
#                                  pending submissions stay.
#   perf-stream-abort-per-read     gateway: cancellableStream races each read
#                                  against its own abort promise instead of one
#                                  shared never-settling promise (upstream
#                                  4cfd292a7b, cancellableStream hunk only).
#   perf-input-queue-unsubscribe   ui-conversation: the input shell queue
#                                  subscription is released on unregister
#                                  (upstream ba51e5483e).
#   perf-sidebar-adoption-release  ui-sidebar-right: a re-created per-session
#                                  store releases the previous adoption
#                                  (upstream 490a79c693).
#
# Usage:
#   .\apply-performance.ps1                    # every npx cache dir
#   .\apply-performance.ps1 -Root <dir>        # a node_modules\@deepseek-ai dir,
#                                              # a dir holding node_modules, or
#                                              # an npx cache root
#
# Only a dsh 0.1.5-rc.2 install is patched; other versions are skipped with a
# warning. Each patch carries its own marker and is skipped when the marker is
# present. A file is all-or-nothing: when any pending patch finds its original
# text missing or ambiguous, that file is left untouched. Every written file
# passes `node --check` first.

param(
    [string]$Root
)

$ErrorActionPreference = 'Stop'

$SupportedVersion = '0.1.5-rc.2'
$MarkerPrefix = 'dsh-core-override: perf-'

# --- patch table ----------------------------------------------------------

$patches = @(
    @{
        Package = 'dsh-api-session-controller'
        Name    = 'list-cache-linear'
        Hunks   = @(
            @{
                Original = @'
				for (const id of this.entryCache.keys()) if (!items.some((e) => e.sessionId === id)) this.entryCache.delete(id);
				if (!(items.length === this.itemsCache.length && items.every((e, i) => e === this.itemsCache[i]))) this.itemsCache = items;
				const selected = this.selected;
				const current = selected !== void 0 && (items.some((item) => item.sessionId === selected) || this.addresses.has(selected)) ? selected : void 0;
'@
                Replacement = @'
				// One id Set keeps list reconciliation linear. [dsh-core-override: perf-list-cache-linear]
				const itemIds = new Set(items.map((entry) => entry.sessionId));
				for (const id of this.entryCache.keys()) if (!itemIds.has(id)) this.entryCache.delete(id);
				if (!(items.length === this.itemsCache.length && items.every((e, i) => e === this.itemsCache[i]))) this.itemsCache = items;
				const selected = this.selected;
				const current = selected !== void 0 && (itemIds.has(selected) || this.addresses.has(selected)) ? selected : void 0;
'@
            }
        )
    },
    @{
        Package = 'dsh-api-session-controller'
        Name    = 'session-park'
        Hunks   = @(
            @{
                # Session.park(), right after resync().
                Original = @'
				this.baseSeq = SessionLogOffset(0);
				this.notifier.markDirty();
				await this.open();
			}
'@
                Replacement = @'
				this.baseSeq = SessionLogOffset(0);
				this.notifier.markDirty();
				await this.open();
			}
			/** Stop following while off stage; scope, drafts, queue and settlements stay. [dsh-core-override: perf-session-park] */
			park() {
				if (this.openState === "cold" || this.pendingSubmissions.length > 0 || this.submissionSettlements.size > 0 || this.loadingOlder || this.jumpPromise !== null) return false;
				this.openGeneration++;
				const events = this.events;
				this.events = void 0;
				this.openPromise = null;
				this.openState = "cold";
				this.openError = null;
				this.baseSeq = SessionLogOffset(0);
				this.notifier.markDirty();
				Promise.resolve(events?.dispose()).catch((error) => {
					console.error("[session-controller] park dispose failed:", error);
				});
				return true;
			}
'@
            },
            @{
                # ClientSessions: timer map and grace period.
                Original = @'
			deferredRemovals = /* @__PURE__ */ new Set();
'@
                Replacement = @'
			deferredRemovals = /* @__PURE__ */ new Set();
			/** Off-stage sessions waiting to park, by id. [dsh-core-override: perf-session-park] */
			parkTimers = /* @__PURE__ */ new Map();
			/** Grace period before an off-stage session closes its history stream. */
			parkGraceMs = 3e4;
'@
            },
            @{
                # ClientSessions root dispose: clear pending park timers.
                Original = @'
					this.deferredRemovals.clear();
					this.watched = void 0;
'@
                Replacement = @'
					this.deferredRemovals.clear();
					for (const timer of this.parkTimers.values()) clearTimeout(timer);
					this.parkTimers.clear();
					this.watched = void 0;
'@
            },
            @{
                # followCurrent(): schedule the previous occupant, cancel the new one.
                Original = @'
				if (current === void 0 || snapshot.byId[current] === void 0 || current === this.watched) return;
				this.watched = current;
				this.sweepDeferred();
'@
                Replacement = @'
				if (current === void 0 || snapshot.byId[current] === void 0 || current === this.watched) return;
				const previous = this.watched;
				this.watched = current;
				this.cancelPark(current);
				if (previous !== void 0) this.schedulePark(previous);
				this.sweepDeferred();
'@
            },
            @{
                # schedulePark()/cancelPark(), placed after followCurrent().
                Original = @'
					record.session.open();
					this.manager.refreshSubagents(current);
				}
			}
'@
                Replacement = @'
					record.session.open();
					this.manager.refreshSubagents(current);
				}
			}
			/** Park an off-stage session after the grace period; a busy one retries until it settles. [dsh-core-override: perf-session-park] */
			schedulePark(id) {
				this.cancelPark(id);
				this.parkTimers.set(id, setTimeout(() => {
					this.parkTimers.delete(id);
					if (id === this.watched) return;
					const session = this.scopes.get(id)?.session;
					if (session !== void 0 && session.park() === false && session.openState !== "cold") this.schedulePark(id);
				}, this.parkGraceMs));
			}
			cancelPark(id) {
				const timer = this.parkTimers.get(id);
				if (timer === void 0) return;
				clearTimeout(timer);
				this.parkTimers.delete(id);
			}
'@
            }
        )
    },
    @{
        Package = 'dsh-api-gateway'
        Name    = 'stream-abort-per-read'
        Hunks   = @(
            @{
                Original = @'
	let rejectAbort;
	const aborted = new Promise((_resolve, reject) => {
		rejectAbort = reject;
	});
	const onAbort = () => {
		rejectAbort?.(remoteCancelled(endpoint, signal.reason));
	};
	signal.addEventListener("abort", onAbort, { once: true });
	try {
		if (signal.aborted) throw remoteCancelled(endpoint, signal.reason);
		while (true) {
			const next = await Promise.race([Promise.resolve(iterator.next()), aborted]);
			if (next.done === true) return;
			yield next.value;
		}
	} finally {
		signal.removeEventListener("abort", onAbort);
'@
                Replacement = @'
	let rejectAbort;
	const onAbort = () => {
		rejectAbort?.(remoteCancelled(endpoint, signal.reason));
	};
	signal.addEventListener("abort", onAbort, { once: true });
	try {
		while (true) {
			if (signal.aborted) throw remoteCancelled(endpoint, signal.reason);
			// One abort promise per read: a shared pending one retains every completed race. [dsh-core-override: perf-stream-abort-per-read]
			const aborted = new Promise((_resolve, reject) => {
				rejectAbort = reject;
			});
			// next() can abort and throw synchronously before the race subscribes.
			aborted.catch(() => void 0);
			const next = await Promise.race([Promise.resolve(iterator.next()), aborted]);
			rejectAbort = void 0;
			if (next.done === true) return;
			yield next.value;
		}
	} finally {
		rejectAbort = void 0;
		signal.removeEventListener("abort", onAbort);
'@
            }
        )
    },
    @{
        Package = 'dsh-client-ui-conversation'
        Name    = 'input-queue-unsubscribe'
        Hunks   = @(
            @{
                Original = @'
				this.unregister = Eu(O$1(this.editor), O(this.editor, z(), HISTORY_MERGE_DELAY_MS), this.editor.registerUpdateListener(() => {
					this.onEditorUpdate();
				}), registerClaimDecoration(this.editor, () => this.activeClaimToken()), registerTextRefDecoration(this.editor, () => this.lexicon.getSnapshot(), () => this.activeClaimToken()), () => {
					this.lexiconOff?.();
				});
				this.state = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)(this.compose());
				deps.queue?.subscribe(() => {
					this.publish();
				});
'@
                Replacement = @'
				this.state = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)(this.compose());
				// The queue subscription joins the register list so unregister releases it. [dsh-core-override: perf-input-queue-unsubscribe]
				this.unregister = Eu(O$1(this.editor), O(this.editor, z(), HISTORY_MERGE_DELAY_MS), this.editor.registerUpdateListener(() => {
					this.onEditorUpdate();
				}), registerClaimDecoration(this.editor, () => this.activeClaimToken()), registerTextRefDecoration(this.editor, () => this.lexicon.getSnapshot(), () => this.activeClaimToken()), () => {
					this.lexiconOff?.();
				}, deps.queue?.subscribe(() => {
					this.publish();
				}) ?? (() => {}));
'@
            }
        )
    },
    @{
        Package = 'dsh-client-ui-sidebar-right'
        Name    = 'sidebar-adoption-release'
        Hunks   = @(
            @{
                Original = @'
				const adoptions = [];
				const store = {
					...handle,
					create: (scopeKey) => {
						const instance = handle.create(scopeKey);
						if (scopeKey !== void 0) adoptions.push(adopt(scopeKey, instance));
'@
                Replacement = @'
				// One adoption per session; a re-created store releases the one it replaces. [dsh-core-override: perf-sidebar-adoption-release]
				const adoptions = /* @__PURE__ */ new Map();
				const store = {
					...handle,
					create: (scopeKey) => {
						const instance = handle.create(scopeKey);
						if (scopeKey !== void 0) {
							adoptions.get(scopeKey)?.();
							adoptions.set(scopeKey, adopt(scopeKey, instance));
						}
'@
            },
            @{
                Original = @'
					for (const release of adoptions) release();
'@
                Replacement = @'
					for (const release of adoptions.values()) release();
					adoptions.clear();
'@
            }
        )
    }
)

# --- helpers --------------------------------------------------------------

function ConvertTo-Lf([string]$Text) { return $Text.Replace("`r`n", "`n") }

function Get-OccurrenceCount([string]$Text, [string]$Needle) {
    $count = 0
    $index = $Text.IndexOf($Needle, [StringComparison]::Ordinal)
    while ($index -ge 0) {
        $count++
        $index = $Text.IndexOf($Needle, $index + $Needle.Length, [StringComparison]::Ordinal)
    }
    return $count
}

function Get-PackageVersion([string]$PackageDir) {
    $manifest = Join-Path $PackageDir 'package.json'
    if (-not (Test-Path -LiteralPath $manifest)) { return $null }
    try { return (Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json).version } catch { return $null }
}

function Resolve-ScopeDirs([string]$Base) {
    if (Test-Path -LiteralPath (Join-Path $Base 'dsh\package.json')) { return @($Base) }
    $nested = Join-Path $Base 'node_modules\@deepseek-ai'
    if (Test-Path -LiteralPath $nested) { return @($nested) }
    return @(Get-ChildItem -LiteralPath $Base -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        Join-Path $_.FullName 'node_modules\@deepseek-ai'
    } | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'dsh\package.json') })
}

$utf8 = New-Object System.Text.UTF8Encoding($false)

function Update-BundleFile([string]$File, [object[]]$FilePatches) {
    $text = [IO.File]::ReadAllText($File, $utf8)
    $pending = @($FilePatches | Where-Object { -not $text.Contains($MarkerPrefix + $_.Name) })
    if ($pending.Count -eq 0) {
        Write-Host ("already applied: {0} ({1})" -f $File, (($FilePatches | ForEach-Object { 'perf-' + $_.Name }) -join ', '))
        return
    }

    # Every hunk must match exactly once before anything is written.
    $missing = New-Object System.Collections.Generic.List[string]
    foreach ($patch in $pending) {
        foreach ($hunk in $patch.Hunks) {
            if ((Get-OccurrenceCount $text (ConvertTo-Lf $hunk.Original)) -ne 1) { $missing.Add('perf-' + $patch.Name); break }
        }
    }
    if ($missing.Count -gt 0) {
        Write-Warning ("original text missing or ambiguous for {0}; file left untouched: {1}" -f ($missing -join ', '), $File)
        return
    }

    foreach ($patch in $pending) {
        foreach ($hunk in $patch.Hunks) {
            $text = $text.Replace((ConvertTo-Lf $hunk.Original), (ConvertTo-Lf $hunk.Replacement))
        }
    }

    # Syntax-check a sibling copy (same package scope) before replacing the file.
    $check = [IO.Path]::Combine([IO.Path]::GetDirectoryName($File), 'perf-override-check-' + [guid]::NewGuid().ToString('N') + [IO.Path]::GetExtension($File))
    try {
        [IO.File]::WriteAllText($check, $text, $utf8)
        & node --check $check
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "syntax check failed after patching; file left untouched: $File"
            return
        }
        [IO.File]::WriteAllText($File, $text, $utf8)
    } finally {
        Remove-Item -LiteralPath $check -Force -ErrorAction SilentlyContinue
    }
    $applied = ($pending | ForEach-Object { 'perf-' + $_.Name }) -join ', '
    $skipped = @($FilePatches | Where-Object { $pending -notcontains $_ } | ForEach-Object { 'perf-' + $_.Name })
    $note = if ($skipped.Count -gt 0) { '; already applied: ' + ($skipped -join ', ') } else { '' }
    Write-Host ("patched: {0} ({1}{2})" -f $File, $applied, $note)
}

# --- main -----------------------------------------------------------------

$base = if ($Root) { $Root } else { Join-Path $env:LOCALAPPDATA 'npm-cache\_npx' }
$scopes = @(Resolve-ScopeDirs $base)
if ($scopes.Count -eq 0) {
    Write-Warning "No @deepseek-ai/dsh install found under $base (npx may not have extracted it yet)."
    exit 1
}

foreach ($scope in $scopes) {
    $dshVersion = Get-PackageVersion (Join-Path $scope 'dsh')
    if ($dshVersion -ne $SupportedVersion) {
        Write-Warning ("skipped {0}: dsh {1} is not {2}; these overrides target {2} only." -f $scope, $dshVersion, $SupportedVersion)
        continue
    }
    foreach ($group in ($patches | Group-Object { $_.Package })) {
        $packageDir = Join-Path $scope $group.Name
        $packageVersion = Get-PackageVersion $packageDir
        if ($packageVersion -ne $SupportedVersion) {
            Write-Warning ("skipped {0}: version {1} is not {2}." -f $packageDir, $packageVersion, $SupportedVersion)
            continue
        }
        $file = if ($group.Name -eq 'dsh-api-gateway') { Join-Path $packageDir 'lib\index.js' } else { Join-Path $packageDir 'lib\client.js' }
        if (-not (Test-Path -LiteralPath $file)) {
            Write-Warning "bundle not found: $file"
            continue
        }
        Update-BundleFile $file @($group.Group)
    }
}
