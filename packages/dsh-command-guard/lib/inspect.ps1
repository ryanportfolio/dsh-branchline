# Trusted, read-only helper. Command source arrives on stdin as JSON DATA.
# Never use Invoke-Expression, ScriptBlock.Create, or invoke any parsed AST.
# -Serve answers one JSON request per stdin line until stdin closes.
param([switch]$Serve)
$ErrorActionPreference = 'Stop'

function Test-KillName($value) {
    # PowerShell wildcard semantics decide whether a member name reaches Kill.
    try { return 'Kill' -like $value } catch { return $true }
}

function Invoke-Inspection($inputData) {
    if ($inputData.mode -eq 'processes') {
        $rows = @(Get-CimInstance Win32_Process | ForEach-Object {
            @{ pid = [long]$_.ProcessId; parent = [long]$_.ParentProcessId; name = $_.Name; command = $_.CommandLine }
        })
        return ConvertTo-Json -InputObject $rows -Depth 6 -Compress
    }
    if ($inputData.mode -ne 'parse' -or $inputData.command -isnot [string]) { throw 'invalid inspection input' }
    $tokens = $null
    $parseErrors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseInput($inputData.command, [ref]$tokens, [ref]$parseErrors)
    $commands = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.CommandAst] }, $true))
    $items = @($commands | ForEach-Object {
        $elements = @($_.CommandElements | ForEach-Object {
            $literal = $false
            $value = $null
            if ($_ -is [System.Management.Automation.Language.StringConstantExpressionAst] -or $_ -is [System.Management.Automation.Language.ConstantExpressionAst]) {
                $literal = $true; $value = [string]$_.Value
            } elseif ($_ -is [System.Management.Automation.Language.CommandParameterAst] -and $null -eq $_.Argument) {
                $literal = $true; $value = $_.Extent.Text
            } elseif ($_ -is [System.Management.Automation.Language.ExpandableStringExpressionAst] -and $_.NestedExpressions.Count -eq 0) {
                $literal = $true; $value = $_.Value
            }
            @{ literal = $literal; value = $value; text = $_.Extent.Text; start = $_.Extent.StartOffset; end = $_.Extent.EndOffset; kind = $_.GetType().Name; killName = $literal -and (Test-KillName $value) }
        })
        @{ name = $_.GetCommandName(); elements = $elements; redirects = $_.Redirections.Count; text = $_.Extent.Text }
    })
    $standalone = $commands.Count -eq 1 -and $null -eq $ast.BeginBlock -and $null -eq $ast.ProcessBlock -and $null -eq $ast.CleanBlock -and $ast.EndBlock.Statements.Count -eq 1
    if ($standalone) {
        $statement = $ast.EndBlock.Statements[0]
        $standalone = $statement -is [System.Management.Automation.Language.PipelineAst] -and $statement.PipelineElements.Count -eq 1 -and $statement.PipelineElements[0] -eq $commands[0] -and -not $statement.Background
    }
    $members = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.InvokeMemberExpressionAst] }, $true))
    $killMembers = 0
    $dynamicMembers = 0
    $evaluators = 0
    foreach ($node in $members) {
        if ($node.Member -isnot [System.Management.Automation.Language.StringConstantExpressionAst]) { $dynamicMembers++; continue }
        $member = $node.Member.Value
        if ($member -eq 'Kill') { $killMembers++ }
        elseif ($member -eq 'ForEach') {
            # .ForEach('Kill') invokes a member by name; only script blocks stay inspectable.
            $first = @($node.Arguments)[0]
            if ($null -ne $first -and $first -isnot [System.Management.Automation.Language.ScriptBlockExpressionAst]) {
                if ($first -isnot [System.Management.Automation.Language.StringConstantExpressionAst] -or (Test-KillName $first.Value)) { $killMembers++ }
            }
        } elseif ($member -in @('InvokeScript', 'NewScriptBlock', 'ExpandString', 'GetCommand', 'GetCmdlet', 'GetCommandName', 'InvokeWithContext', 'AddScript', 'AddCommand')) { $evaluators++ }
        elseif ($member -eq 'Create' -and $node.Static -and $node.Expression -is [System.Management.Automation.Language.TypeExpressionAst] -and $node.Expression.TypeName.FullName -match '(?i)^(?:System\.Management\.Automation\.)?ScriptBlock$') { $evaluators++ }
    }
    return @{ errors = @($parseErrors | ForEach-Object { $_.ErrorId }); commands = $items; standalone = [bool]$standalone; killMembers = $killMembers; dynamicMembers = $dynamicMembers; evaluators = $evaluators } | ConvertTo-Json -Depth 12 -Compress
}

if ($Serve) {
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    while ($null -ne ($line = [Console]::In.ReadLine())) {
        # One line out per line in, so a malformed request cannot desynchronize the client.
        try { $reply = Invoke-Inspection ($line | ConvertFrom-Json) } catch { $reply = '{"fault":true}' }
        [Console]::Out.WriteLine($reply)
        [Console]::Out.Flush()
    }
    exit
}
Invoke-Inspection ([Console]::In.ReadToEnd() | ConvertFrom-Json)
