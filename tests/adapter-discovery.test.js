'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { EventEmitter } = require('node:events')
const { PassThrough, Writable } = require('node:stream')

const root = path.join(__dirname, '..')
const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(root, ...parts), 'utf8'))
const { sanitizedEnvironment } = require('../scripts/capture-claude-agent-sdk-discovery.js')
const { extractMethods, sanitizedEnvironment: sanitizedCodexEnvironment, summarizeMethods } = require('../scripts/capture-codex-app-server-contract.js')
const { capture: captureCodexTurn, hashId, parseArgs } = require('../scripts/capture-codex-app-server-turn.js')

const fakeCodexAppServer = () => {
  const received = []
  const spawnProcess = (command, args, options) => {
    assert.equal(command, 'codex')
    assert.deepEqual(args, ['app-server', '--stdio'])
    assert.equal(options.windowsHide, true)
    const child = new EventEmitter()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.exitCode = null
    let pending = ''
    let closed = false
    const emit = (message) => setImmediate(() => child.stdout.write(JSON.stringify(message) + '\n'))
    const completeTurn = () => {
      emit({ method: 'item/started', params: { threadId: 'thread-native-secret', turnId: 'turn-native-secret', item: { id: 'item-native-secret', type: 'agentMessage' } } })
      emit({ method: 'item/completed', params: { threadId: 'thread-native-secret', turnId: 'turn-native-secret', item: { id: 'item-native-secret', type: 'agentMessage' } } })
      emit({ method: 'thread/tokenUsage/updated', params: { threadId: 'thread-native-secret', turnId: 'turn-native-secret', tokenUsage: { total: { totalTokens: 7 } } } })
      emit({ method: 'turn/completed', params: { threadId: 'thread-native-secret', turn: { id: 'turn-native-secret', status: 'completed', items: [] } } })
    }
    const accept = (message) => {
      received.push(message)
      if (message.method === 'initialize') emit({ id: 1, result: { userAgent: 'fixture' } })
      else if (message.method === 'thread/start') {
        assert.equal(message.params.ephemeral, true)
        assert.equal(message.params.sandbox, 'read-only')
        emit({ id: 2, result: { thread: { id: 'thread-native-secret', ephemeral: true } } })
        emit({ method: 'thread/started', params: { thread: { id: 'thread-native-secret', ephemeral: true } } })
      } else if (message.method === 'turn/start') {
        assert.deepEqual(message.params.sandboxPolicy, { type: 'readOnly', networkAccess: false })
        emit({ id: 3, result: { turn: { id: 'turn-native-secret', status: 'inProgress', items: [] } } })
        emit({ id: 'approval-native-secret', method: 'item/commandExecution/requestApproval', params: { threadId: 'thread-native-secret', turnId: 'turn-native-secret', itemId: 'item-native-secret' } })
      } else if (message.id === 'approval-native-secret') {
        assert.equal(message.error?.code, -32000)
        assert.match(message.error?.message || '', /denied unexpected server request/)
        completeTurn()
      }
    }
    child.stdin = new Writable({
      write(chunk, encoding, callback) {
        pending += String(chunk)
        const lines = pending.split('\n')
        pending = lines.pop()
        for (const line of lines) if (line) accept(JSON.parse(line))
        callback()
      },
    })
    child.kill = () => {
      if (closed) return true
      closed = true
      setImmediate(() => {
        child.exitCode = 0
        child.stdout.end()
        child.stderr.end()
        child.emit('close', 0)
        child.emit('exit', 0)
      })
      return true
    }
    return child
  }
  return { received, spawnProcess }
}

test('adapter discovery is version locked, offline checked, and non-product', () => {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'check-adapter-discovery.js')], { cwd: root, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr + result.stdout)
  const report = JSON.parse(result.stdout)
  assert.equal(report.checker_model_calls, 0)
  assert.equal(report.checker_network_calls, 0)
  assert.deepEqual(report.records, [
    { client: 'claude-code-agent-sdk', version: '0.3.251', result: 'HOLD' },
    { client: 'codex-app-server-stdio', version: '0.150.0-alpha.12.2', result: 'HOLD' },
  ])
})

test('Codex discovery keeps its no-model baseline separate from invalid live-turn attempts', () => {
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
  const attempts = readJson(...base, 'turn-capture-attempts.json')
  assert.equal(attempts.valid_native_turn_trace, false)
  assert.equal(attempts.maximum_model_turns_that_may_have_been_billed, 2)
  assert.equal(discovery.result, 'HOLD')
  assert.ok(Object.values(discovery.capabilities).every((item) => item.status !== 'OBSERVED'))
})

test('Codex turn capture is explicit-use gated and hashes native ids before output', () => {
  assert.throws(() => parseArgs(['--unexpected']), /unknown argument/)
  assert.deepEqual(parseArgs([]), { ackUsage: false })
  assert.deepEqual(parseArgs(['--ack-codex-usage']), { ackUsage: true })
  assert.equal(hashId(null), null)
  assert.equal(hashId('thread-a').length, 64)
  assert.equal(hashId('thread-a'), hashId('thread-a'))
  assert.notEqual(hashId('thread-a'), hashId('thread-b'))
})

test('Codex turn capture forms a redacted trace after refusal and process close without a model', async () => {
  const fixture = fakeCodexAppServer()
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-codex-capture-test-'))
  try {
    const trace = await captureCodexTurn({ ackUsage: true }, { spawnProcess: fixture.spawnProcess, synthetic: true, tempRoot, timeoutMs: 5000 })
    assert.equal(trace.capture_kind, 'synthetic-single-turn-no-model')
    assert.equal(trace.model_calls, 0)
    assert.equal(trace.prompt_submissions, 0)
    assert.equal(trace.refused_server_requests, 1)
    assert.equal(trace.auto_approved_requests, 0)
    assert.equal(trace.cleanup.temporary_workspace_removed, true)
    assert.equal(trace.cleanup.ephemeral_thread, true)
    assert.deepEqual(trace.observed_item_types, ['agentMessage'])
    assert.deepEqual(trace.observed_turn_statuses, ['completed'])
    assert.equal(trace.correlation.thread_id_sha256, hashId('thread-native-secret'))
    assert.equal(trace.correlation.turn_id_sha256, hashId('turn-native-secret'))
    const serialized = JSON.stringify(trace)
    for (const secret of ['thread-native-secret', 'turn-native-secret', 'item-native-secret', 'approval-native-secret']) assert.doesNotMatch(serialized, new RegExp(secret))
    const refusal = fixture.received.find((message) => message.id === 'approval-native-secret')
    assert.equal(refusal.error.code, -32000)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
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
