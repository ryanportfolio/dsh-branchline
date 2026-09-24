# Commands

> Build / dev / test / deploy commands for this project.

`pnpm` may be missing from PATH on this machine; prefix with `corepack`.

| Command | Purpose |
|---|---|
| `corepack pnpm install` | Install workspace deps (9 projects) |
| `corepack pnpm typecheck` | `tsc --noEmit` |
| `corepack pnpm test` | Vitest suite |
| `corepack pnpm build` | Types + tsdown bundle into gitignored `lib/` |
| `node scripts/verify-companion-plugins.mjs` | Check companion plugins under `packages/` |
| `powershell -NoProfile -File scripts/test-launcher-sync.ps1` | Launcher plugin-sync tests |
| `powershell -NoProfile -File scripts/test-launcher-upgrade.ps1` | Launcher upgrade tests |
| `.start-dsh.ps1 -SelfTest` | Build the launcher GUI off-screen and exit |
| `.start-dsh.ps1` | Launch DSH (user action) |
