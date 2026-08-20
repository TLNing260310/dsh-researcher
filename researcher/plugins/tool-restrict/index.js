// Read-only capability guard for the researcher preset (v3: fail-closed).
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
// Failure policy (v3): the zero-write contract is the product. A guard that
// silently degrades to sandbox-only after a DSH API change would keep starting
// sessions while the capability layer is gone. Default mode is STRICT:
//   - strict: any guard failure (stub registration, prompt shadow, or the
//     visibility preflight) throws inside the synchronous `agent/created`
//     listener, which vetoes agent publication — the session refuses to start
//     with a loud error instead of quietly losing a layer.
//   - compat (`config.mode: 'compat'`): degrades to sandbox-only enforcement
//     with an error log. For users who prefer availability over the contract.
//
// v0.4.4 — execution-time guard (fixes the recompose hole): agents that join
// this preset LATER (preset switch before the first message, resume, etc.)
// miss the `agent/created` installation window. The standing-scope
// `tools.guard` below is layer-based, not event-based: it applies to EVERY
// agent under this preset regardless of when it joined, and
//   - always denies `write`/`edit` execution (belt for the stubs);
//   - verifies the environment on each agent's first tool call and denies
//     EVERYTHING until sandbox=read-only + approval=never hold (fail-closed),
//     so a writable environment cannot run the researcher even when the
//     creation-time preflight never fired.
//
// Preflight: the agent object IS its own scope key (the loop builds the agent
// scope with createScope(loopCtx, agent)), so `agent.ctx.tools.get(name,
// agent)` reads exactly the agent's own view: it must resolve write/edit to
// THIS plugin's refusing stubs. If that lookup path changes in a future DSH,
// strict mode fails closed rather than trusting an unverifiable registration.
//
// This is capability removal at the tool layer, NOT an authority boundary:
// the session sandbox (read-only) and the approval policy (never) remain the
// real enforcement. Start researcher sessions with read-only + never.

const DENY = ['write', 'edit']

// Pure environment verdict used by both the creation-time preflight and the
// execution-time guard (unit-testable).
const envVerdict = (mode, policy) => {
  if (mode !== 'read-only') {
    return '[dsh-researcher] environment preflight: session sandbox is "' + mode + '", the researcher preset requires "read-only". Create the session with the read-only permission preset; the preset refuses to run under writable environments.'
  }
  if (policy !== 'never') {
    return '[dsh-researcher] environment preflight: session approval policy is "' + (policy === undefined ? 'unknown' : policy) + '", the researcher preset requires "never" (write escalation must have no upgrade path). Create the session with approval never; the preset refuses to run otherwise.'
  }
  return undefined
}

const readOnlyDenial = (name) => 'Refused: research mode is strictly read-only; the "' + name + '" tool is disabled by the researcher preset, so no file can be created or modified in this session.'

const DOCTOR_GATE_DENIAL = '[dsh-researcher] health gate: run research_doctor first — the Researcher Runtime Certificate must be SAFE before research begins (this is enforced, not a suggestion).'

// Pure guard decision machine (unit-tested): write/edit always denied; the
// doctor itself ALWAYS runs (it must be able to report UNSAFE); every other
// tool is denied until the doctor has run once, and is permanently denied
// when the environment failed verification (fail-closed; the certificate
// remains available as the explanation).
const decideGuard = (name, st, env) => {
  if (name === 'write' || name === 'edit') return { deny: readOnlyDenial(name), st }
  const envFailure = env !== undefined ? envVerdict(env.mode, env.policy) : undefined
  if (name === 'research_doctor') {
    return {
      deny: undefined,
      st: {
        envVerified: envFailure === undefined,
        envFailed: envFailure !== undefined,
        doctorCalled: true,
      },
    }
  }
  if (!st.doctorCalled) return { deny: DOCTOR_GATE_DENIAL, st }
  if (st.envFailed) {
    return { deny: '[dsh-researcher] environment failed verification — the Runtime Certificate is UNSAFE; fix the listed checks and start a new session. Run research_doctor again for the certificate details.', st }
  }
  if (envFailure !== undefined) return { deny: envFailure, st }
  return { deny: undefined, st }
}

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
const DELIVERABLES_GUIDANCE = {
  name: 'ui:deliverable-file-references',
  order: 190,
  text: 'This session is strictly read-only: no files are created or modified, so there are no produced files to mention; every deliverable lives in the conversation.',
}

