const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const {
  DRAFT_STATE_SCHEMA, validateState, sealState,
} = require('../cognition-core/index.js')
const { validateGoalContract } = require('../goal-core/index.js')
const { validateRegistry, sealRegistry, argumentsHash } = require('../verifier-core/index.js')
const packageJson = require('../../package.json')

const REVIEW_SCHEMA = 'project-cognition/quickstart-review/v1'
const ZERO_HASH = '0'.repeat(64)
const REVIEW_MARKER = '[OWNER REVIEW REQUIRED]'
const FAILURE_MARKERS = ['[exit code:', '[timed out', '[killed by signal:', '[sandbox:']
const SAFE_QUICKSTART_POLICY = { kind: 'text_excludes', patterns: FAILURE_MARKERS }
const CANONICAL_GITHUB_PACKAGE = 'github:TLNing260310/dsh-researcher#v' + packageJson.version
const CANONICAL_COMMAND_PREFIX = 'npx -y --package=' + CANONICAL_GITHUB_PACKAGE + ' project-cognition'
const REVIEW_FILE_KEYS = ['cognition_draft', 'cognition_sealed', 'verifier_draft', 'goal_draft', 'manifest', 'instructions']

const clone = (value) => JSON.parse(JSON.stringify(value))
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const writeJson = (file, value, options = {}) => writeFile(file, JSON.stringify(value, null, 2) + '\n', options)
const writeFile = (file, content, options = {}) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  if (options.exclusive) {
    try { fs.writeFileSync(file, content, { encoding: 'utf8', flag: 'wx' }) } catch (error) {
      if (error && error.code === 'EEXIST') throw new Error('refusing to overwrite review artifact: ' + file)
      throw error
    }
    return
  }
  const temp = file + '.tmp-' + process.pid + '-' + Math.random().toString(16).slice(2)
  try {
    fs.writeFileSync(temp, content, { encoding: 'utf8', flag: 'wx' })
    fs.renameSync(temp, file)
  } finally {
    if (fs.existsSync(temp)) fs.rmSync(temp, { force: true })
  }
}

const canonicalExisting = (value) => {
  try { return fs.realpathSync.native ? fs.realpathSync.native(value) : fs.realpathSync(value) } catch (error) { return path.resolve(value) }
}
const projectIdentity = (root) => {
  const realpath = canonicalExisting(path.resolve(root))
  const stat = fs.statSync(realpath, { bigint: true })
  if (!stat.isDirectory()) throw new Error('project root is not a directory: ' + realpath)
  return {
    realpath,
    device: String(stat.dev),
    inode: String(stat.ino),
  }
}
const sameProjectIdentity = (left, right) => left && right &&
  left.realpath === right.realpath && left.device === right.device && left.inode === right.inode
