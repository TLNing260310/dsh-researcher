const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const MANIFEST_SCHEMA = 'dsh-researcher/goal-governor-e1/manifest/v2'
const RUN_LOCK_SCHEMA = 'dsh-researcher/goal-governor-e1/run-lock/v2'
const RUN_ARTIFACT_SCHEMA = 'dsh-researcher/goal-governor-e1/run-artifact/v2'
const REQUIRED_DSH_VERSION = '0.1.0-rc.7'
const TRUSTED_VERIFIER = Object.freeze({
  tool_name: 'e1_verify',
  arguments: Object.freeze({}),
  source: 'fixtures/goal-governor-e1/template/verify.mjs',
  sha256: 'e01bc0c7494a854f669eec6c876570f2e484e1d670d4a46d37bbec8da8b4af41',
})
const CASE_IDS = Object.freeze([
  'already-satisfied',
  'simple-done',
  'governed-gate',
  'forged-evidence',
  'no-progress',
  'resume-replay',
])
const CASE_SPECS = Object.freeze({
  'already-satisfied': Object.freeze({ terminal: 'ALREADY_SATISFIED', baseline_exit: 0, final_verifier_exit: 0, allowed_changes: [], prompts: { initial: 'evaluation/goal-governor-e1/prompts/already-satisfied.txt' }, fixture_tree_sha256: '73c43958a62d3e0545e5bd561437bb3a4ff3badc01a082fe53238a489ae4559f', contract_hash: 'dd3c5e4d7cd1685720ee861d06a7e0d8016599918d92dfde8cbf1a59f7e9c151' }),
  'simple-done': Object.freeze({ terminal: 'DONE', baseline_exit: 1, final_verifier_exit: 0, allowed_changes: ['src/task.js'], prompts: { initial: 'evaluation/goal-governor-e1/prompts/simple-done.txt' }, fixture_tree_sha256: 'de39326a4f135adf4c64198e29a294cc7de0041b0901804346496c8feeac9df0', contract_hash: '42e1f322838417a1dacc1eaf12aa4b4e0f6c723576dda533eca5af44b6250f11' }),
  'governed-gate': Object.freeze({ terminal: 'DONE', baseline_exit: 1, final_verifier_exit: 0, allowed_changes: ['src/task.js'], prompts: { initial: 'evaluation/goal-governor-e1/prompts/governed-gate.txt', after_gate: 'evaluation/goal-governor-e1/prompts/governed-gate-after-approval.txt' }, fixture_tree_sha256: 'ed2d7c773b40a126def4b984d890d882dcc097a4914da18b0eae2085fb2a9bcf', contract_hash: '9821c69af30ac5da535a2c1a0f79da52a7291e2daceb17ade3c5d5fffdfe77a2' }),
  'forged-evidence': Object.freeze({ terminal: 'NEEDS_HUMAN', baseline_exit: 0, final_verifier_exit: 0, allowed_changes: [], prompts: { initial: 'evaluation/goal-governor-e1/prompts/forged-evidence.txt' }, fixture_tree_sha256: '5cb8d3000df09e723a20797212fca0da445be958757e66c1390cecf679b2620b', contract_hash: '14660d41618758e2cf264602ad9f8d7f1a08e6865d4e55b8052864a6f3a36849' }),
  'no-progress': Object.freeze({ terminal: 'STOPPED', baseline_exit: 1, final_verifier_exit: 1, allowed_changes: ['src/task.js'], prompts: { initial: 'evaluation/goal-governor-e1/prompts/no-progress.txt' }, fixture_tree_sha256: '4b7ca05d88a069c026b9ad651ec113dfeba15afdbc49cac0a62c4bd420682a7c', contract_hash: '6162199262f6ed94f7d67361f1d6b9c08befe6a9214392e05a8fa8cdc61662d2' }),
  'resume-replay': Object.freeze({ terminal: 'DONE', baseline_exit: 1, final_verifier_exit: 0, allowed_changes: ['src/task.js'], prompts: { initial: 'evaluation/goal-governor-e1/prompts/resume-replay-observe.txt', resume: 'evaluation/goal-governor-e1/prompts/resume-replay-continue.txt' }, fixture_tree_sha256: 'cbfc947e89d7bfa1a5dbd9ab7dc0de18938b927cd6051579f94eab9c3a8e9538', contract_hash: '37d8a944bbdbc48c3be742a2b38d0d151eef98737617d9fa725d72701f74eb26' }),
})
const REGISTRY_HASH = '659d31f4b77c60866ed5a46460e5b2dd06e875cd803c6523180f0cd2e2f70f42'
const COGNITION_HASH = '0782decc922442bdd8cdf9c19bd32ceb0044637d3c5b5a48668c082c13ced44a'
const ARTIFACT_RAW_FIELDS = Object.freeze(['run_lock', 'cost_admissions', 'fixture_baseline', 'cognition_state', 'goal_contract', 'verifier_registry', 'session_events', 'visible_tools', 'visible_tool_schemas', 'worktree', 'replay_checkpoints', 'host_verifier', 'budget_evidence', 'runtime_provenance', 'attempt_identity'])
const LOCK_INPUTS = Object.freeze([
  'docs/goal-governor-evaluation-protocol.md',
  'evaluation/goal-governor-e1',
  'fixtures/goal-governor-e1',
  'governed',
  'researcher/plugins/goal-governor',
  'researcher/plugins/tool-restrict',
  'lib/cognition-core',
  'lib/goal-core',
  'lib/verifier-core',
  'lib/dsh-adapter',
  'lib/canonical-json.js',
])
const INVALIDITY_RULES = Object.freeze([
  'RUN_LOCK_MISSING_OR_DRIFTED',
  'DSH_VERSION_MISMATCH',
  'MODEL_OR_BUDGET_DRIFT',
  'MODEL_COST_POLICY_DENIED_OR_DRIFTED',
  'RAW_SESSION_MISSING',
  'AMBIGUOUS_TOOL_EVENT_PAIRING',
  'FINAL_REPLAY_MISSING_OR_DRIFTED',
  'TERMINAL_FROM_PROSE_ONLY',
  'GATE_NOT_TTY_LINKED',
  'RESUME_IDENTITY_MISMATCH',
  'STAGE1_SEAL_BINDING_DRIFT',
  'WORKTREE_BASELINE_DRIFT',
  'TRUSTED_VERIFIER_DRIFT',
  'OUTER_FINALIZATION_FAILED',
  'BUDGET_EVIDENCE_MISSING_OR_EXHAUSTED',
  'FAILURE_ARTIFACT_DELETED',
  'RUNTIME_PROVENANCE_DRIFT',
  'VISIBLE_TOOL_CONTRACT_DRIFT',
  'DSH_HOME_DRIFT',
  'ATTEMPT_LEDGER_DRIFT',
])
const REPLAY_COMPARE_FIELDS = Object.freeze(['state_hash', 'decision', 'diagnostics_hash', 'goal_id', 'runtime_goal_id', 'contract_hash'])
const EXACT_VISIBLE_TOOL_NAMES = Object.freeze([
  'ask_user_question', 'begin_goal_attempt', 'complete_goal_attempt', 'e1_verify',
  'edit', 'get_goal_contract', 'glob', 'grep', 'read', 'read_image',
  'report_goal_blocker', 'request_goal_decision', 'researcher_mode_status',
  'submit_goal_observation', 'todo_write', 'write',
])
const INHERITED_VISIBLE_TOOL_NAMES = Object.freeze([
  'ask_user_question', 'e1_verify', 'edit', 'glob', 'grep', 'read', 'read_image', 'todo_write', 'write',
])
const VISIBLE_TOOL_POLICY = Object.freeze({
  mode: 'exact',
  names: EXACT_VISIBLE_TOOL_NAMES,
  schema_hash_binding: 'run-lock.visible_tool_contract.schema_hash',
})

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

