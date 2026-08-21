#!/usr/bin/env node
// Evaluation lock — freeze every protocol input before the first formal run.
//
// Usage:
//   node eval-lock.js <snapshot-dir> --prompt <file> --model <s> --reasoning <s> --budget <s>
//   node eval-lock.js <snapshot-dir> --check
//
// The lock hashes: protocol-v1.md, adjudication-schema.json, scoring schema
// (evaluation/scoring-schema.json), selection result, ground-truth
// future.json, snapshot.json, the research prompt, the researcher preset
// (composition + plugins + skills), plus model / reasoning / token budget.
// Any change after the lock → protocol bump + full rerun. `--check` fails on
// any mismatch.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const root = path.join(__dirname, '..', '..')
const snapshotDir = process.argv[2]
const isCheck = process.argv.includes('--check')

const flag = (name) => {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null
}

const lockPath = flag('lock') || path.join(root, 'evaluation', 'protocol-v1.lock')

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const sha256Dir = (dir, acc = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) sha256Dir(full, acc)
    else acc.push(entry.name + ':' + sha256(full))
  }
  acc.sort()
  return crypto.createHash('sha256').update(acc.join('|')).digest('hex')
}

const compute = () => ({
  schema: 'dsh-researcher/eval-lock/v1',
  generated_at: new Date().toISOString(),
  hashes: {
    protocol: sha256(path.join(root, 'docs', 'evaluation-protocol-v1.md')),
    adjudication_schema: sha256(path.join(root, 'evaluation', 'adjudication-schema.json')),
    scoring_schema: fs.existsSync(path.join(root, 'evaluation', 'scoring-schema.json')) ? sha256(path.join(root, 'evaluation', 'scoring-schema.json')) : null,
    selection_result: sha256(path.join(root, 'evaluation', 'selection_result.json')),
    // Governance layer (added pre-lock, 2026-08-21): deviations, runtime
    // manifest, frozen prompt dir and evaluation-owned preset variants.
    deviations: fs.existsSync(path.join(root, 'evaluation', 'deviations.md')) ? sha256(path.join(root, 'evaluation', 'deviations.md')) : null,
    runtime_manifest: fs.existsSync(path.join(root, 'evaluation', 'runtime-manifest.json')) ? sha256(path.join(root, 'evaluation', 'runtime-manifest.json')) : null,
    prompts: fs.existsSync(path.join(root, 'evaluation', 'prompts')) ? sha256Dir(path.join(root, 'evaluation', 'prompts')) : null,
    eval_presets: fs.existsSync(path.join(root, 'evaluation', 'presets')) ? sha256Dir(path.join(root, 'evaluation', 'presets')) : null,
    // Phase A run infrastructure (driver, profile patches, frozen eval
    // settings): the mechanism that pins model/permission for every run.
    eval_runtime: fs.existsSync(path.join(root, 'evaluation', 'runtime')) ? sha256Dir(path.join(root, 'evaluation', 'runtime')) : null,
    ground_truth: sha256(path.join(snapshotDir, 'ground-truth', 'future.json')),
    snapshot: sha256(path.join(snapshotDir, 'snapshot.json')),
    prompt: flag('prompt') ? sha256(flag('prompt')) : null,
    preset: sha256Dir(path.join(root, 'researcher')),
  },
  config: {
    model: flag('model'),
    reasoning: flag('reasoning'),
    token_budget: flag('budget'),
  },
})

if (isCheck) {
  if (!fs.existsSync(lockPath)) {
    console.error('no lock file; run without --check first')
    process.exit(1)
  }
  const locked = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
  const current = compute()
  const diffs = []
  for (const key of Object.keys(locked.hashes)) {
    if (locked.hashes[key] !== current.hashes[key]) diffs.push('hash:' + key)
  }
  for (const key of Object.keys(locked.config)) {
    if (locked.config[key] !== current.config[key]) diffs.push('config:' + key + ' (' + locked.config[key] + ' -> ' + current.config[key] + ')')
  }
  if (diffs.length > 0) {
    console.log('LOCK BROKEN — protocol inputs changed after freeze:')
    for (const d of diffs) console.log('  - ' + d)
    console.log('A change requires a protocol version bump and a full rerun of affected cases.')
    process.exit(1)
  }
  console.log('LOCK OK — all protocol inputs match the frozen lock.')
  process.exit(0)
}

fs.writeFileSync(lockPath, JSON.stringify(compute(), null, 2))
console.log('lock written to ' + lockPath)
