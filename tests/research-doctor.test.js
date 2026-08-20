// research_doctor tests: certificate rendering and fold determinism.
const test = require('node:test')
const assert = require('node:assert')
const { __test: doctor } = require('../researcher/plugins/research-doctor/index.js')
const { __test: state } = require('../researcher/plugins/research-state/index.js')

test('certificate renders SAFE when every check passes', () => {
  const text = doctor.renderCertificate([
    { name: 'Preset', status: 'PASS', detail: 'composedPreset=researcher' },
    { name: 'Sandbox', status: 'PASS', detail: 'mode=read-only' },
    { name: 'Approval', status: 'PASS', detail: 'policy=never' },
    { name: 'Write tools', status: 'PASS', detail: 'write=stub, edit=stub' },
    { name: 'Shell surface', status: 'PASS', detail: 'git_read=present, shell=absent' },
    { name: 'Checkpoint', status: 'PASS', detail: 'available' },
    { name: 'Replay', status: 'PASS', detail: 'live state matches log (15 claims)' },
  ], { run: 17, history: [{ run: 1, overall: 'SAFE' }, { run: 2, overall: 'DEGRADED' }] })
  assert.match(text, /Overall: SAFE/)
  assert.match(text, /Preset: PASS/)
  assert.match(text, /Run: #17/)
  assert.match(text, /History: #1 SAFE · #2 DEGRADED/)
})

test('certificate history is reconstructed from session tool/call and tool/result events', () => {
  const events = [
    { type: 'tool/call', data: { name: 'research_doctor', callId: 'c1' } },
    { type: 'tool/result', data: { callId: 'c1', content: [{ type: 'text', text: '...\nOverall: SAFE' }] } },
    { type: 'tool/call', data: { name: 'read', callId: 'c2' } },
    { type: 'tool/result', data: { callId: 'c2', content: [{ type: 'text', text: 'x' }] } },
    { type: 'tool/call', data: { name: 'research_doctor', callId: 'c3' } },
    { type: 'tool/result', data: { callId: 'c3', content: '...\nOverall: DEGRADED' } },
  ]
  const history = doctor.certificateHistory(events)
  assert.deepEqual(history, [
    { run: 1, overall: 'SAFE' },
    { run: 2, overall: 'DEGRADED' },
  ])
})

test('certificate with no meta reports first run', () => {
  const text = doctor.renderCertificate([{ name: 'Sandbox', status: 'PASS', detail: 'mode=read-only' }], { run: 1, history: [] })
  assert.match(text, /Run: #1/)
  assert.match(text, /History: none \(first run\)/)
})

test('any FAIL makes the verdict UNSAFE; WARN degrades to DEGRADED', () => {
  const unsafe = doctor.renderCertificate([
    { name: 'Sandbox', status: 'FAIL', detail: 'mode=danger-full-access' },
    { name: 'Preset', status: 'PASS', detail: 'composedPreset=researcher' },
  ])
  assert.match(unsafe, /Overall: UNSAFE/)
  assert.match(unsafe, /Sandbox: FAIL \(mode=danger-full-access\)/)

  const degraded = doctor.renderCertificate([
    { name: 'Sandbox', status: 'PASS', detail: 'mode=read-only' },
    { name: 'Replay', status: 'WARN', detail: 'live state diverges from the log' },
  ])
  assert.match(degraded, /Overall: DEGRADED/)
})

test('foldCheckpointEvents is deterministic and skips malformed events', () => {
  const events = [
    { type: 'tool/call', data: { name: 'research_checkpoint', arguments: JSON.stringify({ phase: 'DISCOVER', revise: [{ id: 'C1', statement: 'x', tier: 'C1', verdict: 'Known', evidence: ['a:1'] }] }) } },
    { type: 'tool/call', data: { name: 'other_tool', arguments: '{}' } },
    { type: 'tool/call', data: { name: 'research_checkpoint', arguments: 'not-json' } },
    { type: 'turn/start', data: { turn: 1 } },
  ]
  const a = state.fullExport(state.foldCheckpointEvents(events, state.makeState()))
  const b = state.fullExport(state.foldCheckpointEvents(events, state.makeState()))
  assert.deepEqual(a, b)
  assert.equal(a.claims.length, 1)
  assert.equal(a.claims[0].id, 'C1')
})
