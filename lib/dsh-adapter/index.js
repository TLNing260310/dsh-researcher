const {
  EVENT_SCHEMA, OBSERVATION_SCHEMA, TERMINAL_DECISIONS,
  validateGoalContract, foldGoalEvents, decideGoal,
} = require('../goal-core/index.js')
const { hashCanonical } = require('../canonical-json.js')
const { validateRegistry, verifyEvidence } = require('../verifier-core/index.js')

const TOOL_NAMES = Object.freeze({
  begin: 'begin_goal_attempt',
  observe: 'submit_goal_observation',
  complete: 'complete_goal_attempt',
  decide: 'request_goal_decision',
  blocker: 'report_goal_blocker',
})

const TOKEN_USAGE_FIELDS = Object.freeze([
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'reasoningTokens',
])
const NATIVE_USAGE_SCHEMA = 'project-cognition/dsh-native-usage/v1'

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

const normalizeUsage = (usage) => {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return { value: null, error: 'usage must be an object' }
  const value = {}
  for (const key of TOKEN_USAGE_FIELDS) {
    const required = key === 'inputTokens' || key === 'outputTokens'
    const observed = usage[key]
    if (observed === undefined && !required) {
      value[key] = 0
      continue
    }
    if (!Number.isSafeInteger(observed) || observed < 0) return { value: null, error: 'usage.' + key + ' must be a non-negative safe integer' }
    value[key] = observed
  }
  // DSH defines reasoningTokens as informational detail already included in
  // outputTokens. Input/cache buckets are disjoint and therefore all billable.
  if (value.reasoningTokens > value.outputTokens) return { value: null, error: 'usage.reasoningTokens cannot exceed usage.outputTokens' }
  const tokens = value.inputTokens + value.outputTokens + value.cacheReadTokens + value.cacheWriteTokens
  if (!Number.isSafeInteger(tokens)) return { value: null, error: 'usage token total exceeds the safe integer range' }
  return { value, tokens, error: null }
}

const usageTokens = (usage) => {
  const normalized = normalizeUsage(usage)
  return normalized.error ? 0 : normalized.tokens
}

const streamCoordinates = (event) => {
  const data = event && event.data
  return data && Number.isInteger(data.turn) && data.turn >= 0 && Number.isInteger(data.step) && data.step >= 0
    ? { turn: data.turn, step: data.step, key: data.turn + ':' + data.step }
    : null
}

const originSequence = (event, fallback) => Number.isInteger(event && event._native_seq)
  ? event._native_seq
  : eventSequence(event, fallback)

/**
 * Reconstruct provider request attempts from the native DSH append-only log.
 *
 * A retry may reuse the same (turn, step). A failed/aborted finish (or the
 * durable llm/retry marker for a thrown failure) closes that billable attempt.
 * Within one attempt, assistant/message.usage replaces the last usage chunk;
 * it never replaces an earlier failed attempt. The returned ledger is also a
 * coverage proof: a known request attempt without a valid usage sample is not
 * safe evidence that a token budget remained available.
 */
