'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { VERIFIED_DSH, DSH_NODE_RANGE, supportsDshNode, assertDshNodeSupported } = require('../lib/runtime-requirements.js')

test('DSH runtime pin and official Node range fail closed at unsupported gaps', () => {
  assert.equal(VERIFIED_DSH, '0.1.1-rc.2')
  assert.equal(DSH_NODE_RANGE, '^22.19.0 || >=24.0.0')
  assert.equal(supportsDshNode('v22.19.0'), true)
  assert.equal(supportsDshNode('v24.0.0'), true)
  assert.equal(supportsDshNode('v22.18.9'), false)
  assert.equal(supportsDshNode('v23.9.0'), false)
  assert.throws(() => assertDshNodeSupported('v23.9.0'), /requires Node/)
})
