// Handoff schema v1: the documented example must stay valid.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'handoff-schema.md'), 'utf8')
const jsonBlock = doc.match(/```json\n([\s\S]*?)```/)[1]

test('handoff example parses and satisfies schema v1', () => {
  const parsed = JSON.parse(jsonBlock)
  assert.equal(parsed.schema, 'dsh-researcher/handoff/v1')
  assert.equal(typeof parsed.run, 'string')
  assert.equal(parsed.certificate, 'SAFE')
  assert.ok(Array.isArray(parsed.build_items))
  assert.ok(parsed.build_items.length > 0)
  for (const item of parsed.build_items) {
    assert.equal(typeof item.id, 'string')
    assert.equal(typeof item.problem, 'string')
    assert.ok(Array.isArray(item.evidence) && item.evidence.length > 0)
    assert.equal(typeof item.confidence, 'number')
    assert.ok(item.confidence >= 0 && item.confidence <= 1)
    assert.equal(typeof item.scope, 'string')
    assert.ok(Array.isArray(item.do_not_touch))
  }
})

test('benchmark ground truths are valid', () => {
  const lib = require('../fixtures/benchmark/lib.js')
  const fsSync = require('node:fs')
  const os = require('node:os')
  const tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), 'dshr-bench-'))
  lib.architectureDrift(path.join(tmp, 'architecture-drift'))
  lib.documentationDrift(path.join(tmp, 'documentation-drift'))
  lib.falseProgress(path.join(tmp, 'false-progress'))
  for (const name of ['architecture-drift', 'documentation-drift', 'false-progress']) {
    const gt = JSON.parse(fsSync.readFileSync(path.join(tmp, name, 'ground-truth.json'), 'utf8'))
    assert.equal(gt.schema, 'dsh-researcher/benchmark/v1')
    assert.equal(gt.case, name)
    assert.ok(gt.required.length >= 3)
    for (const item of gt.required) {
      assert.equal(typeof item.marker, 'string')
      assert.equal(typeof item.subject, 'string')
    }
    assert.ok(fsSync.existsSync(path.join(tmp, name, 'expected-result.md')))
  }
  fsSync.rmSync(tmp, { recursive: true, force: true })
})
