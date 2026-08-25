const { hashCanonical } = require('../canonical-json.js')
const { allowedKeys, text, stringArray, enumValue, positiveInteger, finiteNumber, uniqueBy, isPlainObject, fail } = require('../validation.js')

const GOAL_SCHEMA = 'project-cognition/goal/v1'
const OBSERVATION_SCHEMA = 'project-cognition/observation/v1'
const EVENT_SCHEMA = 'project-cognition/goal-event/v1'
const DECISIONS = ['ALREADY_SATISFIED', 'CONTINUE', 'NEEDS_HUMAN', 'DONE', 'BLOCKED', 'STOPPED', 'CANCELLED']
const TERMINAL_DECISIONS = ['ALREADY_SATISFIED', 'DONE', 'BLOCKED', 'STOPPED', 'CANCELLED']

const validateIntent = (value) => {
  allowedKeys(value, ['problem', 'value'], 'goal.intent')
  text(value.problem, 'goal.intent.problem')
  text(value.value, 'goal.intent.value')
}

const validateBaseline = (value) => {
  allowedKeys(value, ['repo_revision', 'cognition_hash', 'known_failures'], 'goal.baseline')
  text(value.repo_revision, 'goal.baseline.repo_revision', { max: 500 })
  text(value.cognition_hash, 'goal.baseline.cognition_hash', { max: 64 })
  if (!/^[a-f0-9]{64}$/.test(value.cognition_hash)) fail('goal.baseline.cognition_hash', 'must be a lowercase SHA-256 hex digest')
  stringArray(value.known_failures, 'goal.baseline.known_failures', { maxItems: 1000, maxLength: 2000 })
}

const validateCriterion = (value, index) => {
  const label = 'goal.criteria[' + index + ']'
  allowedKeys(value, ['id', 'priority', 'expected', 'verifier_id', 'authority', 'evidence_required'], label)
  text(value.id, label + '.id', { max: 200 })
  enumValue(value.priority, ['must', 'should'], label + '.priority')
  text(value.expected, label + '.expected')
  text(value.verifier_id, label + '.verifier_id', { max: 128 })
  if (!/^[a-z][a-z0-9_.-]*$/.test(value.verifier_id)) fail(label + '.verifier_id', 'must be a registry id, not a command')
  enumValue(value.authority, ['tool', 'human'], label + '.authority')
  if (value.priority === 'must' && value.authority !== 'tool') fail(label + '.authority', 'MUST criteria require tool authority; subjective completion belongs in human_gates')
  stringArray(value.evidence_required, label + '.evidence_required', { maxItems: 100, maxLength: 2000 })
}

const validateBoundaries = (value) => {
  allowedKeys(value, ['in_scope', 'out_of_scope', 'do_not_touch'], 'goal.boundaries')
  stringArray(value.in_scope, 'goal.boundaries.in_scope')
  stringArray(value.out_of_scope, 'goal.boundaries.out_of_scope')
  stringArray(value.do_not_touch, 'goal.boundaries.do_not_touch')
}

const validateLimits = (value) => {
  allowedKeys(value, ['max_attempts', 'max_no_progress_attempts', 'max_time_sec', 'max_tokens'], 'goal.limits')
  positiveInteger(value.max_attempts, 'goal.limits.max_attempts')
  positiveInteger(value.max_no_progress_attempts, 'goal.limits.max_no_progress_attempts')
  if (value.max_time_sec !== undefined && value.max_time_sec !== null) positiveInteger(value.max_time_sec, 'goal.limits.max_time_sec')
  if (value.max_tokens !== undefined && value.max_tokens !== null) positiveInteger(value.max_tokens, 'goal.limits.max_tokens')
}

const validateHumanGate = (value, index) => {
  const label = 'goal.human_gates[' + index + ']'
  allowedKeys(value, ['id', 'description'], label)
  text(value.id, label + '.id', { max: 200 })
  text(value.description, label + '.description')
}

const normativeContract = (contract) => {
  const copy = JSON.parse(JSON.stringify(contract))
  delete copy.status
  delete copy.contract_hash
  delete copy.approval
  return copy
}

const contractHash = (contract) => hashCanonical(normativeContract(contract))

