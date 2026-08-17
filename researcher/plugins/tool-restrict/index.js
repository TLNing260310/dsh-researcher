// Read-only capability removal for the researcher preset.
//
// Why this exists: `@deepseek-ai/dsh-tool-fs` registers read/read_image/write/
// edit together, with no per-tool config. On the Web deployment the tool rows
// live on the preset plane (the host disables its copies), and
// ctx.tools.restrict() validates deny names against GLOBAL tool names only —
// so a preset-level deny mask cannot name preset-plane tools. This plugin
// therefore replaces the mutation tools with always-refusing stubs in each
// agent's OWN scope layer, which unconditionally overrides the inherited
// (standing-layer) registrations: for every agent on this preset, `write` and
// `edit` resolve to the stubs and the real executors never run.
//
// Mechanics:
//   - `agent/created` is dispatched scope-filtered with the agent's scope
//     carrier; this plugin's context carries the preset's standing scope key,
//     which is an ancestor of every agent joined to the preset, so the
//     listener receives exactly this preset's agents (top agent and subagent
//     children — children join the same standing composition).
//   - `agent.ctx.tools.register(...)` registers into the agent's OWN layer
//     (the traceable service proxy resolves ctx to the calling context), the
//     same pattern the subagent driver uses for per-child tools.
//   - `agent.ctx.systemPrompt.section(...)` shadows the tool-fs write/edit
//     GUIDANCE sections with read-only text (same section names; nearest
//     layer wins), so "use the write tool…" never appears in this preset's
//     system prompt either. tool-fs injects those sections unconditionally
//     even when the tools are hidden, which is exactly why the shadow is
//     needed for a pure reading-attention profile.
//   - Disposers are tracked per agent and released on `agent/disposed`.
//   - A deny-mask attempt through ctx.tools.restrict() is made first for
//     deployments where the tools ARE global (TUI); it throws there being no
//     global names to deny on the Web, and the throw is expected and ignored.
//
// This is capability removal at the tool layer, NOT an authority boundary:
// the session sandbox (read-only) and the approval policy (never) remain the
// real enforcement. Start researcher sessions with read-only + never.

const DENY = ['write', 'edit']

const stubDefinition = (name) => ({
  name,
  description: 'DISABLED in research mode. This preset is strictly read-only: this tool is a stub that always refuses, so nothing is ever created or modified.',
  parameters: {
    type: 'object',
    properties: {},
  },
  output: {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  async execute() {
    return 'Refused: research mode is strictly read-only. The "' + name + '" tool is disabled by the researcher preset; no file can be created or modified in this session.'
  },
})

module.exports = {
  name: 'tool-restrict',
  inject: ['tools', 'agents'],
  apply(ctx) {
    // 1) Global-layer deny mask (TUI deployments where the tools are global).
    try {
      ctx.tools.restrict({ deny: DENY })
    } catch (error) {
      // Expected on the Web deployment: preset-plane tools are not global
      // names, so the registry rejects the filter. The stubs below do the job.
    }

    // 2) Per-agent always-refusing stubs (the guarantee on this deployment).
    const stubs = new WeakMap()

    // tool-fs registers "Use the write tool…" / "Use the edit tool…" prompt
    // guidance unconditionally; these same-name sections shadow them per agent.
    const WRITE_GUIDANCE = {
      name: 'tool:write',
      order: 101,
      text: 'The write tool is disabled in this research session: this preset is strictly read-only, so no file is ever created or replaced here. Report every finding in the conversation instead.',
    }
    const EDIT_GUIDANCE = {
      name: 'tool:edit',
      order: 102,
      text: 'The edit tool is disabled in this research session: this preset is strictly read-only, so no file is ever modified here. Report every finding in the conversation instead.',
    }
    // The Web shell also registers a GLOBAL section asking the model to mention
    // "files it successfully created or modified" — pure write-attention noise
    // for a read-only agent; a scoped section shadows the global one by name.
    const DELIVERABLES_GUIDANCE = {
      name: 'ui:deliverable-file-references',
      order: 190,
      text: 'This session is strictly read-only: no files are created or modified, so there are no produced files to mention; every deliverable lives in the conversation.',
    }

    const shadow = (agent) => {
      if (stubs.has(agent)) return
      let disposers = []
      try {
        disposers = DENY.map((name) => agent.ctx.tools.register(stubDefinition(name)))
        const systemPrompt = agent.ctx.get('systemPrompt')
        if (systemPrompt !== undefined) {
          disposers.push(systemPrompt.section(WRITE_GUIDANCE))
          disposers.push(systemPrompt.section(EDIT_GUIDANCE))
          disposers.push(systemPrompt.section(DELIVERABLES_GUIDANCE))
        }
      } catch (error) {
        // Never veto agent publication; degrade to sandbox-only enforcement.
        for (const dispose of disposers) dispose()
        return
      }
      stubs.set(agent, disposers)
    }

    const release = (agent) => {
      const disposers = stubs.get(agent)
      stubs.delete(agent)
      if (disposers) for (const dispose of disposers) dispose()
    }

    ctx.on('agent/created', (payload) => {
      const agent = payload && payload.agent
      if (agent && agent.ctx) shadow(agent)
    })
    ctx.on('agent/disposed', (payload) => {
      const agent = payload && payload.agent
      if (agent) release(agent)
    })
  },
}
