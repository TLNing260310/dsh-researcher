const {
  EVENT_SCHEMA, OBSERVATION_SCHEMA, TERMINAL_DECISIONS,
  validateGoalContract, foldGoalEvents, decideGoal,
} = require('../goal-core/index.js')
const { validateRegistry, verifyEvidence } = require('../verifier-core/index.js')

const TOOL_NAMES = Object.freeze({
  begin: 'begin_goal_attempt',
  observe: 'submit_goal_observation',
  complete: 'complete_goal_attempt',
  decide: 'request_goal_decision',
  blocker: 'report_goal_blocker',
})

const makeGoalPointer = (relativePath, contractHash) => 'project-cognition:' + relativePath.replace(/\\/g, '/') + '#' + contractHash

const parseGoalPointer = (objective) => {
  const match = /^project-cognition:([^#]+)#([a-f0-9]{64})$/.exec(String(objective || ''))
  if (!match) throw new Error('DSH goal is not bound to an approved Project Cognition contract')
  return { relative_path: match[1], contract_hash: match[2] }
}

const eventSequence = (event, fallback) => Number.isFinite(event && event.seq) ? event.seq : Number.isFinite(event && event.sequence) ? event.sequence : fallback
const eventMillis = (event) => {
  const value = event && (event.time !== undefined ? event.time : event.timestamp !== undefined ? event.timestamp : event.ts)
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}
const eventTime = (event) => {
  const millis = eventMillis(event)
  return millis === null ? String(event && event.at || 'session-event:' + eventSequence(event, 0)) : new Date(millis).toISOString()
}

const parseArguments = (event) => {
  const raw = event && event.data && event.data.arguments
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('tool arguments must be a JSON object')
  return value
}

const commandArgs = (event) => String(event && event.data && (event.data.args !== undefined ? event.data.args : event.data.rawInput) || '').trim()

const researchModeState = (events) => {
  let state = { active: false, persistent: false, started_at: null }
  for (let index = 0; index < (events || []).length; index++) {
    const event = events[index]
    const seq = eventSequence(event, index + 1)
    if (event.type === 'command/run' && event.data && event.data.name === 'researcher') {
      const raw = commandArgs(event)
      const first = raw.split(/\s+/, 1)[0].toLowerCase()
      if (first === 'on') state = { active: true, persistent: true, started_at: seq }
      else if (first === 'off') state = { active: false, persistent: false, started_at: null }
      else if (first === 'goal' || (raw !== '' && !['run', 'status', 'approve-gate', 'reject-gate', 'cancel', 'mode'].includes(first))) {
        state = { active: true, persistent: false, started_at: seq }
      }
    }
    if (event.type === 'turn/end' && state.active && !state.persistent && seq > state.started_at) state = { active: false, persistent: false, started_at: null }
  }
  return state
}

const scopeGoalEvents = (events, runtimeGoal) => {
  const source = Array.isArray(events) ? events : []
  if (!runtimeGoal) return source
  for (let index = source.length - 1; index >= 0; index--) {
    const event = source[index]
    const data = event && event.data
    if (event && event.type === 'goal/change' && data && data.operation === 'create' && data.goal && String(data.goal.id) === String(runtimeGoal.id)) return source.slice(index)
  }
  for (let index = source.length - 1; index >= 0; index--) {
    const event = source[index]
    if (event && event.type === 'command/run' && event.data && event.data.name === 'researcher' && /^run(?:\s|$)/.test(commandArgs(event))) return source.slice(index)
  }
  return source
}

const usageTokens = (usage) => {
  if (!usage || typeof usage !== 'object') return 0
  return ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens'].reduce((sum, key) => sum + (Number.isFinite(usage[key]) && usage[key] > 0 ? usage[key] : 0), 0)
}

const foldDshGoalEvents = (contract, registry, sessionEvents) => {
  validateGoalContract(contract, { allowDraft: false })
  validateRegistry(registry)
  if (registry.registry_hash !== contract.verifier_registry_hash) throw new Error('live verifier registry does not match the frozen contract hash')
  const events = Array.isArray(sessionEvents) ? sessionEvents : []
  const goalEvents = []
  const diagnostics = []
  const decisions = []
  let terminalRecorded = false
  let cumulativeTokens = 0
  const firstMillis = events.map(eventMillis).find((value) => value !== null)
  const startMillis = firstMillis === undefined ? null : firstMillis
  let recordedElapsed = 0
  let recordedTokens = 0

  const coreEvent = (source, type, data) => ({
    schema: EVENT_SCHEMA,
    sequence: goalEvents.length + 1,
    goal_id: contract.goal_id,
    contract_hash: contract.contract_hash,
    type,
    at: eventTime(source),
    data,
  })
  const append = (source, type, data) => {
    const candidate = coreEvent(source, type, data)
    foldGoalEvents(contract, [...goalEvents, candidate])
    goalEvents.push(candidate)
    if (type === 'goal_decision' && TERMINAL_DECISIONS.includes(data.decision)) terminalRecorded = true
  }
  const poison = (source, kind, detail, ref) => {
    diagnostics.push({ sequence: eventSequence(source, 0), kind, detail })
    if (terminalRecorded) return
    try { append(source, 'guard_violation', { kind, detail, ...(ref ? { ref } : {}) }) } catch (error) { diagnostics.push({ sequence: eventSequence(source, 0), kind: 'contract', detail: error.message }) }
  }

  for (let index = 0; index < events.length; index++) {
    const source = events[index]
    if (source.type === 'assistant/message') {
      cumulativeTokens += usageTokens(source.data && source.data.usage)
      const millis = eventMillis(source)
      const elapsed = startMillis !== null && millis !== null ? Math.max(0, (millis - startMillis) / 1000) : recordedElapsed
      if (elapsed > recordedElapsed || cumulativeTokens > recordedTokens) {
        try {
          append(source, 'usage_recorded', { elapsed_sec: elapsed, tokens: cumulativeTokens })
          recordedElapsed = elapsed
          recordedTokens = cumulativeTokens
        } catch (error) { poison(source, 'contract', error.message) }
      }
      continue
    }
    if (source.type === 'command/run' && source.data && source.data.name === 'researcher') {
      const raw = commandArgs(source)
      const parts = raw.split(/\s+/).filter(Boolean)
      if (parts[0] === 'approve-gate' || parts[0] === 'reject-gate') {
        if (!parts[1]) {
          poison(source, 'contract', 'human gate command omitted the gate id')
          continue
        }
        try {
          append(source, 'human_gate_recorded', {
            gate_id: parts[1], result: parts[0] === 'approve-gate' ? 'approved' : 'rejected',
            actor: 'direct-dsh-user', evidence_refs: parts.slice(2),
          })
        } catch (error) { poison(source, 'contract', error.message, parts[1]) }
      }
      if (parts[0] === 'cancel') {
        try { append(source, 'goal_cancelled', {}) } catch (error) { poison(source, 'contract', error.message) }
      }
      continue
    }
    if (source.type !== 'tool/call' || !source.data || !Object.values(TOOL_NAMES).includes(source.data.name)) continue
    let args
    try { args = parseArguments(source) } catch (error) {
      poison(source, 'contract', error.message)
      continue
    }
    try {
      if (source.data.name === TOOL_NAMES.begin) {
        append(source, 'attempt_started', {
          attempt_id: args.attempt_id,
          baseline: args.baseline,
          target_criteria: args.target_criteria,
          repo_revision: args.repo_revision,
        })
      }
      if (source.data.name === TOOL_NAMES.observe) {
        const criterion = contract.criteria.find((item) => item.id === args.criterion_id)
        if (!criterion) throw new Error('observation references an unknown criterion')
        if (criterion.authority !== 'tool') throw new Error('human-authority criteria require a human gate, not a model observation')
        if (args.verifier_id !== criterion.verifier_id) throw new Error('observation changed the frozen verifier id')
        const verified = verifyEvidence(registry, args.verifier_id, args.evidence_refs, events, eventSequence(source, index + 1))
        if (verified.result !== args.result) throw new Error('claimed result "' + args.result + '" disagrees with trusted evidence result "' + verified.result + '": ' + verified.diagnostics.join('; '))
        append(source, 'observation_recorded', { observation: {
          schema: OBSERVATION_SCHEMA,
          goal_id: contract.goal_id,
          contract_hash: contract.contract_hash,
          attempt_id: args.attempt_id,
          criterion_id: args.criterion_id,
          verifier_id: args.verifier_id,
          result: args.result,
          evidence_refs: args.evidence_refs,
          repo_revision: args.repo_revision,
          observed_at: eventTime(source),
        } })
      }
      if (source.data.name === TOOL_NAMES.complete) append(source, 'attempt_completed', { attempt_id: args.attempt_id })
      if (source.data.name === TOOL_NAMES.blocker) append(source, 'blocker_reported', { code: args.code, detail: args.detail, external: args.external })
      if (source.data.name === TOOL_NAMES.decide) {
        const millis = eventMillis(source)
        const elapsed = startMillis !== null && millis !== null ? Math.max(0, (millis - startMillis) / 1000) : recordedElapsed
        if (elapsed > recordedElapsed || cumulativeTokens > recordedTokens) {
          append(source, 'usage_recorded', { elapsed_sec: elapsed, tokens: cumulativeTokens })
          recordedElapsed = elapsed
          recordedTokens = cumulativeTokens
        }
        const decision = decideGoal(contract, goalEvents)
        decisions.push({ source_sequence: eventSequence(source, index + 1), ...decision })
        if (!terminalRecorded && TERMINAL_DECISIONS.includes(decision.decision)) append(source, 'goal_decision', { decision: decision.decision, reason: decision.reason })
      }
    } catch (error) {
      poison(source, source.data.name === TOOL_NAMES.observe ? 'verifier' : 'contract', error.message)
    }
  }
  const currentDecision = decisions.length > 0 ? decisions[decisions.length - 1] : decideGoal(contract, goalEvents)
  return { events: goalEvents, diagnostics, decisions, decision: currentDecision }
}

module.exports = { TOOL_NAMES, makeGoalPointer, parseGoalPointer, researchModeState, scopeGoalEvents, usageTokens, foldDshGoalEvents }
