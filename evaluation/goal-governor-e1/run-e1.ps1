param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
$entry = Join-Path $PSScriptRoot 'run-e1.js'
& node $entry @Arguments
exit $LASTEXITCODE
