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

const rc7Result = (output = { exit_code: 0 }, options = {}) => ({
  seq: 2,
  type: 'tool/result',
  data: {
    message: {
      source: { kind: 'tool', callId: options.sourceCallId || 'call-1' },
      content: [{
        type: 'tool-result',
        toolCallId: options.toolCallId || 'call-1',
        content: [{ type: 'text', text: JSON.stringify(output) }],
        isError: options.isError === true,
      }],
      role: 'user',
      id: 'rc7-message-1',
    },
  },
})

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

test('a genuine passing reference cannot mask a forged or invocation-drifted reference', () => {
  const genuine = events()
  assert.equal(verifyEvidence(registry(), 'tests.core', ['call-1', 'forged-call'], genuine, 3).result, 'unknown')

  const mixed = [
    ...genuine,
    { seq: 2.1, type: 'tool/call', data: { callId: 'drifted-call', name: 'pwsh', arguments: JSON.stringify({ command: 'echo fake' }) } },
    { seq: 2.2, type: 'tool/result', data: { message: { callId: 'drifted-call', content: [{ type: 'text', text: JSON.stringify({ exit_code: 0 }) }] } } },
  ]
  const drifted = verifyEvidence(registry(), 'tests.core', ['call-1', 'drifted-call'], mixed, 3)
  assert.equal(drifted.result, 'unknown')
  assert.match(drifted.diagnostics.join('; '), /does not match the frozen verifier/)
})

test('runtime errors cannot become passing verifier evidence', () => {
  const value = events()
  value[1].data.error = { name: 'ToolError', code: 'FAILED' }
  assert.equal(verifyEvidence(registry(), 'tests.core', ['call-1'], value, 3).result, 'fail')
})

test('DSH rc.7 tool-result envelopes bind source and block call IDs and expose nested text', () => {
  const value = [events()[0], rc7Result()]
  assert.equal(verifyEvidence(registry(), 'tests.core', ['call-1'], value, 3).result, 'pass')
  value[1] = rc7Result({ exit_code: 1 })
  assert.equal(verifyEvidence(registry(), 'tests.core', ['call-1'], value, 3).result, 'fail')
})

test('DSH rc.7 nested isError fails even a tool_success policy', () => {
  const successRegistry = sealRegistry({
    schema: 'project-cognition/verifier-registry/v1', revision: 1, registry_hash: null,
    entries: [{ id: 'tests.success', invocations: [{ tool_name: 'pwsh', arguments: { command: 'npm test' }, arguments_hash: argumentsHash({ command: 'npm test' }) }], result_policy: { kind: 'tool_success' } }],
  })
  const value = [events()[0], rc7Result({ exit_code: 0 }, { isError: true })]
  const verified = verifyEvidence(successRegistry, 'tests.success', ['call-1'], value, 3)
  assert.equal(verified.result, 'fail')
  assert.match(verified.diagnostics.join('; '), /returned an error/)
})

test('DSH rc.7 conflicting source and tool-result call IDs fail closed', () => {
  const value = [events()[0], rc7Result({ exit_code: 0 }, { toolCallId: 'other-call' })]
  assert.throws(
    () => verifyEvidence(registry(), 'tests.core', ['call-1'], value, 3),
    /tool\/result call ID: conflicting identifiers/,
  )
})

test('duplicate result events cannot overwrite an earlier result for the same call ID', () => {
  const value = events(undefined, { exit_code: 1 })
  value.push({ seq: 3, type: 'tool/result', data: { message: { callId: 'call-1', content: [{ type: 'text', text: JSON.stringify({ exit_code: 0 }) }] } } })
  const verified = verifyEvidence(registry(), 'tests.core', ['call-1'], value, 4)
  assert.equal(verified.result, 'unknown')
  assert.match(verified.diagnostics.join('; '), /duplicate tool\/result events/)
})

test('a result event before its corresponding call cannot become verifier evidence', () => {
  const value = events()
  value.reverse()
  const verified = verifyEvidence(registry(), 'tests.core', ['call-1'], value, 3)
  assert.equal(verified.result, 'unknown')
  assert.match(verified.diagnostics.join('; '), /does not occur after its tool\/call event/)
})

test('duplicate call IDs and duplicate evidence references are rejected as ambiguous', () => {
  const duplicateCall = events()
  duplicateCall.splice(1, 0, { seq: 1.5, type: 'tool/call', data: { callId: 'call-1', name: 'pwsh', arguments: JSON.stringify({ command: 'npm test' }) } })
  const duplicateCallResult = verifyEvidence(registry(), 'tests.core', ['call-1'], duplicateCall, 3)
  assert.equal(duplicateCallResult.result, 'unknown')
  assert.match(duplicateCallResult.diagnostics.join('; '), /duplicate tool\/call events/)

  const duplicateRefResult = verifyEvidence(registry(), 'tests.core', ['tool:call-1', 'call-1'], events(), 3)
  assert.equal(duplicateRefResult.result, 'unknown')
  assert.match(duplicateRefResult.diagnostics.join('; '), /duplicate evidence reference/)
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

  for (const content of [[], [{ type: 'text', text: '   ' }], [{ type: 'image', data: 'not-text' }]]) {
    clean[1].data.message.content = content
    const empty = verifyEvidence(shellRegistry, 'tests.shell', ['shell-1'], clean, 3)
    assert.equal(empty.result, 'unknown')
    assert.match(empty.diagnostics.join('; '), /no non-empty rendered text/)
  }
})
