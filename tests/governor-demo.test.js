'use strict'

const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const {
  createIsolatedFixture,
  repairFixture,
  removeIsolatedFixture,
  runVerifier,
} = require('../scripts/demo-governor.js')

const root = path.resolve(__dirname, '..')

test('the demo verifier exit codes are captured from real spawned processes', (t) => {
  const fixtureRoot = createIsolatedFixture()
  t.after(() => removeIsolatedFixture(fixtureRoot))

  const before = runVerifier(fixtureRoot)
  assert.equal(before.execution.spawn_api, 'node:child_process.spawnSync')
  assert.ok(Number.isInteger(before.execution.pid) && before.execution.pid > 0)
  assert.equal(before.execution.status, 1)
  assert.equal(before.host_result.exit_code, before.execution.status)
  assert.match(before.host_result.stderr, /not verified/)

  repairFixture(fixtureRoot)
  const after = runVerifier(fixtureRoot)
  assert.ok(Number.isInteger(after.execution.pid) && after.execution.pid > 0)
  assert.notEqual(after.execution.pid, before.execution.pid)
  assert.equal(after.execution.status, 0)
  assert.equal(after.host_result.exit_code, after.execution.status)
  assert.match(after.host_result.stdout, /verified/)
})

test('the public demo rejects confidence and reaches DONE only after real verifier evidence', () => {
  const run = spawnSync(process.execPath, [path.join(root, 'scripts', 'demo-governor.js'), '--json'], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  const report = JSON.parse(run.stdout)
  assert.deepEqual(report.stages.map((item) => item.result.decision), ['CONTINUE', 'CONTINUE', 'DONE'])
  assert.match(report.stages[0].observed, /Assistant says DONE/)
  assert.equal(report.stages[1].process.spawn_api, 'node:child_process.spawnSync')
  assert.equal(report.stages[1].process.exit_code_from_spawn_status, 1)
  assert.equal(report.stages[2].process.exit_code_from_spawn_status, 0)
  assert.equal(report.stages[1].process.pid_observed, true)
  assert.equal(report.stages[2].process.pid_observed, true)
  assert.ok(report.evidence_boundary.simulated.some((item) => /host tool\/call/.test(item)))
  assert.ok(report.evidence_boundary.production.some((item) => /Governor reducer/.test(item)))
  assert.ok(report.evidence_boundary.excluded.includes('Live E1'))
})
