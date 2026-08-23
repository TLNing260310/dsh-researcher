const test = require('node:test')
const assert = require('node:assert')
const {
  approveContract,
  validateGoalContract,
  recommendMode,
  renderGoalContractMarkdown,
  decideGoal,
  validateAdapterManifest,
  EVENT_SCHEMA,
  OBSERVATION_SCHEMA,
} = require('../lib/goal-core/index.js')

const draftGoal = (overrides = {}) => ({
  schema: 'project-cognition/goal/v1',
  goal_id: 'G-1',
  revision: 1,
  status: 'draft',
  contract_hash: null,
  verifier_registry_hash: 'b'.repeat(64),
  mode: 'simple',
  intent: { problem: 'The loop does not know when to stop.', value: 'Stop after objective evidence proves completion.' },
  baseline: { repo_revision: 'abc123', cognition_hash: 'a'.repeat(64), known_failures: ['legacy-test'] },
  target_state: 'The governor makes deterministic completion decisions.',
  criteria: [
    { id: 'C1', priority: 'must', expected: 'core tests pass', verifier_id: 'tests.core', authority: 'tool', evidence_required: ['test output'] },
    { id: 'C2', priority: 'should', expected: 'documentation is concise', verifier_id: 'human.review', authority: 'human', evidence_required: ['review'] },
  ],
  boundaries: { in_scope: ['lib/goal-core'], out_of_scope: ['other clients'], do_not_touch: ['researcher read-only invariant'] },
  invariant_refs: ['I1'],
  limits: { max_attempts: 2, max_no_progress_attempts: 2, max_time_sec: null, max_tokens: null },
  human_gates: [],
  approval: null,
  ...overrides,
})

const approvedGoal = (overrides = {}) => approveContract(draftGoal(overrides), 'owner', '2026-08-24T00:00:00.000Z')

const eventFactory = (goal) => {
  let sequence = 0
  const event = (type, data = {}) => ({
    schema: EVENT_SCHEMA, sequence: ++sequence, goal_id: goal.goal_id, contract_hash: goal.contract_hash,
    type, at: '2026-08-24T00:00:00.000Z', data,
  })
  const observation = (attemptId, criterionId, result, verifierId) => event('observation_recorded', { observation: {
    schema: OBSERVATION_SCHEMA, goal_id: goal.goal_id, contract_hash: goal.contract_hash,
    attempt_id: attemptId, criterion_id: criterionId, verifier_id: verifierId || goal.criteria.find((item) => item.id === criterionId).verifier_id,
    result, evidence_refs: ['test-output'], repo_revision: 'def456', observed_at: '2026-08-24T00:00:00.000Z',
  } })
  const attempt = (id, baseline, results) => {
    const events = [event('attempt_started', { attempt_id: id, baseline, target_criteria: Object.keys(results), repo_revision: 'def456' })]
    for (const [criterionId, result] of Object.entries(results)) events.push(observation(id, criterionId, result))
    events.push(event('attempt_completed', { attempt_id: id }))
    return events
  }
  return { event, observation, attempt }
}

test('approved contracts are hash-bound and immutable revisions detect tampering', () => {
  const goal = approvedGoal()
  validateGoalContract(goal, { allowDraft: false })
  goal.target_state = 'silently changed'
  assert.throws(() => validateGoalContract(goal, { allowDraft: false }), /does not match canonical contract/)
})

test('mode recommendation is simple only when every low-risk condition holds', () => {
  const lowRisk = {
    target_clear: true, deterministic_verifiers: true, localized_change: true,
    touches_public_api: false, touches_data_migration: false, touches_security: false,
    touches_architecture: false, touches_hard_invariant: false, subjective_acceptance: false,
    expected_attempts: 2,
  }
  assert.deepEqual(recommendMode(lowRisk), { mode: 'simple', reasons: [] })
  const highRisk = { ...lowRisk, touches_architecture: true }
  assert.equal(recommendMode(highRisk).mode, 'governed')
  assert.ok(recommendMode(highRisk).reasons.includes('architecture boundary'))
})

test('Goal Contract has a deterministic human-readable definition-of-done card', () => {
  const goal = approvedGoal()
  const first = renderGoalContractMarkdown(goal)
  assert.equal(first, renderGoalContractMarkdown(goal))
  assert.match(first, /Definition of done/)
  assert.match(first, /C1 \| must \| tool/)
  assert.match(first, /Change attempts: 2/)
  assert.match(first, new RegExp(goal.contract_hash))
})

test('baseline evidence can prove ALREADY_SATISFIED without a change attempt', () => {
  const goal = approvedGoal()
  const f = eventFactory(goal)
  const events = f.attempt('baseline', true, { C1: 'pass' })
  assert.equal(decideGoal(goal, events).decision, 'ALREADY_SATISFIED')
})

test('should failures never keep a satisfied goal alive', () => {
  const goal = approvedGoal()
  const f = eventFactory(goal)
  const events = [
    ...f.attempt('baseline', true, { C1: 'fail', C2: 'fail' }),
    ...f.attempt('attempt-1', false, { C1: 'pass', C2: 'fail' }),
  ]
  assert.equal(decideGoal(goal, events).decision, 'DONE')
})

