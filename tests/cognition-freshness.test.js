'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { fingerprintFiles, validateSources } = require('../scripts/check-cognition-freshness.js')

const root = path.join(__dirname, '..')

test('evidence file-set fingerprints are order independent and path bound', () => {
  const files = ['docs/goal-governor-evaluation-protocol.md', 'evaluation/goal-governor-e1/manifest.json']
  assert.equal(fingerprintFiles(files, root), fingerprintFiles([...files].reverse(), root))
  assert.throws(() => fingerprintFiles(['../outside'], root), /stay inside/)
})

test('evidence source manifest rejects missing required mappings', () => {
  assert.throws(() => validateSources({ schema: 'dsh-researcher/evidence-sources/v1', required_fresh: ['E11'], entries: [] }), /no source entry/)
})

test('canonical required evidence is fresh', () => {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'check-cognition-freshness.js')], { cwd: root, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr + result.stdout)
  const report = JSON.parse(result.stdout)
  assert.equal(report.ok, true)
  assert.deepEqual(report.required_fresh, ['E11', 'E12', 'E13', 'E14', 'E15', 'E16', 'E17'])
})
