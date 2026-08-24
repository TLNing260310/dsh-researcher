# dsh-researcher installer (PowerShell)
# Installs the researcher + governed presets and their portable core.

$ErrorActionPreference = 'Stop'

$presetSource = Join-Path $PSScriptRoot 'researcher'
$governedSource = Join-Path $PSScriptRoot 'governed'
if (-not (Test-Path (Join-Path $presetSource 'agent.cordis.yml'))) {
  throw "preset source not found at $presetSource (run from the repository root)"
}
if (-not (Test-Path (Join-Path $governedSource 'agent.cordis.yml'))) {
  throw "preset source not found at $governedSource"
}

$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$targetRoot = Join-Path $dshHome '.agent-presets'
$target = Join-Path $targetRoot 'researcher'
$governedTarget = Join-Path $targetRoot 'governed'

# Version preflight: verified against DeepSeek Harness 0.1.0-rc.7.
$verifiedVersion = '0.1.0-rc.7'
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

if ((Test-Path $target) -or (Test-Path $governedTarget)) {
  throw "target preset already exists: $target or $governedTarget (back it up and remove it first)"
}

New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null
Copy-Item -Recurse -Force $presetSource $target
Copy-Item -Recurse -Force $governedSource $governedTarget
$portableTarget = Join-Path $target 'project-cognition'
New-Item -ItemType Directory -Force -Path $portableTarget | Out-Null
Copy-Item -Recurse -Force (Join-Path $PSScriptRoot 'lib') (Join-Path $portableTarget 'lib')
Copy-Item -Recurse -Force (Join-Path $PSScriptRoot 'schemas') (Join-Path $portableTarget 'schemas')

Write-Host ""
Write-Host "Installed 'researcher' preset to $target"
Write-Host "Installed 'governed' preset to $governedTarget"
Write-Host "Next steps:"
Write-Host "  1. Certified research: choose 'Read Only', then '项目研究 Project Research'; the preset tightens approval to never (UI: Custom)."
Write-Host "  2. Governed execution: choose '目标治理编码 Governed Coding', then /researcher run <contract>."
Write-Host "  3. /researcher <question> starts one guarded read-only turn in Governed Coding."
