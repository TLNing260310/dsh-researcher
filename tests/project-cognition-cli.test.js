const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { sealRegistry, argumentsHash } = require('../lib/verifier-core/index.js')

const REPO = path.resolve(__dirname, '..')
const CLI = path.join(REPO, 'bin', 'project-cognition.js')
const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' })

test('CLI initializes, renders and diagnoses the canonical project artifacts', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-cognition-cli-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  const initialized = run(['init', root], root)
  assert.equal(initialized.status, 0, initialized.stderr)
  assert.ok(fs.existsSync(path.join(root, '.project-cognition', 'state.json')))
  assert.ok(fs.existsSync(path.join(root, '.project-cognition', 'verifiers.json')))
  assert.ok(fs.existsSync(path.join(root, 'PROJECT_COGNITION.md')))

  const rendered = run(['cognition', 'render', root], root)
  assert.equal(rendered.status, 0, rendered.stderr)

  const doctor = run(['doctor', root], root)
  assert.equal(doctor.status, 0, doctor.stderr)
  assert.equal(JSON.parse(doctor.stdout).ok, true)
})

test('CLI seals and explicitly installs a verifier registry revision', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-cognition-verifier-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  assert.equal(run(['init', root], root).status, 0)
  const draftFile = path.join(root, 'verifier-draft.json')
  fs.writeFileSync(draftFile, JSON.stringify({
    schema: 'project-cognition/verifier-registry/v1', revision: 2, registry_hash: null,
    entries: [{ id: 'tests.core', invocations: [{ tool_name: 'pwsh', arguments: { command: 'npm test' }, arguments_hash: null }], result_policy: { kind: 'json_field_equals', path: 'exit_code', equals: 0 } }],
  }))
  const sealed = run(['verifier', 'seal', draftFile], root)
  assert.equal(sealed.status, 0, sealed.stderr)
  assert.match(JSON.parse(sealed.stdout).registry_hash, /^[a-f0-9]{64}$/)

  const refused = run(['verifier', 'install', draftFile, '--root', root], root)
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /--replace/)
  const installed = run(['verifier', 'install', draftFile, '--root', root, '--replace'], root)
  assert.equal(installed.status, 0, installed.stderr)
  assert.equal(JSON.parse(installed.stdout).revision, 2)
})

test('CLI seals and installs cognition as JSON truth plus Markdown projection', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-cognition-state-install-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  assert.equal(run(['init', root], root).status, 0)
  const current = JSON.parse(fs.readFileSync(path.join(root, '.project-cognition', 'state.json'), 'utf8'))
  delete current.state_hash
  current.revision = 2
  current.mission.purpose = 'A human-edited draft becomes one sealed source of truth.'
  const draftFile = path.join(root, 'state-draft.json')
  fs.writeFileSync(draftFile, JSON.stringify(current))
  const sealed = run(['cognition', 'seal', draftFile], root)
  assert.equal(sealed.status, 0, sealed.stderr)
  assert.match(JSON.parse(sealed.stdout).state_hash, /^[a-f0-9]{64}$/)
  const installed = run(['cognition', 'install', draftFile, '--root', root, '--replace'], root)
  assert.equal(installed.status, 0, installed.stderr)
  const output = JSON.parse(installed.stdout)
  assert.equal(output.revision, 2)
  assert.match(fs.readFileSync(path.join(root, 'PROJECT_COGNITION.md'), 'utf8'), /A human-edited draft becomes one sealed source of truth/)
})

test('CLI approval writes an immutable revision and refuses overwrite', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-cognition-goal-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  assert.equal(run(['init', root], root).status, 0)
  const state = JSON.parse(fs.readFileSync(path.join(root, '.project-cognition', 'state.json'), 'utf8'))
  const registry = sealRegistry({
    schema: 'project-cognition/verifier-registry/v1', revision: 2, registry_hash: null,
    entries: [{ id: 'tests.core', invocations: [{ tool_name: 'pwsh', arguments: { command: 'npm test' }, arguments_hash: argumentsHash({ command: 'npm test' }) }], result_policy: { kind: 'tool_success' } }],
  })
  fs.writeFileSync(path.join(root, '.project-cognition', 'verifiers.json'), JSON.stringify(registry))
  const draft = {
    schema: 'project-cognition/goal/v1', goal_id: 'G/portable', revision: 1, status: 'draft', contract_hash: null, verifier_registry_hash: registry.registry_hash, mode: 'simple',
    intent: { problem: 'No stop contract', value: 'Auditable completion' },
    baseline: { repo_revision: 'abc', cognition_hash: state.state_hash, known_failures: [] },
    target_state: 'Goal decisions are evidence-backed.',
    criteria: [{ id: 'C1', priority: 'must', expected: 'tests pass', verifier_id: 'tests.core', authority: 'tool', evidence_required: ['test output'] }],
    boundaries: { in_scope: ['lib'], out_of_scope: [], do_not_touch: [] }, invariant_refs: [],
    limits: { max_attempts: 2, max_no_progress_attempts: 2, max_time_sec: null, max_tokens: null }, human_gates: [], approval: null,
  }
  const draftFile = path.join(root, 'draft.json')
  fs.writeFileSync(draftFile, JSON.stringify(draft))

  const first = run(['goal', 'approve', draftFile, '--actor', 'owner', '--root', root], root)
  assert.equal(first.status, 0, first.stderr)
  const output = JSON.parse(first.stdout)
  assert.match(output.contract, /G%2Fportable\.r1\.json$/)
  assert.ok(fs.existsSync(output.contract))

  const second = run(['goal', 'approve', draftFile, '--actor', 'owner', '--root', root], root)
  assert.equal(second.status, 1)
  assert.match(second.stderr, /refusing to overwrite immutable file/)
})

test('published Simple Goal example remains valid against the real CLI', () => {
  const examples = path.resolve(__dirname, '..', 'examples', 'simple-goal')
  const recommendation = run(['goal', 'recommend', path.join(examples, 'risk.json')], REPO)
  assert.equal(recommendation.status, 0, recommendation.stderr)
  assert.deepEqual(JSON.parse(recommendation.stdout), { mode: 'simple', reasons: [] })

  const registry = run(['verifier', 'seal', path.join(examples, 'verifier-draft.json')], REPO)
  assert.equal(registry.status, 0, registry.stderr)
  const sealed = JSON.parse(registry.stdout)
  assert.match(sealed.registry_hash, /^[a-f0-9]{64}$/)
  assert.equal(sealed.entries.every((entry) => entry.invocations.every((invocation) => /^[a-f0-9]{64}$/.test(invocation.arguments_hash))), true)

  const goal = run(['goal', 'validate', path.join(examples, 'goal-draft.json')], REPO)
  assert.equal(goal.status, 0, goal.stderr)
  assert.equal(JSON.parse(goal.stdout).status, 'draft')
})
