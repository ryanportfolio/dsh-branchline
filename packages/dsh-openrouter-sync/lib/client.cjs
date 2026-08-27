window.__ModuleLoader__.load({
	id: "dsh-openrouter-sync",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		// ---------------------------------------------------------------------------
		// Host bridge: one same-origin JSON route.
		// ---------------------------------------------------------------------------
		const ROUTE = "/api/dsh-openrouter-sync";

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
				throw new Error(`dsh-openrouter-sync request failed (${String(response.status)})`);
			}
			if (!response.ok || !envelope.ok) {
				const failure = envelope;
				throw new Error(`${failure.error.code}: ${failure.error.message}`);
			}
			return envelope.value;
		}

		async function status() {
			const response = await fetch(ROUTE + "?op=status", { method: "GET" });
			let envelope;
			try {
				envelope = await response.json();
			} catch {
				throw new Error(`dsh-openrouter-sync status failed (${String(response.status)})`);
			}
			if (!response.ok || !envelope.ok) {
				const failure = envelope;
				throw new Error(`${failure.error.code}: ${failure.error.message}`);
			}
			return envelope.value;
		}

		async function refreshNow() {
			return api({ op: "refresh" });
		}

		async function setAuto(enabled) {
			return api({ op: "set-auto", enabled });
		}

		function insertCss(css) {
			if (typeof document === "undefined") return;
			const id = "dsh-openrouter-sync";
			if (document.querySelector(`style[data-plugin-css="${id}"]`) !== null) return;
			const style = document.createElement("style");
			style.dataset.pluginCss = id;
			style.textContent = css;
			document.head.appendChild(style);
		}

		function formatWhen(iso) {
			if (iso == null) return "never";
			const date = new Date(iso);
			if (Number.isNaN(date.getTime())) return iso;
			return date.toLocaleString();
		}

		// ---------------------------------------------------------------------------
		// Settings page: status + refresh button.
		// ---------------------------------------------------------------------------
		function OpenRouterSyncPage() {
			const [info, setInfo] = react.useState(null);
			const [busy, setBusy] = react.useState(false);
			const [error, setError] = react.useState(null);
			const [result, setResult] = react.useState(null);

			const loadStatus = react.useCallback(() => {
				status().then(
					(value) => {
						setInfo(value);
						setError(null);
					},
					(failure) => setError(failure.message),
				);
			}, []);

			react.useEffect(() => {
				loadStatus();
			}, [loadStatus]);

			const refresh = () => {
				if (busy) return;
				setBusy(true);
				setError(null);
				setResult(null);
				refreshNow().then(
					(value) => {
						setResult(value);
						setBusy(false);
						loadStatus();
					},
					(failure) => {
						setError(failure.message);
						setBusy(false);
					},
				);
			};

			const toggleAuto = (event) => {
				const enabled = event.target.checked;
				setAuto(enabled).then(
					() => loadStatus(),
					(failure) => setError(failure.message),
				);
			};

			const rows = [];
			if (info !== null) {
				rows.push(["OpenRouter route configured", info.routeConfigured === true ? "yes" : "no"]);
				rows.push(["Models in the list", String(info.modelsConfigured)]);
				if (info.lastRunAt !== null) {
					rows.push(["Last refreshed", formatWhen(info.lastRunAt) + (info.lastRunCount !== null ? " \u00b7 " + String(info.lastRunCount) + " models" : "")]);
					rows.push(["Next auto-check", info.auto === false ? "off" : formatWhen(info.nextRunAt)]);
				}
			}

			return react.createElement(
				"div",
				{ className: "ors-page" },
				react.createElement(
					"div",
					{ className: "ors-header" },
					react.createElement(
						"div",
						null,
						react.createElement("h3", { className: "ors-title" }, "OpenRouter Models"),
						react.createElement(
							"p",
							{ className: "ors-sub" },
							"Pull the live OpenRouter catalog, sorted newest-first by release date, into the model list. A daily check runs automatically.",
						),
					),
					react.createElement(
						"button",
						{
							type: "button",
							className: "ors-refresh",
							onClick: refresh,
							disabled: busy,
						},
						busy ? "\u21bb Refreshing\u2026" : "\u21bb Refresh now",
					),
				),
				error !== null
					? react.createElement(
							"div",
							{ className: "ors-error" },
							react.createElement("span", { className: "ors-errorText" }, error),
							react.createElement("button", { type: "button", className: "ors-retry", onClick: loadStatus }, "Retry"),
						)
					: null,
				info !== null
					? react.createElement(
							"label",
							{ className: "ors-auto" },
							react.createElement("input", { type: "checkbox", checked: info.auto === true, onChange: toggleAuto }),
							" Refresh automatically once a day",
						)
					: null,
				result !== null && result.ok === true
					? react.createElement(
							"div",
							{ className: "ors-result" },
							"Refreshed " + String(result.count) + " models at " + formatWhen(result.at) +
								(result.updated === true ? " (" + String(Math.max(0, result.added)) + " new, " + String(Math.max(0, result.removed)) + " removed)." : " \u2014 no changes."),
						)
					: null,
				info === null && error === null
					? react.createElement("div", { className: "ors-loading" }, "Loading status\u2026")
					: react.createElement(
							"dl",
							{ className: "ors-rows" },
							rows.map(([label, value]) =>
								react.createElement(
									"div",
									{ key: label, className: "ors-row" },
									react.createElement("dt", { className: "ors-label" }, label),
									react.createElement("dd", { className: "ors-value" }, value),
								),
							),
						),
			);
		}

		// ---------------------------------------------------------------------------
		// Stylesheet.
		// ---------------------------------------------------------------------------
		const CSS = [
			".ors-page{display:flex;flex-direction:column;gap:12px;padding:16px;color:var(--dsw-alias-label-primary)}",
			".ors-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}",
			".ors-title{margin:0;font-size:14px;font-weight:600;line-height:20px}",
			".ors-sub{margin:4px 0 0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;max-width:46ch}",
			".ors-refresh{flex:none;background:var(--dsw-alias-interactive-bg-hover);border:1px solid var(--dsw-alias-border-inverted);color:var(--dsw-alias-label-primary);padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;line-height:18px;font-family:inherit}",
			".ors-refresh:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-active)}",
			".ors-refresh:disabled{opacity:.6;cursor:not-allowed}",
			".ors-error{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);border-radius:8px;justify-content:space-between;align-items:flex-start;gap:8px;padding:7px 8px;font-size:12px;line-height:18px;display:flex}",
			".ors-errorText{min-width:0;overflow-wrap:anywhere}",
			".ors-retry{color:inherit;font:inherit;background:none;border:none;padding:0;cursor:pointer;text-decoration:underline;flex:none}",
			".ors-result{background:var(--dsw-alias-bg-module-platform);border:1px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-secondary);border-radius:8px;padding:7px 8px;font-size:12px;line-height:18px}",
			".ors-auto{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;cursor:pointer}",
			".ors-auto input{accent-color:var(--dsw-alias-state-business-primary);cursor:pointer}",
			".ors-loading{color:var(--dsw-alias-label-tertiary);padding:8px;font-size:12px;line-height:18px}",
			".ors-rows{margin:0;display:flex;flex-direction:column;gap:8px}",
			".ors-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:4px 0;border-bottom:1px solid var(--dsw-alias-border-l3)}",
			".ors-row:last-child{border-bottom:none}",
			".ors-label{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}",
			".ors-value{margin:0;color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;text-align:right;overflow-wrap:anywhere}",
		].join("\n");

		// ---------------------------------------------------------------------------
		// Plugin.
		// ---------------------------------------------------------------------------
		const inject = ["slots"];

		function apply(ctx) {
			const slots = ctx.slots;
			insertCss(CSS);

			slots.inject("settings.section", () =>
				slots.register(
					{
						name: "settings.section",
						id: "openrouter-sync",
						order: 150,
						label: "OpenRouter Sync",
					},
					() => react.createElement(OpenRouterSyncPage),
				),
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
