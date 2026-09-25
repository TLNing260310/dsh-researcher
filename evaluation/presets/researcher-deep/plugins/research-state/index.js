// In-session research state with evidence-driven partial invalidation (v2.1).
//
// The claim ledger is the single source of truth; the project model, the
// diagnosis, and the classification are DERIVED VIEWS over it. This plugin
// keeps that structure out of the model context: the model submits revisions
// through the `research_checkpoint` tool and receives only a compact
// projection back.
//
// Dependency semantics (no rollback, only invalidation + recomputation):
//   evidence ──dependsOn──> claim ──> hypothesis ──> view (project model /
//   diagnosis / classification). Revising a claim — or MATERIALLY CHANGING a
//   hypothesis (statement/status/dependencies) — invalidates every dependent
//   recursively: dependent hypotheses flip to `invalidated` (versioned, never
//   deleted) and dirty views are recomputed individually. The pipeline is
//   never re-run as a whole and files are never re-read for a clean node.
//
// Event-sourcing contract (v2.1): DSH `tool/call` events carry
// `arguments: string` (the model's raw JSON). ONE reducer — applyCheckpoint —
// serves BOTH the live execute path and the session-log replay path, so
// runtime semantics === replay semantics. On `agent/created` the plugin folds
// every logged `research_checkpoint` call of the agent's session and rebuilds
// the state: resumed sessions, process restarts, and compaction losses all
// recover the same reasoning graph. `export`/`importState` provide a compact
// transfer path.
//
// Why not state.json: under the read-only sandbox the DSH fs seam denies ALL
// file writes — by design, that includes the preset directory. The session
// log is the only durable write channel a read-only research session has, and
// it is exactly the channel the harness already persists.
//
// Zero-write contract: this plugin writes NOTHING to the filesystem. The
// project tree is never touched; research metadata lives only in process
// memory and in the session log.

const SCHEMA_VERSION = 1

const TIERS = ['C0', 'C1', 'C2', 'C3', 'C4']
const VERDICTS = ['Known', 'Likely', 'Claimed', 'Unknown', 'Contradicted']
const MAX_IMPORT_BYTES = 2 * 1024 * 1024
const agentStates = new WeakMap()

const makeState = () => ({
  schemaVersion: SCHEMA_VERSION,
  phase: null,
  claims: new Map(),      // id -> { id, statement, tier, verdict, evidence[], confidence, revision }
  hypotheses: new Map(),  // id -> { id, statement, status, dependsOn[], revision }
  views: new Map(),       // name -> { dependsOn[], revision }
  dirty: new Set(),
})

const dependentsOf = (state, nodeId) => {
  const out = []
  for (const [hid, h] of state.hypotheses) {
    if ((h.dependsOn || []).includes(nodeId)) out.push(hid)
  }
  for (const [vname, v] of state.views) {
    if ((v.dependsOn || []).includes(nodeId)) out.push(vname)
  }
  return out
}

const invalidate = (state, nodeId, seen) => {
  if (seen.has(nodeId)) return
  seen.add(nodeId)
  for (const dep of dependentsOf(state, nodeId)) {
    if (state.hypotheses.has(dep)) {
      const h = state.hypotheses.get(dep)
      if (h.status === 'active') {
        // Auto-flip is itself a version event: record the previous state.
        const history = h.history || []
        history.push({ revision: h.revision, statement: h.statement, status: h.status, dependsOn: h.dependsOn })
        h.history = history.slice(-20)
        h.status = 'invalidated'
        h.revision += 1
      }
    }
    state.dirty.add(dep)
    invalidate(state, dep, seen)
  }
}

const sameList = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b)) return a === b
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((value, index) => value === sb[index])
}

