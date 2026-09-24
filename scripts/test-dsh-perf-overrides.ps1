# Tests scripts/dsh-core-overrides/apply-performance.ps1 against a scratch copy
# of a dsh 0.1.5-rc.2 install. Never touches the live npx cache.
#
#   .\scripts\test-dsh-perf-overrides.ps1 -Source <node_modules\@deepseek-ai dir>
#
# Without -Source, the test looks for DSH_PERF_OVERRIDE_SOURCE, then skips.
param([string]$Source = $env:DSH_PERF_OVERRIDE_SOURCE)

$ErrorActionPreference = 'Stop'
$overrideDir = Join-Path $PSScriptRoot 'dsh-core-overrides'
$script = Join-Path $overrideDir 'apply-performance.ps1'
$smoke = Join-Path $overrideDir 'smoke-performance.mjs'
$shellExe = (Get-Process -Id $PID).Path

function Assert-True($Condition, $Label) {
    if (-not $Condition) { throw "FAIL $Label" }
    Write-Host "PASS $Label"
}

# Launcher hook: runs against stub override scripts, never the real ones.
$sourcePath = Join-Path (Split-Path -Parent $PSScriptRoot) 'start-dsh.ps1'
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($sourcePath, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
$definition = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Invoke-DshCoreOverrides' }, $true)
if (-not $definition) { throw 'Missing production function Invoke-DshCoreOverrides' }
. ([scriptblock]::Create($definition.Extent.Text))
$stubRoot = Join-Path ([IO.Path]::GetTempPath()) ('dsh-perf-hook-' + [guid]::NewGuid().ToString('N'))
try {
    $stubDir = Join-Path $stubRoot 'scripts\dsh-core-overrides'
    New-Item -ItemType Directory -Force -Path $stubDir | Out-Null
    Set-Content -LiteralPath (Join-Path $stubDir 'apply-canonical-workspace-default.ps1') -Value "Write-Warning 'nothing extracted'; exit 1"
    Set-Content -LiteralPath (Join-Path $stubDir 'apply-performance.ps1') -Value "Write-Host 'stub ran'; throw 'boom'"
    $Script:ScriptRoot = $stubRoot
    $lines = New-Object System.Collections.Generic.List[string]
    $log = { param($text) $lines.Add($text) }
    Invoke-DshCoreOverrides -InstanceRunning $false -Log $log
    Assert-True ($lines -contains '[warn] nothing extracted') 'hook relays override warnings'
    Assert-True ($lines -contains 'stub ran' -and ($lines | Where-Object { $_ -match 'apply-performance\.ps1 failed: boom' })) 'hook survives a throwing override'
    $lines.Clear()
    Invoke-DshCoreOverrides -InstanceRunning $true -Log $log
    Assert-True ($lines.Count -eq 1 -and $lines[0] -match 'skipped: a DSH instance is still running') 'hook skips while an instance runs'
} finally {
    Remove-Item -LiteralPath $stubRoot -Recurse -Force -ErrorAction SilentlyContinue
}

if (-not $Source -or -not (Test-Path -LiteralPath (Join-Path $Source 'dsh\package.json'))) {
    Write-Host 'SKIP rc.2 patch checks: no source (pass -Source <node_modules\@deepseek-ai dir> or set DSH_PERF_OVERRIDE_SOURCE)'
    exit 0
}

$packages = @('dsh', 'dsh-api-session-controller', 'dsh-api-gateway', 'dsh-client-ui-conversation', 'dsh-client-ui-sidebar-right')
function New-Fixture {
    $root = Join-Path ([IO.Path]::GetTempPath()) ('dsh-perf-test-' + [guid]::NewGuid().ToString('N'))
    $scope = Join-Path $root 'cache1\node_modules\@deepseek-ai'
    foreach ($pkg in $packages) {
        $target = Join-Path $scope $pkg
        New-Item -ItemType Directory -Force -Path (Join-Path $target 'lib') | Out-Null
        Copy-Item -LiteralPath (Join-Path $Source "$pkg\package.json") -Destination $target
        if ($pkg -ne 'dsh') { Copy-Item -Path (Join-Path $Source "$pkg\lib\*.js") -Destination (Join-Path $target 'lib') }
    }
    return [pscustomobject]@{ Root = $root; Scope = $scope }
}
function Invoke-Apply([string]$Root) {
    $output = & $shellExe -NoProfile -ExecutionPolicy Bypass -File $script -Root $Root 2>&1 3>&1 | ForEach-Object { [string]$_ }
    return [pscustomobject]@{ Exit = $LASTEXITCODE; Text = ($output -join "`n") }
}

$fixtures = New-Object System.Collections.Generic.List[string]
try {
    # 1) npx-cache-style root: all four files patched, then a no-op rerun.
    $f = New-Fixture; $fixtures.Add($f.Root)
    $first = Invoke-Apply $f.Root
    Assert-True ($first.Exit -eq 0 -and ([regex]::Matches($first.Text, 'patched: ')).Count -eq 4) 'first run patches four files'
    $second = Invoke-Apply $f.Root
    Assert-True ($second.Exit -eq 0 -and ([regex]::Matches($second.Text, 'already applied: ')).Count -eq 4 -and $second.Text -notmatch 'patched: ') 'second run reports all already applied'
    foreach ($file in @('dsh-api-session-controller\lib\client.js', 'dsh-api-gateway\lib\index.js', 'dsh-client-ui-conversation\lib\client.js', 'dsh-client-ui-sidebar-right\lib\client.js')) {
        & node --check (Join-Path $f.Scope $file)
        Assert-True ($LASTEXITCODE -eq 0) "node --check $file"
    }
    Assert-True (@(Get-ChildItem -Path $f.Scope -Recurse -Filter 'perf-override-check-*').Count -eq 0) 'no syntax-check leftovers'
    & node $smoke $f.Scope
    Assert-True ($LASTEXITCODE -eq 0) 'smoke test on patched bundles'

    # 2) Other dsh version: nothing is written.
    $g = New-Fixture; $fixtures.Add($g.Root)
    $manifest = Join-Path $g.Scope 'dsh\package.json'
    (Get-Content -LiteralPath $manifest -Raw) -replace '"version": "0\.1\.5-rc\.2"', '"version": "0.1.6"' | Set-Content -LiteralPath $manifest -NoNewline
    $mismatch = Invoke-Apply $g.Scope
    Assert-True ($mismatch.Text -match 'is not 0\.1\.5-rc\.2' -and $mismatch.Text -notmatch 'patched: ') 'other dsh version skipped with warning'

    # 3) Missing original in one file: that file stays byte-identical, others patch.
    $h = New-Fixture; $fixtures.Add($h.Root)
    $controller = Join-Path $h.Scope 'dsh-api-session-controller\lib\client.js'
    $tampered = [IO.File]::ReadAllText($controller).Replace('this.watched = current;', 'this.watched = current ;')
    [IO.File]::WriteAllText($controller, $tampered)
    $partial = Invoke-Apply (Join-Path $h.Root 'cache1')
    Assert-True ($partial.Text -match 'perf-session-park; file left untouched' -and ([regex]::Matches($partial.Text, 'patched: ')).Count -eq 3) 'missing original leaves only that file untouched'
    Assert-True ([IO.File]::ReadAllText($controller) -ceq $tampered) 'untouched file is byte-identical'

    # 4) Nothing extracted yet: warning, non-zero exit, no throw.
    $empty = Join-Path ([IO.Path]::GetTempPath()) ('dsh-perf-empty-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $empty | Out-Null; $fixtures.Add($empty)
    $none = Invoke-Apply $empty
    Assert-True ($none.Exit -eq 1 -and $none.Text -match 'No @deepseek-ai/dsh install found') 'empty cache warns'
} finally {
    foreach ($dir in $fixtures) { Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue }
}
Write-Host 'test-dsh-perf-overrides: all checks passed'
