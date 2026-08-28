window.__ModuleLoader__.load({
	id: "dsh-openrouter-route",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		// ---------------------------------------------------------------------------
		// Host bridge: one same-origin JSON route.
		// ---------------------------------------------------------------------------
		const ROUTE = "/api/dsh-openrouter-route";

		async function getStatus(model) {
			const response = await fetch(ROUTE + "?op=status&model=" + encodeURIComponent(model), { method: "GET" });
			let envelope;
			try {
				envelope = await response.json();
			} catch {
				throw new Error(`dsh-openrouter-route status failed (${String(response.status)})`);
			}
			if (!response.ok || !envelope.ok) {
				const failure = envelope;
				throw new Error(`${failure.error.code}: ${failure.error.message}`);
			}
			return envelope.value;
		}

		async function selectProvider(model, provider) {
			const response = await fetch(ROUTE, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ op: "select", model, provider }),
			});
			let envelope;
			try {
				envelope = await response.json();
			} catch {
				throw new Error(`dsh-openrouter-route select failed (${String(response.status)})`);
			}
			if (!response.ok || !envelope.ok) {
				const failure = envelope;
				throw new Error(`${failure.error.code}: ${failure.error.message}`);
			}
			return envelope.value;
		}

		function insertCss(css) {
			if (typeof document === "undefined") return;
			const id = "dsh-openrouter-route";
			if (document.querySelector(`style[data-plugin-css="${id}"]`) !== null) return;
			const style = document.createElement("style");
			style.dataset.pluginCss = id;
			style.textContent = css;
			document.head.appendChild(style);
		}

		function fmtPrice(value) {
			if (typeof value !== "number" || !Number.isFinite(value)) return "?";
			if (value === 0) return "0";
			return parseFloat(value.toFixed(4)).toString();
		}

		function fmtUptime(value) {
			if (typeof value !== "number" || !Number.isFinite(value)) return null;
			return Math.round(value) + "%";
		}

		function fmtWhen(iso) {
			if (typeof iso !== "string") return null;
			const date = new Date(iso);
			if (Number.isNaN(date.getTime())) return null;
			return date.toLocaleTimeString();
		}

		/** Whether one endpoint row can take traffic (status 0 = active). */
		function isUsable(row) {
			return row.status === undefined || row.status === 0;
		}

		function sortProviders(rows) {
			return [...rows].sort((a, b) => {
				const ua = isUsable(a) ? 0 : 1;
				const ub = isUsable(b) ? 0 : 1;
				if (ua !== ub) return ua - ub;
				const pa = typeof a.input === "number" ? a.input : Number.POSITIVE_INFINITY;
				const pb = typeof b.input === "number" ? b.input : Number.POSITIVE_INFINITY;
				if (pa !== pb) return pa - pb;
				return a.name.localeCompare(b.name);
			});
		}

		// ---------------------------------------------------------------------------
		// Provider chip: current provider readout + pin/auto dropdown.
		// ---------------------------------------------------------------------------

		let sessionsService = null;
		let modelDirectoriesService = null;

		function useRunning(sessions, sessionId) {
			const subscribe = react.useCallback(
				(cb) => (sessions != null && sessions.list != null ? sessions.list.subscribe(cb) : () => {}),
				[sessions],
			);
			const getSnapshot = react.useCallback(() => {
				if (sessions == null || sessions.list == null || sessionId == null) return false;
				const snap = sessions.list.getSnapshot();
				const entry = snap != null && snap.byId != null ? snap.byId[sessionId] : undefined;
				return entry != null && entry.running === true;
			}, [sessions, sessionId]);
			return react.useSyncExternalStore(subscribe, getSnapshot);
		}

		function currentSessionId(props) {
			try {
				const fromProps = props != null && props.session != null ? props.session.id : undefined;
				if (typeof fromProps === "string" && fromProps !== "") return fromProps;
			} catch {
				// session view shape differs across builds; fall through.
			}
			try {
				if (sessionsService != null && sessionsService.list != null) {
					const current = sessionsService.list.getSnapshot().current;
					if (typeof current === "string" && current !== "") return current;
				}
			} catch {
				// sessions service not ready.
			}
			return null;
		}

		function currentModel(sessionId) {
			if (sessionId === null || modelDirectoriesService == null) return null;
			try {
				const directory = modelDirectoriesService.directoryFor(sessionId);
				if (directory == null || directory.store == null) return null;
				const snap = directory.store.getSnapshot();
				if (snap == null || snap.current == null) return null;
				if (snap.current.provider !== "openrouter") return null;
				const model = snap.current.model;
				return typeof model === "string" && model !== "" ? model : null;
			} catch {
				return null;
			}
		}

		function ProviderChip(props) {
			const [sessionId, setSessionId] = react.useState(() => currentSessionId(props));
			const [model, setModel] = react.useState(() => currentModel(currentSessionId(props)));
			const [open, setOpen] = react.useState(false);
			const [info, setInfo] = react.useState(null);
			const [error, setError] = react.useState(null);
			const [busy, setBusy] = react.useState(false);
			const rootRef = react.useRef(null);

			// Resolve session/model once the services settle, then on owner changes.
			react.useEffect(() => {
				const nextSession = currentSessionId(props);
				setSessionId(nextSession);
				setModel(currentModel(nextSession));
			}, [props]);

			const running = useRunning(sessionsService, sessionId);

			const load = react.useCallback(() => {
				if (model === null) return;
				let cancelled = false;
				getStatus(model).then(
					(value) => {
						if (cancelled) return;
						setInfo(value);
						setError(null);
						// Provider table still fetching host-side: one delayed retry.
						if (value.providers.length === 0) {
							setTimeout(() => {
								getStatus(model).then(
									(late) => {
										if (!cancelled) setInfo(late);
									},
									() => {},
								);
							}, 1500);
						}
					},
					(failure) => {
						if (!cancelled) setError(failure.message);
					},
				);
				return () => {
					cancelled = true;
				};
			}, [model]);

			react.useEffect(() => {
				if (model === null) return undefined;
				return load();
			}, [model, load]);

			// A finished turn may have been served by a new provider: refresh.
			const wasRunning = react.useRef(false);
			react.useEffect(() => {
				if (wasRunning.current && !running && model !== null) load();
				wasRunning.current = running;
			}, [running, model, load]);

			react.useEffect(() => {
				if (!open) return undefined;
				const closeOutside = (event) => {
					const root = rootRef.current;
					if (root !== null && event.target instanceof Node && !root.contains(event.target)) setOpen(false);
				};
				const onKey = (event) => {
					if (event.key === "Escape") setOpen(false);
				};
				document.addEventListener("mousedown", closeOutside);
				document.addEventListener("keydown", onKey);
				return () => {
					document.removeEventListener("mousedown", closeOutside);
					document.removeEventListener("keydown", onKey);
				};
			}, [open]);

			if (sessionId === null || model === null) return null;

			const choose = (provider) => {
				if (busy) return;
				setBusy(true);
				setError(null);
				selectProvider(model, provider).then(
					(value) => {
						setInfo(value);
						setBusy(false);
					},
					(failure) => {
						setError(failure.message);
						setBusy(false);
					},
				);
			};

			const selection = info !== null ? info.selection : null;
			const served = info !== null && info.current != null ? info.current.provider : null;
			const label = selection !== null && selection !== "auto"
				? selection
				: served !== null
					? "Auto \u00b7 " + served
					: "Auto";
			const rows = info !== null ? sortProviders(info.providers) : [];
			const wired = info !== null ? info.wired === true : true;

			const children = [];
			children.push(
				react.createElement(
					"div",
					{ key: "head", className: "orp-head" },
					react.createElement("span", { className: "orp-headTitle" }, "Provider"),
					wired
						? null
						: react.createElement("span", { className: "orp-unwired", title: "The openrouter route is not pointed at the local proxy; selection has no effect." }, "unwired"),
					served !== null
						? react.createElement(
								"span",
								{ className: "orp-served", title: "Provider that served this model's last request" },
								"last: " + served + (info.current.at !== undefined ? " \u00b7 " + fmtWhen(info.current.at) : ""),
							)
						: null,
				),
			);
			children.push(
				react.createElement(
					"div",
					{
						key: "row-auto",
						"data-nav": "1",
						role: "menuitemradio",
						"aria-checked": selection === null || selection === "auto",
						tabIndex: 0,
						className: "orp-row" + (selection === null || selection === "auto" ? " orp-selected" : ""),
						onClick: () => choose("auto"),
					},
					react.createElement(
						"span",
						{ className: "orp-copy" },
						react.createElement("span", { className: "orp-name" }, "Auto"),
						react.createElement("span", { className: "orp-desc" }, "Cheapest provider, OpenRouter-maintained"),
					),
					react.createElement("span", { className: "orp-check" }, selection === null || selection === "auto" ? "\u2713" : null),
				),
			);
			if (error !== null) {
				children.push(react.createElement("div", { key: "err", className: "orp-error" }, error));
			}
			if (info === null) {
				children.push(react.createElement("div", { key: "loading", className: "orp-status" }, "Loading providers\u2026"));
			} else if (rows.length === 0) {
				children.push(
					react.createElement(
						"div",
						{ key: "empty", className: "orp-status" },
						"No provider list yet",
						react.createElement(
							"button",
							{ type: "button", className: "orp-retry", onClick: load },
							"Retry",
						),
					),
				);
			} else {
				for (const row of rows) {
					const usable = isUsable(row);
					const selected = selection === row.name;
					const servedHere = served === row.name;
					const uptime = fmtUptime(row.uptime1d);
					children.push(
						react.createElement(
							"div",
							{
								key: row.name,
								"data-nav": usable ? "1" : undefined,
								role: "menuitemradio",
								"aria-checked": selected,
								"aria-disabled": !usable,
								tabIndex: usable ? 0 : -1,
								title: usable
									? row.name
									: row.name + " is not accepting traffic" + (row.status !== undefined ? " (status " + String(row.status) + ")" : ""),
								className: "orp-row" + (selected ? " orp-selected" : "") + (usable ? "" : " orp-degraded"),
								onClick: () => {
									if (usable) choose(row.name);
								},
							},
							react.createElement(
								"span",
								{ className: "orp-copy" },
								react.createElement(
									"span",
									{ className: "orp-nameRow" },
									react.createElement("span", { className: "orp-name" }, row.name),
									servedHere ? react.createElement("span", { className: "orp-servedDot", title: "Served the last request" }, "\u25cf") : null,
									!usable ? react.createElement("span", { className: "orp-degradedTag" }, "down") : null,
								),
								react.createElement(
									"span",
									{ className: "orp-desc" },
									"$" + fmtPrice(row.input) + " / $" + fmtPrice(row.output) + " per 1M" + (uptime !== null ? " \u00b7 up " + uptime : ""),
								),
							),
							react.createElement("span", { className: "orp-check" }, selected ? "\u2713" : null),
						),
					);
				}
			}

			return react.createElement(
				"div",
				{ ref: rootRef, className: "orp-root" },
				react.createElement(
					"button",
					{
						type: "button",
						className: "orp-trigger",
						"aria-label": "OpenRouter provider",
						"aria-haspopup": "menu",
						"aria-expanded": open,
						title: "OpenRouter provider" + (served !== null ? " \u00b7 last served by " + served : ""),
						onClick: () => {
							if (!open) load();
							setOpen(!open);
						},
					},
					react.createElement("span", { className: "orp-triggerIcon" }, "\u21c4"),
					react.createElement("span", { className: "orp-triggerLabel" }, label),
				),
				open
					? react.createElement(
							"div",
							{ className: "orp-menu", role: "menu", "aria-label": "OpenRouter provider" },
							children,
						)
					: null,
			);
		}

		// ---------------------------------------------------------------------------
		// Stylesheet.
		// ---------------------------------------------------------------------------
		const CSS = [
			".orp-root{min-width:0;position:relative}",
			".orp-trigger{height:24px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:none;border:none;border-radius:999px;outline:none;align-items:center;gap:4px;padding:0 8px;font-size:11px;font-weight:500;line-height:16px;display:flex;font-family:inherit;max-width:160px}",
			".orp-trigger:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}",
			".orp-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}",
			".orp-triggerIcon{flex:none;font-size:11px;line-height:16px}",
			".orp-triggerLabel{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}",
			".orp-menu{z-index:20;border:1px solid var(--dsw-alias-border-inverted);background:var(--dsw-specific-menu);width:max-content;min-width:260px;max-width:min(340px,100vw - 32px);max-height:min(360px,100vh - 96px);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);border-radius:12px;flex-direction:column;padding:4px;display:flex;position:absolute;bottom:calc(100% + 8px);left:0;overflow-y:auto}",
			".orp-head{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-caption);font-size:11px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;padding:6px 8px 4px}",
			".orp-served{margin-left:auto;text-transform:none;font-weight:400;letter-spacing:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%}",
			".orp-unwired{flex:none;color:var(--dsw-alias-state-warn-label);text-transform:none;letter-spacing:0;font-weight:400}",
			".orp-row{display:flex;align-items:center;gap:8px;width:100%;border:none;background:none;color:inherit;font:inherit;text-align:left;border-radius:8px;padding:5px 8px;cursor:pointer}",
			".orp-row:hover,.orp-row:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}",
			".orp-row[data-nav='0'],.orp-degraded{cursor:default;opacity:.55}",
			".orp-selected{background:var(--dsw-alias-interactive-bg-hover)}",
			".orp-copy{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}",
			".orp-nameRow{display:flex;align-items:center;gap:6px;min-width:0}",
			".orp-name{font-size:13px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".orp-servedDot{color:var(--dsw-alias-state-business-primary);font-size:9px;line-height:16px;flex:none}",
			".orp-degradedTag{flex:none;color:var(--dsw-alias-state-warn-label);font-size:10px;line-height:14px;border:1px solid var(--dsw-alias-border-l3);border-radius:999px;padding:0 5px}",
			".orp-desc{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".orp-check{flex:none;width:16px;text-align:center;font-size:13px}",
			".orp-status,.orp-error{color:var(--dsw-alias-label-tertiary);padding:8px;font-size:12px;line-height:18px;display:flex;align-items:center;gap:8px}",
			".orp-error{color:var(--dsw-alias-state-error-primary)}",
			".orp-retry{color:inherit;font:inherit;background:none;border:none;padding:0;cursor:pointer;text-decoration:underline;flex:none}",
		].join("\n");

		// ---------------------------------------------------------------------------
		// Plugin.
		// ---------------------------------------------------------------------------
		const inject = ["slots", "sessions", "modelDirectories"];

		function apply(ctx) {
			const slots = ctx.slots;
			sessionsService = ctx.sessions;
			modelDirectoriesService = ctx.modelDirectories;
			insertCss(CSS);

			slots.inject("conversation.input.left", () =>
				slots.register(
					{
						name: "conversation.input.left",
						id: "openrouter-provider",
						order: 60,
						label: "OpenRouter provider",
					},
					(props) => react.createElement(ProviderChip, props),
				),
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
