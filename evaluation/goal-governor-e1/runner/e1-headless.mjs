// Live DSH driver for Goal Governor E1. This module is loaded only after the
// outer runner validates the explicit live acknowledgement, run lock, exact
// DSH version, candidate installation, workspace baseline, and output root.
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const dshImports = JSON.parse(process.env.DSH_E1_PACKAGE_IMPORTS || '{}')
const importDsh = (specifier) => {
  const target = dshImports[specifier]
  if (typeof target !== 'string' || !target.startsWith('file:')) throw new Error('pinned DSH import is unavailable: ' + specifier)
  return import(target)
}
const [agentModule, llmModule, sessionModule, deepseekModule, settingsModule, launchEnvironmentModule] = await Promise.all([
  importDsh('@deepseek-ai/dsh-agent'),
  importDsh('@deepseek-ai/dsh-llm'),
  importDsh('@deepseek-ai/dsh-session'),
  importDsh('@deepseek-ai/dsh-llm-deepseek'),
  importDsh('@deepseek-ai/dsh-settings'),
  importDsh('@deepseek-ai/dsh-launch-environment'),
])
const { installModelSelection } = agentModule
const { createUserMessage } = llmModule
const { SessionId } = sessionModule
const { resolveAdapterOptions } = deepseekModule
const { settingsNamespace } = settingsModule
const { launchEnvironmentOf } = launchEnvironmentModule
const { validateCostPolicy, validateModelRoute } = require('../cost-policy.js')
const name = 'goal-governor-e1-live-runner'
const inject = ['agentDefaultModel', 'agents', 'sessions', 'commands', 'tools', 'goals', 'agentPresets', 'sessionPersistence', 'settings']

const requiredEnv = (key) => {
  const value = process.env[key]
  if (value === undefined || value === '') throw new Error(key + ' is required')
  return value
}

const parseCostDeadline = (value) => {
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new Error('DSH_E1_COST_ADMISSION_DEADLINE_UTC must be a canonical UTC instant')
  return parsed.getTime()
}

const assertBeforeCostDeadline = (deadlineMs, phase) => {
  if (!Number.isFinite(deadlineMs) || Date.now() >= deadlineMs) throw new Error('COST_ADMISSION_EXPIRED: ' + phase + ' reached the absolute pre-spawn deadline')
}

const assertResolvedModelRoute = ({ ctx, runLock, selection, phase }) => {
  const settings = ctx.settings ?? ctx.get('settings')
  if (!settings || typeof settings.get !== 'function') throw new Error('DSH settings service is unavailable for model-route verification')
  if (typeof settingsNamespace !== 'function' || typeof launchEnvironmentOf !== 'function' || typeof resolveAdapterOptions !== 'function') {
    throw new Error('pinned DSH does not expose the required public DeepSeek route-resolution APIs')
  }
  const actualEffort = selection.reasoningEffort ?? selection.reasoning_effort ?? selection.reasoning?.effort ?? 'none'
  if (selection.provider !== runLock.model.provider || selection.model !== runLock.model.model || actualEffort !== runLock.model.reasoning_effort) {
    throw new Error('active DSH model selection differs from the frozen run-lock')
  }
  const namespace = settingsNamespace('llm-deepseek')
  const launchEnvironment = launchEnvironmentOf(ctx)
  const launchBaseUrl = launchEnvironment?.get?.('DEEPSEEK_BASE_URL')
  const resolved = resolveAdapterOptions(settings.get(namespace), launchEnvironment)
  if (!resolved || resolved.baseURL !== runLock.model.base_url) {
    throw new Error('resolved DSH DeepSeek baseURL differs from the frozen run-lock')
  }
  if (!launchBaseUrl || launchBaseUrl.value !== runLock.model.base_url) {
    throw new Error('trusted DSH launch environment does not carry the frozen DeepSeek baseURL')
  }
  return {
    phase,
    settings_namespace: 'llm-deepseek',
    resolved_base_url: resolved.baseURL,
    launch_base_url: launchBaseUrl.value,
    launch_source: typeof launchBaseUrl.source === 'string' ? launchBaseUrl.source : null,
  }
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const writeJson = async (file, value) => fsp.writeFile(file, JSON.stringify(value, null, 2) + '\n')
const eventSeq = (event, fallback = 0) => Number.isFinite(event?.seq) ? event.seq : Number.isFinite(event?.sequence) ? event.sequence : fallback
const commandArgs = (event) => String(event?.data?.args ?? event?.data?.rawInput ?? '').trim()
const validateNativeEvents = (events, label = 'native session') => {
  if (!Array.isArray(events)) throw new Error(label + ' events are unavailable')
  for (let index = 0; index < events.length; index++) {
    if (!events[index] || events[index].seq !== index) throw new Error(label + ' must preserve mandatory zero-based contiguous DSH seq; drift at index ' + index)
  }
  return events
}

const teeStream = (stream, file) => {
  if (!file) return
  const original = stream.write.bind(stream)
  stream.write = (chunk, encoding, callback) => {
    try { fs.appendFileSync(file, Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), typeof encoding === 'string' ? encoding : 'utf8')) } catch (_) { /* evidence finalization reports file failures */ }
    return original(chunk, encoding, callback)
  }
}

