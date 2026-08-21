#!/usr/bin/env node
// Phase A Flask run planner — seeded randomized run order (protocol §5).
//
// Generates the 12-run matrix (4 modes x 3 reps) in a reproducible order:
//   mulberry32(sha256("dsh-researcher-v0.6-phase-a:flask-runs"))
// Fisher-Yates shuffle over the run list. Same inputs => same order, always.
// Writes evaluation/runs/flask/runs-manifest.json (committed BEFORE the runs;
// the executor consumes it in order).
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const root = path.join(__dirname, '..', '..')
const runsDir = path.join(root, 'evaluation', 'runs', 'flask')
fs.mkdirSync(runsDir, { recursive: true })

const seed = 'dsh-researcher-v0.6-phase-a:flask-runs'
const hash = crypto.createHash('sha256').update(seed).digest()
const mulberry32 = (a) => () => {
  a |= 0
  a = (a + 0x6D2B79F5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const rand = mulberry32(hash.readUInt32LE(0))

const MODES = [
  { mode: 'standard', preset: 'standard', plan: false, patches: ['headless-eval.patch.yml'] },
  { mode: 'plan', preset: 'standard', plan: true, patches: ['headless-eval.patch.yml'] },
  { mode: 'quick', preset: 'researcher-quick', plan: false, patches: ['headless-eval.patch.yml', 'headless-eval-researcher.patch.yml'] },
  { mode: 'deep', preset: 'researcher-deep', plan: false, patches: ['headless-eval.patch.yml', 'headless-eval-researcher.patch.yml'] },
]

const runs = []
for (const m of MODES) {
  for (let rep = 1; rep <= 3; rep++) {
    runs.push({
      run_id: `flask-${m.mode}-${String(rep).padStart(2, '0')}`,
      mode: m.mode,
      rep,
      preset: m.preset,
      plan: m.plan,
      patches: m.patches,
    })
  }
}
for (let i = runs.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1))
  ;[runs[i], runs[j]] = [runs[j], runs[i]]
}
runs.forEach((run, index) => { run.order = index + 1 })

const manifest = {
  schema: 'dsh-researcher/runs-manifest/v1',
  case: 'flask',
  seed,
  generated_at: new Date().toISOString(),
  snapshot_dir: 'D:/AI_work_project/phase-a-snapshots/flask',
  workspace_dir: 'D:/AI_work_project/phase-a-snapshots/flask/workspace',
  prompt_file: 'evaluation/prompts/phase-a-default.txt',
  runs,
}
fs.writeFileSync(path.join(runsDir, 'runs-manifest.json'), JSON.stringify(manifest, null, 2))
console.log('runs-manifest written; order:')
for (const r of runs) console.log(`  ${r.order}. ${r.run_id} (${r.preset}${r.plan ? ' +plan' : ''})`)
