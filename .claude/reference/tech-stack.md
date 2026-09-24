# Tech stack

> Non-default library choices and WHY they were made, so future sessions don't "fix" deliberate picks.

- DSH is pinned (launcher settings `pinnedDshVersion`). Newer releases break our plugins: a session-API rework and a plugin peer-version admission gate. Use the `dsh-upgrade-audit` skill before any upgrade.
- Upstream DSH fixes are backported as exact-string, marker-guarded, version-gated patches on the compiled npx package (`scripts/dsh-core-overrides/`), applied before DSH starts. The browser and host load the compiled `lib/*.js` files, so this works without rebuilding DSH.
- `packages/*/lib/*.js|cjs` are hand-written, tracked JS with no build step. Edit them directly. Root `lib/` is build output and gitignored.
- The launcher is PowerShell (`start-dsh.ps1`) because the target is Windows only.
- Plugins are authored as permanent profile bundles, never dynamic `cordis_define`/`cordis_run` (see the `dsh-plugin-permanent` skill).
