# Trusted, read-only helper. Command source arrives on stdin as JSON DATA.
# Never use Invoke-Expression, ScriptBlock.Create, or invoke any parsed AST.
$ErrorActionPreference = 'Stop'
$inputData = [Console]::In.ReadToEnd() | ConvertFrom-Json
if ($inputData.mode -eq 'processes') {
    $rows = @(Get-CimInstance Win32_Process | ForEach-Object {
        @{ pid = [long]$_.ProcessId; parent = [long]$_.ParentProcessId; name = $_.Name; command = $_.CommandLine }
    })
    ConvertTo-Json -InputObject $rows -Depth 6 -Compress
    exit
}
if ($inputData.mode -ne 'parse' -or $inputData.command -isnot [string]) { throw 'invalid inspection input' }
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseInput($inputData.command, [ref]$tokens, [ref]$parseErrors)
$commands = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.CommandAst] }, $true))
$items = @($commands | ForEach-Object {
    $commandNode = $_
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
        @{ literal = $literal; value = $value; text = $_.Extent.Text; start = $_.Extent.StartOffset; end = $_.Extent.EndOffset }
    })
    @{ name = $_.GetCommandName(); elements = $elements; redirects = $_.Redirections.Count; text = $_.Extent.Text }
})
$standalone = $commands.Count -eq 1 -and $null -eq $ast.BeginBlock -and $null -eq $ast.ProcessBlock -and $null -eq $ast.CleanBlock -and $ast.EndBlock.Statements.Count -eq 1
if ($standalone) {
    $statement = $ast.EndBlock.Statements[0]
    $standalone = $statement -is [System.Management.Automation.Language.PipelineAst] -and $statement.PipelineElements.Count -eq 1 -and $statement.PipelineElements[0] -eq $commands[0] -and -not $statement.Background
}
$killMembers = @($ast.FindAll({ param($node)
    $node -is [System.Management.Automation.Language.InvokeMemberExpressionAst] -and $node.Member -is [System.Management.Automation.Language.StringConstantExpressionAst] -and $node.Member.Value -eq 'Kill'
}, $true)).Count
@{ errors = @($parseErrors | ForEach-Object { $_.ErrorId }); commands = $items; standalone = [bool]$standalone; killMembers = $killMembers } | ConvertTo-Json -Depth 12 -Compress
