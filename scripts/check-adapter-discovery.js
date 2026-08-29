#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { CLAUDE_SDK_LOCK } = require('./claude-agent-sdk-lock.js')

const root = path.resolve(__dirname, '..')
const discoveryRoot = path.join(root, 'evaluation', 'adapter-discovery')
const schema = 'dsh-researcher/adapter-discovery/v1'
const allowedResults = new Set(['DISCOVERY_QUALIFIED', 'HOLD', 'NO_GO'])
const allowedEvidence = new Set(['OBSERVED', 'DOCUMENTED', 'MISSING', 'UNKNOWN'])
const officialHosts = new Set(['developers.openai.com', 'learn.chatgpt.com', 'platform.claude.com', 'docs.anthropic.com', 'registry.npmjs.org'])
const requiredCapabilities = ['ordered_events', 'stable_call_id', 'human_approval', 'hard_stop', 'event_replay', 'usage_coverage', 'write_boundary']

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const relativeSafe = (value) => typeof value === 'string' && value.length > 0 && !path.isAbsolute(value) && !value.split(/[\\/]/).includes('..')
const exactKeys = (value, keys, label) => {
  if (!plain(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new Error(label + ' keys drifted')
}

const walkStrings = (value, visit) => {
  if (typeof value === 'string') visit(value)
  else if (Array.isArray(value)) value.forEach((item) => walkStrings(item, visit))
  else if (plain(value)) Object.values(value).forEach((item) => walkStrings(item, visit))
}

const assertNoSensitiveStrings = (value, label) => walkStrings(value, (text) => {
  if (/[A-Za-z]:\\|(?:^|\s)\/(?:Users|home)\//.test(text)) throw new Error(label + ': personal absolute path leaked')
  if (/sk-[A-Za-z0-9_-]{12,}|api[_-]?key\s*[:=]/i.test(text)) throw new Error(label + ': secret-shaped value leaked')
})

const validate = (file) => {
  const doc = readJson(file)
  exactKeys(doc, ['schema', 'client', 'surface', 'locked_runtime', 'sources', 'artifacts', 'invocation', 'capabilities', 'gaps', 'result', 'claim_boundary'], 'discovery')
  if (doc.schema !== schema || !allowedResults.has(doc.result)) throw new Error(file + ': schema/result invalid')
  const expectedDirectory = path.join(discoveryRoot, doc.client, doc.locked_runtime.version)
  if (path.resolve(path.dirname(file)) !== expectedDirectory) throw new Error(file + ': directory does not match client/version lock')
  if (!Array.isArray(doc.sources) || doc.sources.length === 0) throw new Error(file + ': official sources missing')
  for (const source of doc.sources) {
    const parsed = new URL(source.url)
    if (parsed.protocol !== 'https:' || !officialHosts.has(parsed.hostname)) throw new Error(file + ': non-official source ' + source.url)
  }
  if (!Array.isArray(doc.invocation.function_call) || !doc.invocation.function_call.includes('researcher.ask') || !doc.invocation.function_call.includes('researcher.mode.set') || !doc.invocation.function_call.includes('researcher.mode.get')) throw new Error(file + ': stable function invocation drifted')
  const capabilityNames = Object.keys(doc.capabilities).sort()
  if (JSON.stringify(capabilityNames) !== JSON.stringify([...requiredCapabilities].sort())) throw new Error(file + ': governed capability set drifted')
  for (const [name, capability] of Object.entries(doc.capabilities)) {
    if (!allowedEvidence.has(capability.status) || !Array.isArray(capability.evidence_refs) || capability.evidence_refs.length === 0) throw new Error(file + ': invalid capability ' + name)
  }
  for (const artifact of Object.values(doc.artifacts)) {
    if (!relativeSafe(artifact.path) || !/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new Error(file + ': invalid artifact binding')
    const target = path.resolve(path.dirname(file), artifact.path)
    if (!target.startsWith(path.dirname(file) + path.sep) || !fs.existsSync(target) || sha256(target) !== artifact.sha256) throw new Error(file + ': artifact missing or hash drifted: ' + artifact.path)
  }
  const trace = readJson(path.resolve(path.dirname(file), doc.artifacts.native_trace.path))
  if (trace.model_calls !== 0) throw new Error(file + ': discovery trace must not call a model')
  if (trace.network_calls_initiated_by_capture !== 0) throw new Error(file + ': discovery trace must not initiate a network request')
  assertNoSensitiveStrings(trace, file + ': native trace')
  if (doc.client === 'claude-code-agent-sdk') {
    if (trace.capture_kind !== 'runtime-load-no-model' || trace.prompt_submissions !== 0 || trace.session_creations !== 0) throw new Error(file + ': Claude discovery must remain a no-session runtime load')
    if (trace.package?.name !== '@anthropic-ai/claude-agent-sdk' || trace.package?.version !== doc.locked_runtime.version || trace.package?.claude_code_version !== '2.1.251') throw new Error(file + ': Claude SDK runtime identity drifted')
    if (trace.package?.package_json_sha256 !== CLAUDE_SDK_LOCK.files['package.json'] || trace.package?.sdk_module_sha256 !== CLAUDE_SDK_LOCK.files['sdk.mjs']) throw new Error(file + ': Claude SDK runtime content lock drifted')
    if (trace.native_cli?.package_version !== doc.locked_runtime.version || trace.native_cli?.version_output !== '2.1.251 (Claude Code)') throw new Error(file + ': Claude native CLI identity drifted')
    for (const required of ['query', 'startup', 'getSessionInfo', 'getSessionMessages', 'listSessions']) if (!trace.runtime_exports?.includes(required)) throw new Error(file + ': Claude runtime export missing: ' + required)
    if (!/no query, startup, session, prompt/i.test(trace.claim_boundary || '')) throw new Error(file + ': Claude capture claim boundary drifted')
    const sessionBinding = doc.artifacts.session_api_trace
    if (!sessionBinding) throw new Error(file + ': Claude session API trace binding is missing')
    const sessionTrace = readJson(path.resolve(path.dirname(file), sessionBinding.path))
    assertNoSensitiveStrings(sessionTrace, file + ': session API trace')
    if (sessionTrace.schema !== 'dsh-researcher/adapter-native-session-api-trace/v1' || sessionTrace.client !== doc.client || sessionTrace.runtime_version !== doc.locked_runtime.version || sessionTrace.capture_kind !== 'isolated-session-read-no-model') throw new Error(file + ': Claude session API trace identity drifted')
    for (const field of ['model_calls', 'prompt_submissions', 'session_creations', 'network_calls_initiated_by_capture']) if (sessionTrace[field] !== 0) throw new Error(file + ': Claude session API trace must keep ' + field + '=0')
    if (sessionTrace.isolated_config !== true || sessionTrace.isolated_project !== true || sessionTrace.user_session_data_read !== false) throw new Error(file + ': Claude session API isolation drifted')
    if (JSON.stringify(sessionTrace.api_calls) !== JSON.stringify([
      { method: 'listSessions', result_kind: 'array', result_count: 0 },
      { method: 'getSessionInfo', result_kind: 'undefined', found: false },
      { method: 'getSessionMessages', result_kind: 'array', result_count: 0 },
    ])) throw new Error(file + ': Claude empty session API results drifted')
    if (sessionTrace.package?.package_json_sha256 !== CLAUDE_SDK_LOCK.files['package.json'] || sessionTrace.package?.sdk_module_sha256 !== CLAUDE_SDK_LOCK.files['sdk.mjs'] || sessionTrace.package?.sdk_types_sha256 !== CLAUDE_SDK_LOCK.files['sdk.d.ts']) throw new Error(file + ': Claude session API package binding drifted')
    if (!/empty isolated config.*no existing user session/i.test(sessionTrace.claim_boundary || '')) throw new Error(file + ': Claude session API claim boundary drifted')
    const fixtureBinding = doc.artifacts.local_session_fixture_trace
    if (!fixtureBinding) throw new Error(file + ': Claude local session fixture trace binding is missing')
    const fixtureTrace = readJson(path.resolve(path.dirname(file), fixtureBinding.path))
    assertNoSensitiveStrings(fixtureTrace, file + ': local session fixture trace')
    if (fixtureTrace.schema !== 'dsh-researcher/adapter-local-session-parser-trace/v1' || fixtureTrace.client !== doc.client || fixtureTrace.runtime_version !== doc.locked_runtime.version || fixtureTrace.capture_kind !== 'host-authored-local-session-fixture-no-model') throw new Error(file + ': Claude local session fixture identity drifted')
    for (const field of ['model_calls', 'prompt_submissions', 'sdk_session_creations', 'network_calls_initiated_by_capture']) if (fixtureTrace[field] !== 0) throw new Error(file + ': Claude local session fixture must keep ' + field + '=0')
    if (fixtureTrace.host_fixture_sessions !== 1 || fixtureTrace.isolated_config !== true || fixtureTrace.isolated_project !== true || fixtureTrace.user_session_data_read !== false) throw new Error(file + ': Claude local session fixture isolation drifted')
    if (fixtureTrace.fixture?.provenance !== 'host-authored synthetic transcript; not emitted by Claude Code or a model' || fixtureTrace.fixture?.entry_count !== 3 || fixtureTrace.fixture?.path_normalization !== 'replace every fixture cwd with <isolated-project> before canonical JSONL hashing' || fixtureTrace.fixture?.normalized_transcript_sha256 !== '506d429359e8e566fabf8acc0703efb8df8e6899f022222477d5ad3feb11d221' || fixtureTrace.fixture?.unchanged_after_reads !== true) throw new Error(file + ': Claude local session fixture provenance drifted')
    const [listCall, infoCall, messagesCall] = fixtureTrace.api_calls || []
    if (fixtureTrace.api_calls?.length !== 3 || listCall?.method !== 'listSessions' || listCall.result_count !== 1 || listCall.session?.session_id_matches !== true || listCall.session?.summary !== 'DSH synthetic session fixture' || listCall.session?.first_prompt !== 'DSH fixture prompt' || listCall.session?.cwd_matches_fixture !== true) throw new Error(file + ': Claude fixture listSessions result drifted')
    if (infoCall?.method !== 'getSessionInfo' || infoCall.found !== true || JSON.stringify(infoCall.session) !== JSON.stringify(listCall.session)) throw new Error(file + ': Claude fixture getSessionInfo result drifted')
    if (messagesCall?.method !== 'getSessionMessages' || messagesCall.result_count !== 2 || JSON.stringify(messagesCall.types) !== JSON.stringify(['user', 'assistant']) || messagesCall.ids_match_fixture !== true || messagesCall.session_ids_match !== true || JSON.stringify(messagesCall.parent_tool_use_ids) !== JSON.stringify([null, null])) throw new Error(file + ': Claude fixture getSessionMessages result drifted')
    if (fixtureTrace.package?.package_json_sha256 !== CLAUDE_SDK_LOCK.files['package.json'] || fixtureTrace.package?.sdk_module_sha256 !== CLAUDE_SDK_LOCK.files['sdk.mjs'] || fixtureTrace.package?.sdk_types_sha256 !== CLAUDE_SDK_LOCK.files['sdk.d.ts']) throw new Error(file + ': Claude local session fixture package binding drifted')
    if (!/host-authored local JSONL fixture.*not an authentic Claude Code session/i.test(fixtureTrace.claim_boundary || '')) throw new Error(file + ': Claude local session fixture claim boundary drifted')
    const contract = readJson(path.resolve(path.dirname(file), doc.artifacts.native_contract.path))
    if (contract.runtime_version !== CLAUDE_SDK_LOCK.version || contract.sdk_types_sha256 !== CLAUDE_SDK_LOCK.files['sdk.d.ts'] || contract.runtime_load_observation?.sdk_module_sha256 !== CLAUDE_SDK_LOCK.files['sdk.mjs'] || contract.runtime_load_observation?.claude_code_version !== CLAUDE_SDK_LOCK.claudeCodeVersion) throw new Error(file + ': Claude native contract content lock drifted')
    if (Object.values(doc.capabilities).some((item) => item.status === 'OBSERVED')) throw new Error(file + ': Claude capability was promoted by local parser-only evidence')
  }
  if (doc.client === 'codex-app-server-stdio') {
    const attemptBinding = doc.artifacts.turn_capture_attempts
    if (!attemptBinding) throw new Error(file + ': Codex turn-attempt incident binding is missing')
    const attempts = readJson(path.resolve(path.dirname(file), attemptBinding.path))
    assertNoSensitiveStrings(attempts, file + ': turn capture attempts')
    if (attempts.schema !== 'dsh-researcher/adapter-turn-capture-attempts/v1' || attempts.client !== doc.client || attempts.runtime_version !== doc.locked_runtime.version) throw new Error(file + ': Codex turn-attempt identity drifted')
    if (attempts.valid_native_turn_trace !== false || attempts.retained_raw_event_stream !== false || attempts.capability_promotion_allowed !== false) throw new Error(file + ': invalid Codex attempts must not promote evidence')
    if (attempts.maximum_model_turns_that_may_have_been_billed !== 2 || attempts.attempts?.length !== 3) throw new Error(file + ': Codex attempt accounting drifted')
    if (Object.values(doc.capabilities).some((item) => item.status === 'OBSERVED')) throw new Error(file + ': Codex capability was promoted without a valid native turn trace')
    const captureBinding = doc.artifacts.schema_capture
    if (!captureBinding) throw new Error(file + ': Codex schema capture binding is missing')
    const capture = readJson(path.resolve(path.dirname(file), captureBinding.path))
    assertNoSensitiveStrings(capture, file + ': schema capture')
    if (capture.schema !== 'dsh-researcher/adapter-contract-capture/v1' || capture.client !== doc.client || capture.runtime_version !== doc.locked_runtime.version || capture.capture_kind !== 'schema-generation-no-model') throw new Error(file + ': Codex schema capture identity drifted')
    for (const field of ['model_calls', 'prompt_submissions', 'session_creations', 'network_calls_initiated_by_capture']) if (capture[field] !== 0) throw new Error(file + ': Codex schema capture must keep ' + field + '=0')
    if (capture.schema_bundle?.v2_schema_sha256 !== doc.locked_runtime.generated_schema_sha256 || capture.schema_bundle?.tree_sha256 !== doc.locked_runtime.generated_bundle_tree_sha256 || capture.schema_bundle?.file_count !== doc.locked_runtime.generated_bundle_file_count) throw new Error(file + ': Codex generated schema bundle drifted')
    const expectedInventory = {
      client_requests: [154, '2ef17afbf7e4dc11add3c4e8710baa8334e25ca9c46610d065c93b186d4e5625'],
      client_notifications: [1, 'a27ff6491cf8553bd55d6d031e204a811f1675c9064616e72cc522a56c140c77'],
      server_requests: [11, 'acd62ccbff44117c42ea6b6da69ad88b37a34db14c5679cc4e21f89a4616b5df'],
      server_notifications: [79, '168d4ddfc362105b6435f4820b44596ba41623b43062814387384ab6da3004c4'],
    }
    for (const [group, [count, digest]] of Object.entries(expectedInventory)) if (capture.method_inventory?.[group]?.count !== count || capture.method_inventory?.[group]?.sha256 !== digest) throw new Error(file + ': Codex method inventory drifted: ' + group)
    const contract = readJson(path.resolve(path.dirname(file), doc.artifacts.native_contract.path))
    for (const [captureGroup, contractGroup] of [['client_requests', 'requests'], ['server_requests', 'server_requests'], ['server_notifications', 'notifications']]) {
      for (const method of contract[contractGroup]) if (!capture.required_governance_subset?.[captureGroup]?.includes(method)) throw new Error(file + ': Codex governance subset lost ' + method)
    }
    if (!/no thread, turn, item, approval, prompt, session, tool, model, resume, or replay/i.test(capture.claim_boundary || '')) throw new Error(file + ': Codex schema capture claim boundary drifted')
  }
  if (doc.result === 'DISCOVERY_QUALIFIED' && (trace.capture_kind !== 'live-no-model' || Object.values(doc.capabilities).some((item) => ['MISSING', 'UNKNOWN'].includes(item.status)))) throw new Error(file + ': qualified discovery lacks complete evidence')
  if (doc.result === 'NO_GO' && !doc.gaps.some((gap) => gap.severity === 'BLOCKING')) throw new Error(file + ': NO_GO requires a blocking gap')
  assertNoSensitiveStrings(doc, file)
  return { client: doc.client, version: doc.locked_runtime.version, result: doc.result }
}

const files = []
if (fs.existsSync(discoveryRoot)) {
  for (const client of fs.readdirSync(discoveryRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    for (const version of fs.readdirSync(path.join(discoveryRoot, client.name), { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
      const file = path.join(discoveryRoot, client.name, version.name, 'discovery.json')
      if (fs.existsSync(file)) files.push(file)
    }
  }
}
if (files.length !== 2) throw new Error('adapter discovery must contain exactly the frozen Claude and Codex records')
const records = files.sort().map(validate)
process.stdout.write(JSON.stringify({ ok: true, schema, checker_model_calls: 0, checker_network_calls: 0, records }, null, 2) + '\n')

module.exports = { schema, validate }
