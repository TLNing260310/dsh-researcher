const { hashCanonical } = require('../canonical-json.js')
const { allowedKeys, text, stringArray, enumValue, positiveInteger, finiteNumber, uniqueBy, isPlainObject, fail } = require('../validation.js')

const STATE_SCHEMA = 'project-cognition/state/v1'
const DRAFT_STATE_SCHEMA = 'project-cognition/state-draft/v1'
const AUTHORITIES = ['repository_observed', 'document_declared', 'model_inferred', 'owner_ratified']
const PROOF_STATES = ['unknown', 'hypothesis', 'supported', 'proven_within_scope', 'refuted']
const FRESHNESS_STATES = ['fresh', 'stale', 'unknown']
const REVISION_DIFF_SCHEMA = 'project-cognition/revision-diff/v1'

const createEmptyState = () => ({
  schema: DRAFT_STATE_SCHEMA,
  revision: 1,
  mission: {
    purpose: 'Describe why this project exists.',
    intended_users: [],
    use_cases: [],
    environment: [],
  },
  architecture: { components: [], boundaries: [] },
  value_claims: [],
  invariants: [],
  decisions: [],
  evidence: [],
  known_unknowns: [],
  next_proofs: [],
})

const validateEvidenceRefs = (value, label) => stringArray(value, label, { maxItems: 500, maxLength: 500 })

const validateFreshness = (value, label) => {
  allowedKeys(value, ['status', 'fingerprint', 'checked_at'], label)
  enumValue(value.status, FRESHNESS_STATES, label + '.status')
  if (value.fingerprint !== undefined) text(value.fingerprint, label + '.fingerprint', { max: 1000 })
  if (value.checked_at !== undefined) text(value.checked_at, label + '.checked_at', { max: 100 })
}

const validateClaim = (value, index) => {
  const label = 'value_claims[' + index + ']'
  allowedKeys(value, ['id', 'statement', 'authority', 'proof_status', 'scope', 'confidence', 'evidence_refs', 'invalidation_conditions', 'freshness'], label)
  text(value.id, label + '.id', { max: 200 })
  text(value.statement, label + '.statement')
  enumValue(value.authority, AUTHORITIES, label + '.authority')
  enumValue(value.proof_status, PROOF_STATES, label + '.proof_status')
  text(value.scope, label + '.scope')
  finiteNumber(value.confidence, label + '.confidence', { minimum: 0, maximum: 1 })
  validateEvidenceRefs(value.evidence_refs, label + '.evidence_refs')
  stringArray(value.invalidation_conditions, label + '.invalidation_conditions', { maxItems: 100, maxLength: 2000 })
  validateFreshness(value.freshness, label + '.freshness')
}

const validateInvariant = (value, index) => {
  const label = 'invariants[' + index + ']'
  allowedKeys(value, ['id', 'statement', 'lifecycle', 'strength', 'authority', 'evidence_refs', 'change_policy', 'supersedes'], label)
  text(value.id, label + '.id', { max: 200 })
  text(value.statement, label + '.statement')
  enumValue(value.lifecycle, ['candidate', 'ratified', 'superseded'], label + '.lifecycle')
  enumValue(value.strength, ['soft', 'hard'], label + '.strength')
  enumValue(value.authority, AUTHORITIES, label + '.authority')
  validateEvidenceRefs(value.evidence_refs, label + '.evidence_refs')
  text(value.change_policy, label + '.change_policy')
  if (value.supersedes !== undefined) text(value.supersedes, label + '.supersedes', { max: 200 })
  if (value.lifecycle === 'ratified' && value.authority !== 'owner_ratified') fail(label, 'ratified invariants require owner_ratified authority')
}

const validateDecision = (value, index) => {
  const label = 'decisions[' + index + ']'
  allowedKeys(value, ['id', 'statement', 'rationale', 'status', 'authority', 'evidence_refs', 'supersedes'], label)
  text(value.id, label + '.id', { max: 200 })
  text(value.statement, label + '.statement')
  text(value.rationale, label + '.rationale')
  enumValue(value.status, ['active', 'superseded'], label + '.status')
  enumValue(value.authority, AUTHORITIES, label + '.authority')
  validateEvidenceRefs(value.evidence_refs, label + '.evidence_refs')
  if (value.supersedes !== undefined) text(value.supersedes, label + '.supersedes', { max: 200 })
}

