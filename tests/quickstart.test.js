const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { sealRegistry } = require('../lib/verifier-core/index.js')
const { ZERO_HASH, REVIEW_MARKER } = require('../lib/quickstart/index.js')
const packageJson = require('../package.json')

const FAILURE_MARKERS = ['[exit code:', '[timed out', '[killed by signal:', '[sandbox:']

const REPO = path.resolve(__dirname, '..')
const CLI = path.join(REPO, 'bin', 'project-cognition.js')
const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' })
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

const fixture = (t, options = {}) => {
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'project-cognition-quickstart-'))
  t.after(() => fs.rmSync(outer, { recursive: true, force: true }))
  const root = path.join(outer, 'workspace')
  const review = path.join(outer, 'review-' + Date.now())
  fs.mkdirSync(root)
  if (options.package !== false) {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }))
  }
  const initialized = run(['init', root], root)
  assert.equal(initialized.status, 0, initialized.stderr)
  return { outer, root, review }
}

const replaceReviewMarkers = (goal) => {
  goal.intent.problem = 'A bounded regression can be reported complete without host evidence.'
  goal.intent.value = 'The owner receives a stopping decision tied to a real verifier call.'
  goal.target_state = 'The regression test passes and unrelated files remain unchanged.'
  goal.criteria[0].expected = 'The repository test suite exits successfully.'
  goal.boundaries.in_scope = ['src/defect.js', 'tests/defect.test.js']
  return goal
}

