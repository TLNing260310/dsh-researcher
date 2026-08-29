'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.join(__dirname, '..')
const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(root, ...parts), 'utf8'))
const { sanitizedEnvironment } = require('../scripts/capture-claude-agent-sdk-discovery.js')
const { extractMethods, sanitizedEnvironment: sanitizedCodexEnvironment, summarizeMethods } = require('../scripts/capture-codex-app-server-contract.js')

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
  const capture = readJson(...base, 'schema-capture.json')
  assert.equal(capture.capture_kind, 'schema-generation-no-model')
  assert.equal(capture.model_calls, 0)
  assert.equal(capture.prompt_submissions, 0)
  assert.equal(capture.session_creations, 0)
  assert.equal(capture.schema_bundle.v2_schema_sha256, discovery.locked_runtime.generated_schema_sha256)
  assert.equal(capture.schema_bundle.tree_sha256, discovery.locked_runtime.generated_bundle_tree_sha256)
})

test('Claude discovery binds a no-model runtime load without fabricating a session trace', () => {
  const base = ['evaluation', 'adapter-discovery', 'claude-code-agent-sdk', '0.3.251']
  const discovery = readJson(...base, 'discovery.json')
  const trace = readJson(...base, 'native-trace.json')
  assert.equal(trace.capture_kind, 'runtime-load-no-model')
  assert.equal(trace.model_calls, 0)
  assert.equal(trace.prompt_submissions, 0)
  assert.equal(trace.session_creations, 0)
  assert.equal(trace.package.claude_code_version, '2.1.251')
  assert.equal(trace.native_cli.version_output, '2.1.251 (Claude Code)')
  for (const name of ['query', 'startup', 'getSessionInfo', 'getSessionMessages', 'listSessions']) assert.ok(trace.runtime_exports.includes(name))
  assert.match(trace.claim_boundary, /no query, startup, session, prompt/i)
  assert.equal(discovery.result, 'HOLD')
  assert.match(discovery.claim_boundary, /No Claude Code adapter/)
})

test('both discoveries preserve function-call and persistent-mode semantics', () => {
  for (const [client, version] of [['codex-app-server-stdio', '0.150.0-alpha.12.2'], ['claude-code-agent-sdk', '0.3.251']]) {
    const discovery = readJson('evaluation', 'adapter-discovery', client, version, 'discovery.json')
    assert.deepEqual(discovery.invocation.function_call, ['researcher.ask', 'researcher.mode.set', 'researcher.mode.get'])
  }
})

test('Claude runtime-load capture strips credentials and proxy routing before invoking --version', () => {
  const result = sanitizedEnvironment('isolated-config', {
    PATH: 'safe-path',
    ANTHROPIC_API_KEY: 'secret',
    CLAUDE_CONFIG_DIR: 'user-config',
    HTTPS_PROXY: 'https://proxy.invalid',
    SERVICE_ACCESS_TOKEN: 'token',
  })
  assert.deepEqual(result.environment, { PATH: 'safe-path', CLAUDE_CONFIG_DIR: 'isolated-config' })
  assert.deepEqual(result.removed, ['ANTHROPIC_API_KEY', 'CLAUDE_CONFIG_DIR', 'HTTPS_PROXY', 'SERVICE_ACCESS_TOKEN'])
})

test('Codex contract capture deterministically extracts methods and strips account/network state', () => {
  const methods = extractMethods({ oneOf: [
    { properties: { method: { enum: ['turn/start'] } } },
    { properties: { method: { enum: ['thread/read'] } } },
  ] })
  assert.deepEqual(methods, ['thread/read', 'turn/start'])
  assert.deepEqual(summarizeMethods(methods), {
    count: 2,
    sha256: '99c2dbb53dec6727b6396f5e61c0c61d02b2eb8ae82d2d7a7d2cbc48a994d79b',
  })
  const sanitized = sanitizedCodexEnvironment('isolated-codex-home', {
    PATH: 'safe-path',
    OPENAI_API_KEY: 'secret',
    CODEX_HOME: 'user-home',
    HTTP_PROXY: 'http://proxy.invalid',
    SERVICE_AUTH_TOKEN: 'token',
  })
  assert.deepEqual(sanitized.environment, { PATH: 'safe-path', CODEX_HOME: 'isolated-codex-home' })
  assert.deepEqual(sanitized.removed, ['CODEX_HOME', 'HTTP_PROXY', 'OPENAI_API_KEY', 'SERVICE_AUTH_TOKEN'])
})