// Mutation reducer over already-parsed argument objects.
const reduceMutation = (state, args) => {
  if (typeof args.phase === 'string' && args.phase.length > 0) state.phase = args.phase

  for (const claim of args.revise || []) {
    const old = state.claims.get(claim.id)
    state.claims.set(claim.id, {
      id: claim.id,
      statement: claim.statement !== undefined ? claim.statement : old && old.statement,
      tier: claim.tier !== undefined ? claim.tier : old && old.tier,
      verdict: claim.verdict !== undefined ? claim.verdict : old && old.verdict,
      evidence: claim.evidence !== undefined ? claim.evidence : old && old.evidence,
      confidence: typeof claim.confidence === 'number' ? claim.confidence : old && old.confidence,
      revision: (old ? old.revision : 0) + 1,
    })
    invalidate(state, claim.id, new Set())
  }

  for (const id of args.invalidate || []) invalidate(state, id, new Set())

  for (const hypothesis of args.hypotheses || []) {
    const old = state.hypotheses.get(hypothesis.id)
    const historyEntry = old ? {
      revision: old.revision,
      statement: old.statement,
      status: old.status,
      dependsOn: old.dependsOn,
    } : null
    const next = {
      id: hypothesis.id,
      statement: hypothesis.statement !== undefined ? hypothesis.statement : old && old.statement,
      status: hypothesis.status !== undefined ? hypothesis.status : (old ? old.status : 'active'),
      dependsOn: hypothesis.dependsOn !== undefined ? hypothesis.dependsOn : (old ? old.dependsOn : []),
      history: historyEntry ? [...(old.history || []), historyEntry].slice(-20) : [],
      revision: (old ? old.revision : 0) + 1,
    }
    const changed = !old
      || old.statement !== next.statement
      || old.status !== next.status
      || !sameList(old.dependsOn, next.dependsOn)
    state.hypotheses.set(hypothesis.id, next)
    // Material change (not only -> invalidated): any upstream knowledge change
    // must dirty everything derived from it.
    if (changed) invalidate(state, hypothesis.id, new Set())
  }

  for (const view of args.views || []) {
    const old = state.views.get(view.name)
    state.views.set(view.name, {
      dependsOn: view.dependsOn !== undefined ? view.dependsOn : (old ? old.dependsOn : []),
      revision: (old ? old.revision : 0) + 1,
    })
    state.dirty.delete(view.name)
  }

  for (const name of args.recompute || []) {
    if (state.views.has(name)) {
      const v = state.views.get(name)
      v.revision += 1
    }
    state.dirty.delete(name)
  }
}

const fullExport = (state) => ({
  schemaVersion: SCHEMA_VERSION,
  phase: state.phase,
  claims: [...state.claims.values()],
  hypotheses: [...state.hypotheses.values()],
  views: [...state.views.entries()].map(([name, v]) => ({
    name,
    dependsOn: v.dependsOn,
    revision: v.revision,
  })),
  dirty: [...state.dirty],
})

const projection = (state) => ({
  schemaVersion: SCHEMA_VERSION,
  phase: state.phase,
  claimCount: state.claims.size,
  hypotheses: [...state.hypotheses.values()].map((h) => ({
    id: h.id,
    status: h.status,
    revision: h.revision,
    statement: String(h.statement).slice(0, 120),
  })),
  views: [...state.views.keys()],
  dirty: [...state.dirty],
})

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const reject = (message) => { throw new Error('research_checkpoint import: ' + message) }
const assertAllowedKeys = (value, allowed, label) => {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) reject(label + ' has unknown field "' + key + '"')
  }
}
const assertText = (value, label, options = {}) => {
  if (typeof value !== 'string') reject(label + ' must be a string')
  if (options.nonEmpty && value.length === 0) reject(label + ' must not be empty')
  if (value.length > (options.max || 10000)) reject(label + ' is too long')
  if (/\0/.test(value)) reject(label + ' contains a NUL character')
}
const assertRevision = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 1) reject(label + ' must be a positive integer')
}
const assertStringList = (value, label, maxItems = 1000) => {
  if (!Array.isArray(value) || value.length > maxItems) reject(label + ' must be an array with at most ' + maxItems + ' items')
  for (let index = 0; index < value.length; index++) assertText(value[index], label + '[' + index + ']', { max: 2000 })
}
const assertUniqueIds = (items, label, key = 'id') => {
  const seen = new Set()
  for (const item of items) {
    if (seen.has(item[key])) reject(label + ' contains duplicate ' + key + ' "' + item[key] + '"')
    seen.add(item[key])
  }
}

