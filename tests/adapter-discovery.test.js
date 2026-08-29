'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { EventEmitter } = require('node:events')
const { PassThrough, Writable } = require('node:stream')

const root = path.join(__dirname, '..')
const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(root, ...parts), 'utf8'))
const { capture: captureClaudeRuntime, sanitizedEnvironment } = require('../scripts/capture-claude-agent-sdk-discovery.js')
const { capture: captureClaudeSessionApi, parseArgs: parseClaudeSessionArgs } = require('../scripts/capture-claude-session-api-discovery.js')
const { capture: captureClaudeLocalFixture, parseArgs: parseClaudeFixtureArgs } = require('../scripts/capture-claude-local-session-fixture.js')
const { CLAUDE_SDK_LOCK, assertLockedClaudeSdk, inspectClaudeSdkRoot } = require('../scripts/claude-agent-sdk-lock.js')
const { capture: captureCodexContract, extractMethods, sanitizedEnvironment: sanitizedCodexEnvironment, summarizeMethods } = require('../scripts/capture-codex-app-server-contract.js')
const { capture: captureCodexNative } = require('../scripts/capture-codex-app-server-discovery.js')
const { capture: captureCodexTurn, hashId, parseArgs } = require('../scripts/capture-codex-app-server-turn.js')
const { CODEX_CLI_LOCK, assertLockedCodexExecutable, inspectCodexExecutable } = require('../scripts/codex-cli-lock.js')
const { validateConvergence } = require('../scripts/check-adapter-discovery.js')
const { projectSemanticFixture } = require('../evaluation/adapter-discovery/semantic-fixture.js')

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
  assert.deepEqual(report.convergence, {
    status: 'DISCOVERY_ONLY', common_host_kinds: 7, binding_fields: 28,
    binding_coverage: {
      'claude-code-agent-sdk': { documented: 25, gaps: 3 },
      'codex-app-server-stdio': { documented: 25, gaps: 3 },
    },
    event_cohesion: {
      'claude-code-agent-sdk': { single_event: 5, native_key_join: 0, host_context_join: 1, unjoined: 1, cohesive: 5, conditional: 1, gap: 1 },
      'codex-app-server-stdio': { single_event: 5, native_key_join: 2, host_context_join: 0, unjoined: 0, cohesive: 7, conditional: 0, gap: 0 },
    },
    semantic_fixtures: {
      'claude-code-agent-sdk': { result_sha256: 'ebdee958c4ea4ceb014eaa51b57cbc11414f6cdcfad592761bb26f952f4d3323', projected: 6, unresolved: 1, cohesive: 5, conditional: 1, host_kinds: ['goal_transition', 'session_resume', 'tool_call', 'tool_result', 'turn_end', 'usage', 'user_action'] },
      'codex-app-server-stdio': { result_sha256: '3a940ab20573b098dee8c771cb295e6a0c32728bed8124bd4c2270e24a92b948', projected: 8, unresolved: 0, cohesive: 8, conditional: 0, host_kinds: ['goal_transition', 'session_resume', 'tool_call', 'tool_result', 'turn_end', 'usage', 'user_action'] },
    },
    shared_governance_gaps: 5,
  })
})

test('semantic discovery fixtures deterministically exercise candidate assembly without client or model output', () => {
  const claude = readJson('evaluation', 'adapter-discovery', 'claude-code-agent-sdk', '0.3.251', 'semantic-fixture.json')
  const codex = readJson('evaluation', 'adapter-discovery', 'codex-app-server-stdio', '0.150.0-alpha.12.2', 'semantic-fixture.json')
  const claudeResult = projectSemanticFixture(claude)
  const codexResult = projectSemanticFixture(codex)
  assert.deepEqual(claudeResult.summary, { projected: 6, unresolved: 1, cohesive: 5, conditional: 1, host_kinds: ['goal_transition', 'session_resume', 'tool_call', 'tool_result', 'turn_end', 'usage', 'user_action'] })
  assert.deepEqual(claudeResult.unresolved.map((item) => [item.host_kind, item.reason]), [['user_action', 'no_shared_native_join_key_between_permission_hook_and_callback']])
  assert.deepEqual(codexResult.summary, { projected: 8, unresolved: 0, cohesive: 8, conditional: 0, host_kinds: ['goal_transition', 'session_resume', 'tool_call', 'tool_result', 'turn_end', 'usage', 'user_action'] })
  assert.equal(codexResult.unresolved.length, 0)
  assert.match(codexResult.claim_boundary, /does not prove.*native emission.*conformance/i)
})