const summarizeNativeUsage = (sessionEvents, options = {}) => {
  const events = Array.isArray(sessionEvents) ? sessionEvents : []
  const strict = options.strict === true
  const attempts = []
  const independentCalls = []
  const active = new Map()
  const pendingRetryStarts = new Map()
  const compactions = new Map()
  const chunkOwners = new Map()
  const diagnostics = []

  const issue = (event, detail) => diagnostics.push({
    sequence: originSequence(event, 0),
    detail,
  })
  const createAttempt = (coordinates, event, index) => {
    const previous = attempts.filter((item) => item.turn === coordinates.turn && item.step === coordinates.step).length
    const attempt = {
      turn: coordinates.turn,
      step: coordinates.step,
      attempt: previous + 1,
      first_sequence: originSequence(event, index),
      last_sequence: originSequence(event, index),
      chunk_sequences: [],
      usage_chunk_sequences: [],
      message_sequence: null,
      message_source_event_seqs: null,
      terminal_kind: null,
      terminal_failure: null,
      retry_sequence: null,
      retry_id: null,
      retry_number: null,
      retry_started_sequence: null,
      retry_started_consumed: false,
      status: 'open',
      usage_source: null,
      usage: null,
      tokens: null,
      accounted_at_index: null,
      accounted_at_sequence: null,
      coverage_complete: false,
    }
    const pending = pendingRetryStarts.get(coordinates.key)
    if (pending) {
      attempt.retry_id = pending.retry_id
      attempt.retry_number = pending.retry_number
      attempt.retry_started_sequence = pending.sequence
      pendingRetryStarts.delete(coordinates.key)
    }
    attempts.push(attempt)
    active.set(coordinates.key, attempt)
    return attempt
  }
  const getAttempt = (coordinates, event, index) => active.get(coordinates.key) || createAttempt(coordinates, event, index)
  const applyUsage = (attempt, event, usage, source) => {
    const normalized = normalizeUsage(usage)
    if (normalized.error) {
      issue(event, source + ' ' + normalized.error)
      attempt.usage = null
      attempt.tokens = null
      attempt.usage_source = null
      return normalized
    }
    attempt.usage = normalized.value
    attempt.tokens = normalized.tokens
    attempt.usage_source = source
    return normalized
  }
  const closeAttempt = (coordinates, attempt, event, index, status) => {
    attempt.last_sequence = originSequence(event, index)
    attempt.status = status
    attempt.accounted_at_index = index
    attempt.accounted_at_sequence = originSequence(event, index)
    attempt.coverage_complete = Number.isSafeInteger(attempt.tokens)
    active.delete(coordinates.key)
  }

  for (let index = 0; index < events.length; index++) {
    const event = events[index]
    if (!event || typeof event.type !== 'string') continue

    if (event.type === 'session/title-llm-request') {
      issue(event, 'session title LLM request has no durable token-usage record in DSH rc.7')
      continue
    }

    if (event.type === 'compaction/start') {
      const compactionId = event.data && event.data.compactionId
      if (typeof compactionId !== 'string' || compactionId === '' || compactions.has(compactionId)) {
        issue(event, 'compaction/start has a missing or duplicate compactionId')
      } else compactions.set(compactionId, { start: event, summary: null, end: null })
      continue
    }

    if (event.type === 'compaction/summary') {
      const compactionId = event.data && event.data.compactionId
      const lifecycle = compactions.get(compactionId)
      if (!lifecycle || lifecycle.summary || lifecycle.end) issue(event, 'compaction/summary has no unique open compaction/start')
      else lifecycle.summary = event
      if (!event.data || event.data.llmStreamCall !== true) issue(event, 'compaction/summary is not marked as exactly one context LLM stream call')
      const normalized = normalizeUsage(event.data && event.data.usage)
      const entry = {
        kind: 'compaction',
        compaction_id: typeof compactionId === 'string' ? compactionId : null,
        sequence: originSequence(event, index),
        usage_source: 'compaction/summary',
        usage: normalized.error ? null : normalized.value,
        tokens: normalized.error ? null : normalized.tokens,
        coverage_complete: !normalized.error,
        accounted_at_index: index,
      }
      independentCalls.push(entry)
      if (normalized.error) issue(event, 'compaction/summary ' + normalized.error)
      continue
    }

    if (event.type === 'compaction/end') {
      const compactionId = event.data && event.data.compactionId
      const lifecycle = compactions.get(compactionId)
      if (!lifecycle || lifecycle.end) issue(event, 'compaction/end has no unique open compaction/start')
      else {
        lifecycle.end = event
        if (event.data.error !== undefined && !lifecycle.summary) {
          issue(event, 'failed compaction has no durable usage-bearing summary for its model call')
        }
      }
      continue
    }

    if (event.type === 'assistant/chunk') {
      const coordinates = streamCoordinates(event)
      if (!coordinates) {
        issue(event, 'assistant/chunk omitted integer turn/step coordinates')
        continue
      }
      const chunk = event.data && event.data.chunk
      if (!chunk || typeof chunk !== 'object' || typeof chunk.type !== 'string') {
        issue(event, 'assistant/chunk omitted the native data.chunk StreamChunk')
        continue
      }
      const attempt = getAttempt(coordinates, event, index)
      if (attempt.terminal_kind !== null) issue(event, 'assistant/chunk appeared after a terminal finish in the same request attempt')
      const origin = originSequence(event, index)
      attempt.last_sequence = origin
      attempt.chunk_sequences.push(origin)
      chunkOwners.set(origin, attempt)
      if (chunk.type === 'usage') {
        attempt.usage_chunk_sequences.push(origin)
        applyUsage(attempt, event, chunk.usage, 'assistant/chunk')
      }
      if (chunk.type === 'finish') {
        const kind = chunk.reason && chunk.reason.kind
        attempt.terminal_kind = typeof kind === 'string' ? kind : null
        attempt.terminal_failure = chunk.reason && chunk.reason.failure || null
        if (kind === 'error' || kind === 'aborted') {
          closeAttempt(coordinates, attempt, event, index, 'failed-or-retried')
        }
      }
      continue
    }

    if (event.type === 'assistant/message') {
      const coordinates = streamCoordinates(event)
      if (!coordinates) {
        issue(event, 'assistant/message omitted integer turn/step coordinates')
        continue
      }
      const sources = event.sourceEventSeqs
      let attempt = active.get(coordinates.key)
      if (Array.isArray(sources)) {
        if (new Set(sources).size !== sources.length) issue(event, 'assistant/message sourceEventSeqs contains duplicate chunk sequences')
        const owners = new Set()
        for (const source of sources) {
          if (!Number.isInteger(source) || !chunkOwners.has(source)) {
            issue(event, 'assistant/message cites an unknown assistant/chunk source sequence')
            continue
          }
          owners.add(chunkOwners.get(source))
        }
        if (owners.size > 1) issue(event, 'assistant/message sourceEventSeqs cross request-attempt boundaries')
        if (owners.size === 1) {
          const sourced = [...owners][0]
          if (sourced.turn !== coordinates.turn || sourced.step !== coordinates.step || sourced.status === 'failed-or-retried') {
            issue(event, 'assistant/message sourceEventSeqs do not identify the active successful request attempt')
          } else attempt = sourced
        }
        if (attempt && (attempt.chunk_sequences.length !== sources.length || attempt.chunk_sequences.some((sequence, sourceIndex) => sequence !== sources[sourceIndex]))) {
          issue(event, 'assistant/message sourceEventSeqs must exactly equal the ordered chunks from its request attempt')
        }
      } else if (strict) issue(event, 'assistant/message omitted sourceEventSeqs attempt provenance')
      if (!attempt) attempt = createAttempt(coordinates, event, index)
      attempt.message_sequence = originSequence(event, index)
      attempt.message_source_event_seqs = Array.isArray(sources) ? [...sources] : null
      attempt.last_sequence = originSequence(event, index)
      if (event.data && event.data.usage !== undefined) {
        const priorUsage = attempt.usage
        const priorSource = attempt.usage_source
        const normalized = applyUsage(attempt, event, event.data.usage, 'assistant/message')
        if (strict && priorSource === 'assistant/chunk' && priorUsage && !normalized.error && hashCanonical(priorUsage) !== hashCanonical(normalized.value)) {
          issue(event, 'assistant/message usage differs from its attempt usage chunk')
        }
      }
      closeAttempt(coordinates, attempt, event, index, event.data && event.data.interrupted === true ? 'interrupted-message' : 'committed')
      continue
    }

    if (event.type === 'llm/retry') {
      const coordinates = streamCoordinates(event)
      if (!coordinates) {
        issue(event, 'llm/retry omitted integer turn/step coordinates')
        continue
      }
      const attempt = [...attempts].reverse().find((item) =>
        item.turn === coordinates.turn && item.step === coordinates.step &&
        item.status === 'failed-or-retried' && item.retry_sequence === null)
      if (!attempt) {
        issue(event, 'llm/retry has no preceding error/aborted request-attempt boundary')
        continue
      }
      if (attempt.terminal_failure && event.data && event.data.failure && hashCanonical(attempt.terminal_failure) !== hashCanonical(event.data.failure)) {
        issue(event, 'llm/retry failure differs from the preceding terminal finish failure')
      }
      attempt.retry_sequence = originSequence(event, index)
      attempt.retry_id = event.data.retryId || null
      attempt.retry_number = Number.isInteger(event.data.retry) ? event.data.retry : null
      continue
    }

    if (event.type === 'llm/retry-started') {
      const coordinates = streamCoordinates(event)
      if (!coordinates) {
        issue(event, 'llm/retry-started omitted integer turn/step coordinates')
        continue
      }
      const retryId = event.data && event.data.retryId
      const retryNumber = event.data && event.data.retry
      const scheduled = [...attempts].reverse().find((item) =>
        item.turn === coordinates.turn && item.step === coordinates.step &&
        item.retry_id === retryId && item.retry_number === retryNumber && item.retry_started_consumed === false)
      if (!scheduled || typeof retryId !== 'string' || !Number.isInteger(retryNumber)) {
        issue(event, 'llm/retry-started has no matching scheduled llm/retry attempt')
      }
      if (active.has(coordinates.key)) {
        issue(event, 'llm/retry-started overlaps an active request attempt')
        continue
      }
      if (pendingRetryStarts.has(coordinates.key)) issue(event, 'llm/retry-started overlaps an unconsumed retry transition')
      pendingRetryStarts.set(coordinates.key, {
        retry_id: typeof retryId === 'string' ? retryId : null,
        retry_number: Number.isInteger(retryNumber) ? retryNumber : null,
        sequence: originSequence(event, index),
      })
      if (scheduled) scheduled.retry_started_consumed = true
      continue
    }

    if (event.type === 'step/end') {
      const coordinates = streamCoordinates(event)
      const attempt = coordinates && active.get(coordinates.key)
      if (attempt) closeAttempt(coordinates, attempt, event, index, 'uncommitted')
    }
  }

  for (const [key, attempt] of active) {
    const coordinates = { key }
    const index = Math.max(0, events.length - 1)
    closeAttempt(coordinates, attempt, events[index] || { seq: 0 }, index, 'open-at-end')
  }
  for (const pending of pendingRetryStarts.values()) diagnostics.push({
    sequence: pending.sequence,
    detail: 'llm/retry-started has no subsequent assistant/chunk or assistant/message to prove the next provider attempt usage',
  })
  for (const [compactionId, lifecycle] of compactions) {
    if (!lifecycle.end) diagnostics.push({
      sequence: originSequence(lifecycle.start, 0),
      detail: 'compaction ' + compactionId + ' has no durable compaction/end boundary',
    })
    if (lifecycle.end && !lifecycle.summary && !(lifecycle.end.data && lifecycle.end.data.error !== undefined)) diagnostics.push({
      sequence: originSequence(lifecycle.end, 0),
      detail: 'completed compaction ' + compactionId + ' has no usage-bearing compaction/summary',
    })
  }

  for (const attempt of attempts) {
    if (!attempt.coverage_complete) diagnostics.push({
      sequence: attempt.accounted_at_sequence,
      detail: 'request attempt ' + attempt.turn + ':' + attempt.step + '#' + attempt.attempt + ' has no complete usage sample',
    })
    if (strict && attempt.status === 'committed' && !Array.isArray(attempt.message_source_event_seqs)) {
      // The event-level diagnostic above is retained; this condition keeps the
      // ledger self-describing even when no chunk rows existed.
      attempt.coverage_complete = false
    }
  }

  let cumulative = 0
  const accountingEvents = []
  const billable = [
    ...attempts.map((attempt) => ({
      kind: 'request',
      event_index: attempt.accounted_at_index,
      sequence: attempt.accounted_at_sequence,
      tokens: attempt.tokens,
      attempt: attempt.attempt,
      turn: attempt.turn,
      step: attempt.step,
    })),
    ...independentCalls.map((entry) => ({
      kind: entry.kind,
      event_index: entry.accounted_at_index,
      sequence: entry.sequence,
      tokens: entry.tokens,
      attempt: null,
      turn: null,
      step: null,
    })),
  ].sort((left, right) => left.event_index - right.event_index)
  for (const item of billable) {
    if (Number.isSafeInteger(item.tokens)) cumulative += item.tokens
    if (!Number.isSafeInteger(cumulative)) {
      diagnostics.push({ sequence: item.sequence, detail: 'cumulative token total exceeds the safe integer range' })
      cumulative = Number.MAX_SAFE_INTEGER
    }
    accountingEvents.push({
      kind: item.kind,
      event_index: item.event_index,
      sequence: item.sequence,
      cumulative_tokens: cumulative,
      attempt: item.attempt,
      turn: item.turn,
      step: item.step,
    })
  }

  const ledger = attempts.map(({ accounted_at_index, ...attempt }) => attempt)
  const independentLedger = independentCalls.map(({ accounted_at_index, ...entry }) => entry)
  return {
    schema: NATIVE_USAGE_SCHEMA,
    cumulative_tokens: cumulative,
    request_attempts: ledger.length,
    covered_attempts: ledger.filter((attempt) => attempt.coverage_complete).length,
    failed_or_retried_attempts: ledger.filter((attempt) => attempt.status === 'failed-or-retried').length,
    independent_calls: independentLedger.length,
    coverage_complete: diagnostics.length === 0 && ledger.every((attempt) => attempt.coverage_complete) && independentLedger.every((entry) => entry.coverage_complete),
    attempts: ledger,
    independent_call_ledger: independentLedger,
    diagnostics,
    accounting_events: accountingEvents,
  }
}