const validateClaim = (claim, index) => {
  const label = 'claims[' + index + ']'
  if (!isPlainObject(claim)) reject(label + ' must be an object')
  assertAllowedKeys(claim, ['id', 'statement', 'tier', 'verdict', 'evidence', 'confidence', 'revision'], label)
  assertText(claim.id, label + '.id', { nonEmpty: true, max: 200 })
  if (claim.statement !== undefined) assertText(claim.statement, label + '.statement')
  if (claim.tier !== undefined && !TIERS.includes(claim.tier)) reject(label + '.tier is invalid')
  if (claim.verdict !== undefined && !VERDICTS.includes(claim.verdict)) reject(label + '.verdict is invalid')
  if (claim.evidence !== undefined) assertStringList(claim.evidence, label + '.evidence', 100)
  if (claim.confidence !== undefined && (typeof claim.confidence !== 'number' || !Number.isFinite(claim.confidence) || claim.confidence < 0 || claim.confidence > 1)) reject(label + '.confidence must be between 0 and 1')
  assertRevision(claim.revision, label + '.revision')
}

const validateHypothesisVersion = (version, label) => {
  if (!isPlainObject(version)) reject(label + ' must be an object')
  assertAllowedKeys(version, ['revision', 'statement', 'status', 'dependsOn'], label)
  assertRevision(version.revision, label + '.revision')
  if (version.statement !== undefined) assertText(version.statement, label + '.statement')
  if (!['active', 'invalidated'].includes(version.status)) reject(label + '.status is invalid')
  assertStringList(version.dependsOn, label + '.dependsOn', 1000)
}

const validateHypothesis = (hypothesis, index) => {
  const label = 'hypotheses[' + index + ']'
  if (!isPlainObject(hypothesis)) reject(label + ' must be an object')
  assertAllowedKeys(hypothesis, ['id', 'statement', 'status', 'dependsOn', 'history', 'revision'], label)
  assertText(hypothesis.id, label + '.id', { nonEmpty: true, max: 200 })
  if (hypothesis.statement !== undefined) assertText(hypothesis.statement, label + '.statement')
  if (!['active', 'invalidated'].includes(hypothesis.status)) reject(label + '.status is invalid')
  assertStringList(hypothesis.dependsOn, label + '.dependsOn', 1000)
  assertRevision(hypothesis.revision, label + '.revision')
  if (hypothesis.history !== undefined) {
    if (!Array.isArray(hypothesis.history) || hypothesis.history.length > 20) reject(label + '.history must contain at most 20 versions')
    hypothesis.history.forEach((entry, historyIndex) => validateHypothesisVersion(entry, label + '.history[' + historyIndex + ']'))
  }
}

const validateView = (view, index) => {
  const label = 'views[' + index + ']'
  if (!isPlainObject(view)) reject(label + ' must be an object')
  assertAllowedKeys(view, ['name', 'dependsOn', 'revision'], label)
  assertText(view.name, label + '.name', { nonEmpty: true, max: 200 })
  assertStringList(view.dependsOn, label + '.dependsOn', 1000)
  assertRevision(view.revision, label + '.revision')
}

