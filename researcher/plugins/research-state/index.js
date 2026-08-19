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
    const next = {
      id: hypothesis.id,
      statement: hypothesis.statement !== undefined ? hypothesis.statement : old && old.statement,
      status: hypothesis.status !== undefined ? hypothesis.status : (old ? old.status : 'active'),
      dependsOn: hypothesis.dependsOn !== undefined ? hypothesis.dependsOn : (old ? old.dependsOn : []),
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

const importState = (state, payload) => {
  if (!payload || payload.schemaVersion !== SCHEMA_VERSION) throw new Error('research_checkpoint import: incompatible state payload')
  state.phase = payload.phase ?? null
  state.claims = new Map((payload.claims || []).map((c) => [c.id, { ...c, revision: c.revision ?? 1 }]))
  state.hypotheses = new Map((payload.hypotheses || []).map((h) => [h.id, { ...h, revision: h.revision ?? 1 }]))
  state.views = new Map((payload.views || []).map((v) => [v.name, { dependsOn: v.dependsOn || [], revision: v.revision ?? 1 }]))
  state.dirty = new Set(payload.dirty || [])
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
  if (args.importState !== undefined) importState(state, JSON.parse(args.importState))
  reduceMutation(state, args)
}

module.exports = {
  name: 'research-state',
  inject: ['tools'],
  apply(ctx) {
    const states = new WeakMap() // agent -> state

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
        let state = states.get(agent)
        if (state === undefined) {
          state = makeState()
          states.set(agent, state)
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
    ctx.on('agent/created', (payload) => {
      const agent = payload && payload.agent
      if (!agent || !agent.session || !Array.isArray(agent.session.events)) return
      try {
        let state = states.get(agent)
        if (state === undefined) {
          state = makeState()
          states.set(agent, state)
        }
        for (const event of agent.session.events) {
          if (!event || event.type !== 'tool/call') continue
          if (!event.data || event.data.name !== 'research_checkpoint') continue
          try {
            applyCheckpoint(state, event.data.arguments)
          } catch (error) {
            // One malformed historical call must not veto publication; skip it
            // and keep folding the rest.
          }
        }
      } catch (error) {
        // Replay is best-effort at the event-array level: the model can always
        // re-import or re-derive.
      }
    })
  },
  // Test hooks: the reducer is nearly pure; unit tests exercise these.
  __test: { makeState, applyCheckpoint, parseCheckpointArgs, fullExport, importState, projection },
}
