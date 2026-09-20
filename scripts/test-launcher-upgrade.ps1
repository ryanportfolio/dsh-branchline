$ErrorActionPreference = 'Stop'
$sourcePath = Join-Path (Split-Path -Parent $PSScriptRoot) 'start-dsh.ps1'
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($sourcePath, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
$functions = @('Get-LauncherSettings', 'Save-LauncherSettings', 'Set-LauncherPinnedVersion', 'Resolve-LauncherVersion', 'Get-DshUpdateNoticeLines', 'New-LauncherVersionPreparation', 'Complete-LauncherVersionPreparation', 'Invoke-DshUpgrade', 'Get-DshLatestVersion')
foreach ($name in $functions) {
    $definition = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
    if (-not $definition) { throw "Missing production function $name" }
    . ([scriptblock]::Create($definition.Extent.Text))
}
function Assert-Equal($Actual, $Expected, $Label) {
    if ($Actual -cne $Expected) { throw "$Label expected '$Expected', got '$Actual'" }
    Write-Host "PASS $Label"
}
function Assert-Throws([scriptblock]$Action, [string]$Label) {
    $threw = $false
    try { & $Action | Out-Null } catch { $threw = $true }
    Assert-Equal $threw $true $Label
}
$testHome = Join-Path ([IO.Path]::GetTempPath()) ('dsh-launcher-test-' + [guid]::NewGuid().ToString('N'))
$Script:SettingsFile = Join-Path $testHome 'launcher-settings.json'
try {
    $before = (Get-FileHash -LiteralPath $sourcePath).Hash
    Assert-Throws { Resolve-LauncherVersion '0.1.1-rc.2' $false } 'missing settings fail closed'
    Assert-Equal (Resolve-LauncherVersion '0.1.5-rc.2' $true) '0.1.5-rc.2' 'explicit bootstrap override'
    Assert-Equal (Test-Path $Script:SettingsFile) $false 'override never persists selection'
    Set-LauncherPinnedVersion '0.1.5-rc.2' | Out-Null
    Assert-Equal (Resolve-LauncherVersion '0.1.1-rc.2' $false) '0.1.5-rc.2' 'saved version survives reload'
    Assert-Equal (Resolve-LauncherVersion '0.1.2' $true) '0.1.2' 'explicit Version overrides saved version'
    Save-LauncherSettings 'C:\example\repo'
    Assert-Equal (Resolve-LauncherVersion '0.1.1-rc.2' $false) '0.1.5-rc.2' 'workspace save preserves version'
    function Invoke-RestMethod {
        return [pscustomobject]@{
            'dist-tags' = [pscustomobject]@{ latest = '0.1.5-rc.2' }
            time = [pscustomobject]@{ '0.1.5-rc.2' = '2026-09-19T00:00:00Z' }
        }
    }
    Get-DshUpdateNoticeLines '0.1.5-rc.2' $Script:SettingsFile | Out-Null
    Assert-Equal (Resolve-LauncherVersion '0.1.1-rc.2' $false) '0.1.5-rc.2' 'notice refresh preserves version'
    Set-LauncherPinnedVersion '0.1.5-rc.2' | Out-Null
    Assert-Equal (Get-LauncherSettings).lastWorkspace 'C:\example\repo' 'upgrade preserves workspace'
    Assert-Equal ([bool](Get-LauncherSettings).updateCheck) $false 'upgrade clears notice cache'
    $beforeInvalid = [IO.File]::ReadAllText($Script:SettingsFile)
    $rejected = $false
    try { Set-LauncherPinnedVersion 'invalid' | Out-Null } catch { $rejected = $true }
    Assert-Equal $rejected $true 'invalid upgrade rejected'
    Assert-Equal ([IO.File]::ReadAllText($Script:SettingsFile)) $beforeInvalid 'invalid upgrade leaves settings unchanged'
    [IO.File]::WriteAllText($Script:SettingsFile, '{broken')
    $rejected = $false
    try { Set-LauncherPinnedVersion '0.1.5-rc.2' | Out-Null } catch { $rejected = $true }
    Assert-Equal $rejected $true 'malformed settings not overwritten'
    Assert-Equal ([IO.File]::ReadAllText($Script:SettingsFile)) '{broken' 'malformed settings preserved'
    Assert-Throws { Resolve-LauncherVersion '0.1.1-rc.2' $false } 'malformed settings fail closed'
    foreach ($invalid in @('null', '[]', '[{}]', '[{"pinnedDshVersion":"0.1.5-rc.2"}]', '123', '"text"', '{}', '{"pinnedDshVersion":"bad"}', '{"pinnedDshVersion":123}')) {
        [IO.File]::WriteAllText($Script:SettingsFile, $invalid)
        Assert-Throws { Resolve-LauncherVersion '0.1.1-rc.2' $false } ('invalid settings fail closed: ' + $invalid)
    }
    [IO.File]::WriteAllText($Script:SettingsFile, '{}')
    Set-LauncherPinnedVersion '0.1.5-rc.2'
    $locked = [IO.File]::Open($Script:SettingsFile, 'Open', 'ReadWrite', 'None')
    try { Assert-Throws { Resolve-LauncherVersion '0.1.1-rc.2' $false } 'unreadable settings fail closed' }
    finally { $locked.Dispose() }
    $saved = [IO.File]::ReadAllText($Script:SettingsFile)
    Resolve-LauncherVersion '0.1.2' $true | Out-Null
    Assert-Equal ([IO.File]::ReadAllText($Script:SettingsFile)) $saved 'explicit override leaves saved selection unchanged'

    $script:events = New-Object System.Collections.Generic.List[string]
    $script:latest = '0.1.6-rc.1'
    function Invoke-RestMethod { $script:events.Add('query'); return [pscustomobject]@{ 'dist-tags' = [pscustomobject]@{ latest = $script:latest } } }
    $prepareReal = (Get-Command New-LauncherVersionPreparation).ScriptBlock
    $commitReal = (Get-Command Complete-LauncherVersionPreparation).ScriptBlock
    function New-LauncherVersionPreparation { param($NewVersion) $script:events.Add('prepare'); & $prepareReal $NewVersion }
    function Complete-LauncherVersionPreparation { param($PreparedFile) $script:events.Add('commit'); & $commitReal $PreparedFile }
    $confirm = { param($v) $script:events.Add('confirm:' + $v); return $true }
    $stop = { $script:events.Add('stop'); Assert-Equal (Resolve-LauncherVersion '' $false) '0.1.5-rc.2' 'old selection remains until stop succeeds' }
    Assert-Equal (Invoke-DshUpgrade -CurrentVersion '0.1.5-rc.2' -Confirm $confirm -Stop $stop) '0.1.6-rc.1' 'upgrade returns queried selection'
    Assert-Equal ($script:events -join ',') 'query,confirm:0.1.6-rc.1,prepare,stop,commit' 'upgrade ordering and single query'
    Assert-Equal (Resolve-LauncherVersion '' $false) '0.1.6-rc.1' 'exact queried selection committed'
    foreach ($case in @('same', 'cancel', 'offline', 'invalid', 'prepare', 'stop', 'commit')) {
        & $prepareReal '0.1.5-rc.2' | ForEach-Object { & $commitReal $_ }
        $beforeCase = [IO.File]::ReadAllText($Script:SettingsFile)
        $script:events.Clear()
        $script:latest = switch ($case) { 'same' { '0.1.5-rc.2' } 'offline' { '' } 'invalid' { 'evil' } default { '0.1.6-rc.1' } }
        $caseConfirm = { param($v) $script:events.Add('confirm'); return $case -ne 'cancel' }
        $caseStop = { $script:events.Add('stop'); if ($case -eq 'stop') { throw 'mock stop failure' } }
        function New-LauncherVersionPreparation {
            param($NewVersion) $script:events.Add('prepare')
            if ($case -eq 'prepare') { throw 'mock disk full' }
            & $prepareReal $NewVersion
        }
        function Complete-LauncherVersionPreparation {
            param($PreparedFile) $script:events.Add('commit')
            if ($case -eq 'commit') { throw 'mock commit race' }
            & $commitReal $PreparedFile
        }
        if ($case -in @('same', 'cancel')) { Invoke-DshUpgrade '0.1.5-rc.2' $caseConfirm $caseStop | Out-Null }
        else { Assert-Throws { Invoke-DshUpgrade '0.1.5-rc.2' $caseConfirm $caseStop } ($case + ' rejected') }
        Assert-Equal ([IO.File]::ReadAllText($Script:SettingsFile)) $beforeCase ($case + ' preserves settings')
        Assert-Equal (@($script:events | Where-Object { $_ -eq 'query' }).Count) 1 ($case + ' single query')
        Assert-Equal ($script:events.Contains('stop')) ($case -in @('stop', 'commit')) ($case + ' stop boundary')
        Assert-Equal (@(Get-ChildItem $testHome -Filter '*.tmp').Count) 0 ($case + ' preparation cleaned')
    }
    # Run the actual GUI closure with registry mocked and no child process.
    foreach ($name in @('New-LauncherVersionPreparation', 'Complete-LauncherVersionPreparation', 'New-LauncherGui')) {
        $definition = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
        . ([scriptblock]::Create($definition.Extent.Text))
    }
    function Get-RepoPaths { Split-Path -Parent $sourcePath }
    function Get-GitStatus { return [pscustomobject]@{} }
    function Show-GitStatusPane { }
    function Find-DshTargetPids { throw 'unexpected process discovery' }
    function Find-PortSquatter { throw 'unexpected process discovery' }
    function Get-ListenMap { throw 'unexpected process discovery' }
    function Start-DshProc { throw 'unexpected live launch' }
    function Stop-DshInstances { throw 'unexpected live stop' }
    function Sync-PluginSource { throw 'unexpected sync' }
    $SelfTest = $true
    $Version = '0.1.5-rc.2'
    $Script:LogQueue = New-Object System.Collections.Concurrent.ConcurrentQueue[string]
    $script:events.Clear()
    $script:latest = '0.1.6-rc.1'
    $form = New-LauncherGui
    try {
        Remove-Item Function:Invoke-DshUpgrade
        & $form.Tag.UpgradeClick
        Assert-Equal (Resolve-LauncherVersion '' $false) '0.1.6-rc.1' 'GUI captured command commits exact queried version'
        Assert-Equal ($script:events -join ',') 'query' 'GUI performs one registry request'
        $startButton = @($form.Controls | Where-Object { $_.Text -eq 'Start' })[0]
        Assert-Equal $startButton.Enabled $false 'GUI requires restart after selection'
    } finally { $form.Close(); $form.Dispose() }

    # Exercise the real save-only dispatch in an isolated launcher home.
    $envWas = $env:DSH_LAUNCHER_HOME
    try {
        $env:DSH_LAUNCHER_HOME = Join-Path $testHome 'bootstrap'
        $shellExe = (Get-Process -Id $PID).Path
        & $shellExe -NoProfile -File $sourcePath -SelectVersion '0.1.5-rc.2'
        if ($LASTEXITCODE -ne 0) { throw 'save-only dispatch failed' }
        $bootstrap = Get-Content (Join-Path $env:DSH_LAUNCHER_HOME 'launcher-settings.json') -Raw | ConvertFrom-Json
        Assert-Equal $bootstrap.pinnedDshVersion '0.1.5-rc.2' 'save-only bootstrap respects DSH_LAUNCHER_HOME'
    } finally { $env:DSH_LAUNCHER_HOME = $envWas }
    Assert-Equal (Get-FileHash -LiteralPath $sourcePath).Hash $before 'upgrade leaves launcher source unchanged'
    Write-Host 'ALL UPGRADE CHECKS PASSED'
} finally {
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    $testFull = [IO.Path]::GetFullPath($testHome)
    if (-not $testFull.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or
        (Split-Path -Leaf $testFull) -notlike 'dsh-launcher-test-*') {
        throw 'refusing to remove a test directory outside the temporary root'
    }
    if (Test-Path -LiteralPath $testFull) { Remove-Item -LiteralPath $testFull -Recurse -Force }
}
