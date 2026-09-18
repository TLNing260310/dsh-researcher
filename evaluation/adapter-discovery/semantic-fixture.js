'use strict'

const { hashCanonical } = require('../../lib/canonical-json.js')

const FIXTURE_SCHEMA = 'dsh-researcher/adapter-semantic-fixture/v1'
const RESULT_SCHEMA = 'dsh-researcher/adapter-semantic-fixture-result/v1'
const REPLAY_RESULT_SCHEMA = 'dsh-researcher/adapter-semantic-replay-result/v1'
const REPLAY_CHECKPOINT_SCHEMA = 'dsh-researcher/adapter-semantic-replay-checkpoint/v1'
const PROVENANCE = 'host-authored synthetic native-shape events; not emitted by the client or a model'
const CLAIM_BOUNDARY = 'Synthetic semantic projection validates only deterministic candidate assembly and failure behavior. It does not prove native emission, authenticity, completeness, durability, enforcement, compatibility, portability, conformance, or outcome value.'
const REPLAY_CLAIM_BOUNDARY = 'Synthetic prefix replay validates only deterministic recomputation over host-authored fixture bytes. It is not a native restart trace and does not prove client emission, checkpoint authenticity, durable storage, resume correctness, enforcement, compatibility, portability, conformance, or outcome value.'

const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const requiredString = (value, label) => {
  if (typeof value !== 'string' || value.length === 0) throw new Error(label + ' must be a non-empty string')
  return value
}
const requireFields = (event, fields) => {
  for (const field of fields) if (event[field] === undefined || event[field] === null || event[field] === '') throw new Error(event.type + ' missing ' + field)
}

const validateFixture = (fixture) => {
  if (!plain(fixture) || fixture.schema !== FIXTURE_SCHEMA || !['claude-code-agent-sdk', 'codex-app-server-stdio'].includes(fixture.client)) throw new Error('invalid semantic fixture identity')
  if (fixture.provenance !== PROVENANCE || fixture.model_calls !== 0 || fixture.network_calls !== 0) throw new Error('semantic fixture must remain host-authored, zero-model and zero-network')
  if (!Array.isArray(fixture.native_events) || fixture.native_events.length === 0) throw new Error('semantic fixture native_events are missing')
  if (fixture.replay !== undefined) {
    if (!plain(fixture.replay) || !Number.isInteger(fixture.replay.split_after_native_seq) || fixture.replay.split_after_native_seq < 1 || fixture.replay.split_after_native_seq >= fixture.native_events.length || !/^[a-f0-9]{64}$/.test(fixture.replay.expected_result_sha256 || '')) throw new Error('semantic fixture replay lock is invalid')
  }
  const seenSeq = new Set()
  const seenRefs = new Set()
  for (let index = 0; index < fixture.native_events.length; index += 1) {
    const event = fixture.native_events[index]
    if (!plain(event) || event.native_seq !== index + 1 || seenSeq.has(event.native_seq)) throw new Error('semantic fixture native_seq must be unique and contiguous')
    requiredString(event.native_ref, 'native_ref')
    requiredString(event.type, 'native event type')
    if (seenRefs.has(event.native_ref)) throw new Error('duplicate semantic fixture native_ref')
    seenSeq.add(event.native_seq)
    seenRefs.add(event.native_ref)
  }
}

const projection = (host_kind, status, events, data) => ({
  host_kind,
  status,
  native_seq: events.map((event) => event.native_seq),
  native_refs: events.map((event) => event.native_ref),
  data,
})

const unresolved = (host_kind, events, reason) => ({
  host_kind,
  native_seq: events.map((event) => event.native_seq),
  native_refs: events.map((event) => event.native_ref),
  reason,
})

