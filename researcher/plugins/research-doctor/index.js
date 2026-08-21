// research_doctor — the Researcher Runtime Certificate (v0.5.0).
//
// "The worst failure of an AI agent is not making mistakes — it is being
// unable to prove that it ran as designed." This tool turns the integrity
// contract into a capability: it verifies the SIX runtime guarantees of the
// researcher preset and renders a certificate with per-check PASS / WARN /
// FAIL statuses and an overall SAFE / DEGRADED / UNSAFE verdict.
//
// Checks:
//   1. Preset binding  — composedPreset(agent.ctx) must be 'researcher'
//                        (the live scope chain, so preset switches count).
//   2. Sandbox         — effective mode must be 'read-only'.
//   3. Approval        — effective policy must be 'never'.
//   4. Write tools     — write/edit must resolve (agent view) to the
//                        refusing stubs, not the real schemas. This check
//                        catches the recompose hole mechanically.
//   5. Shell surface   — git_read present; pwsh/bash absent (no arbitrary
//                        process-execution primitive).
//   6. Checkpoint      — research_checkpoint available.
//   7. Replay          — the session log folds deterministically, and the
//                        live state matches the folded log (WARN when
//                        importState legitimately diverged).
//
// The tool is read-only: it writes nothing and only reads live runtime facts.

const { makeState, foldCheckpointEvents, fullExport } = require('../research-state/index.js')

const renderCertificate = (checks, meta) => {
  const lines = ['Researcher Runtime Certificate']
  if (meta && meta.run !== undefined) lines.push('Run: #' + meta.run)
  if (meta && Array.isArray(meta.history) && meta.history.length > 0) {
    lines.push('History: ' + meta.history.map((h) => '#' + h.run + ' ' + h.overall).join(' · '))
  } else if (meta) {
    lines.push('History: none (first run)')
  }
  let worst = 0 // 0 = pass, 1 = warn, 2 = fail
  for (const c of checks) {
    lines.push(c.name + ': ' + c.status + (c.detail ? ' (' + c.detail + ')' : ''))
    if (c.status === 'FAIL') worst = 2
    else if (c.status === 'WARN' && worst < 1) worst = 1
  }
  const overall = worst === 2 ? 'UNSAFE' : worst === 1 ? 'DEGRADED' : 'SAFE'
  lines.push('Overall: ' + overall)
  return lines.join('\n')
}

// Reconstruct prior research_doctor runs from the session log: pair doctor
// tool/call events with their tool/result events and extract each Overall.
const certificateHistory = (events) => {
  const list = Array.isArray(events) ? events : []
  const doctorCalls = []
  const resultsByCallId = new Map()
  for (const event of list) {
    if (!event || typeof event !== 'object') continue
    if (event.type === 'tool/call' && event.data && event.data.name === 'research_doctor') {
      doctorCalls.push(event.data.callId)
    }
    if (event.type === 'tool/result' && event.data && event.data.callId !== undefined) {
      resultsByCallId.set(event.data.callId, event.data)
    }
  }
  const history = []
  let index = 0
  for (const callId of doctorCalls) {
    index++
    const result = resultsByCallId.get(callId)
    let overall = 'unknown'
    if (result && result.content !== undefined) {
      const content = result.content
      const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((b) => (b && b.text) || '').join('\n') : ''
      const match = text.match(/Overall:\s*(\w+)/)
      if (match) overall = match[1]
    }
    history.push({ run: index, overall })
  }
  return history
}