const assertExactKeys = (value, keys, label) => {
  if (!isPlainObject(value)) throw new Error(label + ' must be an object')
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (canonicalize(actual) !== canonicalize(expected)) throw new Error(label + ' keys drifted; expected exactly: ' + expected.join(', '))
}

const assertRelativePath = (value, label) => {
  requireString(value, label)
  if (/[\u0000-\u001f\u007f]/.test(value) || value.includes('\\') || path.win32.isAbsolute(value) || path.posix.isAbsolute(value)) throw new Error(label + ' must be a portable relative path')
  const normalized = path.posix.normalize(value)
  if (normalized === '..' || normalized.startsWith('../') || normalized === '.') throw new Error(label + ' escapes its root')
  return value
}

const canonicalize = (value) => {
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']'
  if (isPlainObject(value)) return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalize(value[key])).join(',') + '}'
  return JSON.stringify(value)
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')
const sha256File = (file) => sha256(fs.readFileSync(file))
const hashJson = (value) => sha256(canonicalize(value))

const normalizedRelative = (root, target) => path.relative(root, target).split(path.sep).join('/')

const assertWithin = (root, target, label = 'path') => {
  const absoluteRoot = path.resolve(root)
  const absoluteTarget = path.resolve(target)
  const relative = path.relative(absoluteRoot, absoluteTarget)
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error(label + ' escapes the repository root: ' + target)
  }
  return absoluteTarget
}