const foldDshGoalEvents = (contract, registry, sessionEvents) => {
  validateGoalContract(contract, { allowDraft: false })
  validateRegistry(registry)
  if (registry.registry_hash !== contract.verifier_registry_hash) throw new Error('live verifier registry does not match the frozen contract hash')
  const events = Array.isArray(sessionEvents) ? sessionEvents : []
  const nativeUsage = summarizeNativeUsage(events, { strict: false })
  const usageAtIndex = new Map(nativeUsage.accounting_events.map((entry) => [entry.event_index, entry]))
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
    const usageBoundary = usageAtIndex.get(index)
    if (usageBoundary) {
      cumulativeTokens = Math.max(cumulativeTokens, usageBoundary.cumulative_tokens)
      const millis = eventMillis(source)
      const elapsed = startMillis !== null && millis !== null ? Math.max(0, (millis - startMillis) / 1000) : recordedElapsed
      if (elapsed > recordedElapsed || cumulativeTokens > recordedTokens) {
        try {
          append(source, 'usage_recorded', { elapsed_sec: elapsed, tokens: cumulativeTokens })
          recordedElapsed = elapsed
          recordedTokens = cumulativeTokens
        } catch (error) { poison(source, 'contract', error.message) }
      }
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
  return { events: goalEvents, diagnostics, decisions, decision: currentDecision, native_usage: nativeUsage }
}

module.exports = {
  TOOL_NAMES,
  TOKEN_USAGE_FIELDS,
  NATIVE_USAGE_SCHEMA,
  makeGoalPointer,
  parseGoalPointer,
  researchModeState,
  scopeGoalEvents,
  normalizeUsage,
  usageTokens,
  summarizeNativeUsage,
  foldDshGoalEvents,
}
