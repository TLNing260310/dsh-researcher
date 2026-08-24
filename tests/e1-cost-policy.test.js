'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  COST_ADMISSION_SCHEMA,
  validateCostPolicy,
  validateModelRoute,
  validateLoopbackBaseUrl,
  evaluateCostAdmission,
  assertCostAdmission,
} = require('../evaluation/goal-governor-e1/cost-policy.js')
const { deriveChildTimeout } = require('../evaluation/goal-governor-e1/run-e1.js')

const policy = {
  schema: 'dsh-researcher/model-cost-policy/v1',
  timezone: 'Asia/Shanghai',
  utc_offset_minutes: 480,
  restricted_weekdays: [1, 2, 3, 4, 5],
  restricted_windows: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
  remote: { route: 'deepseek-api', provider: 'deepseek-official', model: 'deepseek-v4-flash', base_url: 'https://api.deepseek.com' },
  local: { route: 'local-loopback', provider: 'deepseek-official', endpoint_assurance: 'resolved-adapter-base-url-loopback' },
  unknown_route: 'deny',
}
const remote = { route: 'deepseek-api', provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoning_effort: 'low', base_url: 'https://api.deepseek.com' }
const at = (beijingLocal, reservationSec = 1, model = remote) => evaluateCostAdmission({
  policy,
  model,
  now: beijingLocal + '+08:00',
  reservationSec,
  phase: 'test',
})

test('the frozen policy and admission evidence schemas are distinct and stable', () => {
  assert.equal(COST_ADMISSION_SCHEMA, 'dsh-researcher/model-cost-admission/v1')
  assert.equal(validateCostPolicy(policy), policy)
  assert.deepEqual(validateModelRoute(remote, policy), remote)
  assert.throws(() => validateCostPolicy({ ...policy, timezone: 'UTC' }), /Asia\/Shanghai/)
  assert.throws(() => validateCostPolicy({ ...policy, extra: true }), /exactly/)
})

test('weekday morning reservations use half-open restricted windows', () => {
  assert.equal(at('2026-08-24T08:43:00', 960).decision, 'ALLOW')
  assert.equal(at('2026-08-24T08:44:00', 960).decision, 'ALLOW')
  assert.equal(at('2026-08-24T08:45:00', 900).decision, 'ALLOW')
  assert.equal(at('2026-08-24T08:45:00', 960).decision, 'DENY')
  assert.equal(at('2026-08-24T08:44:01', 960).decision, 'DENY')
  assert.equal(at('2026-08-24T09:00:00').decision, 'DENY')
  assert.equal(at('2026-08-24T11:59:00').decision, 'DENY')
  assert.equal(at('2026-08-24T12:00:00').decision, 'ALLOW')
})

test('weekday afternoon reservations use half-open restricted windows', () => {
  assert.equal(at('2026-08-24T13:44:00', 960).decision, 'ALLOW')
  assert.equal(at('2026-08-24T13:44:01', 960).decision, 'DENY')
  assert.equal(at('2026-08-24T14:00:00').decision, 'DENY')
  assert.equal(at('2026-08-24T18:00:00').decision, 'ALLOW')
})

test('weekends have no time restriction but remote execution remains flash-only', () => {
  const saturday = at('2026-08-29T10:00:00', 60)
  const sunday = at('2026-08-30T15:00:00', 60)
  assert.equal(saturday.decision, 'ALLOW')
  assert.equal(saturday.weekday, 6)
  assert.equal(sunday.decision, 'ALLOW')
  assert.equal(sunday.weekday, 7)
  const pro = { ...remote, model: 'deepseek-v4-pro' }
  assert.equal(at('2026-08-29T10:00:00', 60, pro).decision, 'DENY')
  assert.ok(at('2026-08-29T10:00:00', 60, pro).reason_codes.includes('REMOTE_FLASH_REQUIRED'))
})

