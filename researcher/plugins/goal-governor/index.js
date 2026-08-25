// DSH adapter for Project Cognition Goal Contracts.
//
// Authority split:
// - direct-human `/researcher` commands select contracts and approve gates;
// - model tools may report attempts and observations;
// - this host plugin alone folds the durable session log, validates frozen
//   verifier evidence, decides the terminal state, and mutates ctx.goals.
// Research Mode is also available as a one-shot `/researcher <question>` or a
// persistent `/researcher on`; while active, an allowlist guard makes the
// writable coding preset read-only for the model turn(s).

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const resolveCoreRoot = () => {
  const candidates = [
    path.resolve(__dirname, '../../../lib'),
    path.resolve(__dirname, '../../project-cognition/lib'),
  ]
  for (const candidate of candidates) if (fs.existsSync(path.join(candidate, 'goal-core', 'index.js'))) return candidate
  throw new Error('[project-cognition] portable core not found; reinstall the preset')
}

const coreRoot = resolveCoreRoot()
const { validateGoalContract, decideGoal } = require(path.join(coreRoot, 'goal-core', 'index.js'))
const { validateRegistry } = require(path.join(coreRoot, 'verifier-core', 'index.js'))
const { parseGoalPointer, makeGoalPointer, researchModeState, scopeGoalEvents, foldDshGoalEvents } = require(path.join(coreRoot, 'dsh-adapter', 'index.js'))
const { validateState } = require(path.join(coreRoot, 'cognition-core', 'index.js'))
const { readPathVerdict } = require('../tool-restrict/index.js').__test

const jsonOutput = {
  schema: { type: 'string' },
  render: (_args, value) => [{ type: 'text', text: value }],
}
const present = (title, kind, rawInput) => ({ card: 'generic', title, kind, ...(rawInput === undefined ? {} : { rawInput }) })
const result = (value) => JSON.stringify(value)
const replayStatus = (replay) => ({ decision: replay.decision, diagnostics: replay.diagnostics })

const isWithin = (root, target) => {
  const relative = path.relative(root, target)
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
}

const canonicalExisting = (value) => {
  try { return fs.realpathSync.native ? fs.realpathSync.native(value) : fs.realpathSync(value) } catch (error) { return path.resolve(value) }
}

const canonicalWithMissingTail = (value) => {
  let cursor = path.resolve(value)
  const missing = []
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor)
    if (parent === cursor) break
    missing.unshift(path.basename(cursor))
    cursor = parent
  }
  return path.resolve(canonicalExisting(cursor), ...missing)
}

const isPortableAbsolute = (value) => path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value)

const workspaceRoot = (agent) => {
  const cwd = agent && agent.session && agent.session.header && agent.session.header.cwd
  if (!cwd) throw new Error('session workspace root is unavailable')
  return path.resolve(cwd)
}

