# Launcher GUI callback scope implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep every script-local launcher command callable after WinForms invokes a GUI event closure.

**Architecture:** `New-LauncherGui` resolves each callback dependency to a PowerShell `FunctionInfo` while the launcher script scope is active. Each `.GetNewClosure()` handler captures that command object and invokes it with `&`, preserving the function's original session state and access to nested launcher helpers. The existing `-SelfTest` path reselects a real repository after `New-LauncherGui` returns and fails on callback `CommandNotFoundException` errors.

**Tech Stack:** PowerShell 7, Windows PowerShell 5.1, Windows Forms, GitHub Actions

---

### Task 1: Add the failing callback regression

**Files:**
- Modify: `start-dsh.ps1:889-906`

- [x] **Step 1: Record errors after the GUI factory returns**

Add this immediately before changing the repository selection:

```powershell
$callbackErrorCount = $Error.Count
```

- [x] **Step 2: Fire the selected-repository callback through WinForms**

Remove the two status functions from script command lookup after `New-LauncherGui` has captured its dependencies. Then fire the existing selection handler:

```powershell
if (-not $repoCombo -or $repoCombo.Items.Count -eq 0) {
    throw 'GUI callback self-test requires at least one repository'
}
$callbackErrorCount = $Error.Count
Remove-Item Function:Get-GitStatus
Remove-Item Function:Show-GitStatusPane
$repoCombo.SelectedIndex = -1
$repoCombo.SelectedIndex = 0
$newErrorCount = $Error.Count - $callbackErrorCount
$callbackCommandErrors = if ($newErrorCount -gt 0) {
    @($Error | Select-Object -First $newErrorCount | Where-Object {
        $_.Exception -is [System.Management.Automation.CommandNotFoundException]
    })
} else { @() }
if ($callbackCommandErrors.Count -gt 0) {
    throw ('GUI callback command lookup failed: ' + (($callbackCommandErrors | ForEach-Object { $_.Exception.Message }) -join ' | '))
}
[void]$f.Handle
$f.Close()
$f.Dispose()
```

- [x] **Step 3: Run the regression and confirm failure**

Run:

```powershell
pwsh.exe -NoProfile -STA -File .\start-dsh.ps1 -SelfTest
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\start-dsh.ps1 -SelfTest
```

Expected: both processes exit nonzero and report `Get-GitStatus` as an unrecognized command.

### Task 2: Bind callback commands to their defining session state

**Files:**
- Modify: `start-dsh.ps1:712-878`

- [x] **Step 1: Resolve every launcher function used by an event closure**

Add this beside `$guiState` and `$logQueue`:

```powershell
$commands = [pscustomobject]@{
    FindDshTargetPids     = Get-Command Find-DshTargetPids -CommandType Function
    FindPortSquatter      = Get-Command Find-PortSquatter -CommandType Function
    GetGitStatus          = Get-Command Get-GitStatus -CommandType Function
    GetListenMap          = Get-Command Get-ListenMap -CommandType Function
    SaveLauncherSettings = Get-Command Save-LauncherSettings -CommandType Function
    ShowGitStatusPane     = Get-Command Show-GitStatusPane -CommandType Function
    StartDshProc          = Get-Command Start-DshProc -CommandType Function
    StopDshInstances      = Get-Command Stop-DshInstances -CommandType Function
    SyncPluginSource      = Get-Command Sync-PluginSource -CommandType Function
}
```

- [x] **Step 2: Invoke captured commands inside every closure**

Replace each bare callback call with the matching captured command. Use this form for expressions and statements:

```powershell
$status = & $commands.GetGitStatus -RepoPath $sel
& $commands.ShowGitStatusPane -Status $status -Rtb $rtbStatus
& $commands.SaveLauncherSettings -LastWorkspace $sel
if (-not $SkipSync) { & $commands.SyncPluginSource -Log $addLogLine }
& $commands.StopDshInstances -Port $Port -OwnProc $null -Log $addLogLine
$listenMap = & $commands.GetListenMap
$known = @(& $commands.FindDshTargetPids -Port $Port -ListenMap $listenMap)
$squatter = & $commands.FindPortSquatter -Port $Port -ListenMap $listenMap -Excluded $known
$guiState.Proc = & $commands.StartDshProc -Ws $sel
```

Apply the same `StopDshInstances` form to the Stop button and FormClosing callback.

- [x] **Step 3: Run both launcher self-tests**

Run the two commands from Task 1. Expected: both exit `0` and print `SELFTEST OK` with no command lookup errors.

### Task 3: Run project verification and inspect the patch

**Files:**
- Verify: `start-dsh.ps1`
- Verify: `docs/superpowers/plans/2026-08-26-fix-launcher-gui-callback-scope.md`

- [x] **Step 1: Run existing project gates**

```powershell
.\node_modules\.bin\tsc.cmd -p tsconfig.json --noEmit
.\node_modules\.bin\vitest.cmd run
.\node_modules\.bin\tsc.cmd -p tsconfig.build.json
.\node_modules\.bin\tsdown.cmd
```

Expected: all commands exit `0`.

- [x] **Step 2: Inspect the focused diff**

```powershell
git diff --check
git diff -- start-dsh.ps1 docs/superpowers/plans/2026-08-26-fix-launcher-gui-callback-scope.md
```

Expected: no whitespace errors; changes stay limited to callback command binding, self-test coverage, and this plan. Do not commit without explicit authorization.