const validateGoalContract = (goal, options = {}) => {
  allowedKeys(goal, ['schema', 'goal_id', 'revision', 'status', 'contract_hash', 'verifier_registry_hash', 'mode', 'intent', 'baseline', 'target_state', 'criteria', 'boundaries', 'invariant_refs', 'limits', 'human_gates', 'approval'], 'goal')
  if (goal.schema !== GOAL_SCHEMA) fail('goal.schema', 'must equal ' + GOAL_SCHEMA)
  text(goal.goal_id, 'goal.goal_id', { max: 200 })
  positiveInteger(goal.revision, 'goal.revision')
  enumValue(goal.status, ['draft', 'approved', 'superseded'], 'goal.status')
  if (options.allowDraft === false && goal.status !== 'approved') fail('goal.status', 'only approved contracts are executable')
  enumValue(goal.mode, ['simple', 'governed'], 'goal.mode')
  text(goal.verifier_registry_hash, 'goal.verifier_registry_hash', { max: 64 })
  if (!/^[a-f0-9]{64}$/.test(goal.verifier_registry_hash)) fail('goal.verifier_registry_hash', 'must be a lowercase SHA-256 hex digest')
  validateIntent(goal.intent)
  validateBaseline(goal.baseline)
  text(goal.target_state, 'goal.target_state')
  if (!Array.isArray(goal.criteria) || goal.criteria.length === 0) fail('goal.criteria', 'must contain at least one criterion')
  goal.criteria.forEach(validateCriterion)
  uniqueBy(goal.criteria, 'id', 'goal.criteria')
  if (!goal.criteria.some((criterion) => criterion.priority === 'must')) fail('goal.criteria', 'must contain at least one must criterion')
  validateBoundaries(goal.boundaries)
  stringArray(goal.invariant_refs, 'goal.invariant_refs', { maxItems: 1000, maxLength: 200 })
  validateLimits(goal.limits)
  if (goal.mode === 'simple' && goal.limits.max_attempts > 2) fail('goal.limits.max_attempts', 'simple mode permits at most 2 change attempts')
  if (goal.mode === 'governed' && goal.limits.max_attempts > 5) fail('goal.limits.max_attempts', 'governed mode permits at most 5 change attempts')
  if (goal.limits.max_no_progress_attempts > 2) fail('goal.limits.max_no_progress_attempts', 'must be at most 2')
  if (!Array.isArray(goal.human_gates)) fail('goal.human_gates', 'must be an array')
  goal.human_gates.forEach(validateHumanGate)
  uniqueBy(goal.human_gates, 'id', 'goal.human_gates')

  if (goal.status === 'draft') {
    if (options.allowDraft === false) fail('goal.status', 'draft contracts are not executable')
    if (goal.contract_hash !== null && goal.contract_hash !== undefined) fail('goal.contract_hash', 'must be null for a draft')
    if (goal.approval !== null && goal.approval !== undefined) fail('goal.approval', 'must be null for a draft')
  } else {
    text(goal.contract_hash, 'goal.contract_hash', { max: 64 })
    if (!/^[a-f0-9]{64}$/.test(goal.contract_hash)) fail('goal.contract_hash', 'must be a lowercase SHA-256 hex digest')
    allowedKeys(goal.approval, ['actor', 'approved_at', 'approved_hash'], 'goal.approval')
    text(goal.approval.actor, 'goal.approval.actor', { max: 500 })
    text(goal.approval.approved_at, 'goal.approval.approved_at', { max: 100 })
    text(goal.approval.approved_hash, 'goal.approval.approved_hash', { max: 64 })
    if (goal.approval.approved_hash !== goal.contract_hash) fail('goal.approval.approved_hash', 'must equal contract_hash')
    if (options.verifyHash !== false && contractHash(goal) !== goal.contract_hash) fail('goal.contract_hash', 'does not match canonical contract content')
  }
  return goal
}

const approveContract = (draft, actor, approvedAt = new Date().toISOString()) => {
  validateGoalContract(draft)
  if (draft.status !== 'draft') fail('goal.status', 'only a draft can be approved')
  text(actor, 'approval.actor', { max: 500 })
  text(approvedAt, 'approval.approved_at', { max: 100 })
  const approved = JSON.parse(JSON.stringify(draft))
  const hash = contractHash(approved)
  approved.status = 'approved'
  approved.contract_hash = hash
  approved.approval = { actor, approved_at: approvedAt, approved_hash: hash }
  validateGoalContract(approved, { allowDraft: false })
  return approved
}

const prepareRevision = (previous, nextDraft) => {
  validateGoalContract(previous, { allowDraft: false })
  validateGoalContract(nextDraft)
  if (nextDraft.status !== 'draft') fail('nextDraft.status', 'a revision must begin as draft')
  if (nextDraft.goal_id !== previous.goal_id) fail('nextDraft.goal_id', 'must match the previous goal')
  if (nextDraft.revision !== previous.revision + 1) fail('nextDraft.revision', 'must increment by exactly one')
  return JSON.parse(JSON.stringify(nextDraft))
}

