# Tests scripts/dsh-core-overrides/apply-performance.ps1 against scratch copies
# of dsh installs. Never touches the live npx cache. Each source is checked
# against the patch set for its own dsh version (0.1.5-rc.2 or 0.1.1-rc.2).
#
#   .\scripts\test-dsh-perf-overrides.ps1 -Source <node_modules\@deepseek-ai dir>[,<dir>...]
#
# Without -Source, the test reads DSH_PERF_OVERRIDE_SOURCE (dirs separated by
# ';'), then skips the patch checks.
param([string[]]$Source = @(($env:DSH_PERF_OVERRIDE_SOURCE -split ';') | Where-Object { $_ }))

$ErrorActionPreference = 'Stop'
$overrideDir = Join-Path $PSScriptRoot 'dsh-core-overrides'
$script = Join-Path $overrideDir 'apply-performance.ps1'
$canonical = Join-Path $overrideDir 'apply-canonical-workspace-default.ps1'
$shellExe = (Get-Process -Id $PID).Path
$utf8 = New-Object System.Text.UTF8Encoding($false)

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

$sources = @($Source | ForEach-Object { $_ -split '[;,]' } | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ 'dsh\package.json')) })
if ($sources.Count -eq 0) {
    Write-Host 'SKIP patch checks: no source (pass -Source <node_modules\@deepseek-ai dir> or set DSH_PERF_OVERRIDE_SOURCE)'
    exit 0
}

# Package files each suite copies into a fixture: package.json plus these globs.
$suites = @{
    '0.1.5-rc.2' = @{
        Files = [ordered]@{
            'dsh'                         = @()
            'dsh-api-session-controller'  = @('lib\*.js')
            'dsh-api-gateway'             = @('lib\*.js')
            'dsh-client-ui-conversation'  = @('lib\*.js')
            'dsh-client-ui-sidebar-right' = @('lib\*.js')
        }
        Targets  = @('dsh-api-session-controller\lib\client.js', 'dsh-api-gateway\lib\index.js', 'dsh-client-ui-conversation\lib\client.js', 'dsh-client-ui-sidebar-right\lib\client.js')
        Smoke    = 'smoke-performance.mjs'
        Tamper   = @{ File = 'dsh-api-session-controller\lib\client.js'; From = 'this.watched = current;'; To = 'this.watched = current ;'; Patch = 'perf-session-park' }
    }
    '0.1.1-rc.2' = @{
        Files = [ordered]@{
            'dsh'                        = @()
            'dsh-client-runtime'         = @('lib\*.js')
            'dsh-client-ui-conversation' = @('lib\*.js')
            'dsh-client-ui-trajectory'   = @('lib\*.js')
            'dsh-client-ui-tool'         = @('lib\*.js')
            'dsh-client-ui-skill'        = @('lib\*.js')
            'dsh-client-ui-workspace'    = @('lib\*.js')
            'dsh-web-frontend'           = @('dist\assets\*.css')
        }
        Targets  = @('dsh-client-runtime\lib\client.js', 'dsh-client-ui-conversation\lib\client.js', 'dsh-client-ui-trajectory\lib\client.js', 'dsh-client-ui-tool\lib\client.js', 'dsh-client-ui-skill\lib\client.js', 'dsh-client-ui-workspace\lib\client.js', 'dsh-web-frontend\dist\assets\index-C6eRlFa6.css')
        Smoke    = 'smoke-performance-011.mjs'
        Tamper   = @{ File = 'dsh-client-runtime\lib\client.js'; From = 'deferredRemovals = /* @__PURE__ */ new Set();'; To = 'deferredRemovals = /* @__PURE__ */ new Set() ;'; Patch = 'perf-session-park' }
    }
}

function New-Fixture([string]$From, $Suite) {
    $root = Join-Path ([IO.Path]::GetTempPath()) ('dsh-perf-test-' + [guid]::NewGuid().ToString('N'))
    $scope = Join-Path $root 'cache1\node_modules\@deepseek-ai'
    foreach ($pkg in $Suite.Files.Keys) {
        $target = Join-Path $scope $pkg
        New-Item -ItemType Directory -Force -Path $target | Out-Null
        Copy-Item -LiteralPath (Join-Path $From "$pkg\package.json") -Destination $target
        foreach ($glob in $Suite.Files[$pkg]) {
            $dir = Join-Path $target (Split-Path -Parent $glob)
            New-Item -ItemType Directory -Force -Path $dir | Out-Null
            Copy-Item -Path (Join-Path $From "$pkg\$glob") -Destination $dir
        }
    }
    return [pscustomobject]@{ Root = $root; Scope = $scope }
}
function Invoke-Script([string]$Path, [string]$Root) {
    $output = & $shellExe -NoProfile -ExecutionPolicy Bypass -File $Path -Root $Root 2>&1 3>&1 | ForEach-Object { [string]$_ }
    # Flat drops line breaks: Windows PowerShell wraps long warnings at the console width.
    return [pscustomobject]@{ Exit = $LASTEXITCODE; Text = ($output -join "`n"); Flat = ($output -join '') }
}
function Invoke-Apply([string]$Root) { return Invoke-Script $script $Root }
function Set-PackageVersion([string]$Dir, [string]$Version) {
    $manifest = Join-Path $Dir 'package.json'
    $json = [IO.File]::ReadAllText($manifest, $utf8)
    [IO.File]::WriteAllText($manifest, ($json -replace '"version":\s*"[^"]*"', ('"version": "' + $Version + '"')), $utf8)
}
function Get-Count([string]$Text, [string]$Pattern) { return ([regex]::Matches($Text, $Pattern)).Count }

