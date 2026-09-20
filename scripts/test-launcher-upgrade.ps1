$ErrorActionPreference = 'Stop'
$sourcePath = Join-Path (Split-Path -Parent $PSScriptRoot) 'start-dsh.ps1'
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($sourcePath, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
$functions = @('Get-LauncherSettings', 'Save-LauncherSettings', 'Set-LauncherPinnedVersion', 'Resolve-LauncherVersion', 'Get-DshUpdateNoticeLines')
foreach ($name in $functions) {
    $definition = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
    . ([scriptblock]::Create($definition.Extent.Text))
}
function Assert-Equal($Actual, $Expected, $Label) {
    if ($Actual -cne $Expected) { throw "$Label expected '$Expected', got '$Actual'" }
    Write-Host "PASS $Label"
}
$testHome = Join-Path ([IO.Path]::GetTempPath()) ('dsh-launcher-test-' + [guid]::NewGuid().ToString('N'))
$Script:SettingsFile = Join-Path $testHome 'launcher-settings.json'
try {
    $before = (Get-FileHash -LiteralPath $sourcePath).Hash
    Assert-Equal (Resolve-LauncherVersion '0.1.1-rc.2' $false) '0.1.1-rc.2' 'fresh installation default'
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
    Assert-Equal (Resolve-LauncherVersion '0.1.1-rc.2' $false) '0.1.1-rc.2' 'malformed settings default'
    Assert-Equal (Get-FileHash -LiteralPath $sourcePath).Hash $before 'upgrade leaves launcher source unchanged'
    Write-Host 'ALL 13 UPGRADE CHECKS PASSED'
} finally {
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    $testFull = [IO.Path]::GetFullPath($testHome)
    if (-not $testFull.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or
        (Split-Path -Leaf $testFull) -notlike 'dsh-launcher-test-*') {
        throw 'refusing to remove a test directory outside the temporary root'
    }
    if (Test-Path -LiteralPath $testFull) { Remove-Item -LiteralPath $testFull -Recurse -Force }
}
