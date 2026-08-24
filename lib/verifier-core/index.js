const { hashCanonical, sha256 } = require('../canonical-json.js')
const { allowedKeys, text, enumValue, positiveInteger, uniqueBy, isPlainObject, fail } = require('../validation.js')

const REGISTRY_SCHEMA = 'project-cognition/verifier-registry/v1'

const normativeRegistry = (registry) => {
  const copy = JSON.parse(JSON.stringify(registry))
  delete copy.registry_hash
  return copy
}

const registryHash = (registry) => hashCanonical(normativeRegistry(registry))

const validatePolicy = (policy, label) => {
  if (!isPlainObject(policy)) fail(label, 'must be an object')
  allowedKeys(policy, ['kind', 'path', 'equals', 'patterns'], label)
  enumValue(policy.kind, ['tool_success', 'json_field_equals', 'text_excludes'], label + '.kind')
  if (policy.kind === 'tool_success') {
    if (policy.path !== undefined || policy.equals !== undefined || policy.patterns !== undefined) fail(label, 'tool_success accepts no additional fields')
  } else if (policy.kind === 'json_field_equals') {
    text(policy.path, label + '.path', { max: 200 })
    if (!/^[A-Za-z0-9_.-]+$/.test(policy.path)) fail(label + '.path', 'must be a simple dotted JSON path')
    if (!['string', 'number', 'boolean'].includes(typeof policy.equals) && policy.equals !== null) fail(label + '.equals', 'must be a JSON scalar')
    if (policy.patterns !== undefined) fail(label + '.patterns', 'is valid only for text_excludes')
  } else {
    if (policy.path !== undefined || policy.equals !== undefined) fail(label, 'text_excludes accepts only patterns')
    if (!Array.isArray(policy.patterns) || policy.patterns.length === 0) fail(label + '.patterns', 'must contain at least one literal marker')
    policy.patterns.forEach((pattern, index) => text(pattern, label + '.patterns[' + index + ']', { max: 500 }))
  }
}

const validateRegistry = (registry, options = {}) => {
  allowedKeys(registry, ['schema', 'revision', 'registry_hash', 'entries'], 'registry')
  if (registry.schema !== REGISTRY_SCHEMA) fail('registry.schema', 'must equal ' + REGISTRY_SCHEMA)
  positiveInteger(registry.revision, 'registry.revision')
  if (!Array.isArray(registry.entries)) fail('registry.entries', 'must be an array')
  registry.entries.forEach((entry, index) => {
    const label = 'registry.entries[' + index + ']'
    allowedKeys(entry, ['id', 'invocations', 'result_policy'], label)
    text(entry.id, label + '.id', { max: 128 })
    if (!/^[a-z][a-z0-9_.-]*$/.test(entry.id)) fail(label + '.id', 'must be a registry id')
    if (!Array.isArray(entry.invocations) || entry.invocations.length === 0) fail(label + '.invocations', 'must contain at least one frozen invocation')
    entry.invocations.forEach((invocation, invocationIndex) => {
      const invocationLabel = label + '.invocations[' + invocationIndex + ']'
      allowedKeys(invocation, ['tool_name', 'arguments', 'arguments_hash'], invocationLabel)
      text(invocation.tool_name, invocationLabel + '.tool_name', { max: 200 })
      if (!isPlainObject(invocation.arguments)) fail(invocationLabel + '.arguments', 'must be an object')
      text(invocation.arguments_hash, invocationLabel + '.arguments_hash', { max: 64 })
      if (!/^[a-f0-9]{64}$/.test(invocation.arguments_hash)) fail(invocationLabel + '.arguments_hash', 'must be a lowercase SHA-256 hex digest')
      if (argumentsHash(invocation.arguments) !== invocation.arguments_hash) fail(invocationLabel + '.arguments_hash', 'does not match canonical arguments')
    })
    const invocationKeys = new Set()
    for (const invocation of entry.invocations) {
      const key = invocation.tool_name + '\0' + invocation.arguments_hash
      if (invocationKeys.has(key)) fail(label + '.invocations', 'contains a duplicate frozen invocation')
      invocationKeys.add(key)
    }
    validatePolicy(entry.result_policy, label + '.result_policy')
  })
  uniqueBy(registry.entries, 'id', 'registry.entries')
  text(registry.registry_hash, 'registry.registry_hash', { max: 64 })
  if (!/^[a-f0-9]{64}$/.test(registry.registry_hash)) fail('registry.registry_hash', 'must be a lowercase SHA-256 hex digest')
  if (options.verifyHash !== false && registryHash(registry) !== registry.registry_hash) fail('registry.registry_hash', 'does not match canonical registry content')
  return registry
}

