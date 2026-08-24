#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const { approveContract } = require('../lib/goal-core/index.js')
const { sealRegistry } = require('../lib/verifier-core/index.js')
const { foldDshGoalEvents } = require('../lib/dsh-adapter/index.js')

const FIXTURE_PREFIX = 'dsh-governor-demo-'
const TARGET_FILE = 'target.txt'
const VERIFIER_FILE = 'verify.js'
const EXPECTED_TARGET = 'verified\n'
const verifierArguments = { argv: [VERIFIER_FILE], cwd: 'temporary-isolated-fixture' }

const VERIFIER_SOURCE = `'use strict'
const fs = require('node:fs')
const path = require('node:path')

const actual = fs.readFileSync(path.join(__dirname, ${JSON.stringify(TARGET_FILE)}), 'utf8')
if (actual === ${JSON.stringify(EXPECTED_TARGET)}) {
  process.stdout.write('fixture target verified\\n')
  process.exitCode = 0
} else {
  process.stderr.write('fixture target is not verified\\n')
  process.exitCode = 1
}
`

const registry = sealRegistry({
  schema: 'project-cognition/verifier-registry/v1',
  revision: 1,
  registry_hash: null,
  entries: [{
    id: 'tests.core',
    invocations: [{ tool_name: 'node', arguments: verifierArguments, arguments_hash: null }],
    result_policy: { kind: 'json_field_equals', path: 'exit_code', equals: 0 },
  }],
})

const call = (seq, callId, name, args) => ({
  seq,
  type: 'tool/call',
  at: '2026-08-25T00:00:00.000Z',
  data: { callId, name, arguments: JSON.stringify(args) },
})

// This is deliberately a DSH-shaped host envelope. The value inside it is
// captured from a real child process; the envelope and call ID are supplied by
// this deterministic harness because this demo is not a live DSH session.
const result = (seq, callId, value) => ({
  seq,
  type: 'tool/result',
  at: '2026-08-25T00:00:00.000Z',
  data: { message: { callId, content: [{ type: 'text', text: JSON.stringify(value) }] } },
})

const hashTarget = (fixtureRoot) => crypto
  .createHash('sha256')
  .update(fs.readFileSync(path.join(fixtureRoot, TARGET_FILE)))
  .digest('hex')

const createIsolatedFixture = () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), FIXTURE_PREFIX))
  fs.writeFileSync(path.join(fixtureRoot, TARGET_FILE), 'needs-fix\n', 'utf8')
  fs.writeFileSync(path.join(fixtureRoot, VERIFIER_FILE), VERIFIER_SOURCE, 'utf8')
  return fixtureRoot
}

const repairFixture = (fixtureRoot) => {
  fs.writeFileSync(path.join(fixtureRoot, TARGET_FILE), EXPECTED_TARGET, 'utf8')
  return hashTarget(fixtureRoot)
}

const removeIsolatedFixture = (fixtureRoot) => {
  const resolvedRoot = path.resolve(fixtureRoot)
  const resolvedTemp = path.resolve(os.tmpdir())
  const relative = path.relative(resolvedTemp, resolvedRoot)
  if (relative.startsWith('..') || path.isAbsolute(relative) || path.basename(resolvedRoot).indexOf(FIXTURE_PREFIX) !== 0) {
    throw new Error('refusing to remove a path outside the owned demo fixture')
  }
  fs.rmSync(resolvedRoot, { recursive: true, force: true })
}

const runVerifier = (fixtureRoot) => {
  const invocation = spawnSync(process.execPath, [VERIFIER_FILE], {
    cwd: fixtureRoot,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
  })
  if (invocation.error) {
    throw new Error('verifier process could not run: ' + invocation.error.message)
  }
  if (!Number.isInteger(invocation.status)) {
    throw new Error('verifier process ended without an integer exit status')
  }
  return {
    host_result: {
      exit_code: invocation.status,
      stdout: invocation.stdout,
      stderr: invocation.stderr,
      signal: invocation.signal,
    },
    execution: {
      spawn_api: 'node:child_process.spawnSync',
      executable: process.execPath,
      argv: [VERIFIER_FILE],
      cwd: fixtureRoot,
      pid: invocation.pid,
      status: invocation.status,
      signal: invocation.signal,
    },
  }
}

const publicExecution = (execution) => ({
  spawn_api: execution.spawn_api,
  executable: path.basename(execution.executable),
  argv: execution.argv,
  cwd: 'temporary-isolated-fixture',
  pid_observed: Number.isInteger(execution.pid) && execution.pid > 0,
  exit_code_from_spawn_status: execution.status,
  signal: execution.signal,
})

const createGoal = (baselineRevision) => approveContract({
  schema: 'project-cognition/goal/v1',
  goal_id: 'demo-evidence-not-confidence',
  revision: 1,
  status: 'draft',
  contract_hash: null,
  verifier_registry_hash: registry.registry_hash,
  mode: 'simple',
  intent: {
    problem: 'An agent can claim completion before the frozen verifier passes.',
    value: 'Stop only when host-observed evidence proves the target state.',
  },
  baseline: { repo_revision: baselineRevision, cognition_hash: 'a'.repeat(64), known_failures: [] },
  target_state: 'The frozen verifier process exits successfully.',
  criteria: [{
    id: 'C1', priority: 'must', expected: 'The verifier process exits with code 0.',
    verifier_id: 'tests.core', authority: 'tool', evidence_required: ['matching host tool call and result'],
  }],
  boundaries: { in_scope: ['the isolated fixture target'], out_of_scope: ['unrelated cleanup'], do_not_touch: ['project invariants'] },
  invariant_refs: [],
  limits: { max_attempts: 2, max_no_progress_attempts: 2, max_time_sec: 300, max_tokens: 10000 },
  human_gates: [],
  approval: null,
}, 'demo-owner', '2026-08-25T00:00:00.000Z')