const validateEvidence = (value, index) => {
  const label = 'evidence[' + index + ']'
  allowedKeys(value, ['id', 'kind', 'ref', 'fingerprint', 'observed_at'], label)
  text(value.id, label + '.id', { max: 200 })
  enumValue(value.kind, ['repository', 'document', 'test', 'benchmark', 'human'], label + '.kind')
  text(value.ref, label + '.ref', { max: 2000 })
  if (value.fingerprint !== undefined) text(value.fingerprint, label + '.fingerprint', { max: 1000 })
  if (value.observed_at !== undefined) text(value.observed_at, label + '.observed_at', { max: 100 })
}

const validateQuestion = (value, index, field) => {
  const label = field + '[' + index + ']'
  allowedKeys(value, ['id', 'statement', 'evidence_refs'], label)
  text(value.id, label + '.id', { max: 200 })
  text(value.statement, label + '.statement')
  validateEvidenceRefs(value.evidence_refs, label + '.evidence_refs')
}

const validateState = (state, options = {}) => {
  allowedKeys(state, ['schema', 'revision', 'state_hash', 'mission', 'architecture', 'value_claims', 'invariants', 'decisions', 'evidence', 'known_unknowns', 'next_proofs'], 'state')
  const isCanonical = state.schema === STATE_SCHEMA
  const isDraft = state.schema === DRAFT_STATE_SCHEMA
  if (!isCanonical && !isDraft) fail('state.schema', 'must equal ' + STATE_SCHEMA + ' or ' + DRAFT_STATE_SCHEMA)
  positiveInteger(state.revision, 'state.revision')

  allowedKeys(state.mission, ['purpose', 'intended_users', 'use_cases', 'environment'], 'state.mission')
  text(state.mission.purpose, 'state.mission.purpose')
  stringArray(state.mission.intended_users, 'state.mission.intended_users')
  stringArray(state.mission.use_cases, 'state.mission.use_cases')
  stringArray(state.mission.environment, 'state.mission.environment')

  allowedKeys(state.architecture, ['components', 'boundaries'], 'state.architecture')
  stringArray(state.architecture.components, 'state.architecture.components')
  stringArray(state.architecture.boundaries, 'state.architecture.boundaries')

  for (const field of ['value_claims', 'invariants', 'decisions', 'evidence', 'known_unknowns', 'next_proofs']) {
    if (!Array.isArray(state[field])) fail('state.' + field, 'must be an array')
  }
  state.value_claims.forEach(validateClaim)
  state.invariants.forEach(validateInvariant)
  state.decisions.forEach(validateDecision)
  state.evidence.forEach(validateEvidence)
  state.known_unknowns.forEach((entry, index) => validateQuestion(entry, index, 'known_unknowns'))
  state.next_proofs.forEach((entry, index) => validateQuestion(entry, index, 'next_proofs'))
  for (const field of ['value_claims', 'invariants', 'decisions', 'evidence', 'known_unknowns', 'next_proofs']) uniqueBy(state[field], 'id', 'state.' + field)

  const evidenceIds = new Set(state.evidence.map((entry) => entry.id))
  const referenced = [...state.value_claims, ...state.invariants, ...state.decisions, ...state.known_unknowns, ...state.next_proofs]
  for (const entry of referenced) {
    for (const evidenceId of entry.evidence_refs) if (!evidenceIds.has(evidenceId)) fail(entry.id + '.evidence_refs', 'references unknown evidence "' + evidenceId + '"')
  }

  if (isDraft && state.state_hash !== undefined) fail('state.state_hash', 'must be omitted from a draft state')
  if (isCanonical && state.state_hash === undefined) fail('state.state_hash', 'is required for canonical state')
  if (options.requireHash === true && !isCanonical) fail('state.schema', 'canonical state must use ' + STATE_SCHEMA)
  if (isCanonical) {
    text(state.state_hash, 'state.state_hash', { max: 64 })
    if (!/^[a-f0-9]{64}$/.test(state.state_hash)) fail('state.state_hash', 'must be a lowercase SHA-256 hex digest')
    if (options.verifyHash !== false && state.state_hash !== stateHash(state)) fail('state.state_hash', 'does not match canonical state content')
  }
  return state
}