const confinedFile = (root, relativePath, requiredParent) => {
  if (typeof relativePath !== 'string' || /[\u0000-\u001f\u007f]/.test(relativePath) || isPortableAbsolute(relativePath)) throw new Error('path must be relative to the workspace')
  const lexical = path.resolve(root, relativePath)
  const parent = path.resolve(root, requiredParent)
  const canonicalRoot = canonicalExisting(path.resolve(root))
  const canonicalParent = canonicalWithMissingTail(parent)
  if (!isWithin(path.resolve(root), parent) || !isWithin(canonicalRoot, canonicalParent) || !isWithin(parent, lexical) || !isWithin(canonicalParent, canonicalWithMissingTail(lexical))) throw new Error('path escapes ' + requiredParent)
  return lexical
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

const assertLatestGoalRevision = (root, contractPath, contract) => {
  if (contract.status !== 'approved') throw new Error('only an approved Goal Contract can run')
  const goalsDir = confinedFile(root, '.project-cognition/goals', '.project-cognition')
  const expectedPath = path.join(goalsDir, encodeURIComponent(contract.goal_id) + '.r' + contract.revision + '.json')
  if (path.resolve(contractPath) !== path.resolve(expectedPath)) throw new Error('approved Goal Contract path does not match its goal id and revision')
  const escaped = encodeURIComponent(contract.goal_id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp('^' + escaped + '\\.r([1-9][0-9]*)\\.json$')
  const revisions = fs.readdirSync(goalsDir).map((file) => file.match(pattern)).filter(Boolean).map((match) => Number(match[1]))
  for (let revision = 1; revision <= contract.revision; revision += 1) {
    if (!revisions.includes(revision)) throw new Error('Goal Contract revision chain is incomplete at revision ' + revision)
  }
  const latest = Math.max(...revisions)
  if (latest !== contract.revision) throw new Error('selected Goal Contract revision ' + contract.revision + ' is stale; latest installed revision is ' + latest)
}

const loadSelected = (ctx, agent) => {
  const runtimeGoal = ctx.goals.get(agent)
  if (!runtimeGoal) throw new Error('no active DSH goal; run /researcher run <contract-path>')
  const pointer = parseGoalPointer(runtimeGoal.objective)
  const root = workspaceRoot(agent)
  const contractPath = confinedFile(root, pointer.relative_path, '.project-cognition/goals')
  const contract = readJson(contractPath)
  validateGoalContract(contract, { allowDraft: false })
  assertLatestGoalRevision(root, contractPath, contract)
  if (contract.contract_hash !== pointer.contract_hash) throw new Error('contract file no longer matches the DSH goal pointer')
  const registryPath = confinedFile(root, '.project-cognition/verifiers.json', '.project-cognition')
  const registry = readJson(registryPath)
  validateRegistry(registry)
  if (registry.registry_hash !== contract.verifier_registry_hash) throw new Error('verifier registry drifted from the frozen contract')
  const cognitionPath = confinedFile(root, '.project-cognition/state.json', '.project-cognition')
  const cognition = readJson(cognitionPath)
  validateState(cognition)
  if (cognition.state_hash !== contract.baseline.cognition_hash) throw new Error('Project Cognition state does not match the contract baseline; revise and re-approve the contract')
  const replay = foldDshGoalEvents(contract, registry, scopeGoalEvents(agent.session.events, runtimeGoal))
  return { root, runtimeGoal, contractPath, contract, registryPath, registry, cognition, replay }
}

const gateResumeVerdict = (contract, replay) => {
  // The last request_goal_decision can legitimately predate the direct gate
  // command. Recompute from the complete trusted replay prefix so the command
  // cannot blindly resume a goal that still needs another human decision.
  const decision = decideGoal(contract, replay.events)
  const pendingGates = decision.progress.human_gates.filter((gate) => gate.result !== 'approved').map((gate) => gate.id)
  const guardViolation = replay.events.some((event) => event.type === 'guard_violation')
  const diagnostics = Array.isArray(replay.diagnostics) ? replay.diagnostics : []
  const resumableDecision = ['CONTINUE', 'DONE', 'ALREADY_SATISFIED'].includes(decision.decision)
  return {
    decision,
    pending_gates: pendingGates,
    guard_violation: guardViolation,
    diagnostics,
    resumable: resumableDecision && pendingGates.length === 0 && !guardViolation && diagnostics.length === 0,
  }
}

const userMessage = (text) => Object.freeze({
  id: crypto.randomUUID(), role: 'user',
  content: Object.freeze([{ type: 'text', text }]),
  source: Object.freeze({ kind: 'user' }),
})

const researchPrompt = (task, contractDraft) => [
  contractDraft ? 'RESEARCHER GOAL-CONTRACT REQUEST' : 'ONE-SHOT RESEARCHER REQUEST',
  'Operate read-only. Reconstruct purpose, architecture, evidence, invariants, value, unknowns, and disconfirming evidence before recommending change.',
  contractDraft
    ? 'End with a project-cognition/goal/v1 DRAFT JSON contract. Do not approve it and do not implement. Criteria must bind registry IDs from .project-cognition/verifiers.json; distinguish must from should and add human gates for subjective or architectural acceptance.'
    : 'Classify material recommendations as BUILD / DON\'T BUILD / INVESTIGATE. Do not implement or create files.',
  'Task: ' + task,
].join('\n\n')

const commandHelp = (role) => role === 'researcher'
  ? '/researcher <question> — one-shot research\n/researcher goal <task> — propose a frozen Goal Contract draft\nThe Project Research preset itself is the certified persistent Researcher Mode.'
  : '/researcher <question> — one read-only research turn\n/researcher on [question] — persistent guarded Researcher Mode\n/researcher off — leave guarded mode\n/researcher goal <task> — research and propose a Goal Contract\n/researcher run <.project-cognition/goals/...json> — bind an approved contract\n/researcher status\n/researcher approve-gate|reject-gate <gate-id> [evidence-ref...]\n/researcher confirm-blocker <code> <detail>\n/researcher cancel'

const registerCommand = (ctx, role) => {
  ctx.inject(['commands'], (commandCtx) => {
    commandCtx.commands.register({
      name: 'researcher',
      description: 'Research a project read-only or operate an evidence-bound Goal Contract',
      input: { hint: '[on|off|goal|run|status|approve-gate|reject-gate|confirm-blocker|cancel|<question>]' },
      handler: ({ agent, rawInput }) => {
        const raw = String(rawInput || '').trim()
        const parts = raw.split(/\s+/).filter(Boolean)
        const action = (parts[0] || '').toLowerCase()
        try {
          if (raw === '' || action === 'mode') return { kind: 'success', text: commandHelp(role) + '\n\nCurrent guarded mode: ' + JSON.stringify(researchModeState(agent.session.events)) }
          if (action === 'off') return { kind: 'success', text: 'Guarded Researcher Mode off.' }
          if (action === 'on') {
            const task = parts.slice(1).join(' ')
            if (task) agent.steer(userMessage(researchPrompt(task, false)))
            return { kind: 'success', text: 'Guarded Researcher Mode on. Only the read-only allowlist is available until /researcher off.' }
          }
          if (action === 'goal') {
            const task = parts.slice(1).join(' ')
            if (!task) return { kind: 'error', text: 'Usage: /researcher goal <task>' }
            agent.steer(userMessage(researchPrompt(task, true)))
            return { kind: 'success', text: 'Started a read-only Goal Contract research turn. The model may propose a draft; only a human/CLI approval freezes it.' }
          }
          if (action === 'run') {
            if (role === 'researcher') return { kind: 'error', text: 'The certified Researcher preset cannot execute. Select the Governed Coding preset to run a contract.' }
            if (!parts[1]) return { kind: 'error', text: 'Usage: /researcher run <.project-cognition/goals/approved.json>' }
            const current = ctx.goals.get(agent)
            if (current && current.phase !== 'complete') return { kind: 'error', text: 'A non-complete DSH goal already exists. Finish, cancel, or clear it before binding another contract.' }
            const root = workspaceRoot(agent)
            const contractPath = confinedFile(root, parts[1], '.project-cognition/goals')
            const contract = readJson(contractPath)
            validateGoalContract(contract, { allowDraft: false })
            assertLatestGoalRevision(root, contractPath, contract)
            const registry = readJson(confinedFile(root, '.project-cognition/verifiers.json', '.project-cognition'))
            validateRegistry(registry)
            if (registry.registry_hash !== contract.verifier_registry_hash) throw new Error('verifier registry hash does not match the approved contract')
            const cognition = readJson(confinedFile(root, '.project-cognition/state.json', '.project-cognition'))
            validateState(cognition)
            if (cognition.state_hash !== contract.baseline.cognition_hash) throw new Error('cognition state hash does not match the approved contract baseline')
            const relative = path.relative(root, contractPath).replace(/\\/g, '/')
            const created = ctx.goals.create(agent, { objective: makeGoalPointer(relative, contract.contract_hash) })
            return { kind: 'success', text: 'Approved contract bound to DSH goal ' + created.id + '. Mode: ' + contract.mode + '. The governor—not the model—owns completion.' }
          }
          if (action === 'status') {
            const selected = loadSelected(ctx, agent)
            return { kind: 'success', text: JSON.stringify({ goal_id: selected.contract.goal_id, revision: selected.contract.revision, mode: selected.contract.mode, decision: selected.replay.decision, diagnostics: selected.replay.diagnostics }, null, 2) }
          }
          if (action === 'approve-gate' || action === 'reject-gate') {
            const selected = loadSelected(ctx, agent)
            const gateId = parts[1]
            if (!gateId || !selected.contract.human_gates.some((gate) => gate.id === gateId)) return { kind: 'error', text: 'Unknown or missing gate id.' }
            if (action === 'approve-gate' && selected.runtimeGoal.phase === 'paused') {
              const resume = gateResumeVerdict(selected.contract, selected.replay)
              if (resume.resumable) {
                ctx.goals.resume(agent, { id: selected.runtimeGoal.id, revision: selected.runtimeGoal.revision })
              } else {
                const pending = resume.pending_gates.length > 0 ? '; pending gates: ' + resume.pending_gates.join(', ') : ''
                return { kind: 'success', text: 'Human gate ' + gateId + ' recorded as approved in the durable command log. Goal remains paused: ' + resume.decision.decision + ' — ' + resume.decision.reason + pending + '. Resolve the remaining governor condition with a direct /researcher command.' }
              }
            }
            if (action === 'reject-gate' && selected.runtimeGoal.phase === 'active') {
              ctx.goals.pause(agent, { id: selected.runtimeGoal.id, revision: selected.runtimeGoal.revision })
            }
            return { kind: 'success', text: 'Human gate ' + gateId + ' recorded as ' + (action === 'approve-gate' ? 'approved' : 'rejected') + ' in the durable command log. Call request_goal_decision again.' }
          }
          if (action === 'confirm-blocker') {
            const selected = loadSelected(ctx, agent)
            const code = parts[1]
            const detail = parts.slice(2).join(' ')
            if (!code || !detail) return { kind: 'error', text: 'Usage: /researcher confirm-blocker <code> <detail>' }
            if (selected.runtimeGoal.phase === 'active' || selected.runtimeGoal.phase === 'paused') {
              ctx.goals.block(agent, { id: selected.runtimeGoal.id, revision: selected.runtimeGoal.revision }, { code, message: detail })
            }
            return { kind: 'success', text: 'External blocker confirmed by direct user authority and recorded in the durable command log.' }
          }
          if (action === 'cancel') {
            const selected = loadSelected(ctx, agent)
            if (selected.runtimeGoal.phase === 'active' || selected.runtimeGoal.phase === 'paused') {
              ctx.goals.block(agent, { id: selected.runtimeGoal.id, revision: selected.runtimeGoal.revision }, { code: 'human-cancelled', message: 'Cancelled by direct user command.' })
            }
            return { kind: 'success', text: 'Goal cancelled by direct user authority.' }
          }
          agent.steer(userMessage(researchPrompt(raw, false)))
          return { kind: 'success', text: 'Started one read-only research turn. Coding tools are host-blocked for this turn.' }
        } catch (error) {
          return { kind: 'error', text: '[project-cognition] ' + (error && error.message ? error.message : String(error)) }
        }
      },
    })
  })
}

const tool = (name, description, parameters, execute) => ({
  name, description, parameters, output: jsonOutput, execute,
  presentCall: (args) => present(name.replace(/_/g, ' '), name === 'get_goal_contract' || name === 'researcher_mode_status' ? 'read' : 'other', args && (args.attempt_id || args.criterion_id || args.code)),
})

const objectParameters = (properties = {}, required = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
})

const registerTools = (ctx) => {
  ctx.tools.register(tool('researcher_mode_status', 'Read the host-enforced one-shot/persistent Researcher Mode state.', objectParameters(), (_args, exec) => Promise.resolve(result(researchModeState(exec.agent.session.events)))))
  ctx.tools.register(tool('get_goal_contract', 'Read the approved frozen Goal Contract, trusted current replay state, and next decision. This tool cannot complete the goal.', objectParameters(), (_args, exec) => {
    try {
      const selected = loadSelected(ctx, exec.agent)
      const needed = new Set(selected.contract.criteria.filter((criterion) => criterion.authority === 'tool').map((criterion) => criterion.verifier_id))
      return Promise.resolve(result({ contract: selected.contract, verifiers: selected.registry.entries.filter((entry) => needed.has(entry.id)), decision: selected.replay.decision, diagnostics: selected.replay.diagnostics }))
    } catch (error) { return Promise.resolve(result({ error: error.message })) }
  }))
  ctx.tools.register(tool('begin_goal_attempt', 'Begin exactly one baseline or change attempt under the frozen contract.', objectParameters({
    attempt_id: { type: 'string', description: 'Unique attempt identity chosen for this baseline or change attempt.' },
    baseline: { type: 'boolean', description: 'True only for the single leading baseline attempt.' },
    target_criteria: { type: 'array', items: { type: 'string' }, description: 'Frozen criterion IDs targeted by this attempt.' },
    repo_revision: { type: 'string', description: 'Exact repository revision from the active Goal Contract.' },
  }, ['attempt_id', 'baseline', 'target_criteria', 'repo_revision']), (args, exec) => Promise.resolve(result(replayStatus(loadSelected(ctx, exec.agent).replay)))))
  ctx.tools.register(tool('submit_goal_observation', 'Submit an observation. A claimed pass/fail is accepted only when evidence_refs point to earlier DSH tool calls matching the frozen verifier invocation and result policy.', objectParameters({
    attempt_id: { type: 'string', description: 'The currently active attempt identity.' },
    criterion_id: { type: 'string', description: 'One frozen criterion ID from the Goal Contract.' },
    verifier_id: { type: 'string', description: 'The criterion\'s frozen verifier ID.' },
    result: { type: 'string', enum: ['pass', 'fail', 'unknown'], description: 'Result claimed from the referenced real verifier evidence.' },
    evidence_refs: { type: 'array', items: { type: 'string' }, description: 'Earlier real DSH verifier call IDs from this session.' },
    repo_revision: { type: 'string', description: 'Exact repository revision evaluated by this observation.' },
  }, ['attempt_id', 'criterion_id', 'verifier_id', 'result', 'evidence_refs', 'repo_revision']), (args, exec) => Promise.resolve(result(replayStatus(loadSelected(ctx, exec.agent).replay)))))
  ctx.tools.register(tool('complete_goal_attempt', 'Close the active attempt. This records evidence state but does not let the model declare success.', objectParameters({
    attempt_id: { type: 'string', description: 'The currently active attempt identity.' },
  }, ['attempt_id']), (args, exec) => Promise.resolve(result(replayStatus(loadSelected(ctx, exec.agent).replay)))))
  ctx.tools.register(tool('report_goal_blocker', 'Report a suspected blocker. Model reports require direct /researcher confirm-blocker user authority before BLOCKED.', objectParameters({
    code: { type: 'string', description: 'Stable suspected-blocker code.' },
    detail: { type: 'string', description: 'Evidence-bounded blocker detail for direct user review.' },
  }, ['code', 'detail']), (args, exec) => Promise.resolve(result(replayStatus(loadSelected(ctx, exec.agent).replay)))))
  ctx.tools.register(tool('request_goal_decision', 'Ask the host governor to compare trusted observations with the frozen contract. The host alone may continue, pause, stop, block, or complete the DSH goal.', objectParameters(), (_args, exec) => {
    try {
      const selected = loadSelected(ctx, exec.agent)
      const decision = selected.replay.decision
      const goal = selected.runtimeGoal
      const ref = { id: goal.id, revision: goal.revision }
      if (decision.decision === 'DONE' || decision.decision === 'ALREADY_SATISFIED') {
        ctx.goals.complete(exec.agent, ref)
        exec.concludeTurn()
      } else if (decision.decision === 'BLOCKED' || decision.decision === 'STOPPED' || decision.decision === 'CANCELLED') {
        ctx.goals.block(exec.agent, ref, { code: decision.decision.toLowerCase(), message: decision.reason })
        exec.concludeTurn()
      } else if (decision.decision === 'NEEDS_HUMAN') {
        ctx.goals.pause(exec.agent, ref)
        exec.concludeTurn()
      }
      return Promise.resolve(result(decision))
    } catch (error) {
      try {
        const current = ctx.goals.get(exec.agent)
        if (current && current.phase === 'active') ctx.goals.pause(exec.agent, { id: current.id, revision: current.revision })
      } catch (pauseError) { /* original integrity failure remains authoritative */ }
      exec.concludeTurn()
      return Promise.resolve(result({ decision: 'NEEDS_HUMAN', reason: error.message }))
    }
  }))
}

const RESEARCH_ALLOWLIST = new Set([
  'researcher_mode_status', 'get_goal_contract', 'read', 'read_image', 'glob', 'grep', 'git_read',
  'web_search', 'web_fetch', 'ask_user_question', 'todo_write', 'skill', 'research_checkpoint', 'research_doctor',
])
const PAUSED_GOAL_ALLOWLIST = new Set([
  'researcher_mode_status', 'get_goal_contract', 'read', 'read_image', 'glob', 'grep', 'git_read',
  'web_search', 'web_fetch', 'ask_user_question',
])

module.exports = {
  name: 'project-cognition-goal-governor',
  inject: ['tools', 'goals', 'systemPrompt'],
  apply(ctx, config) {
    const role = config && config.role === 'executor' ? 'executor' : 'researcher'
    ctx.systemPrompt.section({
      name: 'project-cognition:goal-governor', order: 113,
      text: role === 'executor'
        ? 'GOAL GOVERNOR: When a Project Cognition contract is active, call get_goal_contract first. Establish one baseline attempt before any change attempt. Use only the frozen verifier invocations, cite their real DSH call IDs, and request_goal_decision after closing each attempt. You cannot declare completion: the host governor compares evidence with the approved contract. SHOULD criteria never justify extra attempts after every MUST and human gate passes. If guarded Researcher Mode is active, do not implement.'
        : 'RESEARCHER ENTRY: /researcher <question> starts one research request and /researcher goal <task> proposes a Goal Contract draft. This certified preset stays read-only and never executes the contract.',
    })
    registerCommand(ctx, role)
    if (role === 'executor') registerTools(ctx)
    ctx.tools.guard((execution) => {
      const agent = execution && execution.agent
      if (!agent) return undefined
      if (researchModeState(agent.session && agent.session.events).active) {
        if (!RESEARCH_ALLOWLIST.has(execution.name)) return '[project-cognition] guarded Researcher Mode is read-only; tool "' + execution.name + '" is outside the explicit research allowlist.'
        return readPathVerdict(execution.name, execution.arguments, workspaceRoot(agent))
      }
      if (role === 'executor' && typeof ctx.goals.get === 'function') {
        const runtimeGoal = ctx.goals.get(agent)
        if (runtimeGoal && runtimeGoal.phase === 'paused') {
          if (!PAUSED_GOAL_ALLOWLIST.has(execution.name)) return '[project-cognition] paused Goal Contract is read-only until a direct /researcher command resumes or terminates it; tool "' + execution.name + '" is blocked.'
          return readPathVerdict(execution.name, execution.arguments, workspaceRoot(agent))
        }
      }
      return undefined
    })
  },
  __test: { isWithin, confinedFile, assertLatestGoalRevision, gateResumeVerdict, researchPrompt, objectParameters, replayStatus, RESEARCH_ALLOWLIST, PAUSED_GOAL_ALLOWLIST },
}
