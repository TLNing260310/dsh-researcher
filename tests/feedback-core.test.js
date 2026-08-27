// Feedback core tests: metrics extraction and redaction must be deterministic
// and must never leak prompt/path content.
const test = require('node:test')
const assert = require('node:assert')
const { buildBundle, extractMetrics, redactEvidence, validateBundle } = require('../lib/feedback-core.js')

const SESSION_EVENTS = [
  { type: 'session', agentPreset: 'researcher', time: 1000 },
  { type: 'permission/preset', time: 1001, data: { preset: 'read-only' } },
  {
    type: 'tool/call', time: 2000,
    data: { name: 'research_doctor', callId: 'c1', arguments: '{}' },
  },
  {
    type: 'tool/result', time: 2001,
    data: { callId: 'c1', content: [{ type: 'text', text: 'Researcher Runtime Certificate\nOverall: SAFE' }], isError: false },
  },
  {
    type: 'tool/call', time: 3000,
    data: {
      name: 'research_checkpoint', callId: 'c2',
      arguments: JSON.stringify({
        phase: 'EVIDENCE_MAP',
        revise: [
          { id: 'C1', statement: 'claims X', tier: 'C1', verdict: 'Known', evidence: ['C:/secret/absolute/path/src/a.ts:10'], confidence: 0.8 },
          { id: 'C2', statement: 'claims Y', tier: 'C0', verdict: 'Claimed', evidence: ['docs/b.md'], confidence: 0.4 },
        ],
        hypotheses: [{ id: 'H1', statement: 'hyp', status: 'active', dependsOn: ['C1'] }],
      }),
    },
  },
  {
    type: 'tool/call', time: 4000,
    data: {
      name: 'research_checkpoint', callId: 'c3',
      arguments: JSON.stringify({ phase: 'CHALLENGE', revise: [{ id: 'C1', statement: 'revised', tier: 'C1', verdict: 'Contradicted', evidence: ['src/a.ts'] }] }),
    },
  },
  { type: 'assistant/message', time: 5000, data: { content: '最终建议：INVESTIGATE。证据台账已附。' } },
]

test('level 1 metrics are anonymous: no prompts, no paths, no statements', () => {
  const bundle = buildBundle(SESSION_EVENTS)
  const text = JSON.stringify(bundle)
  assert.equal(bundle.level, 1)
  assert.ok(!text.includes('secret'))
  assert.ok(!text.includes('claims X'))
  assert.ok(!text.includes('claims Y'))
  assert.ok(!text.includes('C:/secret'))
  assert.equal(bundle.metrics.preset, 'researcher')
  assert.equal(bundle.metrics.permission, 'read-only')
  assert.equal(bundle.metrics.certificate, 'SAFE')
  assert.equal(bundle.metrics.session_duration_sec, 4)
  assert.equal(bundle.metrics.claims_created, 2)
  assert.equal(bundle.metrics.claims_revised, 1)
  assert.equal(bundle.metrics.decision, 'INVESTIGATE')
  assert.equal(bundle.metrics.session_completed, false)
  assert.equal(bundle.metrics.goal_decision, null)
  assert.equal(bundle.metrics.tool_calls.research_doctor, 1)
  assert.equal(bundle.metrics.tool_calls.research_checkpoint, 2)
})

test('level 2 adds redacted claims: statements kept, evidence reduced to basenames', () => {
  const bundle = buildBundle(SESSION_EVENTS, { includeClaims: true })
  assert.equal(bundle.level, 2)
  assert.equal(bundle.claims.length, 2)
  const c1 = bundle.claims.find((c) => c.id === 'C1')
  assert.equal(c1.verdict, 'Contradicted')
  assert.equal(c1.confidence, 0.8)
  assert.deepEqual(c1.evidence_basenames, ['a.ts'])
  const text = JSON.stringify(bundle)
  assert.ok(!text.includes('C:/secret'))
  assert.ok(!text.includes('absolute/path'))
})

test('redactEvidence handles garbage and caps length', () => {
  assert.deepEqual(redactEvidence(null), [])
  assert.deepEqual(redactEvidence(['a/b/c.ts:10', 42, 'x']), ['c.ts:10', '42', 'x'])
})

test('feedback validator accepts generated bundles and rejects sensitive fields', () => {
  const bundle = buildBundle(SESSION_EVENTS)
  assert.deepEqual(validateBundle(bundle), [])
  assert.match(validateBundle({ ...bundle, transcript: 'private' }).join('\n'), /forbidden sensitive field/)
  assert.match(validateBundle({ ...bundle, level: 1, claims: [] }).join('\n'), /Level 1 bundles must not contain claims/)
})

test('completion comes only from a terminal goal decision event', () => {
  const proseOnly = extractMetrics([
    { type: 'assistant/message', data: { content: '研究报告 Project Model 证据台账' } },
  ])
  assert.equal(proseOnly.session_completed, false)

  const done = extractMetrics([
    { type: 'project-cognition/goal-decision', data: { decision: 'DONE' } },
  ])
  assert.equal(done.goal_decision, 'DONE')
  assert.equal(done.session_completed, true)

  const stopped = extractMetrics([
    { type: 'project-cognition/goal-decision', data: { decision: 'STOPPED' } },
  ])
  assert.equal(stopped.session_completed, false)

  const dshDone = extractMetrics([
    { type: 'tool/call', data: { callId: 'g1', name: 'request_goal_decision', arguments: '{}' } },
    { type: 'tool/result', data: { message: { callId: 'g1', content: [{ type: 'text', text: '{"decision":"DONE","reason":"trusted"}' }] } } },
  ])
  assert.equal(dshDone.goal_decision, 'DONE')
  assert.equal(dshDone.session_completed, true)

  const fakeAssistant = extractMetrics([
    { type: 'assistant/message', data: { content: '{"decision":"DONE"}' } },
  ])
  assert.equal(fakeAssistant.session_completed, false)
})

test("DON'T BUILD is not also counted as BUILD", () => {
  const metrics = extractMetrics([
    { type: 'assistant/message', data: { content: "Decision: DON'T BUILD" } },
  ])
  assert.equal(metrics.decision, "DON'T_BUILD")
})
