# dsh-researcher installer (PowerShell)
# Copies the `researcher` preset into ${DSH_HOME:-~/.dsh}/.agent-presets/

$ErrorActionPreference = 'Stop'

$presetSource = Join-Path $PSScriptRoot 'researcher'
if (-not (Test-Path (Join-Path $presetSource 'agent.cordis.yml'))) {
  throw "preset source not found at $presetSource (run from the repository root)"
}

$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$targetRoot = Join-Path $dshHome '.agent-presets'
$target = Join-Path $targetRoot 'researcher'

# Version preflight: verified against DeepSeek Harness 0.1.0-rc.6.
$verifiedVersion = '0.1.0-rc.6'
try {
  $dshVersion = (& dsh --version 2>$null | Select-Object -First 1)
} catch {
  $dshVersion = $null
}
if ($null -eq $dshVersion -or $dshVersion.Trim() -eq '') {
  Write-Warning "Could not detect a dsh install. The preset will only work inside DeepSeek Harness (verified on $verifiedVersion)."
} elseif ($dshVersion -notmatch [regex]::Escape($verifiedVersion)) {
  Write-Warning "Verified on DSH $verifiedVersion; you are running '$($dshVersion.Trim())'. The preset's read-only guard fails closed on incompatible runtimes (STRICT mode), so a broken session is expected rather than silent degradation. Update or pin the preset accordingly."
}

if (Test-Path $target) {
  throw "target preset already exists: $target (back it up and remove it first)"
}

New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null
Copy-Item -Recurse -Force $presetSource $target

Write-Host ""
Write-Host "Installed 'researcher' preset to $target"
Write-Host "Next steps:"
Write-Host "  1. Start dsh, create a new session with preset '项目研究 Project Research'."
Write-Host "  2. Choose permission read-only, approval never (custom combination)."
Write-Host "  3. Verify: write/edit show as 'DISABLED in research mode' stubs;"
Write-Host "     run 'git status --porcelain' before and after the session - identical."
