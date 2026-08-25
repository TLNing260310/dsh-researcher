'use strict'

const test = require('node:test')
const assert = require('node:assert')

const { assertModelVisibleParameters } = require('../evaluation/goal-governor-e1/visible-tool-contract.js')
const hostTool = require('../evaluation/goal-governor-e1/runner/e1-host-tool.js')

test('E1 accepts only model-visible object JSON Schemas, not legacy flat parameter maps', () => {
  assert.doesNotThrow(() => assertModelVisibleParameters({
    parameters: {
      type: 'object',
      properties: { attempt_id: { type: 'string' } },
      required: ['attempt_id'],
      additionalProperties: false,
    },
  }, 'begin_goal_attempt'))
  assert.throws(() => assertModelVisibleParameters({
    parameters: { attempt_id: { type: 'string', required: true } },
  }, 'begin_goal_attempt'), /parameters must be a JSON Schema object/)
  assert.throws(() => assertModelVisibleParameters({
    parameters: { type: 'object', properties: { attempt_id: { type: 'string', required: true } } },
  }, 'begin_goal_attempt'), /legacy nested required/)
})

test('the host-owned E1 verifier also exposes a strict empty object schema', () => {
  assert.deepEqual(hostTool.__test.EMPTY_PARAMETERS, {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  })
})

test('the E1 verifier exposes the host-issued call ID as a copyable evidence reference', () => {
  const result = hostTool.__test.attachEvidenceRef({ exit_code: 0 }, { callId: 'call-real-1' })
  assert.deepEqual(result, { exit_code: 0, evidence_ref: 'call-real-1' })
  assert.throws(() => hostTool.__test.attachEvidenceRef({ exit_code: 0 }, {}), /missing its DSH call ID/)
})
