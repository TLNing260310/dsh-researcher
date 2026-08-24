# dsh-researcher lifecycle wrapper (PowerShell)
# The Node entry point is the single implementation for install, --dry-run,
# backup, uninstall, rollback, and strict DSH compatibility checks.

$ErrorActionPreference = 'Stop'
$entry = Join-Path $PSScriptRoot 'bin\install.js'
if (-not (Test-Path -LiteralPath $entry -PathType Leaf)) {
  throw "installer entry point not found at $entry"
}

$node = Get-Command node -ErrorAction Stop
& $node.Source $entry @args
exit $LASTEXITCODE
