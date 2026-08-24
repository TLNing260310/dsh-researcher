'use strict'

const { hashCanonical } = require('../../lib/canonical-json.js')

const COST_ADMISSION_SCHEMA = 'dsh-researcher/model-cost-admission/v1'
const COST_POLICY_SCHEMA = 'dsh-researcher/model-cost-policy/v1'
const DAY_MS = 24 * 60 * 60 * 1000
const EXPECTED_POLICY_KEYS = Object.freeze([
  'local',
  'remote',
  'restricted_weekdays',
  'restricted_windows',
  'schema',
  'timezone',
  'unknown_route',
  'utc_offset_minutes',
])
const EXPECTED_MODEL_KEYS = Object.freeze(['base_url', 'model', 'provider', 'reasoning_effort', 'route'])

const codedError = (code, message) => {
  const error = new Error(message)
  error.code = code
  return error
}

const fail = (code, message) => { throw codedError(code, message) }
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
const sortedKeys = (value) => Object.keys(value).sort()
const sameKeys = (value, expected) => JSON.stringify(sortedKeys(value)) === JSON.stringify([...expected].sort())
const requireExactKeys = (value, expected, label, code = 'INVALID_POLICY') => {
  if (!isPlainObject(value) || !sameKeys(value, expected)) fail(code, label + ' must contain exactly: ' + expected.join(', '))
}
const requireNonemptyString = (value, label, code) => {
  if (typeof value !== 'string' || value.trim() === '') fail(code, label + ' must be a non-empty string')
  return value
}

const validateCostPolicy = (policy) => {
  requireExactKeys(policy, EXPECTED_POLICY_KEYS, 'cost policy')
  if (policy.schema !== COST_POLICY_SCHEMA) fail('INVALID_POLICY', 'cost policy schema is not supported')
  if (policy.timezone !== 'Asia/Shanghai' || policy.utc_offset_minutes !== 480) fail('INVALID_POLICY', 'cost policy must use the frozen Asia/Shanghai +08:00 clock')
  if (JSON.stringify(policy.restricted_weekdays) !== JSON.stringify([1, 2, 3, 4, 5])) fail('INVALID_POLICY', 'cost policy restricted weekdays drifted')
  if (!Array.isArray(policy.restricted_windows) || policy.restricted_windows.length !== 2) fail('INVALID_POLICY', 'cost policy restricted windows drifted')
  const expectedWindows = [['09:00', '12:00'], ['14:00', '18:00']]
  for (let index = 0; index < expectedWindows.length; index++) {
    const window = policy.restricted_windows[index]
    requireExactKeys(window, ['end', 'start'], 'restricted window ' + index)
    if (window.start !== expectedWindows[index][0] || window.end !== expectedWindows[index][1]) fail('INVALID_POLICY', 'cost policy restricted window ' + index + ' drifted')
  }
  requireExactKeys(policy.remote, ['base_url', 'model', 'provider', 'route'], 'remote cost route')
  if (policy.remote.route !== 'deepseek-api' || policy.remote.provider !== 'deepseek-official' || policy.remote.model !== 'deepseek-v4-flash' || policy.remote.base_url !== 'https://api.deepseek.com') fail('INVALID_POLICY', 'remote cost route must be the frozen official DeepSeek flash route and base_url')
  requireExactKeys(policy.local, ['endpoint_assurance', 'provider', 'route'], 'local cost route')
  if (policy.local.route !== 'local-loopback' || policy.local.provider !== 'deepseek-official' || policy.local.endpoint_assurance !== 'resolved-adapter-base-url-loopback') fail('INVALID_POLICY', 'local cost route must require the official DeepSeek adapter and resolved loopback base_url assurance')
  if (policy.unknown_route !== 'deny') fail('INVALID_POLICY', 'unknown cost routes must be denied')
  return policy
}

