'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.join(__dirname, '..')
const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(root, ...parts), 'utf8'))

test('adapter discovery is version locked, offline checked, and non-product', () => {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'check-adapter-discovery.js')], { cwd: root, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr + result.stdout)
  const report = JSON.parse(result.stdout)
  assert.equal(report.model_calls, 0)
  assert.equal(report.network_calls, 0)
  assert.deepEqual(report.records, [
    { client: 'claude-code-agent-sdk', version: '0.3.251', result: 'HOLD' },
    { client: 'codex-app-server-stdio', version: '0.150.0-alpha.12.2', result: 'HOLD' },
  ])
})

test('Codex discovery is scoped to app-server stdio and captures no model traffic', () => {
  const base = ['evaluation', 'adapter-discovery', 'codex-app-server-stdio', '0.150.0-alpha.12.2']
  const discovery = readJson(...base, 'discovery.json')
  const trace = readJson(...base, 'native-trace.json')
  assert.match(discovery.surface, /app-server --stdio/)
  assert.match(discovery.claim_boundary, /No Codex adapter/)
  assert.equal(trace.capture_kind, 'live-no-model')
  assert.equal(trace.model_calls, 0)
  assert.deepEqual(trace.requests.map((item) => item.method), ['initialize', 'initialized', 'thread/list'])
  assert.equal(discovery.capabilities.write_boundary.status, 'UNKNOWN')
})

test('Claude discovery refuses to fabricate a trace from package types', () => {
  const base = ['evaluation', 'adapter-discovery', 'claude-code-agent-sdk', '0.3.251']
  const discovery = readJson(...base, 'discovery.json')
  const trace = readJson(...base, 'native-trace.json')
  assert.equal(trace.capture_kind, 'not-captured')
  assert.equal(trace.model_calls, 0)
  assert.match(trace.reason, /not installed/)
  assert.equal(discovery.result, 'HOLD')
  assert.match(discovery.claim_boundary, /No Claude Code adapter/)
})

test('both discoveries preserve function-call and persistent-mode semantics', () => {
  for (const [client, version] of [['codex-app-server-stdio', '0.150.0-alpha.12.2'], ['claude-code-agent-sdk', '0.3.251']]) {
    const discovery = readJson('evaluation', 'adapter-discovery', client, version, 'discovery.json')
    assert.deepEqual(discovery.invocation.function_call, ['researcher.ask', 'researcher.mode.set', 'researcher.mode.get'])
  }
})