const checkpoint = (hashCanonical, replay, contract, runtimeGoal, sessionId) => ({
  session_id: String(sessionId),
  goal_id: contract.goal_id,
  runtime_goal_id: String(runtimeGoal.id),
  contract_hash: contract.contract_hash,
  state_hash: hashCanonical(replay.events),
  diagnostics_hash: hashCanonical(replay.diagnostics),
  decision: replay.decision.decision,
})

const foldedUsage = (replay) => {
  let cumulativeTokens = 0
  let elapsedSec = 0
  for (const event of replay.events || []) if (event.type === 'usage_recorded') {
    cumulativeTokens = Math.max(cumulativeTokens, Number(event.data?.tokens) || 0)
    elapsedSec = Math.max(elapsedSec, Number(event.data?.elapsed_sec) || 0)
  }
  return {
    source: 'host-folded-goal-events/usage_recorded',
    cumulative_tokens: cumulativeTokens,
    elapsed_sec: elapsedSec,
  }
}

const cloneEvent = (event) => JSON.parse(JSON.stringify(event))

const augmentEvents = (nativeEvents, markers) => {
  validateNativeEvents(nativeEvents)
  const before = new Map()
  const after = new Map()
  const nativeTimes = new Map(nativeEvents.map((event) => [event.seq, event.time ?? 0]))
  for (const marker of markers) {
    const target = marker.where === 'before' ? before : after
    const bucket = target.get(marker.anchor) || []
    bucket.push(marker.event)
    target.set(marker.anchor, bucket)
  }
  const output = []
  for (let index = 0; index < nativeEvents.length; index++) {
    const native = nativeEvents[index]
    const sequence = native.seq
    for (const marker of before.get(sequence) || []) output.push({ ...cloneEvent(marker), time: marker.time ?? nativeTimes.get(sequence) ?? 0, _runner_anchor_native_seq: sequence })
    output.push({ ...cloneEvent(native), _native_seq: sequence })
    for (const marker of after.get(sequence) || []) output.push({ ...cloneEvent(marker), time: marker.time ?? nativeTimes.get(sequence) ?? 0, _runner_anchor_native_seq: sequence })
  }
  return output.map((event, index) => ({ ...event, seq: index + 1, time: event.time ?? 0 }))
}

const findCommandRun = (events, startSeq, rawInput) => [...events].reverse().find((event) =>
  eventSeq(event) > startSeq && event.type === 'command/run' && event.data?.name === 'researcher' && commandArgs(event) === rawInput)

const findCommandDone = (events, startSeq, commandId) => [...events].reverse().find((event) =>
  eventSeq(event) > startSeq && event.type === 'command/done' && String(event.data?.commandId ?? event.data?.command_id ?? '') === String(commandId))

const followup = async (agent, text) => {
  agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
  await agent.whenIdle()
}

const executeCommand = async (commands, agent, line) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('E1 command timed out')), 30000)
  try { return await commands.execute(agent, line, [], controller.signal) }
  finally { clearTimeout(timeout) }
}

const disarmTrajectoryGoal = (goals, agent, label) => {
  let goal = goals.get(agent)
  if (!goal || goal.phase !== 'active') throw new Error(label + ' requires one active DSH goal')
  if (goal.activation === 'armed') goals.disarm(agent)
  goal = goals.get(agent)
  if (!goal || goal.phase !== 'active' || goal.activation !== 'disarmed') throw new Error(label + ' could not freeze the DSH goal as disarmed')
  return goal
}

