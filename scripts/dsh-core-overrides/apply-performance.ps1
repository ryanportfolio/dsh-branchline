# Reapplies the DSH performance overrides to the bundles in the npx cache. The
# patch table holds one set per dsh version; an install whose version has no set
# is skipped with a warning.
#
# Set 0.1.5-rc.2, each patch backported from an upstream fix or written for
# this setup:
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
# Set 0.1.1-rc.2 (the web client has no session-controller package; sessions
# live in dsh-client-runtime):
#
#   perf-list-cache-linear         client-runtime: same Set-based entry-cache
#                                  prune as above.
#   perf-session-park              client-runtime: a session that leaves the
#                                  stage goes cold after a 30 s grace period,
#                                  so its live events stop being assembled.
#                                  Pending approvals and questions, queue,
#                                  drafts and scope stay; returning reopens it
#                                  from history through open(). Nothing is sent
#                                  to the host (one shared mux stream).
#   perf-input-queue-publish       ui-conversation: the input shell republishes
#                                  only when the queue projection changed (it
#                                  heard every stream frame before) and drops
#                                  the subscription on dispose.
#   perf-assistant-visible-short-circuit
#                                  ui-conversation, ui-trajectory: skip the
#                                  per-chunk visible-text scan once its result
#                                  can no longer change the step state.
#   perf-trajectory-lazy-snapshot  ui-trajectory: the Trajectory view snapshot
#                                  is computed on first read, not every frame.
#   perf-session-list-equality     ui-workspace: the three session list views
#                                  skip re-rendering on content-equal list
#                                  snapshots.
#   perf-row-sweep-transform       ui-conversation, ui-tool, ui-skill: running
#                                  row sweeps animate transform instead of left.
#   perf-turn-status-static        ui-conversation: running turn label without
#                                  the text shimmer.
#   perf-state-dot-static          web-frontend CSS: running state dot drawn
#                                  at a steady opacity instead of the chase.
#
# Usage:
#   .\apply-performance.ps1                    # every npx cache dir
#   .\apply-performance.ps1 -Root <dir>        # a node_modules\@deepseek-ai dir,
#                                              # a dir holding node_modules, or
#                                              # an npx cache root
#
# Each patch gates on the dsh version and on its own package version. Each
# carries its own marker and is skipped when the marker is present. A file is
# all-or-nothing: when any pending patch finds its original text missing or
# ambiguous, that file is left untouched. A written JS file passes
# `node --check` first; a CSS file passes a brace and comment balance check.
# A CSS asset whose hashed filename is absent is skipped with a warning.

param(
    [string]$Root
)

$ErrorActionPreference = 'Stop'

$MarkerPrefix = 'dsh-core-override: perf-'

# --- patch table ----------------------------------------------------------

# Keyed by dsh version. A patch without File targets lib\client.js.
$patchSets = @{}

