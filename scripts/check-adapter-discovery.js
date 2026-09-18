#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { CLAUDE_SDK_LOCK } = require('./claude-agent-sdk-lock.js')
const { CODEX_CLI_LOCK } = require('./codex-cli-lock.js')
const { hashCanonical } = require('../lib/canonical-json.js')
const { FIXTURE_SCHEMA, RESULT_SCHEMA, REPLAY_RESULT_SCHEMA, PROVENANCE, projectSemanticFixture, replaySemanticFixture } = require('../evaluation/adapter-discovery/semantic-fixture.js')

const root = path.resolve(__dirname, '..')
const discoveryRoot = path.join(root, 'evaluation', 'adapter-discovery')
const schema = 'dsh-researcher/adapter-discovery/v1'
const allowedResults = new Set(['DISCOVERY_QUALIFIED', 'HOLD', 'NO_GO'])
const allowedEvidence = new Set(['OBSERVED', 'DOCUMENTED', 'MISSING', 'UNKNOWN'])
const officialHosts = new Set(['developers.openai.com', 'learn.chatgpt.com', 'platform.claude.com', 'docs.anthropic.com', 'registry.npmjs.org'])
const requiredCapabilities = ['ordered_events', 'stable_call_id', 'human_approval', 'hard_stop', 'event_replay', 'usage_coverage', 'write_boundary']
const hostEventKinds = new Set(['user_action', 'tool_call', 'tool_result', 'goal_transition', 'usage', 'turn_end', 'session_resume', 'guard_violation'])

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
    const lockedExecutable = CODEX_CLI_LOCK.executables['win32-x64']
    const assertCodexExecutable = (identity, label) => {
      if (identity?.host !== 'win32-x64' || identity.basename !== lockedExecutable.basename || identity.size !== lockedExecutable.size || identity.sha256 !== lockedExecutable.sha256 || identity.version_output !== CODEX_CLI_LOCK.versionOutput || identity.path_recorded !== false) throw new Error(file + ': Codex ' + label + ' executable content lock drifted')
    }
    if (JSON.stringify(doc.locked_runtime.executable_lock) !== JSON.stringify({ host: 'win32-x64', basename: lockedExecutable.basename, size: lockedExecutable.size, sha256: lockedExecutable.sha256, path_recorded: false })) throw new Error(file + ': Codex discovery executable lock drifted')
    assertCodexExecutable(trace.executable, 'native trace')
    if (trace.prompt_submissions !== 0 || trace.session_creations !== 0) throw new Error(file + ': Codex native trace must remain prompt/session-free')
    if (!/empty thread\/list only/i.test(trace.claim_boundary || '')) throw new Error(file + ': Codex native trace claim boundary drifted')
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
    assertCodexExecutable(capture.executable, 'schema capture')
    if (capture.schema_bundle?.v2_schema_sha256 !== doc.locked_runtime.generated_schema_sha256 || capture.schema_bundle?.tree_sha256 !== doc.locked_runtime.generated_bundle_tree_sha256 || capture.schema_bundle?.file_count !== doc.locked_runtime.generated_bundle_file_count) throw new Error(file + ': Codex generated schema bundle drifted')
    const expectedInventory = {
      client_requests: [154, '2ef17afbf7e4dc11add3c4e8710baa8334e25ca9c46610d065c93b186d4e5625'],
      client_notifications: [1, 'a27ff6491cf8553bd55d6d031e204a811f1675c9064616e72cc522a56c140c77'],
      server_requests: [11, 'acd62ccbff44117c42ea6b6da69ad88b37a34db14c5679cc4e21f89a4616b5df'],
      server_notifications: [79, '168d4ddfc362105b6435f4820b44596ba41623b43062814387384ab6da3004c4'],
    }
    for (const [group, [count, digest]] of Object.entries(expectedInventory)) if (capture.method_inventory?.[group]?.count !== count || capture.method_inventory?.[group]?.sha256 !== digest) throw new Error(file + ': Codex method inventory drifted: ' + group)
    const contract = readJson(path.resolve(path.dirname(file), doc.artifacts.native_contract.path))
    assertCodexExecutable(contract.executable, 'native contract')
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

