# Contributing

## Build

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run build
pnpm run pack:check
pnpm run readme:build
```

Tests create real temporary Git repositories and worktrees. Run the Windows launcher checks after changing `start-dsh.ps1`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-dsh.ps1 -SelfTest
pwsh.exe -NoProfile -File .\start-dsh.ps1 -SelfTest
```

## Pull requests

Keep changes focused. Add a failing test before changing task lifecycle or Git behaviour. Rebuild the generated README instead of editing `README.md` or `assets/readme` by hand.

Never include repository names, user paths, tokens, source files from private projects, or unredacted launcher logs.
