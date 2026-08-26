window.__ModuleLoader__.load({
	id: "dsh-session-pins",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		// ---------------------------------------------------------------------------
		// Host bridge: one same-origin JSON route.
		// ---------------------------------------------------------------------------
		const ROUTE = "/api/dsh-session-pins";

		async function api(body) {
			const response = await fetch(ROUTE, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});
			let envelope;
			try {
				envelope = await response.json();
			} catch {
				throw new Error(`dsh-session-pins request failed (${String(response.status)})`);
			}
			if (!response.ok || !envelope.ok) {
				const failure = envelope;
				throw new Error(`${failure.error.code}: ${failure.error.message}`);
			}
			return envelope.value;
		}

		function insertCss(css) {
			if (typeof document === "undefined") return;
			const id = "dsh-session-pins";
			if (document.querySelector(`style[data-plugin-css="${id}"]`) !== null) return;
			const style = document.createElement("style");
			style.dataset.pluginCss = id;
			style.textContent = css;
			document.head.appendChild(style);
		}

		// ---------------------------------------------------------------------------
		// Pin store: host-persisted list, client cache with subscribe/getSnapshot.
		// ---------------------------------------------------------------------------
		let sessionsService = null;

		let pinState = { loaded: false, pins: [] };
		const pinListeners = new Set();

		function notifyPins() {
			for (const fn of [...pinListeners]) fn();
		}

		function subscribePins(fn) {
			pinListeners.add(fn);
			return () => pinListeners.delete(fn);
		}

		function getPinSnapshot() {
			return pinState;
		}

		async function refreshPins() {
			try {
				const value = await api({ op: "list" });
				pinState = { loaded: true, pins: Array.isArray(value && value.pins) ? value.pins : [] };
			} catch (error) {
				console.error("pins: load failed", error);
				pinState = { loaded: true, pins: pinState.pins };
			}
			notifyPins();
		}

		function isPinned(sessionId) {
			return pinState.pins.some((p) => p.sessionId === sessionId);
		}

		async function setPinned(sessionId, pinned) {
			const previous = pinState;
			const without = previous.pins.filter((p) => p.sessionId !== sessionId);
			pinState = {
				loaded: true,
				pins: pinned ? [{ sessionId, pinnedAt: Date.now() }, ...without] : without,
			};
			notifyPins();
			try {
				await api({ op: pinned ? "pin" : "unpin", sessionId });
			} catch (error) {
				console.error("pins: toggle failed", error);
				pinState = previous;
				notifyPins();
				refreshPins();
			}
		}

		/** Live read of one session summary field off the sessions list snapshot. */
		function sessionSummary(sessionId) {
			if (sessionsService === null || sessionsService.list == null || sessionId == null) return undefined;
			try {
				const snap = sessionsService.list.getSnapshot();
				return snap != null && snap.byId != null ? snap.byId[sessionId] : undefined;
			} catch (error) {
				return undefined;
			}
		}

		function useSessionsSubscribe() {
			return react.useCallback(
				(cb) => (sessionsService != null && sessionsService.list != null ? sessionsService.list.subscribe(cb) : () => {}),
				[],
			);
		}

		function useCurrentSessionId() {
			const subscribe = useSessionsSubscribe();
			return react.useSyncExternalStore(subscribe, () => {
				try {
					const snap = sessionsService != null && sessionsService.list != null ? sessionsService.list.getSnapshot() : null;
					return snap == null ? null : snap.current != null ? snap.current : null;
				} catch (error) {
					return null;
				}
			});
		}

		/** Cheap change signal for a set of sessions: title/running/blank signature string. */
		function useSessionSignature(sessionIds) {
			const subscribe = useSessionsSubscribe();
			return react.useSyncExternalStore(subscribe, () => {
				try {
					const snap = sessionsService != null && sessionsService.list != null ? sessionsService.list.getSnapshot() : null;
					if (snap == null || snap.byId == null) return "";
					return sessionIds
						.map((id) => {
							const entry = snap.byId[id];
							if (entry == null) return "\u0000";
							return (
								(typeof entry.displayTitle === "string" ? entry.displayTitle : "") +
								(entry.running === true ? "\u0001" : "") +
								(entry.blank === true ? "\u0002" : "")
							);
						})
						.join("|");
				} catch (error) {
					return "";
				}
			});
		}

		// ---------------------------------------------------------------------------
		// Icons (inline SVG; no primitives dependency).
		// ---------------------------------------------------------------------------
		const PIN_PATH =
			"M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H18v-2c-1.66 0-3-1.34-3-3z";

		function PinIcon({ filled }) {
			return react.createElement(
				"svg",
				{
					className: "spn-pinIcon" + (filled ? " spn-pinIconFilled" : ""),
					viewBox: "0 0 24 24",
					width: 14,
					height: 14,
					"aria-hidden": "true",
					focusable: "false",
				},
				react.createElement("path", {
					d: PIN_PATH,
					fill: filled ? "currentColor" : "none",
					stroke: filled ? "none" : "currentColor",
					"stroke-width": 1.8,
					"stroke-linejoin": "round",
				}),
			);
		}

		// ---------------------------------------------------------------------------
		// Feature A: pin toggle in the session header action row.
		// ---------------------------------------------------------------------------
		function HeaderPinToggle(props) {
			const currentId = useCurrentSessionId();
			const sid = props.sessionId != null ? props.sessionId : currentId;
			useSessionSignature([sid]);
			const summary = sessionSummary(sid);
			if (sid == null || (summary != null && summary.blank === true)) return null;

			const pinned = isPinned(sid);
			return react.createElement(
				"button",
				{
					type: "button",
					className: "spn-headerBtn" + (pinned ? " spn-headerBtnActive" : ""),
					title: pinned ? "Unpin session" : "Pin session",
					"aria-label": (pinned ? "Unpin session" : "Pin session"),
					"aria-pressed": pinned,
					onClick: () => {
						setPinned(sid, !pinned);
					},
				},
				react.createElement(PinIcon, { filled: pinned }),
			);
		}

		// ---------------------------------------------------------------------------
		// Feature B: Pinned panel at the sidebar foot (footer button + overlay).
		// ---------------------------------------------------------------------------
		const overlayBus = (() => {
			let open = false;
			const listeners = new Set();
			return {
				isOpen: () => open,
				setOpen: (value) => {
					open = value;
					for (const fn of [...listeners]) fn();
				},
				subscribe: (fn) => {
					listeners.add(fn);
					return () => listeners.delete(fn);
				},
			};
		})();

		function relativeTime(timestamp) {
			if (typeof timestamp !== "number" || timestamp <= 0) return "";
			const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
			if (seconds < 60) return "just now";
			const minutes = Math.round(seconds / 60);
			if (minutes < 60) return `${minutes}m ago`;
			const hours = Math.round(minutes / 60);
			if (hours < 24) return `${hours}h ago`;
			return `${Math.round(hours / 24)}d ago`;
		}

		function PinnedRow({ pin }) {
			const summary = sessionSummary(pin.sessionId);
			const title = summary != null && typeof summary.displayTitle === "string" && summary.displayTitle !== ""
				? summary.displayTitle
				: "Untitled session";
			const missing = summary == null;
			const running = summary != null && summary.running === true;
			return react.createElement(
				"div",
				{ className: "spn-row" + (missing ? " spn-rowMissing" : ""), title },
				react.createElement(
					"button",
					{
						type: "button",
						className: "spn-rowMain",
						disabled: missing,
						onClick: () => {
							if (sessionsService === null) return;
							try {
								sessionsService.open(pin.sessionId);
								overlayBus.setOpen(false);
							} catch (error) {
								console.error("pins: open failed", error);
							}
						},
					},
					running
						? react.createElement("span", { className: "spn-runDot", "aria-label": "Running" })
						: null,
					react.createElement("span", { className: "spn-rowTitle" }, title),
					react.createElement("span", { className: "spn-rowTime" }, relativeTime(pin.pinnedAt)),
				),
				react.createElement(
					"button",
					{
						type: "button",
						className: "spn-rowUnpin",
						title: "Unpin",
						"aria-label": "Unpin: " + title,
						onClick: () => {
							setPinned(pin.sessionId, false);
						},
					},
					react.createElement(PinIcon, { filled: true }),
				),
			);
		}

		function PinnedOverlay() {
			const isOpen = react.useSyncExternalStore(overlayBus.subscribe, overlayBus.isOpen);
			const state = react.useSyncExternalStore(subscribePins, getPinSnapshot);
			useSessionSignature(state.pins.map((p) => p.sessionId));
			if (!isOpen) return null;
			const pins = state.pins.filter((p) => {
				const summary = sessionSummary(p.sessionId);
				return summary == null || summary.blank !== true;
			});
			return react.createElement(
				"div",
				{ className: "spn-backdrop", onClick: () => overlayBus.setOpen(false) },
				react.createElement(
					"div",
					{ className: "spn-panel", onClick: (e) => e.stopPropagation() },
					react.createElement(
						"div",
						{ className: "spn-panelHeader" },
						react.createElement("h3", null, "Pinned Sessions"),
						react.createElement(
							"button",
							{
								type: "button",
								className: "spn-close",
								"aria-label": "Close",
								onClick: () => overlayBus.setOpen(false),
							},
							"\u2715",
						),
					),
					pins.length === 0
						? react.createElement(
								"div",
								{ className: "spn-empty" },
								state.loaded ? "No pinned sessions. Open one and press its pin button." : "Loading\u2026",
							)
						: react.createElement(
								"div",
								{ className: "spn-list" },
								pins.map((pin) =>
									react.createElement(PinnedRow, { key: pin.sessionId, pin }),
								),
							),
				),
			);
		}

		function PinnedFooterButton() {
			const isOpen = react.useSyncExternalStore(overlayBus.subscribe, overlayBus.isOpen);
			const state = react.useSyncExternalStore(subscribePins, getPinSnapshot);
			return react.createElement(
				"button",
				{
					type: "button",
					className: "spn-footerBtn",
					title: "Pinned sessions",
					"aria-expanded": isOpen,
					onClick: () => overlayBus.setOpen(!isOpen),
				},
				react.createElement(PinIcon, { filled: true }),
				react.createElement("span", { className: "spn-footerLabel" }, "Pinned"),
				state.pins.length > 0
					? react.createElement("span", { className: "spn-footerCount" }, String(state.pins.length))
					: null,
			);
		}

		// ---------------------------------------------------------------------------
		// Stylesheet.
		// ---------------------------------------------------------------------------
		const CSS = [
			".spn-headerBtn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;color:var(--dsw-alias-label-secondary);background:none;border:none;border-radius:6px;cursor:pointer;padding:0}",
			".spn-headerBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
			".spn-headerBtnActive{color:#eab308}",
			".spn-pinIcon{display:block}",
			".spn-footerBtn{display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;background:none;border:none;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:12px;font-weight:500;font-family:inherit}",
			".spn-footerBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
			".spn-footerLabel{white-space:nowrap}",
			".spn-footerCount{min-width:16px;height:16px;padding:0 4px;display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font-size:10px;line-height:16px}",
			".spn-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:100;display:flex;align-items:center;justify-content:center;padding:24px}",
			".spn-panel{background:var(--dsw-specific-menu);border:1px solid var(--dsw-alias-border-inverted);border-radius:12px;box-shadow:var(--dsw-shadow-lv3);width:100%;max-width:480px;max-height:60vh;display:flex;flex-direction:column;color:var(--dsw-alias-label-primary)}",
			".spn-panelHeader{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-inverted)}",
			".spn-panelHeader h3{margin:0;font-size:14px;font-weight:600}",
			".spn-close{background:none;border:none;color:var(--dsw-alias-label-tertiary);font-size:16px;cursor:pointer;padding:0 4px;line-height:1}",
			".spn-close:hover{color:var(--dsw-alias-label-primary)}",
			".spn-empty{padding:24px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}",
			".spn-list{overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:2px}",
			".spn-row{display:flex;align-items:center;width:100%;border-radius:8px;background:var(--dsw-alias-bg-module-platform)}",
			".spn-row:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".spn-rowMain{flex:1;min-width:0;display:flex;align-items:center;gap:8px;background:none;border:none;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer;padding:8px 4px 8px 12px}",
			".spn-rowMain:disabled{cursor:default;opacity:.55}",
			".spn-runDot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#22c55e)}",
			".spn-rowTitle{flex:1;min-width:0;font-size:13px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".spn-rowTime{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}",
			".spn-rowUnpin{flex:none;background:none;border:none;color:var(--dsw-alias-label-tertiary);cursor:pointer;padding:6px 10px;border-radius:6px}",
			".spn-rowUnpin:hover{color:#eab308;background:var(--dsw-alias-interactive-bg-hover)}",
		].join("\n");

		// ---------------------------------------------------------------------------
		// Plugin.
		// ---------------------------------------------------------------------------
		const inject = ["slots", "sessions"];

		function apply(ctx) {
			sessionsService = ctx.sessions;
			insertCss(CSS);

			// Boot-time load plus a refetch whenever the window regains focus, so
			// pins stay fresh across multiple open DSH tabs.
			refreshPins();
			if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
				window.addEventListener("focus", () => {
					refreshPins();
				});
			}

			// Per-session pin toggle beside the breadcrumb actions.
			ctx.slots.inject("conversation.session.header.actions", () =>
				ctx.slots.register(
					{
						name: "conversation.session.header.actions",
						id: "session-pins-toggle",
						order: 40,
						label: "Pin session",
						inject: (sessionId) => ({ sessionId }),
					},
					HeaderPinToggle,
				),
			);

			// Sidebar foot button.
			ctx.slots.inject("sidebar.footer.action", () =>
				ctx.slots.register(
					{
						name: "sidebar.footer.action",
						id: "session-pins",
						order: 90,
						label: "Pinned Sessions",
					},
					PinnedFooterButton,
				),
			);

			// Overlay panel.
			ctx.slots.inject("shell.overlay", () =>
				ctx.slots.register(
					{
						name: "shell.overlay",
						id: "session-pins-overlay",
						order: 60,
						label: "Pinned sessions",
					},
					PinnedOverlay,
				),
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