const validateBindingProvenance = (mappingFile, mapping) => {
  if (!relativeSafe(mapping.binding_provenance_path)) throw new Error(mappingFile + ': binding provenance path is missing or unsafe')
  const file = path.resolve(path.dirname(mappingFile), mapping.binding_provenance_path)
  if (!file.startsWith(path.dirname(mappingFile) + path.sep) || !fs.existsSync(file)) throw new Error(mappingFile + ': binding provenance is missing')
  const doc = readJson(file)
  exactKeys(doc, ['schema', 'client', 'runtime_version', 'source_lock', 'proofs', 'gap_fields', 'capture', 'claim_boundary'], file)
  if (doc.schema !== 'dsh-researcher/adapter-binding-provenance/v1' || doc.client !== mapping.client || !plain(doc.proofs)) throw new Error(file + ': binding provenance identity drifted')
  if (doc.capture?.model_calls !== 0 || doc.capture?.network_calls !== 0 || typeof doc.capture?.reproduction !== 'string') throw new Error(file + ': provenance capture boundary drifted')
  if (!Array.isArray(doc.gap_fields) || new Set(doc.gap_fields).size !== doc.gap_fields.length || JSON.stringify([...doc.gap_fields].sort()) !== JSON.stringify(['coverage_complete', 'principal_id', 'resume_prefix_sha256'])) throw new Error(file + ': provenance gap field set drifted')
  if (!/does not mean.*live.*authenticated.*complete.*durable.*conformance/i.test(doc.claim_boundary || '')) throw new Error(file + ': provenance claim boundary drifted')
  const nativeContract = readJson(path.join(path.dirname(mappingFile), 'native-contract.json'))
  if (doc.runtime_version !== nativeContract.runtime_version) throw new Error(file + ': provenance runtime lock drifted')
  if (mapping.client === 'claude-code-agent-sdk') {
    exactKeys(doc.source_lock, ['kind', 'path_hint', 'sha256'], file + ': Claude source lock')
    if (doc.source_lock.kind !== 'typescript-declaration' || doc.source_lock.path_hint !== 'sdk.d.ts' || doc.source_lock.sha256 !== nativeContract.sdk_types_sha256 || doc.source_lock.sha256 !== CLAUDE_SDK_LOCK.files['sdk.d.ts']) throw new Error(file + ': Claude provenance source lock drifted')
  } else if (mapping.client === 'codex-app-server-stdio') {
    exactKeys(doc.source_lock, ['kind', 'generator', 'tree_sha256', 'files'], file + ': Codex source lock')
    if (doc.source_lock.kind !== 'generated-json-schema-bundle' || doc.source_lock.generator !== nativeContract.generator || doc.source_lock.tree_sha256 !== nativeContract.generated_bundle.tree_sha256 || !plain(doc.source_lock.files)) throw new Error(file + ': Codex provenance source lock drifted')
    if (doc.source_lock.files['codex_app_server_protocol.v2.schemas.json'] !== nativeContract.generated_v2_schema_sha256) throw new Error(file + ': Codex provenance v2 schema lock drifted')
    for (const [source, digest] of Object.entries(doc.source_lock.files)) if (!relativeSafe(source) || !/^[a-f0-9]{64}$/.test(digest)) throw new Error(file + ': invalid Codex provenance file lock')
  } else throw new Error(file + ': unsupported provenance client')
  const usedProofs = new Set()
  const observedGapFields = new Set()
  for (const item of mapping.mappings) {
    for (const [field, binding] of Object.entries(item.normalized_bindings)) {
      if (binding.status === 'DOCUMENTED') {
        if (typeof binding.proof !== 'string' || !plain(doc.proofs[binding.proof])) throw new Error(file + ': documented binding lacks a valid provenance proof: ' + item.host_kind + '/' + field)
        usedProofs.add(binding.proof)
      } else {
        if (binding.proof !== null) throw new Error(file + ': gap binding must not claim provenance: ' + item.host_kind + '/' + field)
        observedGapFields.add(field)
      }
    }
  }
  if (JSON.stringify([...observedGapFields].sort()) !== JSON.stringify([...doc.gap_fields].sort())) throw new Error(file + ': mapping gaps do not match provenance gaps')
  if (JSON.stringify([...usedProofs].sort()) !== JSON.stringify(Object.keys(doc.proofs).sort())) throw new Error(file + ': provenance contains unused or unbound proofs')
  for (const [id, proof] of Object.entries(doc.proofs)) {
    if (!/^[a-z0-9.-]+$/.test(id) || typeof proof.semantic_limit !== 'string' && proof.semantic_limit !== null) throw new Error(file + ': invalid provenance proof: ' + id)
    if (mapping.client === 'claude-code-agent-sdk') {
      exactKeys(proof, ['symbol', 'members', 'semantic_limit'], file + ': Claude proof ' + id)
      if (typeof proof.symbol !== 'string' || !Array.isArray(proof.members) || proof.members.length === 0 || proof.members.some((member) => typeof member !== 'string' || member.length === 0)) throw new Error(file + ': invalid Claude proof locator: ' + id)
    } else {
      exactKeys(proof, ['source', 'pointer', 'semantic_limit'], file + ': Codex proof ' + id)
      if (typeof proof.source !== 'string' || typeof proof.pointer !== 'string' || proof.pointer.length === 0) throw new Error(file + ': invalid Codex proof locator: ' + id)
      for (const source of proof.source.split('|')) if (!Object.hasOwn(doc.source_lock.files, source)) throw new Error(file + ': Codex proof uses an unlocked source: ' + id)
    }
  }
  assertNoSensitiveStrings(doc, file)
  return { path: file, proof_count: usedProofs.size, proof_ids: new Set(Object.keys(doc.proofs)), gap_fields: doc.gap_fields.length }
}