test('semantic discovery projection fails closed on duplicate, mismatched, and missing native evidence', () => {
  const codex = readJson('evaluation', 'adapter-discovery', 'codex-app-server-stdio', '0.150.0-alpha.12.2', 'semantic-fixture.json')
  const duplicate = JSON.parse(JSON.stringify(codex))
  duplicate.native_events.splice(3, 0, { ...duplicate.native_events[2], native_seq: 4, native_ref: 'codex:approval-request:duplicate' })
  duplicate.native_events.slice(4).forEach((event, index) => { event.native_seq = index + 5 })
  assert.throws(() => projectSemanticFixture(duplicate), /duplicate approval request request_id/)

  const mismatched = JSON.parse(JSON.stringify(codex))
  mismatched.native_events.find((event) => event.native_ref === 'codex:turn-completed:2').turnId = 'wrong-turn'
  const mismatchResult = projectSemanticFixture(mismatched)
  assert.ok(mismatchResult.unresolved.some((item) => item.host_kind === 'goal_transition' && item.reason === 'missing_matching_terminal_turn'))

  const missing = JSON.parse(JSON.stringify(codex))
  delete missing.native_events[0].itemId
  assert.throws(() => projectSemanticFixture(missing), /ItemStarted missing itemId/)

  const claude = readJson('evaluation', 'adapter-discovery', 'claude-code-agent-sdk', '0.3.251', 'semantic-fixture.json')
  const permission = claude.native_events.find((event) => event.type === 'PermissionRequest')
  permission.requestId = 'claude-request-1'
  permission.tool_use_id = 'claude-call-2'
  const claudeResult = projectSemanticFixture(claude)
  assert.deepEqual(claudeResult.unresolved.map((item) => item.reason), ['no_shared_native_join_key_between_permission_hook_and_callback'])
})

test('cross-client convergence remains a discovery shape with explicit enforcement gaps', () => {
  const convergence = readJson('evaluation', 'adapter-discovery', 'host-event-convergence-v1.json')
  assert.equal(convergence.governed, false)
  assert.equal(convergence.conformance_eligible, false)
  assert.deepEqual(convergence.unmapped_host_kinds, ['guard_violation'])
  assert.deepEqual(convergence.common_host_kinds, ['goal_transition', 'session_resume', 'tool_call', 'tool_result', 'turn_end', 'usage', 'user_action'])
  assert.equal(convergence.requirements.call_result_correlation.status, 'CANDIDATE')
  for (const name of ['human_principal_receipt', 'usage_completeness', 'resume_prefix_checkpoint', 'terminal_enforcement', 'raw_first_durability']) assert.equal(convergence.requirements[name].status, 'GAP')
  assert.match(convergence.claim_boundary, /does not prove.*compatibility.*portability.*conformance/i)
})

