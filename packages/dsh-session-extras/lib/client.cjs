window.__ModuleLoader__.load({
	id: "dsh-session-extras",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		// ---------------------------------------------------------------------------
		// Host bridge: one same-origin JSON route.
		// ---------------------------------------------------------------------------
		const ROUTE = "/api/dsh-session-extras";

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
				throw new Error(`dsh-session-extras request failed (${String(response.status)})`);
			}
			if (!response.ok || !envelope.ok) {
				const failure = envelope;
				throw new Error(`${failure.error.code}: ${failure.error.message}`);
			}
			return envelope.value;
		}

		async function contextModel(sessionId) {
			return api({ op: "context", sessionId });
		}

		async function archivedList() {
			return api({ op: "archived-list" });
		}

		async function archivedRestore(sessionId) {
			return api({ op: "archived-restore", sessionId });
		}

		// ---------------------------------------------------------------------------
		// OpenRouter cost + context chips (from the dsh-openrouter-sync plugin, optional).
		// ---------------------------------------------------------------------------
		const OR_SYNC_ROUTE = "/api/dsh-openrouter-sync";
		const OPENROUTER_PROVIDER = "openrouter";

		function normalizeCosts(value) {
			if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
			const normalized = {};
			for (const [id, row] of Object.entries(value)) {
				if (id.length === 0 || row == null || typeof row !== "object" || Array.isArray(row)) continue;
				const input = typeof row.input === "number" && Number.isFinite(row.input) && row.input >= 0 ? row.input : undefined;
				const output = typeof row.output === "number" && Number.isFinite(row.output) && row.output >= 0 ? row.output : undefined;
				if (input === undefined && output === undefined) continue;
				normalized[id] = {
					...(input === undefined ? {} : { input }),
					...(output === undefined ? {} : { output }),
				};
			}
			return normalized;
		}

		function normalizeContexts(value) {
			if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
			const normalized = {};
			for (const [id, contextWindow] of Object.entries(value)) {
				if (id.length > 0 && typeof contextWindow === "number" && Number.isInteger(contextWindow) && contextWindow > 0) {
					normalized[id] = contextWindow;
				}
			}
			return Object.keys(normalized).length > 0 ? normalized : null;
		}

		async function fetchModelMeta() {
			try {
				const response = await fetch(OR_SYNC_ROUTE + "?op=costs", { method: "GET" });
				let envelope;
				try {
					envelope = await response.json();
				} catch {
					return null;
				}
				if (!response.ok || !envelope.ok) return null;
				const value = envelope.value;
				if (value == null || typeof value !== "object") return null;
				return {
					costs: normalizeCosts(value.costs),
					contexts: normalizeContexts(value.contexts),
				};
			} catch (error) {
				return null;
			}
		}

		function fmtCost(value) {
			if (typeof value !== "number" || !Number.isFinite(value)) return "?";
			if (value === 0) return "$0";
			if (value >= 100) return "$" + Math.round(value).toString();
			if (value >= 1) return "$" + value.toFixed(2);
			return "$" + parseFloat(value.toFixed(3)).toString();
		}

		function insertCss(css) {
			if (typeof document === "undefined") return;
			const id = "dsh-session-extras";
			if (document.querySelector(`style[data-plugin-css="${id}"]`) !== null) return;
			const style = document.createElement("style");
			style.dataset.pluginCss = id;
			style.textContent = css;
			document.head.appendChild(style);
		}

		// ---------------------------------------------------------------------------
		// Shared client service handles (set in apply).
		// ---------------------------------------------------------------------------
		let sessionsService = null;
		let conversationService = null;
		let modelDirectoriesService = null;

		// ---------------------------------------------------------------------------
		// Feature 1: model picker plus (search + favorites + active model readout).
		// ---------------------------------------------------------------------------
		const FAV_KEY = "dsh.modpick.favorites";

		/** Minimum context-window filter presets, tokens. "all" disables the filter. */
		const FILTERS = [
			{ value: "all", label: "All" },
			{ value: "128000", label: "128k" },
			{ value: "256000", label: "256k" },
			{ value: "512000", label: "512k" },
			{ value: "1000000", label: "1M" },
		];
		const FILTER_KEY = "dsh.modpick.contextFilter";
		const DEFAULT_FILTER = "256000";

		function loadFilter() {
			try {
				const raw = localStorage.getItem(FILTER_KEY);
				if (raw !== null && FILTERS.some((f) => f.value === raw)) return raw;
			} catch (error) {
				// storage unavailable; fall through to the default
			}
			return DEFAULT_FILTER;
		}

		function saveFilter(value) {
			try {
				localStorage.setItem(FILTER_KEY, value);
			} catch (error) {
				console.error("modpick: context filter persistence failed", error);
			}
		}

		function loadFavs() {
			try {
				const raw = localStorage.getItem(FAV_KEY);
				if (raw === null) return [];
				const parsed = JSON.parse(raw);
				return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
			} catch (error) {
				return [];
			}
		}

		function saveFavs(ids) {
			try {
				localStorage.setItem(FAV_KEY, JSON.stringify(ids));
			} catch (error) {
				console.error("modpick: favorite persistence failed", error);
			}
		}

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

		function ModelSelectPlus(props) {
			const locked = props.locked;
			const available = props.available;
			const directory = props.directory;
			const load = props.load;
			const select = props.select;
			const sessions = props.sessions;
			const sessionId = props.sessionId;

			const state = react.useSyncExternalStore(
				(fn) => directory.subscribe(fn),
				() => directory.getSnapshot(),
			);

			const [open, setOpen] = react.useState(false);
			const [pane, setPane] = react.useState("root");
			const [query, setQuery] = react.useState("");
			const [favs, setFavs] = react.useState(loadFavs);
			const [actionError, setActionError] = react.useState(null);
			const lastActionRef = react.useRef("load");
			const rootRef = react.useRef(null);
			const triggerRef = react.useRef(null);
			const searchRef = react.useRef(null);

			const running = useRunning(sessions, sessionId);
			const [activeModel, setActiveModel] = react.useState(null);
			const [costs, setCosts] = react.useState(null);
			const [contexts, setContexts] = react.useState(null);
			const [metaStatus, setMetaStatus] = react.useState("idle");
			const [metaReload, setMetaReload] = react.useState(0);
			const [contextFilter, setContextFilter] = react.useState(loadFilter);

			react.useEffect(() => {
				if (!available) return undefined;
				let cancelled = false;
				contextModel(sessionId).then(
					(r) => {
						if (!cancelled) setActiveModel(r != null ? r : null);
					},
					() => {
						if (!cancelled) setActiveModel(null);
					},
				);
				return () => {
					cancelled = true;
				};
			}, [available, sessionId, running]);

			react.useEffect(() => {
				if (!open || pane !== "model") return undefined;
				let cancelled = false;
				setMetaStatus("loading");
				fetchModelMeta().then(
					(meta) => {
						if (cancelled) return;
						setCosts(meta !== null ? meta.costs : null);
						setContexts(meta !== null ? meta.contexts : null);
						setMetaStatus(meta !== null && meta.contexts !== null ? "ready" : "unavailable");
					},
					() => {
						if (cancelled) return;
						setCosts(null);
						setContexts(null);
						setMetaStatus("unavailable");
					},
				);
				return () => {
					cancelled = true;
				};
			}, [open, pane, metaReload]);

			const choices = react.useMemo(() => {
				const rows = [];
				for (const group of state.groups) {
					for (const model of group.models) {
						rows.push({
							id: group.id + "/" + model.id,
							group,
							model,
							selection: {
								provider: group.id,
								model: model.id,
								...(model.reasoning === undefined || model.reasoning.defaultEffort === undefined
									? {}
									: { reasoningEffort: model.reasoning.defaultEffort }),
							},
						});
					}
				}
				return rows;
			}, [state.groups]);

			const choiceById = react.useMemo(() => {
				const map = new Map();
				for (const choice of choices) map.set(choice.id, choice);
				return map;
			}, [choices]);

			const currentChoice =
				state.current === null
					? undefined
					: choices.find((c) => c.selection.provider === state.current.provider && c.selection.model === state.current.model);
			const reasoning = currentChoice === undefined ? undefined : currentChoice.model.reasoning;
			const effectiveEffort = state.current === null ? undefined : state.current.reasoningEffort !== undefined ? state.current.reasoningEffort : reasoning === undefined ? undefined : reasoning.defaultEffort;
			const effortLabel =
				reasoning === undefined
					? undefined
					: effectiveEffort === undefined
						? "Default"
						: reasoning.efforts.find((level) => level.id === effectiveEffort)?.name ?? String(effectiveEffort);

			const effortChoices = react.useMemo(() => {
				if (reasoning === undefined) return [];
				const rows = reasoning.defaultEffort === undefined
					? [{ key: "provider-default", effort: undefined, label: "Default" }]
					: [];
				for (const effort of reasoning.efforts) {
					rows.push({ key: "effort:" + effort.id, effort: effort.id, label: effort.name, description: effort.description });
				}
				return rows;
			}, [reasoning]);

			const busy = state.status === "selecting";

			react.useEffect(() => {
				if (available) {
					lastActionRef.current = "load";
					load();
				}
			}, [available, load]);

			react.useEffect(() => {
				if (!open) return undefined;
				const closeOutside = (event) => {
					const root = rootRef.current;
					if (root !== null && event.target instanceof Node && !root.contains(event.target)) setOpen(false);
				};
				document.addEventListener("mousedown", closeOutside);
				return () => document.removeEventListener("mousedown", closeOutside);
			}, [open]);

			react.useEffect(() => {
				if (open && pane === "model" && searchRef.current !== null) searchRef.current.focus();
			}, [open, pane]);

			if (!available) return null;

			const reload = () => {
				lastActionRef.current = "load";
				setActionError(null);
				load();
			};

			const show = () => {
				setPane("root");
				setQuery("");
				setActionError(null);
				setOpen(true);
				lastActionRef.current = "load";
				load();
			};

			const close = (restoreFocus) => {
				setOpen(false);
				setPane("root");
				if (restoreFocus === true) queueMicrotask(() => triggerRef.current?.focus());
			};

			const toggleFav = (id, event) => {
				event.stopPropagation();
				setFavs((prev) => {
					const next = prev.includes(id) ? prev.filter((x) => x !== id) : prev.concat([id]);
					saveFavs(next);
					return next;
				});
			};

			const settleSelection = (accepted) => {
				if (accepted) {
					close(true);
					return;
				}
				const message = directory.getSnapshot().error;
				setActionError(message !== null ? message : "The selection was rejected.");
			};

			const choose = (choice) => {
				if (state.current !== null && state.current.provider === choice.selection.provider && state.current.model === choice.selection.model) {
					close(true);
					return;
				}
				lastActionRef.current = "select";
				setActionError(null);
				select(choice.selection).then(settleSelection);
			};

			const chooseEffort = (effort) => {
				if (state.current === null) return;
				if (effectiveEffort === effort) {
					close(true);
					return;
				}
				lastActionRef.current = "select";
				setActionError(null);
				select({
					provider: state.current.provider,
					model: state.current.model,
					...(effort === undefined ? {} : { reasoningEffort: effort }),
				}).then(settleSelection);
			};

			const moveFocus = (offset) => {
				const root = rootRef.current;
				if (root === null) return;
				const items = Array.from(root.querySelectorAll("[data-nav]"));
				if (items.length === 0) return;
				const active = items.indexOf(document.activeElement);
				const next = items[((active === -1 ? 0 : active) + offset + items.length) % items.length];
				next.focus();
			};

			const onRootKeyDown = (event) => {
				if (event.key === "Escape" && open) {
					event.preventDefault();
					if (pane !== "root") setPane("root");
					else close(true);
					return;
				}
				if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					event.preventDefault();
					moveFocus(event.key === "ArrowDown" ? 1 : -1);
				}
			};

			const onBlur = (event) => {
				const root = rootRef.current;
				if (event.relatedTarget instanceof Node && root !== null && root.contains(event.relatedTarget)) return;
				close();
			};

			const onSearchKeyDown = (event) => {
				event.stopPropagation();
				if (event.key === "Escape") {
					event.preventDefault();
					if (query !== "") setQuery("");
					else close(true);
				}
			};

			const hasRun = activeModel != null && activeModel.hasRun === true;
			const hasSelection = currentChoice !== undefined;
			const matchRun = hasSelection
				? hasRun && activeModel.provider === state.current.provider && activeModel.model === state.current.model
				: hasRun;
			const modelLabel = hasSelection
				? currentChoice.model.name
				: (hasRun ? activeModel.name : "Select model");
			const statusTag = hasSelection
				? (matchRun && !running ? "last" : undefined)
				: (hasRun ? (running ? "active" : "last") : undefined);
			const triggerLabel = effortLabel === undefined ? modelLabel : modelLabel + " \u00b7 " + effortLabel;

			const normalized = query.trim().toLowerCase();
			const matches = (group, model) => {
				if (normalized === "") return true;
				const haystack = [model.name, model.id, model.description, group.name, group.id];
				for (const field of haystack) {
					if (typeof field === "string" && field.toLowerCase().includes(normalized)) return true;
				}
				return false;
			};

			const favIds = favs.filter((id) => choiceById.has(id));
			const contextThreshold = contextFilter === "all" ? null : Number(contextFilter);
			const passesContext = (choice) => {
				if (contextThreshold === null) return true;
				if (choice.group.id !== OPENROUTER_PROVIDER) return true;
				const window = contexts !== null && typeof contexts[choice.model.id] === "number" ? contexts[choice.model.id] : undefined;
				if (window === undefined) return false;
				return window >= contextThreshold;
			};
			const setFilter = (value) => {
				setContextFilter(value);
				saveFilter(value);
			};
			const hiddenCount = contexts !== null && contextThreshold !== null ? choices.filter((choice) => !passesContext(choice)).length : 0;

			const favChoices = favIds
				.map((id) => choiceById.get(id))
				.filter((choice) => matches(choice.group, choice.model) && passesContext(choice));
			const visibleGroups = [];
			for (const group of state.groups) {
				const groupChoices = choices.filter((choice) => choice.group === group && matches(group, choice.model) && passesContext(choice));
				if (groupChoices.length > 0) visibleGroups.push({ group, choices: groupChoices });
			}

			const renderRow = (choice) => {
				const selected = state.current !== null && state.current.provider === choice.group.id && state.current.model === choice.model.id;
				const starred = favs.includes(choice.id);
				const price = choice.group.id === OPENROUTER_PROVIDER && costs !== null ? costs[choice.model.id] : undefined;
				return react.createElement(
					"div",
					{
						key: choice.id,
						"data-nav": "1",
						role: "menuitemradio",
						tabIndex: busy ? -1 : 0,
						"aria-checked": selected,
						title: choice.model.name,
						className: "mfp-option" + (selected ? " mfp-selected" : ""),
						onClick: () => choose(choice),
						onKeyDown: (event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								choose(choice);
							}
						},
					},
					react.createElement(
						"button",
						{
							type: "button",
							tabIndex: -1,
							title: starred ? "Remove favorite" : "Add favorite",
							"aria-label": (starred ? "Remove favorite: " : "Add favorite: ") + choice.model.name,
							className: "mfp-star" + (starred ? " mfp-starOn" : ""),
							onClick: (event) => toggleFav(choice.id, event),
						},
						starred ? "\u2605" : "\u2606",
					),
					react.createElement(
						"span",
						{ className: "mfp-copy" },
						react.createElement(
							"span",
							{ className: "mfp-nameRow" },
							react.createElement("span", { className: "mfp-modelName" }, choice.model.name),
							price !== undefined
								? react.createElement(
										"span",
										{ className: "mfp-cost", title: "Input / output cost per 1M tokens (OpenRouter)" },
										"I " + fmtCost(price.input) + " \u00b7 O " + fmtCost(price.output),
									)
								: null,
						),
						choice.model.description !== undefined
							? react.createElement("span", { className: "mfp-description" }, choice.model.description)
							: null,
					),
					react.createElement("span", { className: "mfp-check" }, selected ? "\u2713" : null),
				);
			};

			const children = [];

			if (pane === "root") {
				children.push(
					react.createElement(
						"button",
						{
							key: "cell-model",
							"data-nav": "1",
							type: "button",
							role: "menuitem",
							className: "mfp-cell",
							onClick: () => setPane("model"),
						},
						react.createElement("span", { className: "mfp-cellLabel" }, "Model"),
						react.createElement("span", { className: "mfp-cellValue" }, modelLabel),
						react.createElement("span", { className: "mfp-cellChevron" }, "\u203a"),
					),
				);
				if (reasoning !== undefined) {
					children.push(
						react.createElement(
							"button",
							{
								key: "cell-effort",
								"data-nav": "1",
								type: "button",
								role: "menuitem",
								className: "mfp-cell",
								onClick: () => setPane("effort"),
							},
							react.createElement("span", { className: "mfp-cellLabel" }, "Effort"),
							react.createElement("span", { className: "mfp-cellValue" }, effortLabel ?? "Default"),
							react.createElement("span", { className: "mfp-cellChevron" }, "\u203a"),
						),
					);
				}
			}

			if (pane === "model") {
				if (actionError !== null) {
					children.push(
						react.createElement(
							"div",
							{ key: "action-error", className: "mfp-error" },
							react.createElement("span", { className: "mfp-errorText" }, "Model operation failed: " + actionError),
							react.createElement("button", { type: "button", className: "mfp-retry", onClick: reload }, "Retry"),
						),
					);
				} else if (state.error !== null && lastActionRef.current === "load") {
					children.push(
						react.createElement(
							"div",
							{ key: "load-error", className: "mfp-error" },
							react.createElement("span", { className: "mfp-errorText" }, "Catalog failed to load: " + state.error),
							react.createElement("button", { type: "button", className: "mfp-retry", onClick: reload }, "Retry"),
						),
					);
				}
				for (const failure of state.failures) {
					children.push(
						react.createElement(
							"div",
							{ key: "failure-" + failure.id, className: "mfp-warning" },
							react.createElement("span", { className: "mfp-errorText" }, failure.name + " failed to load: " + failure.message),
							react.createElement("button", { type: "button", className: "mfp-retry", onClick: reload }, "Retry"),
						),
					);
				}
				children.push(
					react.createElement(
						"div",
						{ key: "search", className: "mfp-searchWrap" },
						react.createElement("input", {
							ref: searchRef,
							className: "mfp-search",
							type: "text",
							placeholder: "Search models\u2026",
							value: query,
							spellCheck: false,
							onChange: (event) => setQuery(event.target.value),
							onKeyDown: onSearchKeyDown,
						}),
					),
				);

				if (contexts !== null) children.push(
					react.createElement(
						"div",
						{ key: "context-filter", className: "mfp-filters", role: "group", "aria-label": "Minimum context window" },
						react.createElement("span", { className: "mfp-filtersLabel" }, "Context"),
						FILTERS.map((f) =>
							react.createElement(
								"button",
								{
									key: f.value,
									type: "button",
									className: "mfp-filter" + (contextFilter === f.value ? " mfp-filterOn" : ""),
									"aria-pressed": contextFilter === f.value,
									title: f.value === "all" ? "Show every model" : "Hide models below " + f.label + " context window",
									onClick: () => setFilter(f.value),
								},
								f.label,
							),
						),
						hiddenCount > 0
							? react.createElement("span", { key: "hidden-count", className: "mfp-filterCount" }, hiddenCount + " hidden")
							: null,
					),
				);
				else if (metaStatus === "loading") children.push(
					react.createElement("div", { key: "context-loading", className: "mfp-metaStatus" }, "Loading context data\u2026"),
				);
				else if (metaStatus === "unavailable") children.push(
					react.createElement(
						"div",
						{ key: "context-unavailable", className: "mfp-metaStatus" },
						"Context data unavailable",
						react.createElement(
							"button",
							{ type: "button", className: "mfp-metaRetry", onClick: () => setMetaReload((value) => value + 1) },
							"Retry",
						),
					),
				);

				const listChildren = [];
				if (normalized === "" && favChoices.length > 0) {
					listChildren.push(
						react.createElement(
							"section",
							{ key: "fav-group", role: "group", "aria-label": "Favorites", className: "mfp-group" },
							react.createElement("div", { className: "mfp-groupTitle" }, "\u2605 Favorites"),
							favChoices.map(renderRow),
						),
					);
				}
				for (const entry of visibleGroups) {
					listChildren.push(
						react.createElement(
							"section",
							{ key: "group-" + entry.group.id, role: "group", "aria-label": entry.group.name, className: "mfp-group" },
							react.createElement("div", { className: "mfp-groupTitle" }, entry.group.name),
							entry.choices.map(renderRow),
						),
					);
				}
				if (listChildren.length > 0) {
					children.push(
						react.createElement("div", { key: "groups", className: "mfp-groups scrollable" }, listChildren),
					);
				} else if (state.status === "loading") {
					children.push(react.createElement("div", { key: "loading", className: "mfp-status" }, "Refreshing model list\u2026"));
				} else if (state.status === "ready") {
					children.push(
						react.createElement(
							"div",
							{ key: "empty", className: "mfp-empty" },
							normalized === "" ? "No models available." : "No models match \u201c" + query.trim() + "\u201d.",
						),
					);
				}
			}

			if (pane === "effort") {
				if (actionError !== null) {
					children.push(
						react.createElement(
							"div",
							{ key: "action-error-effort", className: "mfp-error" },
							react.createElement("span", { className: "mfp-errorText" }, "Model operation failed: " + actionError),
							react.createElement("button", { type: "button", className: "mfp-retry", onClick: reload }, "Retry"),
						),
					);
				}
				if (effortChoices.length === 0) {
					children.push(react.createElement("div", { key: "empty-efforts", className: "mfp-empty" }, "This model provides no reasoning effort levels."));
				} else {
					for (const level of effortChoices) {
						const active = effectiveEffort === level.effort;
						children.push(
							react.createElement(
								"button",
								{
									key: level.key,
									"data-nav": "1",
									type: "button",
									role: "menuitemradio",
									"aria-checked": active,
									className: "mfp-option" + (active ? " mfp-selected" : ""),
									disabled: busy,
									onClick: () => chooseEffort(level.effort),
								},
								react.createElement(
									"span",
									{ className: "mfp-copy" },
									react.createElement("span", { className: "mfp-modelName" }, level.label),
									level.description !== undefined ? react.createElement("span", { className: "mfp-description" }, level.description) : null,
								),
								react.createElement("span", { className: "mfp-check" }, active ? "\u2713" : null),
							),
						);
					}
				}
			}

			return react.createElement(
				"div",
				{ ref: rootRef, className: "mfp-root", onKeyDown: onRootKeyDown, onBlur },
				react.createElement(
					"button",
					{
						ref: triggerRef,
						type: "button",
						className: "mfp-trigger",
						"aria-label": "Select model",
						"aria-haspopup": "menu",
						"aria-expanded": open,
						title: triggerLabel,
						disabled: locked === true,
						onClick: () => {
							if (open) close();
							else show();
						},
					},
					react.createElement("span", { className: "mfp-triggerLabel" }, modelLabel),
					effortLabel !== undefined ? react.createElement("span", { className: "mfp-triggerEffort" }, effortLabel) : null,
					statusTag !== undefined
						? react.createElement("span", { className: "mfp-statusTag" + (running ? " mfp-statusTagActive" : "") }, statusTag)
						: null,
					react.createElement("span", { className: "mfp-chevron" + (open ? " mfp-chevronOpen" : "") }, "\u25be"),
				),
				open
					? react.createElement(
							"div",
							{
								className: "mfp-menu",
								role: "menu",
								"aria-label": "Model and reasoning effort",
								"aria-busy": state.status === "loading" || busy,
							},
							children,
						)
					: null,
			);
		}

		// ---------------------------------------------------------------------------
		// Feature 2: archived sessions (footer button + settings page + overlay).
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

		async function fetchArchivedSessions() {
			try {
				const res = await archivedList();
				return res && res.sessions ? res.sessions : [];
			} catch (e) {
				console.error("archived: fetch failed", e);
				return [];
			}
		}

		async function restoreSession(sessionId) {
			try {
				const res = await archivedRestore(sessionId);
				return res && res.ok === true;
			} catch (e) {
				console.error("archived: restore failed", e);
				return false;
			}
		}

		function openSession(sessionId) {
			if (sessionsService === null) {
				console.error("archived: sessions service unavailable");
				return;
			}
			try {
				sessionsService.open(sessionId);
			} catch (e) {
				console.error("archived: open failed", e);
			}
		}

		function SessionRow({ session, onRestore, restoring }) {
			const pending = restoring === session.id;
			return react.createElement(
				"div",
				{ className: "archs-row", title: session.title || "Untitled" },
				react.createElement(
					"button",
					{
						className: "archs-row-main",
						onClick: () => openSession(session.id),
						disabled: pending,
					},
					react.createElement("span", { className: "archs-row-title" }, session.title || "Untitled"),
					session.workspaceName && react.createElement(
						"span",
						{ className: "archs-row-workspace" },
						session.workspaceName,
					),
				),
				react.createElement(
					"button",
					{
						className: "archs-btn archs-btn-restore",
						title: "Restore session",
						"aria-label": "Restore session: " + (session.title || "Untitled"),
						onClick: (e) => {
							e.stopPropagation();
							onRestore(session.id);
						},
						disabled: pending,
					},
					pending ? "…" : "↩",
				),
			);
		}

		function useSessions(active) {
			const [sessions, setSessions] = react.useState([]);
			const [loading, setLoading] = react.useState(false);
			const [error, setError] = react.useState(null);
			const [restoring, setRestoring] = react.useState(null);

			const load = react.useCallback(async () => {
				setLoading(true);
				setError(null);
				const data = await fetchArchivedSessions();
				setSessions(data);
				setLoading(false);
			}, []);

			react.useEffect(() => {
				if (active) load();
			}, [active, load]);

			const handleRestore = async (id) => {
				setRestoring(id);
				const ok = await restoreSession(id);
				if (ok) load();
				setRestoring(null);
			};

			return { sessions, loading, error, load, restoring, handleRestore };
		}

		function ArchivedOverlay() {
			const isOpen = react.useSyncExternalStore(overlayBus.subscribe, overlayBus.isOpen);
			const data = useSessions(isOpen);
			if (!isOpen) return null;
			return react.createElement(
				"div",
				{ className: "archs-overlay-backdrop", onClick: () => overlayBus.setOpen(false) },
				react.createElement(
					"div",
					{ className: "archs-overlay", onClick: (e) => e.stopPropagation() },
					react.createElement(
						"div",
						{ className: "archs-overlay-header" },
						react.createElement("h3", null, "Archived Sessions"),
						react.createElement(
							"button",
							{ className: "archs-close", onClick: () => overlayBus.setOpen(false) },
							"✕",
						),
					),
					data.loading && react.createElement("div", { className: "archs-loading" }, "Loading…"),
					data.error && react.createElement(
						"div",
						{ className: "archs-error" },
						"Failed to load: ", data.error,
						react.createElement("button", { onClick: data.load }, " Retry"),
					),
					!data.loading && !data.error && data.sessions.length === 0 && react.createElement(
						"div",
						{ className: "archs-empty" },
						"No archived sessions.",
					),
					!data.loading && !data.error && data.sessions.length > 0 && react.createElement(
						"div",
						{ className: "archs-list" },
						data.sessions.map((s) => react.createElement(SessionRow, {
							key: s.id,
							session: s,
							onRestore: data.handleRestore,
							restoring: data.restoring,
						})),
					),
				),
			);
		}

		function ArchivedSettingsPage() {
			const data = useSessions(true);
			return react.createElement(
				"div",
				{ className: "archs-settings" },
				react.createElement(
					"div",
					{ className: "archs-settings-header" },
					react.createElement("h3", null, "Archived Sessions"),
					react.createElement(
						"button",
						{ className: "archs-refresh", onClick: data.load, disabled: data.loading },
						data.loading ? "↻ Loading…" : "↻ Refresh",
					),
				),
				data.error && react.createElement("div", { className: "archs-error" }, data.error),
				data.loading ? react.createElement("div", { className: "archs-loading" }, "Loading…") :
				data.sessions.length === 0 ? react.createElement("div", { className: "archs-empty" }, "No archived sessions.") :
				react.createElement(
					"div",
					{ className: "archs-list" },
					data.sessions.map((s) => react.createElement(SessionRow, {
						key: s.id,
						session: s,
						onRestore: data.handleRestore,
						restoring: data.restoring,
					})),
				),
			);
		}

		function FooterAction() {
			const isOpen = react.useSyncExternalStore(overlayBus.subscribe, overlayBus.isOpen);
			return react.createElement(
				"button",
				{
					className: "archs-footer-btn",
					title: "Archived sessions",
					"aria-expanded": isOpen,
					onClick: () => overlayBus.setOpen(!isOpen),
				},
				react.createElement("span", { className: "archs-footer-icon" }, "▼"),
				react.createElement("span", { className: "archs-footer-label" }, "Archived"),
			);
		}

		// ---------------------------------------------------------------------------
		// Feature 3: selection reply popup.
		// ---------------------------------------------------------------------------
		function insertQuote(sessionId, text) {
			try {
				const binding = sessionsService != null ? sessionsService.binding(sessionId) : undefined;
				const shell =
					conversationService != null && conversationService.input != null
						? conversationService.input.shell(sessionId)
						: undefined;
				if (shell == null) return false;
				const snapshot = shell.snapshot;
				const draft = snapshot != null ? snapshot.draft : "";
				const draftRev = snapshot != null ? snapshot.draftRev : undefined;
				const quoted = "> " + text.trim().split(/\r?\n/).join("\n> ");
				// Two blank rows after the quote so the typing caret lands two lines below it.
				const tail = "\n\n";
				if (draftRev !== undefined && binding != null && binding.ctx != null) {
					const ok = binding.ctx.bail(binding.ctx, "slash/input-insert-text", {
						text: draft === "" ? quoted + tail : "\n\n" + quoted + tail,
						span: { start: draft.length, end: draft.length, draftRev },
					});
					if (ok === true) return true;
				}
				if (shell.actions != null && typeof shell.actions.setDraft === "function") {
					shell.actions.setDraft(draft === "" ? quoted + tail : draft + "\n\n" + quoted + tail);
					return true;
				}
				return false;
			} catch (error) {
				console.error("selr: insert failed", error);
				return false;
			}
		}

		function focusComposer() {
			try {
				const seat = document.querySelector("[data-composer-seat]");
				if (seat == null) return;
				const input = seat.querySelector("textarea");
				if (input == null) return;
				input.focus();
				// Place the typing caret at the very end once React has committed the
				// new draft, so it rests two lines below the inserted quote.
				const placeCaret = () => {
					try {
						const end = typeof input.value === "string" ? input.value.length : 0;
						input.setSelectionRange(end, end);
						const scroller = input.closest("[data-input-scroll]");
						if (scroller != null) scroller.scrollTop = scroller.scrollHeight;
					} catch (error) {
						console.error("selr: caret placement failed", error);
					}
				};
				if (typeof requestAnimationFrame === "function") requestAnimationFrame(placeCaret);
				else placeCaret();
			} catch (error) {
				console.error("selr: focus failed", error);
			}
		}

		function SelectionReplyOverlay() {
			const [mark, setMark] = react.useState(null);
			const popupRef = react.useRef(null);

			const considerSelection = react.useCallback(() => {
				try {
					const sels = typeof window.getSelection === "function" ? window.getSelection() : null;
					const sel = sels != null && sels.rangeCount > 0 ? sels.getRangeAt(0) : null;
					if (sel == null || sel.collapsed) {
						if (popupRef.current != null && popupRef.current.contains(document.activeElement)) return;
						setMark((prev) => (prev == null ? prev : null));
						return;
					}
					const text = sel.toString();
					if (text.trim() === "") {
						setMark((prev) => (prev == null ? prev : null));
						return;
					}
					const node = sel.commonAncestorContainer;
					const el = node != null && node.nodeType === 3 ? node.parentElement : node;
					if (el == null || typeof el.closest !== "function" || el.closest("[data-conversation-scroll]") == null) {
						setMark((prev) => (prev == null ? prev : null));
						return;
					}
					const rect = sel.getBoundingClientRect();
					if (rect.width < 2 || rect.height < 2) {
						setMark((prev) => (prev == null ? prev : null));
						return;
					}
					const sessionId =
						sessionsService != null && sessionsService.list != null
							? sessionsService.list.getSnapshot().current
							: undefined;
					setMark((prev) => {
						if (
							prev != null &&
							prev.text === text &&
							prev.sessionId === sessionId &&
							Math.abs(prev.rectTop - rect.top) < 4 &&
							Math.abs(prev.rectLeft - rect.left) < 4
						)
							return prev;
						return { text, rectTop: rect.top, rectLeft: rect.left, rectBottom: rect.bottom, sessionId };
					});
				} catch (error) {
					setMark(null);
				}
			}, []);

			react.useEffect(() => {
				const onSelectionChange = () => considerSelection();
				const onMove = () => considerSelection();
				document.addEventListener("selectionchange", onSelectionChange);
				window.addEventListener("scroll", onMove, true);
				window.addEventListener("resize", onMove);
				return () => {
					document.removeEventListener("selectionchange", onSelectionChange);
					window.removeEventListener("scroll", onMove, true);
					window.removeEventListener("resize", onMove);
				};
			}, [considerSelection]);

			const reply = react.useCallback(() => {
				if (mark == null) return;
				const accepted = insertQuote(mark.sessionId, mark.text);
				try {
					const sels = window.getSelection();
					if (sels != null) sels.removeAllRanges();
				} catch (error) {
					console.error("selr: clear selection failed", error);
				}
				setMark(null);
				if (accepted) focusComposer();
			}, [mark]);

			if (mark == null) return null;
			const POPUP_H = 30;
			const left = Math.max(8, Math.min(mark.rectLeft, window.innerWidth - 8 - 120));
			const top = mark.rectTop - POPUP_H - 8 >= 8 ? mark.rectTop - POPUP_H - 8 : mark.rectBottom + 8;
			return react.createElement(
				"div",
				{
					ref: popupRef,
					className: "srp-popup",
					style: { left: left + "px", top: top + "px" },
					role: "toolbar",
					"aria-label": "Reply to selection",
				},
				react.createElement(
					"button",
					{
						type: "button",
						className: "srp-button",
						onMouseDown: (event) => event.preventDefault(),
						onClick: reply,
					},
					react.createElement("span", { className: "srp-icon" }, "\u21a9"),
					react.createElement("span", null, "Reply"),
				),
			);
		}

		// ---------------------------------------------------------------------------
		// Stylesheet.
		// ---------------------------------------------------------------------------
		const CSS = [
			// model picker
			".mfp-root{min-width:0;position:relative}",
			".mfp-trigger{min-width:0;max-width:min(360px,45cqw);height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:none;border:none;border-radius:24px;outline:none;align-items:center;gap:4px;padding:0 4px 0 8px;font-size:13px;font-weight:500;line-height:20px;display:flex;font-family:inherit}",
			".mfp-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
			".mfp-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}",
			".mfp-trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}",
			".mfp-triggerLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}",
			".mfp-triggerEffort{color:var(--dsw-alias-label-caption);flex:none}",
			".mfp-statusTag{flex:none;color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px;padding:0 6px;border:1px solid var(--dsw-alias-border-l3);border-radius:999px}",
			".mfp-statusTagActive{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}",
			".mfp-chevron{color:var(--dsw-alias-label-caption);flex:none;transition:transform .12s;display:inline-flex}",
			".mfp-chevronOpen{transform:rotate(180deg)}",
			".mfp-menu{z-index:20;border:1px solid var(--dsw-alias-border-inverted);background:var(--dsw-specific-menu);width:max-content;min-width:min(300px,100vw - 32px);max-width:min(420px,100vw - 32px);max-height:min(400px,100vh - 96px);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);border-radius:12px;flex-direction:column;padding:4px;display:flex;position:absolute;bottom:calc(100% + 8px);right:0;overflow:hidden}",
			".mfp-status,.mfp-empty{color:var(--dsw-alias-label-tertiary);padding:10px;font-size:13px;line-height:20px}",
			".mfp-error,.mfp-warning{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);border-radius:8px;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px;padding:7px 8px;font-size:12px;line-height:18px;display:flex}",
			".mfp-warning{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-state-warn-label)}",
			".mfp-errorText{min-width:0;overflow-wrap:anywhere}",
			".mfp-retry{color:inherit;font:inherit;background:none;border:none;padding:0;cursor:pointer;text-decoration:underline;flex:none}",
			".mfp-searchWrap{padding:2px 2px 4px}",
			".mfp-search{width:100%;box-sizing:border-box;height:28px;border-radius:8px;border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);outline:none;padding:0 8px;font-size:13px;line-height:20px;font-family:inherit}",
			".mfp-search:focus{border-color:var(--dsw-alias-border-inverted);background:none}",
			".mfp-search::placeholder{color:var(--dsw-alias-label-caption)}",
			".mfp-filters{display:flex;align-items:center;gap:4px;padding:0 2px 6px;flex-wrap:wrap}",
			".mfp-filtersLabel{color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px;margin-right:2px}",
			".mfp-filter{background:none;border:1px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;line-height:16px;cursor:pointer;font-family:inherit}",
			".mfp-filter:hover{border-color:var(--dsw-alias-border-inverted);color:var(--dsw-alias-label-primary)}",
			".mfp-filterOn{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-inverted);color:var(--dsw-alias-label-primary)}",
			".mfp-filterCount{color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px;margin-left:auto;white-space:nowrap}",
			".mfp-metaStatus{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px;padding:0 2px 6px}",
			".mfp-metaRetry{background:none;border:none;color:var(--dsw-alias-label-secondary);font:inherit;padding:0;cursor:pointer;text-decoration:underline}",
			".mfp-groups{overflow-y:auto;display:flex;flex-direction:column;gap:2px}",
			".mfp-group{display:flex;flex-direction:column;gap:1px}",
			".mfp-groupTitle{color:var(--dsw-alias-label-caption);font-size:11px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;padding:6px 8px 2px}",
			".mfp-option{display:flex;align-items:center;gap:4px;width:100%;border:none;background:none;color:inherit;font:inherit;text-align:left;border-radius:8px;padding:5px 8px 5px 2px;cursor:pointer}",
			".mfp-option:hover,.mfp-option:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}",
			".mfp-option:disabled{cursor:default;opacity:.6}",
			".mfp-selected{background:var(--dsw-alias-interactive-bg-hover)}",
			".mfp-star{flex:none;width:22px;height:22px;border:none;background:none;padding:0;cursor:pointer;font-size:14px;line-height:22px;color:var(--dsw-alias-label-caption);text-align:center}",
			".mfp-star:hover{color:var(--dsw-alias-label-primary)}",
			".mfp-starOn{color:#eab308}",
			".mfp-copy{display:flex;flex-direction:column;min-width:0;flex:1}",
			".mfp-nameRow{display:flex;align-items:baseline;gap:6px;min-width:0}",
			".mfp-nameRow .mfp-modelName{flex:1 1 auto;min-width:0}",
			".mfp-modelName{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px;line-height:18px}",
			".mfp-cost{flex:none;color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px;white-space:nowrap;padding:0 5px;border:1px solid var(--dsw-alias-border-l3);border-radius:999px}",
			".mfp-description{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".mfp-check{flex:none;width:16px;text-align:center;font-size:13px}",
			".mfp-cell{display:flex;align-items:center;gap:8px;width:100%;border:none;background:none;color:inherit;font:inherit;text-align:left;border-radius:8px;padding:7px 8px;cursor:pointer}",
			".mfp-cell:hover,.mfp-cell:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}",
			".mfp-cellLabel{flex:none;font-size:13px;font-weight:500;line-height:20px}",
			".mfp-cellValue{flex:1;min-width:0;text-align:right;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".mfp-cellChevron{flex:none;color:var(--dsw-alias-label-caption);font-size:14px;line-height:20px}",
			// archived sessions
			".archs-row{display:flex;align-items:center;justify-content:space-between;width:100%;padding:6px 8px 6px 12px;border-radius:8px;background:var(--dsw-alias-bg-module-platform);margin-bottom:4px}",
			".archs-row:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".archs-row-main{background:none;border:none;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer;padding:2px 0;flex:1;min-width:0;display:flex;flex-direction:column}",
			".archs-row-main:hover{color:var(--dsw-alias-label-primary)}",
			".archs-row-main:disabled{cursor:default;opacity:.6}",
			".archs-row-title{font-size:13px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".archs-row-workspace{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".archs-btn{background:none;border:none;color:var(--dsw-alias-label-tertiary);cursor:pointer;padding:4px 8px;border-radius:4px;font-size:14px;line-height:1;flex:none}",
			".archs-btn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}",
			".archs-btn:disabled{opacity:.5;cursor:not-allowed}",
			".archs-btn-restore:hover{color:var(--dsw-alias-state-success-primary)}",
			".archs-overlay-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:100;display:flex;align-items:center;justify-content:center;padding:24px}",
			".archs-overlay{background:var(--dsw-specific-menu);border:1px solid var(--dsw-alias-border-inverted);border-radius:12px;box-shadow:var(--dsw-shadow-lv3);width:100%;max-width:520px;max-height:70vh;display:flex;flex-direction:column;color:var(--dsw-alias-label-primary)}",
			".archs-overlay-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-inverted)}",
			".archs-overlay-header h3{margin:0;font-size:14px;font-weight:600}",
			".archs-close{background:none;border:none;color:var(--dsw-alias-label-tertiary);font-size:18px;cursor:pointer;padding:0 4px;line-height:1}",
			".archs-close:hover{color:var(--dsw-alias-label-primary)}",
			".archs-loading,.archs-empty{padding:24px;text-align:center;color:var(--dsw-alias-label-tertiary)}",
			".archs-error{padding:12px 16px;background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);border-bottom:1px solid var(--dsw-alias-border-inverted);display:flex;align-items:center;gap:8px}",
			".archs-list{overflow-y:auto;padding:8px;flex:1}",
			".archs-settings{padding:16px;display:flex;flex-direction:column;gap:12px}",
			".archs-settings-header{display:flex;align-items:center;justify-content:space-between}",
			".archs-settings-header h3{margin:0;font-size:14px;font-weight:600}",
			".archs-refresh{background:var(--dsw-alias-interactive-bg-hover);border:1px solid var(--dsw-alias-border-inverted);color:var(--dsw-alias-label-primary);padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px}",
			".archs-refresh:hover{background:var(--dsw-alias-interactive-bg-active)}",
			".archs-refresh:disabled{opacity:.6;cursor:not-allowed}",
			".archs-footer-btn{display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;background:none;border:none;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:12px;font-weight:500}",
			".archs-footer-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
			".archs-footer-icon{font-size:10px}",
			// selection reply
			".srp-popup{position:fixed;z-index:300;background:var(--dsw-specific-menu);border:1px solid var(--dsw-alias-border-inverted);border-radius:10px;box-shadow:var(--dsw-shadow-lv3);padding:3px;display:flex}",
			".srp-button{color:var(--dsw-alias-label-primary);background:none;border:none;border-radius:8px;padding:4px 10px;font-size:12px;font-weight:500;line-height:18px;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:6px}",
			".srp-button:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".srp-icon{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:18px}",
		].join("\n");

		// ---------------------------------------------------------------------------
		// Plugin.
		// ---------------------------------------------------------------------------
		const inject = ["slots", "sessions", "conversation", "modelDirectories"];

		function apply(ctx) {
			const slots = ctx.slots;
			sessionsService = ctx.sessions;
			conversationService = ctx.conversation;
			modelDirectoriesService = ctx.modelDirectories;
			insertCss(CSS);

			// Model picker seat.
			slots.inject("conversation.input.model", () =>
				slots.register(
					{
						name: "conversation.input.model",
						priority: -1,
						inject: (sessionId) => {
							let directory = null;
							try {
								directory = modelDirectoriesService.directoryFor(sessionId);
							} catch (error) {
								directory = null;
							}
							if (directory === null) return { available: false };
							return {
								available: true,
								directory: directory.store,
								sessionId,
								sessions: sessionsService,
								load: () => {
									directory.load().catch(() => {});
								},
								select: (selection) => directory.select(selection).then(() => true, () => false),
							};
						},
					},
					ModelSelectPlus,
				),
			);

			// Archived sessions: sidebar footer button.
			slots.inject("sidebar.footer.action", () => slots.register({
				name: "sidebar.footer.action",
				id: "archived-sessions",
				order: 100,
				label: "Archived Sessions",
			}, () => react.createElement(FooterAction)));

			// Archived sessions: settings page.
			slots.inject("settings.section", () => slots.register({
				name: "settings.section",
				id: "archived-sessions",
				order: 999,
				label: "Archived Sessions",
			}, () => react.createElement(ArchivedSettingsPage)));

			// Archived sessions: overlay.
			slots.inject("shell.overlay", () => slots.register({
				name: "shell.overlay",
				id: "archived-sessions-overlay",
				order: 50,
			}, () => react.createElement(ArchivedOverlay)));

			// Selection reply: overlay popup.
			slots.inject("shell.overlay", () => slots.register({
				name: "shell.overlay",
				id: "selection-reply",
				order: 200,
				label: "Selection reply",
			}, () => react.createElement(SelectionReplyOverlay)));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