const cohesionPolicy = {
  'claude-code-agent-sdk': {
    tool_call: ['SINGLE_EVENT', 'COHESIVE'],
    tool_result: ['SINGLE_EVENT', 'COHESIVE'],
    user_action: ['UNJOINED', 'GAP'],
    usage: ['SINGLE_EVENT', 'COHESIVE'],
    turn_end: ['SINGLE_EVENT', 'COHESIVE'],
    session_resume: ['SINGLE_EVENT', 'COHESIVE'],
    goal_transition: ['HOST_CONTEXT_JOIN', 'CONDITIONAL'],
  },
  'codex-app-server-stdio': {
    tool_call: ['SINGLE_EVENT', 'COHESIVE'],
    tool_result: ['SINGLE_EVENT', 'COHESIVE'],
    user_action: ['NATIVE_KEY_JOIN', 'COHESIVE'],
    usage: ['SINGLE_EVENT', 'COHESIVE'],
    turn_end: ['SINGLE_EVENT', 'COHESIVE'],
    session_resume: ['SINGLE_EVENT', 'COHESIVE'],
    goal_transition: ['NATIVE_KEY_JOIN', 'COHESIVE'],
  },
}

const validateEventCohesion = (mappingFile, mapping, provenance) => {
  if (!relativeSafe(mapping.event_cohesion_path)) throw new Error(mappingFile + ': event cohesion path is missing or unsafe')
  const file = path.resolve(path.dirname(mappingFile), mapping.event_cohesion_path)
  if (!file.startsWith(path.dirname(mappingFile) + path.sep) || !fs.existsSync(file)) throw new Error(mappingFile + ': event cohesion artifact is missing')
  const doc = readJson(file)
  exactKeys(doc, ['schema', 'client', 'runtime_version', 'mapping_sha256', 'events', 'negative_contract_checks', 'summary', 'claim_boundary'], file)
  if (doc.schema !== 'dsh-researcher/adapter-event-cohesion/v1' || doc.client !== mapping.client || doc.mapping_sha256 !== sha256(mappingFile)) throw new Error(file + ': event cohesion identity or mapping lock drifted')
  const nativeContract = readJson(path.join(path.dirname(mappingFile), 'native-contract.json'))
  if (doc.runtime_version !== nativeContract.runtime_version || !Array.isArray(doc.events) || doc.events.length !== mapping.mappings.length) throw new Error(file + ': event cohesion runtime or event count drifted')
  const mappingByKind = new Map(mapping.mappings.map((item) => [item.host_kind, item]))
  const policy = cohesionPolicy[mapping.client]
  if (!policy) throw new Error(file + ': event cohesion client has no frozen policy')
  const counts = { single_event: 0, native_key_join: 0, host_context_join: 0, unjoined: 0, cohesive: 0, conditional: 0, gap: 0 }
  const seen = new Set()
  for (const event of doc.events) {
    exactKeys(event, ['host_kind', 'source_frames', 'assembly', 'status', 'documented_binding_proofs', 'join_proofs', 'limitation'], file + ': cohesion event')
    if (seen.has(event.host_kind) || !mappingByKind.has(event.host_kind)) throw new Error(file + ': duplicate or unknown cohesion host kind: ' + event.host_kind)
    seen.add(event.host_kind)
    const [expectedAssembly, expectedStatus] = policy[event.host_kind] || []
    if (event.assembly !== expectedAssembly || event.status !== expectedStatus) throw new Error(file + ': cohesion policy promotion or drift: ' + event.host_kind)
    if (!Array.isArray(event.source_frames) || event.source_frames.length === 0 || event.source_frames.some((source) => typeof source !== 'string' || source.length === 0) || typeof event.limitation !== 'string' || event.limitation.length < 30) throw new Error(file + ': invalid cohesion source or limitation: ' + event.host_kind)
    const expectedProofs = [...new Set(Object.values(mappingByKind.get(event.host_kind).normalized_bindings).filter((binding) => binding.status === 'DOCUMENTED').map((binding) => binding.proof))].sort()
    if (!Array.isArray(event.documented_binding_proofs) || JSON.stringify([...event.documented_binding_proofs].sort()) !== JSON.stringify(expectedProofs)) throw new Error(file + ': cohesion binding proof coverage drifted: ' + event.host_kind)
    if (!Array.isArray(event.join_proofs) || event.join_proofs.some((proof) => !provenance.proof_ids.has(proof))) throw new Error(file + ': cohesion join uses an unknown contract proof: ' + event.host_kind)
    if (event.assembly === 'NATIVE_KEY_JOIN' && event.join_proofs.length === 0) throw new Error(file + ': native-key join lacks a contract proof: ' + event.host_kind)
    if (event.assembly !== 'NATIVE_KEY_JOIN' && event.join_proofs.length !== 0) throw new Error(file + ': non-native join must not claim native join proofs: ' + event.host_kind)
    counts[event.assembly.toLowerCase()] += 1
    counts[event.status.toLowerCase()] += 1
  }
  if (!Array.isArray(doc.negative_contract_checks)) throw new Error(file + ': cohesion negative contract checks are missing')
  const expectedNegativeChecks = mapping.client === 'claude-code-agent-sdk' ? [
    ['PermissionRequestHookInput', ['prompt_id', 'session_id', 'tool_input', 'tool_name'], ['requestId', 'request_id', 'tool_use_id'], 'user_action remains UNJOINED'],
    ['CanUseTool.options', ['requestId', 'toolUseID'], ['prompt_id', 'session_id'], 'user_action remains UNJOINED'],
    ['SDKControlInterruptResponse', ['cancelled', 'still_queued'], ['prompt_id', 'request_id', 'session_id'], 'goal_transition remains HOST_CONTEXT_JOIN'],
    ['StopHookInput', ['hook_event_name', 'prompt_id', 'session_id'], ['interrupt_receipt_id', 'request_id'], 'goal_transition remains HOST_CONTEXT_JOIN'],
  ] : []
  const normalizedNegativeChecks = doc.negative_contract_checks.map((check) => {
    exactKeys(check, ['symbol', 'present', 'absent', 'supports'], file + ': negative contract check')
    if (typeof check.symbol !== 'string' || !Array.isArray(check.present) || !Array.isArray(check.absent) || typeof check.supports !== 'string' || check.present.some((field) => check.absent.includes(field))) throw new Error(file + ': invalid negative contract check')
    return [check.symbol, [...check.present].sort(), [...check.absent].sort(), check.supports]
  })
  if (JSON.stringify(normalizedNegativeChecks) !== JSON.stringify(expectedNegativeChecks)) throw new Error(file + ': negative contract evidence drifted')
  if (seen.size !== Object.keys(policy).length || JSON.stringify(doc.summary) !== JSON.stringify(counts)) throw new Error(file + ': event cohesion summary or host-kind coverage drifted')
  if (!/does not prove.*live.*authenticity.*completeness.*durability.*enforcement.*compatibility.*portability.*conformance.*outcome/i.test(doc.claim_boundary || '')) throw new Error(file + ': event cohesion claim boundary drifted')
  assertNoSensitiveStrings(doc, file)
  return counts
}