const projectClaude = (events) => {
  const projections = []
  const unresolvedEvents = []
  const permissions = []
  const callbacks = []
  const interrupts = []
  const stops = []
  for (const event of events) {
    if (event.type === 'PreToolUse') {
      requireFields(event, ['session_id', 'prompt_id', 'tool_use_id', 'tool_input'])
      projections.push(projection('tool_call', 'COHESIVE', [event], { session_id: event.session_id, turn_id: event.prompt_id, call_id: event.tool_use_id, arguments_sha256: hashCanonical(event.tool_input) }))
    } else if (event.type === 'PostToolUse' || event.type === 'PostToolUseFailure') {
      requireFields(event, ['session_id', 'prompt_id', 'tool_use_id'])
      const result = event.type === 'PostToolUse' ? event.tool_response : event.error
      if (result === undefined) throw new Error(event.type + ' missing result payload')
      projections.push(projection('tool_result', 'COHESIVE', [event], { session_id: event.session_id, turn_id: event.prompt_id, call_id: event.tool_use_id, result_sha256: hashCanonical(result), terminal_status: event.type === 'PostToolUse' ? 'success' : 'failure' }))
    } else if (event.type === 'PermissionRequest') permissions.push(event)
    else if (event.type === 'CanUseTool') callbacks.push(event)
    else if (event.type === 'SDKResult') {
      requireFields(event, ['session_id', 'user_message_uuid', 'modelUsage', 'subtype'])
      projections.push(projection('usage', 'COHESIVE', [event], { session_id: event.session_id, turn_id: event.user_message_uuid, usage_delta: event.modelUsage, coverage_complete: null }))
      projections.push(projection('turn_end', 'COHESIVE', [event], { session_id: event.session_id, turn_id: event.user_message_uuid, terminal_status: event.terminal_reason || event.subtype }))
    } else if (event.type === 'SessionStart' && event.source === 'resume') {
      requireFields(event, ['session_id'])
      projections.push(projection('session_resume', 'COHESIVE', [event], { session_id: event.session_id, resume_prefix_sha256: null }))
    } else if (event.type === 'InterruptResponse') interrupts.push(event)
    else if (event.type === 'Stop') stops.push(event)
    else throw new Error('unsupported Claude semantic fixture event: ' + event.type)
  }
  if (permissions.length || callbacks.length) unresolvedEvents.push(unresolved('user_action', [...permissions, ...callbacks], 'no_shared_native_join_key_between_permission_hook_and_callback'))
  if (interrupts.length && stops.length) {
    const stop = stops[0]
    requireFields(stop, ['session_id', 'prompt_id'])
    projections.push(projection('goal_transition', 'CONDITIONAL', [...interrupts, stop], { session_id: stop.session_id, turn_id: stop.prompt_id, interrupt_receipt: interrupts[0], terminal_status: 'Stop', join_assurance: 'host-context-only' }))
  } else if (interrupts.length || stops.length) unresolvedEvents.push(unresolved('goal_transition', [...interrupts, ...stops], 'incomplete_host_context_join'))
  return { projections, unresolved: unresolvedEvents }
}

const indexUnique = (events, label) => {
  const map = new Map()
  for (const event of events) {
    requiredString(event.request_id, label + ' request_id')
    if (map.has(event.request_id)) throw new Error('duplicate ' + label + ' request_id')
    map.set(event.request_id, event)
  }
  return map
}