$patchSets['0.1.5-rc.2'] = @(
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
				if (current === void 0 && this.watched !== void 0) {
					// Stage emptied (no-session view): release it so the old occupant parks and a reselect reopens it.
					const emptied = this.watched;
					this.watched = void 0;
					this.sweepDeferred();
					this.schedulePark(emptied);
					return;
				}
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
        File    = 'lib\index.js'
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

# Row sweep: the band is the first 300px of a pseudo-element that starts 300px
# left of the row and is 300px wider than it, so translateX(0 -> 100%) covers
# the same path as left:-300px -> left:100% on the compositor. The rows clip
# (overflow:hidden), so the wider box never shows.
$sweepFix = 'width:calc(100% + 300px);background-size:300px 100%;background-repeat:no-repeat;'
$sweepFrames = '{0%{transform:translateX(0)}90%,to{transform:translateX(100%)}}'
$sweepMarker = '/* dsh-core-override: perf-row-sweep-transform */'
function New-SweepHunks([string]$Keyframes, [string]$Position, [string]$NewPosition) {
    return @(
        @{
            Original    = "pointer-events:none;width:300px;animation:2.6s ease-out infinite ${Keyframes};${Position}}"
            Replacement = "pointer-events:none;${sweepFix}animation:2.6s ease-out infinite ${Keyframes};${NewPosition}}"
        },
        @{
            Original    = "@keyframes ${Keyframes}{0%{left:-300px}90%,to{left:100%}}"
            Replacement = "${sweepMarker}@keyframes ${Keyframes}${sweepFrames}"
        }
    )
}

$patchSets['0.1.1-rc.2'] = @(
    @{
        Package = 'dsh-client-runtime'
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
        Package = 'dsh-client-runtime'
        Name    = 'session-park'
        Hunks   = @(
            @{
                # Session.resync(): a parked window clears pending waits like an open one.
                Original = @'
			async resync() {
				if (this.openState === "cold") return;
'@
                Replacement = @'
			async resync() {
				// A parked window drops its pending waits like an open one; the new mux replays the live ones. [dsh-core-override: perf-session-park]
				if (this.openState === "cold" && this.parked === true) {
					this.pending.clear();
					this.pendingRev++;
					this.subscribedLastSeq = null;
					this.notifier.markDirty();
					return;
				}
				if (this.openState === "cold") return;
'@
            },
            @{
                # Session.park(), right after resync().
                Original = @'
				this.liveBuffer = [];
				this.notifier.markDirty();
				await this.open();
			}
'@
                Replacement = @'
				this.liveBuffer = [];
				this.notifier.markDirty();
				await this.open();
			}
			/** Stop assembling while off stage: cold drops live events and open() rebuilds from history on return. Pending waits, queue, drafts and scope stay. [dsh-core-override: perf-session-park] */
			park() {
				if (this.openState !== "open" && this.openState !== "error" || this.loadingOlder || this.stitching || this.queueMirror.snapshot().some((item) => item.placement === "steering")) return false;
				this.openGeneration++;
				this.openPromise = null;
				this.openState = "cold";
				this.openError = null;
				this.events = [];
				this.views = [];
				this.baseSeq = 0;
				this.liveBuffer = [];
				this.parked = true;
				// Release the assembled transcript too; open() rebuilds it through installWindow on return.
				this.conversation.replaceWindow([], false);
				this.notifier.markDirty();
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
			/** Grace period before an off-stage session goes cold. */
			parkGraceMs = 3e4;
'@
            },
            @{
                # followCurrent(): schedule the previous occupant, cancel and reopen the returning one.
                Original = @'
			followCurrent() {
				const snapshot = this.list.getSnapshot();
				const current = snapshot.current;
				if (current === void 0 || snapshot.byId[current] === void 0 || current === this.watched) return;
				this.watched = current;
				this.sweepDeferred();
'@
                Replacement = @'
			followCurrent() {
				const snapshot = this.list.getSnapshot();
				const current = snapshot.current;
				// [dsh-core-override: perf-session-park] An empty selection keeps the stage (upstream) but parks its occupant after the grace period; selecting it again reopens a parked window.
				if (current === void 0) {
					const staged = this.watched === void 0 ? void 0 : this.scopes.get(this.watched)?.session;
					if (staged !== void 0 && staged.openState !== "cold" && !this.parkTimers.has(this.watched)) this.schedulePark(this.watched);
					return;
				}
				if (snapshot.byId[current] === void 0) return;
				if (current === this.watched) {
					this.cancelPark(current);
					const staged = this.scopes.get(current)?.session;
					if (staged !== void 0 && staged.openState === "cold" && staged.parked === true) staged.open();
					return;
				}
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
				if (record !== void 0) {
					record.session.open();
					this.manager.refreshSubagents(current);
				}
			}
'@
                Replacement = @'
				if (record !== void 0) {
					record.session.open();
					this.manager.refreshSubagents(current);
				}
			}
			/** Park an off-stage session after the grace period; a busy one retries until it settles. [dsh-core-override: perf-session-park] */
			schedulePark(id) {
				this.cancelPark(id);
				this.parkTimers.set(id, setTimeout(() => {
					this.parkTimers.delete(id);
					if (id === this.watched && this.list.getSnapshot().current !== void 0) return;
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
        Package = 'dsh-client-ui-conversation'
        Name    = 'input-queue-publish'
        Hunks   = @(
            @{
                Original = @'
				this.state = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(this.compose());
				deps.queue?.subscribe(() => {
					this.publish();
				});
'@
                Replacement = @'
				this.state = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(this.compose());
				// The Session store notifies on every stream frame; republish only when the queue projection changed (its identity is stable until then). dispose() releases the subscription. [dsh-core-override: perf-input-queue-publish]
				this.queueOff = deps.queue?.subscribe(() => {
					if (this.deps.queue?.getSnapshot() !== this.state.getSnapshot().queue) this.publish();
				});
'@
            },
            @{
                Original = @'
			dispose() {
				this.disposed = true;
				this.run(this.core.dispatch({ type: "release" }));
'@
                Replacement = @'
			dispose() {
				this.disposed = true;
				this.queueOff?.();
				this.queueOff = void 0;
				this.run(this.core.dispatch({ type: "release" }));
'@
            }
        )
    },
    @{
        Package = 'dsh-client-ui-conversation'
        Name    = 'assistant-visible-short-circuit'
        Hunks   = @(
            @{
                Original = @'
			const visible = hasVisibleContent(compactBlocks(blocks));
'@
                Replacement = @'
			// Visible and not hidden already: the scan cannot change hidden or firstVisible*, so skip it per chunk. [dsh-core-override: perf-assistant-visible-short-circuit]
			const visible = state.firstVisibleSeq !== void 0 && !state.hidden || hasVisibleContent(compactBlocks(blocks));
'@
            }
        )
    },
    @{
        Package = 'dsh-client-ui-conversation'
        Name    = 'row-sweep-transform'
        Hunks   = @(
            (New-SweepHunks 'QWLzlG_dsh-reasoning-row-sweep' 'position:absolute;left:0' 'position:absolute;left:-300px') +
            (New-SweepHunks '_Xvjua_dsh-command-row-sweep' 'position:absolute;left:0' 'position:absolute;left:-300px')
        )
    },
    @{
        Package = 'dsh-client-ui-conversation'
        Name    = 'turn-status-static'
        Hunks   = @(
            @{
                Original    = 'align-items:center;animation:1.8s linear infinite Md3f7G_dsh-turn-status-shimmer;display:inline-flex}'
                Replacement = 'align-items:center;animation:none;display:inline-flex}/* dsh-core-override: perf-turn-status-static */'
            }
        )
    },
    @{
        Package = 'dsh-client-ui-trajectory'
        Name    = 'trajectory-lazy-snapshot'
        Hunks   = @(
            @{
                Original = @'
			snapshot() {
				const headersByStep = /* @__PURE__ */ new Map();
				for (const contribution of this.contributions) {
'@
                Replacement = @'
			/** Lazy view snapshot: the walk runs on first property read, so a closed Trajectory tab costs one array copy per frame. apply() rewrites contributions in place (rows are immutable), hence the copy. [dsh-core-override: perf-trajectory-lazy-snapshot] */
			snapshot() {
				const contributions = this.contributions.slice();
				let computed;
				const compute = () => {
					if (computed === void 0) computed = this.computeSnapshot(contributions);
					return computed;
				};
				return {
					get eventNodes() {
						return compute().eventNodes;
					},
					get eventLocations() {
						return compute().eventLocations;
					},
					get requests() {
						return compute().requests;
					},
					get callSchemas() {
						return compute().callSchemas;
					},
					get partial() {
						return compute().partial;
					},
					get runningCalls() {
						return compute().runningCalls;
					}
				};
			}
			computeSnapshot(contributions) {
				const headersByStep = /* @__PURE__ */ new Map();
				for (const contribution of contributions) {
'@
            },
            @{
                Original = @'
				const runningCalls = [];
				for (const contribution of this.contributions) {
'@
                Replacement = @'
				const runningCalls = [];
				for (const contribution of contributions) {
'@
            }
        )
    },
    @{
        Package = 'dsh-client-ui-trajectory'
        Name    = 'assistant-visible-short-circuit'
        Hunks   = @(
            @{
                Original = @'
			const visible = hasVisibleContent(compactBlocks(blocks));
'@
                Replacement = @'
			// Only the first visible chunk is recorded, so skip the scan once it is. [dsh-core-override: perf-assistant-visible-short-circuit]
			const visible = state.firstVisibleSeq === void 0 && hasVisibleContent(compactBlocks(blocks));
'@
            }
        )
    },
    @{
        Package = 'dsh-client-ui-tool'
        Name    = 'row-sweep-transform'
        Hunks   = @(
            (New-SweepHunks 'o3BgMG_dsh-tool-row-sweep' 'position:absolute;top:0;bottom:0;left:0' 'position:absolute;top:0;bottom:0;left:-300px') +
            (New-SweepHunks 'CY-8Ka_dsh-bash-row-sweep' 'position:absolute;top:0;bottom:0;left:0' 'position:absolute;top:0;bottom:0;left:-300px')
        )
    },
    @{
        Package = 'dsh-client-ui-skill'
        Name    = 'row-sweep-transform'
        Hunks   = @(
            (New-SweepHunks 'iWrAna_dsh-skill-row-sweep' 'position:absolute;inset:0 auto 0 0' 'position:absolute;inset:0 auto 0 -300px')
        )
    },
    @{
        Package = 'dsh-client-ui-workspace'
        Name    = 'session-list-equality'
        Hunks   = @(
            @{
                Original = @'
		function SessionTree(
'@
                Replacement = @'
		/**
		* Structural equality for the session list store: ids element by element,
		* byId entries field by field, every other member one level deep, leaves by
		* identity. A content-equal snapshot keeps the previous reference, so the
		* list views skip the re-render. [dsh-core-override: perf-session-list-equality]
		*/
		function equalSessionListState(left, right) {
			if (left === right) return true;
			if (left === void 0 || right === void 0 || left === null || right === null) return false;
			const keys = Object.keys(left);
			if (keys.length !== Object.keys(right).length) return false;
			for (const key of keys) if (!Object.hasOwn(right, key) || !equalListMember(left[key], right[key], key === "byId" ? 2 : 1)) return false;
			return true;
		}
		function equalListMember(left, right, depth) {
			if (Object.is(left, right)) return true;
			if (depth === 0 || typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false;
			const array = Array.isArray(left);
			if (array !== Array.isArray(right)) return false;
			if (!array && (Object.getPrototypeOf(left) !== Object.prototype || Object.getPrototypeOf(right) !== Object.prototype)) return false;
			const keys = Object.keys(left);
			if (keys.length !== Object.keys(right).length) return false;
			for (const key of keys) if (!Object.hasOwn(right, key) || !equalListMember(left[key], right[key], depth - 1)) return false;
			return true;
		}
		function SessionTree(
'@
            },
            @{
                Original = @'
			const list = useSessions((s) => s);
			const current = list.current;
'@
                Replacement = @'
			const list = useSessions((s) => s, equalSessionListState);
			const current = list.current;
'@
            },
            @{
                Original = @'
			const list = useSessions((s) => s);
			const baseRows =
'@
                Replacement = @'
			const list = useSessions((s) => s, equalSessionListState);
			const baseRows =
'@
            },
            @{
                Original = @'
			const list = useSessions((s) => s);
			const currentRemote =
'@
                Replacement = @'
			const list = useSessions((s) => s, equalSessionListState);
			const currentRemote =
'@
            }
        )
    },
    @{
        Package = 'dsh-web-frontend'
        File    = 'dist\assets\index-C6eRlFa6.css'
        Name    = 'state-dot-static'
        Hunks   = @(
            @{
                Original    = '._cell_10orb_54{fill:currentColor;opacity:.15;animation:_dsh-state-dot-chase_10orb_1 1s infinite}'
                Replacement = '/* dsh-core-override: perf-state-dot-static */._cell_10orb_54{fill:currentColor;opacity:.6;animation:none}'
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

# Braces balance outside comments and strings, and nothing is left open.
function Test-CssBalance([string]$Text) {
    $depth = 0
    $i = 0
    while ($i -lt $Text.Length) {
        $c = $Text[$i]
        if ($c -eq '/' -and $i + 1 -lt $Text.Length -and $Text[$i + 1] -eq '*') {
            $end = $Text.IndexOf('*/', $i + 2, [StringComparison]::Ordinal)
            if ($end -lt 0) { return $false }
            $i = $end + 2
            continue
        }
        if ($c -eq '"' -or $c -eq "'") {
            $j = $i + 1
            while ($j -lt $Text.Length -and $Text[$j] -ne $c) { if ($Text[$j] -eq '\') { $j++ }; $j++ }
            if ($j -ge $Text.Length) { return $false }
            $i = $j + 1
            continue
        }
        if ($c -eq '{') { $depth++ } elseif ($c -eq '}') { $depth--; if ($depth -lt 0) { return $false } }
        $i++
    }
    return $depth -eq 0
}

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

    if ([IO.Path]::GetExtension($File) -eq '.css') {
        if (-not (Test-CssBalance $text)) {
            Write-Warning "CSS balance check failed after patching; file left untouched: $File"
            return
        }
        [IO.File]::WriteAllText($File, $text, $utf8)
    } else {
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

$knownVersions = (@($patchSets.Keys) | Sort-Object) -join ', '
foreach ($scope in $scopes) {
    $dshVersion = Get-PackageVersion (Join-Path $scope 'dsh')
    if (-not $dshVersion -or -not $patchSets.ContainsKey($dshVersion)) {
        Write-Warning ("skipped {0}: dsh {1} has no override set (sets: {2})." -f $scope, $dshVersion, $knownVersions)
        continue
    }
    $patches = $patchSets[$dshVersion]
    foreach ($group in ($patches | Group-Object { $_.Package + '|' + $(if ($_.File) { $_.File } else { 'lib\client.js' }) })) {
        $package, $relative = $group.Name -split '\|', 2
        $packageDir = Join-Path $scope $package
        $packageVersion = Get-PackageVersion $packageDir
        if ($packageVersion -ne $dshVersion) {
            Write-Warning ("skipped {0}: version {1} is not {2}." -f $packageDir, $packageVersion, $dshVersion)
            continue
        }
        $file = Join-Path $packageDir $relative
        if (-not (Test-Path -LiteralPath $file)) {
            Write-Warning ("file not found, skipped ({0}): {1}" -f (($group.Group | ForEach-Object { 'perf-' + $_.Name }) -join ', '), $file)
            continue
        }
        Update-BundleFile $file @($group.Group)
    }
}