const recommendMode = (risk) => {
  if (!isPlainObject(risk)) fail('risk', 'must be an object')
  const keys = ['target_clear', 'deterministic_verifiers', 'localized_change', 'touches_public_api', 'touches_data_migration', 'touches_security', 'touches_architecture', 'touches_hard_invariant', 'subjective_acceptance', 'expected_attempts']
  allowedKeys(risk, keys, 'risk')
  for (const key of keys.slice(0, 9)) if (typeof risk[key] !== 'boolean') fail('risk.' + key, 'must be a boolean')
  positiveInteger(risk.expected_attempts, 'risk.expected_attempts')
  const governedReasons = []
  if (!risk.target_clear) governedReasons.push('target is ambiguous')
  if (!risk.deterministic_verifiers) governedReasons.push('verification is not fully deterministic')
  if (!risk.localized_change) governedReasons.push('change is not localized')
  if (risk.touches_public_api) governedReasons.push('public API')
  if (risk.touches_data_migration) governedReasons.push('data migration')
  if (risk.touches_security) governedReasons.push('security boundary')
  if (risk.touches_architecture) governedReasons.push('architecture boundary')
  if (risk.touches_hard_invariant) governedReasons.push('hard invariant')
  if (risk.subjective_acceptance) governedReasons.push('subjective acceptance')
  if (risk.expected_attempts > 2) governedReasons.push('more than two expected attempts')
  return { mode: governedReasons.length === 0 ? 'simple' : 'governed', reasons: governedReasons }
}

const renderGoalContractMarkdown = (goal) => {
  validateGoalContract(goal)
  const lines = [
    '# Goal Contract — ' + goal.goal_id + ' r' + goal.revision,
    '',
    '- Status: `' + goal.status + '`',
    '- Mode: `' + goal.mode + '`',
    '- Contract hash: `' + (goal.contract_hash || 'draft — not executable') + '`',
    '- Verifier registry: `' + goal.verifier_registry_hash + '`',
    '',
    '## Why', '',
    '- Problem: ' + goal.intent.problem,
    '- Value: ' + goal.intent.value,
    '',
    '## Target state', '', goal.target_state,
    '',
    '## Definition of done', '',
    '| ID | Priority | Authority | Expected | Frozen verifier |',
    '| --- | --- | --- | --- | --- |',
  ]
  for (const criterion of goal.criteria) lines.push('| ' + [criterion.id, criterion.priority, criterion.authority, criterion.expected, criterion.verifier_id].map((value) => String(value).replace(/\|/g, '\\|')).join(' | ') + ' |')
  lines.push('', '## Boundaries', '', '- In scope: ' + (goal.boundaries.in_scope.join('; ') || 'none'), '- Out of scope: ' + (goal.boundaries.out_of_scope.join('; ') || 'none'), '- Do not touch: ' + (goal.boundaries.do_not_touch.join('; ') || 'none'), '- Invariant refs: ' + (goal.invariant_refs.join('; ') || 'none'), '', '## Stop budget', '', '- Change attempts: ' + goal.limits.max_attempts, '- Consecutive no-progress attempts: ' + goal.limits.max_no_progress_attempts, '- Time: ' + (goal.limits.max_time_sec === null ? 'unbounded' : goal.limits.max_time_sec + ' sec'), '- Tokens: ' + (goal.limits.max_tokens === null ? 'unbounded' : goal.limits.max_tokens), '', '## Human gates', '')
  if (goal.human_gates.length === 0) lines.push('_None._')
  else for (const gate of goal.human_gates) lines.push('- **' + gate.id + '** — ' + gate.description)
  lines.push('', '## Approval', '', goal.approval ? '- Approved by ' + goal.approval.actor + ' at ' + goal.approval.approved_at : '_Draft: human approval is still required._', '')
  return lines.join('\n')
}