const canonicalWithMissingTail = (value) => {
  let cursor = path.resolve(value)
  const missing = []
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor)
    if (parent === cursor) break
    missing.unshift(path.basename(cursor))
    cursor = parent
  }
  return path.resolve(canonicalExisting(cursor), ...missing)
}
const isWithin = (root, target) => {
  const relative = path.relative(root, target)
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
}
const assertExternalReviewDir = (root, output) => {
  const lexicalRoot = path.resolve(root)
  const lexicalOutput = path.resolve(output)
  const canonicalRoot = canonicalExisting(lexicalRoot)
  const canonicalOutput = canonicalWithMissingTail(lexicalOutput)
  if (isWithin(lexicalRoot, lexicalOutput) || isWithin(canonicalRoot, canonicalOutput)) {
    throw new Error('review directory must be outside the selected project root; drafts are provisional and must not enter that root')
  }
  return lexicalOutput
}
const safeArtifactPath = (reviewDir, relativeFile) => {
  if (typeof relativeFile !== 'string' || relativeFile.length === 0 || path.isAbsolute(relativeFile) || path.win32.isAbsolute(relativeFile) || path.posix.isAbsolute(relativeFile)) {
    throw new Error('review manifest contains an invalid artifact path')
  }
  const target = path.resolve(reviewDir, relativeFile)
  if (!isWithin(path.resolve(reviewDir), target) || !isWithin(canonicalExisting(path.resolve(reviewDir)), canonicalWithMissingTail(target))) {
    throw new Error('review manifest artifact escapes the review directory: ' + relativeFile)
  }
  return target
}
const canonicalPathKey = (file) => {
  const value = canonicalWithMissingTail(file)
  return process.platform === 'win32' ? value.toLowerCase() : value
}
const reviewArtifactPaths = (reviewDir, manifest, manifestFile) => {
  if (!manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) throw new Error('invalid quickstart review file map')
  const keys = Object.keys(manifest.files)
  if (keys.length !== REVIEW_FILE_KEYS.length || REVIEW_FILE_KEYS.some((key) => !keys.includes(key))) {
    throw new Error('quickstart review file map must contain exactly: ' + REVIEW_FILE_KEYS.join(', '))
  }
  if (manifest.files.manifest !== 'quickstart-review.json') {
    throw new Error('review manifest path must be exactly quickstart-review.json')
  }
  const files = Object.fromEntries(REVIEW_FILE_KEYS.map((key) => [key, safeArtifactPath(reviewDir, manifest.files[key])]))
  if (path.resolve(files.manifest) !== path.resolve(manifestFile)) throw new Error('review manifest file does not match quickstart-review.json')
  const pathKeys = new Set()
  const inodeKeys = new Set()
  for (const key of REVIEW_FILE_KEYS) {
    const file = files[key]
    const pathKey = canonicalPathKey(file)
    if (pathKeys.has(pathKey)) throw new Error('quickstart review artifacts must use mutually unique paths; alias detected at ' + key)
    pathKeys.add(pathKey)
    if (!fs.existsSync(file)) continue
    const stat = fs.statSync(file, { bigint: true })
    if (!stat.isFile()) throw new Error('quickstart review artifact must be a regular file: ' + key)
    if (stat.ino === 0n) continue
    const inodeKey = String(stat.dev) + ':' + String(stat.ino)
    if (inodeKeys.has(inodeKey)) throw new Error('quickstart review artifacts must not be hard-link aliases; alias detected at ' + key)
    inodeKeys.add(inodeKey)
  }
  return files
}

const canonicalCliBinding = () => ({
  kind: 'canonical-pinned-github-npx',
  package_version: packageJson.version,
  package_spec: CANONICAL_GITHUB_PACKAGE,
  command_prefix: CANONICAL_COMMAND_PREFIX,
})
const validateCliBinding = (binding) => {
  const expected = canonicalCliBinding()
  if (!binding || Object.keys(expected).some((key) => binding[key] !== expected[key]) || Object.keys(binding).length !== Object.keys(expected).length) {
    throw new Error('quickstart CLI binding does not match the current canonical pinned GitHub release')
  }
  return binding
}
const cliCommand = (manifest, args) => validateCliBinding(manifest.cli).command_prefix + ' ' + args

const slug = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'project'

const validateIdentifier = (value, label, pattern) => {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(label + ' has an invalid format: ' + value)
  return value
}

const inferVerifierCommand = (root) => {
  const packageFile = path.join(root, 'package.json')
  if (fs.existsSync(packageFile)) {
    const pkg = readJson(packageFile)
    if (pkg && pkg.scripts && typeof pkg.scripts.test === 'string' && pkg.scripts.test.trim()) return 'npm test'
  }
  if (fs.existsSync(path.join(root, 'Cargo.toml'))) return 'cargo test'
  if (fs.existsSync(path.join(root, 'go.mod'))) return 'go test ./...'
  if (fs.existsSync(path.join(root, 'pyproject.toml')) || fs.existsSync(path.join(root, 'pytest.ini'))) return 'python -m pytest'
  return null
}

