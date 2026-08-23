// Evaluation tooling tests: adjudication merger, selection result, eval lock.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.join(__dirname, '..')
const runNode = (script, args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })

test('adjudication merger: agree include/exclude, mismatch ambiguous, agreement rate', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dshr-adj-'))
  const aFile = path.join(dir, 'a.json')
  const bFile = path.join(dir, 'b.json')
  const outFile = path.join(dir, 'merged.json')
  fs.writeFileSync(aFile, JSON.stringify({
    evaluator: 'A',
    items: [
      { id: 'GT-01', future_event: 'x', latent_at_t0: true },
      { id: 'GT-02', future_event: 'y', latent_at_t0: false },
      { id: 'GT-03', future_event: 'z', latent_at_t0: true },
      { id: 'GT-04', future_event: 'w', latent_at_t0: true },
    ],
  }))
  fs.writeFileSync(bFile, JSON.stringify({
    evaluator: 'B',
    items: [
      { id: 'GT-01', future_event: 'x', latent_at_t0: true },
      { id: 'GT-02', future_event: 'y', latent_at_t0: false },
      { id: 'GT-03', future_event: 'z', latent_at_t0: false },
      { id: 'GT-04', future_event: 'w', latent_at_t0: null },
    ],
  }))
  const result = runNode(path.join(root, 'fixtures', 'blind', 'adjudicate.js'), [aFile, bFile, '--out', outFile])
  assert.equal(result.status, 0)
  const merged = JSON.parse(fs.readFileSync(outFile, 'utf8'))
  assert.equal(merged.included, 1)
  assert.equal(merged.excluded, 1)
  assert.equal(merged.ambiguous, 2)
  assert.equal(merged.agreement_rate, 0.5)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('selection result is frozen: seed recorded, 3 selected, distinct languages', () => {
  const result = JSON.parse(fs.readFileSync(path.join(root, 'evaluation', 'selection_result.json'), 'utf8'))
  const seed = fs.readFileSync(path.join(root, 'evaluation', 'random_seed.txt'), 'utf8').trim()
  assert.equal(result.seed, seed)
  assert.equal(result.selected.length, 3)
  const langs = new Set(result.selected.map((s) => s.language))
  assert.equal(langs.size, 3)
})

test('invalid C+ experiment cannot be represented as causal support', () => {
  const validity = JSON.parse(fs.readFileSync(path.join(root, 'evaluation', 'cases', 'commander.js', 'gt-calibration', 'experiment-cplus-validity.json'), 'utf8'))
  const score = JSON.parse(fs.readFileSync(path.join(root, 'evaluation', 'results', 'experiment-cplus', 'score-report.json'), 'utf8'))
  assert.equal(validity.valid_for_causal_claim, false)
  assert.equal(score.causal_validity.valid_for_causal_claim, false)
  assert.equal(score.h2_condition_met, false)
  assert.equal(score.verdict, 'INVALID FOR CAUSAL CLAIM')
})

test('eval lock: --check passes unchanged and fails after a mutation', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dshr-lock-'))
  const snapshot = path.join(dir, 'snapshot')
  fs.mkdirSync(path.join(snapshot, 'ground-truth'), { recursive: true })
  fs.writeFileSync(path.join(snapshot, 'ground-truth', 'future.json'), JSON.stringify({ ground_truth: [] }))
  fs.writeFileSync(path.join(snapshot, 'snapshot.json'), JSON.stringify({ cutoff_date: '2026-01-01T00:00:00Z', ground_truth_sha256: null }))
  const promptFile = path.join(dir, 'prompt.md')
  fs.writeFileSync(promptFile, 'research prompt v1')
  const lockFile = path.join(dir, 'protocol.lock')
  const args = [snapshot, '--prompt', promptFile, '--model', 'test-model', '--reasoning', 'max', '--budget', '200k', '--lock', lockFile]
  const lock = runNode(path.join(root, 'fixtures', 'blind', 'eval-lock.js'), args)
  assert.equal(lock.status, 0, lock.stderr)
  const check = runNode(path.join(root, 'fixtures', 'blind', 'eval-lock.js'), [snapshot, '--prompt', promptFile, '--model', 'test-model', '--reasoning', 'max', '--budget', '200k', '--lock', lockFile, '--check'])
  assert.equal(check.status, 0, check.stdout + check.stderr)
  // Mutate the ground truth: the lock must break.
  fs.writeFileSync(path.join(snapshot, 'ground-truth', 'future.json'), JSON.stringify({ ground_truth: [{ id: 'GT-99' }] }))
  const broken = runNode(path.join(root, 'fixtures', 'blind', 'eval-lock.js'), [snapshot, '--prompt', promptFile, '--model', 'test-model', '--reasoning', 'max', '--budget', '200k', '--lock', lockFile, '--check'])
  assert.equal(broken.status, 1)
  assert.match(broken.stdout, /LOCK BROKEN/)
  fs.rmSync(dir, { recursive: true, force: true })
})