const semanticFixturePolicy = {
  'claude-code-agent-sdk': {
    summary: { projected: 6, unresolved: 1, cohesive: 5, conditional: 1, host_kinds: ['goal_transition', 'session_resume', 'tool_call', 'tool_result', 'turn_end', 'usage', 'user_action'] },
    unresolved: [['user_action', 'no_shared_native_join_key_between_permission_hook_and_callback']],
    replay: { split_after_native_seq: 7, prefix_projected: 5, prefix_unresolved: 2, resolved: ['goal_transition'], retained: ['user_action'], changed: [] },
  },
  'codex-app-server-stdio': {
    summary: { projected: 8, unresolved: 0, cohesive: 8, conditional: 0, host_kinds: ['goal_transition', 'session_resume', 'tool_call', 'tool_result', 'turn_end', 'usage', 'user_action'] },
    unresolved: [],
    replay: { split_after_native_seq: 8, prefix_projected: 6, prefix_unresolved: 1, resolved: ['goal_transition'], retained: [], changed: [] },
  },
}

const validateSemanticFixture = (mappingFile, mapping) => {
  const file = path.join(path.dirname(mappingFile), 'semantic-fixture.json')
  if (!fs.existsSync(file)) throw new Error(mappingFile + ': semantic fixture is missing')
  const fixture = readJson(file)
  exactKeys(fixture, ['schema', 'client', 'runtime_version', 'provenance', 'model_calls', 'network_calls', 'native_events', 'expected_result_sha256', 'replay'], file)
  exactKeys(fixture.replay, ['split_after_native_seq', 'expected_result_sha256'], file + ': replay lock')
  const nativeContract = readJson(path.join(path.dirname(mappingFile), 'native-contract.json'))
  if (fixture.schema !== FIXTURE_SCHEMA || fixture.client !== mapping.client || fixture.runtime_version !== nativeContract.runtime_version) throw new Error(file + ': semantic fixture identity or runtime lock drifted')
  if (fixture.provenance !== PROVENANCE || fixture.model_calls !== 0 || fixture.network_calls !== 0 || !/^[a-f0-9]{64}$/.test(fixture.expected_result_sha256)) throw new Error(file + ': semantic fixture provenance, execution boundary, or result lock drifted')
  assertNoSensitiveStrings(fixture, file)
  const result = projectSemanticFixture(fixture)
  if (result.schema !== RESULT_SCHEMA || result.client !== mapping.client || result.model_calls !== 0 || result.network_calls !== 0) throw new Error(file + ': semantic projection result boundary drifted')
  if (hashCanonical(result) !== fixture.expected_result_sha256) throw new Error(file + ': semantic projection result hash drifted')
  const policy = semanticFixturePolicy[mapping.client]
  if (!policy || JSON.stringify(result.summary) !== JSON.stringify(policy.summary)) throw new Error(file + ': semantic projection summary drifted')
  const unresolved = result.unresolved.map((item) => [item.host_kind, item.reason])
  if (JSON.stringify(unresolved) !== JSON.stringify(policy.unresolved)) throw new Error(file + ': semantic projection unresolved boundary drifted')
  if (!/does not prove.*native emission.*authenticity.*completeness.*durability.*enforcement.*compatibility.*portability.*conformance.*outcome/i.test(result.claim_boundary || '')) throw new Error(file + ': semantic projection claim boundary drifted')
  const replay = replaySemanticFixture(fixture)
  if (replay.schema !== REPLAY_RESULT_SCHEMA || replay.model_calls !== 0 || replay.network_calls !== 0 || hashCanonical(replay) !== fixture.replay.expected_result_sha256) throw new Error(file + ': semantic replay result boundary or hash drifted')
  const replayObserved = {
    split_after_native_seq: replay.checkpoint.split_after_native_seq,
    prefix_projected: replay.prefix_summary.projected,
    prefix_unresolved: replay.prefix_summary.unresolved,
    resolved: replay.resolved_after_restart.map((item) => item.host_kind),
    retained: replay.retained_unresolved.map((item) => item.host_kind),
    changed: replay.changed_unresolved.map((item) => item.host_kind),
  }
  if (JSON.stringify(replayObserved) !== JSON.stringify(policy.replay) || replay.final_result_sha256 !== fixture.expected_result_sha256 || replay.projection_prefix_preserved !== true) throw new Error(file + ': semantic replay policy drifted')
  if (!/not a native restart trace.*does not prove.*client emission.*checkpoint authenticity.*durable storage.*resume correctness.*enforcement.*compatibility.*portability.*conformance.*outcome/i.test(replay.claim_boundary || '')) throw new Error(file + ': semantic replay claim boundary drifted')
  return { result_sha256: fixture.expected_result_sha256, replay_result_sha256: fixture.replay.expected_result_sha256, ...result.summary }
}

