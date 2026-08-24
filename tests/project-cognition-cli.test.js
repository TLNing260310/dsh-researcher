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

test('CLI refuses a Project Cognition directory that resolves outside the workspace', (t) => {
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'project-cognition-link-escape-'))
  t.after(() => fs.rmSync(outer, { recursive: true, force: true }))
  const root = path.join(outer, 'workspace')
  const outside = path.join(outer, 'outside-cognition')
  fs.mkdirSync(root)
  fs.mkdirSync(outside)
  const link = path.join(root, '.project-cognition')
  try { fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir') } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      t.diagnostic('directory-link creation is unavailable on this host')
      return
    }
    throw error
  }
  const refused = run(['init', root], root)
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /refusing path outside project root/)
  assert.deepEqual(fs.readdirSync(outside), [])
})

test('doctor rejects an unsealed canonical state instead of blessing a draft as truth', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-cognition-unsealed-doctor-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  assert.equal(run(['init', root], root).status, 0)
  const stateFile = path.join(root, '.project-cognition', 'state.json')
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  delete state.state_hash
  fs.writeFileSync(stateFile, JSON.stringify(state))

  const doctor = run(['doctor', root], root)
  assert.equal(doctor.status, 2)
  const report = JSON.parse(doctor.stdout)
  assert.equal(report.ok, false)
  assert.match(report.checks.find((check) => check.name === 'cognition_state').detail, /required for canonical state/)
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
  const stateFile = path.join(root, '.project-cognition', 'state.json')
  const projectionFile = path.join(root, 'PROJECT_COGNITION.md')
  const current = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  const draftFile = path.join(root, 'state-draft.json')
  const created = run(['cognition', 'draft', '--root', root, '--out', draftFile], root)
  assert.equal(created.status, 0, created.stderr)
  const draft = JSON.parse(fs.readFileSync(draftFile, 'utf8'))
  assert.equal(draft.revision, current.revision + 1)
  assert.equal(draft.state_hash, undefined)
  draft.mission.purpose = 'A human-reviewed draft becomes one sealed source of truth.'
  fs.writeFileSync(draftFile, JSON.stringify(draft))

  const diffed = run(['cognition', 'diff', draftFile, '--root', root], root)
  assert.equal(diffed.status, 0, diffed.stderr)
  const revisionDiff = JSON.parse(diffed.stdout)
  assert.equal(revisionDiff.valid_next_revision, true)
  assert.equal(revisionDiff.changes.mission.changed, true)
  assert.ok(revisionDiff.risks.some((risk) => risk.code === 'mission_changed'))

  const stateBeforeRefusals = fs.readFileSync(stateFile, 'utf8')
  const projectionBeforeRefusals = fs.readFileSync(projectionFile, 'utf8')
  const draftRefused = run(['cognition', 'install', draftFile, '--root', root, '--replace', '--expect-current-hash', current.state_hash], root)
  assert.equal(draftRefused.status, 1)
  assert.match(draftRefused.stderr, /canonical state must use|state_hash.*required for canonical state/)
  assert.equal(fs.readFileSync(stateFile, 'utf8'), stateBeforeRefusals)
  assert.equal(fs.readFileSync(projectionFile, 'utf8'), projectionBeforeRefusals)

  const sealedFile = path.join(root, 'state-r2.sealed.json')
  const sealed = run(['cognition', 'seal', draftFile, '--out', sealedFile], root)
  assert.equal(sealed.status, 0, sealed.stderr)
  assert.match(JSON.parse(sealed.stdout).state_hash, /^[a-f0-9]{64}$/)
  assert.ok(fs.existsSync(sealedFile))
  const overwriteRefused = run(['cognition', 'seal', draftFile, '--out', sealedFile], root)
  assert.equal(overwriteRefused.status, 1)
  assert.match(overwriteRefused.stderr, /refusing to overwrite immutable file/)

  const promotionLock = path.join(root, '.project-cognition', '.governance.lock')
  fs.writeFileSync(promotionLock, 'operator must inspect this stale lock')
  const locked = run(['cognition', 'install', sealedFile, '--root', root, '--replace', '--expect-current-hash', current.state_hash], root)
  assert.equal(locked.status, 1)
  assert.match(locked.stderr, /promotion is active or left a stale lock/)
  const lockedDoctor = run(['doctor', root], root)
  assert.equal(lockedDoctor.status, 2)
  assert.equal(JSON.parse(lockedDoctor.stdout).checks.find((check) => check.name === 'governance_lock').status, 'FAIL')
  const lockedRender = run(['cognition', 'render', root], root)
  assert.equal(lockedRender.status, 1)
  fs.rmSync(promotionLock)

  const wrongBase = run(['cognition', 'install', sealedFile, '--root', root, '--replace', '--expect-current-hash', 'f'.repeat(64)], root)
  assert.equal(wrongBase.status, 1)
  assert.match(wrongBase.stderr, /does not match the installed canonical state/)
  assert.equal(fs.readFileSync(stateFile, 'utf8'), stateBeforeRefusals)
  assert.equal(fs.readFileSync(projectionFile, 'utf8'), projectionBeforeRefusals)

  const installed = run(['cognition', 'install', sealedFile, '--root', root, '--replace', '--expect-current-hash', current.state_hash], root)
  assert.equal(installed.status, 0, installed.stderr)
  const output = JSON.parse(installed.stdout)
  assert.equal(output.revision, 2)
  assert.match(fs.readFileSync(projectionFile, 'utf8'), /A human-reviewed draft becomes one sealed source of truth/)

  const installedState = fs.readFileSync(stateFile, 'utf8')
  const installedProjection = fs.readFileSync(projectionFile, 'utf8')
  const rollbackRefused = run(['cognition', 'install', sealedFile, '--root', root, '--replace', '--expect-current-hash', output.state_hash], root)
  assert.equal(rollbackRefused.status, 1)
  assert.match(rollbackRefused.stderr, /revision must equal.*plus one/)
  assert.equal(fs.readFileSync(stateFile, 'utf8'), installedState)
  assert.equal(fs.readFileSync(projectionFile, 'utf8'), installedProjection)
})

