const test = require('node:test')
const assert = require('node:assert')
const { approveContract } = require('../lib/goal-core/index.js')
const { sealRegistry, argumentsHash } = require('../lib/verifier-core/index.js')
const { makeGoalPointer, parseGoalPointer, researchModeState, scopeGoalEvents, usageTokens, foldDshGoalEvents } = require('../lib/dsh-adapter/index.js')

const fixture = (humanGates = [], overrides = {}) => {
  const registry = sealRegistry({
    schema: 'project-cognition/verifier-registry/v1', revision: 1, registry_hash: null,
    entries: [{ id: 'tests.core', invocations: [{ tool_name: 'pwsh', arguments: { command: 'npm test' }, arguments_hash: argumentsHash({ command: 'npm test' }) }], result_policy: { kind: 'json_field_equals', path: 'exit_code', equals: 0 } }],
  })
  const goal = approveContract({
    schema: 'project-cognition/goal/v1', goal_id: 'G-DSH', revision: 1, status: 'draft', contract_hash: null,
    verifier_registry_hash: registry.registry_hash, mode: humanGates.length ? 'governed' : 'simple',
    intent: { problem: 'Unbounded agent loop', value: 'Evidence-bound stopping' },
    baseline: { repo_revision: 'abc', cognition_hash: 'a'.repeat(64), known_failures: [] },
    target_state: 'Goal is objectively complete.',
    criteria: [{ id: 'C1', priority: 'must', expected: 'tests pass', verifier_id: 'tests.core', authority: 'tool', evidence_required: ['trusted test result'] }],
    boundaries: { in_scope: ['lib'], out_of_scope: [], do_not_touch: ['I1'] }, invariant_refs: ['I1'],
    limits: { max_attempts: 2, max_no_progress_attempts: 2, max_time_sec: null, max_tokens: null },
    human_gates: humanGates, approval: null,
    ...overrides,
  }, 'owner', '2026-08-24T00:00:00.000Z')
  return { goal, registry }
}

const call = (seq, callId, name, args) => ({ seq, type: 'tool/call', data: { callId, name, arguments: JSON.stringify(args) } })
const result = (seq, callId, value, error) => ({ seq, type: 'tool/result', data: { message: { callId, content: [{ type: 'text', text: JSON.stringify(value) }] }, ...(error ? { error } : {}) } })

const passingBaseline = () => [
  call(1, 'verify-1', 'pwsh', { command: 'npm test' }),
  result(2, 'verify-1', { exit_code: 0 }),
  call(3, 'begin-1', 'begin_goal_attempt', { attempt_id: 'baseline', baseline: true, target_criteria: ['C1'], repo_revision: 'abc' }),
  call(4, 'observe-1', 'submit_goal_observation', { attempt_id: 'baseline', criterion_id: 'C1', verifier_id: 'tests.core', result: 'pass', evidence_refs: ['tool:verify-1'], repo_revision: 'abc' }),
  call(5, 'complete-1', 'complete_goal_attempt', { attempt_id: 'baseline' }),
  call(6, 'decision-1', 'request_goal_decision', {}),
]

test('DSH pointer binds an immutable contract path and hash', () => {
  const { goal } = fixture()
  const pointer = makeGoalPointer('.project-cognition/goals/G-DSH.r1.json', goal.contract_hash)
  assert.deepEqual(parseGoalPointer(pointer), { relative_path: '.project-cognition/goals/G-DSH.r1.json', contract_hash: goal.contract_hash })
  assert.throws(() => parseGoalPointer('ordinary goal'), /not bound/)
})

test('DSH replay accepts real frozen verifier evidence and records one terminal decision', () => {
  const { goal, registry } = fixture()
  const replay = foldDshGoalEvents(goal, registry, [...passingBaseline(), call(7, 'decision-2', 'request_goal_decision', {})])
  assert.equal(replay.decision.decision, 'ALREADY_SATISFIED')
  assert.equal(replay.events.filter((event) => event.type === 'goal_decision').length, 1)
  assert.deepEqual(replay.diagnostics, [])
})