const validateConvergence = (file) => {
  const doc = readJson(file)
  if (doc.schema !== 'dsh-researcher/adapter-discovery-convergence/v1' || doc.status !== 'DISCOVERY_ONLY' || doc.governed !== false || doc.conformance_eligible !== false) throw new Error(file + ': convergence identity or boundary drifted')
  if (!Array.isArray(doc.clients) || doc.clients.length !== 2) throw new Error(file + ': convergence must bind exactly two discovery clients')
  const observedSets = []
  const bindingCoverage = {}
  const eventCohesion = {}
  const semanticFixtures = {}
  const bindingContract = doc.normalized_binding_contract
  if (!plain(bindingContract) || JSON.stringify(Object.keys(bindingContract).sort()) !== JSON.stringify([...doc.common_host_kinds].sort())) throw new Error(file + ': normalized binding contract kinds drifted')
  let bindingFields = 0
  for (const [kind, fields] of Object.entries(bindingContract)) {
    if (!Array.isArray(fields) || fields.length === 0 || fields.some((field) => typeof field !== 'string' || field.length === 0) || new Set(fields).size !== fields.length) throw new Error(file + ': invalid normalized binding contract: ' + kind)
    bindingFields += fields.length
  }
  for (const client of doc.clients) {
    if (!relativeSafe(client.mapping_path) || !/^[a-f0-9]{64}$/.test(client.mapping_sha256)) throw new Error(file + ': invalid convergence mapping binding')
    const target = path.resolve(path.dirname(file), client.mapping_path)
    if (!target.startsWith(path.dirname(file) + path.sep) || !fs.existsSync(target) || sha256(target) !== client.mapping_sha256) throw new Error(file + ': convergence mapping missing or hash drifted: ' + client.mapping_path)
    const mapping = readJson(target)
    if (mapping.schema !== 'dsh-researcher/expected-host-events/v1' || mapping.client !== client.client) throw new Error(file + ': convergence mapping identity drifted: ' + client.client)
    if (!Array.isArray(mapping.mappings) || mapping.mappings.length === 0) throw new Error(file + ': convergence mapping is empty: ' + client.client)
    const provenance = validateBindingProvenance(target, mapping)
    eventCohesion[client.client] = validateEventCohesion(target, mapping, provenance)
    semanticFixtures[client.client] = validateSemanticFixture(target, mapping)
    const kinds = mapping.mappings.map((item) => item.host_kind)
    if (kinds.some((kind) => !hostEventKinds.has(kind)) || new Set(kinds).size !== kinds.length) throw new Error(file + ': convergence mapping has unsupported or duplicate HostEvent kinds: ' + client.client)
    let documented = 0
    let gaps = 0
    for (const item of mapping.mappings) {
      if (!Array.isArray(item.required_bindings) || item.required_bindings.length === 0 || !plain(item.normalized_bindings)) throw new Error(file + ': normalized binding map is missing: ' + client.client + '/' + item.host_kind)
      const expectedFields = bindingContract[item.host_kind]
      if (!expectedFields || JSON.stringify(Object.keys(item.normalized_bindings).sort()) !== JSON.stringify([...expectedFields].sort())) throw new Error(file + ': normalized binding fields drifted: ' + client.client + '/' + item.host_kind)
      for (const [field, binding] of Object.entries(item.normalized_bindings)) {
        if (!plain(binding) || !['DOCUMENTED', 'GAP'].includes(binding.status)) throw new Error(file + ': invalid normalized binding status: ' + client.client + '/' + item.host_kind + '/' + field)
        if (binding.status === 'DOCUMENTED') {
          if (typeof binding.native !== 'string' || binding.native.length === 0 || typeof binding.proof !== 'string') throw new Error(file + ': documented normalized binding lacks a native source or proof: ' + client.client + '/' + item.host_kind + '/' + field)
          documented += 1
        } else {
          if (binding.native !== null || binding.proof !== null) throw new Error(file + ': gap normalized binding must not invent a native source or proof: ' + client.client + '/' + item.host_kind + '/' + field)
          gaps += 1
        }
      }
    }
    if (documented + gaps !== bindingFields) throw new Error(file + ': normalized binding coverage is incomplete: ' + client.client)
    bindingCoverage[client.client] = { documented, gaps }
    observedSets.push([...kinds].sort())
  }
  if (JSON.stringify(observedSets[0]) !== JSON.stringify(observedSets[1]) || JSON.stringify(doc.common_host_kinds) !== JSON.stringify(observedSets[0])) throw new Error(file + ': declared common HostEvent kinds do not equal both native mappings')
  const requirementNames = ['call_result_correlation', 'human_principal_receipt', 'raw_first_durability', 'resume_prefix_checkpoint', 'terminal_enforcement', 'usage_completeness']
  if (JSON.stringify(Object.keys(doc.requirements || {}).sort()) !== JSON.stringify(requirementNames)) throw new Error(file + ': convergence requirement set drifted')
  for (const [name, requirement] of Object.entries(doc.requirements)) {
    const expected = name === 'call_result_correlation' ? 'CANDIDATE' : 'GAP'
    if (requirement.status !== expected || typeof requirement.statement !== 'string' || requirement.statement.length < 40) throw new Error(file + ': convergence requirement boundary drifted: ' + name)
  }
  if (JSON.stringify(doc.unmapped_host_kinds) !== JSON.stringify(['guard_violation'])) throw new Error(file + ': convergence unmapped HostEvent boundary drifted')
  if (!/does not prove.*compatibility.*portability.*conformance/i.test(doc.claim_boundary || '')) throw new Error(file + ': convergence claim boundary drifted')
  assertNoSensitiveStrings(doc, file)
  return { status: doc.status, common_host_kinds: doc.common_host_kinds.length, binding_fields: bindingFields, binding_coverage: bindingCoverage, event_cohesion: eventCohesion, semantic_fixtures: semanticFixtures, shared_governance_gaps: Object.values(doc.requirements).filter((item) => item.status === 'GAP').length }
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
const convergence = validateConvergence(path.join(discoveryRoot, 'host-event-convergence-v1.json'))
process.stdout.write(JSON.stringify({ ok: true, schema, checker_model_calls: 0, checker_network_calls: 0, records, convergence }, null, 2) + '\n')

module.exports = { schema, validate, validateBindingProvenance, validateEventCohesion, validateSemanticFixture, validateConvergence }