const validateObservation = (value, label = 'observation') => {
  allowedKeys(value, ['schema', 'goal_id', 'contract_hash', 'attempt_id', 'criterion_id', 'verifier_id', 'result', 'evidence_refs', 'repo_revision', 'observed_at'], label)
  if (value.schema !== OBSERVATION_SCHEMA) fail(label + '.schema', 'must equal ' + OBSERVATION_SCHEMA)
  for (const key of ['goal_id', 'attempt_id', 'criterion_id', 'verifier_id', 'repo_revision', 'observed_at']) text(value[key], label + '.' + key, { max: key === 'observed_at' ? 100 : 500 })
  text(value.contract_hash, label + '.contract_hash', { max: 64 })
  if (!/^[a-f0-9]{64}$/.test(value.contract_hash)) fail(label + '.contract_hash', 'must be a lowercase SHA-256 hex digest')
  enumValue(value.result, ['pass', 'fail', 'unknown'], label + '.result')
  stringArray(value.evidence_refs, label + '.evidence_refs', { maxItems: 1000, maxLength: 2000 })
  return value
}

const EVENT_TYPES = ['goal_started', 'attempt_started', 'observation_recorded', 'attempt_completed', 'human_gate_recorded', 'guard_violation', 'blocker_reported', 'usage_recorded', 'goal_cancelled', 'goal_superseded', 'goal_decision']

const validateEventData = (event, label) => {
  const data = event.data
  if (!isPlainObject(data)) fail(label + '.data', 'must be an object')
  if (event.type === 'goal_started') allowedKeys(data, ['repo_revision'], label + '.data')
  if (event.type === 'goal_started') text(data.repo_revision, label + '.data.repo_revision', { max: 500 })
  if (event.type === 'attempt_started') {
    allowedKeys(data, ['attempt_id', 'baseline', 'target_criteria', 'repo_revision'], label + '.data')
    text(data.attempt_id, label + '.data.attempt_id', { max: 200 })
    if (typeof data.baseline !== 'boolean') fail(label + '.data.baseline', 'must be a boolean')
    stringArray(data.target_criteria, label + '.data.target_criteria', { maxItems: 1000, maxLength: 200 })
    text(data.repo_revision, label + '.data.repo_revision', { max: 500 })
  }
  if (event.type === 'observation_recorded') {
    allowedKeys(data, ['observation'], label + '.data')
    validateObservation(data.observation, label + '.data.observation')
  }
  if (event.type === 'attempt_completed') {
    allowedKeys(data, ['attempt_id'], label + '.data')
    text(data.attempt_id, label + '.data.attempt_id', { max: 200 })
  }
  if (event.type === 'human_gate_recorded') {
    allowedKeys(data, ['gate_id', 'result', 'actor', 'evidence_refs'], label + '.data')
    text(data.gate_id, label + '.data.gate_id', { max: 200 })
    enumValue(data.result, ['approved', 'rejected'], label + '.data.result')
    text(data.actor, label + '.data.actor', { max: 500 })
    stringArray(data.evidence_refs, label + '.data.evidence_refs', { maxItems: 100, maxLength: 2000 })
  }
  if (event.type === 'guard_violation') {
    allowedKeys(data, ['kind', 'detail', 'ref'], label + '.data')
    enumValue(data.kind, ['scope', 'invariant', 'verifier', 'contract'], label + '.data.kind')
    text(data.detail, label + '.data.detail')
    if (data.ref !== undefined) text(data.ref, label + '.data.ref', { max: 500 })
  }
  if (event.type === 'blocker_reported') {
    allowedKeys(data, ['code', 'detail', 'external'], label + '.data')
    text(data.code, label + '.data.code', { max: 200 })
    text(data.detail, label + '.data.detail')
    if (typeof data.external !== 'boolean') fail(label + '.data.external', 'must be a boolean')
  }
  if (event.type === 'usage_recorded') {
    allowedKeys(data, ['elapsed_sec', 'tokens'], label + '.data')
    finiteNumber(data.elapsed_sec, label + '.data.elapsed_sec', { minimum: 0 })
    positiveInteger(data.tokens, label + '.data.tokens', { minimum: 0 })
  }
  if (event.type === 'goal_cancelled' || event.type === 'goal_superseded') allowedKeys(data, [], label + '.data')
  if (event.type === 'goal_decision') {
    allowedKeys(data, ['decision', 'reason'], label + '.data')
    enumValue(data.decision, DECISIONS, label + '.data.decision')
    text(data.reason, label + '.data.reason')
  }
}

const validateGoalEvent = (event, label = 'event') => {
  allowedKeys(event, ['schema', 'sequence', 'goal_id', 'contract_hash', 'type', 'at', 'data'], label)
  if (event.schema !== EVENT_SCHEMA) fail(label + '.schema', 'must equal ' + EVENT_SCHEMA)
  positiveInteger(event.sequence, label + '.sequence')
  text(event.goal_id, label + '.goal_id', { max: 200 })
  text(event.contract_hash, label + '.contract_hash', { max: 64 })
  if (!/^[a-f0-9]{64}$/.test(event.contract_hash)) fail(label + '.contract_hash', 'must be a lowercase SHA-256 hex digest')
  enumValue(event.type, EVENT_TYPES, label + '.type')
  text(event.at, label + '.at', { max: 100 })
  validateEventData(event, label)
  return event
}