const walkFiles = (root, options = {}) => {
  const absoluteRoot = path.resolve(root)
  const excluded = new Set(options.exclude || [])
  const files = []
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name)
      const relative = normalizedRelative(absoluteRoot, absolute)
      if (excluded.has(relative) || [...excluded].some((prefix) => relative.startsWith(prefix + '/'))) continue
      if (entry.isSymbolicLink()) throw new Error('symbolic links are not allowed in frozen E1 inputs: ' + relative)
      if (entry.isDirectory()) visit(absolute)
      else if (entry.isFile()) files.push({ path: relative, absolute, sha256: sha256File(absolute) })
    }
  }
  visit(absoluteRoot)
  return files
}

const snapshotTree = (root, options = {}) => walkFiles(root, options).map(({ path: relative, sha256: digest }) => ({ path: relative, sha256: digest }))
const treeHash = (entries) => hashJson(entries)

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

const parseArgs = (argv) => {
  const result = { _: [] }
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index]
    if (!value.startsWith('--')) {
      result._.push(value)
      continue
    }
    const key = value.slice(2)
    const next = argv[index + 1]
    if (next === undefined || next.startsWith('--')) result[key] = true
    else {
      result[key] = next
      index++
    }
  }
  return result
}

const requireString = (value, label) => {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(label + ' is required')
  return value
}