const validateImportPayload = (payload) => {
  if (!isPlainObject(payload)) reject('payload must be an object')
  assertAllowedKeys(payload, ['schemaVersion', 'phase', 'claims', 'hypotheses', 'views', 'dirty'], 'payload')
  if (payload.schemaVersion !== SCHEMA_VERSION) reject('incompatible state payload')
  if (payload.phase !== null && payload.phase !== undefined) assertText(payload.phase, 'phase', { max: 200 })
  for (const field of ['claims', 'hypotheses', 'views', 'dirty']) {
    if (!Array.isArray(payload[field])) reject(field + ' must be an array')
  }
  if (payload.claims.length > 10000 || payload.hypotheses.length > 10000 || payload.views.length > 10000 || payload.dirty.length > 20000) reject('payload exceeds collection limits')
  payload.claims.forEach(validateClaim)
  payload.hypotheses.forEach(validateHypothesis)
  payload.views.forEach(validateView)
  assertStringList(payload.dirty, 'dirty', 20000)
  assertUniqueIds(payload.claims, 'claims')
  assertUniqueIds(payload.hypotheses, 'hypotheses')
  assertUniqueIds(payload.views, 'views', 'name')
  return payload
}

const importState = (state, payload) => {
  validateImportPayload(payload)
  // Build the replacement first. The live state is changed only after every
  // field has passed validation, so a rejected import is atomic.
  const replacement = makeState()
  replacement.phase = payload.phase ?? null
  replacement.claims = new Map(payload.claims.map((claim) => [claim.id, { ...claim, evidence: claim.evidence ? [...claim.evidence] : claim.evidence }]))
  replacement.hypotheses = new Map(payload.hypotheses.map((hypothesis) => [hypothesis.id, {
    ...hypothesis,
    dependsOn: [...hypothesis.dependsOn],
    history: (hypothesis.history || []).map((entry) => ({ ...entry, dependsOn: [...entry.dependsOn] })),
  }]))
  replacement.views = new Map(payload.views.map((view) => [view.name, { dependsOn: [...view.dependsOn], revision: view.revision }]))
  replacement.dirty = new Set(payload.dirty)

  state.phase = replacement.phase
  state.claims = replacement.claims
  state.hypotheses = replacement.hypotheses
  state.views = replacement.views
  state.dirty = replacement.dirty
}

// Accept the live object form (tool execution) or the DSH event form
// (arguments: string). Throws on anything else — malformed events must not
// silently no-op.
const parseCheckpointArgs = (raw) => {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  }
  throw new Error('invalid research_checkpoint arguments: ' + String(raw).slice(0, 120))
}

// THE single reducer: live execution and session replay both go through here.
const applyCheckpoint = (state, rawArgs) => {
  const args = parseCheckpointArgs(rawArgs)
  if (args.importState !== undefined) {
    if (typeof args.importState !== 'string') throw new Error('research_checkpoint import: importState must be a JSON string')
    if (Buffer.byteLength(args.importState, 'utf8') > MAX_IMPORT_BYTES) throw new Error('research_checkpoint import: payload exceeds 2 MiB')
    importState(state, JSON.parse(args.importState))
  }
  reduceMutation(state, args)
}

// Fold a session's logged research_checkpoint tool/call events into a state
// (used by live replay AND by the research_doctor replay-consistency check).
const foldCheckpointEventsDetailed = (events, state) => {
  const target = state || makeState()
  const rejected = []
  for (const event of Array.isArray(events) ? events : []) {
    if (!event || event.type !== 'tool/call') continue
    if (!event.data || event.data.name !== 'research_checkpoint') continue
    try {
      applyCheckpoint(target, event.data.arguments)
    } catch (error) {
      rejected.push({
        callId: event.data.callId,
        error: error && error.message ? error.message : String(error),
      })
    }
  }
  return { state: target, rejected }
}

const foldCheckpointEvents = (events, state) => foldCheckpointEventsDetailed(events, state).state
const liveStateOf = (agent) => agentStates.get(agent)

