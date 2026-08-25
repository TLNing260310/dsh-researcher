const test = require('node:test')
const assert = require('node:assert')
const os = require('node:os')
const fs = require('node:fs')
const path = require('node:path')
const plugin = require('../researcher/plugins/goal-governor/index.js')
const { createEmptyState, sealState } = require('../lib/cognition-core/index.js')
const { approveContract } = require('../lib/goal-core/index.js')
const { sealRegistry, argumentsHash } = require('../lib/verifier-core/index.js')
const { makeGoalPointer } = require('../lib/dsh-adapter/index.js')

const governorCall = (seq, callId, name, args) => ({ seq, type: 'tool/call', data: { callId, name, arguments: JSON.stringify(args) } })
const governorResult = (seq, callId, value) => ({ seq, type: 'tool/result', data: { message: { callId, content: [{ type: 'text', text: JSON.stringify(value) }] } } })

const governedCommandHarness = (t, { gates, events }) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-governor-gate-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, '.project-cognition', 'goals'), { recursive: true })
  const state = createEmptyState()
  state.mission.purpose = 'Prove paused human-gate authority.'
  const sealedState = sealState(state)
  const registry = sealRegistry({
    schema: 'project-cognition/verifier-registry/v1', revision: 1, registry_hash: null,
    entries: [{ id: 'tests.core', invocations: [{ tool_name: 'pwsh', arguments: { command: 'npm test' }, arguments_hash: argumentsHash({ command: 'npm test' }) }], result_policy: { kind: 'json_field_equals', path: 'exit_code', equals: 0 } }],
  })
  const contract = approveContract({
    schema: 'project-cognition/goal/v1', goal_id: 'G-GATE', revision: 1, status: 'draft', contract_hash: null,
    verifier_registry_hash: registry.registry_hash, mode: 'governed',
    intent: { problem: 'paused gate authority', value: 'fail-closed resume' }, baseline: { repo_revision: 'abc', cognition_hash: sealedState.state_hash, known_failures: [] },
    target_state: 'tests and every human gate pass', criteria: [{ id: 'C1', priority: 'must', expected: 'tests pass', verifier_id: 'tests.core', authority: 'tool', evidence_required: ['tool result'] }],
    boundaries: { in_scope: ['tests'], out_of_scope: [], do_not_touch: [] }, invariant_refs: [],
    limits: { max_attempts: 2, max_no_progress_attempts: 2, max_time_sec: null, max_tokens: null },
    human_gates: gates.map((id) => ({ id, description: 'Owner approves ' + id })), approval: null,
  }, 'owner', '2026-08-24T00:00:00.000Z')
  const contractRelative = '.project-cognition/goals/G-GATE.r1.json'
  fs.writeFileSync(path.join(root, '.project-cognition', 'state.json'), JSON.stringify(sealedState))
  fs.writeFileSync(path.join(root, '.project-cognition', 'verifiers.json'), JSON.stringify(registry))
  fs.writeFileSync(path.join(root, contractRelative), JSON.stringify(contract))
  const runtimeGoal = { id: 'runtime-gate', revision: 4, phase: 'paused', objective: makeGoalPointer(contractRelative, contract.contract_hash) }
  const agent = { session: { header: { cwd: root }, events: [
    { seq: 1, type: 'goal/change', data: { operation: 'create', goal: { id: runtimeGoal.id } } },
    ...events,
  ] } }
  const commands = []
  const resumed = []
  const ctx = {
    tools: { register: () => {}, guard: () => {} },
    goals: {
      get: () => runtimeGoal,
      resume: (_agent, ref) => { resumed.push(ref); runtimeGoal.phase = 'active' },
      pause: () => { throw new Error('unexpected pause') },
    },
    systemPrompt: { section: () => {} },
    inject: (_dependencies, callback) => callback({ commands: { register: (definition) => commands.push(definition) } }),
  }
  plugin.apply(ctx, { role: 'executor' })
  return { agent, command: commands[0], resumed, runtimeGoal }
}

const passingGatePrefix = () => [
  governorCall(2, 'v1', 'pwsh', { command: 'npm test' }),
  governorResult(3, 'v1', { exit_code: 0 }),
  governorCall(4, 'a1', 'begin_goal_attempt', { attempt_id: 'baseline', baseline: true, target_criteria: ['C1'], repo_revision: 'abc' }),
  governorCall(5, 'o1', 'submit_goal_observation', { attempt_id: 'baseline', criterion_id: 'C1', verifier_id: 'tests.core', result: 'pass', evidence_refs: ['v1'], repo_revision: 'abc' }),
  governorCall(6, 'c1', 'complete_goal_attempt', { attempt_id: 'baseline' }),
  governorCall(7, 'd1', 'request_goal_decision', {}),
]