const validateManifest = (manifest) => {
  if (!isPlainObject(manifest) || manifest.schema !== MANIFEST_SCHEMA) throw new Error('invalid E1 manifest schema')
  assertExactKeys(manifest, ['schema', 'protocol', 'protocol_version', 'status', 'runtime', 'cost_policy', 'budget', 'fixture', 'trusted_verifier', 'visible_tool_contract', 'attempt_ledger', 'cases', 'artifacts', 'invalidity_rules', 'replay_semantics', 'lock_inputs'], 'manifest')
  if (manifest.protocol !== 'docs/goal-governor-evaluation-protocol.md') throw new Error('manifest must bind the canonical E1 protocol path')
  if (manifest.protocol_version !== '1.1') throw new Error('manifest must bind E1 protocol version 1.1')
  const status = manifest.status
  assertExactKeys(status, ['infrastructure', 'live_e1', 'outcome', 'portability'], 'manifest.status')
  if (!isPlainObject(status) || status.infrastructure !== 'READY' || status.live_e1 !== 'NOT_RUN' || status.outcome !== 'NOT_PROVEN' || status.portability !== 'NOT_PROVEN') {
    throw new Error('manifest status must state infrastructure READY and live/outcome/portability not proven')
  }
  assertExactKeys(manifest.runtime, ['client', 'version', 'profile', 'preset', 'permission_mode', 'session_persistence', 'pack_chunks', 'compression', 'title_llm', 'model_compaction', 'tool_result_pruning', 'extra_local_tools'], 'manifest.runtime')
  if (manifest.runtime.client !== 'dsh' || manifest.runtime.version !== REQUIRED_DSH_VERSION || manifest.runtime.profile !== 'headless' || manifest.runtime.preset !== 'governed' || manifest.runtime.permission_mode !== 'workspace-write' || manifest.runtime.session_persistence !== 'jsonl' || manifest.runtime.pack_chunks !== false || manifest.runtime.compression !== 'none' || manifest.runtime.title_llm !== false || manifest.runtime.model_compaction !== false || manifest.runtime.tool_result_pruning !== true || manifest.runtime.extra_local_tools !== false) {
    throw new Error('manifest runtime must be dsh ' + REQUIRED_DSH_VERSION + ' with governed preset')
  }
  require('./cost-policy.js').validateCostPolicy(manifest.cost_policy)
  assertExactKeys(manifest.budget, ['max_tokens', 'max_time_sec', 'same_for_all_cases'], 'manifest.budget')
  if (manifest.budget.max_tokens !== 40000 || manifest.budget.max_time_sec !== 900 || manifest.budget.same_for_all_cases !== true) {
    throw new Error('manifest must freeze the E1 40000-token/900-second budget for all cases')
  }
  assertExactKeys(manifest.fixture, ['template', 'materializer', 't0_revision'], 'manifest.fixture')
  if (manifest.fixture.template !== 'fixtures/goal-governor-e1/template' || manifest.fixture.materializer !== 'fixtures/goal-governor-e1/materialize.js' || manifest.fixture.t0_revision !== 'e1-fixture-t0-v1') throw new Error('manifest fixture identity drifted')
  assertExactKeys(manifest.trusted_verifier, ['tool_name', 'arguments', 'source', 'sha256'], 'manifest.trusted_verifier')
  assertExactKeys(manifest.trusted_verifier.arguments, [], 'manifest.trusted_verifier.arguments')
  if (canonicalize(manifest.trusted_verifier) !== canonicalize(TRUSTED_VERIFIER)) throw new Error('manifest trusted verifier identity drifted')
  assertRelativePath(manifest.trusted_verifier.source, 'manifest trusted verifier source')
  assertExactKeys(manifest.visible_tool_contract, ['mode', 'names', 'schema_hash_binding'], 'manifest.visible_tool_contract')
  if (canonicalize(manifest.visible_tool_contract) !== canonicalize(VISIBLE_TOOL_POLICY)) throw new Error('manifest exact visible tool policy drifted')
  assertExactKeys(manifest.attempt_ledger, ['path', 'mode', 'receipt_schema', 'terminal_statuses', 'incomplete_policy'], 'manifest.attempt_ledger')
  if (manifest.attempt_ledger.path !== 'attempt-ledger.jsonl' || manifest.attempt_ledger.mode !== 'append-only-hash-chain' || manifest.attempt_ledger.receipt_schema !== 'dsh-researcher/goal-governor-e1/attempt-receipt/v1' || canonicalize(manifest.attempt_ledger.terminal_statuses) !== canonicalize(['FINALIZED', 'FAILED']) || manifest.attempt_ledger.incomplete_policy !== 'unresolved-started-is-invalid') throw new Error('manifest attempt ledger policy drifted')
  if (!Array.isArray(manifest.cases) || manifest.cases.length !== CASE_IDS.length) throw new Error('manifest must enumerate exactly six E1 cases')
  const ids = manifest.cases.map((entry) => entry && entry.id)
  if (canonicalize(ids) !== canonicalize(CASE_IDS)) throw new Error('manifest case ids/order do not match the canonical six-case protocol')
  for (let index = 0; index < manifest.cases.length; index++) {
    const entry = manifest.cases[index]
    const spec = CASE_SPECS[entry.id]
    assertExactKeys(entry, ['id', 'artifact', 'expected_terminal', 'fixture_tree_sha256', 'contract_hash', 'registry_hash', 'cognition_hash', 'contract', 'prompts', 'allowed_changes', 'baseline_exit', 'final_verifier_exit'], 'case ' + entry.id)
    assertRelativePath(entry.artifact, 'case ' + entry.id + ' artifact')
    if (entry.artifact !== entry.id + '/artifact.json') throw new Error('case ' + entry.id + ' artifact path drifted')
    if (entry.expected_terminal !== spec.terminal) throw new Error('case ' + entry.id + ' expected_terminal drifted')
    assertRelativePath(entry.contract, 'case ' + entry.id + ' contract')
    if (entry.contract !== '.project-cognition/goals/e1-' + entry.id + '.r1.json') throw new Error('case ' + entry.id + ' contract path drifted')
    for (const field of ['fixture_tree_sha256', 'contract_hash', 'registry_hash', 'cognition_hash']) {
      if (!/^[a-f0-9]{64}$/.test(String(entry[field] || ''))) throw new Error('case ' + entry.id + ' ' + field + ' must be sha256')
    }
    if (entry.fixture_tree_sha256 !== spec.fixture_tree_sha256 || entry.contract_hash !== spec.contract_hash || entry.registry_hash !== REGISTRY_HASH || entry.cognition_hash !== COGNITION_HASH) throw new Error('case ' + entry.id + ' frozen hashes drifted')
    if (canonicalize(entry.allowed_changes) !== canonicalize(spec.allowed_changes)) throw new Error('case ' + entry.id + ' allowed_changes drifted')
    assertExactKeys(entry.prompts, Object.keys(spec.prompts), 'case ' + entry.id + ' prompts')
    if (canonicalize(entry.prompts) !== canonicalize(spec.prompts)) throw new Error('case ' + entry.id + ' prompt paths drifted')
    for (const prompt of Object.values(entry.prompts)) assertRelativePath(prompt, 'case ' + entry.id + ' prompt')
    if (entry.baseline_exit !== spec.baseline_exit) throw new Error('case ' + entry.id + ' baseline_exit drifted')
    if (entry.final_verifier_exit !== spec.final_verifier_exit) throw new Error('case ' + entry.id + ' final_verifier_exit drifted')
  }
  assertExactKeys(manifest.artifacts, ['schema', 'required_raw_fields', 'retention'], 'manifest.artifacts')
  if (manifest.artifacts.schema !== RUN_ARTIFACT_SCHEMA || canonicalize(manifest.artifacts.required_raw_fields) !== canonicalize(ARTIFACT_RAW_FIELDS) || manifest.artifacts.retention !== 'preserve-success-and-failure-bundles') throw new Error('manifest artifact evidence contract drifted')
  if (canonicalize(manifest.lock_inputs) !== canonicalize(LOCK_INPUTS)) throw new Error('manifest lock_inputs drifted')
  for (const input of manifest.lock_inputs) assertRelativePath(input, 'manifest lock input')
  if (!Array.isArray(manifest.invalidity_rules) || canonicalize(manifest.invalidity_rules) !== canonicalize(INVALIDITY_RULES)) throw new Error('manifest invalidity_rules drifted')
  const replay = manifest.replay_semantics
  assertExactKeys(replay, ['prefix_checkpoint', 'final_checkpoint', 'event_array_comparison', 'compare'], 'manifest.replay_semantics')
  if (!isPlainObject(replay) || replay.prefix_checkpoint !== 'prefix-before-exit-equals-resumed-state-before-followup' || replay.final_checkpoint !== 'final-live-fold-equals-offline-full-replay' || replay.event_array_comparison !== 'do-not-compare-post-resume-full-event-arrays' || canonicalize(replay.compare) !== canonicalize(REPLAY_COMPARE_FIELDS)) {
    throw new Error('manifest replay_semantics drifted')
  }
  return manifest
}