const runDemo = () => {
  const fixtureRoot = createIsolatedFixture()
  try {
    const baselineRevision = hashTarget(fixtureRoot)
    const goal = createGoal(baselineRevision)
    const confidenceOnly = [
      { seq: 1, type: 'message/assistant', at: '2026-08-25T00:00:00.000Z', data: { text: 'Done. Everything looks good.' } },
      call(2, 'decision-confidence', 'request_goal_decision', {}),
    ]

    const before = runVerifier(fixtureRoot)
    const failingBaseline = [
      ...confidenceOnly.slice(0, -1),
      call(2, 'verify-before', 'node', verifierArguments),
      result(3, 'verify-before', before.host_result),
      call(4, 'begin-before', 'begin_goal_attempt', {
        attempt_id: 'baseline', baseline: true, target_criteria: ['C1'], repo_revision: baselineRevision,
      }),
      call(5, 'observe-before', 'submit_goal_observation', {
        attempt_id: 'baseline', criterion_id: 'C1', verifier_id: 'tests.core', result: 'fail',
        evidence_refs: ['tool:verify-before'], repo_revision: baselineRevision,
      }),
      call(6, 'complete-before', 'complete_goal_attempt', { attempt_id: 'baseline' }),
      call(7, 'decision-before', 'request_goal_decision', {}),
    ]

    const changedRevision = repairFixture(fixtureRoot)
    const after = runVerifier(fixtureRoot)
    const verifiedChange = [
      ...failingBaseline.slice(0, -1),
      call(7, 'verify-after', 'node', verifierArguments),
      result(8, 'verify-after', after.host_result),
      call(9, 'begin-after', 'begin_goal_attempt', {
        attempt_id: 'attempt-1', baseline: false, target_criteria: ['C1'], repo_revision: changedRevision,
      }),
      call(10, 'observe-after', 'submit_goal_observation', {
        attempt_id: 'attempt-1', criterion_id: 'C1', verifier_id: 'tests.core', result: 'pass',
        evidence_refs: ['tool:verify-after'], repo_revision: changedRevision,
      }),
      call(11, 'complete-after', 'complete_goal_attempt', { attempt_id: 'attempt-1' }),
      call(12, 'decision-after', 'request_goal_decision', {}),
    ]

    return {
      demo: goal.goal_id,
      contract_hash: goal.contract_hash,
      registry_hash: registry.registry_hash,
      evidence_boundary: {
        real: [
          'an isolated temporary fixture',
          'two verifier child-process invocations',
          'stdout, stderr, signal, and exit status captured from spawnSync',
          'the bounded target-file repair between invocations',
        ],
        simulated: [
          'DSH-shaped host tool/call and tool/result envelopes',
          'host-issued call IDs used to replay the captured process results',
        ],
        production: [
          'goal contract approval and hashing',
          'sealed verifier registry and evidence matching',
          'shipped DSH replay adapter and Goal Governor reducer',
        ],
        excluded: ['live DSH runtime', 'Live E1', 'model calls', 'network calls'],
      },
      stages: [
        {
          stage: 'agent-confidence-only',
          observed: 'Assistant says DONE, but supplied no trusted verifier evidence.',
          result: foldDshGoalEvents(goal, registry, confidenceOnly).decision,
        },
        {
          stage: 'real-verifier-fails',
          observed: 'A real isolated verifier process ran and spawnSync returned exit_code=1.',
          process: publicExecution(before.execution),
          result: foldDshGoalEvents(goal, registry, failingBaseline).decision,
        },
        {
          stage: 'real-verifier-passes',
          observed: 'After the bounded repair, the same frozen verifier command ran in a second real process and returned exit_code=0.',
          process: publicExecution(after.execution),
          result: foldDshGoalEvents(goal, registry, verifiedChange).decision,
        },
      ],
    }
  } finally {
    removeIsolatedFixture(fixtureRoot)
  }
}

const printDemo = (report, json) => {
  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }
  console.log('Goal Governor — evidence, not confidence')
  console.log('')
  for (const [index, item] of report.stages.entries()) {
    console.log(`${index + 1}. ${item.observed}`)
    console.log(`   Host decision: ${item.result.decision}`)
    console.log(`   Why: ${item.result.reason}`)
  }
  console.log('')
  console.log('Real boundary: an isolated fixture and two verifier child processes were executed.')
  console.log('Simulated boundary: this harness constructed the DSH-shaped host event envelopes and call IDs.')
  console.log('Production path: the shipped replay adapter and Goal Governor reducer made every decision.')
  console.log('No live DSH session, Live E1, model call, or network call occurred.')
}

if (require.main === module) {
  printDemo(runDemo(), process.argv.includes('--json'))
}

module.exports = {
  EXPECTED_TARGET,
  createIsolatedFixture,
  repairFixture,
  removeIsolatedFixture,
  runVerifier,
  runDemo,
  registry,
}