const normativeState = (state) => {
  const copy = JSON.parse(JSON.stringify(state))
  delete copy.state_hash
  if (copy.schema === DRAFT_STATE_SCHEMA) copy.schema = STATE_SCHEMA
  return copy
}

const stateHash = (state) => hashCanonical(normativeState(state))

const sealState = (state) => {
  validateState(state)
  if (state.schema === STATE_SCHEMA) return JSON.parse(JSON.stringify(state))
  const copy = normativeState(state)
  copy.state_hash = stateHash(copy)
  validateState(copy, { requireHash: true })
  return copy
}

const equalCanonical = (left, right) => {
  if (left === undefined || right === undefined) return left === right
  return hashCanonical(left) === hashCanonical(right)
}

const changedFields = (before, after) => {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
  return [...keys].filter((key) => !equalCanonical(before && before[key], after && after[key])).sort()
}

const diffIdArray = (before, after) => {
  const beforeById = new Map(before.map((entry) => [entry.id, entry]))
  const afterById = new Map(after.map((entry) => [entry.id, entry]))
  const added = [...afterById.keys()].filter((id) => !beforeById.has(id))
  const removed = [...beforeById.keys()].filter((id) => !afterById.has(id))
  const changed = [...beforeById.keys()]
    .filter((id) => afterById.has(id) && !equalCanonical(beforeById.get(id), afterById.get(id)))
    .map((id) => ({ id, fields: changedFields(beforeById.get(id), afterById.get(id)) }))
  const beforeCommon = before.map((entry) => entry.id).filter((id) => afterById.has(id))
  const afterCommon = after.map((entry) => entry.id).filter((id) => beforeById.has(id))
  return { added, removed, changed, reordered: !equalCanonical(beforeCommon, afterCommon) }
}