# Strings the canonical override writes, read from its script without running it.
function Get-CanonicalPairs {
    $tokens = $null; $errors = $null
    $tree = [System.Management.Automation.Language.Parser]::ParseFile($canonical, [ref]$tokens, [ref]$errors)
    $values = @{}
    foreach ($node in $tree.FindAll({ param($n) $n -is [System.Management.Automation.Language.AssignmentStatementAst] }, $true)) {
        $name = $node.Left.Extent.Text.TrimStart('$')
        if ($name -in 'originalRecent', 'replacementRecent', 'originalSession', 'replacementSession' -and $node.Right.Expression -is [System.Management.Automation.Language.StringConstantExpressionAst]) {
            $values[$name] = $node.Right.Expression.Value.Replace("`r`n", "`n")
        }
    }
    return @(@($values.replacementRecent, $values.originalRecent), @($values.replacementSession, $values.originalSession))
}

$fixtures = New-Object System.Collections.Generic.List[string]
try {
    foreach ($src in $sources) {
        $version = (Get-Content -LiteralPath (Join-Path $src 'dsh\package.json') -Raw | ConvertFrom-Json).version
        $suite = $suites[$version]
        if (-not $suite) { throw "no test suite for dsh $version at $src" }
        $n = $suite.Targets.Count
        Write-Host "--- dsh $version ($src)"

        # 1) npx-cache-style root: every target patched, then a no-op rerun.
        $f = New-Fixture $src $suite; $fixtures.Add($f.Root)
        $first = Invoke-Apply $f.Root
        Assert-True ($first.Exit -eq 0 -and (Get-Count $first.Text 'patched: ') -eq $n -and $first.Text -notmatch 'WARNING') "$version first run patches $n files"
        $second = Invoke-Apply $f.Root
        Assert-True ($second.Exit -eq 0 -and (Get-Count $second.Text 'already applied: ') -eq $n -and $second.Text -notmatch 'patched: ') "$version second run reports all already applied"
        foreach ($file in $suite.Targets | Where-Object { $_ -like '*.js' }) {
            & node --check (Join-Path $f.Scope $file)
            Assert-True ($LASTEXITCODE -eq 0) "$version node --check $file"
        }
        Assert-True (@(Get-ChildItem -Path $f.Scope -Recurse -Filter 'perf-override-check-*').Count -eq 0) "$version no syntax-check leftovers"
        # The smoke test checks CSS balance and compares against the pristine source.
        & node (Join-Path $overrideDir $suite.Smoke) $f.Scope $src
        Assert-True ($LASTEXITCODE -eq 0) "$version smoke test on patched bundles"

        # 2) Other dsh version: nothing is written.
        $g = New-Fixture $src $suite; $fixtures.Add($g.Root)
        Set-PackageVersion (Join-Path $g.Scope 'dsh') '0.1.6'
        $mismatch = Invoke-Apply $g.Scope
        Assert-True ($mismatch.Flat -match 'dsh 0\.1\.6 has no override set' -and $mismatch.Text -notmatch 'patched: ') "$version other dsh version skipped with warning"

        # 3) Missing original in one file: that file stays byte-identical, others patch.
        $h = New-Fixture $src $suite; $fixtures.Add($h.Root)
        $tamperedPath = Join-Path $h.Scope $suite.Tamper.File
        $tampered = [IO.File]::ReadAllText($tamperedPath).Replace($suite.Tamper.From, $suite.Tamper.To)
        [IO.File]::WriteAllText($tamperedPath, $tampered)
        $partial = Invoke-Apply (Join-Path $h.Root 'cache1')
        Assert-True ($partial.Flat -match ([regex]::Escape($suite.Tamper.Patch) + '; file left untouched') -and (Get-Count $partial.Text 'patched: ') -eq ($n - 1)) "$version missing original leaves only that file untouched"
        Assert-True ([IO.File]::ReadAllText($tamperedPath) -ceq $tampered) "$version untouched file is byte-identical"

        if ($version -eq '0.1.1-rc.2') {
            # 4) One target package on another version: only that package is skipped.
            $k = New-Fixture $src $suite; $fixtures.Add($k.Root)
            $skill = Join-Path $k.Scope 'dsh-client-ui-skill'
            $skillBefore = [IO.File]::ReadAllText((Join-Path $skill 'lib\client.js'))
            Set-PackageVersion $skill '0.1.2'
            $pkgSkip = Invoke-Apply $k.Scope
            Assert-True ($pkgSkip.Flat -match 'dsh-client-ui-skill: version 0\.1\.2 is not 0\.1\.1-rc\.2' -and (Get-Count $pkgSkip.Text 'patched: ') -eq ($n - 1)) '0.1.1-rc.2 target package version gate'
            Assert-True ([IO.File]::ReadAllText((Join-Path $skill 'lib\client.js')) -ceq $skillBefore) '0.1.1-rc.2 gated package untouched'

            # 5) Hashed CSS asset absent: skipped with a warning, JS still patched.
            $m = New-Fixture $src $suite; $fixtures.Add($m.Root)
            Remove-Item -LiteralPath (Join-Path $m.Scope 'dsh-web-frontend\dist\assets\index-C6eRlFa6.css')
            $noCss = Invoke-Apply $m.Scope
            Assert-True ($noCss.Flat -match 'file not found, skipped \(perf-state-dot-static\)' -and (Get-Count $noCss.Text 'patched: ') -eq ($n - 1)) '0.1.1-rc.2 absent CSS asset skipped'

            # 6) Canonical workspace override composes with the perf set in either order.
            $pairs = Get-CanonicalPairs
            $results = @{}
            foreach ($order in @('canonical-first', 'perf-first')) {
                $c = New-Fixture $src $suite; $fixtures.Add($c.Root)
                $runtime = Join-Path $c.Scope 'dsh-client-runtime\lib\client.js'
                $text = [IO.File]::ReadAllText($runtime, $utf8)
                foreach ($pair in $pairs) { $text = $text.Replace($pair[0], $pair[1]) }
                [IO.File]::WriteAllText($runtime, $text, $utf8)
                Assert-True ($text -notmatch 'canonical-workspace-default') "$order fixture starts without the canonical override"
                $steps = if ($order -eq 'canonical-first') { @($canonical, $script) } else { @($script, $canonical) }
                foreach ($step in $steps) {
                    $run = Invoke-Script $step $c.Scope
                    Assert-True ($run.Exit -eq 0 -and $run.Text -match 'patched: ' -and $run.Text -notmatch 'WARNING') "$order $(Split-Path -Leaf $step) patches"
                }
                $final = [IO.File]::ReadAllText($runtime, $utf8)
                Assert-True ((Get-Count $final 'dsh-core-override: canonical-workspace-default') -eq 2 -and $final.Contains('dsh-core-override: perf-session-park') -and $final.Contains('dsh-core-override: perf-list-cache-linear')) "$order both overrides present"
                & node --check $runtime
                Assert-True ($LASTEXITCODE -eq 0) "$order node --check runtime"
                Assert-True ((Invoke-Apply $c.Scope).Text -match 'already applied: .*dsh-client-runtime') "$order perf rerun is a no-op"
                Assert-True ((Invoke-Script $canonical $c.Scope).Text -match 'already applied: ') "$order canonical rerun is a no-op"
                $results[$order] = $final
            }
            Assert-True ($results['canonical-first'] -ceq $results['perf-first']) 'canonical and perf orders produce identical runtime bundles'
            # The source already carries the canonical override, so run 1 is the reference.
            $reference = [IO.File]::ReadAllText((Join-Path $f.Scope 'dsh-client-runtime\lib\client.js'), $utf8)
            if ($reference.Contains('canonical-workspace-default')) {
                Assert-True ($results['perf-first'] -ceq $reference) 'composed bundle matches the canonical-patched source plus the perf set'
            }
        }
    }

    # Nothing extracted yet: warning, non-zero exit, no throw.
    $empty = Join-Path ([IO.Path]::GetTempPath()) ('dsh-perf-empty-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $empty | Out-Null; $fixtures.Add($empty)
    $none = Invoke-Apply $empty
    Assert-True ($none.Exit -eq 1 -and $none.Flat -match 'No @deepseek-ai/dsh install found') 'empty cache warns'
} finally {
    foreach ($dir in $fixtures) { Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue }
}
Write-Host 'test-dsh-perf-overrides: all checks passed'