const gitRevision = (root, supplied) => {
  if (supplied !== undefined) {
    if (typeof supplied !== 'string' || supplied.trim().length === 0) throw new Error('--repo-revision must be non-empty')
    return supplied.trim()
  }
  const result = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true })
  if (result.status !== 0 || !result.stdout.trim()) throw new Error('cannot determine the Git baseline; commit the repository or pass --repo-revision explicitly')
  return result.stdout.trim()
}

const canonicalFiles = (root) => ({
  state: path.join(root, '.project-cognition', 'state.json'),
  registry: path.join(root, '.project-cognition', 'verifiers.json'),
})

const readCanonical = (root) => {
  const files = canonicalFiles(root)
  if (!fs.existsSync(files.state) || !fs.existsSync(files.registry)) {
    throw new Error('canonical Project Cognition is not initialized; run project-cognition init ' + JSON.stringify(root) + ' first')
  }
  const state = readJson(files.state)
  const registry = readJson(files.registry)
  validateState(state, { requireHash: true })
  validateRegistry(registry)
  return { state, registry }
}

const draftCognition = (state) => {
  const draft = clone(state)
  draft.schema = DRAFT_STATE_SCHEMA
  draft.revision = state.revision + 1
  delete draft.state_hash
  validateState(draft)
  return draft
}

const matchingVerifier = (registry, verifierId, verifyTool, verifyCommand) => {
  const expectedArgumentsHash = argumentsHash({ command: verifyCommand })
  return registry.entries.find((entry) => {
    if (verifierId && entry.id !== verifierId) return false
    if (entry.invocations.length !== 1) return false
    const invocation = entry.invocations[0]
    if (invocation.tool_name !== verifyTool || argumentsHash(invocation.arguments) !== expectedArgumentsHash) return false
    return entry.result_policy.kind === SAFE_QUICKSTART_POLICY.kind &&
      JSON.stringify(entry.result_policy.patterns) === JSON.stringify(SAFE_QUICKSTART_POLICY.patterns)
  })
}

const draftRegistry = (registry, verifierId, verifyTool, verifyCommand) => {
  const draft = clone(registry)
  const reusable = matchingVerifier(registry, verifierId, verifyTool, verifyCommand)
  if (reusable) {
    draft.registry_hash = null
    return { draft, reused: true }
  }
  draft.revision = registry.revision + 1
  draft.registry_hash = null
  const entry = {
    id: verifierId,
    invocations: [{
      tool_name: verifyTool,
      arguments: { command: verifyCommand },
      arguments_hash: null,
    }],
    result_policy: clone(SAFE_QUICKSTART_POLICY),
  }
  const existing = draft.entries.findIndex((candidate) => candidate.id === verifierId)
  if (existing >= 0) draft.entries.splice(existing, 1, entry)
  else draft.entries.push(entry)
  sealRegistry(draft)
  return { draft, reused: false }
}

const draftGoal = ({ goalId, verifierId, mode, repoRevision, state }) => ({
  schema: 'project-cognition/goal/v1',
  goal_id: goalId,
  revision: 1,
  status: 'draft',
  contract_hash: null,
  // Intentionally unbound until quickstart sync confirms owner-edited content.
  verifier_registry_hash: ZERO_HASH,
  mode,
  intent: {
    problem: REVIEW_MARKER + ' Describe the concrete problem, not the proposed implementation.',
    value: REVIEW_MARKER + ' State who benefits and why solving this problem matters.',
  },
  baseline: {
    repo_revision: repoRevision,
    cognition_hash: ZERO_HASH,
    known_failures: [],
  },
  target_state: REVIEW_MARKER + ' Describe the observable state at which work must stop.',
  criteria: [{
    id: 'C1',
    priority: 'must',
    expected: REVIEW_MARKER + ' State exactly what the frozen verifier must prove.',
    verifier_id: verifierId,
    authority: 'tool',
    evidence_required: ['A real, matching host tool call and result for the frozen verifier invocation'],
  }],
  boundaries: {
    in_scope: [REVIEW_MARKER + ' List the smallest files or behavior allowed to change.'],
    out_of_scope: ['Unrelated cleanup', 'Dependency upgrades unless explicitly required', 'Unrequested public API changes'],
    do_not_touch: ['Secrets', 'Generated artifacts', 'Canonical Project Cognition without a separate owner-reviewed promotion'],
  },
  invariant_refs: state.invariants
    .filter((item) => item.lifecycle === 'ratified' && item.strength === 'hard')
    .map((item) => item.id),
  limits: {
    max_attempts: mode === 'simple' ? 2 : 3,
    max_no_progress_attempts: 2,
    max_time_sec: 1800,
    max_tokens: null,
  },
  human_gates: mode === 'governed'
    ? [{ id: 'H1', description: 'Owner confirms the bounded result preserves the reviewed architecture and project invariants.' }]
    : [],
  approval: null,
})

