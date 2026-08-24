window.__ModuleLoader__.load({
	id: "dsh-ship-controls",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		// ---------------------------------------------------------------------------
		// Prompts delivered through the composer queue (the session keeps its own
		// git safety rules; these instructions mirror the repo's /merge skill).
		// ---------------------------------------------------------------------------
		const CREATE_PR_PROMPT = [
			"Ship this session's completed work as a GitHub pull request now:",
			"1. git branch --show-current; if on main, create or reuse the session feature branch first - never commit to main directly.",
			"2. Stage only the files this session actually touched (check git status --short first - never blanket-commit unrelated changes). Commit with a clear conventional message ending with the standard Co-Authored-By: trailer, then push (set upstream on first push).",
			"3. Ensure exactly one open PR exists for this head branch: check gh pr list --head <branch> --state open first - if one is open, the push already updated it, so reuse it and do not open a second; otherwise create it with gh pr create --base main --fill.",
			"Report the PR URL when done. Do not merge.",
		].join("\n");

		const MERGE_PR_PROMPT = [
			"Run the full integration cycle on this session's work now - ship it AND squash merge it, even if no PR exists yet:",
			"1. git branch --show-current; if on main, create or reuse the session feature branch first - never commit to main directly.",
			"2. Stage only the files this session actually touched (check git status --short first). Commit with a clear conventional message ending with the standard Co-Authored-By: trailer, then push (set upstream on first push).",
			"3. Ensure exactly one open PR exists for this head branch: check gh pr list --head <branch> --state open first - reuse an open PR instead of opening a second; otherwise create one with gh pr create --base main --fill.",
			"4. git fetch origin, then inspect mergeable / mergeStateStatus. If CONFLICTING: git merge origin/main into the session branch and resolve only unambiguous conflicts yourself; for semantic conflicts, stop and ask in plain prose before committing.",
			"5. Squash merge with gh pr merge <number> --squash. Keep the session branch (never pass --delete-branch). Never use --merge, --rebase, or --admin; if checks or branch protection block the merge, report why and stop there.",
			"6. Report each merged PR URL honestly from real gh output - never claim success you did not verify.",
		].join("\n");

		function insertCss(css) {
			if (typeof document === "undefined") return;
			const id = "dsh-ship-controls";
			if (document.querySelector(`style[data-plugin-css="${id}"]`) !== null) return;
			const style = document.createElement("style");
			style.dataset.pluginCss = id;
			style.textContent = css;
			document.head.appendChild(style);
		}

		const CSS = [
			".shipctl-root{display:inline-flex;align-items:center;gap:2px}",
			".shipctl-btn{min-height:28px;display:inline-flex;align-items:center;gap:4px;padding:3px 6px;",
			"border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);",
			"cursor:pointer;font-size:12px;line-height:18px;font-family:inherit}",
			".shipctl-btn:hover,.shipctl-btn:focus-visible{color:var(--dsw-alias-label-secondary)}",
			".shipctl-btn svg{flex:none}",
		].join("");

		// ---------------------------------------------------------------------------
		// Icons.
		// ---------------------------------------------------------------------------
		function iconProps() {
			return {
				width: 14,
				height: 14,
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				"stroke-width": 1.4,
				"stroke-linecap": "round",
				"stroke-linejoin": "round",
				"aria-hidden": true,
			};
		}

		function ShipIcon() {
			return react.createElement("svg", iconProps(),
				react.createElement("circle", { cx: 4.2, cy: 3.4, r: 1.7 }),
				react.createElement("circle", { cx: 4.2, cy: 12.6, r: 1.7 }),
				react.createElement("circle", { cx: 11.8, cy: 6.2, r: 1.7 }),
				react.createElement("path", { d: "M4.2 5.1v5.8" }),
				react.createElement("path", { d: "M11.8 7.9v.6a2.5 2.5 0 0 1-2.5 2.5H6.6" }),
			);
		}

		function MergeIcon() {
			return react.createElement("svg", iconProps(),
				react.createElement("circle", { cx: 4.2, cy: 3.4, r: 1.7 }),
				react.createElement("circle", { cx: 4.2, cy: 12.6, r: 1.7 }),
				react.createElement("circle", { cx: 11.8, cy: 3.4, r: 1.7 }),
				react.createElement("path", { d: "M4.2 5.1v5.8" }),
				react.createElement("path", { d: "M11.8 5.1v2.4a2.5 2.5 0 0 1-2.5 2.5H6.6" }),
			);
		}

		function ShipButton(props) {
			const icon = props.kind === "merge" ? react.createElement(MergeIcon) : react.createElement(ShipIcon);
			return react.createElement("button", {
				type: "button",
				className: "shipctl-btn",
				title: props.title,
				onClick: props.onClick,
			}, icon, react.createElement("span", null, props.label));
		}

		// ---------------------------------------------------------------------------
		// Session header entry.
		// ---------------------------------------------------------------------------
		function ShipControls(props) {
			const draft = props.useInput(function selectDraft(state) { return state.draft });

			function send(prompt) {
				const existing = typeof draft === "string" && draft.trim().length > 0
					? draft.replace(/\s+$/, "") + "\n\n"
					: "";
				props.inputActions.setDraft(existing + prompt);
				props.inputActions.submit();
			}

			return react.createElement("div", { className: "shipctl-root" },
				react.createElement(ShipButton, {
					kind: "pr",
					label: "Create PR",
					title: "Ask this session to commit, push, and open (or update) its pull request",
					onClick: function () { send(CREATE_PR_PROMPT) },
				}),
				react.createElement(ShipButton, {
					kind: "merge",
					label: "Merge",
					title: "Ask this session to ship AND squash merge its work (creates or updates the PR first)",
					onClick: function () { send(MERGE_PR_PROMPT) },
				}),
			);
		}

		const inject = ["slots"];

		function apply(ctx) {
			const slots = ctx.slots;
			insertCss(CSS);
			slots.inject("conversation.session.header.actions", () =>
				slots.register({
					name: "conversation.session.header.actions",
					id: "ship-controls",
					order: 30,
					label: "Ship controls",
				}, ShipControls),
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
