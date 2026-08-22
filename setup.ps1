# Build this checkout and link it into the DeepSeek Harness Web profile.

[CmdletBinding()]
param(
    [string]$DshVersion = '0.1.1-rc.2'
)

$ErrorActionPreference = 'Stop'

foreach ($command in @('node', 'npm', 'npx', 'git')) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "$command is required and was not found on PATH."
    }
}

$nodeParts = (& node --version).TrimStart('v').Split('.')
$nodeVersion = [version](($nodeParts | Select-Object -First 3) -join '.')
if ($nodeVersion -lt [version]'22.19.0') { throw 'Node.js 22.19.0 or later is required.' }

Push-Location $PSScriptRoot
try {
    Write-Host 'Installing build dependencies...'
    & npx -y 'pnpm@11.7.0' install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'pnpm install failed.' }

    Write-Host 'Building Worktree Studio...'
    & npx -y 'pnpm@11.7.0' run build
    if ($LASTEXITCODE -ne 0) { throw 'plugin build failed.' }

    $link = 'link:' + ($PSScriptRoot -replace '\\', '/')
    Write-Host 'Linking plugin into the DSH Web profile...'
    & npx -y "@deepseek-ai/dsh@$DshVersion" plugin --profile web add $link --trust-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'DSH plugin installation failed.' }
} finally {
    Pop-Location
}

Write-Host ''
Write-Host 'Installed. Double-click Start-DSH.cmd or run .\start-dsh.ps1.'