const markerPaths = (value, prefix = '$') => {
  if (typeof value === 'string') return value.includes(REVIEW_MARKER) ? [prefix] : []
  if (Array.isArray(value)) return value.flatMap((item, index) => markerPaths(item, prefix + '[' + index + ']'))
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => markerPaths(item, prefix + '.' + key))
  return []
}

const quoteArg = (value) => process.platform === 'win32'
  ? "'" + String(value).replace(/'/g, "''") + "'"
  : "'" + String(value).replace(/'/g, "'\"'\"'") + "'"

const renderReview = ({ root, reviewDir, manifest, status = 'generated' }) => {
  const cognition = path.join(reviewDir, manifest.files.cognition_draft)
  const sealedCognition = path.join(reviewDir, manifest.files.cognition_sealed)
  const verifier = path.join(reviewDir, manifest.files.verifier_draft)
  const goal = path.join(reviewDir, manifest.files.goal_draft)
  const explicitRevision = manifest.bindings.repo_revision_source === 'explicit'
    ? ' --repo-revision ' + quoteArg(manifest.bindings.repo_revision)
    : ''
  const lines = [
    '# Guided Project Cognition review', '',
    '> Status: **' + status + '**. Nothing in this directory is canonical or executable by itself.', '',
    'The only project truth remains `.project-cognition/state.json`. This scaffold did **not** approve a Goal Contract, install a Verifier Registry, seal Project Cognition, or modify the selected project root.', '',
    'Every command below is pinned to the canonical upstream package `' + manifest.cli.package_spec + '`. This makes the file directly executable for the README `npx` workflow. Fork maintainers must publish and review their own pinned package identity rather than hand-editing this manifest.', '',
    '## 1. Review and edit', '',
    '- Replace every `' + REVIEW_MARKER + '` field in `' + manifest.files.goal_draft + '`.',
    '- Review the exact tool name, command, arguments and failure policy in `' + manifest.files.verifier_draft + '`.',
    '- Review the automatically referenced hard invariants; remove only those that are genuinely irrelevant.',
    '- Edit `' + manifest.files.cognition_draft + '` only when this task discovered durable project truth. A task does not require a cognition revision.', '',
    '## 2. Rebind without copying hashes', '',
    '```sh',
    cliCommand(manifest, 'quickstart sync ' + quoteArg(reviewDir) + ' --root ' + quoteArg(root) + explicitRevision),
    '```', '',
    '`sync` refuses unresolved review markers or stale canonical inputs. It updates only the external Goal draft and this review manifest; it does not approve or install anything.', '',
    '## 3. Optional: promote reviewed Project Cognition', '',
    'Skip this section if the cognition draft is unchanged. If it contains durable facts that the owner accepts:', '',
    '```sh',
    cliCommand(manifest, 'cognition diff ' + quoteArg(cognition) + ' --root ' + quoteArg(root)),
    cliCommand(manifest, 'cognition seal ' + quoteArg(cognition) + ' --out ' + quoteArg(sealedCognition)),
    cliCommand(manifest, 'cognition install ' + quoteArg(sealedCognition) + ' --root ' + quoteArg(root) + ' --replace --expect-current-hash ' + manifest.bindings.base_cognition_hash),
    cliCommand(manifest, 'quickstart sync ' + quoteArg(reviewDir) + ' --root ' + quoteArg(root) + explicitRevision),
    '```', '',
    'Owner review is a repository-governance act; the local actor label and these commands are not identity authentication.', '',
    '## 4. Confirm or install the reviewed verifier, then approve the reviewed goal', '',
    '```sh',
    cliCommand(manifest, 'verifier seal ' + quoteArg(verifier)),
    ...(manifest.safety.verifier_change_required === false
      ? ['# The exact reviewed verifier is already installed; no registry replacement is needed.']
      : [cliCommand(manifest, 'verifier install ' + quoteArg(verifier) + ' --root ' + quoteArg(root) + ' --replace --expect-current-hash ' + manifest.bindings.base_verifier_registry_hash)]),
    cliCommand(manifest, 'quickstart sync ' + quoteArg(reviewDir) + ' --root ' + quoteArg(root) + explicitRevision),
    cliCommand(manifest, 'goal validate ' + quoteArg(goal)),
    cliCommand(manifest, 'goal approve ' + quoteArg(goal) + ' --actor OWNER_NAME --root ' + quoteArg(root)),
    cliCommand(manifest, 'doctor ' + quoteArg(root)),
    '```', '',
    'Only the final `goal approve` command creates an executable contract, and it fails if the installed Cognition or Verifier Registry differs from the synced bindings. An existing verifier is reused only when its exact frozen entry already matches the selected tool and command. In DSH Governed Coding, run the exact approved file printed by that command.', '',
    '## Stop rule', '',
    'Do not keep polishing the scaffold after the problem, value, target, MUST verifier, scope, invariants and stop budget are precise enough for an owner decision. Reject or archive the draft when those questions cannot be answered.', '',
  ]
  return lines.join('\n')
}

const createQuickstartScaffold = (options) => {
  const identity = projectIdentity(options.root || process.cwd())
  const root = identity.realpath
  const reviewDir = assertExternalReviewDir(root, options.output)
  if (fs.existsSync(reviewDir)) throw new Error('review directory already exists; use a unique path: ' + reviewDir)
  const { state, registry } = readCanonical(root)
  const goalId = validateIdentifier(options.goalId || slug(path.basename(root)) + '-guided-goal', 'goal id', /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/)
  const mode = options.mode || 'governed'
  if (!['simple', 'governed'].includes(mode)) throw new Error('--mode must be simple or governed')
  const verifyTool = validateIdentifier(options.verifyTool || (process.platform === 'win32' ? 'pwsh' : 'bash'), 'verifier tool', /^\S(?:.*\S)?$/)
  const verifyCommand = options.verifyCommand || inferVerifierCommand(root)
  if (!verifyCommand) throw new Error('cannot infer a deterministic verifier command; pass --verify-command explicitly')
  if (typeof verifyCommand !== 'string' || !verifyCommand.trim()) throw new Error('--verify-command must be non-empty')
  const reusableVerifier = matchingVerifier(registry, options.verifierId, verifyTool, verifyCommand.trim())
  const verifierId = validateIdentifier(options.verifierId || (reusableVerifier && reusableVerifier.id) || 'quickstart.verify', 'verifier id', /^[a-z][a-z0-9_.-]*$/)
  const repoRevision = gitRevision(root, options.repoRevision)
  const cognition = draftCognition(state)
  const verifierResult = draftRegistry(registry, verifierId, verifyTool, verifyCommand.trim())
  const verifier = verifierResult.draft
  const proposedRegistry = sealRegistry(verifier)
  const goal = draftGoal({ goalId, verifierId, mode, repoRevision, state })
  validateGoalContract(goal)
  const files = {
    cognition_draft: 'cognition.r' + cognition.revision + '.draft.json',
    cognition_sealed: 'cognition.r' + cognition.revision + '.sealed.json',
    verifier_draft: 'verifiers.r' + verifier.revision + '.draft.json',
    goal_draft: 'goal.' + slug(goalId) + '.r1.draft.json',
    manifest: 'quickstart-review.json',
    instructions: 'REVIEW.md',
  }
  const manifest = {
    schema: REVIEW_SCHEMA,
    created_at: new Date().toISOString(),
    project_name: path.basename(root),
    files,
    bindings: {
      base_cognition_hash: state.state_hash,
      base_verifier_registry_hash: registry.registry_hash,
      proposed_verifier_registry_hash: proposedRegistry.registry_hash,
      repo_revision: repoRevision,
      repo_revision_source: options.repoRevision === undefined ? 'git' : 'explicit',
      project_root: identity,
    },
    safety: {
      canonical_state_changed: false,
      verifier_installed: false,
      goal_approved: false,
      cognition_sealed: false,
      owner_review_required: true,
      verifier_change_required: !verifierResult.reused,
    },
    cli: canonicalCliBinding(),
  }
  try {
    fs.mkdirSync(reviewDir, { recursive: true })
    writeJson(path.join(reviewDir, files.cognition_draft), cognition, { exclusive: true })
    writeJson(path.join(reviewDir, files.verifier_draft), verifier, { exclusive: true })
    writeJson(path.join(reviewDir, files.goal_draft), goal, { exclusive: true })
    writeJson(path.join(reviewDir, files.manifest), manifest, { exclusive: true })
    writeFile(path.join(reviewDir, files.instructions), renderReview({ root, reviewDir, manifest }), { exclusive: true })
  } catch (error) {
    try { fs.rmSync(reviewDir, { recursive: true, force: true }) } catch (cleanupError) { /* original error is more actionable */ }
    throw error
  }
  return {
    ok: true,
    review_dir: reviewDir,
    files,
    inferred: { verifier_tool: verifyTool, verifier_command: verifyCommand.trim() },
    verifier_reused: verifierResult.reused,
    proposed_verifier_registry_hash: proposedRegistry.registry_hash,
    approval_ready: false,
    canonical_changes: 0,
    next: 'Edit the review markers, inspect the verifier, then run ' + CANONICAL_COMMAND_PREFIX + ' quickstart sync ' + quoteArg(reviewDir) + ' --root ' + quoteArg(root) + (options.repoRevision === undefined ? '' : ' --repo-revision ' + quoteArg(repoRevision)),
  }
}

const syncQuickstartScaffold = (options) => {
  const identity = projectIdentity(options.root || process.cwd())
  const root = identity.realpath
  const reviewDir = assertExternalReviewDir(root, options.reviewDir)
  if (!fs.existsSync(reviewDir) || !fs.statSync(reviewDir).isDirectory()) throw new Error('review directory does not exist: ' + reviewDir)
  const manifestFile = path.join(reviewDir, 'quickstart-review.json')
  const manifest = readJson(manifestFile)
  if (!manifest || manifest.schema !== REVIEW_SCHEMA || !manifest.files || !manifest.bindings || !manifest.safety) throw new Error('invalid quickstart review manifest')
  validateCliBinding(manifest.cli)
  if (!sameProjectIdentity(manifest.bindings.project_root, identity)) {
    throw new Error('review workspace is bound to a different canonical project root; refusing cross-project sync')
  }
  const artifactFiles = reviewArtifactPaths(reviewDir, manifest, manifestFile)
  const cognitionFile = artifactFiles.cognition_draft
  const verifierFile = artifactFiles.verifier_draft
  const goalFile = artifactFiles.goal_draft
  const instructionsFile = artifactFiles.instructions
  const current = readCanonical(root)
  const cognitionDraft = readJson(cognitionFile)
  validateState(cognitionDraft)
  if (cognitionDraft.schema !== DRAFT_STATE_SCHEMA) throw new Error('quickstart cognition artifact must remain an unsealed draft')
  const proposedCognition = sealState(cognitionDraft)
  const cognitionStatus = current.state.state_hash === manifest.bindings.base_cognition_hash
    ? 'pending_or_unused'
    : current.state.state_hash === proposedCognition.state_hash
      ? 'owner_promoted'
      : 'stale_conflict'
  if (cognitionStatus === 'stale_conflict') throw new Error('canonical cognition changed outside this review; discard or manually reconcile the stale scaffold')
  if (cognitionStatus === 'pending_or_unused' && cognitionDraft.revision !== current.state.revision + 1) {
    throw new Error('cognition draft revision is not the exact next canonical revision')
  }
  const verifierDraft = readJson(verifierFile)
  if (verifierDraft.registry_hash !== null) throw new Error('quickstart verifier artifact must remain a draft with registry_hash null')
  const proposedRegistry = sealRegistry(verifierDraft)
  const registryStatus = current.registry.registry_hash === proposedRegistry.registry_hash
    ? 'installed'
    : current.registry.registry_hash === manifest.bindings.base_verifier_registry_hash
      ? 'pending'
      : 'stale_conflict'
  if (registryStatus === 'stale_conflict') throw new Error('installed verifier registry changed outside this review; discard or manually reconcile the stale scaffold')
  if (registryStatus === 'pending' && verifierDraft.revision !== current.registry.revision + 1) {
    throw new Error('verifier draft revision is not the exact next installed registry revision')
  }
  const goal = readJson(goalFile)
  if (goal.status !== 'draft' || goal.contract_hash !== null || goal.approval !== null) throw new Error('quickstart can sync only an unapproved Goal draft')
  const unresolved = markerPaths(goal)
  if (unresolved.length > 0) throw new Error('owner review is incomplete; replace review markers at: ' + unresolved.join(', '))
  goal.verifier_registry_hash = proposedRegistry.registry_hash
  goal.baseline.cognition_hash = current.state.state_hash
  const revisionInput = options.repoRevision !== undefined
    ? options.repoRevision
    : manifest.bindings.repo_revision_source === 'explicit'
      ? manifest.bindings.repo_revision
      : undefined
  goal.baseline.repo_revision = gitRevision(root, revisionInput)
  validateGoalContract(goal)
  manifest.synced_at = new Date().toISOString()
  manifest.bindings.proposed_verifier_registry_hash = proposedRegistry.registry_hash
  manifest.bindings.synced_cognition_hash = current.state.state_hash
  manifest.bindings.synced_repo_revision = goal.baseline.repo_revision
  if (options.repoRevision !== undefined) {
    manifest.bindings.repo_revision = goal.baseline.repo_revision
    manifest.bindings.repo_revision_source = 'explicit'
  }
  manifest.safety = {
    canonical_state_changed: false,
    verifier_installed: registryStatus === 'installed',
    goal_approved: false,
    cognition_sealed: cognitionStatus === 'owner_promoted',
    owner_review_required: true,
    verifier_change_required: current.registry.registry_hash !== proposedRegistry.registry_hash,
  }
  writeJson(goalFile, goal)
  writeJson(manifestFile, manifest)
  writeFile(instructionsFile, renderReview({ root, reviewDir, manifest, status: 'synced — still unapproved' }))
  return {
    ok: true,
    review_dir: reviewDir,
    goal_draft: goalFile,
    cognition_status: cognitionStatus,
    verifier_status: registryStatus,
    verifier_registry_hash: proposedRegistry.registry_hash,
    cognition_hash: current.state.state_hash,
    repo_revision: goal.baseline.repo_revision,
    approval_ready: registryStatus === 'installed',
    canonical_changes: 0,
    next: registryStatus === 'installed'
      ? 'Review once more, then run project-cognition goal approve with an explicit human actor.'
      : 'Install the reviewed verifier draft, then run sync again before explicit goal approval.',
  }
}

module.exports = {
  REVIEW_SCHEMA,
  ZERO_HASH,
  REVIEW_MARKER,
  inferVerifierCommand,
  createQuickstartScaffold,
  syncQuickstartScaffold,
}