const readInteractiveGateInput = async () => {
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) throw new Error('governed-gate requires an interactive stdin/stdout TTY; automation approval is forbidden')
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    const line = (await terminal.question('E1 external interactive TTY input: type `approve-gate H1 <evidence-ref>` to continue: ')).trim()
    if (!/^approve-gate\s+H1\s+\S+(?:\s+\S+)*$/.test(line)) throw new Error('interactive TTY gate rejected: exact direct input with an evidence reference is required')
    return line
  } finally { terminal.close() }
}

async function captureDurableSession({ agent, sessions, persistence, sessionId }) {
  await sessions.flush(agent.session)
  const loaded = await persistence.load(sessionId)
  if (!loaded || !Array.isArray(loaded.events)) throw new Error('durable logical session replay is unavailable after flush')
  validateNativeEvents(loaded.events, 'durable logical session')
  if (persistence.supportsRawArtifacts !== true) throw new Error('E1 requires a persistence backend with raw artifact support')
  const raw = await persistence.readRaw(sessionId)
  if (!raw || typeof raw.content !== 'string' || raw.content.length === 0) throw new Error('raw durable session artifact is missing after flush')
  return { loaded, raw }
}

async function archiveSession({ raw, outDir, visibleTools, visibleToolSchemas, augmented, replayCheckpoints, runtimeArtifact, stageOne }) {
  await fsp.mkdir(outDir, { recursive: true })
  await fsp.writeFile(path.join(outDir, 'session.jsonl'), raw.content)
  await writeJson(path.join(outDir, 'session.events.json'), augmented)
  await writeJson(path.join(outDir, 'visible-tools.json'), visibleTools)
  await writeJson(path.join(outDir, 'visible-tool-schemas.json'), visibleToolSchemas)
  await writeJson(path.join(outDir, 'replay-checkpoints.json'), replayCheckpoints)
  await writeJson(path.join(outDir, stageOne ? 'resume-stage1.json' : 'runtime-artifact.json'), runtimeArtifact)
}

