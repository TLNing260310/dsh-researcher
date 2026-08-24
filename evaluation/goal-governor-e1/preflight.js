#!/usr/bin/env node
'use strict'

// This preflight is deliberately offline: it only reads repository files,
// materializes deterministic fixtures in the OS temp directory, and runs the
// fixture's local Node verifier. It never imports or starts DSH/model clients.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  CASE_IDS,
  INVALIDITY_RULES,
  MANIFEST_SCHEMA,
  REPLAY_COMPARE_FIELDS,
  RUN_ARTIFACT_SCHEMA,
  RUN_LOCK_SCHEMA,
  TRUSTED_VERIFIER,
  readJson,
  sha256File,
  snapshotTree,
  treeHash,
  validateManifest,
  walkFiles,
} = require('./lib.js')
const { materialize } = require('../../fixtures/goal-governor-e1/materialize.js')
const { immutableSnapshot, runExternalVerifier } = require('./external-verifier.js')
const { guardVerdict } = require('./runner/e1-host-tool.js').__test
const { createStage1Seal, validateStage1Seal, workspaceSnapshot: stageWorkspaceSnapshot } = require('./stage1-seal.js')
const { directoryInventory, sanitizeNodeEnvironment, NODE_ENV_DENYLIST } = require('./runtime-provenance.js')
const { beginAttempt, finishAttempt, assertClosedLedger } = require('./attempt-ledger.js')
const { EXACT_VISIBLE_TOOL_NAMES, INHERITED_VISIBLE_TOOL_NAMES, createVisibleToolContract, validateCaptureReport } = require('./visible-tool-contract.js')
const {
  ATTESTATION_SCHEMA,
  BUNDLE_COMMITMENT_SCHEMA,
  createAttestation,
  createBundleCommitment,
  verifyAttestation,
} = require('./bundle-integrity.js')
const { validateState } = require('../../lib/cognition-core/index.js')
const { validateGoalContract } = require('../../lib/goal-core/index.js')
const { validateRegistry } = require('../../lib/verifier-core/index.js')

const EVAL_ROOT = __dirname
const REPO_ROOT = path.resolve(EVAL_ROOT, '..', '..')
const MANIFEST_PATH = path.join(EVAL_ROOT, 'manifest.json')
const EXTERNAL_VERIFIER_PATH = path.resolve(REPO_ROOT, TRUSTED_VERIFIER.source)
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
const digestMap = (entries) => Object.fromEntries(entries.map((entry) => [entry.path, entry.sha256]))

const assertFile = (file, label) => assert.equal(fs.statSync(file).isFile(), true, label + ' must be a file')

const validateSchemas = () => {
  const manifestSchema = readJson(path.join(EVAL_ROOT, 'manifest.schema.json'))
  const lockSchema = readJson(path.join(EVAL_ROOT, 'run-lock.schema.json'))
  const commitmentSchema = readJson(path.join(EVAL_ROOT, 'bundle-commitment.schema.json'))
  const attestationSchema = readJson(path.join(EVAL_ROOT, 'attestation.schema.json'))
  const scoreSchema = readJson(path.join(EVAL_ROOT, 'score-report.schema.json'))
  assert.equal(manifestSchema.properties.schema.const, MANIFEST_SCHEMA)
  assert.equal(lockSchema.properties.schema.const, RUN_LOCK_SCHEMA)
  assert.deepEqual(manifestSchema.properties.replay_semantics.properties.compare.const, [...REPLAY_COMPARE_FIELDS])
  for (const field of ['status', 'trusted_verifier', 'visible_tool_contract', 'attempt_ledger', 'invalidity_rules', 'replay_semantics']) assert.ok(manifestSchema.required.includes(field), 'manifest schema must require ' + field)
  for (const field of ['host_runtime', 'dsh_home_policy', 'visible_tool_contract']) assert.ok(lockSchema.required.includes(field), 'run-lock schema must require ' + field)
  assert.equal(commitmentSchema.properties.schema.const, BUNDLE_COMMITMENT_SCHEMA)
  assert.deepEqual(commitmentSchema.properties.excluded_top_level_files.const, ['score.json'])
  assert.equal(attestationSchema.properties.schema.const, ATTESTATION_SCHEMA)
  assert.equal(attestationSchema.properties.algorithm.const, 'Ed25519')
  assert.equal(scoreSchema.properties.schema.const, 'dsh-researcher/goal-governor-e1/score-report/v1')
  for (const field of ['causal_validity', 'bundle_signature', 'input_hash', 'input_hash_kind']) assert.ok(scoreSchema.required.includes(field), 'score schema must require ' + field)
}

