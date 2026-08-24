// tool-restrict guard logic tests: the execution-time fail-closed layer.
const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const toolRestrict = require('../researcher/plugins/tool-restrict/index.js')
const { __test } = toolRestrict
const { envVerdict, readOnlyDenial, stubDefinition, decideGuard, readPathVerdict, terminalGateDecision, makeTerminalGateMessage, isResearcherPreset, DOCTOR_GATE_DENIAL, READ_ROOT_DENIAL, TERMINAL_GATE_FAILURE, recordDoctorVerdict, doctorCapabilityOf, doctorVerdictOf, revokeDoctorCapability } = __test

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
  assert.equal(doctorVerdictOf(agent).overall, 'DEGRADED')
  recordDoctorVerdict(agent, 'SAFE')
  assert.equal(doctorCapabilityOf(agent).overall, 'SAFE')
  assert.equal(doctorVerdictOf(agent).overall, 'SAFE')
  revokeDoctorCapability(agent)
  assert.equal(doctorCapabilityOf(agent), undefined)
  assert.equal(doctorVerdictOf(agent), undefined)
})

test('terminal doctor gate retries once, then rejects an uncertified completion', () => {
  const first = terminalGateDecision(undefined, 0)
  assert.deepEqual(first, { kind: 'retry', retries: 1 })
  const message = makeTerminalGateMessage()
  assert.equal(message.role, 'user')
  assert.equal(message.source.kind, 'plugin')
  assert.equal(message.source.form, 'notice')
  assert.match(message.content[0].text, /previous assistant text was rejected.*research_doctor/s)
  const second = terminalGateDecision(undefined, first.retries)
  assert.equal(second.kind, 'reject')
  assert.equal(second.error, TERMINAL_GATE_FAILURE)
})

test('terminal doctor gate accepts every completed certificate verdict but only SAFE unlocks tools', () => {
  for (const overall of ['SAFE', 'DEGRADED', 'UNSAFE']) {
    const agent = {}
    recordDoctorVerdict(agent, overall)
    assert.deepEqual(terminalGateDecision(doctorVerdictOf(agent), 1), { kind: 'accept' })
    assert.equal(doctorCapabilityOf(agent) !== undefined, overall === 'SAFE')
  }
})

test('only researcher-family preset selections trigger post-creation attachment', () => {
  for (const id of ['researcher', 'researcher-quick', 'researcher-deep']) assert.equal(isResearcherPreset(id), true)
  for (const id of ['standard', 'governed', undefined, '']) assert.equal(isResearcherPreset(id), false)
})

const makePluginHarness = () => {
  const handlers = new Map()
  const state = { mode: 'read-only', policy: 'ask' }
  const definitions = new Map()
  const agent = {
    session: {},
    inject() {},
    ctx: {
      tools: {
        register(definition) {
          definitions.set(definition.name, definition)
          return () => definitions.delete(definition.name)
        },
        get(name) { return definitions.get(name) },
      },
      get(name) {
        if (name !== 'systemPrompt') return undefined
        return { section() { return () => {} } }
      },
    },
  }
  const ctx = {
    tools: {
      restrict() {},
      guard() {},
    },
    agents: { get() { return agent } },
    sandboxPolicy: {
      overrideOf() { return state.mode },
      resolve() { return { mode: state.mode, workspaceRoot: process.cwd() } },
      setSandboxMode(_session, mode) { state.mode = mode },
    },
    approval: {
      overrideOf() { return state.policy },
      setPolicy(_agent, policy) { state.policy = policy },
    },
    on(name, handler) { handlers.set(name, handler) },
  }
  toolRestrict.apply(ctx, { mode: 'strict' })
  return { agent, handlers, state, definitions }
}

test('Web pre-step attaches stubs, tightens approval, and rechecks later sandbox drift', () => {
  const { agent, handlers, state, definitions } = makePluginHarness()
  let continued = 0
  handlers.get('agent/pre-step')({ agent }, () => { continued++ })
  assert.equal(state.policy, 'never')
  assert.match(definitions.get('write').description, /DISABLED/)
  assert.match(definitions.get('edit').description, /DISABLED/)
  assert.equal(continued, 1)

  state.mode = 'workspace-write'
  assert.throws(
    () => handlers.get('agent/pre-step')({ agent }, () => { continued++ }),
    /sandbox is "workspace-write".*requires "read-only"/,
  )
  assert.equal(continued, 1)
})

test('terminal prose rechecks permission and revokes a stale SAFE doctor verdict', () => {
  const { agent, handlers, state } = makePluginHarness()
  handlers.get('agent/pre-step')({ agent }, () => {})
  recordDoctorVerdict(agent, 'SAFE')
  state.mode = 'workspace-write'
  assert.throws(
    () => handlers.get('agent/turn-stopping')({ agent }),
    /sandbox is "workspace-write".*requires "read-only"/,
  )
  assert.equal(doctorVerdictOf(agent), undefined)
  assert.equal(doctorCapabilityOf(agent), undefined)
})

test('read-root confinement rejects parent, sibling and external paths', () => {
  const root = path.resolve('isolated', 'workspace')
  const external = path.resolve(path.parse(root).root, 'outside', 'image.png')
  assert.equal(readPathVerdict('read', { file_path: 'src/index.js' }, root), undefined)
  assert.equal(readPathVerdict('glob', { pattern: '**/*' }, root), undefined)
  assert.equal(readPathVerdict('grep', { pattern: 'x', path: '.' }, root), undefined)
  assert.equal(readPathVerdict('read', { file_path: '../T0/state.json' }, root), READ_ROOT_DENIAL)
  assert.equal(readPathVerdict('glob', { pattern: '**/*', path: '../sibling' }, root), READ_ROOT_DENIAL)
  assert.equal(readPathVerdict('read_image', { file_path: external }, root), READ_ROOT_DENIAL)
  assert.equal(readPathVerdict('read_image', { file_path: 'C:/foreign/image.png' }, root), READ_ROOT_DENIAL)
})