test('governor contract paths are confined to the project goal directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-governor-'))
  fs.mkdirSync(path.join(root, '.project-cognition', 'goals'), { recursive: true })
  const valid = plugin.__test.confinedFile(root, '.project-cognition/goals/G1.json', '.project-cognition/goals')
  assert.equal(valid, path.join(root, '.project-cognition', 'goals', 'G1.json'))
  assert.throws(() => plugin.__test.confinedFile(root, '../outside.json', '.project-cognition/goals'), /escapes/)
  assert.throws(() => plugin.__test.confinedFile(root, '.project-cognition/state.json', '.project-cognition/goals'), /escapes/)
})

test('governor path confinement rejects a cognition directory alias outside the workspace', (t) => {
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-governor-link-'))
  t.after(() => fs.rmSync(outer, { recursive: true, force: true }))
  const root = path.join(outer, 'workspace')
  const outside = path.join(outer, 'outside')
  fs.mkdirSync(root)
  fs.mkdirSync(path.join(outside, 'goals'), { recursive: true })
  try { fs.symlinkSync(outside, path.join(root, '.project-cognition'), process.platform === 'win32' ? 'junction' : 'dir') } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      t.diagnostic('directory-link creation is unavailable on this host')
      return
    }
    throw error
  }
  assert.throws(
    () => plugin.__test.confinedFile(root, '.project-cognition/goals/G1.r1.json', '.project-cognition/goals'),
    /escapes/,
  )
})

test('runtime selection refuses an approved contract after a newer local revision exists', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-governor-latest-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const goals = path.join(root, '.project-cognition', 'goals')
  fs.mkdirSync(goals, { recursive: true })
  const contract = { goal_id: 'G/latest', revision: 1, status: 'approved' }
  const revision1 = path.join(goals, 'G%2Flatest.r1.json')
  fs.writeFileSync(revision1, '{}')
  assert.doesNotThrow(() => plugin.__test.assertLatestGoalRevision(root, revision1, contract))
  fs.writeFileSync(path.join(goals, 'G%2Flatest.r2.json'), '{}')
  assert.throws(() => plugin.__test.assertLatestGoalRevision(root, revision1, contract), /stale; latest installed revision is 2/)
})

test('guarded Researcher Mode is fail-closed to an explicit tool allowlist', () => {
  assert.equal(plugin.__test.RESEARCH_ALLOWLIST.has('read'), true)
  assert.equal(plugin.__test.RESEARCH_ALLOWLIST.has('write'), false)
  assert.equal(plugin.__test.RESEARCH_ALLOWLIST.has('pwsh'), false)
  assert.equal(plugin.__test.RESEARCH_ALLOWLIST.has('subagent'), false)
})

test('a paused Goal Contract blocks model mutation and verifier calls until direct human resume', () => {
  let guard
  const runtimeGoal = { phase: 'paused' }
  const ctx = {
    tools: { register: () => {}, guard: (callback) => { guard = callback } },
    goals: { get: () => runtimeGoal },
    systemPrompt: { section: () => {} },
    inject: (_dependencies, callback) => callback({ commands: { register: () => {} } }),
  }
  plugin.apply(ctx, { role: 'executor' })
  const agent = { session: { header: { cwd: process.cwd() }, events: [] } }
  assert.match(guard({ agent, name: 'write', arguments: { file_path: 'src/task.js' } }), /paused Goal Contract is read-only/)
  assert.match(guard({ agent, name: 'e1_verify', arguments: {} }), /paused Goal Contract is read-only/)
  assert.equal(guard({ agent, name: 'get_goal_contract', arguments: {} }), undefined)
})

test('direct approval resumes a paused goal only after the sole human gate clears replay', (t) => {
  const harness = governedCommandHarness(t, {
    gates: ['H1'],
    events: [...passingGatePrefix(), { seq: 8, type: 'command/run', data: { name: 'researcher', args: 'approve-gate H1 review-1' } }],
  })
  const response = harness.command.handler({ agent: harness.agent, rawInput: 'approve-gate H1 review-1' })
  assert.equal(response.kind, 'success')
  assert.deepEqual(harness.resumed, [{ id: 'runtime-gate', revision: 4 }])
  assert.equal(harness.runtimeGoal.phase, 'active')
})

test('approving only one of multiple gates leaves the Goal Contract paused', (t) => {
  const harness = governedCommandHarness(t, {
    gates: ['H1', 'H2'],
    events: [...passingGatePrefix(), { seq: 8, type: 'command/run', data: { name: 'researcher', args: 'approve-gate H1 review-1' } }],
  })
  const response = harness.command.handler({ agent: harness.agent, rawInput: 'approve-gate H1 review-1' })
  assert.equal(response.kind, 'success')
  assert.match(response.text, /Goal remains paused/)
  assert.match(response.text, /H2/)
  assert.deepEqual(harness.resumed, [])
  assert.equal(harness.runtimeGoal.phase, 'paused')
})