const validateBundleIntegrityHelpers = (tempRoot) => {
  const bundle = path.join(tempRoot, 'integrity-bundle')
  fs.mkdirSync(path.join(bundle, 'nested'), { recursive: true })
  fs.writeFileSync(path.join(bundle, 'manifest.json'), '{}\n')
  fs.writeFileSync(path.join(bundle, 'run-lock.json'), '{}\n')
  fs.writeFileSync(path.join(bundle, 'attempt-ledger.jsonl'), '{}\n')
  fs.writeFileSync(path.join(bundle, 'nested', 'raw.bin'), Buffer.from([0, 1, 2, 255]))
  fs.writeFileSync(path.join(bundle, 'score.json'), '{"ignored":1}\n')
  const first = createBundleCommitment(bundle)
  fs.writeFileSync(path.join(bundle, 'score.json'), '{"ignored":2}\n')
  assert.deepEqual(createBundleCommitment(bundle), first, 'only exact top-level score.json may be excluded')
  fs.writeFileSync(path.join(bundle, 'attestation.json'), '{"included":true}\n')
  assert.notEqual(createBundleCommitment(bundle).commitment_sha256, first.commitment_sha256, 'bundle-local attestation.json must be signed like any other input')
  fs.rmSync(path.join(bundle, 'attestation.json'))

  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
  const privateFile = path.join(tempRoot, 'integrity-private.pem')
  const publicFile = path.join(tempRoot, 'integrity-public.pem')
  const attestationFile = path.join(tempRoot, 'integrity-attestation.json')
  fs.writeFileSync(privateFile, privateKey.export({ type: 'pkcs8', format: 'pem' }))
  fs.writeFileSync(publicFile, publicKey.export({ type: 'spki', format: 'pem' }))
  writeJson(attestationFile, createAttestation({ bundleRoot: bundle, privateKeyFile: privateFile }))
  const proof = verifyAttestation({ bundleRoot: bundle, attestationFile, trustedPublicKeyFile: publicFile })
  assert.equal(proof.status, 'VERIFIED_AGAINST_SUPPLIED_TRUST_ROOT')
  assert.equal(proof.commitment_sha256, first.commitment_sha256)
  fs.appendFileSync(path.join(bundle, 'nested', 'raw.bin'), Buffer.from([3]))
  assert.throws(() => verifyAttestation({ bundleRoot: bundle, attestationFile, trustedPublicKeyFile: publicFile }), /differ from the signed commitment/)
}

const validateManifestMutationGuards = (manifest) => {
  const mutate = (operation) => {
    const copy = JSON.parse(JSON.stringify(manifest))
    operation(copy)
    assert.throws(() => validateManifest(copy))
  }
  mutate((copy) => { copy.unfrozen = true })
  mutate((copy) => { copy.runtime.profile = 'interactive' })
  mutate((copy) => { copy.runtime.permission_mode = 'danger-full-access' })
  mutate((copy) => { copy.runtime.pack_chunks = true })
  mutate((copy) => { copy.runtime.title_llm = true })
  mutate((copy) => { copy.runtime.model_compaction = true })
  mutate((copy) => { copy.runtime.extra_local_tools = true })
  mutate((copy) => { copy.budget.same_for_all_cases = false })
  mutate((copy) => { copy.budget.max_tokens++ })
  mutate((copy) => { [copy.cases[0], copy.cases[1]] = [copy.cases[1], copy.cases[0]] })
  mutate((copy) => { copy.cases[0].expected_terminal = 'DONE' })
  mutate((copy) => { copy.cases[0].final_verifier_exit = 1 })
  mutate((copy) => { copy.cases[0].artifact = '../artifact.json' })
  mutate((copy) => { copy.cases[0].fixture_tree_sha256 = '0'.repeat(64) })
  mutate((copy) => { copy.artifacts.required_raw_fields.pop() })
  mutate((copy) => { copy.trusted_verifier.tool_name = 'pwsh' })
  mutate((copy) => { copy.visible_tool_contract.names.push('bash') })
  mutate((copy) => { copy.attempt_ledger.mode = 'overwrite' })
  mutate((copy) => { copy.replay_semantics.event_array_comparison = 'compare-arrays' })
}