test('cross-client convergence rejects a forged common set and stale mapping bytes', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-adapter-convergence-test-'))
  try {
    const sourceRoot = path.join(root, 'evaluation', 'adapter-discovery')
    const convergence = readJson('evaluation', 'adapter-discovery', 'host-event-convergence-v1.json')
    for (const client of convergence.clients) {
      const source = path.join(sourceRoot, client.mapping_path)
      const target = path.join(tempRoot, client.mapping_path)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.copyFileSync(source, target)
      const mapping = JSON.parse(fs.readFileSync(source, 'utf8'))
      fs.copyFileSync(path.join(path.dirname(source), mapping.binding_provenance_path), path.join(path.dirname(target), mapping.binding_provenance_path))
      fs.copyFileSync(path.join(path.dirname(source), mapping.event_cohesion_path), path.join(path.dirname(target), mapping.event_cohesion_path))
      fs.copyFileSync(path.join(path.dirname(source), 'semantic-fixture.json'), path.join(path.dirname(target), 'semantic-fixture.json'))
      fs.copyFileSync(path.join(path.dirname(source), 'native-contract.json'), path.join(path.dirname(target), 'native-contract.json'))
    }
    const convergenceFile = path.join(tempRoot, 'host-event-convergence-v1.json')
    fs.writeFileSync(convergenceFile, JSON.stringify({ ...convergence, common_host_kinds: convergence.common_host_kinds.slice(1) }))
    assert.throws(() => validateConvergence(convergenceFile), /normalized binding contract kinds drifted|common HostEvent kinds/)
    const driftedContract = JSON.parse(JSON.stringify(convergence))
    driftedContract.normalized_binding_contract.tool_call = driftedContract.normalized_binding_contract.tool_call.filter((field) => field !== 'call_id')
    fs.writeFileSync(convergenceFile, JSON.stringify(driftedContract))
    assert.throws(() => validateConvergence(convergenceFile), /normalized binding fields drifted/)
    fs.writeFileSync(convergenceFile, JSON.stringify(convergence))
    fs.appendFileSync(path.join(tempRoot, convergence.clients[0].mapping_path), '\n')
    assert.throws(() => validateConvergence(convergenceFile), /hash drifted/)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('cross-client convergence rejects invented or unbound field provenance', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-adapter-provenance-test-'))
  try {
    const sourceRoot = path.join(root, 'evaluation', 'adapter-discovery')
    const convergence = readJson('evaluation', 'adapter-discovery', 'host-event-convergence-v1.json')
    for (const client of convergence.clients) {
      const sourceMapping = path.join(sourceRoot, client.mapping_path)
      const targetMapping = path.join(tempRoot, client.mapping_path)
      fs.mkdirSync(path.dirname(targetMapping), { recursive: true })
      fs.copyFileSync(sourceMapping, targetMapping)
      const mapping = JSON.parse(fs.readFileSync(sourceMapping, 'utf8'))
      fs.copyFileSync(path.join(path.dirname(sourceMapping), mapping.binding_provenance_path), path.join(path.dirname(targetMapping), mapping.binding_provenance_path))
      fs.copyFileSync(path.join(path.dirname(sourceMapping), mapping.event_cohesion_path), path.join(path.dirname(targetMapping), mapping.event_cohesion_path))
      fs.copyFileSync(path.join(path.dirname(sourceMapping), 'semantic-fixture.json'), path.join(path.dirname(targetMapping), 'semantic-fixture.json'))
      fs.copyFileSync(path.join(path.dirname(sourceMapping), 'native-contract.json'), path.join(path.dirname(targetMapping), 'native-contract.json'))
    }
    const convergenceFile = path.join(tempRoot, 'host-event-convergence-v1.json')
    const copied = JSON.parse(JSON.stringify(convergence))
    for (const client of copied.clients) client.mapping_sha256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(tempRoot, client.mapping_path))).digest('hex')
    fs.writeFileSync(convergenceFile, JSON.stringify(copied))
    const claudeMappingPath = path.join(tempRoot, copied.clients.find((client) => client.client === 'claude-code-agent-sdk').mapping_path)
    const claudeMapping = JSON.parse(fs.readFileSync(claudeMappingPath, 'utf8'))
    claudeMapping.mappings[0].normalized_bindings.call_id.proof = 'invented.proof'
    fs.writeFileSync(claudeMappingPath, JSON.stringify(claudeMapping))
    copied.clients.find((client) => client.client === 'claude-code-agent-sdk').mapping_sha256 = crypto.createHash('sha256').update(fs.readFileSync(claudeMappingPath)).digest('hex')
    fs.writeFileSync(convergenceFile, JSON.stringify(copied))
    assert.throws(() => validateConvergence(convergenceFile), /lacks a valid provenance proof/)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('event cohesion rejects promotion of an unjoined Claude approval path', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-adapter-cohesion-test-'))
  try {
    const sourceRoot = path.join(root, 'evaluation', 'adapter-discovery')
    const convergence = readJson('evaluation', 'adapter-discovery', 'host-event-convergence-v1.json')
    for (const client of convergence.clients) {
      const sourceMapping = path.join(sourceRoot, client.mapping_path)
      const targetMapping = path.join(tempRoot, client.mapping_path)
      fs.mkdirSync(path.dirname(targetMapping), { recursive: true })
      fs.copyFileSync(sourceMapping, targetMapping)
      const mapping = JSON.parse(fs.readFileSync(sourceMapping, 'utf8'))
      for (const artifact of [mapping.binding_provenance_path, mapping.event_cohesion_path, 'semantic-fixture.json', 'native-contract.json']) fs.copyFileSync(path.join(path.dirname(sourceMapping), artifact), path.join(path.dirname(targetMapping), artifact))
    }
    const claudeClient = convergence.clients.find((client) => client.client === 'claude-code-agent-sdk')
    const claudeMappingPath = path.join(tempRoot, claudeClient.mapping_path)
    const claudeMapping = JSON.parse(fs.readFileSync(claudeMappingPath, 'utf8'))
    const cohesionPath = path.join(path.dirname(claudeMappingPath), claudeMapping.event_cohesion_path)
    const cohesion = JSON.parse(fs.readFileSync(cohesionPath, 'utf8'))
    const approval = cohesion.events.find((event) => event.host_kind === 'user_action')
    approval.assembly = 'NATIVE_KEY_JOIN'
    approval.status = 'COHESIVE'
    approval.join_proofs = ['can-use-tool.request-id']
    fs.writeFileSync(cohesionPath, JSON.stringify(cohesion))
    const convergenceFile = path.join(tempRoot, 'host-event-convergence-v1.json')
    fs.writeFileSync(convergenceFile, JSON.stringify(convergence))
    assert.throws(() => validateConvergence(convergenceFile), /cohesion policy promotion or drift/)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('Codex discovery keeps its no-model baseline separate from invalid live-turn attempts', () => {
  const base = ['evaluation', 'adapter-discovery', 'codex-app-server-stdio', '0.150.0-alpha.12.2']
  const discovery = readJson(...base, 'discovery.json')
  const trace = readJson(...base, 'native-trace.json')
  assert.match(discovery.surface, /app-server --stdio/)
  assert.match(discovery.claim_boundary, /No Codex adapter/)
  assert.equal(trace.capture_kind, 'live-no-model')
  assert.equal(trace.model_calls, 0)
  assert.equal(trace.executable.sha256, CODEX_CLI_LOCK.executables['win32-x64'].sha256)
  assert.equal(trace.executable.path_recorded, false)
  assert.deepEqual(trace.requests.map((item) => item.method), ['initialize', 'initialized', 'thread/list'])
  assert.equal(discovery.capabilities.write_boundary.status, 'UNKNOWN')
  const capture = readJson(...base, 'schema-capture.json')
  assert.equal(capture.capture_kind, 'schema-generation-no-model')
  assert.deepEqual(capture.executable, trace.executable)
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
  assert.deepEqual(parseArgs([]), { ackUsage: false, codexBin: null })
  assert.deepEqual(parseArgs(['--ack-codex-usage']), { ackUsage: true, codexBin: null })
  assert.throws(() => parseArgs(['--codex-bin', 'relative']), /absolute/)
  assert.equal(hashId(null), null)
  assert.equal(hashId('thread-a').length, 64)
  assert.equal(hashId('thread-a'), hashId('thread-a'))
  assert.notEqual(hashId('thread-a'), hashId('thread-b'))
})

test('Codex turn capture forms a redacted trace after refusal and process close without a model', async () => {
  const fixture = fakeCodexAppServer()
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-codex-capture-test-'))
  try {
    const trace = await captureCodexTurn({ ackUsage: true, codexBin: null }, { spawnProcess: fixture.spawnProcess, synthetic: true, tempRoot, timeoutMs: 5000 })
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

test('every Codex capture entry fails closed on a tampered same-version executable before spawn', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-codex-lock-test-'))
  const executable = path.join(tempRoot, process.platform === 'win32' ? 'codex.exe' : 'codex')
  try {
    fs.writeFileSync(executable, 'fixture codex executable\n')
    const inspected = inspectCodexExecutable(executable, { platform: 'fixture', arch: 'test' })
    const fixtureLock = { version: CODEX_CLI_LOCK.version, versionOutput: CODEX_CLI_LOCK.versionOutput, executables: { 'fixture-test': {
      basename: inspected.basename, size: inspected.size, sha256: inspected.sha256,
    } } }
    assert.equal(assertLockedCodexExecutable(executable, fixtureLock, { platform: 'fixture', arch: 'test' }).path, fs.realpathSync(executable))
    const bytes = fs.readFileSync(executable)
    bytes[0] ^= 1
    fs.writeFileSync(executable, bytes)
    assert.throws(() => assertLockedCodexExecutable(executable, fixtureLock, { platform: 'fixture', arch: 'test' }), /sha256 drifted/)
    const neverSpawn = () => { throw new Error('must not spawn') }
    const dependencies = { lock: fixtureLock, host: { platform: 'fixture', arch: 'test' }, spawnSync: neverSpawn, spawnProcess: neverSpawn }
    assert.throws(() => captureCodexContract(executable, dependencies), /sha256 drifted/)
    await assert.rejects(captureCodexNative(executable, dependencies), /sha256 drifted/)
    await assert.rejects(captureCodexTurn({ ackUsage: true, codexBin: executable }, dependencies), /sha256 drifted/)
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
  const sessionTrace = readJson(...base, 'session-api-trace.json')
  assert.equal(sessionTrace.capture_kind, 'isolated-session-read-no-model')
  assert.equal(sessionTrace.model_calls, 0)
  assert.equal(sessionTrace.session_creations, 0)
  assert.equal(sessionTrace.user_session_data_read, false)
  assert.deepEqual(sessionTrace.api_calls.map((item) => item.method), ['listSessions', 'getSessionInfo', 'getSessionMessages'])
  const fixtureTrace = readJson(...base, 'local-session-fixture-trace.json')
  assert.equal(fixtureTrace.capture_kind, 'host-authored-local-session-fixture-no-model')
  assert.equal(fixtureTrace.model_calls, 0)
  assert.equal(fixtureTrace.sdk_session_creations, 0)
  assert.equal(fixtureTrace.host_fixture_sessions, 1)
  assert.equal(fixtureTrace.fixture.unchanged_after_reads, true)
  assert.deepEqual(fixtureTrace.api_calls.map((item) => item.result_count), [1, undefined, 2])
  assert.ok(Object.values(discovery.capabilities).every((item) => item.status !== 'OBSERVED'))
})

test('Claude isolated session capture strips credentials and preserves empty-result boundaries', () => {
  assert.deepEqual(parseClaudeSessionArgs(['--sdk-root', 'locked-root']), { sdkRoot: 'locked-root' })
  assert.throws(() => parseClaudeSessionArgs([]), /usage/)
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-claude-session-test-'))
  const sdkRoot = path.join(tempRoot, 'sdk')
  fs.mkdirSync(sdkRoot)
  fs.writeFileSync(path.join(sdkRoot, 'package.json'), JSON.stringify({ name: '@anthropic-ai/claude-agent-sdk', version: '0.3.251', claudeCodeVersion: '2.1.251' }))
  fs.writeFileSync(path.join(sdkRoot, 'sdk.mjs'), 'export {}\n')
  fs.writeFileSync(path.join(sdkRoot, 'sdk.d.ts'), 'export {}\n')
  try {
    const trace = captureClaudeSessionApi(sdkRoot, {
      tempRoot,
      assertLockedClaudeSdk: inspectClaudeSdkRoot,
      environment: { PATH: 'safe-path', ANTHROPIC_API_KEY: 'secret', CLAUDE_CONFIG_DIR: 'user-config', HTTPS_PROXY: 'https://proxy.invalid' },
      spawnSync(command, args, options) {
        assert.equal(command, process.execPath)
        assert.match(args[0], /claude-session-api-probe\.mjs$/)
        assert.equal(options.env.PATH, 'safe-path')
        assert.ok(options.env.CLAUDE_CONFIG_DIR.startsWith(tempRoot))
        assert.equal(options.env.ANTHROPIC_API_KEY, undefined)
        assert.equal(options.env.HTTPS_PROXY, undefined)
        return { status: 0, stdout: JSON.stringify({ schema: 'dsh-researcher/claude-session-api-probe/v1', calls: [
          { method: 'listSessions', result_kind: 'array', result_count: 0 },
          { method: 'getSessionInfo', result_kind: 'undefined', found: false },
          { method: 'getSessionMessages', result_kind: 'array', result_count: 0 },
        ] }), stderr: '' }
      },
    })
    assert.equal(trace.model_calls, 0)
    assert.equal(trace.user_session_data_read, false)
    assert.equal(trace.credential_boundary.removed_name_count, 3)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('Claude local fixture capture preserves the synthetic-versus-native boundary', () => {
  assert.deepEqual(parseClaudeFixtureArgs(['--sdk-root', 'locked-root']), { sdkRoot: 'locked-root' })
  assert.throws(() => parseClaudeFixtureArgs([]), /usage/)
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-claude-fixture-test-'))
  const sdkRoot = path.join(tempRoot, 'sdk')
  fs.mkdirSync(sdkRoot)
  fs.writeFileSync(path.join(sdkRoot, 'package.json'), JSON.stringify({ name: '@anthropic-ai/claude-agent-sdk', version: '0.3.251', claudeCodeVersion: '2.1.251' }))
  fs.writeFileSync(path.join(sdkRoot, 'sdk.mjs'), 'export {}\n')
  fs.writeFileSync(path.join(sdkRoot, 'sdk.d.ts'), 'export {}\n')
  try {
    const trace = captureClaudeLocalFixture(sdkRoot, {
      tempRoot,
      assertLockedClaudeSdk: inspectClaudeSdkRoot,
      environment: { PATH: 'safe-path', ANTHROPIC_API_KEY: 'secret', CLAUDE_CONFIG_DIR: 'user-config', HTTPS_PROXY: 'https://proxy.invalid' },
      spawnSync(command, args, options) {
        assert.equal(command, process.execPath)
        assert.match(args[0], /claude-local-session-fixture-probe\.mjs$/)
        assert.equal(options.env.PATH, 'safe-path')
        assert.equal(options.env.ANTHROPIC_API_KEY, undefined)
        assert.equal(options.env.HTTPS_PROXY, undefined)
        return { status: 0, stdout: JSON.stringify({
          schema: 'dsh-researcher/claude-local-session-fixture-probe/v1',
          fixture: { provenance: 'host-authored synthetic transcript; not emitted by Claude Code or a model', entry_count: 3, path_normalization: 'replace every fixture cwd with <isolated-project> before canonical JSONL hashing', normalized_transcript_sha256: 'a'.repeat(64), unchanged_after_reads: true },
          calls: [
            { method: 'listSessions', result_count: 1 },
            { method: 'getSessionInfo', found: true },
            { method: 'getSessionMessages', result_count: 2 },
          ],
        }), stderr: '' }
      },
    })
    assert.equal(trace.model_calls, 0)
    assert.equal(trace.sdk_session_creations, 0)
    assert.equal(trace.host_fixture_sessions, 1)
    assert.match(trace.claim_boundary, /not an authentic Claude Code session/i)
    assert.equal(trace.credential_boundary.removed_name_count, 3)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('every Claude capture entry rejects a tampered same-version SDK before execution', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-claude-lock-test-'))
  try {
    fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({ name: CLAUDE_SDK_LOCK.name, version: CLAUDE_SDK_LOCK.version, claudeCodeVersion: CLAUDE_SDK_LOCK.claudeCodeVersion }))
    fs.writeFileSync(path.join(tempRoot, 'sdk.mjs'), 'export const listSessions = () => []\n')
    fs.writeFileSync(path.join(tempRoot, 'sdk.d.ts'), 'export declare const listSessions: () => []\n')
    assert.throws(() => assertLockedClaudeSdk(tempRoot), /SDK content hash drifted: package\.json/)
    await assert.rejects(captureClaudeRuntime(tempRoot), /SDK content hash drifted: package\.json/)
    assert.throws(() => captureClaudeSessionApi(tempRoot, { spawnSync() { throw new Error('must not spawn') } }), /SDK content hash drifted: package\.json/)
    assert.throws(() => captureClaudeLocalFixture(tempRoot, { spawnSync() { throw new Error('must not spawn') } }), /SDK content hash drifted: package\.json/)
    const inspected = inspectClaudeSdkRoot(tempRoot)
    const fixtureLock = { name: CLAUDE_SDK_LOCK.name, version: CLAUDE_SDK_LOCK.version, claudeCodeVersion: CLAUDE_SDK_LOCK.claudeCodeVersion, files: inspected.hashes }
    assert.equal(assertLockedClaudeSdk(tempRoot, fixtureLock).root, path.resolve(tempRoot))
    fs.appendFileSync(path.join(tempRoot, 'sdk.mjs'), '// tampered\n')
    assert.throws(() => assertLockedClaudeSdk(tempRoot, fixtureLock), /SDK content hash drifted: sdk\.mjs/)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
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