test('a projection preflight failure cannot partially replace canonical state', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-cognition-transaction-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  assert.equal(run(['init', root], root).status, 0)
  const stateFile = path.join(root, '.project-cognition', 'state.json')
  const projectionFile = path.join(root, 'PROJECT_COGNITION.md')
  const current = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  const candidate = { ...current, revision: current.revision + 1 }
  delete candidate.state_hash
  candidate.schema = 'project-cognition/state-draft/v1'
  candidate.mission = { ...candidate.mission, purpose: 'This revision must not be partially installed.' }
  const draftFile = path.join(root, 'candidate.json')
  const sealedFile = path.join(root, 'candidate.sealed.json')
  fs.writeFileSync(draftFile, JSON.stringify(candidate))
  assert.equal(run(['cognition', 'seal', draftFile, '--out', sealedFile], root).status, 0)
  const stateBefore = fs.readFileSync(stateFile, 'utf8')
  fs.rmSync(projectionFile)
  fs.mkdirSync(projectionFile)

  const refused = run(['cognition', 'install', sealedFile, '--root', root, '--replace', '--expect-current-hash', current.state_hash], root)
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /refusing to replace non-file path/)
  assert.equal(fs.readFileSync(stateFile, 'utf8'), stateBefore)
  assert.equal(fs.statSync(projectionFile).isDirectory(), true)
})

