'use strict'

// E1-only authority boundary. The trusted verifier lives outside the
// workspace and all model-side mutation is constrained to src/task.js.
const fs = require('node:fs')
const path = require('node:path')
const { runExternalVerifier, renderToolResult, TOOL_NAME } = require('../external-verifier.js')
const { EXACT_VISIBLE_TOOL_NAMES } = require('../visible-tool-contract.js')

const MUTATION_TOOLS = new Set(['write', 'edit'])
const ALLOWED_READ_TOOLS = new Set(EXACT_VISIBLE_TOOL_NAMES.filter((name) => !MUTATION_TOOLS.has(name)))
const DENIAL = '[dsh-researcher E1] host tool policy refused this execution.'
const EMPTY_PARAMETERS = { type: 'object', properties: {}, required: [], additionalProperties: false }

const canonicalExisting = (value) => {
  try { return fs.realpathSync.native ? fs.realpathSync.native(value) : fs.realpathSync(value) } catch (_) { return path.resolve(value) }
}
const isPortableAbsolute = (value) => path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value)
const workspaceOf = (agent) => {
  const cwd = agent && agent.session && agent.session.header && agent.session.header.cwd
  return typeof cwd === 'string' && cwd !== '' ? path.resolve(cwd) : null
}

const pathVerdict = (_name, args, workspace, allowedChanges) => {
  const value = args && args.file_path
  if (typeof value !== 'string' || value === '' || /[\u0000-\u001f\u007f]/.test(value)) return DENIAL + ' write/edit requires file_path.'
  if (isPortableAbsolute(value) && !path.isAbsolute(value)) return DENIAL + ' foreign absolute paths are forbidden.'
  const expected = canonicalExisting(path.join(workspace, 'src', 'task.js'))
  const requested = canonicalExisting(path.resolve(workspace, value))
  if (!allowedChanges.includes('src/task.js') || requested !== expected) return DENIAL + ' this case permits only its manifest-declared src/task.js mutation, if any.'
  return undefined
}

const guardVerdict = (name, args, workspace, expectedWorkspace, allowedChanges = []) => {
  if (!name || typeof workspace !== 'string' || canonicalExisting(workspace) !== canonicalExisting(expectedWorkspace)) return DENIAL + ' session workspace identity drifted.'
  if (MUTATION_TOOLS.has(name)) return pathVerdict(name, args, workspace, allowedChanges)
  if (!ALLOWED_READ_TOOLS.has(name)) return DENIAL + ' tool "' + name + '" is outside the deterministic E1 allowlist.'
  if (name === TOOL_NAME && JSON.stringify(args || {}) !== '{}') return DENIAL + ' e1_verify accepts exactly {}.'
  return undefined
}

const output = {
  schema: { type: 'string' },
  render: (_args, value) => [{ type: 'text', text: value }],
}

module.exports = {
  name: 'goal-governor-e1-host-tool',
  inject: ['tools'],
  apply(ctx) {
    const expectedWorkspace = path.resolve(process.env.DSH_E1_WORKSPACE || '')
    const verifierPath = path.resolve(process.env.DSH_E1_EXTERNAL_VERIFIER || '')
    const verifierSource = process.env.DSH_E1_EXTERNAL_VERIFIER_SOURCE || ''
    const expectedVerifierSha256 = process.env.DSH_E1_EXTERNAL_VERIFIER_SHA256 || ''
    const expectedImmutableFiles = JSON.parse(process.env.DSH_E1_IMMUTABLE_FILES || 'null')
    const allowedChanges = JSON.parse(process.env.DSH_E1_ALLOWED_CHANGES || 'null')
    const expectedNodeProvenance = JSON.parse(process.env.DSH_E1_NODE_PROVENANCE || 'null')
    if (!process.env.DSH_E1_WORKSPACE || !verifierSource || !expectedImmutableFiles || !Array.isArray(allowedChanges) || !expectedNodeProvenance) throw new Error('E1 host verifier environment is incomplete')

    ctx.tools.register({
      name: TOOL_NAME,
      description: 'Run the frozen host-owned E1 verifier. Accepts exactly {}. This is the only verifier invocation trusted by the Goal Contract.',
      parameters: EMPTY_PARAMETERS,
      output,
      presentCall: () => ({ card: 'generic', title: 'E1 host verifier', kind: 'read' }),
      async execute(args, execution) {
        const workspace = workspaceOf(execution && execution.agent)
        const denial = guardVerdict(TOOL_NAME, args, workspace, expectedWorkspace, allowedChanges)
        if (denial) return denial
        return renderToolResult(runExternalVerifier({
          workspace,
          verifierPath,
          verifierSource,
          expectedVerifierSha256,
          expectedImmutableFiles,
          allowedChanges,
          expectedNodeProvenance,
        }))
      },
    })

    ctx.tools.guard((execution) => guardVerdict(
      execution && execution.name,
      execution && execution.arguments,
      workspaceOf(execution && execution.agent),
      expectedWorkspace,
      allowedChanges,
    ))
  },
  __test: { ALLOWED_READ_TOOLS, DENIAL, EMPTY_PARAMETERS, guardVerdict, pathVerdict },
}
