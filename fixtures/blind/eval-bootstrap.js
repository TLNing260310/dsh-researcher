#!/usr/bin/env node
// Evaluation Bootstrap Checklist — the governance gate for Phase A.
//
// Purpose: a fresh clone must be able to answer "is this environment ready to
// run agent experiments?" with one command. This is the anti-forgetting layer
// between the frozen protocol and the first agent run: tools existing is not
// the same as the environment being prepared.
//
// Usage:
//   node fixtures/blind/eval-bootstrap.js            (repo-relative defaults)
//   node fixtures/blind/eval-bootstrap.js --json     (machine-readable status)
//
// Exit: 0 only when every required item is PASS (READY TO RUN), else 1.
// It never mutates anything — it only verifies.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')

const root = path.join(__dirname, '..', '..')
const manifestPath = path.join(root, 'evaluation', 'runtime-manifest.json')
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const short = (h) => h.slice(0, 12)

const rows = []
const pass = (name, detail) => rows.push({ name, status: 'PASS', detail: detail || '' })
const fail = (name, detail) => rows.push({ name, status: 'FAIL', detail: detail || '' })
const warn = (name, detail) => rows.push({ name, status: 'WARN', detail: detail || '' })

// ── 1. Protocol ─────────────────────────────────────────────────────────────
const protocol = path.join(root, 'docs', 'evaluation-protocol-v1.md')
if (!fs.existsSync(protocol)) fail('Protocol', 'docs/evaluation-protocol-v1.md missing')
else pass('Protocol', 'frozen, ' + short(sha256(protocol)))

// ── 2. Selection ────────────────────────────────────────────────────────────
const selPath = path.join(root, 'evaluation', 'selection_result.json')
const seedFile = path.join(root, 'evaluation', 'random_seed.txt')
let selected = []
if (!fs.existsSync(selPath)) fail('Selection', 'evaluation/selection_result.json missing')
else {
  const sel = JSON.parse(fs.readFileSync(selPath, 'utf8'))
  const seedOk = fs.existsSync(seedFile) && sel.seed === fs.readFileSync(seedFile, 'utf8').trim()
  if (sel.schema !== 'dsh-researcher/selection-result/v1') fail('Selection', 'wrong schema: ' + sel.schema)
  else if (!Array.isArray(sel.selected) || sel.selected.length !== 3) fail('Selection', 'expected 3 selected, got ' + (sel.selected || []).length)
  else if (!seedOk) fail('Selection', 'seed mismatch with random_seed.txt')
  else {
    selected = sel.selected
    pass('Selection', sel.selected.map((s) => s.repo).join(', '))
  }
}

// ── 3/4. Scoring + Adjudication schemas ─────────────────────────────────────
for (const [name, file] of [['Scoring', 'scoring-schema.json'], ['Adjudication', 'adjudication-schema.json']]) {
  const f = path.join(root, 'evaluation', file)
  if (!fs.existsSync(f)) fail(name, 'evaluation/' + file + ' missing')
  else pass(name, 'frozen, ' + short(sha256(f)))
}

// ── 5. Deviations ───────────────────────────────────────────────────────────
const devPath = path.join(root, 'evaluation', 'deviations.md')
if (!fs.existsSync(devPath)) fail('Deviations', 'evaluation/deviations.md missing')
else if (!fs.readFileSync(devPath, 'utf8').includes('D001')) fail('Deviations', 'D001 single-operator deviation not recorded')
else pass('Deviations', 'D001 recorded, ' + short(sha256(devPath)))

// ── 6. Prompt freeze ────────────────────────────────────────────────────────
const promptFile = path.join(root, 'evaluation', 'prompts', 'phase-a-default.txt')
if (!fs.existsSync(promptFile)) fail('Prompt Freeze', 'evaluation/prompts/phase-a-default.txt missing')
else pass('Prompt Freeze', short(sha256(promptFile)) + ' — ' + JSON.stringify(fs.readFileSync(promptFile, 'utf8').trim()))

// ── 7. Runtime manifest ─────────────────────────────────────────────────────
if (!manifest) fail('Runtime Manifest', 'evaluation/runtime-manifest.json missing')
else if (manifest.schema !== 'dsh-researcher/runtime-manifest/v1') fail('Runtime Manifest', 'wrong schema')
else pass('Runtime Manifest', short(sha256(manifestPath)))

