// In-session research state with evidence-driven partial invalidation.
//
// The claim ledger is the single source of truth; the project model, the
// diagnosis, and the classification are DERIVED VIEWS over it. This plugin
// keeps that structure out of the model context: the model submits revisions
// through the `research_checkpoint` tool and receives only a compact
// projection back.
//
// Dependency semantics (no rollback, only invalidation + recomputation):
//   evidence ──dependsOn──> claim ──> hypothesis ──> view (project model /
//   diagnosis / classification). Revising a claim invalidates every dependent
//   recursively: hypotheses flip to `invalidated` (versioned, never deleted)
//   and dirty views are recomputed individually — the pipeline is never
//   re-run as a whole and files are never re-read for a node that is clean.
//
// Persistence contract: the tool call itself is a durable DSH session event
// (tool/call + tool/result live in the append-only session log), so a resumed
// session can rebuild the state by replaying its checkpoints. In-memory state
// is keyed per agent: two researcher sessions never share a ledger.
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
  claims: new Map(),      // id -> { id, statement, tier, verdict, evidence[], revision }
  hypotheses: new Map(),  // id -> { id, statement, status, dependsOn[], revision }
  views: new Map(),       // name -> { dependsOn[], revision }
  dirty: new Set(),       // view names (and invalidated hypothesis ids) needing recompute
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

module.exports = {
  name: 'research-state',
  inject: ['tools'],
  apply(ctx) {
    const states = new WeakMap() // agent -> state

    const definition = {
      name: 'research_checkpoint',
      description: 'Record research-state revisions: claims, hypotheses, view dependencies, and invalidation. Writes ONLY to the DSH session log (this tool call) — never to the filesystem; the project stays untouched. Returns the compact current projection; recompute only the listed dirty views, never re-run the whole pipeline.',
      parameters: {
        type: 'object',
        properties: {
          phase: { type: 'string', description: 'Current pipeline move (e.g. EVIDENCE_MAP).' },
          revise: {
            type: 'array',
            description: 'Claims to create or revise; revision bumps and dependents are invalidated automatically.',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                statement: { type: 'string' },
                tier: { type: 'string', enum: TIERS },
                verdict: { type: 'string', enum: VERDICTS },
                evidence: { type: 'array', items: { type: 'string' } },
              },
              required: ['id'],
            },
          },
          invalidate: {
            type: 'array',
            description: 'Claim or hypothesis ids whose dependents must be invalidated.',
            items: { type: 'string' },
          },
          hypotheses: {
            type: 'array',
            description: 'Hypotheses to register/update (versioned: invalidated hypotheses are kept, never deleted).',
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
            description: 'Derived views to register/update with their claim/hypothesis dependencies.',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                dependsOn: { type: 'array', items: { type: 'string' } },
              },
              required: ['name'],
            },
          },
          recompute: {
            type: 'array',
            description: 'View names that were just recomputed; they leave the dirty set.',
            items: { type: 'string' },
          },
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
        if (typeof args.phase === 'string' && args.phase.length > 0) state.phase = args.phase

        for (const claim of args.revise || []) {
          const old = state.claims.get(claim.id)
          state.claims.set(claim.id, {
            id: claim.id,
            statement: claim.statement !== undefined ? claim.statement : old && old.statement,
            tier: claim.tier !== undefined ? claim.tier : old && old.tier,
            verdict: claim.verdict !== undefined ? claim.verdict : old && old.verdict,
            evidence: claim.evidence !== undefined ? claim.evidence : old && old.evidence,
            revision: (old ? old.revision : 0) + 1,
          })
          invalidate(state, claim.id, new Set())
        }

        for (const id of args.invalidate || []) invalidate(state, id, new Set())

        for (const hypothesis of args.hypotheses || []) {
          const old = state.hypotheses.get(hypothesis.id)
          state.hypotheses.set(hypothesis.id, {
            id: hypothesis.id,
            statement: hypothesis.statement !== undefined ? hypothesis.statement : old && old.statement,
            status: hypothesis.status !== undefined ? hypothesis.status : (old ? old.status : 'active'),
            dependsOn: hypothesis.dependsOn !== undefined ? hypothesis.dependsOn : (old ? old.dependsOn : []),
            revision: (old ? old.revision : 0) + 1,
          })
          if (hypothesis.status === 'invalidated') invalidate(state, hypothesis.id, new Set())
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

        const view = projection(state)
        return JSON.stringify({
          ...view,
          guidance: 'Project filesystem untouched. Recompute only dirty views; clean nodes were not invalidated.',
        })
      },
    }

    ctx.tools.register(definition)
  },
}