test('CLI approval enforces invariant and revision lineage and renders a stopping card', (t) => {
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

  const missingActor = run(['goal', 'approve', draftFile, '--actor', '--root', root], root)
  assert.equal(missingActor.status, 1)
  assert.match(missingActor.stderr, /--actor requires a value/)

  const first = run(['goal', 'approve', draftFile, '--actor', 'owner', '--root', root], root)
  assert.equal(first.status, 0, first.stderr)
  const output = JSON.parse(first.stdout)
  assert.match(output.contract, /G%2Fportable\.r1\.json$/)
  assert.ok(fs.existsSync(output.contract))

  const second = run(['goal', 'approve', draftFile, '--actor', 'owner', '--root', root], root)
  assert.equal(second.status, 1)
  assert.match(second.stderr, /revision 1 cannot be approved after an existing revision/)

  const unknownInvariantFile = path.join(root, 'unknown-invariant.json')
  fs.writeFileSync(unknownInvariantFile, JSON.stringify({ ...draft, goal_id: 'G/unknown', invariant_refs: ['I404'] }))
  const unknownInvariant = run(['goal', 'approve', unknownInvariantFile, '--actor', 'owner', '--root', root], root)
  assert.equal(unknownInvariant.status, 1)
  assert.match(unknownInvariant.stderr, /unknown or superseded cognition invariants: I404/)

  const skippedFile = path.join(root, 'revision-3.json')
  fs.writeFileSync(skippedFile, JSON.stringify({ ...draft, revision: 3 }))
  const skipped = run(['goal', 'approve', skippedFile, '--actor', 'owner', '--root', root], root)
  assert.equal(skipped.status, 1)
  assert.match(skipped.stderr, /complete installed chain; revision 2 is missing/)

  const eventsFile = path.join(root, 'events.json')
  const approved = JSON.parse(fs.readFileSync(output.contract, 'utf8'))
  const event = (sequence, type, data) => ({
    schema: 'project-cognition/goal-event/v1', sequence, goal_id: approved.goal_id,
    contract_hash: approved.contract_hash, type, at: '2026-08-24T00:00:00.000Z', data,
  })
  fs.writeFileSync(eventsFile, JSON.stringify([
    event(1, 'attempt_started', { attempt_id: 'baseline', baseline: true, target_criteria: ['C1'], repo_revision: 'abc' }),
    event(2, 'observation_recorded', { observation: {
      schema: 'project-cognition/observation/v1', goal_id: approved.goal_id, contract_hash: approved.contract_hash,
      attempt_id: 'baseline', criterion_id: 'C1', verifier_id: 'tests.core', result: 'pass', evidence_refs: ['tool:test'],
      repo_revision: 'abc', observed_at: '2026-08-24T00:00:00.000Z',
    } }),
    event(3, 'attempt_completed', { attempt_id: 'baseline' }),
  ]))
  const status = run(['goal', 'status', output.contract, eventsFile, '--format', 'markdown'], root)
  assert.equal(status.status, 0, status.stderr)
  assert.match(status.stdout, /Decision: `ALREADY_SATISFIED`/)
  assert.match(status.stdout, /STOP — do not continue polishing/)
  const shown = run(['goal', 'show', output.contract, '--format', 'markdown'], root)
  assert.equal(shown.status, 0, shown.stderr)
  assert.match(shown.stdout, /Definition of done/)

  const revision2File = path.join(root, 'revision-2.json')
  fs.writeFileSync(revision2File, JSON.stringify({ ...draft, revision: 2, target_state: 'Goal revision lineage is locally complete.' }))
  const revision2 = run(['goal', 'approve', revision2File, '--actor', 'owner', '--root', root], root)
  assert.equal(revision2.status, 0, revision2.stderr)
  assert.match(JSON.parse(revision2.stdout).contract, /G%2Fportable\.r2\.json$/)

  fs.rmSync(output.contract)
  const orphanRevision3File = path.join(root, 'orphan-revision-3.json')
  fs.writeFileSync(orphanRevision3File, JSON.stringify({ ...draft, revision: 3, target_state: 'This orphan must be rejected.' }))
  const orphanRevision3 = run(['goal', 'approve', orphanRevision3File, '--actor', 'owner', '--root', root], root)
  assert.equal(orphanRevision3.status, 1)
  assert.match(orphanRevision3.stderr, /complete installed chain; revision 1 is missing/)

  const dottedGoalDraft = { ...draft, goal_id: 'G/prefix.r9' }
  const dottedGoalFile = path.join(root, 'dotted-goal.json')
  fs.writeFileSync(dottedGoalFile, JSON.stringify(dottedGoalDraft))
  assert.equal(run(['goal', 'approve', dottedGoalFile, '--actor', 'owner', '--root', root], root).status, 0)
  const prefixGoalFile = path.join(root, 'prefix-goal.json')
  fs.writeFileSync(prefixGoalFile, JSON.stringify({ ...draft, goal_id: 'G/prefix' }))
  const prefixGoal = run(['goal', 'approve', prefixGoalFile, '--actor', 'owner', '--root', root], root)
  assert.equal(prefixGoal.status, 0, prefixGoal.stderr)
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