test('a pending second gate blocks resume even when the recomputed decision is CONTINUE', (t) => {
  const harness = governedCommandHarness(t, {
    gates: ['H1', 'H2'],
    events: [
      governorCall(2, 'd1', 'request_goal_decision', {}),
      { seq: 3, type: 'command/run', data: { name: 'researcher', args: 'approve-gate H1 review-1' } },
    ],
  })
  const response = harness.command.handler({ agent: harness.agent, rawInput: 'approve-gate H1 review-1' })
  assert.equal(response.kind, 'success')
  assert.match(response.text, /Goal remains paused: CONTINUE/)
  assert.match(response.text, /pending gates: H2/)
  assert.deepEqual(harness.resumed, [])
})

test('a durable guard violation cannot be cleared by approving a human gate', (t) => {
  const prefix = passingGatePrefix().slice(0, -1)
  const harness = governedCommandHarness(t, {
    gates: ['H1'],
    events: [
      ...prefix,
      governorCall(7, 'bad-attempt', 'begin_goal_attempt', { attempt_id: 'change-1', baseline: false, target_criteria: ['UNKNOWN'], repo_revision: 'def' }),
      governorCall(8, 'd1', 'request_goal_decision', {}),
      { seq: 9, type: 'command/run', data: { name: 'researcher', args: 'approve-gate H1 review-1' } },
    ],
  })
  const response = harness.command.handler({ agent: harness.agent, rawInput: 'approve-gate H1 review-1' })
  assert.equal(response.kind, 'success')
  assert.match(response.text, /Goal remains paused: NEEDS_HUMAN/)
  assert.match(response.text, /boundary or invariant was violated/)
  assert.deepEqual(harness.resumed, [])
  assert.equal(harness.runtimeGoal.phase, 'paused')
})

test('one-shot and contract prompts preserve the research/execute authority split', () => {
  assert.match(plugin.__test.researchPrompt('inspect', false), /read-only/)
  assert.match(plugin.__test.researchPrompt('fix loop', true), /DRAFT JSON contract/)
  assert.match(plugin.__test.researchPrompt('fix loop', true), /Do not approve it and do not implement/)
})

test('plugin composition exposes governor tools only on the executor role', () => {
  const compose = (role) => {
    const registeredTools = []
    const registeredCommands = []
    const ctx = {
      tools: { register: (definition) => registeredTools.push(definition), guard: () => {} },
      goals: {},
      systemPrompt: { section: () => {} },
      inject: (_dependencies, callback) => callback({ commands: { register: (definition) => registeredCommands.push(definition) } }),
    }
    plugin.apply(ctx, { role })
    return { registeredTools, registeredCommands }
  }
  const executor = compose('executor')
  assert.deepEqual(executor.registeredTools.map((tool) => tool.name), [
    'researcher_mode_status', 'get_goal_contract', 'begin_goal_attempt', 'submit_goal_observation',
    'complete_goal_attempt', 'report_goal_blocker', 'request_goal_decision',
  ])
  assert.deepEqual(executor.registeredCommands.map((command) => command.name), ['researcher'])
  const blocker = executor.registeredTools.find((tool) => tool.name === 'report_goal_blocker')
  assert.deepEqual(blocker.parameters.required, ['code', 'detail'])
  assert.deepEqual(Object.keys(blocker.parameters.properties).sort(), ['code', 'detail'])
  assert.match(blocker.description, /direct \/researcher confirm-blocker user authority/)
  assert.match(executor.registeredCommands[0].input.hint, /confirm-blocker/)
  for (const definition of executor.registeredTools) {
    assert.equal(definition.parameters.type, 'object', definition.name)
    assert.equal(Array.isArray(definition.parameters.required), true, definition.name)
    assert.equal(typeof definition.parameters.properties, 'object', definition.name)
    for (const field of definition.parameters.required) assert.ok(definition.parameters.properties[field], definition.name + '.' + field)
  }
  assert.equal(compose('researcher').registeredTools.length, 0)
})