test('fabricated or verifier-drifted evidence poisons the run instead of passing', () => {
  const { goal, registry } = fixture()
  const events = passingBaseline()
  events[3] = call(4, 'observe-1', 'submit_goal_observation', { attempt_id: 'baseline', criterion_id: 'C1', verifier_id: 'tests.core', result: 'pass', evidence_refs: ['missing-call'], repo_revision: 'abc' })
  const replay = foldDshGoalEvents(goal, registry, events)
  assert.equal(replay.decision.decision, 'NEEDS_HUMAN')
  assert.ok(replay.events.some((event) => event.type === 'guard_violation'))
  assert.ok(replay.diagnostics.some((item) => /trusted evidence/.test(item.detail)))
})

test('human gate authority comes only from the slash-command event', () => {
  const { goal, registry } = fixture([{ id: 'H1', description: 'Owner approves architecture' }])
  const before = foldDshGoalEvents(goal, registry, passingBaseline())
  assert.equal(before.decision.decision, 'NEEDS_HUMAN')
  const approved = foldDshGoalEvents(goal, registry, [
    ...passingBaseline().slice(0, -1),
    { seq: 6, type: 'command/run', data: { name: 'researcher', args: 'approve-gate H1 review-42' } },
    call(7, 'decision-1', 'request_goal_decision', {}),
  ])
  assert.equal(approved.decision.decision, 'ALREADY_SATISFIED')
})

test('one-shot research lasts one turn while Researcher Mode persists until off', () => {
  assert.equal(researchModeState([{ seq: 1, type: 'command/run', data: { name: 'researcher', args: 'inspect architecture' } }]).active, true)
  assert.equal(researchModeState([{ seq: 1, type: 'command/run', data: { name: 'researcher', args: 'inspect architecture' } }, { seq: 2, type: 'turn/end', data: {} }]).active, false)
  assert.deepEqual(researchModeState([{ seq: 1, type: 'command/run', data: { name: 'researcher', args: 'on' } }, { seq: 2, type: 'turn/end', data: {} }]), { active: true, persistent: true, started_at: 1 })
  assert.equal(researchModeState([{ seq: 1, type: 'command/run', data: { name: 'researcher', args: 'on' } }, { seq: 2, type: 'command/run', data: { name: 'researcher', args: 'off' } }]).active, false)
})

test('replay is scoped after the current DSH goal creation, excluding an older contract run', () => {
  const events = [
    call(1, 'old', 'begin_goal_attempt', { attempt_id: 'old-baseline', baseline: true, target_criteria: ['OLD'], repo_revision: 'old' }),
    { seq: 2, type: 'goal/change', data: { operation: 'create', goal: { id: 'current' } } },
    call(3, 'new', 'begin_goal_attempt', { attempt_id: 'baseline', baseline: true, target_criteria: ['C1'], repo_revision: 'new' }),
  ]
  assert.deepEqual(scopeGoalEvents(events, { id: 'current' }).map((event) => event.seq), [2, 3])
})

test('host-derived DSH usage enforces token budgets', () => {
  const { goal, registry } = fixture([], { limits: { max_attempts: 2, max_no_progress_attempts: 2, max_time_sec: null, max_tokens: 10 } })
  const events = [
    { seq: 1, time: 1000, type: 'assistant/message', data: { usage: { inputTokens: 8, outputTokens: 4 }, message: {} } },
    call(2, 'begin-1', 'begin_goal_attempt', { attempt_id: 'baseline', baseline: true, target_criteria: ['C1'], repo_revision: 'abc' }),
    call(3, 'complete-1', 'complete_goal_attempt', { attempt_id: 'baseline' }),
    call(4, 'decision-1', 'request_goal_decision', {}),
  ]
  events[1].time = 1100
  events[2].time = 1200
  events[3].time = 1300
  const replay = foldDshGoalEvents(goal, registry, events)
  assert.equal(usageTokens(events[0].data.usage), 12)
  assert.equal(replay.decision.decision, 'STOPPED')
  assert.match(replay.decision.reason, /token budget/)
})