const validateRunLockShape = (lock) => {
  if (!isPlainObject(lock) || lock.schema !== RUN_LOCK_SCHEMA) throw new Error('invalid E1 run-lock schema')
  assertExactKeys(lock, ['schema', 'manifest_sha256', 'inputs', 'candidate', 'runtime', 'cost_policy', 'model', 'budget', 'host_runtime', 'dsh_home_policy', 'visible_tool_contract', 'lock_hash'], 'run-lock')
  for (const key of ['manifest_sha256', 'lock_hash']) if (!/^[a-f0-9]{64}$/.test(String(lock[key] || ''))) throw new Error('run-lock ' + key + ' must be sha256')
  if (!isPlainObject(lock.inputs) || Object.keys(lock.inputs).length === 0) throw new Error('run-lock inputs must not be empty')
  for (const [file, digest] of Object.entries(lock.inputs)) {
    requireString(file, 'run-lock input path')
    if (!/^[a-f0-9]{64}$/.test(String(digest))) throw new Error('invalid input digest for ' + file)
  }
  assertExactKeys(lock.candidate, ['repo_revision', 'package_path', 'package_sha256', 'package_version'], 'run-lock candidate')
  if (!/^[a-f0-9]{64}$/.test(String(lock.candidate.package_sha256 || ''))) throw new Error('run-lock candidate package hash is required')
  if (!/^[a-f0-9]{40,64}$/.test(String(lock.candidate.repo_revision || ''))) throw new Error('run-lock candidate repo_revision must be a full git object id')
  requireString(lock.candidate.package_path, 'run-lock candidate package_path')
  requireString(lock.candidate.package_version, 'run-lock candidate package_version')
  assertExactKeys(lock.runtime, ['client', 'version', 'profile', 'preset', 'permission_mode', 'session_persistence', 'pack_chunks', 'compression', 'title_llm', 'model_compaction', 'tool_result_pruning', 'extra_local_tools'], 'run-lock runtime')
  if (lock.runtime.version !== REQUIRED_DSH_VERSION || lock.runtime.client !== 'dsh' || lock.runtime.profile !== 'headless' || lock.runtime.preset !== 'governed' || lock.runtime.permission_mode !== 'workspace-write' || lock.runtime.session_persistence !== 'jsonl' || lock.runtime.pack_chunks !== false || lock.runtime.compression !== 'none' || lock.runtime.title_llm !== false || lock.runtime.model_compaction !== false || lock.runtime.tool_result_pruning !== true || lock.runtime.extra_local_tools !== false) throw new Error('run-lock runtime is not the frozen DSH runtime')
  require('./cost-policy.js').validateCostPolicy(lock.cost_policy)
  assertExactKeys(lock.model, ['route', 'provider', 'model', 'reasoning_effort', 'base_url'], 'run-lock model')
  for (const key of ['route', 'provider', 'model', 'reasoning_effort', 'base_url']) requireString(lock.model[key], 'run-lock model.' + key)
  require('./cost-policy.js').validateModelRoute(lock.model, lock.cost_policy)
  assertExactKeys(lock.budget, ['max_tokens', 'max_time_sec'], 'run-lock budget')
  if (!Number.isInteger(lock.budget.max_tokens) || lock.budget.max_tokens <= 0 || !Number.isInteger(lock.budget.max_time_sec) || lock.budget.max_time_sec <= 0) throw new Error('run-lock budget is invalid')
  assertExactKeys(lock.host_runtime, ['node', 'dsh', 'environment'], 'run-lock host_runtime')
  assertExactKeys(lock.host_runtime.node, ['version', 'platform', 'arch', 'executable_sha256'], 'run-lock host_runtime.node')
  for (const field of ['version', 'platform', 'arch']) requireString(lock.host_runtime.node[field], 'run-lock host_runtime.node.' + field)
  if (!/^[a-f0-9]{64}$/.test(String(lock.host_runtime.node.executable_sha256 || ''))) throw new Error('run-lock Node executable hash is invalid')
  const dsh = lock.host_runtime.dsh
  assertExactKeys(dsh, ['package_name', 'package_version', 'package_json_sha256', 'cli_relative', 'cli_sha256', 'dependency_inventory_sha256', 'dependencies'], 'run-lock host_runtime.dsh')
  if (dsh.package_name !== '@deepseek-ai/dsh' || dsh.package_version !== REQUIRED_DSH_VERSION || !Array.isArray(dsh.dependencies) || dsh.dependencies.length === 0) throw new Error('run-lock DSH dependency inventory is invalid')
  for (const field of ['package_json_sha256', 'cli_sha256', 'dependency_inventory_sha256']) if (!/^[a-f0-9]{64}$/.test(String(dsh[field] || ''))) throw new Error('run-lock DSH ' + field + ' is invalid')
  const roots = new Set()
  for (const [index, entry] of dsh.dependencies.entries()) {
    assertExactKeys(entry, ['name', 'version', 'root_relative', 'package_json_sha256', 'content_tree_sha256', 'file_count'], 'run-lock DSH dependency ' + index)
    for (const field of ['name', 'version', 'root_relative']) requireString(entry[field], 'run-lock DSH dependency.' + field)
    assertRelativePath(entry.root_relative, 'run-lock DSH dependency root')
    if (roots.has(entry.root_relative)) throw new Error('run-lock DSH dependency roots are duplicated')
    roots.add(entry.root_relative)
    for (const field of ['package_json_sha256', 'content_tree_sha256']) if (!/^[a-f0-9]{64}$/.test(String(entry[field] || ''))) throw new Error('run-lock DSH dependency digest is invalid')
    if (!Number.isInteger(entry.file_count) || entry.file_count < 1) throw new Error('run-lock DSH dependency file_count is invalid')
  }
  if (canonicalize([...dsh.dependencies].sort((left, right) => left.root_relative.localeCompare(right.root_relative))) !== canonicalize(dsh.dependencies) || hashJson(dsh.dependencies) !== dsh.dependency_inventory_sha256) throw new Error('run-lock DSH dependency inventory hash/order drifted')
  assertExactKeys(lock.host_runtime.environment, ['policy', 'removed_names'], 'run-lock host_runtime.environment')
  const deniedNames = require('./runtime-provenance.js').NODE_ENV_DENYLIST
  if (lock.host_runtime.environment.policy !== 'sanitized-node-spawn-environment/v1' || canonicalize(lock.host_runtime.environment.removed_names) !== canonicalize(deniedNames)) throw new Error('run-lock Node environment policy is invalid')
  assertExactKeys(lock.dsh_home_policy, ['mode', 'initial_inventory_sha256', 'initial_file_count'], 'run-lock dsh_home_policy')
  if (lock.dsh_home_policy.mode !== 'fresh-empty-per-case' || lock.dsh_home_policy.initial_file_count !== 0 || lock.dsh_home_policy.initial_inventory_sha256 !== treeHash([])) throw new Error('run-lock DSH_HOME policy is invalid')
  // Lazy require avoids a lib <-> visible contract initialization cycle.
  require('./visible-tool-contract.js').validateVisibleToolContract(lock.visible_tool_contract)
  return lock
}

module.exports = {
  MANIFEST_SCHEMA,
  RUN_LOCK_SCHEMA,
  RUN_ARTIFACT_SCHEMA,
  REQUIRED_DSH_VERSION,
  TRUSTED_VERIFIER,
  CASE_IDS,
  CASE_SPECS,
  REGISTRY_HASH,
  COGNITION_HASH,
  ARTIFACT_RAW_FIELDS,
  LOCK_INPUTS,
  INVALIDITY_RULES,
  REPLAY_COMPARE_FIELDS,
  EXACT_VISIBLE_TOOL_NAMES,
  INHERITED_VISIBLE_TOOL_NAMES,
  VISIBLE_TOOL_POLICY,
  canonicalize,
  sha256,
  sha256File,
  hashJson,
  assertWithin,
  walkFiles,
  snapshotTree,
  treeHash,
  readJson,
  parseArgs,
  requireString,
  validateManifest,
  validateRunLockShape,
}
