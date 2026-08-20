// tool-restrict guard logic tests: the execution-time fail-closed layer.
const test = require('node:test')
const assert = require('node:assert')
const { __test } = require('../researcher/plugins/tool-restrict/index.js')
const { envVerdict, readOnlyDenial, stubDefinition, decideGuard, DOCTOR_GATE_DENIAL } = __test

test('envVerdict: read-only + never is the only accepted environment', () => {
  assert.equal(envVerdict('read-only', 'never'), undefined)
  assert.match(envVerdict('workspace-write', 'never'), /sandbox is "workspace-write".*requires "read-only"/)
  assert.match(envVerdict('danger-full-access', 'never'), /danger-full-access/)
  assert.match(envVerdict('read-only', 'ask'), /approval policy is "ask".*requires "never"/)
  assert.match(envVerdict('read-only', undefined), /approval policy is "unknown"/)
})

test('write/edit always deny with a read-only reason', () => {
  for (const name of ['write', 'edit']) {
    assert.match(readOnlyDenial(name), /strictly read-only/)
    assert.match(readOnlyDenial(name), new RegExp(name))
  }
})

test('stub definitions are refusing stubs, not real tools', () => {
  for (const name of ['write', 'edit']) {
    const stub = stubDefinition(name)
    assert.equal(stub.name, name)
    assert.match(stub.description, /DISABLED in research mode/)
    assert.equal(Object.keys(stub.parameters.properties).length, 0)
    // The stub must not carry mutation-relevant parameters.
    assert.ok(!('file_path' in stub.parameters.properties))
    assert.ok(!('content' in stub.parameters.properties))
    assert.ok(!('sandbox_permissions' in stub.parameters.properties))
  }
})

test('health gate: no research tool runs before research_doctor', () => {
  const fresh = { envVerified: false, doctorCalled: false }
  // A read tool before the doctor: denied with the gate message.
  const gated = decideGuard('read', fresh, { mode: 'read-only', policy: 'never' })
  assert.equal(gated.deny, DOCTOR_GATE_DENIAL)
  assert.equal(gated.st.doctorCalled, false)
  // The doctor itself passes and flips the gate.
  const after = decideGuard('research_doctor', fresh, { mode: 'read-only', policy: 'never' })
  assert.equal(after.deny, undefined)
  assert.equal(after.st.doctorCalled, true)
  // After the doctor, reads pass.
  const read = decideGuard('read', after.st)
  assert.equal(read.deny, undefined)
})

test('health gate: write/edit denied even after the doctor', () => {
  const state = { envVerified: true, doctorCalled: true }
  for (const name of ['write', 'edit']) {
    assert.match(decideGuard(name, state).deny, /strictly read-only/)
  }
})

test('health gate: a bad environment denies even the doctor, with the env reason', () => {
  const fresh = { envVerified: false, doctorCalled: false }
  const bad = decideGuard('research_doctor', fresh, { mode: 'danger-full-access', policy: 'never' })
  assert.match(bad.deny, /sandbox is "danger-full-access".*requires "read-only"/)
  assert.equal(bad.st.doctorCalled, false)
})