const validateLoopbackBaseUrl = (baseUrl) => {
  if (typeof baseUrl !== 'string' || baseUrl.trim() === '' || baseUrl !== baseUrl.trim()) fail('LOCAL_BASE_URL_INVALID', 'local model base_url must be a non-empty string without surrounding whitespace')
  if (baseUrl.endsWith('/')) fail('LOCAL_BASE_URL_INVALID', 'local model base_url must not have a trailing slash')
  const match = baseUrl.match(/^(https?):\/\/(127(?:\.(?:0|[1-9][0-9]{0,2})){3}|\[::1\]):([1-9][0-9]{0,4})(\/[^?#]*)?$/)
  if (!match) fail('LOCAL_BASE_URL_INVALID', 'local model base_url must be an explicit-port HTTP(S) literal 127/8 or [::1] URL without authentication, query, or fragment')
  const host = match[2]
  const port = Number(match[3])
  const basePath = match[4] || ''
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) fail('LOCAL_BASE_URL_INVALID', 'local model base_url port is invalid')
  let loopback = host === '[::1]'
  if (!loopback) {
    const octets = host.split('.')
    loopback = octets.length === 4 && octets.every((octet) => /^(?:0|[1-9][0-9]{0,2})$/.test(octet) && Number(octet) <= 255) && Number(octets[0]) === 127
  }
  if (!loopback) fail('LOCAL_BASE_URL_INVALID', 'local model base_url must use a literal 127/8 or [::1] address')
  try {
    const parsed = new URL(baseUrl)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username !== '' || parsed.password !== '' || parsed.pathname !== (basePath || '/') || parsed.search !== '' || parsed.hash !== '') throw new Error('not canonical')
  } catch (_) {
    fail('LOCAL_BASE_URL_INVALID', 'local model base_url is not a canonical loopback URL')
  }
  return baseUrl
}

const validateModelRoute = (model, policy) => {
  validateCostPolicy(policy)
  requireExactKeys(model, EXPECTED_MODEL_KEYS, 'model route', 'INVALID_MODEL_ROUTE')
  const route = requireNonemptyString(model.route, 'model route.route', 'INVALID_MODEL_ROUTE')
  const provider = requireNonemptyString(model.provider, 'model route.provider', 'INVALID_MODEL_ROUTE')
  const modelName = requireNonemptyString(model.model, 'model route.model', 'INVALID_MODEL_ROUTE')
  const reasoningEffort = requireNonemptyString(model.reasoning_effort, 'model route.reasoning_effort', 'INVALID_MODEL_ROUTE')
  const baseUrl = requireNonemptyString(model.base_url, 'model route.base_url', 'INVALID_MODEL_ROUTE')
  if (route === policy.remote.route) {
    if (provider !== policy.remote.provider || modelName !== policy.remote.model || baseUrl !== policy.remote.base_url) fail('REMOTE_FLASH_REQUIRED', 'remote execution requires the exact official DeepSeek flash model and base_url')
    return { route, provider, model: modelName, reasoning_effort: reasoningEffort, base_url: baseUrl }
  }
  if (route === policy.local.route) {
    if (provider !== policy.local.provider) fail('LOCAL_PROVIDER_INVALID', 'local execution must use the frozen official DeepSeek adapter')
    validateLoopbackBaseUrl(baseUrl)
    return { route, provider, model: modelName, reasoning_effort: reasoningEffort, base_url: baseUrl }
  }
  fail('UNKNOWN_MODEL_ROUTE', 'model route is not admitted by the cost policy')
}

const parseClock = (now) => {
  if (now instanceof Date) {
    if (!Number.isFinite(now.getTime())) fail('INVALID_CLOCK', 'clock is invalid')
    return new Date(now.getTime())
  }
  if (typeof now !== 'string') fail('INVALID_CLOCK', 'clock must be a Date or an ISO timestamp with an explicit offset')
  const match = now.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/)
  if (!match) fail('INVALID_CLOCK', 'clock must be a Date or an ISO timestamp with an explicit offset')
  const fields = match.slice(1, 7).map(Number)
  const milliseconds = Number((match[7] || '').padEnd(3, '0') || 0)
  const offsetHours = match[8] === 'Z' ? 0 : Number(match[10])
  const offsetRemainder = match[8] === 'Z' ? 0 : Number(match[11])
  if (fields[3] > 23 || fields[4] > 59 || fields[5] > 59 || offsetHours > 23 || offsetRemainder > 59) fail('INVALID_CLOCK', 'clock contains an out-of-range component')
  const parsed = new Date(now)
  if (!Number.isFinite(parsed.getTime())) fail('INVALID_CLOCK', 'clock is invalid')
  const offsetSign = match[9] === '-' ? -1 : 1
  const offsetMinutes = match[8] === 'Z' ? 0 : offsetSign * (offsetHours * 60 + offsetRemainder)
  const local = new Date(parsed.getTime() + offsetMinutes * 60 * 1000)
  const roundTrip = [local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate(), local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds()]
  if (roundTrip.some((value, index) => value !== fields[index]) || local.getUTCMilliseconds() !== milliseconds) fail('INVALID_CLOCK', 'clock contains an impossible calendar value')
  return parsed
}

const pad = (value, width = 2) => String(value).padStart(width, '0')
const beijingParts = (instant, offsetMinutes) => {
  const shifted = new Date(instant.getTime() + offsetMinutes * 60 * 1000)
  const nativeWeekday = shifted.getUTCDay()
  return {
    local_day_index: Math.floor(shifted.getTime() / DAY_MS),
    beijing_local: `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}.${pad(shifted.getUTCMilliseconds(), 3)}+08:00`,
    weekday: nativeWeekday === 0 ? 7 : nativeWeekday,
    minute_of_day: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  }
}

const windowMinutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
const windowAt = (localDayIndex, window, offsetMinutes) => {
  const localMidnightUtc = localDayIndex * DAY_MS - offsetMinutes * 60 * 1000
  return {
    start: localMidnightUtc + windowMinutes(window.start) * 60 * 1000,
    end: localMidnightUtc + windowMinutes(window.end) * 60 * 1000,
  }
}
const weekdayAtLocalDay = (localDayIndex) => {
  const native = new Date(localDayIndex * DAY_MS).getUTCDay()
  return native === 0 ? 7 : native
}
const overlapsRestrictedWindow = (startMs, endMs, localDayIndex, policy) => {
  if (endMs - startMs >= 7 * DAY_MS) return true
  const endLocalDay = Math.floor((endMs + policy.utc_offset_minutes * 60 * 1000) / DAY_MS)
  for (let day = localDayIndex; day <= endLocalDay; day++) {
    if (!policy.restricted_weekdays.includes(weekdayAtLocalDay(day))) continue
    for (const window of policy.restricted_windows) {
      const interval = windowAt(day, window, policy.utc_offset_minutes)
      if (startMs < interval.end && endMs > interval.start) return true
    }
  }
  return false
}
const nextRestrictedStart = (startMs, localDayIndex, policy) => {
  for (let day = localDayIndex; day <= localDayIndex + 7; day++) {
    if (!policy.restricted_weekdays.includes(weekdayAtLocalDay(day))) continue
    for (const window of policy.restricted_windows) {
      const candidate = windowAt(day, window, policy.utc_offset_minutes).start
      if (candidate >= startMs) return new Date(candidate).toISOString()
    }
  }
  return null
}

const safeModelEvidence = (model) => {
  if (!isPlainObject(model)) return null
  const evidence = {}
  for (const key of ['route', 'provider', 'model', 'reasoning_effort', 'base_url']) if (typeof model[key] === 'string') evidence[key] = model[key]
  return evidence
}

const evaluateCostAdmission = ({ policy, model, now, reservationSec, phase } = {}) => {
  let policyHash = null
  try { policyHash = hashCanonical(policy) } catch (_) { /* invalid policy is denied below */ }
  const evidence = {
    schema: COST_ADMISSION_SCHEMA,
    phase: typeof phase === 'string' && phase.trim() !== '' ? phase : null,
    decision: 'DENY',
    reason_codes: [],
    evaluated_at_utc: null,
    beijing_local: null,
    weekday: null,
    minute_of_day: null,
    reservation_sec: Number.isSafeInteger(reservationSec) ? reservationSec : null,
    model: safeModelEvidence(model),
    policy_hash: policyHash,
    next_restricted_start_utc: null,
  }
  try {
    validateCostPolicy(policy)
  } catch (error) {
    evidence.reason_codes.push(error.code || 'INVALID_POLICY')
    return evidence
  }
  if (evidence.phase === null) {
    evidence.reason_codes.push('INVALID_PHASE')
    return evidence
  }
  let instant
  try { instant = parseClock(now) } catch (error) {
    evidence.reason_codes.push(error.code || 'INVALID_CLOCK')
    return evidence
  }
  evidence.evaluated_at_utc = instant.toISOString()
  const local = beijingParts(instant, policy.utc_offset_minutes)
  evidence.beijing_local = local.beijing_local
  evidence.weekday = local.weekday
  evidence.minute_of_day = local.minute_of_day
  evidence.next_restricted_start_utc = nextRestrictedStart(instant.getTime(), local.local_day_index, policy)
  if (!Number.isSafeInteger(reservationSec) || reservationSec <= 0 || !Number.isFinite(instant.getTime() + reservationSec * 1000)) {
    evidence.reason_codes.push('INVALID_RESERVATION')
    return evidence
  }
  const endMs = instant.getTime() + reservationSec * 1000
  if (!Number.isFinite(endMs) || endMs > 8640000000000000) {
    evidence.reason_codes.push('INVALID_RESERVATION')
    return evidence
  }
  let normalized
  try { normalized = validateModelRoute(model, policy) } catch (error) {
    evidence.reason_codes.push(error.code || 'INVALID_MODEL_ROUTE')
    return evidence
  }
  evidence.model = normalized
  if (normalized.route === policy.local.route) {
    evidence.decision = 'ALLOW'
    evidence.reason_codes.push('LOCAL_LOOPBACK_ALLOWED')
    return evidence
  }
  if (overlapsRestrictedWindow(instant.getTime(), endMs, local.local_day_index, policy)) {
    evidence.reason_codes.push('REMOTE_RESTRICTED_WINDOW_OVERLAP')
    return evidence
  }
  evidence.decision = 'ALLOW'
  evidence.reason_codes.push('REMOTE_FLASH_ALLOWED')
  return evidence
}

const assertCostAdmission = (options) => {
  const evidence = evaluateCostAdmission(options)
  if (evidence.decision !== 'ALLOW') {
    const error = codedError('COST_ADMISSION_DENIED', 'model cost admission denied: ' + evidence.reason_codes.join(', '))
    error.evidence = evidence
    throw error
  }
  return evidence
}

module.exports = {
  COST_ADMISSION_SCHEMA,
  validateCostPolicy,
  validateModelRoute,
  validateLoopbackBaseUrl,
  evaluateCostAdmission,
  assertCostAdmission,
}