const sealRegistry = (draft) => {
  const sealed = JSON.parse(JSON.stringify(draft))
  for (const entry of sealed.entries || []) for (const invocation of entry.invocations || []) {
    const digest = argumentsHash(invocation.arguments)
    if (invocation.arguments_hash !== undefined && invocation.arguments_hash !== null && invocation.arguments_hash !== digest) fail('invocation.arguments_hash', 'does not match canonical arguments')
    invocation.arguments_hash = digest
  }
  sealed.registry_hash = registryHash(sealed)
  validateRegistry(sealed)
  return sealed
}

const argumentsHash = (rawArguments) => {
  const value = typeof rawArguments === 'string' ? JSON.parse(rawArguments) : rawArguments
  if (!isPlainObject(value)) fail('tool.arguments', 'must decode to an object')
  return hashCanonical(value)
}

const matchInvocation = (entry, toolName, rawArguments) => {
  const digest = argumentsHash(rawArguments)
  return entry.invocations.some((invocation) => invocation.tool_name === toolName && invocation.arguments_hash === digest)
}

const visitToolResultBlocks = (content, visitor) => {
  if (Array.isArray(content)) {
    for (const block of content) visitToolResultBlocks(block, visitor)
    return
  }
  if (!isPlainObject(content) || content.type !== 'tool-result') return
  visitor(content)
  visitToolResultBlocks(content.content, visitor)
}

const toolResultCallId = (event) => {
  const data = event && event.data
  const message = data && data.message
  const source = isPlainObject(message) && message.source
  const candidates = []
  const add = (value, label) => {
    if (value === undefined || value === null) return
    if (!['string', 'number'].includes(typeof value) || String(value).trim().length === 0) fail(label, 'must be a non-empty string or number')
    candidates.push({ id: String(value), label })
  }
  if (isPlainObject(data)) {
    add(data.callId, 'tool/result.data.callId')
    add(data.call_id, 'tool/result.data.call_id')
  }
  if (isPlainObject(message)) {
    add(message.callId, 'tool/result.data.message.callId')
    add(message.call_id, 'tool/result.data.message.call_id')
    add(message.toolCallId, 'tool/result.data.message.toolCallId')
    add(message.tool_call_id, 'tool/result.data.message.tool_call_id')
  }
  if (isPlainObject(source)) {
    add(source.callId, 'tool/result.data.message.source.callId')
    add(source.call_id, 'tool/result.data.message.source.call_id')
  }
  visitToolResultBlocks(isPlainObject(message) && message.content, (block) => {
    add(block.toolCallId, 'tool/result.data.message.content[].toolCallId')
    add(block.tool_call_id, 'tool/result.data.message.content[].tool_call_id')
  })
  const distinct = new Set(candidates.map((candidate) => candidate.id))
  if (distinct.size > 1) {
    fail('tool/result call ID', 'conflicting identifiers: ' + candidates.map((candidate) => candidate.label + '=' + JSON.stringify(candidate.id)).join(', '))
  }
  return candidates.length === 0 ? null : candidates[0].id
}

const contentText = (content) => {
  if (typeof content === 'string') return [content]
  if (Array.isArray(content)) return content.flatMap(contentText)
  if (!isPlainObject(content)) return []
  if (content.type === 'text' && typeof content.text === 'string') return [content.text]
  if (content.type === 'tool-result') return contentText(content.content)
  return []
}

const toolResultText = (event) => {
  const data = event && event.data
  const message = data && data.message
  if (isPlainObject(message)) {
    const rendered = contentText(message.content)
    if (rendered.length > 0) return rendered.join('\n')
  }
  if (typeof message === 'string') return message
  if (data && typeof data.text === 'string') return data.text
  return ''
}

const toolResultHasError = (event) => {
  const data = event && event.data
  const message = data && data.message
  if (isPlainObject(data) && (data.error || data.isError)) return true
  if (isPlainObject(message) && (message.error || message.isError)) return true
  let nestedError = false
  visitToolResultBlocks(isPlainObject(message) && message.content, (block) => {
    if (block.error || block.isError) nestedError = true
  })
  return nestedError
}

const valueAtPath = (value, dottedPath) => dottedPath.split('.').reduce((current, key) => current !== null && typeof current === 'object' ? current[key] : undefined, value)