const foldGoalEvents = (contract, events) => {
  validateGoalContract(contract, { allowDraft: false })
  if (!Array.isArray(events)) fail('events', 'must be an array')
  const criteriaById = new Map(contract.criteria.map((criterion) => [criterion.id, criterion]))
  const gatesById = new Map(contract.human_gates.map((gate) => [gate.id, gate]))
  const state = {
    attempts: [],
    current_attempt: null,
    criterion_results: new Map(),
    human_gates: new Map(),
    guard_violations: [],
    blocker: null,
    cancelled: false,
    superseded: false,
    terminal_decision: null,
    usage: { elapsed_sec: 0, tokens: 0 },
  }
  let previousSequence = 0
  for (let index = 0; index < events.length; index++) {
    const event = validateGoalEvent(events[index], 'events[' + index + ']')
    if (event.sequence <= previousSequence) fail('events[' + index + '].sequence', 'must be strictly increasing')
    previousSequence = event.sequence
    if (event.goal_id !== contract.goal_id || event.contract_hash !== contract.contract_hash) fail('events[' + index + ']', 'does not belong to this contract')
    if (state.terminal_decision) fail('events[' + index + ']', 'cannot mutate or replace a terminal goal')

    if (event.type === 'attempt_started') {
      if (state.current_attempt) fail('events[' + index + ']', 'cannot start an overlapping attempt')
      if (state.attempts.some((attempt) => attempt.id === event.data.attempt_id)) fail('events[' + index + '].data.attempt_id', 'must be unique')
      if (event.data.baseline && state.attempts.length > 0) fail('events[' + index + '].data.baseline', 'baseline must be the first and only baseline attempt')
      if (!event.data.baseline && state.attempts.length === 0) fail('events[' + index + '].data.baseline', 'the first attempt must establish the baseline')
      if (state.attempts.filter((attempt) => !attempt.baseline).length >= contract.limits.max_attempts) fail('events[' + index + ']', 'change-attempt limit exceeded')
      for (const criterionId of event.data.target_criteria) if (!criteriaById.has(criterionId)) fail('events[' + index + '].data.target_criteria', 'references unknown criterion "' + criterionId + '"')
      if (event.data.baseline && event.data.repo_revision !== contract.baseline.repo_revision) {
        fail('events[' + index + '].data.repo_revision', 'baseline attempt must match the frozen contract baseline revision')
      }
      const attempt = {
        id: event.data.attempt_id,
        baseline: event.data.baseline,
        target_criteria: [...event.data.target_criteria],
        repo_revision: event.data.repo_revision,
        completed: false,
        observations: new Map(),
        results: null,
      }
      state.attempts.push(attempt)
      state.current_attempt = attempt
    }
    if (event.type === 'observation_recorded') {
      const observation = event.data.observation
      if (!state.current_attempt || state.current_attempt.id !== observation.attempt_id) fail('events[' + index + '].data.observation.attempt_id', 'must match the active attempt')
      if (observation.repo_revision !== state.current_attempt.repo_revision) fail('events[' + index + '].data.observation.repo_revision', 'must match the active attempt revision')
      if (observation.goal_id !== contract.goal_id || observation.contract_hash !== contract.contract_hash) fail('events[' + index + '].data.observation', 'does not belong to this contract')
      const criterion = criteriaById.get(observation.criterion_id)
      if (!criterion) fail('events[' + index + '].data.observation.criterion_id', 'references an unknown criterion')
      if (!state.current_attempt.target_criteria.includes(observation.criterion_id)) fail('events[' + index + '].data.observation.criterion_id', 'is outside the active attempt target_criteria')
      if (criterion.verifier_id !== observation.verifier_id) fail('events[' + index + '].data.observation.verifier_id', 'does not match the frozen verifier')
      state.current_attempt.observations.set(observation.criterion_id, observation)
    }
    if (event.type === 'attempt_completed') {
      if (!state.current_attempt || state.current_attempt.id !== event.data.attempt_id) fail('events[' + index + '].data.attempt_id', 'must match the active attempt')
      state.current_attempt.completed = true
      state.current_attempt.results = Object.fromEntries([...state.current_attempt.observations].map(([id, observation]) => [id, observation.result]))
      state.criterion_results = new Map(state.current_attempt.observations)
      state.current_attempt = null
    }
    if (event.type === 'human_gate_recorded') {
      if (!gatesById.has(event.data.gate_id)) fail('events[' + index + '].data.gate_id', 'references an unknown gate')
      state.human_gates.set(event.data.gate_id, event.data)
    }
    if (event.type === 'guard_violation') state.guard_violations.push(event.data)
    if (event.type === 'blocker_reported') state.blocker = event.data
    if (event.type === 'usage_recorded') {
      state.usage.elapsed_sec = Math.max(state.usage.elapsed_sec, event.data.elapsed_sec)
      state.usage.tokens = Math.max(state.usage.tokens, event.data.tokens)
    }
    if (event.type === 'goal_cancelled') state.cancelled = true
    if (event.type === 'goal_superseded') state.superseded = true
    if (event.type === 'goal_decision') {
      const expected = deriveGoalDecision(contract, state)
      if (event.data.decision !== expected.decision) {
        fail('events[' + index + '].data.decision', 'does not match the evidence-derived decision "' + expected.decision + '"')
      }
      if (TERMINAL_DECISIONS.includes(event.data.decision)) state.terminal_decision = event.data
    }
  }
  return state
}

