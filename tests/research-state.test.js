// research-state reducer tests: live execution must equal session-log replay,
// invalidation must reach exactly the dependent nodes, export/import must
// round-trip, and replay must be deterministic.
const test = require('node:test')
const assert = require('node:assert')
const { __test } = require('../researcher/plugins/research-state/index.js')
const { makeState, applyCheckpoint, parseCheckpointArgs, fullExport, importState } = __test

const SEQUENCE = [
  {
    phase: 'DISCOVER',
    revise: [
      { id: 'C001', statement: 'supports auto-detection of X', tier: 'C1', verdict: 'Known', evidence: ['src/detect.ts:10-40'], confidence: 0.8 },
      { id: 'C002', statement: 'has test coverage', tier: 'C0', verdict: 'Claimed', evidence: ['README.md:12'], confidence: 0.4 },
    ],
  },
  {
    phase: 'RECONSTRUCT',
    hypotheses: [
      { id: 'H001', statement: 'primary interface is CLI', status: 'active', dependsOn: ['C001', 'C002'] },
      { id: 'H002', statement: 'unrelated hypothesis', status: 'active', dependsOn: ['C999'] },
    ],
    views: [
      { name: 'projectModel', dependsOn: ['H001', 'C001'] },
      { name: 'diagnosis', dependsOn: ['H001'] },
    ],
  },
  {
    phase: 'CHALLENGE',
    revise: [{ id: 'C001', statement: 'auto-detection is partial only', tier: 'C1', verdict: 'Contradicted', evidence: ['src/detect.ts:10-40', 'tests/e2e.ts:5'], confidence: 0.5 }],
  },
  {
    phase: 'CLASSIFY',
    recompute: ['projectModel'],
    hypotheses: [{ id: 'H003', statement: 'bottleneck is scheduler', status: 'active', dependsOn: ['C001'] }],
    views: [{ name: 'classification', dependsOn: ['H003'] }],
  },
]

test('replay of DSH-format tool/call events equals live execution', () => {
  const live = makeState()
  for (const args of SEQUENCE) applyCheckpoint(live, args)

  const replayed = makeState()
  for (const args of SEQUENCE) {
    // DSH `tool/call` events carry `arguments` as the model's raw JSON string.
    applyCheckpoint(replayed, JSON.stringify(args))
  }

  assert.deepEqual(fullExport(replayed), fullExport(live))
})

test('claim revision invalidates exactly its reachable dependents', () => {
  const state = makeState()
  applyCheckpoint(state, {
    phase: 'DISCOVER',
    revise: [
      { id: 'C001', statement: 'supports X', tier: 'C1', verdict: 'Known', evidence: ['src/x.ts:1'], confidence: 0.8 },
      { id: 'C002', statement: 'has tests', tier: 'C0', verdict: 'Claimed', evidence: ['README.md:3'], confidence: 0.4 },
    ],
  })
  applyCheckpoint(state, {
    phase: 'RECONSTRUCT',
    hypotheses: [
      { id: 'H001', statement: 'primary interface is CLI', status: 'active', dependsOn: ['C001', 'C002'] },
      { id: 'H002', statement: 'unrelated hypothesis', status: 'active', dependsOn: ['C999'] },
    ],
    views: [
      { name: 'projectModel', dependsOn: ['H001', 'C001'] },
      { name: 'diagnosis', dependsOn: ['H001'] },
    ],
  })
  applyCheckpoint(state, {
    phase: 'CHALLENGE',
    revise: [{ id: 'C001', statement: 'supports X partially', tier: 'C1', verdict: 'Contradicted', evidence: ['src/x.ts:1', 'tests/e2e.ts:5'], confidence: 0.5 }],
  })

  // After CHALLENGE revised C001: H001 (depends on C001) must be invalidated;
  // projectModel/diagnosis (depend on H001/C001) must be dirty; H002 depends on
  // C999 (unreachable) and must stay active and clean.
  const h1 = state.hypotheses.get('H001')
  const h2 = state.hypotheses.get('H002')
  assert.equal(h1.status, 'invalidated')
  assert.equal(h2.status, 'active')
  assert.ok(state.dirty.has('projectModel'))
  assert.ok(state.dirty.has('diagnosis'))
  assert.ok(!state.dirty.has('H002'))
  assert.ok(!state.dirty.has('C999'))
})

