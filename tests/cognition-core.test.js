const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const {
  STATE_SCHEMA,
  DRAFT_STATE_SCHEMA,
  createEmptyState,
  validateState,
  sealState,
  stateHash,
  diffStates,
  evaluateFreshness,
  renderMarkdown,
} = require('../lib/cognition-core/index.js')

const populatedState = () => {
  const state = createEmptyState()
  state.mission = {
    purpose: 'Preserve evidence-backed project intent across coding sessions.',
    intended_users: ['maintainers'],
    use_cases: ['architecture-aware coding'],
    environment: ['DSH'],
  }
  state.architecture = { components: ['Cognition Core', 'Goal Governor'], boundaries: ['Core never executes project commands'] }
  state.evidence.push({ id: 'E1', kind: 'benchmark', ref: 'evaluation/results.json', fingerprint: 'abc' })
  state.value_claims.push({
    id: 'V1', statement: 'A goal governor can reduce extra edits.', authority: 'model_inferred',
    proof_status: 'hypothesis', scope: 'DSH pilot', confidence: 0.5, evidence_refs: ['E1'],
    invalidation_conditions: ['Controlled trial shows no improvement'], freshness: { status: 'fresh', fingerprint: 'abc' },
  })
  state.invariants.push({
    id: 'I1', statement: 'Researcher remains read-only.', lifecycle: 'ratified', strength: 'hard',
    authority: 'owner_ratified', evidence_refs: ['E1'], change_policy: 'Owner must approve a new cognition revision.',
  })
  state.decisions.push({
    id: 'D1', statement: 'JSON is canonical.', rationale: 'Avoid dual-write drift.', status: 'active',
    authority: 'owner_ratified', evidence_refs: ['E1'],
  })
  state.known_unknowns.push({ id: 'U1', statement: 'Cross-client value is unknown.', evidence_refs: [] })
  state.next_proofs.push({ id: 'P1', statement: 'Run the four-arm DSH experiment.', evidence_refs: ['E1'] })
  return state
}