const noProgressStreak = (contract, state) => {
  const mustIds = contract.criteria.filter((criterion) => criterion.priority === 'must').map((criterion) => criterion.id)
  const completed = state.attempts.filter((attempt) => attempt.completed)
  const baseline = completed.filter((attempt) => attempt.baseline)
  let best = baseline.length > 0 ? mustIds.filter((id) => baseline[baseline.length - 1].results[id] === 'pass').length : -1
  let streak = 0
  for (const attempt of completed.filter((item) => !item.baseline)) {
    const passed = mustIds.filter((id) => attempt.results[id] === 'pass').length
    if (passed > best) {
      best = passed
      streak = 0
    } else {
      streak++
    }
  }
  return streak
}

const deriveGoalDecision = (contract, state) => {
  if (contract.status !== 'approved') return { decision: 'NEEDS_HUMAN', reason: 'contract is not approved', failed_must: [] }
  if (state.cancelled) return { decision: 'CANCELLED', reason: 'goal was cancelled', failed_must: [] }
  if (state.superseded) return { decision: 'NEEDS_HUMAN', reason: 'contract was superseded', failed_must: [] }
  if (state.guard_violations.length > 0) return { decision: 'NEEDS_HUMAN', reason: 'a frozen boundary or invariant was violated', failed_must: [] }
  if (state.blocker) {
    if (state.blocker.external) return { decision: 'BLOCKED', reason: state.blocker.detail, blocker_code: state.blocker.code, failed_must: [] }
    return { decision: 'NEEDS_HUMAN', reason: 'a reported blocker requires direct human confirmation', blocker_code: state.blocker.code, failed_must: [] }
  }
  if (state.current_attempt) return { decision: 'CONTINUE', reason: 'the active attempt must be completed before a terminal decision', failed_must: [], active_attempt: state.current_attempt.id }

  const must = contract.criteria.filter((criterion) => criterion.priority === 'must')
  const failedMust = must.filter((criterion) => {
    const observation = state.criterion_results.get(criterion.id)
    return !observation || observation.result !== 'pass'
  }).map((criterion) => criterion.id)
  const missingGates = contract.human_gates.filter((gate) => {
    const result = state.human_gates.get(gate.id)
    return !result || result.result !== 'approved'
  }).map((gate) => gate.id)
  const rejectedGate = [...state.human_gates.values()].find((gate) => gate.result === 'rejected')
  if (rejectedGate) return { decision: 'NEEDS_HUMAN', reason: 'human gate "' + rejectedGate.gate_id + '" was rejected', failed_must: failedMust, missing_human_gates: missingGates }

  // Time and token ceilings are hard budgets, including for a run whose
  // latest observation would otherwise satisfy every completion criterion.
  // Checking them after the success branch would let an over-budget run be
  // recorded as DONE/ALREADY_SATISFIED.
  if (contract.limits.max_time_sec && state.usage.elapsed_sec >= contract.limits.max_time_sec) return { decision: 'STOPPED', reason: 'time budget exhausted', failed_must: failedMust }
  if (contract.limits.max_tokens && state.usage.tokens >= contract.limits.max_tokens) return { decision: 'STOPPED', reason: 'token budget exhausted', failed_must: failedMust }

  if (failedMust.length === 0 && missingGates.length === 0) {
    const changedAttempts = state.attempts.filter((attempt) => !attempt.baseline)
    return {
      decision: changedAttempts.length === 0 ? 'ALREADY_SATISFIED' : 'DONE',
      reason: 'all must criteria, regression checks, and human gates passed',
      failed_must: [],
      missing_human_gates: [],
    }
  }
  if (failedMust.length === 0 && missingGates.length > 0) return { decision: 'NEEDS_HUMAN', reason: 'required human review is pending', failed_must: [], missing_human_gates: missingGates }
  const completedAttempts = state.attempts.filter((attempt) => !attempt.baseline && attempt.completed).length
  if (noProgressStreak(contract, state) >= contract.limits.max_no_progress_attempts) return { decision: 'STOPPED', reason: 'no measurable must-criterion progress within the configured limit', failed_must: failedMust }
  if (completedAttempts >= contract.limits.max_attempts) return { decision: 'STOPPED', reason: 'attempt budget exhausted', failed_must: failedMust }

  return { decision: 'CONTINUE', reason: 'one or more must criteria still require evidence', failed_must: failedMust, next_target: failedMust[0] || null }
}