const validatePortableSources = () => {
  const roots = [EVAL_ROOT, path.join(REPO_ROOT, 'fixtures', 'goal-governor-e1')]
  const textExtensions = new Set(['.js', '.mjs', '.json', '.yml', '.yaml', '.md', '.txt', '.ps1'])
  const forbidden = [/(?:^|[\s'"(])[A-Za-z]:[\\/][^'"\s<]+/m, /\/home\/[A-Za-z0-9._-]+/, /\/Users\/[A-Za-z0-9._-]+/]
  for (const root of roots) for (const entry of walkFiles(root)) {
    if (!textExtensions.has(path.extname(entry.path).toLowerCase())) continue
    const text = fs.readFileSync(entry.absolute, 'utf8')
    for (const pattern of forbidden) assert.equal(pattern.test(text), false, 'personal absolute path is forbidden in E1 source/config: ' + entry.path)
  }
  const outer = fs.readFileSync(path.join(EVAL_ROOT, 'run-e1.js'), 'utf8')
  for (const gate of ['--ack-live-cost', '--run-lock', '--case', '--output', 'verifyDshRuntime', 'verifyInstalledCandidate', 'outer_finalized', "path.join(caseDir, 'post', 'verifier.json')", 'process.hrtime.bigint']) assert.ok(outer.includes(gate), 'live outer runner omitted fail-closed gate ' + gate)
  assert.ok(outer.includes("'--dsh-bin is forbidden"), 'outer must reject unbound CLI shims')
  const inner = fs.readFileSync(path.join(EVAL_ROOT, 'runner', 'e1-headless.mjs'), 'utf8')
  assert.ok(inner.includes('process.stdin.isTTY'), 'inner runner must enforce interactive TTY authority')
  assert.ok(inner.includes('resume_before_followup: resumeBeforeFollowup'), 'resume must record the actually recomputed pre-followup checkpoint')
  for (const preserved of ['session.stage1.jsonl', 'session.stage1.events.json']) assert.ok(inner.includes(preserved), 'resume must preserve ' + preserved)
  assert.ok(inner.includes('agentCtx.tools.restrict({ allow: [...INHERITED_VISIBLE_TOOL_NAMES] })'), 'inherited tool restriction must run in the agent-scoped setup')
  assert.ok(inner.indexOf('createVisibleToolContract(tools.schemas(agent))') < inner.indexOf('await followup(agent, prompt)'), 'exact actual tool schemas must be checked before the first prompt')
  const patch = fs.readFileSync(path.join(EVAL_ROOT, 'runner', 'e1.patch.yml'), 'utf8')
  for (const invariant of ['session-persistence-jsonl', 'packChunks: false', 'compression: none', 'DSH_E1_SESSION_ROOT', 'DSH_E1_HOST_TOOL', 'session-title-llm']) assert.ok(patch.includes(invariant), 'live patch omitted ' + invariant)
  const governed = fs.readFileSync(path.join(REPO_ROOT, 'governed', 'agent.cordis.yml'), 'utf8')
  assert.ok(governed.includes("DSH_E1_DISABLE_MODEL_COMPACTION === '1'"), 'E1 must disable model compaction without changing the product default')
  assert.ok(governed.includes("DSH_E1_RESTRICT_TOOL_SURFACE === '1'"), 'E1 must disable scope-local extra tools without changing the product default')
  const capture = fs.readFileSync(path.join(EVAL_ROOT, 'runner', 'capture-visible-tools.mjs'), 'utf8')
  for (const forbidden of ['createUserMessage', '.followup(', 'commands.execute', 'ctx.llm']) assert.equal(capture.includes(forbidden), false, 'schema capture must not contain model/prompt/command submission path: ' + forbidden)
  assert.ok(capture.includes('model_calls: 0') && capture.includes('prompt_submissions: 0'), 'schema capture must emit zero-call evidence')
}

const validateRuntimeAndRetentionHelpers = (tempRoot) => {
  const poisoned = { SAFE: '1' }
  for (const name of NODE_ENV_DENYLIST) poisoned[name] = 'untrusted'
  const sanitized = sanitizeNodeEnvironment(poisoned)
  assert.equal(sanitized.env.SAFE, '1')
  assert.deepEqual(sanitized.removed, [...NODE_ENV_DENYLIST])
  for (const name of NODE_ENV_DENYLIST) assert.equal(Object.prototype.hasOwnProperty.call(sanitized.env, name), false)
  assert.deepEqual([...EXACT_VISIBLE_TOOL_NAMES].sort(), [...EXACT_VISIBLE_TOOL_NAMES])
  for (const name of INHERITED_VISIBLE_TOOL_NAMES) assert.ok(EXACT_VISIBLE_TOOL_NAMES.includes(name), 'inherited visible tool must be inside exact contract')
  const syntheticContract = createVisibleToolContract(EXACT_VISIBLE_TOOL_NAMES.map((name) => ({ name, parameters: { type: 'object' } })))
  validateCaptureReport({
    schema: 'dsh-researcher/goal-governor-e1/visible-tools-capture/v1',
    model_calls: 0, prompt_submissions: 0, command_submissions: 0,
    node: { version: 'test' }, dsh: { package_name: '@deepseek-ai/dsh' },
    candidate: { package_name: 'dsh-researcher', package_version: 'test' },
    visible_tool_contract: syntheticContract,
  })

  const ledger = path.join(tempRoot, 'attempt-ledger.jsonl')
  const started = beginAttempt(ledger, { attempt_id: 'preflight-attempt', case_id: 'simple-done', stage: 'full', run_lock_hash: 'a'.repeat(64) })
  assert.throws(() => assertClosedLedger(ledger), /unresolved STARTED/)
  assert.throws(() => beginAttempt(ledger, { attempt_id: 'replacement', case_id: 'simple-done', stage: 'full', run_lock_hash: 'a'.repeat(64) }), /append-only/)
  finishAttempt(ledger, started, { status: 'FAILED', outer_finalized: false, error_code: 'PREFLIGHT_SENTINEL' })
  assert.equal(assertClosedLedger(ledger).length, 2)
  const bytes = fs.readFileSync(ledger, 'utf8')
  fs.writeFileSync(ledger, bytes.replace('PREFLIGHT_SENTINEL', 'PREFLIGHT_TAMPERED'))
  assert.throws(() => assertClosedLedger(ledger), /self-hash/)
}

const validateHostBoundaries = (manifest, workspace) => {
  assert.equal(sha256File(EXTERNAL_VERIFIER_PATH), TRUSTED_VERIFIER.sha256)
  assert.equal(manifest.trusted_verifier.sha256, TRUSTED_VERIFIER.sha256)
  assert.equal(guardVerdict('write', { file_path: 'src/task.js' }, workspace, workspace, ['src/task.js']), undefined)
  assert.match(guardVerdict('write', { file_path: 'verify.mjs' }, workspace, workspace, ['src/task.js']), /refused/)
  assert.match(guardVerdict('write', { file_path: 'src/task.js' }, workspace, workspace, []), /refused/)
  assert.match(guardVerdict('pwsh', { command: 'node verify.mjs' }, workspace, workspace, ['src/task.js']), /allowlist/)
  assert.equal(guardVerdict('e1_verify', {}, workspace, workspace, ['src/task.js']), undefined)
  assert.match(guardVerdict('e1_verify', { command: 'anything' }, workspace, workspace, ['src/task.js']), /exactly/)
}

const validateStage1SealHelper = (caseDir, workspace, immutableFiles, verifierResult) => {
  fs.mkdirSync(path.join(caseDir, 'stage1', 'post'), { recursive: true })
  const dshHome = path.join(caseDir, 'dsh-home')
  fs.mkdirSync(dshHome, { recursive: true })
  fs.writeFileSync(path.join(dshHome, 'session-state'), 'stage-one\n')
  const sessionId = 'e1-resume-replay-preflight'
  const runLockHash = 'a'.repeat(64)
  const contractHash = 'b'.repeat(64)
  const post = stageWorkspaceSnapshot(workspace)
  const postHash = treeHash(post)
  writeJson(path.join(caseDir, 'resume-token.json'), { session_id: sessionId, run_lock_hash: runLockHash, contract_hash: contractHash, resume_after_sequence: 3 })
  fs.writeFileSync(path.join(caseDir, 'session.stage1.jsonl'), '{"type":"session","id":"' + sessionId + '"}\n')
  writeJson(path.join(caseDir, 'session.stage1.events.json'), [{ seq: 1, type: 'tool/call' }])
  writeJson(path.join(caseDir, 'resume-stage1.json'), {
    case_id: 'resume-replay', session_id: sessionId,
    runner_exit_code: 0, runner_signal: null, runner_timed_out: false, runner_error: null,
    host_verifier: verifierResult, outer_finalized: true,
    outer_finalization: { finalized: true, expected_host_verifier_exit: 1 },
  })
  writeJson(path.join(caseDir, 'immutable-inputs.json'), immutableFiles)
  fs.writeFileSync(path.join(caseDir, 'stage1', 'post', 'git-status.txt'), '')
  fs.writeFileSync(path.join(caseDir, 'stage1', 'post', 'diff.patch'), '')
  fs.writeFileSync(path.join(caseDir, 'stage1', 'post', 'tree-hash.txt'), postHash + '\n')
  writeJson(path.join(caseDir, 'stage1', 'post', 'worktree.json'), post)
  writeJson(path.join(caseDir, 'stage1', 'post', 'verifier.json'), verifierResult)
  writeJson(path.join(caseDir, 'stage1', 'post', 'dsh-home-inventory.json'), directoryInventory(dshHome))
  const created = createStage1Seal({ caseDir, runLockHash, contractHash })
  const checked = validateStage1Seal({ caseDir, workspace, dshHome, runLockHash, contractHash, sessionId })
  assert.equal(checked.seal_sha256, created.seal_sha256)
  fs.appendFileSync(path.join(caseDir, 'session.stage1.jsonl'), '{}\n')
  assert.throws(() => validateStage1Seal({ caseDir, workspace, dshHome, runLockHash, contractHash, sessionId }), /drifted/)
}

const validateFixture = (manifest, entry, first, second) => {
  const contractFile = path.join(first, entry.contract)
  const stateFile = path.join(first, '.project-cognition', 'state.json')
  const registryFile = path.join(first, '.project-cognition', 'verifiers.json')
  for (const file of [contractFile, stateFile, registryFile, path.join(first, 'PROJECT_COGNITION.md'), path.join(first, 'fixture-case.json'), path.join(first, 'verify.mjs')]) assertFile(file, entry.id)

  const state = validateState(readJson(stateFile), { requireHash: true })
  const registry = validateRegistry(readJson(registryFile))
  const contract = validateGoalContract(readJson(contractFile), { allowDraft: false })
  assert.equal(contract.status, 'approved')
  assert.equal(contract.goal_id, 'e1-' + entry.id)
  assert.equal(contract.verifier_registry_hash, registry.registry_hash)
  assert.equal(contract.baseline.cognition_hash, state.state_hash)
  assert.deepEqual(contract.boundaries.in_scope, ['src/task.js'])
  assert.deepEqual(contract.limits, {
    max_attempts: 2,
    max_no_progress_attempts: 2,
    max_time_sec: manifest.budget.max_time_sec,
    max_tokens: manifest.budget.max_tokens,
  })
  assert.equal(contract.mode, entry.id === 'governed-gate' ? 'governed' : 'simple')
  assert.equal(contract.human_gates.length, entry.id === 'governed-gate' ? 1 : 0)
  assert.deepEqual(registry.entries[0].invocations, [{ tool_name: TRUSTED_VERIFIER.tool_name, arguments: {}, arguments_hash: registry.entries[0].invocations[0].arguments_hash }])

  const firstTree = snapshotTree(first)
  const secondTree = snapshotTree(second)
  assert.deepEqual(secondTree, firstTree, entry.id + ' must materialize byte-for-byte deterministically')

  assert.equal(fs.readFileSync(path.join(first, 'verify.mjs')).equals(fs.readFileSync(EXTERNAL_VERIFIER_PATH)), true, 'workspace verifier audit copy drifted')
  const immutableFiles = digestMap(immutableSnapshot(first, entry.allowed_changes))
  const verifier = runExternalVerifier({
    workspace: first,
    verifierPath: EXTERNAL_VERIFIER_PATH,
    verifierSource: TRUSTED_VERIFIER.source,
    expectedVerifierSha256: TRUSTED_VERIFIER.sha256,
    expectedImmutableFiles: immutableFiles,
    allowedChanges: entry.allowed_changes,
  })
  assert.equal(verifier.integrity.ok, true)
  assert.equal(verifier.workspace.unchanged, true)
  assert.equal(verifier.exit_code, entry.baseline_exit, entry.id + ' baseline verifier exit drifted\n' + String(verifier.stderr || verifier.stdout))

  const result = {
    id: entry.id,
    baseline_exit: verifier.exit_code,
    fixture_tree_sha256: treeHash(firstTree),
    contract_hash: contract.contract_hash,
    registry_hash: registry.registry_hash,
    cognition_hash: state.state_hash,
  }
  assert.equal(result.fixture_tree_sha256, entry.fixture_tree_sha256, entry.id + ' fixture hash drifted from manifest')
  assert.equal(result.contract_hash, entry.contract_hash, entry.id + ' contract hash drifted from manifest')
  assert.equal(result.registry_hash, entry.registry_hash, entry.id + ' registry hash drifted from manifest')
  assert.equal(result.cognition_hash, entry.cognition_hash, entry.id + ' cognition hash drifted from manifest')
  return result
}

const runPreflight = () => {
  const manifest = validateManifest(readJson(MANIFEST_PATH))
  validateManifestMutationGuards(manifest)
  validateSchemas()
  validatePortableSources()
  assert.equal(manifest.schema, MANIFEST_SCHEMA)
  assert.equal(manifest.artifacts.schema, RUN_ARTIFACT_SCHEMA)
  assert.deepEqual(manifest.invalidity_rules, [...INVALIDITY_RULES])
  assert.deepEqual(manifest.replay_semantics.compare, [...REPLAY_COMPARE_FIELDS])
  assert.deepEqual(manifest.cases.map((entry) => entry.id), [...CASE_IDS], 'case order is part of the E1 protocol')
  assert.equal(new Set(manifest.cases.map((entry) => entry.artifact)).size, CASE_IDS.length)
  for (const input of manifest.lock_inputs) assert.ok(fs.existsSync(path.resolve(REPO_ROOT, input)), 'missing lock input: ' + input)
  for (const entry of manifest.cases) {
    for (const prompt of Object.values(entry.prompts)) assertFile(path.resolve(REPO_ROOT, prompt), entry.id + ' prompt')
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-researcher-e1-preflight-'))
  const results = []
  try {
    validateRuntimeAndRetentionHelpers(tempRoot)
    validateBundleIntegrityHelpers(tempRoot)
    for (const entry of manifest.cases) {
      const first = path.join(tempRoot, entry.id + '-a')
      const second = path.join(tempRoot, entry.id + '-b')
      materialize({ caseId: entry.id, output: first, initGit: false })
      materialize({ caseId: entry.id, output: second, initGit: false })
      results.push(validateFixture(manifest, entry, first, second))
      if (entry.id === 'simple-done') validateHostBoundaries(manifest, first)
      if (entry.id === 'resume-replay') {
        const immutableFiles = digestMap(immutableSnapshot(first, entry.allowed_changes))
        const verifierResult = runExternalVerifier({ workspace: first, verifierPath: EXTERNAL_VERIFIER_PATH, verifierSource: TRUSTED_VERIFIER.source, expectedVerifierSha256: TRUSTED_VERIFIER.sha256, expectedImmutableFiles: immutableFiles, allowedChanges: entry.allowed_changes })
        validateStage1SealHelper(path.join(tempRoot, 'seal-case'), first, immutableFiles, verifierResult)
      }
    }
  } finally {
    const relative = path.relative(os.tmpdir(), tempRoot)
    if (relative && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative) && path.basename(tempRoot).startsWith('dsh-researcher-e1-preflight-')) {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  }

  return {
    schema: 'dsh-researcher/goal-governor-e1/preflight-report/v1',
    ok: true,
    offline: true,
    model_calls: 0,
    network_calls: 0,
    status: manifest.status,
    cases: results,
  }
}

const main = () => process.stdout.write(JSON.stringify(runPreflight(), null, 2) + '\n')

if (require.main === module) {
  try { main() } catch (error) {
    process.stderr.write('E1 preflight: ' + error.message + '\n')
    process.exitCode = 1
  }
}

module.exports = { runPreflight }