test('quickstart creates external, non-executable review drafts without changing canonical truth', (t) => {
  const { root, review } = fixture(t)
  const stateFile = path.join(root, '.project-cognition', 'state.json')
  const registryFile = path.join(root, '.project-cognition', 'verifiers.json')
  const beforeState = fs.readFileSync(stateFile, 'utf8')
  const beforeRegistry = fs.readFileSync(registryFile, 'utf8')

  const generated = run([
    'quickstart', '--root', root, '--out', review, '--goal-id', 'guided-first-goal',
    '--mode', 'simple', '--repo-revision', 'fixture-revision',
  ], root)
  assert.equal(generated.status, 0, generated.stderr)
  const output = JSON.parse(generated.stdout)
  assert.equal(output.approval_ready, false)
  assert.equal(output.canonical_changes, 0)
  assert.equal(output.inferred.verifier_command, 'npm test')
  const expectedPrefix = 'npx -y --package=github:TLNing260310/dsh-researcher#v' + packageJson.version + ' project-cognition'
  assert.match(output.next, new RegExp('^Edit.*run ' + expectedPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(output.next, /--repo-revision 'fixture-revision'/)
  assert.deepEqual(fs.readFileSync(stateFile, 'utf8'), beforeState)
  assert.deepEqual(fs.readFileSync(registryFile, 'utf8'), beforeRegistry)
  assert.equal(fs.existsSync(path.join(root, '.project-cognition', 'goals', 'guided-first-goal.r1.json')), false)

  const cognition = readJson(path.join(review, output.files.cognition_draft))
  const current = readJson(stateFile)
  assert.equal(cognition.schema, 'project-cognition/state-draft/v1')
  assert.equal(cognition.revision, current.revision + 1)
  assert.equal(cognition.state_hash, undefined)
  const verifier = readJson(path.join(review, output.files.verifier_draft))
  assert.equal(verifier.registry_hash, null)
  assert.equal(verifier.entries.find((entry) => entry.id === 'quickstart.verify').invocations[0].arguments_hash, null)
  const goalFile = path.join(review, output.files.goal_draft)
  const goal = readJson(goalFile)
  assert.equal(goal.verifier_registry_hash, ZERO_HASH)
  assert.equal(goal.baseline.cognition_hash, ZERO_HASH)
  assert.match(goal.intent.problem, new RegExp(REVIEW_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  const reviewText = fs.readFileSync(path.join(review, 'REVIEW.md'), 'utf8')
  assert.match(reviewText, /did \*\*not\*\* approve a Goal Contract/)
  const executableLines = reviewText.split(/\r?\n/).filter((line) => line.startsWith('npx '))
  assert.ok(executableLines.length >= 8)
  assert.equal(executableLines.every((line) => line.startsWith(expectedPrefix + ' ')), true)
  assert.doesNotMatch(reviewText, /^project-cognition\s/m)
  const manifest = readJson(path.join(review, output.files.manifest))
  assert.equal(manifest.bindings.project_root.realpath, fs.realpathSync(root))
  assert.deepEqual(manifest.cli, {
    kind: 'canonical-pinned-github-npx',
    package_version: packageJson.version,
    package_spec: 'github:TLNing260310/dsh-researcher#v' + packageJson.version,
    command_prefix: expectedPrefix,
  })

  const premature = run(['goal', 'approve', goalFile, '--actor', 'owner', '--root', root], root)
  assert.equal(premature.status, 1)
  assert.match(premature.stderr, /cognition_hash does not match/)
})

test('quickstart sync removes manual hash transfer but preserves explicit install and approval gates', (t) => {
  const { root, review } = fixture(t)
  const generated = run([
    'quickstart', '--root', root, '--out', review, '--goal-id', 'guided-sync-goal',
    '--repo-revision', 'fixture-revision', '--verify-tool', 'pwsh',
  ], root)
  assert.equal(generated.status, 0, generated.stderr)
  const files = JSON.parse(generated.stdout).files
  const goalFile = path.join(review, files.goal_draft)
  const verifierFile = path.join(review, files.verifier_draft)
  const baseRegistryHash = readJson(path.join(root, '.project-cognition', 'verifiers.json')).registry_hash
  assert.match(fs.readFileSync(path.join(review, 'REVIEW.md'), 'utf8'), new RegExp('--expect-current-hash ' + baseRegistryHash))
  fs.writeFileSync(goalFile, JSON.stringify(replaceReviewMarkers(readJson(goalFile)), null, 2) + '\n')

  const stateBefore = fs.readFileSync(path.join(root, '.project-cognition', 'state.json'), 'utf8')
  const firstSync = run(['quickstart', 'sync', review, '--root', root, '--repo-revision', 'fixture-revision'], root)
  assert.equal(firstSync.status, 0, firstSync.stderr)
  const synced = JSON.parse(firstSync.stdout)
  assert.equal(synced.verifier_status, 'pending')
  assert.equal(synced.approval_ready, false)
  assert.equal(synced.canonical_changes, 0)
  const goal = readJson(goalFile)
  const proposedRegistry = sealRegistry(readJson(verifierFile))
  assert.equal(goal.verifier_registry_hash, proposedRegistry.registry_hash)
  assert.equal(goal.baseline.cognition_hash, readJson(path.join(root, '.project-cognition', 'state.json')).state_hash)
  assert.equal(goal.baseline.repo_revision, 'fixture-revision')
  assert.equal(fs.readFileSync(path.join(root, '.project-cognition', 'state.json'), 'utf8'), stateBefore)

  const premature = run(['goal', 'approve', goalFile, '--actor', 'owner', '--root', root], root)
  assert.equal(premature.status, 1)
  assert.match(premature.stderr, /verifier_registry_hash does not match/)
  const installed = run(['verifier', 'install', verifierFile, '--root', root, '--replace', '--expect-current-hash', baseRegistryHash], root)
  assert.equal(installed.status, 0, installed.stderr)
  assert.equal(JSON.parse(installed.stdout).registry_hash, proposedRegistry.registry_hash)

  const secondSync = run(['quickstart', 'sync', review, '--root', root, '--repo-revision', 'fixture-revision'], root)
  assert.equal(secondSync.status, 0, secondSync.stderr)
  assert.equal(JSON.parse(secondSync.stdout).approval_ready, true)
  assert.equal(fs.readdirSync(path.join(root, '.project-cognition', 'goals')).length, 0)
  const approved = run(['goal', 'approve', goalFile, '--actor', 'owner', '--root', root], root)
  assert.equal(approved.status, 0, approved.stderr)
  const approvedOutput = JSON.parse(approved.stdout)
  assert.ok(fs.existsSync(approvedOutput.contract))
  assert.equal(readJson(approvedOutput.contract).status, 'approved')
})

test('quickstart reuses an exact installed verifier instead of drifting the global registry', (t) => {
  const { root, review } = fixture(t)
  const registryFile = path.join(root, '.project-cognition', 'verifiers.json')
  const tool = process.platform === 'win32' ? 'pwsh' : 'bash'
  const installedRegistry = sealRegistry({
    schema: 'project-cognition/verifier-registry/v1',
    revision: 2,
    registry_hash: null,
    entries: [{
      id: 'tests.existing',
      invocations: [{ tool_name: tool, arguments: { command: 'npm test' }, arguments_hash: null }],
      result_policy: { kind: 'text_excludes', patterns: FAILURE_MARKERS },
    }],
  })
  fs.writeFileSync(registryFile, JSON.stringify(installedRegistry, null, 2) + '\n')
  const generated = run([
    'quickstart', '--root', root, '--out', review, '--goal-id', 'reuse-verifier-goal',
    '--repo-revision', 'fixture-revision',
  ], root)
  assert.equal(generated.status, 0, generated.stderr)
  const output = JSON.parse(generated.stdout)
  assert.equal(output.verifier_reused, true)
  const verifierFile = path.join(review, output.files.verifier_draft)
  const verifierDraft = readJson(verifierFile)
  assert.equal(verifierDraft.revision, installedRegistry.revision)
  assert.equal(sealRegistry(verifierDraft).registry_hash, installedRegistry.registry_hash)
  const goalFile = path.join(review, output.files.goal_draft)
  fs.writeFileSync(goalFile, JSON.stringify(replaceReviewMarkers(readJson(goalFile)), null, 2) + '\n')

  const synced = run(['quickstart', 'sync', review, '--root', root], root)
  assert.equal(synced.status, 0, synced.stderr)
  const syncedOutput = JSON.parse(synced.stdout)
  assert.equal(syncedOutput.verifier_status, 'installed')
  assert.equal(syncedOutput.approval_ready, true)
  assert.equal(fs.readFileSync(registryFile, 'utf8'), JSON.stringify(installedRegistry, null, 2) + '\n')
  assert.doesNotMatch(fs.readFileSync(path.join(review, 'REVIEW.md'), 'utf8'), /verifier install/)
  const approved = run(['goal', 'approve', goalFile, '--actor', 'owner', '--root', root], root)
  assert.equal(approved.status, 0, approved.stderr)
})

test('quickstart refuses to reuse multi-invocation or policy-loosened verifier entries', (t) => {
  const tool = process.platform === 'win32' ? 'pwsh' : 'bash'
  for (const [name, invocations, resultPolicy] of [
    ['multi', [
      { tool_name: tool, arguments: { command: 'npm test' }, arguments_hash: null },
      { tool_name: tool, arguments: { command: 'echo ok' }, arguments_hash: null },
    ], { kind: 'text_excludes', patterns: FAILURE_MARKERS }],
    ['loose-policy', [
      { tool_name: tool, arguments: { command: 'npm test' }, arguments_hash: null },
    ], { kind: 'tool_success' }],
    ['extra-arguments', [
      { tool_name: tool, arguments: { command: 'npm test', description: 'not the selected canonical arguments' }, arguments_hash: null },
    ], { kind: 'text_excludes', patterns: FAILURE_MARKERS }],
  ]) {
    const { root, review } = fixture(t)
    const registryFile = path.join(root, '.project-cognition', 'verifiers.json')
    const installedRegistry = sealRegistry({
      schema: 'project-cognition/verifier-registry/v1', revision: 2, registry_hash: null,
      entries: [{ id: 'tests.candidate', invocations, result_policy: resultPolicy }],
    })
    fs.writeFileSync(registryFile, JSON.stringify(installedRegistry, null, 2) + '\n')
    const generated = run([
      'quickstart', '--root', root, '--out', review, '--goal-id', 'strict-reuse-' + name,
      '--verifier-id', 'tests.candidate', '--repo-revision', 'fixture-revision',
    ], root)
    assert.equal(generated.status, 0, generated.stderr)
    const output = JSON.parse(generated.stdout)
    assert.equal(output.verifier_reused, false, name)
    const draft = readJson(path.join(review, output.files.verifier_draft))
    assert.equal(draft.revision, installedRegistry.revision + 1)
    const replacement = draft.entries.find((entry) => entry.id === 'tests.candidate')
    assert.equal(replacement.invocations.length, 1)
    assert.deepEqual(replacement.invocations[0].arguments, { command: 'npm test' })
    assert.deepEqual(replacement.result_policy, { kind: 'text_excludes', patterns: FAILURE_MARKERS })
  }
})

test('quickstart review identity rejects another repository with identical initial hashes', (t) => {
  const first = fixture(t)
  const second = fixture(t)
  assert.equal(
    readJson(path.join(first.root, '.project-cognition', 'state.json')).state_hash,
    readJson(path.join(second.root, '.project-cognition', 'state.json')).state_hash,
  )
  assert.equal(
    readJson(path.join(first.root, '.project-cognition', 'verifiers.json')).registry_hash,
    readJson(path.join(second.root, '.project-cognition', 'verifiers.json')).registry_hash,
  )
  const generated = run([
    'quickstart', '--root', first.root, '--out', first.review, '--goal-id', 'root-bound-goal',
    '--repo-revision', 'same-revision',
  ], first.root)
  assert.equal(generated.status, 0, generated.stderr)
  const output = JSON.parse(generated.stdout)
  const goalFile = path.join(first.review, output.files.goal_draft)
  fs.writeFileSync(goalFile, JSON.stringify(replaceReviewMarkers(readJson(goalFile)), null, 2) + '\n')
  const beforeGoal = fs.readFileSync(goalFile, 'utf8')
  const refused = run([
    'quickstart', 'sync', first.review, '--root', second.root, '--repo-revision', 'same-revision',
  ], second.root)
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /bound to a different canonical project root/)
  assert.equal(fs.readFileSync(goalFile, 'utf8'), beforeGoal)
})

test('verifier CAS rejects concurrent registry drift and quickstart remains stale', (t) => {
  const { root, review } = fixture(t)
  const generated = run([
    'quickstart', '--root', root, '--out', review, '--goal-id', 'registry-cas-goal',
    '--repo-revision', 'fixture-revision',
  ], root)
  assert.equal(generated.status, 0, generated.stderr)
  const output = JSON.parse(generated.stdout)
  const goalFile = path.join(review, output.files.goal_draft)
  const verifierFile = path.join(review, output.files.verifier_draft)
  const manifest = readJson(path.join(review, output.files.manifest))
  fs.writeFileSync(goalFile, JSON.stringify(replaceReviewMarkers(readJson(goalFile)), null, 2) + '\n')
  assert.equal(run(['quickstart', 'sync', review, '--root', root], root).status, 0)

  const competingFile = path.join(review, 'competing-verifier.json')
  fs.writeFileSync(competingFile, JSON.stringify({
    schema: 'project-cognition/verifier-registry/v1', revision: 2, registry_hash: null,
    entries: [{
      id: 'tests.competing',
      invocations: [{ tool_name: 'pwsh', arguments: { command: 'npm run competing' }, arguments_hash: null }],
      result_policy: { kind: 'text_excludes', patterns: FAILURE_MARKERS },
    }],
  }))
  const competing = run([
    'verifier', 'install', competingFile, '--root', root, '--replace',
    '--expect-current-hash', manifest.bindings.base_verifier_registry_hash,
  ], root)
  assert.equal(competing.status, 0, competing.stderr)
  const competingHash = JSON.parse(competing.stdout).registry_hash
  const staleInstall = run([
    'verifier', 'install', verifierFile, '--root', root, '--replace',
    '--expect-current-hash', manifest.bindings.base_verifier_registry_hash,
  ], root)
  assert.equal(staleInstall.status, 1)
  assert.match(staleInstall.stderr, /expected current verifier registry hash does not match/)
  assert.equal(readJson(path.join(root, '.project-cognition', 'verifiers.json')).registry_hash, competingHash)
  const staleSync = run(['quickstart', 'sync', review, '--root', root], root)
  assert.equal(staleSync.status, 1)
  assert.match(staleSync.stderr, /registry changed outside this review/)
})

test('quickstart sync refuses unresolved owner-review markers', (t) => {
  const { root, review } = fixture(t)
  const generated = run(['quickstart', '--root', root, '--out', review, '--repo-revision', 'fixture'], root)
  assert.equal(generated.status, 0, generated.stderr)
  const refused = run(['quickstart', 'sync', review, '--root', root, '--repo-revision', 'fixture'], root)
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /owner review is incomplete/)
  assert.match(refused.stderr, /\$\.intent\.problem/)
})

test('an explicitly promoted cognition draft can be rebound without becoming a second truth', (t) => {
  const { root, review } = fixture(t)
  const generated = run([
    'quickstart', '--root', root, '--out', review, '--goal-id', 'cognition-promotion-goal',
    '--repo-revision', 'fixture-revision',
  ], root)
  assert.equal(generated.status, 0, generated.stderr)
  const files = JSON.parse(generated.stdout).files
  const goalFile = path.join(review, files.goal_draft)
  const cognitionFile = path.join(review, files.cognition_draft)
  const sealedFile = path.join(review, files.cognition_sealed)
  fs.writeFileSync(goalFile, JSON.stringify(replaceReviewMarkers(readJson(goalFile)), null, 2) + '\n')
  const cognition = readJson(cognitionFile)
  cognition.mission.purpose = 'The owner-reviewed purpose is the only promoted quickstart fact.'
  fs.writeFileSync(cognitionFile, JSON.stringify(cognition, null, 2) + '\n')
  const baseHash = readJson(path.join(root, '.project-cognition', 'state.json')).state_hash

  const firstSync = run(['quickstart', 'sync', review, '--root', root], root)
  assert.equal(firstSync.status, 0, firstSync.stderr)
  assert.equal(JSON.parse(firstSync.stdout).cognition_status, 'pending_or_unused')
  const sealed = run(['cognition', 'seal', cognitionFile, '--out', sealedFile], root)
  assert.equal(sealed.status, 0, sealed.stderr)
  const installed = run([
    'cognition', 'install', sealedFile, '--root', root, '--replace', '--expect-current-hash', baseHash,
  ], root)
  assert.equal(installed.status, 0, installed.stderr)
  const promotedHash = JSON.parse(installed.stdout).state_hash

  const secondSync = run(['quickstart', 'sync', review, '--root', root], root)
  assert.equal(secondSync.status, 0, secondSync.stderr)
  const output = JSON.parse(secondSync.stdout)
  assert.equal(output.cognition_status, 'owner_promoted')
  assert.equal(output.cognition_hash, promotedHash)
  assert.equal(readJson(goalFile).baseline.cognition_hash, promotedHash)
  assert.match(fs.readFileSync(path.join(root, 'PROJECT_COGNITION.md'), 'utf8'), /only promoted quickstart fact/)
})

test('quickstart keeps provisional review artifacts outside the project and requires a known verifier', (t) => {
  const inside = fixture(t)
  const refusedInside = run([
    'quickstart', '--root', inside.root, '--out', path.join(inside.root, 'review'), '--repo-revision', 'fixture',
  ], inside.root)
  assert.equal(refusedInside.status, 1)
  assert.match(refusedInside.stderr, /outside the selected project root/)

  const unknown = fixture(t, { package: false })
  const refusedUnknown = run([
    'quickstart', '--root', unknown.root, '--out', unknown.review, '--repo-revision', 'fixture',
  ], unknown.root)
  assert.equal(refusedUnknown.status, 1)
  assert.match(refusedUnknown.stderr, /cannot infer a deterministic verifier command/)
  assert.equal(fs.existsSync(unknown.review), false)
})

test('quickstart sync rejects manifest path traversal', (t) => {
  const { root, review } = fixture(t)
  const generated = run(['quickstart', '--root', root, '--out', review, '--repo-revision', 'fixture'], root)
  assert.equal(generated.status, 0, generated.stderr)
  const manifestFile = path.join(review, 'quickstart-review.json')
  const manifest = readJson(manifestFile)
  manifest.files.goal_draft = '../outside.json'
  fs.writeFileSync(manifestFile, JSON.stringify(manifest))
  const refused = run(['quickstart', 'sync', review, '--root', root, '--repo-revision', 'fixture'], root)
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /escapes the review directory/)
})

test('quickstart sync rejects instructions aliases before they can overwrite goal or manifest', (t) => {
  for (const target of ['goal_draft', 'manifest']) {
    const { root, review } = fixture(t)
    const generated = run(['quickstart', '--root', root, '--out', review, '--repo-revision', 'fixture'], root)
    assert.equal(generated.status, 0, generated.stderr)
    const manifestFile = path.join(review, 'quickstart-review.json')
    const manifest = readJson(manifestFile)
    const goalFile = path.join(review, manifest.files.goal_draft)
    const goalBefore = fs.readFileSync(goalFile, 'utf8')
    manifest.files.instructions = manifest.files[target]
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n')
    const manifestBefore = fs.readFileSync(manifestFile, 'utf8')
    const refused = run(['quickstart', 'sync', review, '--root', root], root)
    assert.equal(refused.status, 1)
    assert.match(refused.stderr, /mutually unique paths|alias detected/)
    assert.equal(fs.readFileSync(goalFile, 'utf8'), goalBefore)
    assert.equal(fs.readFileSync(manifestFile, 'utf8'), manifestBefore)
  }
})

test('quickstart sync validates optional sealed and fixed manifest paths', (t) => {
  for (const [field, value, expected] of [
    ['cognition_sealed', '../outside.sealed.json', /escapes the review directory/],
    ['manifest', 'nested/quickstart-review.json', /must be exactly quickstart-review\.json/],
  ]) {
    const { root, review } = fixture(t)
    const generated = run(['quickstart', '--root', root, '--out', review, '--repo-revision', 'fixture'], root)
    assert.equal(generated.status, 0, generated.stderr)
    const manifestFile = path.join(review, 'quickstart-review.json')
    const manifest = readJson(manifestFile)
    manifest.files[field] = value
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n')
    const refused = run(['quickstart', 'sync', review, '--root', root], root)
    assert.equal(refused.status, 1)
    assert.match(refused.stderr, expected)
  }
})