const projectCodex = (events) => {
  const projections = []
  const unresolvedEvents = []
  const approvalRequests = []
  const approvalResponses = []
  const interruptRequests = []
  const interruptResponses = []
  const completedTurns = []
  for (const event of events) {
    if (event.type === 'ItemStarted') {
      requireFields(event, ['threadId', 'turnId', 'itemId', 'input'])
      projections.push(projection('tool_call', 'COHESIVE', [event], { session_id: event.threadId, turn_id: event.turnId, call_id: event.itemId, arguments_sha256: hashCanonical(event.input) }))
    } else if (event.type === 'ItemCompleted') {
      requireFields(event, ['threadId', 'turnId', 'itemId', 'output', 'status'])
      projections.push(projection('tool_result', 'COHESIVE', [event], { session_id: event.threadId, turn_id: event.turnId, call_id: event.itemId, result_sha256: hashCanonical(event.output), terminal_status: event.status }))
    } else if (event.type === 'ApprovalRequest') approvalRequests.push(event)
    else if (event.type === 'ApprovalResponse') approvalResponses.push(event)
    else if (event.type === 'TokenUsage') {
      requireFields(event, ['threadId', 'turnId', 'tokenUsage'])
      projections.push(projection('usage', 'COHESIVE', [event], { session_id: event.threadId, turn_id: event.turnId, usage_delta: event.tokenUsage, coverage_complete: null }))
    } else if (event.type === 'TurnCompleted') {
      requireFields(event, ['threadId', 'turnId', 'status'])
      completedTurns.push(event)
      projections.push(projection('turn_end', 'COHESIVE', [event], { session_id: event.threadId, turn_id: event.turnId, terminal_status: event.status }))
    } else if (event.type === 'ThreadResume') {
      requireFields(event, ['threadId'])
      projections.push(projection('session_resume', 'COHESIVE', [event], { session_id: event.threadId, resume_prefix_sha256: null }))
    } else if (event.type === 'TurnInterruptRequest') interruptRequests.push(event)
    else if (event.type === 'TurnInterruptResponse') interruptResponses.push(event)
    else throw new Error('unsupported Codex semantic fixture event: ' + event.type)
  }
  const approvalRequestById = indexUnique(approvalRequests, 'approval request')
  const approvalResponseById = indexUnique(approvalResponses, 'approval response')
  for (const [requestId, request] of approvalRequestById) {
    requireFields(request, ['threadId', 'turnId', 'itemId'])
    const response = approvalResponseById.get(requestId)
    if (!response) unresolvedEvents.push(unresolved('user_action', [request], 'missing_json_rpc_response'))
    else projections.push(projection('user_action', 'COHESIVE', [request, response], { session_id: request.threadId, turn_id: request.turnId, call_id: request.itemId, request_id: requestId, principal_id: null, decision_receipt: response.decision }))
  }
  for (const [requestId, response] of approvalResponseById) if (!approvalRequestById.has(requestId)) unresolvedEvents.push(unresolved('user_action', [response], 'orphan_json_rpc_response'))
  const interruptRequestById = indexUnique(interruptRequests, 'interrupt request')
  const interruptResponseById = indexUnique(interruptResponses, 'interrupt response')
  for (const [requestId, request] of interruptRequestById) {
    requireFields(request, ['threadId', 'turnId'])
    const response = interruptResponseById.get(requestId)
    const terminal = completedTurns.find((event) => event.threadId === request.threadId && event.turnId === request.turnId)
    if (!response || !terminal) unresolvedEvents.push(unresolved('goal_transition', [request, ...(response ? [response] : []), ...(terminal ? [terminal] : [])], !response ? 'missing_json_rpc_response' : 'missing_matching_terminal_turn'))
    else projections.push(projection('goal_transition', 'COHESIVE', [request, response, terminal], { session_id: request.threadId, turn_id: request.turnId, interrupt_receipt: {}, terminal_status: terminal.status }))
  }
  for (const [requestId, response] of interruptResponseById) if (!interruptRequestById.has(requestId)) unresolvedEvents.push(unresolved('goal_transition', [response], 'orphan_json_rpc_response'))
  return { projections, unresolved: unresolvedEvents }
}

const projectSemanticFixture = (fixture) => {
  validateFixture(fixture)
  const projected = fixture.client === 'claude-code-agent-sdk' ? projectClaude(fixture.native_events) : projectCodex(fixture.native_events)
  const projections = projected.projections.sort((left, right) => left.native_seq[0] - right.native_seq[0] || left.host_kind.localeCompare(right.host_kind))
  const unresolvedEvents = projected.unresolved.sort((left, right) => left.native_seq[0] - right.native_seq[0] || left.host_kind.localeCompare(right.host_kind))
  const summary = {
    projected: projections.length,
    unresolved: unresolvedEvents.length,
    cohesive: projections.filter((item) => item.status === 'COHESIVE').length,
    conditional: projections.filter((item) => item.status === 'CONDITIONAL').length,
    host_kinds: [...new Set([...projections, ...unresolvedEvents].map((item) => item.host_kind))].sort(),
  }
  return { schema: RESULT_SCHEMA, client: fixture.client, model_calls: 0, network_calls: 0, projections, unresolved: unresolvedEvents, summary, claim_boundary: CLAIM_BOUNDARY }
}