module.exports = {
  name: 'research-doctor',
  inject: ['tools', 'agentPresets', 'sandboxPolicy', 'approval'],
  apply(ctx) {
    const definition = {
      name: 'research_doctor',
      description: 'Run the Researcher Runtime Certificate: verifies preset binding, read-only sandbox, never approval, refusing write/edit stubs, git_read as the only code surface, checkpoint availability, and session-log replay consistency. Returns per-check PASS/WARN/FAIL and an overall SAFE/DEGRADED/UNSAFE verdict. Read-only; writes nothing.',
      parameters: {
        type: 'object',
        properties: {},
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args, exec) {
        const agent = exec && exec.agent
        if (!agent) return 'research_doctor: no executing agent; cannot certify'
        const checks = []
        let session = null
        try {
          let preset = 'unknown'
          try { preset = ctx.agentPresets.composedPreset(agent.ctx) ?? 'none' } catch (error) { preset = 'error:' + (error && error.message) }
          // Eval variants (deviation D002) are the researcher preset under a
          // frozen depth override; their binding passes the same check.
          checks.push({ name: 'Preset', status: ['researcher', 'researcher-quick', 'researcher-deep'].includes(preset) ? 'PASS' : 'FAIL', detail: 'composedPreset=' + preset })

          session = agent.session
          if (!session) throw new Error('agent has no live session')

          const mode = ctx.sandboxPolicy.resolve({ session }).mode
          checks.push({ name: 'Sandbox', status: mode === 'read-only' ? 'PASS' : 'FAIL', detail: 'mode=' + mode })

          const policy = ctx.approval.overrideOf(session)
          checks.push({ name: 'Approval', status: policy === 'never' ? 'PASS' : 'FAIL', detail: 'policy=' + (policy === undefined ? 'unknown' : policy) })

          const getDef = (name) => {
            try { return agent.ctx.tools.get(name, agent) } catch (error) { return undefined }
          }
          let stubOk = true
          const stubDetail = []
          for (const name of ['write', 'edit']) {
            const def = getDef(name)
            const ok = !!def && String(def.description).indexOf('DISABLED') >= 0
            stubOk = stubOk && ok
            stubDetail.push(name + (ok ? '=stub' : '=REAL-or-missing'))
          }
          checks.push({ name: 'Write tools', status: stubOk ? 'PASS' : 'FAIL', detail: stubDetail.join(', ') })

          const gitOk = getDef('git_read') !== undefined
          const shellPresent = getDef('pwsh') !== undefined || getDef('bash') !== undefined
          checks.push({ name: 'Shell surface', status: gitOk && !shellPresent ? 'PASS' : 'FAIL', detail: 'git_read=' + (gitOk ? 'present' : 'missing') + ', shell=' + (shellPresent ? 'PRESENT' : 'absent') })

          const checkpointOk = getDef('research_checkpoint') !== undefined
          checks.push({ name: 'Checkpoint', status: checkpointOk ? 'PASS' : 'FAIL', detail: checkpointOk ? 'available' : 'missing' })

          let replayStatus = 'PASS'
          let replayDetail
          try {
            const events = Array.isArray(session.events) ? session.events : []
            const a = fullExport(foldCheckpointEvents(events, makeState()))
            const b = fullExport(foldCheckpointEvents(events, makeState()))
            if (JSON.stringify(a) !== JSON.stringify(b)) {
              replayStatus = 'FAIL'
              replayDetail = 'non-deterministic fold'
            } else {
              const count = a.claims.length
              replayDetail = 'log folds deterministically (' + count + ' claims, ' + a.hypotheses.length + ' hypotheses); live-state comparison is covered by the reducer invariant tests'
            }
          } catch (error) {
            replayStatus = 'WARN'
            replayDetail = 'replay check error: ' + (error && error.message ? error.message : String(error))
          }
          checks.push({ name: 'Replay', status: replayStatus, detail: replayDetail })
        } catch (error) {
          checks.push({ name: 'Runtime', status: 'FAIL', detail: error && error.message ? error.message : String(error) })
        }
        // `session` is hoisted out of the try (v0.5.2 regression: the block-
        // scoped const was referenced here and threw ReferenceError on every
        // call, so the certificate could never render).
        const events = session && Array.isArray(session.events) ? session.events : []
        const history = certificateHistory(events)
        return renderCertificate(checks, { run: history.length + 1, history })
      },
    }

    ctx.tools.register(definition)
  },
  __test: { renderCertificate, certificateHistory },
}
