const test = require('node:test')
const assert = require('node:assert')
const {
  sealRegistry, validateRegistry, argumentsHash, verifyEvidence,
} = require('../lib/verifier-core/index.js')

const registry = () => sealRegistry({
  schema: 'project-cognition/verifier-registry/v1',
  revision: 1,
  registry_hash: null,
  entries: [{
    id: 'tests.core',
    invocations: [{ tool_name: 'pwsh', arguments: { command: 'npm test' }, arguments_hash: argumentsHash({ command: 'npm test' }) }],
    result_policy: { kind: 'json_field_equals', path: 'exit_code', equals: 0 },
  }],
})

const events = (args = { command: 'npm test' }, output = { exit_code: 0 }) => [
  { seq: 1, type: 'tool/call', data: { callId: 'call-1', name: 'pwsh', arguments: JSON.stringify(args) } },
  { seq: 2, type: 'tool/result', data: { message: { callId: 'call-1', content: [{ type: 'text', text: JSON.stringify(output) }] } } },
]

test('registry hash freezes verifier definitions', () => {
  const value = registry()
  validateRegistry(value)
  value.entries[0].result_policy.equals = 1
  assert.throws(() => validateRegistry(value), /does not match canonical registry/)
})

test('evidence must name an earlier matching invocation and satisfy its result policy', () => {
  assert.equal(verifyEvidence(registry(), 'tests.core', ['tool:call-1'], events(), 3).result, 'pass')
  assert.equal(verifyEvidence(registry(), 'tests.core', ['call-1'], events(undefined, { exit_code: 1 }), 3).result, 'fail')
  assert.equal(verifyEvidence(registry(), 'tests.core', ['call-1'], events({ command: 'echo fake' }), 3).result, 'unknown')
  assert.equal(verifyEvidence(registry(), 'tests.core', ['call-1'], events(), 1).result, 'unknown')
})

test('runtime errors cannot become passing verifier evidence', () => {
  const value = events()
  value[1].data.error = { name: 'ToolError', code: 'FAILED' }
  assert.equal(verifyEvidence(registry(), 'tests.core', ['call-1'], value, 3).result, 'fail')
})

test('rendered shell failure markers are enforceable without structured result leakage', () => {
  const shellRegistry = sealRegistry({
    schema: 'project-cognition/verifier-registry/v1', revision: 1, registry_hash: null,
    entries: [{ id: 'tests.shell', invocations: [{ tool_name: 'pwsh', arguments: { command: 'npm test', description: 'Run project test suite' }, arguments_hash: argumentsHash({ command: 'npm test', description: 'Run project test suite' }) }], result_policy: { kind: 'text_excludes', patterns: ['[exit code:', '[timed out', '[killed by signal:', '[sandbox:'] } }],
  })
  const clean = [
    { seq: 1, type: 'tool/call', data: { callId: 'shell-1', name: 'pwsh', arguments: JSON.stringify({ command: 'npm test', description: 'Run project test suite' }) } },
    { seq: 2, type: 'tool/result', data: { message: { callId: 'shell-1', content: [{ type: 'text', text: '69 tests passed' }] } } },
  ]
  assert.equal(verifyEvidence(shellRegistry, 'tests.shell', ['shell-1'], clean, 3).result, 'pass')
  clean[1].data.message.content[0].text = 'test failed\n[exit code: 1]'
  assert.equal(verifyEvidence(shellRegistry, 'tests.shell', ['shell-1'], clean, 3).result, 'fail')
})
