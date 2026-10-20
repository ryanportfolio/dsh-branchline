# Proves packages/dsh-command-guard/lib/protect.ps1 on throwaway processes only;
# it never touches a running DSH. Starts cmd -> dummy (a renamed ping.exe)
# through WMI, so the chain stops at WmiPrvSE and never reaches this shell.
# Protects the dummy, tries every common kill shape against it, its cmd parent,
# and their console host, then checks that an unprotected dummy with the same
# name still dies, and that -Release makes the protected one killable again.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$protect = Join-Path $root 'packages\dsh-command-guard\lib\protect.ps1'
$work = Join-Path $root '.tmp\process-protection'
$dummyName = 'dshprotect-dummy'
New-Item -ItemType Directory -Force -Path $work | Out-Null
$dummy = Join-Path $work "$dummyName.exe"
Copy-Item -LiteralPath (Join-Path $env:SystemRoot 'System32\PING.EXE') -Destination $dummy -Force

$failures = New-Object System.Collections.Generic.List[string]
function Check([string]$label, [bool]$ok) {
    if ($ok) { Write-Host "ok   $label" } else { Write-Host "FAIL $label"; $failures.Add($label) }
}
function Alive([int]$id) { [bool](Get-Process -Id $id -ErrorAction SilentlyContinue) }

function Start-Dummy {
    $startup = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }
    $command = 'cmd.exe /d /c ""' + $dummy + '" -n 600 127.0.0.1 >nul"'
    $result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $command; ProcessStartupInformation = $startup }
    if ($result.ReturnValue -ne 0) { throw "Win32_Process.Create failed: $($result.ReturnValue)" }
    $cmdPid = [int]$result.ProcessId
    $deadline = (Get-Date).AddSeconds(10)
    do {
        Start-Sleep -Milliseconds 200
        $child = Get-CimInstance Win32_Process -Filter "ParentProcessId = $cmdPid AND Name = '$dummyName.exe'"
    } until ($child -or (Get-Date) -gt $deadline)
    if (-not $child) { throw 'dummy did not start' }
    [pscustomobject]@{ Cmd = $cmdPid; Dummy = [int]$child.ProcessId }
}

$protected = @()
$spawned = @()
try {
    $a = Start-Dummy
    $spawned += $a.Cmd, $a.Dummy
    $report = & $protect -ProcessId $a.Dummy | ConvertFrom-Json
    $protected = @($report.pids | ForEach-Object { [int]$_.pid })
    $consoleHosts = @($report.pids | Where-Object { $_.name -match '^(?:conhost|OpenConsole)\.exe$' } | ForEach-Object { [int]$_.pid })
    Check 'protect reports no failures' (@($report.failed).Count -eq 0)
    Check 'dummy and cmd parent protected' (($protected -contains $a.Dummy) -and ($protected -contains $a.Cmd))
    Check 'chain stops below WmiPrvSE' (-not (@($report.pids | Where-Object { $_.name -notmatch '^(?:cmd|conhost|OpenConsole|dshprotect-dummy)\.exe$' })))
    Check 'console host protected' ($consoleHosts.Count -gt 0)

    # Windows PowerShell 5.1 turns native stderr into a terminating error under Stop.
    $ErrorActionPreference = 'Continue'
    $node = (Get-Command node -ErrorAction SilentlyContinue).Source
    $attempts = [ordered]@{
        'taskkill /PID /F'                 = { & taskkill /PID $a.Dummy /F *> $null }
        'taskkill /F /IM name'             = { & taskkill /F /IM "$dummyName.exe" *> $null }
        'taskkill /F /T on cmd parent'     = { & taskkill /F /T /PID $a.Cmd *> $null }
        'taskkill /F on console host'      = { foreach ($h in $consoleHosts) { & taskkill /F /PID $h *> $null } }
        'Stop-Process -Id -Force'          = { Stop-Process -Id $a.Dummy -Force -ErrorAction SilentlyContinue }
        'Stop-Process -Name -Force'        = { Stop-Process -Name $dummyName -Force -ErrorAction SilentlyContinue }
        'Get-Process | Stop-Process'       = { Get-Process -Id $a.Dummy | Stop-Process -Force -ErrorAction SilentlyContinue }
        'Process.Kill()'                   = { try { [Diagnostics.Process]::GetProcessById($a.Dummy).Kill() } catch { } }
        'CIM Win32_Process.Terminate'      = { Get-CimInstance Win32_Process -Filter "ProcessId = $($a.Dummy)" | Invoke-CimMethod -MethodName Terminate | Out-Null }
        'node process.kill(pid)'           = { if ($node) { & $node -e "try { process.kill($($a.Dummy)) } catch {}" } }
    }
    foreach ($label in $attempts.Keys) {
        & $attempts[$label]
        Start-Sleep -Milliseconds 300
        Check "survives: $label" ((Alive $a.Dummy) -and (Alive $a.Cmd) -and -not @($consoleHosts | Where-Object { -not (Alive $_) }))
    }

    $b = Start-Dummy
    $spawned += $b.Cmd, $b.Dummy
    & taskkill /F /IM "$dummyName.exe" *> $null
    Start-Sleep -Milliseconds 500
    Check 'name kill still ends an unprotected dummy' (-not (Alive $b.Dummy))
    Check 'name kill spares the protected dummy' (Alive $a.Dummy)

    # The console's creator exits; the console lives on while the dummy is attached.
    $startup = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }
    $created = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = 'cmd.exe /d /c start "" /b "' + $dummy + '" -n 600 127.0.0.1'; ProcessStartupInformation = $startup }
    $creator = [int]$created.ProcessId
    $deadline = (Get-Date).AddSeconds(10)
    do {
        Start-Sleep -Milliseconds 200
        $orphan = Get-CimInstance Win32_Process -Filter "ParentProcessId = $creator AND Name = '$dummyName.exe'"
    } until (($orphan -and -not (Alive $creator)) -or (Get-Date) -gt $deadline)
    $orphanHost = Get-CimInstance Win32_Process -Filter "ParentProcessId = $creator AND Name = 'conhost.exe'"
    Check 'orphan setup: creator exited, console host remains' ($orphan -and $orphanHost -and -not (Alive $creator))
    if ($orphan) {
        $spawned += [int]$orphan.ProcessId
        $orphanReport = & $protect -ProcessId $orphan.ProcessId | ConvertFrom-Json
        $protected += @($orphanReport.pids | ForEach-Object { [int]$_.pid })
        Check 'orphaned console host protected' ($orphanHost -and (@($orphanReport.pids | ForEach-Object { [int]$_.pid }) -contains [int]$orphanHost.ProcessId))
    }

    & $protect -ProcessId $a.Dummy -Release
    Stop-Process -Id $a.Dummy -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
    Check 'killable after -Release' (-not (Alive $a.Dummy))
} finally {
    foreach ($id in $protected) { try { & $protect -ProcessId $id -Release } catch { } }
    foreach ($id in $spawned) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 300
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}

if ($failures.Count) { Write-Host "$($failures.Count) check(s) failed"; exit 1 }
Write-Host 'all process protection checks passed'
