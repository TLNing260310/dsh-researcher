'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { VERIFIED_DSH, FROZEN_E1_DSH, DSH_NODE_RANGE, supportsDshNode, assertDshNodeSupported } = require('../lib/runtime-requirements.js')

test('DSH runtime pin and official Node range fail closed at unsupported gaps', () => {
  assert.equal(VERIFIED_DSH, '0.1.5-rc.2')
  assert.equal(DSH_NODE_RANGE, '^22.19.0 || >=24.0.0')
  assert.equal(supportsDshNode('v22.19.0'), true)
  assert.equal(supportsDshNode('v24.0.0'), true)
  assert.equal(supportsDshNode('v22.18.9'), false)
  assert.equal(supportsDshNode('v23.9.0'), false)
  assert.throws(() => assertDshNodeSupported('v23.9.0'), /requires Node/)
})

test('the product runtime pin and the frozen E1 pin are separate concerns', () => {
  // The E1 pin is an already-frozen experimental condition (invariant I4). It
  // must not follow the product pin when the product moves to a newer DSH.
  assert.equal(FROZEN_E1_DSH, '0.1.1-rc.2')
  assert.notEqual(FROZEN_E1_DSH, VERIFIED_DSH)

  const { validateManifest } = require('../evaluation/goal-governor-e1/score-e1.js')
  const fs = require('node:fs')
  const path = require('node:path')
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'evaluation', 'goal-governor-e1', 'manifest.json'), 'utf8'))
  assert.equal(manifest.runtime.version, FROZEN_E1_DSH)
  assert.deepEqual(validateManifest(manifest), [])
})