module.exports = {
  name: 'research-state',
  inject: ['tools', 'agents'],
  apply(ctx) {
    const definition = {
      name: 'research_checkpoint',
      description: 'Record research-state revisions: claims (with confidence), hypotheses, view dependencies, and invalidation. A stage is complete ONLY when its results are committed here — text summaries are not completion. Writes ONLY to the DSH session log (this tool call) — never to the filesystem; the project stays untouched. State is rebuilt automatically on session resume by replaying logged checkpoints. Returns the compact current projection; recompute only the listed dirty views, never re-run the whole pipeline.',
      parameters: {
        type: 'object',
        properties: {
          phase: { type: 'string', description: 'Current pipeline move (e.g. EVIDENCE_MAP).' },
          revise: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                statement: { type: 'string' },
                tier: { type: 'string', enum: TIERS },
                verdict: { type: 'string', enum: VERDICTS },
                evidence: { type: 'array', items: { type: 'string' } },
                confidence: { type: 'number', description: '0..1' },
              },
              required: ['id'],
            },
          },
          invalidate: { type: 'array', items: { type: 'string' } },
          hypotheses: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                statement: { type: 'string' },
                status: { type: 'string', enum: ['active', 'invalidated'] },
                dependsOn: { type: 'array', items: { type: 'string' } },
              },
              required: ['id'],
            },
          },
          views: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                dependsOn: { type: 'array', items: { type: 'string' } },
              },
              required: ['name'],
            },
          },
          recompute: { type: 'array', items: { type: 'string' } },
          export: { type: 'boolean', description: 'Return the full current state (for compact transfer).' },
          importState: { type: 'string', description: 'JSON string previously returned by export; replaces the current state.' },
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args, exec) {
        const agent = exec && exec.agent
        if (!agent) return 'research_checkpoint: no executing agent; state not recorded'
        let state = agentStates.get(agent)
        if (state === undefined) {
          state = makeState()
          agentStates.set(agent, state)
        }
        try {
          applyCheckpoint(state, args)
        } catch (error) {
          return 'research_checkpoint: rejected: ' + (error && error.message ? error.message : String(error))
        }
        if (args.export === true) {
          return JSON.stringify({ kind: 'full-export', ...fullExport(state) })
        }
        return JSON.stringify({
          ...projection(state),
          guidance: 'Project filesystem untouched. Recompute only dirty views; clean nodes were not invalidated.',
        })
      },
    }

    ctx.tools.register(definition)

    // Session-log replay: rebuild each agent's state from its own logged
    // research_checkpoint calls (durable tool/call events; arguments are the
    // model's raw JSON strings). Same reducer as live execution.
    const hydrate = (agent) => {
      if (!agent || !agent.session) return
      try {
        const events = Array.isArray(agent.session.events) ? agent.session.events : []
        agentStates.set(agent, foldCheckpointEventsDetailed(events, makeState()).state)
      } catch (error) {
        // Replay is best-effort at the event-array level: the model can always
        // re-import or re-derive.
      }
    }

    ctx.on('agent/created', (payload) => {
      hydrate(payload && payload.agent)
    })

    // DSH Web may compose this preset after the Agent already exists. Rebuild
    // the same live projection at the durable preset-selection boundary.
    ctx.on('agent-preset/selected', (sessionId, preset) => {
      const agent = ctx.agents.get(sessionId)
      if (!agent) return
      if (['researcher', 'researcher-quick', 'researcher-deep'].includes(preset)) hydrate(agent)
      else agentStates.delete(agent)
    })

    // Idempotent fallback for Web recompose: the scoped pre-step always
    // carries the live Agent even when the selection notification could not
    // resolve it from the registry.
    ctx.on('agent/pre-step', ({ agent }, next) => {
      if (agent && !agentStates.has(agent)) hydrate(agent)
      return next()
    })
  },
  // Test hooks: the reducer is nearly pure; unit tests exercise these.
  __test: { makeState, applyCheckpoint, parseCheckpointArgs, fullExport, importState, projection, foldCheckpointEvents, foldCheckpointEventsDetailed, validateImportPayload, liveStateOf, agentStates },
}