test('published schemas distinguish editable drafts from sealed canonical state', () => {
  const readSchema = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schemas', name), 'utf8'))
  const canonical = readSchema('cognition-state-v1.schema.json')
  const draft = readSchema('cognition-state-draft-v1.schema.json')
  assert.equal(canonical.properties.schema.const, STATE_SCHEMA)
  assert.equal(draft.properties.schema.const, DRAFT_STATE_SCHEMA)
  assert.ok(canonical.required.includes('state_hash'))
  assert.equal(draft.required.includes('state_hash'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(draft.properties, 'state_hash'), false)

  const commonShape = (schema) => {
    const copy = JSON.parse(JSON.stringify(schema))
    delete copy.$id
    delete copy.$comment
    delete copy.properties.state_hash
    copy.required = copy.required.filter((field) => field !== 'state_hash')
    copy.properties.schema.const = '<state-kind>'
    return copy
  }
  assert.deepEqual(commonShape(draft), commonShape(canonical))
})

test('cognition state seals deterministically and detects tampering', () => {
  const draft = populatedState()
  assert.equal(draft.schema, DRAFT_STATE_SCHEMA)
  assert.doesNotThrow(() => validateState(draft))
  assert.throws(() => validateState(draft, { requireHash: true }), /canonical state must use/)
  const sealed = sealState(draft)
  assert.equal(sealed.schema, STATE_SCHEMA)
  assert.doesNotThrow(() => validateState(sealed, { requireHash: true }))
  assert.equal(sealed.state_hash, stateHash(sealed))
  assert.equal(sealed.state_hash, stateHash(draft))
  assert.deepEqual(sealState(populatedState()), sealed)
  assert.deepEqual(sealState(sealed), sealed)

  const unsealedCanonical = JSON.parse(JSON.stringify(sealed))
  delete unsealedCanonical.state_hash
  assert.throws(() => validateState(unsealedCanonical), /required for canonical state/)
  const falselyHashedDraft = JSON.parse(JSON.stringify(draft))
  falselyHashedDraft.state_hash = sealed.state_hash
  assert.throws(() => validateState(falselyHashedDraft), /must be omitted from a draft state/)

  sealed.mission.purpose = 'tampered'
  assert.throws(() => validateState(sealed), /does not match canonical state content/)
})

test('revision diff exposes owner-review risks without mutating either state', () => {
  const base = sealState(populatedState())
  const candidate = JSON.parse(JSON.stringify(base))
  delete candidate.state_hash
  candidate.schema = DRAFT_STATE_SCHEMA
  candidate.revision++
  candidate.architecture.boundaries.push('Adapters cannot promote session claims.')
  candidate.value_claims[0].authority = 'owner_ratified'
  candidate.value_claims[0].proof_status = 'unknown'
  candidate.invariants[0].statement = 'Researcher is read-only unless explicitly overridden.'
  const beforeBase = JSON.stringify(base)
  const beforeCandidate = JSON.stringify(candidate)

  const report = diffStates(base, candidate)
  assert.equal(report.schema, 'project-cognition/revision-diff/v1')
  assert.equal(report.valid_next_revision, true)
  assert.equal(report.candidate.sealed, false)
  assert.equal(report.installable, false)
  assert.equal(report.changes.architecture.changed, true)
  assert.deepEqual(report.changes.value_claims.changed[0], { id: 'V1', fields: ['authority', 'proof_status'] })
  assert.ok(report.risks.some((risk) => risk.code === 'architecture_changed'))
  assert.ok(report.risks.some((risk) => risk.code === 'claim_authority_changed' && risk.severity === 'critical'))
  assert.ok(report.risks.some((risk) => risk.code === 'claim_proof_downgraded'))
  assert.ok(report.risks.some((risk) => risk.code === 'ratified_invariant_changed'))
  assert.equal(JSON.stringify(base), beforeBase)
  assert.equal(JSON.stringify(candidate), beforeCandidate)
})

test('revision diff flags supported claim removal and semantic weakening', () => {
  const base = populatedState()
  base.value_claims = [{
    id: 'V1', statement: 'Bound claim', authority: 'repository_observed', proof_status: 'supported', scope: 'repository tests', confidence: 0.8,
    evidence_refs: ['E1'], invalidation_conditions: ['tests fail'], freshness: { status: 'unknown', checked_at: '2026-08-24' },
  }]
  const sealed = sealState(base)
  const removed = JSON.parse(JSON.stringify(sealed))
  removed.revision += 1
  removed.value_claims = []
  delete removed.state_hash
  removed.schema = DRAFT_STATE_SCHEMA
  assert.ok(diffStates(sealed, removed).risks.some((risk) => risk.code === 'supported_claim_removed'))

  const weakened = JSON.parse(JSON.stringify(sealed))
  weakened.revision += 1
  weakened.value_claims[0].invalidation_conditions = ['never']
  delete weakened.state_hash
  weakened.schema = DRAFT_STATE_SCHEMA
  assert.ok(diffStates(sealed, weakened).risks.some((risk) => risk.code === 'claim_semantics_changed'))
})

test('revision diff protects refuted history from removal or rehabilitation', () => {
  const base = populatedState()
  base.value_claims[0].proof_status = 'refuted'
  const sealed = sealState(base)

  const removed = JSON.parse(JSON.stringify(sealed))
  removed.schema = DRAFT_STATE_SCHEMA
  removed.revision += 1
  removed.value_claims = []
  delete removed.state_hash
  assert.ok(diffStates(sealed, removed).risks.some((risk) => risk.code === 'refuted_claim_removed' && risk.severity === 'critical'))

  const rehabilitated = JSON.parse(JSON.stringify(sealed))
  rehabilitated.schema = DRAFT_STATE_SCHEMA
  rehabilitated.revision += 1
  rehabilitated.value_claims[0].proof_status = 'supported'
  delete rehabilitated.state_hash
  assert.ok(diffStates(sealed, rehabilitated).risks.some((risk) => risk.code === 'refuted_claim_rehabilitated' && risk.severity === 'critical'))
})

test('ratified invariants require owner authority and evidence refs must resolve', () => {
  const wrongAuthority = populatedState()
  wrongAuthority.invariants[0].authority = 'model_inferred'
  assert.throws(() => validateState(wrongAuthority), /owner_ratified/)

  const unknownEvidence = populatedState()
  unknownEvidence.value_claims[0].evidence_refs = ['missing']
  assert.throws(() => validateState(unknownEvidence), /unknown evidence/)
})

test('freshness reports evidence and dependent claims without mutating state', () => {
  const state = sealState(populatedState())
  const before = JSON.stringify(state)
  const report = evaluateFreshness(state, { E1: 'changed' })
  assert.deepEqual(report.stale_evidence, ['E1'])
  assert.deepEqual(report.stale_claims, ['V1'])
  assert.equal(JSON.stringify(state), before)
})

test('markdown is a deterministic generated projection', () => {
  const state = sealState(populatedState())
  const first = renderMarkdown(state)
  const second = renderMarkdown(state)
  assert.equal(first, second)
  assert.match(first, /GENERATED by project-cognition/)
  assert.match(first, /Researcher remains read-only/)
  assert.match(first, /Cross-client value is unknown/)
})
