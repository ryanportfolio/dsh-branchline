# start-dsh.ps1 - DeepSeek Harness launcher: repository picker + start.
#
# Double-click Start-DSH.cmd (no arguments)  ->  GUI:
#   pick any local git repo, then launch DSH.
#   DSH Branchline creates each task in a separate checkout based on the
#   freshly fetched remote default branch. This launcher never syncs, switches,
#   resets, stashes, or cleans the selected repository.
#   The window stays open as a mini control panel: Stop, browser reopen, log.
#
# Terminal use is preserved - pass any argument for classic headless mode:
#   .\start-dsh.ps1 -Workspace C:\path\to\repo   # any project
#   .\start-dsh.ps1 -NoGui                       # headless, default workspace
#   .\start-dsh.ps1 -NoOpen                      # dont auto-open browser
#   .\start-dsh.ps1 -KeepExisting                # dont touch running instances
#   .\start-dsh.ps1 -SelfTest                    # build GUI off-screen, exit
#
# Remembers your last repository under LOCALAPPDATA, outside this checkout.
#
# Auto-handover, PORT-INDEPENDENT: finds any running DSH web instance by
# scanning every listening TCP socket owned by a node.exe process, then
# asking each one over HTTP for the DSH fingerprint (__DSH_BOOT__ marker
# in the served page). Confirmed instances are closed before starting fresh.
#
# Safety rules:
#   - only node.exe processes are ever candidates;
#   - off-target ports need the DSH fingerprint before any kill;
#   - the explicit -Port target trusts node ownership alone;
#   - anything else holding a port is left alone (target port squatter -> abort).
#
# First run downloads the package via npx (cached afterwards). Needs Node ^22.19 || >=24.

param(
    [string]$Workspace,
    [string[]]$RepositoryRoot,
    [string]$Version   = '0.1.1-rc.2',
    [int]$Port         = 3080,
    [switch]$NoOpen,
    [switch]$KeepExisting,
    [switch]$NoGui,
    [switch]$SelfTest,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$DshArgs
)

$ErrorActionPreference = 'Stop'

$Script:ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$settingsRoot = if ($env:DSH_LAUNCHER_HOME) {
    $env:DSH_LAUNCHER_HOME
} elseif ($env:LOCALAPPDATA) {
    Join-Path $env:LOCALAPPDATA 'DSH Branchline'
} else {
    Join-Path ([Environment]::GetFolderPath('UserProfile')) '.dsh-branchline'
}
$Script:SettingsFile = Join-Path $settingsRoot 'launcher-settings.json'
$Script:LogQueue = New-Object System.Collections.Concurrent.ConcurrentQueue[string]

# Process output events run on .NET worker threads. A PowerShell scriptblock
# delegate has no runspace there and can terminate Windows PowerShell. Keep the
# event handlers entirely in managed code, then let the UI timer drain the queue.
if (-not ('DshLauncher.ProcessLogCapture' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Concurrent;
using System.Diagnostics;

namespace DshLauncher
{
    public static class ProcessLogCapture
    {
        public static void Attach(Process process, ConcurrentQueue<string> queue)
        {
            if (process == null) throw new ArgumentNullException("process");
            if (queue == null) throw new ArgumentNullException("queue");

            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs args)
            {
                if (!String.IsNullOrEmpty(args.Data)) queue.Enqueue(args.Data);
            };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs args)
            {
                if (!String.IsNullOrEmpty(args.Data)) queue.Enqueue("[err] " + args.Data);
            };
        }
    }
}
'@
}

# --- settings -------------------------------------------------------------

function Get-LauncherSettings {
    if (Test-Path $Script:SettingsFile) {
        try { return Get-Content $Script:SettingsFile -Raw | ConvertFrom-Json } catch { }
    }
    return [pscustomobject]@{ lastWorkspace = '' }
}

function Save-LauncherSettings {
    # Merge instead of overwrite so updateCheck state written by the notice
    # check below survives a normal workspace save.
    param([string]$LastWorkspace)
    $parent = Split-Path -Parent $Script:SettingsFile
    if (-not (Test-Path -LiteralPath $parent)) { [void](New-Item -ItemType Directory -Path $parent -Force) }
    $current = Get-LauncherSettings
    $current | Add-Member -NotePropertyName lastWorkspace -NotePropertyValue $LastWorkspace -Force
    $current | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $Script:SettingsFile -Encoding UTF8
}

