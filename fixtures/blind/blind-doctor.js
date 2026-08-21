#!/usr/bin/env node
// Blindness Doctor — verify a blind-benchmark snapshot is airtight before
// (and after) any research run.
//
// Usage: node blind-doctor.js <snapshot-dir> [--run-dir <session-output>]
//
// Checks:
//   ✓ workspace exists and is a git repo
//   ✓ no reachable commit in workspace/.git is newer than T0
//   ✓ no refs (branches/tags/remotes) point after T0
//   ✓ no ground-truth content (future.json / canary / snapshot.json) inside
//     the workspace
//   ✓ ground-truth/future.json exists and its sha256 is recorded (locked)
//   ✓ (with --run-dir) the research output does NOT contain the canary token
//
// Verdict: PASS (run may proceed) or INVALID (run results must be discarded).
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')

const snapshotDir = process.argv[2]
const runFlag = process.argv.indexOf('--run-dir')
const runDir = runFlag >= 0 ? process.argv[runFlag + 1] : null
const gtFlag = process.argv.indexOf('--gt')
const gtFile = gtFlag >= 0 ? process.argv[gtFlag + 1] : null
if (!snapshotDir || !fs.existsSync(path.join(snapshotDir, 'snapshot.json'))) {
  console.error('usage: node blind-doctor.js <snapshot-dir> [--run-dir <session-output>] [--gt <cognition-gt.json>]')
  process.exit(1)
}

const snapshot = JSON.parse(fs.readFileSync(path.join(snapshotDir, 'snapshot.json'), 'utf8'))
const workspace = path.join(snapshotDir, 'workspace')
const checks = []
let invalid = false
const run = (args) => spawnSync('git', args, { cwd: workspace, encoding: 'utf8' })
const fail = (name, detail) => { invalid = true; checks.push({ name, status: 'FAIL', detail }) }
const pass = (name, detail) => checks.push({ name, status: 'PASS', detail })

// 1. workspace repo exists
if (!fs.existsSync(path.join(workspace, '.git'))) fail('Workspace repo', 'workspace/.git missing')
else pass('Workspace repo', 'present')

// 2. no reachable commit after T0
if (!invalid || fs.existsSync(path.join(workspace, '.git'))) {
  const cutoff = Math.floor(new Date(snapshot.cutoff_date).getTime() / 1000)
  const log = String(run(['log', '--all', '--format=%ct']).stdout).trim()
  const after = log.split('\n').filter((l) => l && Number(l) > cutoff)
  if (after.length > 0) fail('History truncation', after.length + ' reachable commit(s) newer than T0')
  else pass('History truncation', 'no reachable commit after T0')
}

// 3. no refs after T0 (remotes/branches/tags)
const refs = String(run(['for-each-ref', '--format=%(refname)']).stdout).trim().split('\n').filter(Boolean)
const futureRefs = refs.filter((ref) => ref.startsWith('refs/remotes') || ref.startsWith('refs/tags'))
if (futureRefs.length > 0) fail('Refs', 'future refs still present: ' + futureRefs.join(', '))
else pass('Refs', 'no remote/tag refs')

// 4. no ground-truth content inside the workspace
const leaked = []
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.name === '.git') continue
    if (entry.isDirectory()) walk(full)
    else {
      const text = fs.readFileSync(full, 'utf8')
      if (text.includes('SECRET_FUTURE_CANARY') || text.includes('blind-ground-truth') || text.includes('future_issues')) {
        leaked.push(full)
      }
    }
  }
}
walk(workspace)
if (leaked.length > 0) fail('Ground-truth isolation', 'future content leaked into workspace: ' + leaked.join(', '))
else pass('Ground-truth isolation', 'no future content inside workspace')

// 5. ground truth locked with sha256
// v1.0: future.json locked via snapshot.json.ground_truth_sha256.
// v1.1: cognition GT locked via snapshot.json.cognition_gt_sha256 (checked
// only when --gt <file> is passed; the future.json placeholder is not the
// v1.1 scoring GT, so the v1.0 check is skipped in that mode).
const futurePath = path.join(snapshotDir, 'ground-truth', 'future.json')
if (gtFile) {
  if (!fs.existsSync(gtFile)) fail('GT lock', 'cognition GT file not found: ' + gtFile)
  else {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(gtFile)).digest('hex').slice(0, 12)
    if (snapshot.cognition_gt_sha256 && snapshot.cognition_gt_sha256 !== hash) {
      fail('GT lock', 'recorded cognition_gt_sha256 ' + snapshot.cognition_gt_sha256 + ' ≠ current ' + hash + ' (cognition GT changed after locking)')
    } else if (!snapshot.cognition_gt_sha256) {
      fail('GT lock', 'not locked — set snapshot.json.cognition_gt_sha256 to ' + hash + ' BEFORE running')
    } else {
      pass('GT lock', 'cognition sha256 ' + hash + ' matches the lock')
    }
  }
} else if (!fs.existsSync(futurePath)) fail('Ground-truth file', 'ground-truth/future.json missing')
else {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(futurePath)).digest('hex').slice(0, 12)
  if (snapshot.ground_truth_sha256 && snapshot.ground_truth_sha256 !== hash) {
    fail('Ground-truth lock', 'recorded sha256 ' + snapshot.ground_truth_sha256 + ' ≠ current ' + hash + ' (ground truth changed after locking)')
  } else if (!snapshot.ground_truth_sha256) {
    fail('Ground-truth lock', 'not locked — set snapshot.json.ground_truth_sha256 to ' + hash + ' BEFORE running')
  } else {
    pass('Ground-truth lock', 'sha256 ' + hash + ' matches the lock')
  }
}

// 6. canary must not appear in any run output
if (runDir && fs.existsSync(runDir)) {
  const canaryName = snapshot.canary_file
  const token = canaryName ? canaryName.replace('SECRET_FUTURE_CANARY_', 'canary-').replace('.txt', '') : null
  let hit = false
  const scan = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) scan(full)
      else {
        const text = fs.readFileSync(full, 'utf8')
        if (token && text.includes(token)) hit = true
        if (text.includes('SECRET_FUTURE_CANARY')) hit = true
      }
    }
  }
  scan(runDir)
  if (hit) fail('Canary', 'canary token found in run output — INVALID')
  else pass('Canary', 'token absent from run output')
}

console.log('Blindness Doctor — ' + (invalid ? 'INVALID' : 'PASS'))
for (const c of checks) console.log('  [' + c.status + '] ' + c.name + (c.detail ? ' — ' + c.detail : ''))
process.exit(invalid ? 1 : 0)