const progressFor = (contract, state, decision) => {
  const completed = state.attempts.filter((attempt) => attempt.completed)
  const changesUsed = state.attempts.filter((attempt) => !attempt.baseline).length
  const terminal = TERMINAL_DECISIONS.includes(decision.decision)
  const criterionResults = contract.criteria
    .filter((criterion) => criterion.priority === 'must')
    .map((criterion) => ({
      id: criterion.id,
      result: state.criterion_results.get(criterion.id)?.result || 'unknown',
    }))
  const gateResults = contract.human_gates.map((gate) => ({
    id: gate.id,
    result: state.human_gates.get(gate.id)?.result || 'pending',
  }))
  let nextAction
  if (terminal) nextAction = 'STOP — do not continue polishing or modifying the worktree.'
  else if (decision.decision === 'NEEDS_HUMAN') nextAction = 'Pause execution and obtain the required human decision.'
  else if (state.current_attempt) nextAction = 'Complete the active attempt and record evidence for its target criteria.'
  else nextAction = 'Begin one bounded attempt targeting ' + (decision.next_target || decision.failed_must?.[0] || 'the remaining MUST criteria') + '.'
  return {
    terminal,
    must: criterionResults,
    human_gates: gateResults,
    attempts: {
      baseline_completed: completed.some((attempt) => attempt.baseline),
      change_used: changesUsed,
      change_limit: contract.limits.max_attempts,
      change_remaining: Math.max(0, contract.limits.max_attempts - changesUsed),
      no_progress_streak: noProgressStreak(contract, state),
      no_progress_limit: contract.limits.max_no_progress_attempts,
      active_attempt: state.current_attempt && state.current_attempt.id || null,
    },
    budget: {
      elapsed_sec: state.usage.elapsed_sec,
      max_time_sec: contract.limits.max_time_sec ?? null,
      tokens: state.usage.tokens,
      max_tokens: contract.limits.max_tokens ?? null,
    },
    next_action: nextAction,
  }
}

const renderGoalStatusMarkdown = (contract, decision) => {
  validateGoalContract(contract, { allowDraft: false })
  if (!isPlainObject(decision) || !DECISIONS.includes(decision.decision) || !isPlainObject(decision.progress)) fail('decision', 'must be a Goal Governor decision with progress')
  const progress = decision.progress
  const lines = [
    '# Goal Status — ' + contract.goal_id + ' r' + contract.revision,
    '',
    '- Decision: `' + decision.decision + '`',
    '- Terminal: `' + String(progress.terminal) + '`',
    '- Reason: ' + decision.reason,
    '',
    '## MUST criteria',
    '',
    '| ID | Result |',
    '| --- | --- |',
    ...(progress.must.length > 0 ? progress.must.map((item) => '| ' + item.id + ' | ' + item.result + ' |') : ['| _none_ | n/a |']),
    '',
    '## Human gates',
    '',
    ...(progress.human_gates.length > 0 ? progress.human_gates.map((item) => '- ' + item.id + ': `' + item.result + '`') : ['_None._']),
    '',
    '## Limits',
    '',
    '- Change attempts: ' + progress.attempts.change_used + ' / ' + progress.attempts.change_limit + ' (' + progress.attempts.change_remaining + ' remaining)',
    '- No-progress streak: ' + progress.attempts.no_progress_streak + ' / ' + progress.attempts.no_progress_limit,
    '- Tokens: ' + progress.budget.tokens + ' / ' + (progress.budget.max_tokens === null ? 'unbounded' : progress.budget.max_tokens),
    '- Time: ' + progress.budget.elapsed_sec + ' / ' + (progress.budget.max_time_sec === null ? 'unbounded' : progress.budget.max_time_sec + ' sec'),
    '',
    '## Next action',
    '',
    progress.terminal ? '**' + progress.next_action + '**' : progress.next_action,
    '',
  ]
  return lines.join('\n')
}