// ── 8. Eval preset variants ─────────────────────────────────────────────────
for (const v of ['researcher-quick', 'researcher-deep']) {
  const p = path.join(root, 'evaluation', 'presets', v, 'agent.cordis.yml')
  if (!fs.existsSync(p)) fail('Eval Preset ' + v, 'evaluation/presets/' + v + '/agent.cordis.yml missing')
  else {
    const text = fs.readFileSync(p, 'utf8')
    const hasOverride = /EVALUATION OVERRIDE/.test(text)
    if (!hasOverride) fail('Eval Preset ' + v, 'depth override missing from persona')
    else pass('Eval Preset ' + v, 'depth override present')
  }
}

// ── 9/10. Snapshots + Ground truth (blind-doctor per case) ──────────────────
const snapRoot = manifest && manifest.paths && manifest.paths.snapshots_root
  ? manifest.paths.snapshots_root
  : path.join(root, '..', 'phase-a-snapshots')
const doctor = path.join(root, 'fixtures', 'blind', 'blind-doctor.js')
for (const s of selected) {
  const caseKey = s.repo.split('/')[1]
  const dir = path.join(snapRoot, caseKey)
  if (!fs.existsSync(path.join(dir, 'snapshot.json'))) {
    fail('Snapshot ' + caseKey, dir + ' — snapshot.json missing (run blind-snapshot.js create)')
    continue
  }
  const res = spawnSync(process.execPath, [doctor, dir], { encoding: 'utf8' })
  const verdict = res.stdout.split('\n')[0] || ''
  if (res.status !== 0) fail('Snapshot ' + caseKey, dir + ' — blind-doctor: ' + verdict.replace('Blindness Doctor — ', ''))
  else pass('Snapshot ' + caseKey, 'blind-doctor PASS @ ' + dir)
}

// ── 11. Lock (eval-lock --check per case) ───────────────────────────────────
const lockDir = manifest && manifest.paths && manifest.paths.lock_dir ? manifest.paths.lock_dir : path.join(root, 'evaluation')
const evalLock = path.join(root, 'fixtures', 'blind', 'eval-lock.js')
const model = manifest ? (manifest.model.provider + '/' + manifest.model.model) : 'unknown'
const reasoning = manifest ? manifest.model.reasoning : 'unknown'
const budget = manifest ? manifest.token_budget : 'unknown'
for (const s of selected) {
  const caseKey = s.repo.split('/')[1]
  const dir = path.join(snapRoot, caseKey)
  const lockFile = path.join(lockDir, caseKey + '.protocol-v1.lock')
  if (!fs.existsSync(lockFile)) {
    fail('Lock ' + caseKey, lockFile + ' missing (run eval-lock.js with --lock)')
    continue
  }
  const args = [evalLock, dir, '--prompt', promptFile, '--model', model, '--reasoning', reasoning, '--budget', budget, '--lock', lockFile, '--check']
  const res = spawnSync(process.execPath, args, { encoding: 'utf8' })
  if (res.status !== 0) fail('Lock ' + caseKey, (res.stdout + res.stderr).trim().split('\n')[0])
  else pass('Lock ' + caseKey, 'eval-lock --check OK')
}

// ── 12. Installed runtime presets ───────────────────────────────────────────
const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
for (const p of ['researcher', 'researcher-quick', 'researcher-deep']) {
  const dir = path.join(dshHome, '.agent-presets', p)
  if (!fs.existsSync(path.join(dir, 'agent.cordis.yml'))) fail('Preset ' + p, dir + ' not installed (run bin/install.js / copy from evaluation/presets)')
  else pass('Preset ' + p, dir)
}
if (manifest && manifest.paths && manifest.paths.shipped_standard_preset_dir) {
  const sp = manifest.paths.shipped_standard_preset_dir
  if (!fs.existsSync(path.join(sp, 'agent.cordis.yml'))) fail('Preset standard (shipped)', sp + ' not found')
  else pass('Preset standard (shipped)', sp)
} else {
  warn('Preset standard (shipped)', 'runtime-manifest.json missing shipped_standard_preset_dir — cannot verify')
}

// ── verdict ─────────────────────────────────────────────────────────────────
const jsonOut = process.argv.includes('--json')
const failed = rows.filter((r) => r.status === 'FAIL')
const ready = failed.length === 0
if (jsonOut) {
  console.log(JSON.stringify({ schema: 'dsh-researcher/eval-bootstrap/v1', ready, checked_at: new Date().toISOString(), rows }, null, 2))
} else {
  console.log('Evaluation Bootstrap Checklist — ' + (ready ? 'READY TO RUN' : 'NOT READY (' + failed.length + ' FAIL)'))
  for (const r of rows) console.log('  [' + r.status + '] ' + r.name + (r.detail ? ' — ' + r.detail : ''))
  if (!ready) {
    console.log('')
    console.log('Fix the FAIL items above, then re-run. Do not start agent runs while any item is FAIL.')
  }
}
process.exit(ready ? 0 : 1)
