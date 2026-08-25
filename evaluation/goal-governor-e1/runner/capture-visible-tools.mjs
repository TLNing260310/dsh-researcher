// Capture-only DSH driver. It creates an idle scoped agent to resolve the
// actual post-preset tool catalog, but never submits a prompt, command, tool
// call, or model request.
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const dshImports = JSON.parse(process.env.DSH_E1_PACKAGE_IMPORTS || '{}')
const importDsh = (specifier) => {
  const target = dshImports[specifier]
  if (typeof target !== 'string' || !target.startsWith('file:')) throw new Error('pinned DSH import is unavailable: ' + specifier)
  return import(target)
}
const [agentModule, sessionModule] = await Promise.all([
  importDsh('@deepseek-ai/dsh-agent'),
  importDsh('@deepseek-ai/dsh-session'),
])
const { installModelSelection } = agentModule
const { SessionId } = sessionModule
const name = 'goal-governor-e1-visible-tools-capture'
const inject = ['agentDefaultModel', 'agents', 'tools', 'agentPresets']

const requiredEnv = (key) => {
  const value = process.env[key]
  if (!value) throw new Error(key + ' is required')
  return value
}

async function run(ctx, io) {
  await ctx.get('loader')?.await()
  const defaultModel = ctx.get('agentDefaultModel')
  const agents = ctx.get('agents')
  const tools = ctx.get('tools')
  const presets = ctx.get('agentPresets')
  if (!defaultModel || !agents || !tools || !presets) throw new Error('schema capture services are unavailable')
  const presetRoot = path.resolve(requiredEnv('DSH_E1_PRESET_ROOT'))
  const contractModule = require(path.resolve(requiredEnv('DSH_E1_VISIBLE_TOOL_CONTRACT_MODULE')))
  const resolved = await presets.resolve('governed')
  if (!resolved || resolved.id !== 'governed' || resolved.broken !== undefined || resolved.trust !== 'system' || typeof resolved.path !== 'string') throw new Error('governed preset is not an unbroken system-trusted preset')
  if (fs.realpathSync(resolved.path) !== fs.realpathSync(path.join(presetRoot, 'governed', 'agent.cordis.yml'))) throw new Error('resolved governed preset origin drifted')
  const selection = defaultModel.currentSelection()
  const sessionId = SessionId('e1-schema-capture-' + crypto.randomUUID())
  const setup = async (agentCtx) => {
    installModelSelection(agentCtx, { current: selection, assembled: undefined })
    await presets.mount(agentCtx, resolved.id)
    if (!agentCtx.tools || typeof agentCtx.tools.restrict !== 'function') throw new Error('agent-scoped inherited tool restriction is unavailable')
    agentCtx.tools.restrict({ allow: [...contractModule.EXACT_VISIBLE_TOOL_NAMES] })
  }
  const handle = await agents.create({ sessionId, meta: { cwd: process.cwd() }, agentOptions: { provider: selection.provider, model: selection.model }, setup })
  try {
    await handle.agent.whenIdle()
    const nativeEvents = Array.isArray(handle.agent.session?.events) ? handle.agent.session.events : []
    const forbidden = nativeEvents.filter((event) => /^(?:assistant|llm|tool|command)\//.test(String(event?.type || '')))
    if (forbidden.length > 0) throw new Error('capture-only agent emitted prompt/model/tool/command events')
    const schemas = tools.schemas(handle.agent)
    let contract
    try { contract = contractModule.createVisibleToolContract(schemas) } catch (error) {
      const names = schemas.map((schema) => contractModule.schemaName(schema)).filter(Boolean).sort()
      throw new Error(error.message + '; actual visible names: ' + JSON.stringify(names), { cause: error })
    }
    await fsp.writeFile(path.resolve(requiredEnv('DSH_E1_CAPTURE_OUT')), JSON.stringify({
      schema: 'dsh-researcher/goal-governor-e1/visible-tools-capture-inner/v1',
      model_calls: 0,
      prompt_submissions: 0,
      command_submissions: 0,
      native_event_count: nativeEvents.length,
      visible_tool_contract: contract,
    }, null, 2) + '\n', { flag: 'wx' })
    io.exit(0)
  } finally { await handle.dispose() }
}

function apply(ctx) {
  const exit = ctx.get('appExit')
  if (!exit) throw new Error('schema capture requires headless appExit')
  run(ctx, { exit }).catch((error) => {
    process.stderr.write('E1 schema capture: ' + (error instanceof Error ? error.stack || error.message : String(error)) + '\n')
    exit(1)
  })
}

export { apply, inject, name }