test('material hypothesis change invalidates dependents while staying active', () => {
  const state = makeState()
  applyCheckpoint(state, {
    hypotheses: [{ id: 'H003', statement: 'bottleneck is database', status: 'active', dependsOn: ['C001'] }],
    views: [{ name: 'classification', dependsOn: ['H003'] }],
  })
  state.dirty.delete('classification')
  assert.ok(!state.dirty.has('classification'))

  // Same status, new statement: a material upstream change.
  applyCheckpoint(state, {
    hypotheses: [{ id: 'H003', statement: 'bottleneck is the scheduler', status: 'active', dependsOn: ['C001'] }],
  })
  assert.equal(state.hypotheses.get('H003').status, 'active')
  assert.ok(state.dirty.has('classification'))
})

test('no-op hypothesis resubmission does not dirty dependents', () => {
  const state = makeState()
  applyCheckpoint(state, {
    hypotheses: [{ id: 'H003', statement: 'bottleneck is the scheduler', status: 'active', dependsOn: ['C001'] }],
    views: [{ name: 'classification', dependsOn: ['H003'] }],
  })
  state.dirty.delete('classification')
  applyCheckpoint(state, {
    hypotheses: [{ id: 'H003', statement: 'bottleneck is the scheduler', status: 'active', dependsOn: ['C001'] }],
  })
  assert.ok(!state.dirty.has('classification'))
})

test('export/import round-trips the full state', () => {
  const live = makeState()
  for (const args of SEQUENCE) applyCheckpoint(live, args)

  const restored = makeState()
  importState(restored, fullExport(live))
  assert.deepEqual(fullExport(restored), fullExport(live))
})

test('replay is deterministic across repetitions', () => {
  // Same log replayed onto two empty states must produce identical states.
  const a = makeState()
  const b = makeState()
  for (const args of SEQUENCE) applyCheckpoint(a, JSON.stringify(args))
  for (const args of SEQUENCE) applyCheckpoint(b, JSON.stringify(args))
  assert.deepEqual(fullExport(a), fullExport(b))
})

test('hypotheses keep version history, not just a revision counter', () => {
  const state = makeState()
  applyCheckpoint(state, {
    hypotheses: [{ id: 'H001', statement: 'project is a CLI', status: 'active', dependsOn: ['C001'] }],
  })
  applyCheckpoint(state, {
    hypotheses: [{ id: 'H001', statement: 'project is actually a web product', status: 'active', dependsOn: ['C001'] }],
  })
  const h = state.hypotheses.get('H001')
  assert.equal(h.statement, 'project is actually a web product')
  assert.equal(h.history.length, 1)
  assert.equal(h.history[0].statement, 'project is a CLI')
  assert.equal(h.history[0].revision, 1)
})

test('auto-flip to invalidated also records the previous version', () => {
  const state = makeState()
  applyCheckpoint(state, {
    revise: [{ id: 'C001', statement: 'X', tier: 'C1', verdict: 'Known', evidence: ['a:1'], confidence: 0.8 }],
    hypotheses: [{ id: 'H001', statement: 'depends on C001', status: 'active', dependsOn: ['C001'] }],
  })
  applyCheckpoint(state, {
    revise: [{ id: 'C001', statement: 'X revised', tier: 'C0', verdict: 'Contradicted', evidence: ['b:2'], confidence: 0.3 }],
  })
  const h = state.hypotheses.get('H001')
  assert.equal(h.status, 'invalidated')
  assert.ok(h.history.length >= 1)
  assert.equal(h.history[h.history.length - 1].status, 'active')
})

test('parseCheckpointArgs accepts object and string, rejects garbage', () => {
  const ok = { phase: 'DISCOVER' }
  assert.deepEqual(parseCheckpointArgs(ok), ok)
  assert.deepEqual(parseCheckpointArgs(JSON.stringify(ok)), ok)
  assert.throws(() => parseCheckpointArgs(42))
  assert.throws(() => parseCheckpointArgs('not-json'))
  assert.throws(() => parseCheckpointArgs('[]'))
})