const decideGoal = (contract, events) => {
  validateGoalContract(contract, { allowDraft: false })
  const state = foldGoalEvents(contract, events)
  const decision = deriveGoalDecision(contract, state)
  return { ...decision, progress: progressFor(contract, state, decision) }
}

const validateAdapterManifest = (manifest) => {
  const v2 = manifest && manifest.schema === 'project-cognition/adapter-capabilities/v2'
  allowedKeys(manifest, v2 ? ['schema', 'client', 'version', 'runtime', 'event_contract', 'invocation', 'capabilities', 'conformance'] : ['schema', 'client', 'version', 'capabilities'], 'adapter')
  if (!v2 && manifest.schema !== 'project-cognition/adapter-capabilities/v1') fail('adapter.schema', 'is invalid')
  text(manifest.client, 'adapter.client', { max: 200 })
  text(manifest.version, 'adapter.version', { max: 200 })
  allowedKeys(manifest.capabilities, ['human_approval', 'hard_stop', 'event_store', 'trusted_verifier', 'project_root_confinement'], 'adapter.capabilities')
  for (const key of ['human_approval', 'hard_stop', 'event_store', 'trusted_verifier', 'project_root_confinement']) if (typeof manifest.capabilities[key] !== 'boolean') fail('adapter.capabilities.' + key, 'must be a boolean')
  const missing = Object.entries(manifest.capabilities).filter((entry) => !entry[1]).map((entry) => entry[0])
  if (!v2) return { governed: missing.length === 0, missing }
  allowedKeys(manifest.runtime, ['package', 'version'], 'adapter.runtime')
  text(manifest.runtime.package, 'adapter.runtime.package', { max: 200 })
  text(manifest.runtime.version, 'adapter.runtime.version', { max: 200 })
  allowedKeys(manifest.event_contract, ['schema', 'native_source', 'human_identity_assurance'], 'adapter.event_contract')
  if (manifest.event_contract.schema !== 'project-cognition/host-event/v1') fail('adapter.event_contract.schema', 'is invalid')
  text(manifest.event_contract.native_source, 'adapter.event_contract.native_source', { max: 200 })
  text(manifest.event_contract.human_identity_assurance, 'adapter.event_contract.human_identity_assurance', { max: 200 })
  allowedKeys(manifest.invocation, ['function_call', 'mode_switch'], 'adapter.invocation')
  for (const key of ['function_call', 'mode_switch']) {
    if (!Array.isArray(manifest.invocation[key]) || manifest.invocation[key].length === 0) fail('adapter.invocation.' + key, 'must be a non-empty array')
    manifest.invocation[key].forEach((value, index) => text(value, 'adapter.invocation.' + key + '[' + index + ']', { max: 200 }))
  }
  allowedKeys(manifest.conformance, ['status', 'evidence'], 'adapter.conformance')
  if (!['PENDING', 'PASS', 'FAIL'].includes(manifest.conformance.status)) fail('adapter.conformance.status', 'must be PENDING, PASS, or FAIL')
  if (!Array.isArray(manifest.conformance.evidence)) fail('adapter.conformance.evidence', 'must be an array')
  manifest.conformance.evidence.forEach((value, index) => text(value, 'adapter.conformance.evidence[' + index + ']', { max: 500 }))
  const declaredGoverned = missing.length === 0
  return { governed: declaredGoverned && manifest.conformance.status === 'PASS', declared_governed: declaredGoverned, conformance: manifest.conformance.status, missing }
}

module.exports = {
  GOAL_SCHEMA,
  OBSERVATION_SCHEMA,
  EVENT_SCHEMA,
  DECISIONS,
  TERMINAL_DECISIONS,
  normativeContract,
  contractHash,
  validateGoalContract,
  approveContract,
  prepareRevision,
  recommendMode,
  renderGoalContractMarkdown,
  renderGoalStatusMarkdown,
  validateObservation,
  validateGoalEvent,
  foldGoalEvents,
  deriveGoalDecision,
  decideGoal,
  validateAdapterManifest,
}
