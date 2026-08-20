#!/usr/bin/env node
// Historical blind benchmark — snapshot creator (v2, blindness-integrity).
//
// Usage: node blind-snapshot.js create <repo-url> <commit> <out-dir>
//
// Creates <out-dir> with the STRICT physical layout:
//
//   <out-dir>/
//     workspace/          ← the ONLY thing a research session may read
//       (repository at T0; .git truncated so that NOTHING after T0 exists)
//     ground-truth/       ← future facts + canary; NEVER readable by the run
//       future.json
//       SECRET_FUTURE_CANARY_<nonce>.txt
//     snapshot.json       ← protocol metadata (operator-side only)
//
// Truncation procedure: temp clone → detach at T0 → delete every other ref
// (branches, tags, remotes) → expire reflog → gc --prune=now → verify that no
// reachable commit is newer than T0. The research agent therefore cannot
// "predict" the future by reading .git.
//
// The run protocol (see docs/evaluation-protocol-v1.md) requires a fresh
// session with cwd = workspace/ and a clean profile; the canary must never
// appear in any output — if it does, the run is INVALID.
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const command = process.argv[2]
if (command !== 'create') {
  console.error('usage: node blind-snapshot.js create <repo-url> <commit> <out-dir>')
  process.exit(1)
}
const repoUrl = process.argv[3]
const commit = process.argv[4]
const outDir = process.argv[5]
if (!repoUrl || !commit || !outDir) {
  console.error('usage: node blind-snapshot.js create <repo-url> <commit> <out-dir>')
  process.exit(1)
}
if (fs.existsSync(outDir)) {
  console.error('target already exists: ' + outDir)
  process.exit(1)
}

const workspace = path.join(outDir, 'workspace')
const groundTruthDir = path.join(outDir, 'ground-truth')
const tmp = path.join(outDir, '.tmp-clone')
fs.mkdirSync(outDir, { recursive: true })

const run = (args, cwd) => spawnSync('git', args, { cwd, encoding: 'utf8' })
const fail = (msg) => { console.error(msg); process.exit(1) }

if (run(['clone', '--no-checkout', repoUrl, tmp]).status !== 0) fail('git clone failed')
if (run(['-C', tmp, 'checkout', '--detach', commit]).status !== 0) fail('git checkout failed')

// Cutoff time of T0 (author date, seconds).
const cutoff = Number(String(run(['-C', tmp, 'show', '-s', '--format=%ct', 'HEAD']).stdout).trim())
if (!Number.isFinite(cutoff)) fail('cannot read T0 commit time')

// Delete every ref except HEAD (branches, tags, remotes) so later commits
// become unreachable.
const refs = String(run(['-C', tmp, 'for-each-ref', '--format=%(refname)']).stdout).trim().split('\n').filter(Boolean)
for (const ref of refs) {
  if (ref === 'HEAD') continue
  run(['-C', tmp, 'update-ref', '-d', ref])
}
run(['-C', tmp, 'reflog', 'expire', '--expire=now', '--all'])
run(['-C', tmp, 'gc', '--prune=now', '--aggressive'])

// Verify: no reachable commit newer than T0.
const log = String(run(['-C', tmp, 'log', '--all', '--format=%ct']).stdout).trim()
for (const line of log.split('\n').filter(Boolean)) {
  if (Number(line) > cutoff) fail('TRUNCATION FAILED: a commit newer than T0 is still reachable (' + line + ' > ' + cutoff + ')')
}

fs.renameSync(tmp, workspace)
fs.mkdirSync(groundTruthDir, { recursive: true })

const nonce = Math.random().toString(16).slice(2, 10)
fs.writeFileSync(path.join(groundTruthDir, 'SECRET_FUTURE_CANARY_' + nonce + '.txt'),
  'canary-' + nonce + ' — if any agent output mentions this token, the run is INVALID\n')
fs.writeFileSync(path.join(groundTruthDir, 'future.json'), JSON.stringify({
  schema: 'dsh-researcher/blind-ground-truth/v1',
  note: 'FILL BEFORE ANY RUN, then lock with sha256 (see docs/evaluation-protocol-v1.md)',
  cutoff_commit: commit,
  cutoff_date: new Date(cutoff * 1000).toISOString(),
  ground_truth: [],
}, null, 2))
fs.writeFileSync(path.join(outDir, 'snapshot.json'), JSON.stringify({
  schema: 'dsh-researcher/blind-snapshot/v1',
  repo: repoUrl,
  commit,
  cutoff_date: new Date(cutoff * 1000).toISOString(),
  workspace: 'workspace/',
  ground_truth_dir: 'ground-truth/',
  canary_file: 'SECRET_FUTURE_CANARY_' + nonce + '.txt',
  ground_truth_sha256: null,
}, null, 2))

console.log('snapshot created at ' + outDir)
console.log('  workspace/   — T0-truncated repository (verified: no reachable commit after ' + new Date(cutoff * 1000).toISOString() + ')')
console.log('  ground-truth/ — future facts + canary (never readable by the run)')
console.log('next: fill ground-truth/future.json BEFORE any run, lock it with sha256, then run the isolation doctor:')
console.log('  node fixtures/blind/blind-doctor.js <out-dir>')