# --- update notice ---------------------------------------------------------

# Reports newer @deepseek-ai/dsh releases as a notice only. Read-only: nothing
# is installed, cached, or switched; the -Version pin stays authoritative.
# Results are cached in launcher-settings.json for 6 hours so launches stay
# fast and the script stays quiet when offline.
function Get-DshUpdateNoticeLines {
    param(
        [string]$Version,
        [string]$SettingsFile
    )
    $lines = @()

    $nowUtc = (Get-Date).ToUniversalTime()
    $state = $null
    if (Test-Path -LiteralPath $SettingsFile) {
        try {
            $settings = Get-Content -LiteralPath $SettingsFile -Raw | ConvertFrom-Json
            if ($settings.updateCheck -and $settings.updateCheck.lastCheckedUtc) {
                # Cached verdict is only valid for the same pin it was computed
                # against; a different -Version must recheck.
                $ageMinutes = ($nowUtc - [datetime]$settings.updateCheck.lastCheckedUtc).TotalMinutes
                if ($ageMinutes -ge 0 -and $ageMinutes -lt 360 -and $settings.updateCheck.pinnedVersion -eq $Version) {
                    $state = $settings.updateCheck
                }
            }
        } catch { }
    }

    if (-not $state) {
        $knownLatest = ''
        $isNewer = $false
        try {
            $pkg = Invoke-RestMethod -Uri 'https://registry.npmjs.org/@deepseek-ai%2Fdsh' `
                -Headers @{ 'User-Agent' = 'dsh-launcher-update-notice' } -TimeoutSec 4
            $knownLatest = [string]$pkg.'dist-tags'.latest
            if ($knownLatest -and $knownLatest -ne $Version) {
                # Compare publish timestamps instead of parsing semver; rc
                # suffixes defeat [version]. Newest publish time wins.
                $tLatest = $pkg.time.$knownLatest
                $tPinned = $pkg.time.$Version
                if (-not $tPinned) {
                    $isNewer = $true   # pinned version unknown to npm: treat as outdated
                } elseif ($tLatest -and ([datetime]$tLatest -gt [datetime]$tPinned)) {
                    $isNewer = $true
                }
            }
        } catch {
            # Offline or registry blocked: stay silent, retry on a later launch.
            $knownLatest = ''
        }
        $state = [pscustomobject]@{
            lastCheckedUtc = $nowUtc.ToString('o')
            pinnedVersion  = $Version
            knownLatest    = $knownLatest
            isNewer        = $isNewer
        }
        try {
            $settingsForWrite =
                if (Test-Path -LiteralPath $SettingsFile) {
                    Get-Content -LiteralPath $SettingsFile -Raw | ConvertFrom-Json
                } else {
                    [pscustomobject]@{ lastWorkspace = '' }
                }
            $settingsForWrite | Add-Member -NotePropertyName updateCheck -NotePropertyValue $state -Force
            $settingsForWrite | Select-Object lastWorkspace, updateCheck |
                ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $SettingsFile -Encoding UTF8
        } catch { }
    }

    if ($state.isNewer) {
        $lines += ('NOTICE: DSH update available - launcher pinned {0}, npm latest {1}.' -f $Version, $state.knownLatest)
        $lines += '  Nothing was changed. To move up: edit $Version in start-dsh.ps1 (or pass -Version) and restart.'
        $lines += '  Plugins, sessions, and settings live under ~/.dsh and CoreWise, outside the package.'
    }
    return $lines
}

# --- process helpers ------------------------------------------------------

function Stop-Gracefully {
    param([int]$ProcessId)
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & taskkill /PID $ProcessId *> $null
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    $deadline = (Get-Date).AddSeconds(5)
    while ((Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) -and ((Get-Date) -lt $deadline)) {
        Start-Sleep -Milliseconds 200
    }
    if (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) {
        Write-Host "PID $ProcessId ignored graceful close - force closing."
        try {
            $ErrorActionPreference = 'Continue'
            & taskkill /F /PID $ProcessId *> $null
        } finally {
            $ErrorActionPreference = $previousPreference
        }
        Start-Sleep -Milliseconds 500
    } else {
        Write-Host "PID $ProcessId closed."
    }
}

# --- DSH instance discovery -----------------------------------------------

function Get-ListenMap {
    $listenMap = @{}
    foreach ($line in (netstat -ano)) {
        $fields = $line.Trim() -split '\s+'
        if ($fields.Count -ge 5 -and $fields[0] -eq 'TCP' -and $fields[3] -eq 'LISTENING') {
            $ownerPid  = 0
            $localPort = 0
            if ([int]::TryParse($fields[4], [ref]$ownerPid) -and [int]::TryParse(($fields[1] -split ':')[-1], [ref]$localPort)) {
                if (-not $listenMap.ContainsKey($ownerPid)) {
                    $listenMap[$ownerPid] = New-Object System.Collections.Generic.List[int]
                }
                $listenMap[$ownerPid].Add($localPort)
            }
        }
    }
    return $listenMap
}

function Find-DshTargetPids {
    param([int]$Port, [hashtable]$ListenMap)
    $targets = New-Object System.Collections.Generic.List[int]
    foreach ($procId in $ListenMap.Keys) {
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if (-not $proc -or $proc.Name -ne 'node') { continue }

        foreach ($listenPort in ($ListenMap[$procId] | Sort-Object -Unique)) {
            if ($targets -contains $procId) { break }

            if ($listenPort -eq $Port) {
                # Explicit target port: node ownership alone is trusted.
                $targets.Add($procId)
                break
            }

            # Any other port: confirm identity via the DSH page fingerprint.
            $isDsh = $false
            try {
                $resp = Invoke-WebRequest -Uri ('http://127.0.0.1:' + $listenPort + '/') -UseBasicParsing -TimeoutSec 2
                if ($resp.Content -match '__DSH_BOOT__') { $isDsh = $true }
            } catch { }

            if ($isDsh) { $targets.Add($procId) }
        }
    }
    return $targets
}

function Find-PortSquatter {
    param([int]$Port, [hashtable]$ListenMap, [int[]]$Excluded)
    foreach ($procId in $ListenMap.Keys) {
        if (($ListenMap[$procId] -contains $Port) -and ($Excluded -notcontains $procId)) {
            return [int]$procId
        }
    }
    return 0
}

function Stop-DshInstances {
    # Closes every confirmed DSH instance; optionally also the GUI child process.
    param([int]$Port, [System.Diagnostics.Process]$OwnProc, $Log)
    $listenMap = Get-ListenMap
    $targets = @(Find-DshTargetPids -Port $Port -ListenMap $listenMap)
    if ($OwnProc -and -not $OwnProc.HasExited -and ($targets -notcontains $OwnProc.Id)) {
        $targets += $OwnProc.Id
    }
    if ($targets.Count -eq 0) {
        & $Log 'No running DSH instance found.'
        return
    }
    foreach ($t in $targets) {
        & $Log ("Closing DSH instance PID {0}..." -f $t)
        Stop-Gracefully -ProcessId $t
    }
    Start-Sleep -Milliseconds 800   # let sockets settle
}

# --- git ------------------------------------------------------------------

function Invoke-Git {
    # Runs git with the given arguments; returns object with Ok (bool) and Out (string[]).
    $previousPreference = $ErrorActionPreference
    $gitExit = 1
    try {
        # Windows PowerShell 5.1 wraps native stderr as ErrorRecord objects.
        # Keep expected Git failures inside this result instead of terminating the GUI.
        $ErrorActionPreference = 'Continue'
        $out = & git @args 2>&1
        $gitExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    [pscustomobject]@{
        Ok  = ($gitExit -eq 0)
        Out = @($out | ForEach-Object { $_.ToString() })
    }
}

function Get-RepositoryRoots {
    $profile = [Environment]::GetFolderPath('UserProfile')
    $configured = @()
    if ($RepositoryRoot) { $configured += $RepositoryRoot }
    if ($env:DSH_REPO_ROOT) { $configured += $env:DSH_REPO_ROOT -split [IO.Path]::PathSeparator }
    $candidates = @($configured)
    try { $candidates += (Get-Location).Path } catch { }
    $candidates += @(
        (Join-Path $profile 'source'),
        (Join-Path $profile 'src'),
        (Join-Path $profile 'projects'),
        (Join-Path $profile 'repos'),
        (Join-Path $profile 'Documents\GitHub')
    )

    $seen = @{}
    foreach ($candidate in $candidates) {
        if (-not $candidate -or -not (Test-Path -LiteralPath $candidate -PathType Container)) { continue }
        $full = [IO.Path]::GetFullPath($candidate)
        $key = $full.ToLowerInvariant()
        if (-not $seen.ContainsKey($key)) {
            $seen[$key] = $true
            $full
        }
    }
}

function Get-RepoPaths {
    $repos = New-Object System.Collections.Generic.List[string]
    foreach ($root in (Get-RepositoryRoots)) {
        if (Test-Path -LiteralPath (Join-Path $root '.git')) {
            if ($repos -notcontains $root) { $repos.Add($root) }
            continue
        }
        foreach ($dir in (Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue | Sort-Object Name)) {
            if ((Test-Path -LiteralPath (Join-Path $dir.FullName '.git')) -and ($repos -notcontains $dir.FullName)) {
                $repos.Add($dir.FullName)
            }
        }
    }
    return @($repos | Sort-Object)
}

function Get-GitStatus {
    param([string]$RepoPath)
    $st = [pscustomobject]@{
        Valid = $false; Branch = ''; DefaultBranch = 'main'; Remote = 'origin/main'
        Ahead = 0; Behind = 0; DirtyCount = 0; DirtyFiles = @(); Head = ''; Error = ''
    }
    $root = Invoke-Git -C $RepoPath rev-parse --is-inside-work-tree
    if (-not $root.Ok) { $st.Error = 'not a git work tree'; return $st }
    $st.Valid = $true

    $branch = Invoke-Git -C $RepoPath branch --show-current
    $st.Branch = if ($branch.Ok -and $branch.Out.Count -gt 0) { $branch.Out[0] } else { '' }
    if (-not $st.Branch) { $st.Branch = '(detached)' }

    $sym = Invoke-Git -C $RepoPath symbolic-ref --short refs/remotes/origin/HEAD
    if ($sym.Ok -and $sym.Out.Count -gt 0 -and $sym.Out[0]) {
        $st.Remote = $sym.Out[0]
    } else {
        $st.Remote = 'origin/main'
    }
    $st.DefaultBranch = $st.Remote -replace '^origin/', ''

    $ab = Invoke-Git -C $RepoPath rev-list --left-right --count ("HEAD...{0}" -f $st.Remote)
    if ($ab.Ok -and $ab.Out.Count -gt 0) {
        $parts = $ab.Out[0] -split '\s+'
        if ($parts.Count -ge 2) { $st.Ahead = [int]$parts[0]; $st.Behind = [int]$parts[1] }
    }

    $dirty = Invoke-Git -C $RepoPath status --porcelain --untracked-files=no
    if ($dirty.Ok) {
        $st.DirtyFiles = @($dirty.Out | Where-Object { $_ -and $_.Trim() })
        $st.DirtyCount = $st.DirtyFiles.Count
    }

    $log = Invoke-Git -C $RepoPath log -1 --date=relative --format='%h %s (%cr)'
    if ($log.Ok -and $log.Out.Count -gt 0) { $st.Head = $log.Out[0] }
    return $st
}

# --- server spawn ---------------------------------------------------------

function Start-DshProc {
    # Spawns npx dsh web detached from this console, output wired to LogQueue.
    param([string]$Ws)
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $env:ComSpec
    $argStr = '/c npx -y "@deepseek-ai/dsh@' + $Version + '" web'
    if ($NoOpen) { $argStr += ' --no-open' }
    if ($DshArgs) { foreach ($a in $DshArgs) { $argStr += ' "' + $a + '"' } }
    $psi.Arguments = $argStr
    $psi.WorkingDirectory = $Ws
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $p = [System.Diagnostics.Process]::Start($psi)

    [DshLauncher.ProcessLogCapture]::Attach($p, $Script:LogQueue)
    $p.BeginOutputReadLine()
    $p.BeginErrorReadLine()
    return $p
}

function Test-ProcessLogCapture {
    $queue = New-Object System.Collections.Concurrent.ConcurrentQueue[string]
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $env:ComSpec
    $psi.Arguments = '/d /c "echo async-out & echo async-err 1>&2"'
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $p = [System.Diagnostics.Process]::Start($psi)
    [DshLauncher.ProcessLogCapture]::Attach($p, $queue)
    $p.BeginOutputReadLine()
    $p.BeginErrorReadLine()
    if (-not $p.WaitForExit(5000)) {
        try { $p.Kill() } catch { }
        throw 'async process log self-test timed out'
    }
    $p.WaitForExit()

    $lines = New-Object System.Collections.Generic.List[string]
    $line = $null
    while ($queue.TryDequeue([ref]$line)) { [void]$lines.Add($line) }
    $normalized = @($lines | ForEach-Object { $_.TrimEnd() })
    if ($normalized -notcontains 'async-out' -or $normalized -notcontains '[err] async-err') {
        throw ('async process log self-test failed: ' + ($lines -join ' | '))
    }
}

# --- headless mode (original behavior) -------------------------------------

function Start-Headless {
    param([string]$Ws)

    $listenMap = Get-ListenMap
    $targets = @(Find-DshTargetPids -Port $Port -ListenMap $listenMap)

    if ($targets.Count -gt 0 -and $KeepExisting) {
        Write-Warning ("Running DSH instance(s) detected (PID: {0}) but -KeepExisting set - leaving them alone." -f ($targets -join ', '))
    } elseif ($targets.Count -gt 0) {
        Write-Host ("Closing existing DSH instance(s): PID {0}" -f ($targets -join ', '))
        foreach ($t in $targets) { Stop-Gracefully -ProcessId $t }
        Start-Sleep -Milliseconds 800   # let sockets settle
    }

    if (-not $KeepExisting) {
        $squatter = Find-PortSquatter -Port $Port -ListenMap $listenMap -Excluded $targets
        if ($squatter -gt 0) {
            $proc = Get-Process -Id $squatter -ErrorAction SilentlyContinue
            $pname = if ($proc) { $proc.Name } else { 'unknown' }
            Write-Warning ("Port {0} is held by '{1}' (PID {2}) - not a node/DSH process. Refusing to close it. Close it manually or pick another port with -Port <n>." -f $Port, $pname, $squatter)
            exit 1
        }
    }

    $npxArgs = @('-y', "@deepseek-ai/dsh@$Version", 'web')
    if ($NoOpen) { $npxArgs += '--no-open' }
    if ($DshArgs) { $npxArgs += $DshArgs }

    Write-Host "Starting DSH web UI (workspace: $Ws)"
    Write-Host "Stop with Ctrl+C or close this window."

    Push-Location $Ws
    try { & npx @npxArgs }
    finally { Pop-Location }
}

# --- GUI -------------------------------------------------------------------

function Show-GitStatusPane {
    param($Status, $Rtb)
    $Rtb.Clear()
    $append = {
        param($text, $color)
        $Rtb.SelectionStart = $Rtb.TextLength
        $Rtb.SelectionColor = $color
        $Rtb.AppendText($text)
        $Rtb.SelectionColor = $Rtb.ForeColor
    }
    if (-not $Status.Valid) {
        & $append (('NOT A GIT REPOSITORY' + [Environment]::NewLine)) ([System.Drawing.Color]::FromArgb(178, 34, 34))
        return
    }
    $syncState = 'up to date with origin'
    $syncColor = [System.Drawing.Color]::FromArgb(34, 139, 34)
    if ($Status.Behind -gt 0) {
        $syncState = ('{0} behind origin' -f $Status.Behind)
        $syncColor = [System.Drawing.Color]::FromArgb(255, 140, 0)
    }
    if ($Status.DirtyCount -gt 0) {
        $syncState += ('  |  {0} UNCOMMITTED FILE(S)' -f $Status.DirtyCount)
        $syncColor = [System.Drawing.Color]::FromArgb(178, 34, 34)
    }
    & $append (('branch: {0}    {1}{2}' -f $Status.Branch, $syncState, [Environment]::NewLine)) $syncColor
    $aheadNote = ''
    if ($Status.Ahead -gt 0) { $aheadNote = ('   ({0} local commit(s) not on origin)' -f $Status.Ahead) }
    & $append ((('vs {0}: behind {1}, ahead {2}{3}' -f $Status.Remote, $Status.Behind, $Status.Ahead, $aheadNote) + [Environment]::NewLine)) ([System.Drawing.Color]::FromArgb(105, 105, 105))
    if ($Status.Head) { & $append (($Status.Head + [Environment]::NewLine)) ([System.Drawing.Color]::FromArgb(105, 105, 105)) }
}

function New-LauncherGui {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    try { Add-Type -AssemblyName System.Drawing.Common } catch { }
    [System.Windows.Forms.Application]::EnableVisualStyles()

    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'DSH Branchline'
    $form.Size = New-Object System.Drawing.Size(720, 570)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedSingle'
    $form.MaximizeBox = $false

    $lblRepo = New-Object System.Windows.Forms.Label
    $lblRepo.Text = 'Repository:'
    $lblRepo.Location = New-Object System.Drawing.Point(12, 17)
    $lblRepo.AutoSize = $true

    $combo = New-Object System.Windows.Forms.ComboBox
    $combo.Location = New-Object System.Drawing.Point(86, 13)
    $combo.Size = New-Object System.Drawing.Size(498, 24)
    $combo.DropDownStyle = [System.Windows.Forms.ComboBoxStyle]::DropDownList

    $btnBrowse = New-Object System.Windows.Forms.Button
    $btnBrowse.Text = 'Browse...'
    $btnBrowse.Location = New-Object System.Drawing.Point(592, 11)
    $btnBrowse.Size = New-Object System.Drawing.Size(100, 26)

    $rtbStatus = New-Object System.Windows.Forms.RichTextBox
    $rtbStatus.Location = New-Object System.Drawing.Point(12, 46)
    $rtbStatus.Size = New-Object System.Drawing.Size(680, 60)
    $rtbStatus.ReadOnly = $true
    $rtbStatus.BorderStyle = 'None'
    $rtbStatus.BackColor = [System.Drawing.Color]::FromArgb(240, 240, 240)
    $rtbStatus.Font = New-Object System.Drawing.Font('Consolas', 9)

    $btnStart = New-Object System.Windows.Forms.Button
    $btnStart.Text = 'Start'
    $btnStart.Location = New-Object System.Drawing.Point(12, 116)
    $btnStart.Size = New-Object System.Drawing.Size(90, 30)

    $btnStop = New-Object System.Windows.Forms.Button
    $btnStop.Text = 'Stop'
    $btnStop.Location = New-Object System.Drawing.Point(110, 116)
    $btnStop.Size = New-Object System.Drawing.Size(70, 30)
    $btnStop.Enabled = $false

    $btnBrowser = New-Object System.Windows.Forms.Button
    $btnBrowser.Text = 'Open browser'
    $btnBrowser.Location = New-Object System.Drawing.Point(188, 116)
    $btnBrowser.Size = New-Object System.Drawing.Size(110, 30)
    $btnBrowser.Enabled = $false

    $lblIsolation = New-Object System.Windows.Forms.Label
    $lblIsolation.Text = 'New tasks: fresh origin/HEAD -> isolated worktree'
    $lblIsolation.Location = New-Object System.Drawing.Point(312, 123)
    $lblIsolation.AutoSize = $true

    $txtLog = New-Object System.Windows.Forms.TextBox
    $txtLog.Location = New-Object System.Drawing.Point(12, 156)
    $txtLog.Size = New-Object System.Drawing.Size(680, 366)
    $txtLog.Multiline = $true
    $txtLog.ReadOnly = $true
    $txtLog.ScrollBars = 'Vertical'
    $txtLog.WordWrap = $false
    $txtLog.Font = New-Object System.Drawing.Font('Consolas', 9)

    foreach ($c in @($lblRepo, $combo, $btnBrowse, $rtbStatus, $btnStart, $btnStop, $btnBrowser, $lblIsolation, $txtLog)) {
        [void]$form.Controls.Add($c)
    }

    # GetNewClosure creates a dynamic module. Its $Script: scope is not this
    # launcher's script scope, so callbacks must capture shared objects directly.
    $guiState = [pscustomobject]@{ Proc = $null }
    $logQueue = $Script:LogQueue

    $addLogLine = ({
        param($text)
        $txtLog.AppendText($text + [Environment]::NewLine)
        $txtLog.SelectionStart = $txtLog.TextLength
        $txtLog.ScrollToCaret()
    }).GetNewClosure()

    $refreshStatus = ({
        $sel = $combo.SelectedItem
        if ($sel) {
            $form.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
            try { Show-GitStatusPane -Status (Get-GitStatus -RepoPath $sel) -Rtb $rtbStatus }
            finally { $form.Cursor = [System.Windows.Forms.Cursors]::Default }
        } else {
            $rtbStatus.Clear()
        }
    }).GetNewClosure()

    # populate repo list + remembered selection
    foreach ($r in (Get-RepoPaths)) { [void]$combo.Items.Add($r) }
    $settings = Get-LauncherSettings
    $pick = if ($Workspace) { $Workspace } else { $settings.lastWorkspace }
    if ($combo.Items -contains $pick) { $combo.SelectedItem = $pick }
    elseif ($pick -and (Test-Path -LiteralPath (Join-Path $pick '.git'))) {
        [void]$combo.Items.Insert(0, $pick)
        $combo.SelectedItem = $pick
    }
    elseif ($combo.Items.Count -gt 0) { $combo.SelectedIndex = 0 }
    & $refreshStatus

    $combo.Add_SelectedIndexChanged(({
        & $refreshStatus
    }).GetNewClosure())

    $btnBrowse.Add_Click(({
        $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
        $dlg.Description = 'Pick a git repository folder'
        if ($dlg.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) {
            $p = $dlg.SelectedPath
            if (Test-Path (Join-Path $p '.git')) {
                if ($combo.Items -notcontains $p) { [void]$combo.Items.Insert(0, $p) }
                $combo.SelectedItem = $p
            } else {
                [System.Windows.Forms.MessageBox]::Show(
                    ($p + [Environment]::NewLine + 'is not a git repository (no .git entry).'),
                    'DSH Branchline',
                    [System.Windows.Forms.MessageBoxButtons]::OK,
                [System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
            }
        }
    }).GetNewClosure())

    $btnStop.Add_Click(({
        $btnStop.Enabled = $false
        try {
            Stop-DshInstances -Port $Port -OwnProc $guiState.Proc -Log $addLogLine
            $guiState.Proc = $null
        } catch {
            & $addLogLine ('stop error: ' + $_.Exception.Message)
        } finally {
            $btnBrowser.Enabled = $false
            $btnStart.Enabled = $true
            & $addLogLine 'Stopped.'
        }
    }).GetNewClosure())

    $btnBrowser.Add_Click(({
        Start-Process ('http://127.0.0.1:{0}/' -f $Port)
    }).GetNewClosure())

    $btnStart.Add_Click(({
        $sel = $combo.SelectedItem
        if (-not $sel) {
            [System.Windows.Forms.MessageBox]::Show('Pick a repository first.', 'DSH Branchline') | Out-Null
            return
        }
        Save-LauncherSettings -LastWorkspace $sel
        $btnStart.Enabled = $false
        $form.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
        try {
            # 1) handover: close existing DSH instances
            if ($KeepExisting) {
                & $addLogLine '-KeepExisting set - leaving any running DSH alone.'
            } else {
                Stop-DshInstances -Port $Port -OwnProc $null -Log $addLogLine
            }

            # 2) squatter check
            $listenMap = Get-ListenMap
            $known = @(Find-DshTargetPids -Port $Port -ListenMap $listenMap)
            $squatter = Find-PortSquatter -Port $Port -ListenMap $listenMap -Excluded $known
            if ($squatter -gt 0) {
                $proc = Get-Process -Id $squatter -ErrorAction SilentlyContinue
                $pname = if ($proc) { $proc.Name } else { 'unknown' }
                & $addLogLine ('REFUSING to start: port {0} is held by "{1}" (PID {2}) - not a node/DSH process.' -f $Port, $pname, $squatter)
                & $addLogLine 'Close it manually, then press Start again.'
                $btnStart.Enabled = $true
                return
            }

            # 3) launch
            & $addLogLine ('Starting DSH web UI in ' + $sel)
            $guiState.Proc = Start-DshProc -Ws $sel
            $btnStop.Enabled = $true
            $btnBrowser.Enabled = $true
            & $addLogLine ('DSH starting at http://127.0.0.1:{0}/  (first run may download the package)' -f $Port)
        } catch {
            & $addLogLine ('start error: ' + $_.Exception.Message)
            $btnStart.Enabled = $true
        } finally {
            $form.Cursor = [System.Windows.Forms.Cursors]::Default
        }
    }).GetNewClosure())

    # drain the log queue onto the UI thread
    $timer = New-Object System.Windows.Forms.Timer
    $timer.Interval = 250
    $timerTick = ({
        $line = $null
        $gotAny = $false
        while ($logQueue.TryDequeue([ref]$line)) {
            $txtLog.AppendText($line + [Environment]::NewLine)
            $gotAny = $true
        }
        if ($gotAny) {
            $txtLog.SelectionStart = $txtLog.TextLength
            $txtLog.ScrollToCaret()
        }
        if ($guiState.Proc -and $guiState.Proc.HasExited -and $btnStop.Enabled) {
            $btnStop.Enabled = $false
            $btnBrowser.Enabled = $false
            $btnStart.Enabled = $true
            & $addLogLine ('DSH process exited (exit code {0}).' -f $guiState.Proc.ExitCode)
            $guiState.Proc = $null
        }
    }).GetNewClosure()
    $timer.Add_Tick($timerTick)

    $form.Add_FormClosing(({
        param($s, $e)
        if ($guiState.Proc -and -not $guiState.Proc.HasExited) {
            $answer = [System.Windows.Forms.MessageBox]::Show(
                ('DSH is still running.' + [Environment]::NewLine + [Environment]::NewLine +
                 'Yes     - stop DSH, then close' + [Environment]::NewLine +
                 'No      - leave DSH running, close launcher' + [Environment]::NewLine +
                 'Cancel - stay here'),
                'DSH Branchline',
                [System.Windows.Forms.MessageBoxButtons]::YesNoCancel,
                [System.Windows.Forms.MessageBoxIcon]::Warning)
            if ($answer -eq [System.Windows.Forms.DialogResult]::Cancel) { $e.Cancel = $true; return }
            if ($answer -eq [System.Windows.Forms.DialogResult]::Yes) {
                Stop-DshInstances -Port $Port -OwnProc $guiState.Proc -Log $addLogLine
            } else {
                & $addLogLine 'Launcher closed; DSH left running.'
            }
        }
        $timer.Stop()
    }).GetNewClosure())

    if ($SelfTest) {
        $form.Tag = [pscustomobject]@{ TimerTick = $timerTick }
    }
    $timer.Start()
    return $form
}

# --- main dispatch ----------------------------------------------------------

if ($SelfTest) {
    Test-ProcessLogCapture
    $f = New-LauncherGui
    if ($f -isnot [System.Windows.Forms.Form]) { Write-Error 'GUI build failed'; exit 1 }
    $childCount = $f.Controls.Count
    if (-not $f.Tag -or -not $f.Tag.TimerTick) { Write-Error 'GUI timer callback unavailable'; exit 1 }
    & $f.Tag.TimerTick $null ([System.EventArgs]::Empty)
    $repoCombo = @($f.Controls | Where-Object { $_ -is [System.Windows.Forms.ComboBox] })[0]
    if ($repoCombo -and $repoCombo.Items.Count -gt 0) {
        # Exercise the callback after New-LauncherGui has returned. This catches
        # lost local variables in event scriptblocks without querying another repo.
        $repoCombo.SelectedIndex = -1
    }
    [void]$f.Handle
    $f.Close()
    $f.Dispose()
    Write-Host ("SELFTEST OK - async output plus form with {0} controls; timer, selection, and close handlers passed." -f $childCount)
    exit 0
}

if ($PSBoundParameters.Count -eq 0 -and -not $NoGui) {
    # Update notice lands at the top of the launcher log pane via the shared queue.
    foreach ($line in (Get-DshUpdateNoticeLines -Version $Version -SettingsFile $Script:SettingsFile)) {
        $Script:LogQueue.Enqueue($line)
    }
    $gui = New-LauncherGui
    [void]$gui.ShowDialog()
    exit 0
}

$ws = if ($Workspace) { $Workspace } else { @(Get-RepoPaths) | Select-Object -First 1 }
if (-not $ws) {
    Write-Error 'No repository found. Pass -Workspace C:\path\to\repo or set DSH_REPO_ROOT.'
    exit 1
}
if (-not (Test-Path $ws)) {
    Write-Error ("Workspace not found: {0}" -f $ws)
    exit 1
}
foreach ($line in (Get-DshUpdateNoticeLines -Version $Version -SettingsFile $Script:SettingsFile)) {
    Write-Host $line -ForegroundColor Yellow
}
Start-Headless -Ws $ws