const diffStates = (base, candidate) => {
  validateState(base, { requireHash: true })
  validateState(candidate)
  const collections = {}
  for (const field of ['value_claims', 'invariants', 'decisions', 'evidence', 'known_unknowns', 'next_proofs']) {
    collections[field] = diffIdArray(base[field], candidate[field])
  }

  const risks = []
  const addRisk = (code, severity, subject, detail) => risks.push({ code, severity, subject, detail })
  if (candidate.revision !== base.revision + 1) addRisk('non_sequential_revision', 'critical', 'state.revision', 'candidate revision must equal the canonical revision plus one')
  if (!equalCanonical(base.mission, candidate.mission)) addRisk('mission_changed', 'high', 'state.mission', 'project purpose or intended use changed')
  if (!equalCanonical(base.architecture, candidate.architecture)) addRisk('architecture_changed', 'high', 'state.architecture', 'architecture components or boundaries changed')

  const candidateClaims = new Map(candidate.value_claims.map((entry) => [entry.id, entry]))
  const proofRank = { unknown: 0, hypothesis: 1, supported: 2, proven_within_scope: 3, refuted: -1 }
  for (const previous of base.value_claims) {
    const next = candidateClaims.get(previous.id)
    if (!next) {
      if (previous.proof_status === 'refuted') addRisk('refuted_claim_removed', 'critical', previous.id, 'a refuted historical claim was removed')
      else if (previous.proof_status !== 'unknown') addRisk('supported_claim_removed', 'high', previous.id, 'a non-unknown claim was removed')
      continue
    }
    if (previous.authority !== next.authority) addRisk('claim_authority_changed', next.authority === 'owner_ratified' ? 'critical' : 'high', previous.id, previous.authority + ' -> ' + next.authority)
    const semanticFields = changedFields(previous, next).filter((field) => ['statement', 'scope', 'evidence_refs', 'invalidation_conditions'].includes(field))
    if (semanticFields.length > 0) addRisk('claim_semantics_changed', 'high', previous.id, 'claim semantics changed: ' + semanticFields.join(', '))
    if (previous.proof_status === 'refuted' && next.proof_status !== 'refuted') {
      addRisk('refuted_claim_rehabilitated', 'critical', previous.id, 'refuted -> ' + next.proof_status)
    } else if (previous.proof_status !== next.proof_status) {
      const downgraded = proofRank[next.proof_status] < proofRank[previous.proof_status]
      addRisk(downgraded ? 'claim_proof_downgraded' : 'claim_proof_changed', downgraded ? 'high' : 'medium', previous.id, previous.proof_status + ' -> ' + next.proof_status)
    }
  }
  for (const next of candidate.value_claims.filter((entry) => !base.value_claims.some((previous) => previous.id === entry.id))) {
    if (next.authority === 'owner_ratified' || next.authority === 'repository_observed') addRisk('asserted_claim_authority_added', 'high', next.id, 'new claim asserts ' + next.authority + ' authority')
  }

  const candidateInvariants = new Map(candidate.invariants.map((entry) => [entry.id, entry]))
  for (const previous of base.invariants) {
    const next = candidateInvariants.get(previous.id)
    if ((previous.strength === 'hard' || previous.lifecycle === 'ratified') && (!next || !equalCanonical(previous, next))) {
      addRisk('ratified_invariant_changed', 'critical', previous.id, next ? 'ratified or hard invariant content changed' : 'ratified or hard invariant was removed')
    }
  }
  for (const next of candidate.invariants.filter((entry) => !base.invariants.some((previous) => previous.id === entry.id))) {
    if (next.strength === 'hard' || next.lifecycle === 'ratified') addRisk('ratified_invariant_added', 'critical', next.id, 'new ratified or hard invariant added')
  }

  const candidateDecisions = new Map(candidate.decisions.map((entry) => [entry.id, entry]))
  for (const previous of base.decisions) {
    const next = candidateDecisions.get(previous.id)
    if (previous.status === 'active' && (!next || !equalCanonical(previous, next))) addRisk('active_decision_changed', 'high', previous.id, next ? 'active decision content changed' : 'active decision was removed')
  }
  for (const next of candidate.decisions.filter((entry) => !base.decisions.some((previous) => previous.id === entry.id))) {
    if (next.status === 'active') addRisk('active_decision_added', 'high', next.id, 'new active decision added')
  }
  for (const id of collections.evidence.removed) addRisk('evidence_removed', 'high', id, 'referenced evidence was removed from canonical state')

  const missionChanged = !equalCanonical(base.mission, candidate.mission)
  const architectureChanged = !equalCanonical(base.architecture, candidate.architecture)
  const collectionChangeCount = Object.values(collections).reduce((total, item) => total + item.added.length + item.removed.length + item.changed.length + (item.reordered ? 1 : 0), 0)
  return {
    schema: REVISION_DIFF_SCHEMA,
    base: { revision: base.revision, state_hash: base.state_hash },
    candidate: { revision: candidate.revision, state_hash: candidate.state_hash || stateHash(candidate), sealed: candidate.state_hash !== undefined },
    valid_next_revision: candidate.revision === base.revision + 1,
    changes: {
      mission: { changed: missionChanged, fields: missionChanged ? changedFields(base.mission, candidate.mission) : [] },
      architecture: { changed: architectureChanged, fields: architectureChanged ? changedFields(base.architecture, candidate.architecture) : [] },
      ...collections,
    },
    change_count: collectionChangeCount + Number(missionChanged) + Number(architectureChanged),
    risks,
    requires_owner_review: true,
    installable: candidate.state_hash !== undefined && candidate.revision === base.revision + 1,
  }
}

