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

const fs = require('node:fs')
const path = require('node:path')

const DENY = ['write', 'edit']
const RESEARCHER_PRESETS = new Set(['researcher', 'researcher-quick', 'researcher-deep'])
const doctorCapabilities = new WeakMap()
const doctorVerdicts = new WeakMap()

const TERMINAL_GATE_NOTICE = '[dsh-researcher] terminal gate: your previous assistant text was rejected as an uncertified draft because this session has no completed research_doctor result. Call research_doctor now. Do not answer in prose before the tool result.'
const TERMINAL_GATE_FAILURE = '[dsh-researcher] terminal gate: refusing to complete this turn because the model produced assistant text twice without a completed research_doctor result.'

const recordDoctorVerdict = (agent, overall) => {
  if (!agent || (typeof agent !== 'object' && typeof agent !== 'function')) return
  doctorVerdicts.set(agent, { overall, issuedAt: Date.now() })
  if (overall === 'SAFE') {
    doctorCapabilities.set(agent, { overall: 'SAFE', issuedAt: Date.now() })
  } else {
    doctorCapabilities.delete(agent)
  }
}

const doctorCapabilityOf = (agent) => agent ? doctorCapabilities.get(agent) : undefined
const doctorVerdictOf = (agent) => agent ? doctorVerdicts.get(agent) : undefined
const revokeDoctorCapability = (agent) => {
  if (!agent) return
  doctorCapabilities.delete(agent)
  doctorVerdicts.delete(agent)
}

const terminalGateDecision = (verdict, retries) => {
  if (verdict && ['SAFE', 'DEGRADED', 'UNSAFE'].includes(verdict.overall)) return { kind: 'accept' }
  if ((retries || 0) < 1) return { kind: 'retry', retries: (retries || 0) + 1 }
  return { kind: 'reject', error: TERMINAL_GATE_FAILURE }
}

const makeTerminalGateMessage = () => Object.freeze({
  id: crypto.randomUUID(),
  role: 'user',
  content: [Object.freeze({ type: 'text', text: TERMINAL_GATE_NOTICE })],
  source: Object.freeze({
    kind: 'plugin',
    plugin: 'dsh-researcher/tool-restrict',
    form: 'notice',
    summary: 'Uncertified assistant draft rejected; research_doctor is required.',
  }),
})

const isResearcherPreset = (id) => RESEARCHER_PRESETS.has(id)

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
const READ_ROOT_DENIAL = '[dsh-researcher] read-root confinement: researcher filesystem tools may read only inside the session workspace. Parent, sibling, and external absolute paths are refused.'

const canonicalExisting = (value) => {
  try { return fs.realpathSync.native ? fs.realpathSync.native(value) : fs.realpathSync(value) } catch (error) { return path.resolve(value) }
}

// path.isAbsolute understands only the current host's path dialect. Treat a
// foreign absolute path as absolute too, otherwise C:/outside becomes a
// workspace-relative path on POSIX and can slip past the lexical check.
const isPortableAbsolute = (value) => path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value)

const isWithin = (root, target) => {
  const relative = path.relative(root, target)
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
}

const readPathVerdict = (name, args, workspaceRoot) => {
  const fields = name === 'read' || name === 'read_image' ? ['file_path'] : name === 'glob' || name === 'grep' ? ['path'] : []
  if (fields.length === 0) return undefined
  const lexicalRoot = path.resolve(workspaceRoot)
  const canonicalRoot = canonicalExisting(lexicalRoot)
  for (const field of fields) {
    const value = args && args[field]
    if (value === undefined && (name === 'glob' || name === 'grep')) continue
    if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) return READ_ROOT_DENIAL
    if (isPortableAbsolute(value) && !path.isAbsolute(value)) return READ_ROOT_DENIAL
    const lexical = path.resolve(lexicalRoot, value)
    if (!isWithin(lexicalRoot, lexical)) return READ_ROOT_DENIAL
    if (!isWithin(canonicalRoot, canonicalExisting(lexical))) return READ_ROOT_DENIAL
  }
  return undefined
}