test('executor integration lets the host—not the model—complete a replay-proven goal', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-governor-e2e-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, '.project-cognition', 'goals'), { recursive: true })
  const state = createEmptyState()
  state.mission.purpose = 'Prove host-owned completion.'
  const sealedState = sealState(state)
  const registry = sealRegistry({
    schema: 'project-cognition/verifier-registry/v1', revision: 1, registry_hash: null,
    entries: [{ id: 'tests.core', invocations: [{ tool_name: 'pwsh', arguments: { command: 'npm test' }, arguments_hash: argumentsHash({ command: 'npm test' }) }], result_policy: { kind: 'json_field_equals', path: 'exit_code', equals: 0 } }],
  })
  const contract = approveContract({
    schema: 'project-cognition/goal/v1', goal_id: 'G-E2E', revision: 1, status: 'draft', contract_hash: null,
    verifier_registry_hash: registry.registry_hash, mode: 'simple',
    intent: { problem: 'completion authority', value: 'host proof' }, baseline: { repo_revision: 'abc', cognition_hash: sealedState.state_hash, known_failures: [] },
    target_state: 'tests pass', criteria: [{ id: 'C1', priority: 'must', expected: 'tests pass', verifier_id: 'tests.core', authority: 'tool', evidence_required: ['tool result'] }],
    boundaries: { in_scope: ['tests'], out_of_scope: [], do_not_touch: [] }, invariant_refs: [],
    limits: { max_attempts: 2, max_no_progress_attempts: 2, max_time_sec: null, max_tokens: null }, human_gates: [], approval: null,
  }, 'owner', '2026-08-24T00:00:00.000Z')
  fs.writeFileSync(path.join(root, '.project-cognition', 'state.json'), JSON.stringify(sealedState))
  fs.writeFileSync(path.join(root, '.project-cognition', 'verifiers.json'), JSON.stringify(registry))
  const contractRelative = '.project-cognition/goals/G-E2E.r1.json'
  fs.writeFileSync(path.join(root, contractRelative), JSON.stringify(contract))

  const call = (seq, callId, name, args) => ({ seq, type: 'tool/call', data: { callId, name, arguments: JSON.stringify(args) } })
  const session = { header: { cwd: root }, events: [
    { seq: 1, type: 'goal/change', data: { operation: 'create', goal: { id: 'runtime-1' } } },
    call(2, 'v1', 'pwsh', { command: 'npm test' }),
    { seq: 3, type: 'tool/result', data: { message: { callId: 'v1', content: [{ type: 'text', text: '{"exit_code":0}' }] } } },
    call(4, 'a1', 'begin_goal_attempt', { attempt_id: 'baseline', baseline: true, target_criteria: ['C1'], repo_revision: 'abc' }),
    call(5, 'o1', 'submit_goal_observation', { attempt_id: 'baseline', criterion_id: 'C1', verifier_id: 'tests.core', result: 'pass', evidence_refs: ['v1'], repo_revision: 'abc' }),
    call(6, 'c1', 'complete_goal_attempt', { attempt_id: 'baseline' }),
    call(7, 'd1', 'request_goal_decision', {}),
  ] }
  const runtimeGoal = { id: 'runtime-1', revision: 1, phase: 'active', objective: makeGoalPointer(contractRelative, contract.contract_hash) }
  const tools = []
  let completed = false
  const ctx = {
    tools: { register: (definition) => tools.push(definition), guard: () => {} },
    goals: {
      get: () => runtimeGoal,
      complete: (_agent, ref) => { assert.deepEqual(ref, { id: 'runtime-1', revision: 1 }); completed = true; runtimeGoal.phase = 'complete' },
      pause: () => { throw new Error('unexpected pause') },
      block: () => { throw new Error('unexpected block') },
    },
    systemPrompt: { section: () => {} },
    inject: (_dependencies, callback) => callback({ commands: { register: () => {} } }),
  }
  plugin.apply(ctx, { role: 'executor' })
  let concluded = false
  const output = JSON.parse(await tools.find((definition) => definition.name === 'request_goal_decision').execute({}, { agent: { session }, concludeTurn: () => { concluded = true } }))
  assert.equal(output.decision, 'ALREADY_SATISFIED')
  assert.equal(completed, true)
  assert.equal(concluded, true)

})

test('governor fails closed and pauses an active runtime goal on integrity failure', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-governor-integrity-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const runtimeGoal = {
    id: 'runtime-integrity', revision: 3, phase: 'active',
    objective: makeGoalPointer('.project-cognition/goals/missing.json', '0'.repeat(64)),
  }
  const tools = []
  let pausedRef = null
  const ctx = {
    tools: { register: (definition) => tools.push(definition), guard: () => {} },
    goals: {
      get: () => runtimeGoal,
      pause: (_agent, ref) => { pausedRef = ref; runtimeGoal.phase = 'paused' },
    },
    systemPrompt: { section: () => {} },
    inject: (_dependencies, callback) => callback({ commands: { register: () => {} } }),
  }
  plugin.apply(ctx, { role: 'executor' })
  let concluded = false
  const output = JSON.parse(await tools.find((definition) => definition.name === 'request_goal_decision').execute({}, {
    agent: { session: { header: { cwd: root }, events: [] } },
    concludeTurn: () => { concluded = true },
  }))
  assert.equal(output.decision, 'NEEDS_HUMAN')
  assert.match(output.reason, /missing|ENOENT/i)
  assert.deepEqual(pausedRef, { id: 'runtime-integrity', revision: 3 })
  assert.equal(concluded, true)
})
