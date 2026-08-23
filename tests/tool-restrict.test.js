// tool-restrict guard logic tests: the execution-time fail-closed layer.
const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { __test } = require('../researcher/plugins/tool-restrict/index.js')
const { envVerdict, readOnlyDenial, stubDefinition, decideGuard, readPathVerdict, DOCTOR_GATE_DENIAL, READ_ROOT_DENIAL, recordDoctorVerdict, doctorCapabilityOf, revokeDoctorCapability } = __test

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
  const fresh = { envVerified: false, doctorCalled: false, doctorSafe: false, envFailed: false }
  // A read tool before the doctor: denied with the gate message.
  const gated = decideGuard('read', fresh, { mode: 'read-only', policy: 'never' })
  assert.equal(gated.deny, DOCTOR_GATE_DENIAL)
  assert.equal(gated.st.doctorCalled, false)
  // Calling doctor is allowed, but the pre-execution guard cannot declare the
  // certificate SAFE and therefore cannot unlock the gate.
  const after = decideGuard('research_doctor', fresh, { mode: 'read-only', policy: 'never' })
  assert.equal(after.deny, undefined)
  assert.equal(after.st.doctorCalled, true)
  assert.equal(after.st.doctorSafe, false)
  assert.equal(decideGuard('read', after.st).deny, DOCTOR_GATE_DENIAL)
  // Only a token issued after the actual SAFE result unlocks reads.
  const read = decideGuard('read', { ...after.st, doctorSafe: true })
  assert.equal(read.deny, undefined)
})

test('health gate: write/edit denied even after the doctor', () => {
  const state = { envVerified: true, doctorCalled: true, doctorSafe: true, envFailed: false }
  for (const name of ['write', 'edit']) {
    assert.match(decideGuard(name, state).deny, /strictly read-only/)
  }
})

test('health gate: a bad environment denies even after the doctor (env drift fail-closed)', () => {
  // Doctor passed under a good environment...
  const good = decideGuard('research_doctor', { doctorCalled: false }, { mode: 'read-only', policy: 'never' })
  assert.equal(good.deny, undefined)
  assert.equal(good.st.doctorCalled, true)
  const certified = { ...good.st, doctorSafe: true }
  // ...then the session's permission was switched mid-run: every call is
  // re-verified, so the next read must be denied with the env reason.
  const drifted = decideGuard('read', certified, { mode: 'danger-full-access', policy: 'never' })
  assert.match(drifted.deny, /sandbox is "danger-full-access".*requires "read-only"/)
  assert.equal(drifted.st.doctorSafe, false)
})

test('health gate: bad environment — doctor still runs (to report UNSAFE), everything else stays denied', () => {
  const fresh = { envVerified: false, doctorCalled: false, doctorSafe: false, envFailed: false }
  const bad = decideGuard('research_doctor', fresh, { mode: 'danger-full-access', policy: 'never' })
  assert.equal(bad.deny, undefined) // the doctor must be able to produce the certificate
  assert.equal(bad.st.doctorCalled, true)
  assert.equal(bad.st.envFailed, true)
  // After the failed environment, reads stay denied with the env-failed reason.
  const read = decideGuard('read', bad.st)
  assert.match(read.deny, /environment failed verification/)
})

test('doctor capability exists only for an actual SAFE verdict', () => {
  const agent = {}
  recordDoctorVerdict(agent, 'DEGRADED')
  assert.equal(doctorCapabilityOf(agent), undefined)
  recordDoctorVerdict(agent, 'SAFE')
  assert.equal(doctorCapabilityOf(agent).overall, 'SAFE')
  revokeDoctorCapability(agent)
  assert.equal(doctorCapabilityOf(agent), undefined)
})

test('read-root confinement rejects parent, sibling and external paths', () => {
  const root = path.resolve('D:/isolated/workspace')
  assert.equal(readPathVerdict('read', { file_path: 'src/index.js' }, root), undefined)
  assert.equal(readPathVerdict('glob', { pattern: '**/*' }, root), undefined)
  assert.equal(readPathVerdict('grep', { pattern: 'x', path: '.' }, root), undefined)
  assert.equal(readPathVerdict('read', { file_path: '../T0/state.json' }, root), READ_ROOT_DENIAL)
  assert.equal(readPathVerdict('glob', { pattern: '**/*', path: '../sibling' }, root), READ_ROOT_DENIAL)
  assert.equal(readPathVerdict('read_image', { file_path: 'C:/outside/image.png' }, root), READ_ROOT_DENIAL)
})