test('a later change attempt must re-prove every MUST criterion in the same attempt', () => {
  const goal = approvedGoal()
  const f = eventFactory(goal)
  const events = [
    ...f.attempt('baseline', true, { C1: 'pass' }),
    ...f.attempt('attempt-1', false, { C2: 'pass' }),
  ]
  const decision = decideGoal(goal, events)
  assert.equal(decision.decision, 'CONTINUE')
  assert.deepEqual(decision.failed_must, ['C1'])
})

test('an open attempt can never inherit a prior terminal result', () => {
  const goal = approvedGoal()
  const f = eventFactory(goal)
  const events = [
    ...f.attempt('baseline', true, { C1: 'pass' }),
    f.event('attempt_started', { attempt_id: 'open-change', baseline: false, target_criteria: ['C1'], repo_revision: 'next' }),
  ]
  assert.equal(decideGoal(goal, events).decision, 'CONTINUE')
})

test('human gates, guard violations, blockers and verifier drift fail closed', () => {
  const goal = approvedGoal({ human_gates: [{ id: 'H1', description: 'Owner accepts the architecture.' }] })
  const f = eventFactory(goal)
  const pass = f.attempt('baseline', true, { C1: 'pass' })
  assert.equal(decideGoal(goal, pass).decision, 'NEEDS_HUMAN')

  const guard = [...pass, f.event('guard_violation', { kind: 'invariant', detail: 'I1 changed', ref: 'I1' })]
  assert.equal(decideGoal(goal, guard).decision, 'NEEDS_HUMAN')

  const goal2 = approvedGoal()
  const f2 = eventFactory(goal2)
  const blocked = [...f2.attempt('baseline', true, { C1: 'fail' }), f2.event('blocker_reported', { code: 'permission', detail: 'Owner access required', external: true })]
  assert.equal(decideGoal(goal2, blocked).decision, 'BLOCKED')

  const f3 = eventFactory(goal2)
  const started = f3.event('attempt_started', { attempt_id: 'a', baseline: true, target_criteria: ['C1'], repo_revision: 'x' })
  const drifted = f3.observation('a', 'C1', 'pass', 'tests.replaced')
  assert.throws(() => decideGoal(goal2, [started, drifted]), /frozen verifier/)
})

test('two consecutive attempts without must-criterion progress stop the loop', () => {
  const goal = approvedGoal()
  const f = eventFactory(goal)
  const events = [
    ...f.attempt('baseline', true, { C1: 'fail' }),
    ...f.attempt('attempt-1', false, { C1: 'fail' }),
    ...f.attempt('attempt-2', false, { C1: 'fail' }),
  ]
  const decision = decideGoal(goal, events)
  assert.equal(decision.decision, 'STOPPED')
  assert.match(decision.reason, /no measurable/)
})

test('terminal decisions reject later attempts', () => {
  const goal = approvedGoal()
  const f = eventFactory(goal)
  const events = [
    ...f.attempt('baseline', true, { C1: 'pass' }),
    f.event('goal_decision', { decision: 'ALREADY_SATISFIED', reason: 'baseline passes' }),
    f.event('attempt_started', { attempt_id: 'late', baseline: false, target_criteria: ['C1'], repo_revision: 'x' }),
  ]
  assert.throws(() => decideGoal(goal, events), /terminal goal/)
})

test('terminal decisions cannot be replaced and attempts require one leading baseline', () => {
  const goal = approvedGoal()
  const f = eventFactory(goal)
  const terminal = [
    ...f.attempt('baseline', true, { C1: 'pass' }),
    f.event('goal_decision', { decision: 'DONE', reason: 'first decision' }),
    f.event('goal_decision', { decision: 'BLOCKED', reason: 'replacement' }),
  ]
  assert.throws(() => decideGoal(goal, terminal), /replace a terminal goal/)

  const f2 = eventFactory(goal)
  assert.throws(() => decideGoal(goal, [
    f2.event('attempt_started', { attempt_id: 'change-first', baseline: false, target_criteria: ['C1'], repo_revision: 'x' }),
  ]), /first attempt must establish the baseline/)
})

test('mode limits are hard contract constraints', () => {
  assert.throws(() => validateGoalContract(draftGoal({ limits: { max_attempts: 3, max_no_progress_attempts: 2, max_time_sec: null, max_tokens: null } })), /simple mode permits at most 2/)
  assert.throws(() => validateGoalContract(draftGoal({ mode: 'governed', limits: { max_attempts: 6, max_no_progress_attempts: 2, max_time_sec: null, max_tokens: null } })), /governed mode permits at most 5/)
  assert.throws(() => validateGoalContract(draftGoal({ criteria: [{ id: 'C1', priority: 'must', expected: 'owner likes it', verifier_id: 'human.review', authority: 'human', evidence_required: ['review'] }] })), /subjective completion belongs in human_gates/)
})

test('adapter conformance requires every hard-governed capability', () => {
  const complete = {
    schema: 'project-cognition/adapter-capabilities/v1', client: 'dsh', version: '1',
    capabilities: { human_approval: true, hard_stop: true, event_store: true, trusted_verifier: true, project_root_confinement: true },
  }
  assert.deepEqual(validateAdapterManifest(complete), { governed: true, missing: [] })
  complete.capabilities.hard_stop = false
  assert.deepEqual(validateAdapterManifest(complete), { governed: false, missing: ['hard_stop'] })
})
