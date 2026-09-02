window.__ModuleLoader__.load({
	id: "dsh-session-delete",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		let react = require("react");

		// ---------------------------------------------------------------------------
		// Host bridge: one same-origin JSON route.
		// ---------------------------------------------------------------------------
		const ROUTE = "/api/dsh-session-delete";
		const EVENT_OPEN = "dsh-session-delete:confirm";
		const EVENT_DELETED = "dsh-session-deleted";

		async function apiPost(body) {
			const response = await fetch(ROUTE, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});
			let envelope;
			try {
				envelope = await response.json();
			} catch {
				throw new Error(`dsh-session-delete request failed (${String(response.status)})`);
			}
			if (!response.ok || !envelope.ok) {
				const failure = envelope || {};
				const detail = failure.error && failure.error.message ? failure.error.message : `request failed (${String(response.status)})`;
				const error = new Error(detail);
				error.code = failure.error ? failure.error.code : "request-failed";
				throw error;
			}
			return envelope.value;
		}

		const apiPreview = (sessionId) => apiPost({ op: "preview", sessionId });
		const apiDelete = (sessionId, force) => apiPost({ op: "delete", sessionId, confirmation: sessionId, force: force === true });

		async function prepareSessionDeletion(sessionId) {
			const state = await apiPreview(sessionId);
			if (state.running === true) throw new Error("Stop the active session before deleting it.");
			if (workspacesService === null || typeof workspacesService.archiveSession !== "function") {
				throw new Error("This DSH build cannot close the session before deletion.");
			}
			await workspacesService.archiveSession(sessionId);
		}

		// ---------------------------------------------------------------------------
		// Dialog bus: one deletion dialog at a time, shared by every entry point.
		// ---------------------------------------------------------------------------
		const bus = (() => {
			let open = false;
			let sessionId = null;
			const listeners = new Set();
			const emit = () => {
				for (const fn of [...listeners]) fn();
			};
			return {
				isOpen: () => open,
				current: () => sessionId,
				open(id) {
					sessionId = id;
					open = true;
					emit();
				},
				close() {
					open = false;
					emit();
				},
				subscribe(fn) {
					listeners.add(fn);
					return () => listeners.delete(fn);
				},
			};
		})();

		function insertCss(css) {
			if (typeof document === "undefined" || document.querySelector('style[data-plugin-css="dsh-session-delete"]') !== null) return;
			const style = document.createElement("style");
			style.dataset.plugin = "dsh-session-delete";
			style.dataset.pluginCss = "dsh-session-delete/session-delete";
			style.textContent = css;
			document.head.appendChild(style);
		}

		const CSS = [
			// session delete
			".sdel-header-btn{background:none;border:none;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:4px 10px;border-radius:8px;font-size:12px;font-weight:500;line-height:18px;font-family:inherit}",
			".sdel-header-btn:hover{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-interactive-bg-hover)}",
			".sdel-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:120;display:flex;align-items:center;justify-content:center;padding:24px}",
			".sdel-dialog{background:var(--dsw-specific-menu);border:1px solid var(--dsw-alias-border-inverted);border-radius:12px;box-shadow:var(--dsw-shadow-lv3);width:100%;max-width:520px;max-height:75vh;display:flex;flex-direction:column;color:var(--dsw-alias-label-primary)}",
			".sdel-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-inverted)}",
			".sdel-header h3{margin:0;font-size:14px;font-weight:600}",
			".sdel-close{background:none;border:none;color:var(--dsw-alias-label-tertiary);font-size:18px;cursor:pointer;padding:0 4px;line-height:1}",
			".sdel-close:hover{color:var(--dsw-alias-label-primary)}",
			".sdel-body{padding:14px 16px;overflow-y:auto;display:flex;flex-direction:column;gap:12px}",
			".sdel-session-title{font-size:13px;font-weight:600;line-height:18px}",
			".sdel-session-id{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px;word-break:break-all}",
			".sdel-section{border:1px solid var(--dsw-alias-border-l3);border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}",
			".sdel-section-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}",
			".sdel-kv{display:flex;justify-content:space-between;gap:12px;font-size:12px;line-height:18px}",
			".sdel-kv-key{color:var(--dsw-alias-label-tertiary);flex:none}",
			".sdel-kv-val{min-width:0;text-align:right;word-break:break-all}",
			".sdel-blockers{display:flex;flex-direction:column;gap:4px}",
			".sdel-blocker{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}",
			".sdel-warning{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;font-weight:600}",
			".sdel-loading,.sdel-empty{padding:18px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:13px}",
			".sdel-error{padding:10px 12px;background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);border-radius:8px;font-size:12px;line-height:18px;word-break:break-word}",
			".sdel-footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--dsw-alias-border-inverted)}",
			".sdel-btn{padding:6px 14px;border-radius:8px;font-size:12px;font-weight:600;line-height:18px;cursor:pointer;font-family:inherit}",
			".sdel-btn-ghost{background:none;border:1px solid var(--dsw-alias-border-inverted);color:var(--dsw-alias-label-secondary)}",
			".sdel-btn-ghost:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}",
			".sdel-btn-danger{background:var(--dsw-alias-state-error-primary);border:1px solid var(--dsw-alias-state-error-primary);color:#fff}",
			".sdel-btn-danger:hover{filter:brightness(1.08)}",
			".sdel-btn-danger:disabled{opacity:.45;cursor:not-allowed;filter:none}",
		].join("\n");

		// ---------------------------------------------------------------------------
		// Components.
		// ---------------------------------------------------------------------------
		function useDialogState() {
			const isOpen = react.useSyncExternalStore(bus.subscribe, bus.isOpen);
			const sessionId = react.useSyncExternalStore(bus.subscribe, bus.current);
			return { isOpen, sessionId };
		}

		function Kv({ label, value }) {
			return react.createElement(
				"div",
				{ className: "sdel-kv" },
				react.createElement("span", { className: "sdel-kv-key" }, label),
				react.createElement("span", { className: "sdel-kv-val" }, value),
			);
		}

		function WorktreeSection({ worktree }) {
			if (worktree === null || worktree === undefined) {
				return react.createElement(
					"div",
					{ className: "sdel-section" },
					react.createElement("div", { className: "sdel-section-title" }, "Worktree"),
					react.createElement("div", { className: "sdel-empty" }, "No worktree attached. Only the session log and registry metadata will be removed."),
				);
			}
			const blockers = Array.isArray(worktree.blockers) ? worktree.blockers : [];
			return react.createElement(
				"div",
				{ className: "sdel-section" },
				react.createElement("div", { className: "sdel-section-title" }, "Attached worktree (deleted with the session)"),
				react.createElement(Kv, { label: "Task", value: worktree.title || worktree.taskId }),
				react.createElement(Kv, { label: "Folder", value: worktree.path }),
				worktree.branch !== null && worktree.branch !== undefined && react.createElement(Kv, { label: "Branch", value: worktree.branch }),
				worktree.exists === false && react.createElement(Kv, { label: "State", value: "folder already missing on disk" }),
				worktree.dirty === true && react.createElement(Kv, {
					label: "Uncommitted changes",
					value: `${worktree.staged || 0} staged, ${worktree.unstaged || 0} unstaged, ${worktree.untracked || 0} untracked`,
				}),
				(worktree.commitsAhead || 0) > 0 && react.createElement(Kv, { label: "Undelivered commits", value: String(worktree.commitsAhead) }),
				(worktree.otherSessions || 0) > 0 && react.createElement(Kv, { label: "Other sessions using it", value: String(worktree.otherSessions) }),
				blockers.length > 0 && react.createElement(
					"div",
					{ className: "sdel-blockers" },
					blockers.map((line, index) => react.createElement("div", { key: index, className: "sdel-blocker" }, line)),
				),
			);
		}

		function DeleteOverlay() {
			const { isOpen, sessionId } = useDialogState();
			const [phase, setPhase] = react.useState("loading");
			const [preview, setPreview] = react.useState(null);
			const [error, setError] = react.useState(null);

			react.useEffect(() => {
				if (!isOpen || sessionId === null || sessionId === undefined) return undefined;
				let cancelled = false;
				setPhase("loading");
				setPreview(null);
				setError(null);
				apiPreview(sessionId)
					.then((value) => {
						if (cancelled) return;
						setPreview(value);
						setPhase("ready");
					})
					.catch((cause) => {
						if (cancelled) return;
						setError(cause);
						setPhase("error");
					});
				return () => {
					cancelled = true;
				};
			}, [isOpen, sessionId]);

			if (!isOpen) return null;

			const perform = async (force) => {
				setPhase("deleting");
				setError(null);
				try {
					await prepareSessionDeletion(sessionId);
					await apiDelete(sessionId, force);
					bus.close();
					window.dispatchEvent(new CustomEvent(EVENT_DELETED, { detail: { sessionId } }));
					try {
						if (workspacesService !== null && typeof workspacesService.refresh === "function") await workspacesService.refresh();
					} catch {
						// Refresh failures leave the next baseline pull to reconcile.
					}
				} catch (cause) {
					setError(cause);
					setPhase("ready");
				}
			};

			const blockers = preview && preview.worktree ? preview.worktree.blockers || [] : [];
			const forceAllowed = !preview || !preview.worktree || preview.worktree.forceAllowed !== false;
			const running = preview !== null && preview.running === true;
			const close = () => bus.close();

			return react.createElement(
				"div",
				{ className: "sdel-backdrop", onClick: close },
				react.createElement(
					"div",
					{ className: "sdel-dialog", onClick: (e) => e.stopPropagation(), role: "dialog", "aria-label": "Delete session" },
					react.createElement(
						"div",
						{ className: "sdel-header" },
						react.createElement("h3", null, "Delete session"),
						react.createElement("button", { className: "sdel-close", onClick: close }, "\u2715"),
					),
					phase === "loading" && react.createElement("div", { className: "sdel-body" }, react.createElement("div", { className: "sdel-loading" }, "Loading\u2026")),
					phase === "error" && react.createElement(
						"div",
						{ className: "sdel-body" },
						react.createElement("div", { className: "sdel-error" }, error && error.message ? error.message : "Failed to load the session preview."),
					),
					(phase === "ready" || phase === "deleting") && preview !== null && react.createElement(
						"div",
						{ className: "sdel-body" },
						react.createElement("div", { className: "sdel-session-title" }, preview.title || "Untitled session"),
						react.createElement("div", { className: "sdel-session-id" }, preview.sessionId),
						react.createElement(WorktreeSection, { worktree: preview.worktree }),
						react.createElement(
							"div",
							{ className: "sdel-warning" },
							"Deletion is permanent: the session log, its registry entries, and any attached worktree folder and branch cannot be recovered.",
						),
						running && react.createElement("div", { className: "sdel-error" }, "Stop the active session before deleting it."),
						error !== null && react.createElement("div", { className: "sdel-error" }, error.message || "Deletion failed."),
					),
					react.createElement(
						"div",
						{ className: "sdel-footer" },
						react.createElement("button", { className: "sdel-btn sdel-btn-ghost", onClick: close }, "Cancel"),
						phase === "ready" && running && react.createElement(
							"button",
							{ className: "sdel-btn sdel-btn-danger", disabled: true },
							"Stop session first",
						),
						phase === "ready" && !running && blockers.length === 0 && react.createElement(
							"button",
							{ className: "sdel-btn sdel-btn-danger", onClick: () => perform(false) },
							"Delete permanently",
						),
						phase === "ready" && !running && blockers.length > 0 && forceAllowed && react.createElement(
							"button",
							{ className: "sdel-btn sdel-btn-danger", onClick: () => perform(true), title: "Force deletion despite the listed blockers" },
							"Delete anyway",
						),
						phase === "ready" && !running && blockers.length > 0 && !forceAllowed && react.createElement(
							"button",
							{ className: "sdel-btn sdel-btn-danger", disabled: true },
							"Delete other sessions first",
						),
						phase === "deleting" && react.createElement("button", { className: "sdel-btn sdel-btn-danger", disabled: true }, "Deleting\u2026"),
					),
				),
			);
		}

		function HeaderDeleteAction(props) {
			const sessionId = props && props.sessionId;
			if (typeof sessionId !== "string" || sessionId === "") return null;
			return react.createElement(
				"button",
				{
					className: "sdel-header-btn",
					title: "Delete session permanently",
					"aria-label": "Delete session permanently",
					onClick: () => bus.open(sessionId),
				},
				"Delete",
			);
		}

		// ---------------------------------------------------------------------------
		// Plugin.
		// ---------------------------------------------------------------------------
		const inject = ["slots", "workspaces"];

		let workspacesService = null;

		function apply(ctx) {
			const slots = ctx.slots;
			workspacesService = ctx.workspaces !== undefined ? ctx.workspaces : null;
			insertCss(CSS);

			slots.inject("conversation.session.header.actions", () =>
				slots.register(
					{
						name: "conversation.session.header.actions",
						id: "dsh-session-delete",
						order: 90,
					},
					HeaderDeleteAction,
				),
			);

			slots.inject("shell.overlay", () =>
				slots.register(
					{
						name: "shell.overlay",
						id: "dsh-session-delete-overlay",
						order: 60,
					},
					DeleteOverlay,
				),
			);

			const onOpenEvent = (event) => {
				const id = event && event.detail ? event.detail.sessionId : undefined;
				if (typeof id === "string" && id !== "") bus.open(id);
			};
			window.addEventListener(EVENT_OPEN, onOpenEvent);
			ctx.effect(() => () => window.removeEventListener(EVENT_OPEN, onOpenEvent), "dsh-session-delete: events");
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