module.exports = {
  name: 'tool-restrict',
  inject: ['tools', 'agents', 'sandboxPolicy', 'approval'],
  apply(ctx, config) {
    const mode = config && config.mode === 'compat' ? 'compat' : 'strict'

    // 1) Global-layer deny mask (TUI deployments where the tools are global).
    try {
      ctx.tools.restrict({ deny: DENY })
    } catch (error) {
      // Expected on the Web deployment: preset-plane tools are not global
      // names, so the registry rejects the filter. The stubs below do the job.
    }

    // 0) Environment preflight (v0.4): the authority layers — sandbox and
    // approval — are pinned into the session at creation. The preset no longer
    // ASSUMES the user picked read-only + never; it VERIFIES, and refuses an
    // explicit wrong configuration instead of running in a writable
    // environment. Sessions without explicit pins (programmatic/child
    // sessions) are tightened to read-only + never, never relaxed.
    const verifyEnvironment = (agent, session) => {
      const sandboxOverride = ctx.sandboxPolicy.overrideOf(session)
      const approvalOverride = ctx.approval.overrideOf(session)

      if (sandboxOverride === undefined || approvalOverride === undefined) {
        try {
          ctx.sandboxPolicy.setSandboxMode(session, 'read-only')
          ctx.approval.setPolicy(agent, 'never')
        } catch (error) {
          throw new Error('environment preflight: cannot pin an un-pinned session to read-only/never: ' + (error && error.message ? error.message : String(error)))
        }
      }

      const resolvedMode = ctx.sandboxPolicy.resolve({ session }).mode
      const resolvedPolicy = ctx.approval.overrideOf(session)
      if (resolvedMode !== 'read-only') {
        throw new Error(
          '[dsh-researcher] environment preflight: session sandbox is "' + resolvedMode + '", the researcher preset requires "read-only". ' +
          'Create the session with the read-only permission preset; the preset refuses to run under writable environments.',
        )
      }
      if (resolvedPolicy !== 'never') {
        throw new Error(
          '[dsh-researcher] environment preflight: session approval policy is "' + (resolvedPolicy === undefined ? 'unknown' : resolvedPolicy) + '", the researcher preset requires "never" ' +
          '(write escalation must have no upgrade path). Create the session with approval never; the preset refuses to run otherwise.',
        )
      }
    }

    // 2) Per-agent always-refusing stubs + prompt shadows, fail-closed.
    const stubs = new WeakMap()

    const shadow = (agent) => {
      if (stubs.has(agent)) return
      const disposers = []
      try {
        const session = agent.session
        if (!session) throw new Error('agent has no live session')
        verifyEnvironment(agent, session)

        for (const name of DENY) {
          disposers.push(agent.ctx.tools.register(stubDefinition(name)))
        }
        const systemPrompt = agent.ctx.get('systemPrompt')
        if (systemPrompt === undefined) {
          throw new Error('systemPrompt service unavailable to the guard')
        }
        disposers.push(systemPrompt.section(WRITE_GUIDANCE))
        disposers.push(systemPrompt.section(EDIT_GUIDANCE))
        disposers.push(systemPrompt.section(DELIVERABLES_GUIDANCE))

        // Preflight: the agent's own view must resolve write/edit to OUR stubs.
        for (const name of DENY) {
          const seen = agent.ctx.tools.get(name, agent)
          if (seen === undefined || seen === null || String(seen.description).indexOf('DISABLED') < 0) {
            throw new Error('preflight failed: the agent-layer "' + name + '" tool does not resolve to the refusing stub')
          }
        }
      } catch (error) {
        for (const dispose of disposers) dispose()
        if (mode === 'strict') {
          throw new Error(
            '[dsh-researcher] read-only capability guard failed; refusing to start this agent (strict mode). ' +
            'The current DSH runtime is incompatible or a guard row did not apply. ' +
            'Cause: ' + (error && error.message ? error.message : String(error)),
          )
        }
        console.error('[dsh-researcher] read-only guard DEGRADED to sandbox-only enforcement (compat mode):', error && error.message ? error.message : error)
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

    // 3) Execution-time guard (v0.4.4/v0.5.1): layer-based, not event-based —
    // applies to every agent under this preset, including agents that joined
    // via recompose after `agent/created` already fired (the preset-switch
    // path). write/edit are always denied; the environment is verified once
    // per agent; every other tool is denied until research_doctor has run
    // once (mandatory health gate — the certificate is enforced, not
    // suggested).
    const guardStates = new WeakMap()
    ctx.tools.guard((exec) => {
      const name = exec && exec.name
      const agent = exec && exec.agent
      if (!agent) return name === 'write' || name === 'edit' ? readOnlyDenial(name) : undefined
      let st = guardStates.get(agent)
      if (st === undefined) {
        st = { envVerified: false, doctorCalled: false, envFailed: false }
        guardStates.set(agent, st)
      }
      let env
      if (!st.envVerified && !st.envFailed) {
        try {
          env = {
            mode: ctx.sandboxPolicy.resolve({ session: agent.session }).mode,
            policy: ctx.approval.overrideOf(agent.session),
          }
        } catch (error) {
          return '[dsh-researcher] environment preflight failed: ' + (error && error.message ? error.message : String(error))
        }
      }
      const outcome = decideGuard(name, st, env)
      guardStates.set(agent, outcome.st)
      return outcome.deny
    })
  },
  __test: { envVerdict, stubDefinition, readOnlyDenial, decideGuard, DOCTOR_GATE_DENIAL },
}