async function run(ctx, io) {
  await ctx.get('loader')?.await()
  const agents = ctx.get('agents')
  const defaultModel = ctx.get('agentDefaultModel')
  const sessions = ctx.get('sessions')
  const commands = ctx.get('commands')
  const tools = ctx.get('tools')
  const goals = ctx.get('goals')
  const presets = ctx.get('agentPresets')
  const persistence = ctx.get('sessionPersistence')
  if (!agents || !defaultModel || !sessions || !commands || !tools || !goals || !presets || !persistence) throw new Error('required DSH E1 services are unavailable')

  const caseId = requiredEnv('DSH_E1_CASE')
  const stage = requiredEnv('DSH_E1_STAGE')
  const outDir = path.resolve(requiredEnv('DSH_E1_CASE_OUT'))
  const presetRoot = path.resolve(requiredEnv('DSH_E1_PRESET_ROOT'))
  const promptFile = path.resolve(requiredEnv('DSH_E1_PROMPT_FILE'))
  const contractFile = path.resolve(requiredEnv('DSH_E1_CONTRACT_FILE'))
  const contractRelative = requiredEnv('DSH_E1_CONTRACT_RELATIVE')
  const runLock = readJson(path.resolve(requiredEnv('DSH_E1_RUN_LOCK')))
  const costAdmissionDeadlineMs = parseCostDeadline(requiredEnv('DSH_E1_COST_ADMISSION_DEADLINE_UTC'))
  const visibleContractModule = require(path.resolve(requiredEnv('DSH_E1_VISIBLE_TOOL_CONTRACT_MODULE')))
  const { createVisibleToolContract, schemaName, EXACT_VISIBLE_TOOL_NAMES } = visibleContractModule
  const contract = readJson(contractFile)
  const registry = readJson(path.join(process.cwd(), '.project-cognition', 'verifiers.json'))
  const { foldDshGoalEvents, scopeGoalEvents } = require(path.join(presetRoot, 'lib', 'dsh-adapter', 'index.js'))
  const { hashCanonical } = require(path.join(presetRoot, 'lib', 'canonical-json.js'))

  validateCostPolicy(runLock.cost_policy)
  validateModelRoute(runLock.model, runLock.cost_policy)
  const routeChecks = []
  const verifyRoute = (phase) => {
    const current = defaultModel.currentSelection()
    routeChecks.push(assertResolvedModelRoute({ ctx, runLock, selection: current, phase }))
    return current
  }
  const selection = verifyRoute('before-agent')
  const resolved = await presets.resolve('governed')
  if (!resolved || resolved.id !== 'governed' || resolved.broken !== undefined || resolved.trust !== 'system' || typeof resolved.path !== 'string') throw new Error('candidate governed preset could not be resolved as an unbroken system-trusted exact preset')
  const presetPath = fs.realpathSync(resolved.path)
  const expectedPresetPath = fs.realpathSync(path.join(presetRoot, 'governed', 'agent.cordis.yml'))
  if (presetPath !== expectedPresetPath) throw new Error('resolved governed preset origin differs from the installed candidate')
  const presetProvenance = {
    id: resolved.id,
    path_relative: path.relative(presetRoot, presetPath).split(path.sep).join('/'),
    trust: resolved.trust ?? null,
    broken: null,
  }

  const resume = stage === 'continue'
  const requestedSession = resume ? requiredEnv('DSH_E1_RESUME_SESSION') : `e1-${caseId}-${crypto.randomUUID()}`
  const sessionId = SessionId(requestedSession)
  const setup = async (agentCtx) => {
    installModelSelection(agentCtx, { current: selection, assembled: undefined })
    await presets.mount(agentCtx, resolved.id)
    if (!agentCtx.tools || typeof agentCtx.tools.restrict !== 'function') throw new Error('pinned DSH agent scope does not support inherited tool restriction')
    // Scope-local goal/git/status tools merge after inherited restrictions;
    // actual post-mount schemas are still required to match run-lock exactly.
    agentCtx.tools.restrict({ allow: [...EXACT_VISIBLE_TOOL_NAMES] })
  }
  assertBeforeCostDeadline(costAdmissionDeadlineMs, resume ? 'before agents.resume' : 'before agents.create')
  const handle = resume
    ? await agents.resume({ resumeSessionId: sessionId, agentOptions: { provider: selection.provider, model: selection.model }, setup })
    : await agents.create({ sessionId, meta: { cwd: process.cwd() }, agentOptions: { provider: selection.provider, model: selection.model }, setup })
  const agent = handle.agent
  const markers = []
  let runtimeGoal
  let resumeBeforeFollowup

  try {
    await agent.whenIdle()
    verifyRoute('after-agent-idle')
    const visibleContract = createVisibleToolContract(tools.schemas(agent))
    const visibleToolSchemas = visibleContract.schemas
    const visibleTools = visibleToolSchemas.map(schemaName)
    if (hashCanonical(visibleContract) !== hashCanonical(runLock.visible_tool_contract)) {
      await writeJson(path.join(outDir, 'visible-tools.json'), visibleTools)
      await writeJson(path.join(outDir, 'visible-tool-schemas.json'), visibleToolSchemas)
      throw new Error('visible tool names/schemas differ from the frozen run-lock contract')
    }

    let prefixToken
    if (resume) {
      prefixToken = readJson(path.join(outDir, 'resume-token.json'))
      if (prefixToken.session_id !== String(sessionId) || prefixToken.contract_hash !== contract.contract_hash || prefixToken.run_lock_hash !== runLock.lock_hash) throw new Error('resume identity does not match the frozen stage-one token')
      runtimeGoal = disarmTrajectoryGoal(goals, agent, 'resume prefix')
      if (!runtimeGoal || String(runtimeGoal.id) !== prefixToken.runtime_goal_id) throw new Error('resumed runtime goal identity changed')
      validateNativeEvents(agent.session.events, 'resumed native session')
      const beforeFollowup = foldDshGoalEvents(contract, registry, scopeGoalEvents(agent.session.events, runtimeGoal))
      const resumedCheckpoint = checkpoint(hashCanonical, beforeFollowup, contract, runtimeGoal, sessionId)
      for (const field of ['session_id', 'goal_id', 'runtime_goal_id', 'contract_hash', 'state_hash', 'diagnostics_hash', 'decision']) {
        if (resumedCheckpoint[field] !== prefixToken.prefix_live[field]) throw new Error('resume prefix checkpoint drifted at ' + field)
      }
      resumeBeforeFollowup = resumedCheckpoint
      markers.push({
        where: 'after',
        anchor: prefixToken.boundary_native_seq,
        event: { type: 'runner/resume', data: { session_id: String(sessionId), resumed: true } },
      })
    } else {
      const bound = await executeCommand(commands, agent, '/researcher run ' + contractRelative)
      if (!bound) throw new Error('native /researcher run command was not admitted')
      runtimeGoal = disarmTrajectoryGoal(goals, agent, 'native /researcher run')
    }

    assertBeforeCostDeadline(costAdmissionDeadlineMs, resume ? 'before resume followup' : 'before initial followup')
    verifyRoute('before-model-followup')
    const prompt = fs.readFileSync(promptFile, 'utf8')
    await followup(agent, prompt)
    verifyRoute('after-model-followup')
    assertBeforeCostDeadline(costAdmissionDeadlineMs, resume ? 'after resume followup' : 'after initial followup')

    if (caseId === 'governed-gate') {
      const pending = foldDshGoalEvents(contract, registry, scopeGoalEvents(agent.session.events, runtimeGoal))
      if (pending.decision.decision !== 'NEEDS_HUMAN' || goals.get(agent)?.phase !== 'paused') throw new Error('governed gate did not reach host-paused NEEDS_HUMAN before stdin')
      const directInput = await readInteractiveGateInput()
      const inputId = 'stdin-' + crypto.randomUUID()
      const startSeq = eventSeq(agent.session.events.at(-1), 0)
      const execution = await executeCommand(commands, agent, '/researcher ' + directInput)
      if (!execution) throw new Error('native human gate command was not admitted')
      runtimeGoal = disarmTrajectoryGoal(goals, agent, 'human gate resume')
      const runEvent = findCommandRun(agent.session.events, startSeq, directInput)
      const commandId = runEvent?.data?.commandId ?? runEvent?.data?.command_id ?? execution.commandId
      if (!runEvent || !commandId) throw new Error('native command/run evidence for human gate is missing')
      const doneEvent = findCommandDone(agent.session.events, startSeq, commandId)
      if (!doneEvent) throw new Error('native command/done evidence for human gate is missing')
      markers.push({
        where: 'before', anchor: eventSeq(runEvent),
        event: { type: 'runner/stdin', data: {
          input_id: inputId,
          command: directInput,
           actor: 'external-interactive-tty-input',
           evidence: { kind: 'interactive-tty-input', stdin_is_tty: true, stdout_is_tty: true, identity_assurance: 'not-cryptographic-human-identity' },
        } },
      })
      markers.push({
        where: 'after', anchor: eventSeq(doneEvent),
        event: { type: 'runner/command-link', data: { input_id: inputId, commandId: String(commandId) } },
      })
      assertBeforeCostDeadline(costAdmissionDeadlineMs, 'before governed-gate followup')
      verifyRoute('before-governed-gate-followup')
      await followup(agent, fs.readFileSync(path.resolve(requiredEnv('DSH_E1_AFTER_GATE_PROMPT_FILE')), 'utf8'))
      verifyRoute('after-governed-gate-followup')
      assertBeforeCostDeadline(costAdmissionDeadlineMs, 'after governed-gate followup')
    }

    if (caseId === 'resume-replay' && stage === 'observe') {
      const nativeEvents = agent.session.events
      const observations = nativeEvents.filter((event) => event.type === 'tool/call' && event.data?.name === 'submit_goal_observation')
      const decisions = nativeEvents.filter((event) => event.type === 'tool/call' && event.data?.name === 'request_goal_decision')
      if (observations.length === 0) throw new Error('resume stage one ended without an observation')
      if (decisions.length !== 0) throw new Error('resume stage one crossed the forbidden terminal-decision boundary')
      const boundaryNativeSeq = Math.max(...nativeEvents.map((event, index) => eventSeq(event, index + 1)))
      const prefixReplay = foldDshGoalEvents(contract, registry, scopeGoalEvents(nativeEvents, runtimeGoal))
      const prefixLive = checkpoint(hashCanonical, prefixReplay, contract, runtimeGoal, sessionId)
      const liveAugmented = augmentEvents(nativeEvents, markers)
      const durable = await captureDurableSession({ agent, sessions, persistence, sessionId })
      const durableAugmented = augmentEvents(durable.loaded.events, markers)
      const prefixOfflineReplay = foldDshGoalEvents(contract, registry, scopeGoalEvents(durableAugmented, runtimeGoal))
      const prefixReplayed = checkpoint(hashCanonical, prefixOfflineReplay, contract, runtimeGoal, sessionId)
      const resumeAfterSequence = durableAugmented.at(-1)?.seq || 0
      const durableBoundaryNativeSeq = Math.max(...durable.loaded.events.map((event, index) => eventSeq(event, index + 1)))
      const checkpointMatches = ['session_id', 'goal_id', 'runtime_goal_id', 'contract_hash', 'state_hash', 'diagnostics_hash', 'decision'].every((field) => prefixLive[field] === prefixReplayed[field])
      const eventLogMatches = hashCanonical(liveAugmented) === hashCanonical(durableAugmented)
      const token = {
        schema: 'dsh-researcher/goal-governor-e1/resume-token/v1',
        case_id: caseId,
        session_id: String(sessionId),
        goal_id: contract.goal_id,
        runtime_goal_id: String(runtimeGoal.id),
        contract_hash: contract.contract_hash,
        run_lock_hash: runLock.lock_hash,
        boundary_native_seq: durableBoundaryNativeSeq,
        resume_after_sequence: resumeAfterSequence,
        prefix_live: prefixLive,
      }
      const replayCheckpoints = { resume_after_sequence: resumeAfterSequence, prefix_live: prefixLive, prefix_replayed: prefixReplayed, final: 'NOT_RUN' }
      const sessionEvidence = {
        raw_sha256: crypto.createHash('sha256').update(durable.raw.content).digest('hex'),
        live_augmented_events_hash: hashCanonical(liveAugmented),
        durable_native_events_hash: hashCanonical(durable.loaded.events),
        durable_augmented_events_hash: hashCanonical(durableAugmented),
      }
      await archiveSession({
        raw: durable.raw, outDir, visibleTools, visibleToolSchemas, augmented: durableAugmented, replayCheckpoints,
        runtimeArtifact: { schema: 'dsh-researcher/goal-governor-e1/resume-stage1/v1', case_id: caseId, session_id: String(sessionId), runtime_goal_id: String(runtimeGoal.id), session_events: durableAugmented, visible_tools: visibleTools, visible_tool_schemas: visibleToolSchemas, visible_tool_contract_hash: runLock.visible_tool_contract.schema_hash, replay_checkpoints: replayCheckpoints, session_evidence: sessionEvidence, raw_session: { filename: durable.raw.filename, meta: durable.raw.meta, sha256: sessionEvidence.raw_sha256 }, preset_provenance: presetProvenance, host_folded_usage: foldedUsage(prefixOfflineReplay), model_route_provenance: { schema: 'dsh-researcher/goal-governor-e1/model-route-provenance/v1', route: runLock.model.route, provider: runLock.model.provider, model: runLock.model.model, reasoning_effort: runLock.model.reasoning_effort, base_url: runLock.model.base_url, settings_watch: false, checks: routeChecks } },
        stageOne: true,
      })
      await fsp.copyFile(path.join(outDir, 'session.jsonl'), path.join(outDir, 'session.stage1.jsonl'), fs.constants.COPYFILE_EXCL)
      await fsp.copyFile(path.join(outDir, 'session.events.json'), path.join(outDir, 'session.stage1.events.json'), fs.constants.COPYFILE_EXCL)
      if (!checkpointMatches || !eventLogMatches || boundaryNativeSeq !== durableBoundaryNativeSeq) throw new Error('stage-one live state differs from the flushed durable full-log replay')
      await writeJson(path.join(outDir, 'resume-token.json'), token)
      io.stdout.write(JSON.stringify({ case_id: caseId, stage: 'observe', session_id: String(sessionId), decision: prefixLive.decision }) + '\n')
      io.exit(0)
      return
    }

    const nativeEvents = agent.session.events
    const liveAugmented = augmentEvents(nativeEvents, markers)
    const liveReplay = foldDshGoalEvents(contract, registry, scopeGoalEvents(liveAugmented, runtimeGoal))
    const live = checkpoint(hashCanonical, liveReplay, contract, runtimeGoal, sessionId)
    const durable = await captureDurableSession({ agent, sessions, persistence, sessionId })
    const durableAugmented = augmentEvents(durable.loaded.events, markers)
    const offlineReplay = foldDshGoalEvents(contract, registry, scopeGoalEvents(durableAugmented, runtimeGoal))
    const replayed = checkpoint(hashCanonical, offlineReplay, contract, runtimeGoal, sessionId)
    let replayCheckpoints = { live, replayed }
    if (resume) {
      const token = readJson(path.join(outDir, 'resume-token.json'))
      const marker = durableAugmented.find((event) => event.type === 'runner/resume')
      replayCheckpoints = {
        resume_after_sequence: marker.seq - 1,
        prefix_live: token.prefix_live,
        resume_before_followup: resumeBeforeFollowup,
        stage1_seal_sha256: requiredEnv('DSH_E1_STAGE1_SEAL_HASH'),
        stage1_boundary: { session_id: token.session_id, resume_after_sequence: token.resume_after_sequence },
        live,
        replayed,
      }
    }
    const runtimeArtifact = {
      schema: 'dsh-researcher/goal-governor-e1/runtime-capture/v1',
      case_id: caseId,
      session_id: String(sessionId),
      runtime_goal_id: String(runtimeGoal.id),
      session_events: durableAugmented,
      visible_tools: visibleTools,
      visible_tool_schemas: visibleToolSchemas,
      visible_tool_contract_hash: runLock.visible_tool_contract.schema_hash,
      replay_checkpoints: replayCheckpoints,
      session_evidence: {
        raw_sha256: crypto.createHash('sha256').update(durable.raw.content).digest('hex'),
        live_augmented_events_hash: hashCanonical(liveAugmented),
        durable_native_events_hash: hashCanonical(durable.loaded.events),
        durable_augmented_events_hash: hashCanonical(durableAugmented),
      },
      raw_session: { filename: durable.raw.filename, meta: durable.raw.meta, sha256: crypto.createHash('sha256').update(durable.raw.content).digest('hex') },
      preset_provenance: presetProvenance,
      host_folded_usage: foldedUsage(offlineReplay),
      model_route_provenance: {
        schema: 'dsh-researcher/goal-governor-e1/model-route-provenance/v1',
        route: runLock.model.route,
        provider: runLock.model.provider,
        model: runLock.model.model,
        reasoning_effort: runLock.model.reasoning_effort,
        base_url: runLock.model.base_url,
        settings_watch: false,
        checks: routeChecks,
      },
      ...(resume ? { stage1_seal_sha256: requiredEnv('DSH_E1_STAGE1_SEAL_HASH') } : {}),
    }
    await archiveSession({ raw: durable.raw, outDir, visibleTools, visibleToolSchemas, augmented: durableAugmented, replayCheckpoints, runtimeArtifact, stageOne: false })
    const checkpointMatches = ['session_id', 'goal_id', 'runtime_goal_id', 'contract_hash', 'state_hash', 'diagnostics_hash', 'decision'].every((field) => live[field] === replayed[field])
    if (!checkpointMatches || hashCanonical(liveAugmented) !== hashCanonical(durableAugmented)) throw new Error('live state differs from the flushed durable full-log replay')
    io.stdout.write(JSON.stringify({ case_id: caseId, session_id: String(sessionId), decision: replayed.decision }) + '\n')
    io.exit(replayed.decision === requiredEnv('DSH_E1_EXPECTED_TERMINAL') ? 0 : 1)
  } finally {
    await handle.dispose()
  }
}

function apply(ctx) {
  teeStream(process.stdout, process.env.DSH_E1_STDOUT_FILE)
  teeStream(process.stderr, process.env.DSH_E1_STDERR_FILE)
  const exit = ctx.get('appExit')
  if (!exit) throw new Error('E1 live runner requires the headless appExit service')
  const io = { stdout: process.stdout, stderr: process.stderr, exit }
  run(ctx, io).catch((error) => {
    io.stderr.write('dsh E1: ' + (error instanceof Error ? error.stack || error.message : String(error)) + '\n')
    io.exit(1)
  })
}

export { apply, inject, name }