const checkpointFor = (fixture) => {
  validateFixture(fixture)
  if (!plain(fixture.replay)) throw new Error('semantic fixture replay lock is missing')
  const split = fixture.replay.split_after_native_seq
  const prefixEvents = fixture.native_events.slice(0, split)
  const prefixResult = projectSemanticFixture({
    schema: fixture.schema,
    client: fixture.client,
    runtime_version: fixture.runtime_version,
    provenance: fixture.provenance,
    model_calls: fixture.model_calls,
    network_calls: fixture.network_calls,
    native_events: prefixEvents,
  })
  return {
    schema: REPLAY_CHECKPOINT_SCHEMA,
    client: fixture.client,
    split_after_native_seq: split,
    native_prefix_sha256: hashCanonical(prefixEvents),
    projection_prefix_sha256: hashCanonical(prefixResult),
  }
}

const replaySemanticFixture = (fixture, suppliedCheckpoint = null) => {
  const checkpoint = checkpointFor(fixture)
  if (suppliedCheckpoint !== null && hashCanonical(suppliedCheckpoint) !== hashCanonical(checkpoint)) throw new Error('synthetic replay checkpoint mismatch')
  const split = checkpoint.split_after_native_seq
  const prefixFixture = { ...fixture, native_events: fixture.native_events.slice(0, split) }
  delete prefixFixture.replay
  delete prefixFixture.expected_result_sha256
  const prefixResult = projectSemanticFixture(prefixFixture)
  const finalResult = projectSemanticFixture(fixture)
  const finalUnresolved = new Set(finalResult.unresolved.map((item) => item.host_kind + '\u0000' + item.reason))
  const finalUnresolvedByKind = new Map()
  for (const item of finalResult.unresolved) {
    const reasons = finalUnresolvedByKind.get(item.host_kind) || []
    reasons.push(item.reason)
    finalUnresolvedByKind.set(item.host_kind, reasons)
  }
  const pendingBeforeRestart = prefixResult.unresolved.map((item) => ({ host_kind: item.host_kind, reason: item.reason, native_refs: item.native_refs }))
  const resolvedAfterRestart = pendingBeforeRestart.filter((item) => !finalUnresolvedByKind.has(item.host_kind))
  const retainedUnresolved = pendingBeforeRestart.filter((item) => finalUnresolved.has(item.host_kind + '\u0000' + item.reason))
  const changedUnresolved = pendingBeforeRestart
    .filter((item) => finalUnresolvedByKind.has(item.host_kind) && !finalUnresolved.has(item.host_kind + '\u0000' + item.reason))
    .map((item) => ({ ...item, final_reasons: [...finalUnresolvedByKind.get(item.host_kind)].sort() }))
  const finalProjectionHashes = new Set(finalResult.projections.map(hashCanonical))
  const projectionPrefixPreserved = prefixResult.projections.every((item) => finalProjectionHashes.has(hashCanonical(item)))
  return {
    schema: REPLAY_RESULT_SCHEMA,
    client: fixture.client,
    model_calls: 0,
    network_calls: 0,
    checkpoint,
    prefix_summary: prefixResult.summary,
    pending_before_restart: pendingBeforeRestart,
    final_result_sha256: hashCanonical(finalResult),
    final_summary: finalResult.summary,
    resolved_after_restart: resolvedAfterRestart,
    retained_unresolved: retainedUnresolved,
    changed_unresolved: changedUnresolved,
    projection_prefix_preserved: projectionPrefixPreserved,
    claim_boundary: REPLAY_CLAIM_BOUNDARY,
  }
}

module.exports = { FIXTURE_SCHEMA, RESULT_SCHEMA, REPLAY_RESULT_SCHEMA, REPLAY_CHECKPOINT_SCHEMA, PROVENANCE, CLAIM_BOUNDARY, REPLAY_CLAIM_BOUNDARY, projectSemanticFixture, checkpointFor, replaySemanticFixture }