// Pure guard decision machine (unit-tested): write/edit always denied; the
// doctor itself ALWAYS runs (it must be able to report UNSAFE); every other
// tool is denied until the doctor has actually PRODUCED a SAFE certificate.
// Merely calling the tool is not a capability token.
const decideGuard = (name, st, env) => {
  st = st || { doctorCalled: false, doctorSafe: false }
  if (name === 'write' || name === 'edit') return { deny: readOnlyDenial(name), st }
  const envFailure = env !== undefined ? envVerdict(env.mode, env.policy) : undefined
  if (name === 'research_doctor') {
    return {
      deny: undefined,
      st: {
        envVerified: envFailure === undefined,
        envFailed: envFailure !== undefined,
        doctorCalled: true,
        doctorSafe: false,
      },
    }
  }
  if (st.envFailed) {
    return { deny: '[dsh-researcher] environment failed verification — the Runtime Certificate is UNSAFE; fix the listed checks and start a new session. Run research_doctor again for the certificate details.', st }
  }
  if (envFailure !== undefined) {
    return { deny: envFailure, st: { ...st, envVerified: false, envFailed: true, doctorSafe: false } }
  }
  if (!st.doctorSafe) return { deny: DOCTOR_GATE_DENIAL, st }
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

      if (sandboxOverride === undefined) {
        try {
          ctx.sandboxPolicy.setSandboxMode(session, 'read-only')
        } catch (error) {
          throw new Error('environment preflight: cannot pin an un-pinned session to read-only: ' + (error && error.message ? error.message : String(error)))
        }
      }

      const resolvedMode = ctx.sandboxPolicy.resolve({ session }).mode
      if (resolvedMode !== 'read-only') {
        throw new Error(
          '[dsh-researcher] environment preflight: session sandbox is "' + resolvedMode + '", the researcher preset requires "read-only". ' +
          'Create the session with the read-only permission preset; the preset refuses to run under writable environments.',
        )
      }
      // DSH Web's Read Only access preset currently carries approval=ask.
      // Researcher requires no escalation path, so tighten ask/undefined to
      // never during both initial composition and post-creation recompose.
      // This is a one-way authority reduction; writable sandboxes still fail.
      if (approvalOverride !== 'never') {
        try {
          ctx.approval.setPolicy(agent, 'never')
        } catch (error) {
          throw new Error('environment preflight: cannot tighten approval policy to never: ' + (error && error.message ? error.message : String(error)))
        }
      }
      const resolvedPolicy = ctx.approval.overrideOf(session)
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
      const session = agent && agent.session
      if (!session) throw new Error('agent has no live session')
      // Re-check authority even when the stubs were attached earlier. DSH Web
      // can change a session permission after a SAFE doctor result; an
      // idempotent attachment must not turn into an idempotent security check.
      verifyEnvironment(agent, session)
      if (stubs.has(agent)) return
      const disposers = []
      try {
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

    const terminalGateRetries = new WeakMap()

    const release = (agent) => {
      const disposers = stubs.get(agent)
      stubs.delete(agent)
      terminalGateRetries.delete(agent)
      revokeDoctorCapability(agent)
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

    // DSH Web creates a blank/standard agent and then re-links it to the
    // selected preset. The standing preset is mounted before this durable
    // event is appended, so install the agent-layer stubs at that boundary as
    // well as at agent/created. Release them if a still-blank agent switches
    // away before its first message.
    ctx.on('agent-preset/selected', (sessionId, preset) => {
      const agent = ctx.agents.get(sessionId)
      if (!agent || !agent.ctx) return
      if (isResearcherPreset(preset)) shadow(agent)
      else release(agent)
    })

    // Some Web recompose paths publish the durable selection before the
    // preset-scoped listener can resolve the live Agent. The first scoped
    // pre-step is the authoritative fallback because it carries that Agent.
    // Failures throw before the model request instead of degrading silently.
    ctx.on('agent/pre-step', ({ agent }, next) => {
      if (agent && agent.ctx) shadow(agent)
      return next()
    })

    // 2b) Terminal doctor gate. A tools.guard can deny the wrong first tool,
    // but DSH completes a step immediately when the model emits no tool call.
    // Intercept that separate terminal path: permit a real completed doctor
    // verdict (SAFE may research; DEGRADED/UNSAFE may only explain and stop),
    // otherwise inject one bounded correction step and then fail loudly.
    ctx.on('agent/turn-stopping', ({ agent }) => {
      if (!agent) return
      // The terminal path may contain no tool call, so tools.guard cannot be
      // its drift detector. Re-verify here and revoke stale certification
      // before refusing a session whose permission changed after doctor.
      try {
        verifyEnvironment(agent, agent.session)
      } catch (error) {
        revokeDoctorCapability(agent)
        throw error
      }
      const decision = terminalGateDecision(doctorVerdictOf(agent), terminalGateRetries.get(agent))
      if (decision.kind === 'accept') {
        terminalGateRetries.delete(agent)
        return
      }
      if (decision.kind === 'retry') {
        terminalGateRetries.set(agent, decision.retries)
        agent.inject(makeTerminalGateMessage())
        return
      }
      throw new Error(decision.error)
    })

    // 3) Execution-time guard (v0.4.4/v0.5.1/v0.6.0): layer-based, not
    // event-based — applies to every agent under this preset regardless of
    // how it joined (created, recomposed, resumed). write/edit are always
    // denied; the doctor gate applies until research_doctor has run once; and
    // the environment is re-verified ON EVERY CALL — a mid-session permission
    // switch (/permission, setSandboxMode, setPolicy) flips the session back
    // to fail-closed instead of riding a stale "verified" cache.
    const guardStates = new WeakMap()
    ctx.tools.guard((exec) => {
      const name = exec && exec.name
      const agent = exec && exec.agent
      if (!agent) return name === 'write' || name === 'edit' ? readOnlyDenial(name) : undefined
      let st = guardStates.get(agent)
      if (st === undefined) {
        st = { doctorCalled: false, doctorSafe: false, envFailed: false }
        guardStates.set(agent, st)
      }
      let env
      try {
        const policy = ctx.sandboxPolicy.resolve({ session: agent.session })
        env = {
          mode: policy.mode,
          policy: ctx.approval.overrideOf(agent.session),
          workspaceRoot: policy.workspaceRoot,
        }
      } catch (error) {
        return '[dsh-researcher] environment preflight failed: ' + (error && error.message ? error.message : String(error))
      }
      const readDenial = readPathVerdict(name, exec && exec.arguments, env.workspaceRoot)
      if (readDenial !== undefined) return readDenial
      if (name === 'research_doctor') {
        // Re-running doctor revokes the old token until the new certificate
        // has been fully computed and explicitly recorded as SAFE.
        revokeDoctorCapability(agent)
      } else {
        const capability = doctorCapabilityOf(agent)
        if (capability && capability.overall === 'SAFE') {
          st = { ...st, doctorCalled: true, doctorSafe: true, envVerified: true, envFailed: false }
        }
      }
      const outcome = decideGuard(name, st, env)
      if (outcome.st && outcome.st.envFailed) revokeDoctorCapability(agent)
      guardStates.set(agent, outcome.st)
      return outcome.deny
    })
  },
  __capability: { recordDoctorVerdict, doctorCapabilityOf, doctorVerdictOf, revokeDoctorCapability },
  __test: { envVerdict, stubDefinition, readOnlyDenial, decideGuard, readPathVerdict, terminalGateDecision, makeTerminalGateMessage, isResearcherPreset, DOCTOR_GATE_DENIAL, READ_ROOT_DENIAL, TERMINAL_GATE_NOTICE, TERMINAL_GATE_FAILURE, recordDoctorVerdict, doctorCapabilityOf, doctorVerdictOf, revokeDoctorCapability },
}