const evaluateFreshness = (state, observedFingerprints) => {
  validateState(state, { requireHash: true })
  if (!isPlainObject(observedFingerprints)) fail('observedFingerprints', 'must be an object keyed by evidence id')
  const evidence = state.evidence.map((entry) => {
    let status = 'unknown'
    if (entry.fingerprint !== undefined && Object.prototype.hasOwnProperty.call(observedFingerprints, entry.id)) {
      status = observedFingerprints[entry.id] === entry.fingerprint ? 'fresh' : 'stale'
    }
    return { id: entry.id, status, expected: entry.fingerprint, observed: observedFingerprints[entry.id] }
  })
  const byId = new Map(evidence.map((entry) => [entry.id, entry.status]))
  const claims = state.value_claims.map((claim) => {
    const statuses = claim.evidence_refs.map((id) => byId.get(id) || 'unknown')
    const status = statuses.includes('stale') ? 'stale' : statuses.length > 0 && statuses.every((item) => item === 'fresh') ? 'fresh' : 'unknown'
    return { id: claim.id, status }
  })
  return {
    schema: 'project-cognition/freshness-report/v1',
    state_hash: state.state_hash || stateHash(state),
    evidence,
    claims,
    stale_evidence: evidence.filter((entry) => entry.status === 'stale').map((entry) => entry.id),
    stale_claims: claims.filter((entry) => entry.status === 'stale').map((entry) => entry.id),
  }
}

const escapeCell = (value) => String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
const bullets = (values, empty = '_None recorded._') => values.length > 0 ? values.map((value) => '- ' + value).join('\n') : empty

const renderMarkdown = (state) => {
  validateState(state, { requireHash: true })
  const lines = [
    '<!-- GENERATED by project-cognition. Do not edit this projection or canonical state directly; use the reviewed draft → diff → seal → install workflow. -->',
    '# Project Cognition',
    '',
    'State revision: `' + state.revision + '`',
    'State hash: `' + (state.state_hash || stateHash(state)) + '`',
    '',
    '## Purpose and intended use',
    '',
    state.mission.purpose,
    '',
    '### Intended users',
    '',
    bullets(state.mission.intended_users),
    '',
    '### Use cases',
    '',
    bullets(state.mission.use_cases),
    '',
    '### Environment',
    '',
    bullets(state.mission.environment),
    '',
    '## Architecture and boundaries',
    '',
    '### Components',
    '',
    bullets(state.architecture.components),
    '',
    '### Boundaries',
    '',
    bullets(state.architecture.boundaries),
    '',
    '## Value claims and proof status',
    '',
  ]
  if (state.value_claims.length === 0) lines.push('_No value claims recorded._')
  else {
    lines.push('| ID | Claim | Proof | Authority | Scope | Confidence | Freshness |', '| --- | --- | --- | --- | --- | ---: | --- |')
    for (const claim of state.value_claims) lines.push('| ' + [claim.id, claim.statement, claim.proof_status, claim.authority, claim.scope, claim.confidence, claim.freshness.status].map(escapeCell).join(' | ') + ' |')
  }
  lines.push('', '## Ratified invariants', '')
  const invariants = state.invariants.filter((item) => item.lifecycle === 'ratified')
  if (invariants.length === 0) lines.push('_No ratified invariants._')
  else for (const item of invariants) lines.push('- **' + item.id + ' [' + item.strength + ']** — ' + item.statement + ' Change policy: ' + item.change_policy)
  lines.push('', '## Decisions', '')
  const decisions = state.decisions.filter((item) => item.status === 'active')
  if (decisions.length === 0) lines.push('_No active decisions._')
  else for (const item of decisions) lines.push('- **' + item.id + '** — ' + item.statement + ' Rationale: ' + item.rationale)
  lines.push('', '## Known unknowns', '', bullets(state.known_unknowns.map((item) => '**' + item.id + '** — ' + item.statement)), '', '## Next proofs', '', bullets(state.next_proofs.map((item) => '**' + item.id + '** — ' + item.statement)))
  return lines.join('\n')
}

module.exports = {
  STATE_SCHEMA,
  DRAFT_STATE_SCHEMA,
  REVISION_DIFF_SCHEMA,
  AUTHORITIES,
  PROOF_STATES,
  createEmptyState,
  validateState,
  normativeState,
  stateHash,
  sealState,
  diffStates,
  evaluateFreshness,
  renderMarkdown,
}