const evaluateResult = (entry, resultEvent) => {
  if (!resultEvent || resultEvent.type !== 'tool/result') return { result: 'unknown', reason: 'paired tool result is missing' }
  if (toolResultHasError(resultEvent)) return { result: 'fail', reason: 'tool execution returned an error' }
  if (entry.result_policy.kind === 'tool_success') return { result: 'pass', reason: 'tool completed without a runtime error' }
  const raw = toolResultText(resultEvent).trim()
  if (entry.result_policy.kind === 'text_excludes') {
    if (raw.length === 0) return { result: 'unknown', reason: 'tool result has no non-empty rendered text to evaluate' }
    const found = entry.result_policy.patterns.find((pattern) => raw.includes(pattern))
    return found === undefined
      ? { result: 'pass', reason: 'none of the frozen failure markers appeared' }
      : { result: 'fail', reason: 'frozen failure marker appeared: ' + found }
  }
  let decoded
  try { decoded = JSON.parse(raw) } catch (error) { return { result: 'unknown', reason: 'tool result is not JSON required by the frozen policy' } }
  const actual = valueAtPath(decoded, entry.result_policy.path)
  return actual === entry.result_policy.equals
    ? { result: 'pass', reason: 'frozen JSON result policy matched' }
    : { result: 'fail', reason: 'frozen JSON result policy did not match' }
}

const verifyEvidence = (registry, verifierId, evidenceRefs, sessionEvents, beforeSequence = Infinity) => {
  validateRegistry(registry)
  const entry = registry.entries.find((candidate) => candidate.id === verifierId)
  if (!entry) fail('verifier_id', 'is not present in the frozen registry')
  if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0) return { result: 'unknown', diagnostics: ['no evidence reference was supplied'] }
  const calls = new Map()
  const results = new Map()
  for (const [index, event] of (sessionEvents || []).entries()) {
    const explicitSequence = Number.isFinite(event && event.seq) ? event.seq : Number.isFinite(event && event.sequence) ? event.sequence : null
    const sequence = explicitSequence === null ? 0 : explicitSequence
    if (sequence >= beforeSequence) continue
    if (event.type === 'tool/call' && event.data && event.data.callId) {
      const callId = String(event.data.callId)
      if (!calls.has(callId)) calls.set(callId, [])
      calls.get(callId).push({ event, index, sequence: explicitSequence })
    }
    if (event.type === 'tool/result') {
      const callId = toolResultCallId(event)
      if (callId !== null) {
        const normalized = String(callId)
        if (!results.has(normalized)) results.set(normalized, [])
        results.get(normalized).push({ event, index, sequence: explicitSequence })
      }
    }
  }
  const diagnostics = []
  const evaluated = []
  const referencedCallIds = new Set()
  let unresolved = false
  for (const ref of evidenceRefs) {
    if (typeof ref !== 'string' || ref.length === 0) {
      diagnostics.push('evidence reference must be a non-empty string')
      unresolved = true
      continue
    }
    const callId = String(ref).replace(/^tool:/, '')
    if (referencedCallIds.has(callId)) {
      diagnostics.push(ref + ': duplicate evidence reference for call ID ' + callId)
      unresolved = true
      continue
    }
    referencedCallIds.add(callId)
    const callCandidates = calls.get(callId) || []
    if (callCandidates.length === 0) {
      diagnostics.push(ref + ': no earlier tool/call event')
      unresolved = true
      continue
    }
    if (callCandidates.length !== 1) {
      diagnostics.push(ref + ': duplicate tool/call events for call ID ' + callId)
      unresolved = true
      continue
    }
    const resultCandidates = results.get(callId) || []
    if (resultCandidates.length > 1) {
      diagnostics.push(ref + ': duplicate tool/result events for call ID ' + callId)
      unresolved = true
      continue
    }
    const callRecord = callCandidates[0]
    const resultRecord = resultCandidates[0]
    if (resultRecord && (resultRecord.index <= callRecord.index || (callRecord.sequence !== null && resultRecord.sequence !== null && resultRecord.sequence <= callRecord.sequence))) {
      diagnostics.push(ref + ': tool/result event does not occur after its tool/call event')
      unresolved = true
      continue
    }
    const call = callRecord.event
    let matched = false
    try { matched = matchInvocation(entry, call.data.name, call.data.arguments) } catch (error) { diagnostics.push(ref + ': invalid tool arguments') }
    if (!matched) {
      diagnostics.push(ref + ': invocation does not match the frozen verifier')
      unresolved = true
      continue
    }
    const outcome = evaluateResult(entry, resultRecord && resultRecord.event)
    evaluated.push(outcome.result)
    diagnostics.push(ref + ': ' + outcome.reason)
    if (outcome.result === 'unknown') unresolved = true
  }
  if (unresolved || evaluated.length !== evidenceRefs.length) return { result: 'unknown', diagnostics }
  if (evaluated.includes('fail')) return { result: 'fail', diagnostics }
  if (evaluated.length > 0 && evaluated.every((result) => result === 'pass')) return { result: 'pass', diagnostics }
  return { result: 'unknown', diagnostics }
}

module.exports = {
  REGISTRY_SCHEMA,
  registryHash,
  validateRegistry,
  sealRegistry,
  argumentsHash,
  matchInvocation,
  toolResultCallId,
  toolResultText,
  toolResultHasError,
  evaluateResult,
  verifyEvidence,
}
