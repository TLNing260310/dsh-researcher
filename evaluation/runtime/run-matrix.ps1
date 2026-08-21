# Phase A Flask run matrix executor — consumes runs-manifest.json in order.
#
# For every run:
#   1. pre-flight: blind-doctor on the snapshot (any FAIL aborts the matrix)
#   2. fresh dsh headless process with the eval patch(es), cwd = workspace,
#      DSH_PERMISSION_MODE=read-only, frozen task prompt, per-run out dir
#   3. post-run: blind-doctor --run-dir (canary scan) over the run output
#   4. execution log line appended to execution-log.jsonl
#
# Usage: powershell -File run-matrix.ps1 [-Only <run_id>] [-From <order>] [-To <order>]
param(
  [string]$Only = '',
  [int]$From = 0,
  [int]$To = 0
)
$ErrorActionPreference = 'Stop'
$repo = 'D:\AI_work_project\dsh-researcher'
$profileDir = 'C:\Users\jxgm\.dsh\profiles\headless'
$manifest = Get-Content "$repo\evaluation\runs\flask\runs-manifest.json" -Raw | ConvertFrom-Json
$prompt = (Get-Content "$repo\evaluation\prompts\phase-a-default.txt" -Raw).TrimEnd()
$logFile = "$repo\evaluation\runs\flask\execution-log.jsonl"

function Write-Log($obj) {
  Add-Content -Path $logFile -Value ($obj | ConvertTo-Json -Compress)
}

# Pre-flight: the snapshot must be blind-valid before ANY run in this batch.
& node "$repo\fixtures\blind\blind-doctor.js" $manifest.snapshot_dir
if ($LASTEXITCODE -ne 0) { throw 'PRE-RUN blind-doctor FAILED - aborting matrix' }

foreach ($run in $manifest.runs) {
  if ($Only -ne '' -and $run.run_id -ne $Only) { continue }
  if ($From -gt 0 -and $run.order -lt $From) { continue }
  if ($To -gt 0 -and $run.order -gt $To) { continue }

  $out = "$repo\evaluation\runs\flask\$($run.mode)\$($run.run_id)"
  New-Item -ItemType Directory -Force -Path $out | Out-Null

  $env:DSH_PERMISSION_MODE = 'read-only'
  $env:DSH_EVAL_PRESET = $run.preset
  $env:DSH_EVAL_PLAN = $(if ($run.plan) { '1' } else { '0' })
  $env:DSH_EVAL_TASK = $prompt
  $env:DSH_EVAL_RUN_ID = $run.run_id
  $env:DSH_EVAL_OUT = $out

  $patchArgs = @('--profile', 'headless')
  foreach ($p in $run.patches) { $patchArgs += @('--patch', (Join-Path $profileDir $p)) }

  $started = (Get-Date).ToUniversalTime().ToString('o')
  Push-Location $manifest.workspace_dir
  try {
    & dsh @patchArgs $run.run_id 2>&1 | Tee-Object -FilePath "$out\stdout.log"
    $code = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  $finished = (Get-Date).ToUniversalTime().ToString('o')

  & node "$repo\fixtures\blind\blind-doctor.js" $manifest.snapshot_dir --run-dir $out | Out-File "$out\doctor-post.txt"
  $doctor = $LASTEXITCODE

  Write-Log @{ run_id = $run.run_id; order = $run.order; mode = $run.mode; preset = $run.preset; plan = $run.plan; started_at = $started; finished_at = $finished; exit_code = $code; doctor_post = $doctor }
  Write-Host ("[{0}] {1} exit={2} doctor={3}" -f $run.order, $run.run_id, $code, $doctor)
}
Write-Host 'MATRIX BATCH COMPLETE'
