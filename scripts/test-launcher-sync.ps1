$ErrorActionPreference = 'Stop'
$sourcePath = Join-Path (Split-Path -Parent $PSScriptRoot) 'start-dsh.ps1'
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($sourcePath, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
foreach ($name in @('Invoke-Git', 'Test-PluginDependencyChange', 'Sync-PluginSource')) {
    $definition = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
    if (-not $definition) { throw "Missing production function $name" }
    . ([scriptblock]::Create($definition.Extent.Text))
}
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('dsh-sync-test-' + [guid]::NewGuid().ToString('N'))
$nativeGit = (Get-Command git -CommandType Application | Select-Object -First 1).Source
function Git-Fixture {
    & $nativeGit -C $fixture @args | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "fixture git failed: $args" }
}
function git {
    # Fetch is offline; origin/main already names the fixture's fetched tip.
    if ($args -contains 'fetch') { $global:LASTEXITCODE = 0; return }
    & $nativeGit @args
    $global:LASTEXITCODE = $LASTEXITCODE
}
function pnpm {
    if (($args -join ' ') -ne 'install --frozen-lockfile') { throw 'unexpected package-manager call' }
    $script:installs++
    $global:LASTEXITCODE = 0
}
function Assert-Equal($Actual, $Expected, $Label) {
    if ($Actual -cne $Expected) { throw "$Label expected '$Expected', got '$Actual'" }
    Write-Host "PASS $Label"
}
try {
    New-Item -ItemType Directory $fixture | Out-Null
    Git-Fixture init -b main
    Git-Fixture config core.excludesFile .git/info/exclude
    Git-Fixture config core.autocrlf false
    Git-Fixture config user.name 'Launcher Fixture'
    Git-Fixture config user.email 'fixture@example.invalid'
    [IO.File]::WriteAllText((Join-Path $fixture '.gitignore'), "node_modules/`nlib/`n")
    [IO.File]::WriteAllText((Join-Path $fixture 'package.json'), '{"version":"1.0.0"}')
    Git-Fixture add .
    Git-Fixture commit -m baseline
    $baseline = (& $nativeGit -C $fixture rev-parse HEAD).Trim()
    [IO.File]::WriteAllText((Join-Path $fixture 'package.json'), '{"version":"1.0.1"}')
    Git-Fixture add .
    Git-Fixture commit -m dependencies
    [IO.File]::WriteAllText((Join-Path $fixture 'README.md'), 'docs')
    Git-Fixture add .
    Git-Fixture commit -m docs
    $tip = (& $nativeGit -C $fixture rev-parse HEAD).Trim()
    Git-Fixture update-ref refs/remotes/origin/main $tip
    Git-Fixture reset --hard $baseline
    $bin = Join-Path $fixture 'node_modules/.bin'
    New-Item -ItemType Directory $bin -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $bin 'tsc.cmd'), "@exit /b 0`r`n")
    [IO.File]::WriteAllText((Join-Path $bin 'tsdown.cmd'), "@exit /b 0`r`n")
    New-Item -ItemType Directory (Join-Path $fixture 'lib') | Out-Null
    [IO.File]::WriteAllText((Join-Path $fixture 'lib/client.cjs'), '// fixture build output')
    [IO.File]::WriteAllText((Join-Path $fixture 'lib/index.js'), '// fixture build output')
    $Script:ScriptRoot = $fixture
    $script:installs = 0
    Sync-PluginSource -Log { param($text) Write-Host $text }
    Assert-Equal $script:installs 1 'earlier dependency commit triggers installation'
    Assert-Equal ((& $nativeGit -C $fixture rev-parse HEAD).Trim()) $tip 'full range fast-forwarded'
    [IO.File]::WriteAllText((Join-Path $fixture 'README.md'), 'more docs')
    Git-Fixture add .
    Git-Fixture commit -m docs-only
    $docsTip = (& $nativeGit -C $fixture rev-parse HEAD).Trim()
    Git-Fixture update-ref refs/remotes/origin/main $docsTip
    Git-Fixture reset --hard $tip
    $script:installs = 0
    Sync-PluginSource -Log { param($text) Write-Host $text }
    Assert-Equal $script:installs 0 'docs-only range skips installation'
    Write-Host 'ALL SYNC CHECKS PASSED'
} finally {
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    $full = [IO.Path]::GetFullPath($fixture)
    if (-not $full.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $full) -notlike 'dsh-sync-test-*') { throw 'unsafe fixture cleanup path' }
    if (Test-Path -LiteralPath $full) { Remove-Item -LiteralPath $full -Recurse -Force }
}
