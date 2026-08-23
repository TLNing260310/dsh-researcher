# Experiment C+ run executor — consumes exp-cplus-runs-manifest.json + exec-config.
#
# For every run:
#   1. pre-flight: workspace is the T1 snapshot (injection not visible in git)
#   2. fresh dsh headless process with eval patches, cwd = T1 workspace,
#      DSH_PERMISSION_MODE=read-only, per-run task file (A or B, frozen),
#      per-run out dir under evaluation/runs/commander.js/exp-cplus/
#   3. post-run: session.events.json archived by runner (own archive)
#   4. post-run integrity check (G2): for B runs, verify importState call
#      with schemaVersion:1 + non-empty claims, then export:true
#   5. execution log line appended
#
# Usage: powershell -File run-cplus.ps1 [-Only <run_id>] [-From <order>] [-To <order>]
param(
  [string]$Only = '',
  [int]$From = 0,
  [int]$To = 0
)
$ErrorActionPreference = 'Continue'
$repo = 'D:\AI_work_project\dsh-researcher'
$profileDir = 'C:\Users\jxgm\.dsh\profiles\headless'
$manifest = Get-Content "$repo\evaluation\runs\commander.js\exp-cplus\exp-cplus-runs-manifest.json" -Raw | ConvertFrom-Json
$exec = Get-Content "$repo\evaluation\runs\commander.js\exp-cplus\exp-cplus-exec-config.json" -Raw | ConvertFrom-Json
$execRuns = @{}
foreach ($r in $exec.runs) { $execRuns[$r.run_id] = $r }
$logFile = "$repo\evaluation\runs\commander.js\exp-cplus\execution-log.jsonl"

function Write-Log($obj) {
  Add-Content -Path $logFile -Value ($obj | ConvertTo-Json -Compress)
}

$count = 0
foreach ($run in $manifest.runs) {
  if ($Only -ne '' -and $run.run_id -ne $Only) { continue }
  if ($From -gt 0 -and $run.order -lt $From) { continue }
  if ($To -gt 0 -and $run.order -gt $To) { continue }
  $count++
  $ex = $execRuns[$run.run_id]
  $out = "$repo\evaluation\runs\commander.js\exp-cplus\$($run.condition)\$($run.run_id)"
  New-Item -ItemType Directory -Force -Path $out | Out-Null

  $task = (Get-Content "$repo\$($run.task_file)" -Raw).TrimEnd()

  $env:DSH_PERMISSION_MODE = 'read-only'
  $env:DSH_EVAL_PRESET = 'researcher-deep'
  $env:DSH_EVAL_PLAN = '0'
  $env:DSH_EVAL_TASK = $task
  $env:DSH_EVAL_RUN_ID = $run.run_id
  $env:DSH_EVAL_OUT = $out

  $patchArgs = @('--profile', 'headless')
  foreach ($p in $run.patches) { $patchArgs += @('--patch', (Join-Path $profileDir $p)) }

  $started = (Get-Date).ToUniversalTime().ToString('o')
  Push-Location $ex.workspace_dir
  try {
    & dsh @patchArgs $run.run_id 2>&1 | Tee-Object -FilePath "$out\stdout.log"
    $code = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  $finished = (Get-Date).ToUniversalTime().ToString('o')

  # G2 integrity check: B runs must show importState (schemaVersion 1, claims>0) then export:true
  # (implemented in node: PowerShell 5.1 ConvertFrom-Json overflows on ~8MB event files)
  $integrity = 'N/A'
  if ($run.condition -eq 'B') {
    $evFile = "$out\session.events.json"
    if (Test-Path $evFile) {
      $nodeCheck = & node -e "
        const fs = require('node:fs');
        const ev = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
        const calls = ev.filter(e => e.type === 'tool/call' && e.data && e.data.name === 'research_checkpoint');
        const imp = calls.filter(c => String(c.data.arguments).includes('importState'));
        const exp = calls.filter(c => String(c.data.arguments).includes('export'));
        let impOk = imp.length > 0, expOk = exp.length > 0;
        try { const a = JSON.parse(imp[0].data.arguments); if (!a.importState || a.schemaVersion !== undefined) impOk = false } catch (e) { impOk = false }
        console.log(impOk && expOk ? 'OK' : 'FAIL(import=' + impOk + ' export=' + expOk + ')');
      " $evFile 2>$null
      if ($LASTEXITCODE -eq 0) { $integrity = $nodeCheck.Trim() } else { $integrity = "ERROR(node=$LASTEXITCODE)" }
    } else { $integrity = 'NO-EVENTS' }
  }

  Write-Log @{ run_id = $run.run_id; condition = $run.condition; mutation = $run.mutation; order = $run.order; exit = $code; started = $started; finished = $finished; integrity = $integrity; out = $out }
  Write-Output "[run-cplus] $($run.run_id) cond=$($run.condition) exit=$code integrity=$integrity"
}
Write-Output "run-cplus: $count runs executed"