test('local execution requires the official adapter and a literal explicit-port loopback base_url', () => {
  for (const baseUrl of ['http://127.0.0.1:11434', 'https://127.255.1.2:443/api/v1', 'http://[::1]:8080/v1', 'http://127.0.0.1:65535']) {
    const local = { route: 'local-loopback', provider: 'deepseek-official', model: 'fixture', reasoning_effort: 'none', base_url: baseUrl }
    assert.equal(at('2026-08-24T10:00:00', 60, local).decision, 'ALLOW')
  }
  for (const baseUrl of [
    'http://localhost:11434',
    'http://192.168.1.2:11434',
    'http://user:pass@127.0.0.1:11434',
    'http://127.0.0.1',
    'http://127.0.0.1:0',
    'http://127.0.0.1:65536',
    'http://127.0.0.1:11434/',
    'http://127.0.0.1:11434/v1/',
    'http://127.0.0.1:11434?key=value',
    'http://127.0.0.1:11434#fragment',
    'http://127.256.0.1:11434',
    'http://127.00.0.1:11434',
    'http://[::2]:11434',
    'ws://127.0.0.1:11434',
    ' http://127.0.0.1:11434',
  ]) {
    const local = { route: 'local-loopback', provider: 'deepseek-official', model: 'fixture', reasoning_effort: 'none', base_url: baseUrl }
    const result = at('2026-08-24T10:00:00', 60, local)
    assert.equal(result.decision, 'DENY', baseUrl)
    assert.ok(result.reason_codes.includes('LOCAL_BASE_URL_INVALID'), baseUrl)
  }
  const wrongProvider = { route: 'local-loopback', provider: 'local', model: 'fixture', reasoning_effort: 'none', base_url: 'http://127.0.0.1:11434' }
  assert.ok(at('2026-08-24T10:00:00', 60, wrongProvider).reason_codes.includes('LOCAL_PROVIDER_INVALID'))
})

test('invalid and ambiguous clocks fail closed', () => {
  for (const now of ['2026-08-24T08:00:00', '2026-02-30T08:00:00+08:00', '2026-08-24T25:00:00+08:00', 'not-a-time', new Date(Number.NaN), 1787539200000]) {
    const result = evaluateCostAdmission({ policy, model: remote, now, reservationSec: 60, phase: 'test' })
    assert.equal(result.decision, 'DENY')
    assert.ok(result.reason_codes.includes('INVALID_CLOCK'))
  }
  const result = evaluateCostAdmission({ policy, model: remote, now: '2026-08-24T08:00:00+08:00', reservationSec: 0, phase: 'test' })
  assert.equal(result.decision, 'DENY')
  assert.ok(result.reason_codes.includes('INVALID_RESERVATION'))
})

test('base_url has one exact spelling and remote overrides fail closed', () => {
  assert.equal(validateLoopbackBaseUrl('http://127.0.0.1:1/v1'), 'http://127.0.0.1:1/v1')
  assert.throws(() => validateModelRoute({ ...remote, endpoint: null }, policy), /exactly/)
  assert.throws(() => validateModelRoute({ ...remote, base_url: 'https://api.deepseek.com/v1' }, policy), /exact official DeepSeek flash model and base_url/)
})

test('admission evidence is complete and assertCostAdmission carries denied evidence', () => {
  const allowed = at('2026-08-24T08:00:00', 60)
  assert.equal(allowed.schema, COST_ADMISSION_SCHEMA)
  assert.equal(allowed.evaluated_at_utc, '2026-08-24T00:00:00.000Z')
  assert.equal(allowed.beijing_local, '2026-08-24T08:00:00.000+08:00')
  assert.equal(allowed.minute_of_day, 480)
  assert.match(allowed.policy_hash, /^[a-f0-9]{64}$/)
  assert.equal(allowed.next_restricted_start_utc, '2026-08-24T01:00:00.000Z')
  assert.equal(assertCostAdmission({ policy, model: remote, now: '2026-08-24T08:00:00+08:00', reservationSec: 60, phase: 'test' }).decision, 'ALLOW')
  assert.throws(
    () => assertCostAdmission({ policy, model: remote, now: '2026-08-24T09:00:00+08:00', reservationSec: 60, phase: 'test' }),
    (error) => error.code === 'COST_ADMISSION_DENIED' && error.evidence.decision === 'DENY',
  )
})

test('the live child timeout is shortened against the absolute pre-spawn deadline', () => {
  const admission = at('2026-08-24T08:44:00', 960)
  assert.equal(admission.decision, 'ALLOW')
  const admittedAt = Date.parse(admission.evaluated_at_utc)
  assert.deepEqual(deriveChildTimeout(admission, admittedAt, 900000), {
    deadline_ms: Date.parse('2026-08-24T01:00:00.000Z'),
    deadline_utc: '2026-08-24T01:00:00.000Z',
    timeout_ms: 900000,
  })
  assert.equal(deriveChildTimeout(admission, admittedAt + 500, 900000).timeout_ms, 900000)
  assert.equal(deriveChildTimeout(admission, admittedAt + 60000, 900000).timeout_ms, 899000)
  assert.throws(() => deriveChildTimeout(admission, Date.parse('2026-08-24T00:59:59.000Z'), 900000), /COST_ADMISSION_EXPIRED/)
})
