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

test('governor contract paths are confined to the project goal directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-governor-'))
  fs.mkdirSync(path.join(root, '.project-cognition', 'goals'), { recursive: true })
  const valid = plugin.__test.confinedFile(root, '.project-cognition/goals/G1.json', '.project-cognition/goals')
  assert.equal(valid, path.join(root, '.project-cognition', 'goals', 'G1.json'))
  assert.throws(() => plugin.__test.confinedFile(root, '../outside.json', '.project-cognition/goals'), /escapes/)
  assert.throws(() => plugin.__test.confinedFile(root, '.project-cognition/state.json', '.project-cognition/goals'), /escapes/)
})

test('guarded Researcher Mode is fail-closed to an explicit tool allowlist', () => {
  assert.equal(plugin.__test.RESEARCH_ALLOWLIST.has('read'), true)
  assert.equal(plugin.__test.RESEARCH_ALLOWLIST.has('write'), false)
  assert.equal(plugin.__test.RESEARCH_ALLOWLIST.has('pwsh'), false)
  assert.equal(plugin.__test.RESEARCH_ALLOWLIST.has('subagent'), false)
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
    call(1, 'v1', 'pwsh', { command: 'npm test' }),
    { seq: 2, type: 'tool/result', data: { message: { callId: 'v1', content: [{ type: 'text', text: '{"exit_code":0}' }] } } },
    call(3, 'a1', 'begin_goal_attempt', { attempt_id: 'baseline', baseline: true, target_criteria: ['C1'], repo_revision: 'abc' }),
    call(4, 'o1', 'submit_goal_observation', { attempt_id: 'baseline', criterion_id: 'C1', verifier_id: 'tests.core', result: 'pass', evidence_refs: ['v1'], repo_revision: 'abc' }),
    call(5, 'c1', 'complete_goal_attempt', { attempt_id: 'baseline' }),
    call(6, 'd1', 'request_goal_decision', {}),
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
