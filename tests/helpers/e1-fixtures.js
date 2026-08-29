'use strict'

const crypto = require('node:crypto')

const { hashCanonical } = require('../../lib/canonical-json.js')
const { sealState } = require('../../lib/cognition-core/index.js')
const { approveContract } = require('../../lib/goal-core/index.js')
const { foldDshGoalEvents, summarizeNativeUsage } = require('../../lib/dsh-adapter/index.js')
const { sealRegistry } = require('../../lib/verifier-core/index.js')
const { INVALIDITY_RULES, REPLAY_COMPARE_FIELDS, RUN_LOCK_SCHEMA, TRUSTED_VERIFIER, VISIBLE_TOOL_POLICY } = require('../../evaluation/goal-governor-e1/lib.js')
const { EXACT_VISIBLE_TOOL_NAMES, createVisibleToolContract } = require('../../evaluation/goal-governor-e1/visible-tool-contract.js')
const { NODE_ENV_DENYLIST } = require('../../evaluation/goal-governor-e1/runtime-provenance.js')
const { evaluateCostAdmission } = require('../../evaluation/goal-governor-e1/cost-policy.js')
const {
  MANIFEST_SCHEMA,
  RUN_SCHEMA,
  CASE_PROTOCOL,
  REQUIRED_RAW_FIELDS,
  REQUIRED_VISIBLE_TOOLS,
  scoreBundle,
} = require('../../evaluation/goal-governor-e1/score-e1.js')

const digest = (label) => crypto.createHash('sha256').update(label).digest('hex')
const TRUSTED_VERIFIER_SOURCE = TRUSTED_VERIFIER.source
const TRUSTED_VERIFIER_SHA256 = TRUSTED_VERIFIER.sha256
const SYNTHETIC_VISIBLE_TOOL_SCHEMAS = EXACT_VISIBLE_TOOL_NAMES.map((name) => ({
  name,
  description: 'deterministic synthetic E1 tool schema for ' + name,
  parameters: { type: 'object', properties: {}, additionalProperties: true },
}))
const SYNTHETIC_VISIBLE_TOOL_CONTRACT = createVisibleToolContract(SYNTHETIC_VISIBLE_TOOL_SCHEMAS)
const SYNTHETIC_DSH_DEPENDENCIES = [{
  name: '@deepseek-ai/dsh', version: '0.1.1-rc.2', root_relative: '@deepseek-ai/dsh',
  package_json_sha256: digest('dsh-package-json'), content_tree_sha256: digest('dsh-content'), file_count: 1,
}]
const manifestBytes = (manifest) => Buffer.from(JSON.stringify(manifest, null, 2) + '\n')
const manifestDigest = (manifest) => crypto.createHash('sha256').update(manifestBytes(manifest)).digest('hex')
const SYNTHETIC_COST_POLICY = Object.freeze({
  schema: 'dsh-researcher/model-cost-policy/v1',
  timezone: 'Asia/Shanghai',
  utc_offset_minutes: 480,
  restricted_weekdays: Object.freeze([1, 2, 3, 4, 5]),
  restricted_windows: Object.freeze([
    Object.freeze({ start: '09:00', end: '12:00' }),
    Object.freeze({ start: '14:00', end: '18:00' }),
  ]),
  remote: Object.freeze({ route: 'deepseek-api', provider: 'deepseek-official', model: 'deepseek-v4-flash', base_url: 'https://api.deepseek.com' }),
  local: Object.freeze({ route: 'local-loopback', provider: 'deepseek-official', endpoint_assurance: 'resolved-adapter-base-url-loopback' }),
  unknown_route: 'deny',
})

const costAdmissions = (runLock, stage = 'full') => {
  const instants = stage === 'continue'
    ? ['2026-08-24T00:00:00.100Z', '2026-08-24T00:00:00.500Z']
    : ['2026-08-23T23:59:58.000Z', '2026-08-23T23:59:59.000Z']
  return ['pre-output', 'pre-spawn'].map((phase, index) => evaluateCostAdmission({
    policy: runLock.cost_policy,
    model: runLock.model,
    now: instants[index],
    reservationSec: runLock.budget.max_time_sec + 60,
    phase,
  }))
}

const makeState = () => sealState({
  schema: 'project-cognition/state-draft/v1',
  revision: 1,
  mission: {
    purpose: 'Provide a deterministic E1 scorer fixture.',
    intended_users: ['E1 scorer tests'],
    use_cases: ['offline causal evidence validation'],
    environment: ['Node.js 22.12 or newer'],
  },
  architecture: { components: ['E1 fixture'], boundaries: ['Machine evidence is authoritative.'] },
  value_claims: [],
  invariants: [],
  decisions: [],
  evidence: [],
  known_unknowns: [],
  next_proofs: [],
})

const foundation = (caseId, manifest, options = {}) => {
  const registry = sealRegistry({
    schema: 'project-cognition/verifier-registry/v1',
    revision: 1,
    registry_hash: null,
    entries: [{
      id: 'tests.core',
      invocations: [{ tool_name: 'e1_verify', arguments: {} }],
      result_policy: {
        kind: 'text_excludes',
        patterns: ['[exit code:', '[timed out', '[killed by signal:', '[sandbox:'],
      },
    }],
  })
  const state = makeState()
  const humanGates = options.humanGate ? [{ id: 'H1', description: 'Owner approves the architecture boundary.' }] : []
  const goal = approveContract({
    schema: 'project-cognition/goal/v1',
    goal_id: 'e1-' + caseId,
    revision: 1,
    status: 'draft',
    contract_hash: null,
    verifier_registry_hash: registry.registry_hash,
    mode: options.humanGate ? 'governed' : 'simple',
    intent: { problem: 'Prove the E1 trajectory.', value: 'Evidence-bound completion.' },
    baseline: { repo_revision: manifest.fixture.t0_revision, cognition_hash: state.state_hash, known_failures: [] },
    target_state: 'The frozen criterion is satisfied without crossing scope.',
    criteria: [{
      id: 'C1', priority: 'must', expected: 'tests pass', verifier_id: 'tests.core',
      authority: 'tool', evidence_required: ['paired tool call and result'],
    }],
    boundaries: { in_scope: ['src/task.js'], out_of_scope: ['secrets'], do_not_touch: ['README.md'] },
    invariant_refs: [],
    limits: {
      max_attempts: 2,
      max_no_progress_attempts: 2,
      max_time_sec: manifest.budget.max_time_sec,
      max_tokens: manifest.budget.max_tokens,
    },
    human_gates: humanGates,
    approval: null,
  }, 'e1-owner', '2026-08-24T00:00:00.000Z')
  return { goal, registry, state }
}

const eventBuilder = (runtimeGoalId) => {
  const events = []
  let sequence = 0
  let callNumber = 0
  const add = (type, data) => {
    const event = { seq: ++sequence, type, data }
    events.push(event)
    return event
  }
  const call = (name, args, forcedId) => {
    const callId = forcedId || 'call-' + (++callNumber)
    add('tool/call', { callId, name, arguments: JSON.stringify(args) })
    return callId
  }
  const result = (callId, value) => add('tool/result', {
    message: { callId, content: [{ type: 'text', text: JSON.stringify(value) }] },
  })
  const verify = (exitCode) => {
    const callId = call('e1_verify', {})
    const marker = exitCode === 0 ? '' : '\n[exit code: ' + exitCode + ']'
    add('tool/result', {
      message: { callId, content: [{ type: 'text', text: JSON.stringify({ exit_code: exitCode }) + marker }] },
    })
    return callId
  }
  const attempt = (attemptId, baseline, resultValue, evidenceRef) => {
    call('begin_goal_attempt', {
      attempt_id: attemptId,
      baseline,
      target_criteria: ['C1'],
      repo_revision: baseline ? 'e1-fixture-t0-v1' : 'repo-after',
    })
    call('submit_goal_observation', {
      attempt_id: attemptId,
      criterion_id: 'C1',
      verifier_id: 'tests.core',
      result: resultValue,
      evidence_refs: [evidenceRef],
      repo_revision: baseline ? 'e1-fixture-t0-v1' : 'repo-after',
    })
    call('complete_goal_attempt', { attempt_id: attemptId })
  }
  const decide = () => call('request_goal_decision', {})
  const host = (operation, phase = operation, code) => add('goal/change', {
    operation,
    source: 'host',
    ...(code ? { code } : {}),
    goal: { id: runtimeGoalId, revision: 1, phase },
  })
  host('create', 'active')
  const usage = { inputTokens: 8, outputTokens: 4, cacheReadTokens: 1, reasoningTokens: 2 }
  const usageChunk = add('assistant/chunk', { turn: 1, step: 1, chunk: { type: 'usage', usage } })
  const finishChunk = add('assistant/chunk', { turn: 1, step: 1, chunk: { type: 'finish', reason: { kind: 'stop' } } })
  const message = add('assistant/message', {
    turn: 1,
    step: 1,
    usage,
    message: { role: 'assistant', content: [{ type: 'text', text: 'I have completed everything. DONE. This prose is not evidence.' }] },
  })
  message.sourceEventSeqs = [usageChunk.seq, finishChunk.seq]
  return { events, add, call, result, verify, attempt, decide, host }
}

const snapshotTreeHash = (records) => hashCanonical([...records]
  .map((record) => ({ path: record.path, sha256: record.sha256 }))
  .sort((left, right) => left.path.localeCompare(right.path)))

const worktree = (changed, allowedChanges) => {
  const before = [
    { path: 'README.md', sha256: digest('stable-readme') },
    { path: 'src/task.js', sha256: digest('old-target') },
  ]
  const after = [
    { path: 'README.md', sha256: digest('stable-readme') },
    { path: 'src/task.js', sha256: digest(changed ? 'new-target' : 'old-target') },
  ]
  return {
    before,
    after,
    allowed_changes: [...allowedChanges],
    workspace_binding: {
      schema: 'dsh-researcher/goal-governor-e1/workspace-binding/v1',
      platform: 'posix',
      root_sha256: digest('/synthetic/e1-workspace'),
    },
    before_tree_sha256: snapshotTreeHash(before),
    after_tree_sha256: snapshotTreeHash(after),
  }
}

const hostVerifier = (treeSha256, exitCode) => {
  const immutable = { 'README.md': digest('stable-readme') }
  return {
    schema: 'dsh-researcher/goal-governor-e1/external-verifier-result/v1',
    tool_name: 'e1_verify',
    arguments: {},
    command: { runtime: 'node', source: TRUSTED_VERIFIER_SOURCE, source_sha256: TRUSTED_VERIFIER_SHA256 },
    verifier: {
      expected_sha256: TRUSTED_VERIFIER_SHA256,
      before_sha256: TRUSTED_VERIFIER_SHA256,
      after_sha256: TRUSTED_VERIFIER_SHA256,
      external_to_workspace: true,
    },
    exit_code: exitCode,
    signal: null,
    timed_out: false,
    stdout: '',
    stderr: '',
    spawn_error: null,
    integrity: { ok: true, errors: [] },
    immutable_inputs: { expected: immutable, before: immutable, after: immutable, unchanged: true },
    workspace: { before_tree_sha256: treeSha256, after_tree_sha256: treeSha256, unchanged: true },
    failure_markers: exitCode === 0 ? [] : ['[exit code: ' + exitCode + ']'],
  }
}

const budgetEvidence = (caseId, manifest, events, runLock) => {
  const stages = caseId === 'resume-replay' ? ['observe', 'continue'] : ['full']
  const processes = stages.map((stage, index) => {
    const admission = costAdmissions(runLock, stage).at(-1)
    const deadline = new Date(Date.parse(admission.evaluated_at_utc) + admission.reservation_sec * 1000).toISOString()
    return {
      stage,
      started_at: '2026-08-24T00:00:0' + index + '.000Z',
      ended_at: '2026-08-24T00:00:0' + (index + 1) + '.000Z',
      elapsed_sec: 1,
      timeout_sec: 1,
      cost_admission: {
        phase: admission.phase,
        evaluated_at_utc: admission.evaluated_at_utc,
        deadline_utc: deadline,
        policy_hash: admission.policy_hash,
      },
    }
  })
  const nativeUsage = summarizeNativeUsage(events, { strict: true })
  if (!nativeUsage.coverage_complete) throw new Error('synthetic fixture must have complete native usage coverage')
  return {
    schema: 'dsh-researcher/goal-governor-e1/budget-evidence/v2',
    limits: {
      max_tokens: manifest.budget.max_tokens,
      max_cache_read_tokens: manifest.budget.max_cache_read_tokens,
      max_request_attempts: manifest.budget.max_request_attempts,
      max_time_sec: manifest.budget.max_time_sec,
    },
    outer_monotonic: {
      source: 'process.hrtime.bigint',
      processes,
      elapsed_sec: processes.length,
      within_limit: true,
    },
    host_folded_usage: {
      source: 'host-folded-goal-events/usage_recorded',
      cumulative_tokens: nativeUsage.cumulative_tokens,
      elapsed_sec: 0,
    },
  }
}

const outerFinalization = (stage, verifier, budget, expectedExit) => ({
  schema: 'dsh-researcher/goal-governor-e1/outer-finalization/v1',
  finalized: true,
  stage,
  expected_host_verifier_exit: expectedExit,
  dsh_child: { exit_code: 0, signal: null, timed_out: false, error: null },
  host_verifier: {
    actual_exit_code: verifier.exit_code,
    integrity_ok: verifier.integrity.ok,
    workspace_unchanged: verifier.workspace.unchanged,
    timed_out: verifier.timed_out,
    spawn_error: verifier.spawn_error,
  },
  budget: {
    wall_elapsed_sec: budget.outer_monotonic.elapsed_sec,
    wall_within_limit: budget.outer_monotonic.within_limit,
    cumulative_tokens: budget.host_folded_usage.cumulative_tokens,
    folded_elapsed_sec: budget.host_folded_usage.elapsed_sec,
    token_within_limit: budget.host_folded_usage.cumulative_tokens < budget.limits.max_tokens,
    event_time_within_limit: budget.host_folded_usage.elapsed_sec < budget.limits.max_time_sec,
  },
  errors: [],
})

const makeManifest = () => {
  const manifest = {
    schema: MANIFEST_SCHEMA,
    protocol: 'docs/goal-governor-evaluation-protocol.md',
    protocol_version: '1.12',
    status: { infrastructure: 'READY', live_e1: 'STOPPED', outcome: 'NOT_PROVEN', portability: 'NOT_PROVEN' },
    runtime: {
      client: 'dsh', version: '0.1.1-rc.2', profile: 'headless', preset: 'governed', permission_mode: 'workspace-write',
      session_persistence: 'jsonl', pack_chunks: false, compression: 'none',
      title_llm: false, model_compaction: false, tool_result_pruning: true, extra_local_tools: false, goal_round_driver: 'runner-disarmed',
    },
    cost_policy: JSON.parse(JSON.stringify(SYNTHETIC_COST_POLICY)),
    budget: { max_tokens: 250000, max_cache_read_tokens: 220000, max_request_attempts: 24, max_time_sec: 900, same_for_all_cases: true },
    fixture: { template: 'fixtures/goal-governor-e1/template', materializer: 'fixtures/goal-governor-e1/materialize.js', t0_revision: 'e1-fixture-t0-v1' },
    trusted_verifier: { tool_name: 'e1_verify', arguments: {}, source: TRUSTED_VERIFIER_SOURCE, sha256: TRUSTED_VERIFIER_SHA256 },
    visible_tool_contract: JSON.parse(JSON.stringify(VISIBLE_TOOL_POLICY)),
    attempt_ledger: {
      path: 'attempt-ledger.jsonl',
      mode: 'append-only-hash-chain',
      receipt_schema: 'dsh-researcher/goal-governor-e1/attempt-receipt/v1',
      terminal_statuses: ['FINALIZED', 'FAILED'],
      incomplete_policy: 'unresolved-started-is-invalid',
    },
    cases: CASE_PROTOCOL.map((item) => ({
      id: item.id,
      artifact: item.id + '/artifact.json',
      expected_terminal: item.expected_terminal,
      contract: '.project-cognition/goals/e1-' + item.id + '.r1.json',
      prompts: { initial: 'evaluation/goal-governor-e1/prompts/' + item.id + '.txt' },
      allowed_changes: ['already-satisfied', 'forged-evidence'].includes(item.id) ? [] : ['src/task.js'],
      baseline_exit: ['already-satisfied', 'forged-evidence'].includes(item.id) ? 0 : 1,
      final_verifier_exit: item.id === 'no-progress' ? 1 : 0,
    })),
    artifacts: { schema: RUN_SCHEMA, required_raw_fields: [...REQUIRED_RAW_FIELDS], retention: 'preserve-success-and-failure-bundles' },
    invalidity_rules: [...INVALIDITY_RULES],
    replay_semantics: {
      prefix_checkpoint: 'prefix-before-exit-equals-resumed-state-before-followup',
      final_checkpoint: 'final-live-fold-equals-offline-full-replay',
      event_array_comparison: 'do-not-compare-post-resume-full-event-arrays',
      compare: [...REPLAY_COMPARE_FIELDS],
    },
    lock_inputs: ['evaluation/frozen-input.txt'],
  }
  for (const item of manifest.cases) {
    const { goal, registry, state } = foundation(item.id, manifest, { humanGate: item.id === 'governed-gate' })
    Object.assign(item, {
      fixture_tree_sha256: worktree(false, item.allowed_changes).before_tree_sha256,
      contract_hash: goal.contract_hash,
      registry_hash: registry.registry_hash,
      cognition_hash: state.state_hash,
    })
  }
  return manifest
}

const makeRunLock = (manifest, manifestSha256) => {
  const lock = {
    schema: RUN_LOCK_SCHEMA,
    manifest_sha256: manifestSha256,
    inputs: {
      'evaluation/frozen-input.txt': digest('frozen-input'),
      [TRUSTED_VERIFIER_SOURCE]: TRUSTED_VERIFIER_SHA256,
    },
    candidate: {
      repo_revision: digest('candidate-revision'),
      package_name: '@tlning260310/dsh-researcher',
      package_path: 'dist/dsh-researcher-test.tgz',
      package_sha256: digest('candidate-package'),
      package_version: '0.0.0-e1-test',
    },
    runtime: JSON.parse(JSON.stringify(manifest.runtime)),
    cost_policy: JSON.parse(JSON.stringify(manifest.cost_policy)),
    model: {
      route: 'local-loopback',
      provider: 'deepseek-official',
      model: 'deterministic',
      reasoning_effort: 'fixture',
      base_url: 'http://127.0.0.1:11434/v1',
    },
    budget: {
      max_tokens: manifest.budget.max_tokens,
      max_cache_read_tokens: manifest.budget.max_cache_read_tokens,
      max_request_attempts: manifest.budget.max_request_attempts,
      max_time_sec: manifest.budget.max_time_sec,
    },
    host_runtime: {
      node: { version: 'v24.9.0', platform: 'win32', arch: 'x64', executable_sha256: digest('node-executable') },
      dsh: {
        package_name: '@deepseek-ai/dsh',
        package_version: '0.1.1-rc.2',
        package_json_sha256: digest('dsh-package-json'),
        cli_relative: 'dist/cli.js',
        cli_sha256: digest('dsh-cli'),
        dependency_inventory_sha256: hashCanonical(SYNTHETIC_DSH_DEPENDENCIES),
        dependencies: JSON.parse(JSON.stringify(SYNTHETIC_DSH_DEPENDENCIES)),
      },
      environment: { policy: 'sanitized-node-spawn-environment/v1', removed_names: [...NODE_ENV_DENYLIST] },
    },
    dsh_home_policy: { mode: 'fresh-empty-per-case', initial_inventory_sha256: hashCanonical([]), initial_file_count: 0 },
    visible_tool_contract: JSON.parse(JSON.stringify(SYNTHETIC_VISIBLE_TOOL_CONTRACT)),
  }
  lock.lock_hash = hashCanonical(lock)
  return lock
}

const artifactFor = (caseId, manifest, runLock) => {
  const manifestCase = manifest.cases.find((item) => item.id === caseId)
  const humanGate = caseId === 'governed-gate'
  const { goal, registry, state } = foundation(caseId, manifest, { humanGate })
  const runtimeGoalId = 'runtime-' + caseId
  const b = eventBuilder(runtimeGoalId)
  let changed = false

  if (caseId === 'already-satisfied') {
    const evidence = b.verify(0)
    b.attempt('baseline', true, 'pass', 'tool:' + evidence)
    b.decide()
    b.host('complete')
  }

  if (caseId === 'simple-done' || caseId === 'resume-replay') {
    const failing = b.verify(1)
    b.attempt('baseline', true, 'fail', 'tool:' + failing)
    const passing = b.verify(0)
    b.attempt('change-1', false, 'pass', 'tool:' + passing)
    b.decide()
    b.host('complete')
    changed = true
  }

  if (caseId === 'governed-gate') {
    const failing = b.verify(1)
    b.attempt('baseline', true, 'fail', 'tool:' + failing)
    const passing = b.verify(0)
    b.attempt('change-1', false, 'pass', 'tool:' + passing)
    b.decide()
    b.host('pause', 'paused')
    b.add('runner/stdin', {
      input_id: 'stdin-H1',
      command: 'approve-gate H1 review-42',
      actor: 'external-interactive-tty-input',
      evidence: {
        kind: 'interactive-tty-input',
        stdin_is_tty: true,
        stdout_is_tty: true,
        identity_assurance: 'not-cryptographic-human-identity',
      },
    })
    b.add('command/run', {
      commandId: 'command-H1', name: 'researcher', args: 'approve-gate H1 review-42', source: { kind: 'user' },
    })
    b.host('resume', 'active')
    b.add('command/done', { commandId: 'command-H1', name: 'researcher' })
    b.add('runner/command-link', { input_id: 'stdin-H1', commandId: 'command-H1' })
    b.decide()
    b.host('complete')
    changed = true
  }

  if (caseId === 'forged-evidence') {
    b.attempt('baseline', true, 'pass', 'tool:forged-call-id')
    b.decide()
    b.host('pause', 'paused')
  }

  if (caseId === 'no-progress') {
    for (const [attemptId, baseline] of [['baseline', true], ['change-1', false], ['change-2', false]]) {
      const evidence = b.verify(1)
      b.attempt(attemptId, baseline, 'fail', 'tool:' + evidence)
    }
    b.decide()
    b.host('block', 'blocked', 'stopped')
  }

  const worktreeEvidence = worktree(changed, manifestCase.allowed_changes)
  const finalVerifier = hostVerifier(worktreeEvidence.after_tree_sha256, manifestCase.final_verifier_exit)
  const finalCostAdmissions = costAdmissions(runLock, caseId === 'resume-replay' ? 'continue' : 'full')
  const finalBudget = budgetEvidence(caseId, manifest, b.events, runLock)
  const artifact = {
    schema: RUN_SCHEMA,
    case_id: caseId,
    session_id: 'session-' + caseId,
    runtime_goal_id: runtimeGoalId,
    run_lock: JSON.parse(JSON.stringify(runLock)),
    cost_admissions: finalCostAdmissions,
    fixture_baseline: {
      case_id: caseId,
      t0_revision: manifest.fixture.t0_revision,
      content_tree_sha256: worktreeEvidence.before_tree_sha256,
      pre_tree_sha256: worktreeEvidence.before_tree_sha256,
    },
    cognition_state: state,
    goal_contract: goal,
    verifier_registry: registry,
    session_events: b.events,
    visible_tools: [...EXACT_VISIBLE_TOOL_NAMES],
    visible_tool_schemas: JSON.parse(JSON.stringify(SYNTHETIC_VISIBLE_TOOL_SCHEMAS)),
    visible_tool_contract_hash: SYNTHETIC_VISIBLE_TOOL_CONTRACT.schema_hash,
    worktree: worktreeEvidence,
    replay_checkpoints: {},
    host_verifier: finalVerifier,
    budget_evidence: finalBudget,
    runner_exit_code: 0,
    runner_signal: null,
    runner_timed_out: false,
    runner_error: null,
    runtime_provenance: {
      schema: 'dsh-researcher/goal-governor-e1/runtime-provenance/v1',
      node: JSON.parse(JSON.stringify(runLock.host_runtime.node)),
      dsh: JSON.parse(JSON.stringify(runLock.host_runtime.dsh)),
      invocation: { runtime: 'node', argv_prefix: ['dist/cli.js'] },
      environment: {
        policy: 'sanitized-node-spawn-environment/v1',
        denied_names: [...NODE_ENV_DENYLIST],
        removed_present_names: [],
      },
      dsh_home: {
        before: { schema: 'dsh-researcher/goal-governor-e1/directory-inventory/v1', files: [], inventory_sha256: runLock.dsh_home_policy.initial_inventory_sha256, file_count: 0 },
        after: { schema: 'dsh-researcher/goal-governor-e1/directory-inventory/v1', files: [], inventory_sha256: runLock.dsh_home_policy.initial_inventory_sha256, file_count: 0 },
      },
      session_persistence: { kind: 'jsonl', pack_chunks: false, compression: 'none' },
      auxiliary_model_policy: { title_llm: false, model_compaction: false, tool_result_pruning: true, extra_local_tools: false },
      trajectory_control: { goal_activation: 'disarmed', followups: 'runner-authored' },
      model_route: {
        schema: 'dsh-researcher/goal-governor-e1/model-route-provenance/v1',
        route: runLock.model.route,
        provider: runLock.model.provider,
        model: runLock.model.model,
        reasoning_effort: runLock.model.reasoning_effort,
        base_url: runLock.model.base_url,
        settings_watch: false,
        checks: [
          'before-agent', 'after-agent-idle', 'before-model-followup', 'after-model-followup',
          ...(caseId === 'governed-gate' ? ['before-governed-gate-followup', 'after-governed-gate-followup'] : []),
        ].map((phase) => ({
          phase,
          settings_namespace: 'llm-deepseek',
          resolved_base_url: runLock.model.base_url,
          launch_base_url: runLock.model.base_url,
          launch_source: 'process',
        })),
      },
      frozen_settings: {
        schema: 'dsh-researcher/goal-governor-e1/frozen-settings/v1',
        watch: false,
        sha256: crypto.createHash('sha256').update(Buffer.from(JSON.stringify({
          'agent-default-model': { provider: runLock.model.provider, model: runLock.model.model, reasoningEffort: runLock.model.reasoning_effort },
          'llm-deepseek': { baseURL: runLock.model.base_url },
        }, null, 2) + '\n')).digest('hex'),
      },
    },
    attempt_identity: {
      ledger: 'attempt-ledger.jsonl',
      attempt_id: 'attempt-' + caseId + '-' + (caseId === 'resume-replay' ? 'continue' : 'full'),
      case_id: caseId,
      stage: caseId === 'resume-replay' ? 'continue' : 'full',
      run_lock_hash: runLock.lock_hash,
      start_sequence: caseId === 'resume-replay' ? 2 : 0,
      start_receipt_hash: digest('attempt-start-' + caseId),
    },
    outer_finalization: outerFinalization(caseId === 'resume-replay' ? 'continue' : 'full', finalVerifier, finalBudget, manifestCase.final_verifier_exit),
    outer_finalized: true,
  }

  if (caseId === 'resume-replay') {
    const stageOneObservation = b.events.find((event) => {
      if (event.type !== 'tool/call' || event.data.name !== 'submit_goal_observation') return false
      return JSON.parse(event.data.arguments).attempt_id === 'baseline'
    })
    const boundary = stageOneObservation.seq
    for (const event of b.events) if (event.seq > boundary) event.seq++
    b.events.push({
      seq: boundary + 1,
      type: 'runner/resume',
      data: { session_id: artifact.session_id, resumed: true },
    })
    b.events.sort((left, right) => left.seq - right.seq)

    const prefixReplay = foldDshGoalEvents(goal, registry, b.events.filter((event) => event.seq <= boundary))
    const prefixCheckpoint = {
      session_id: artifact.session_id,
      goal_id: goal.goal_id,
      runtime_goal_id: runtimeGoalId,
      contract_hash: goal.contract_hash,
      state_hash: hashCanonical(prefixReplay.events),
      diagnostics_hash: hashCanonical(prefixReplay.diagnostics),
      decision: prefixReplay.decision.decision,
    }
    const replay = foldDshGoalEvents(goal, registry, b.events)
    const checkpoint = {
      session_id: artifact.session_id,
      goal_id: goal.goal_id,
      runtime_goal_id: runtimeGoalId,
      contract_hash: goal.contract_hash,
      state_hash: hashCanonical(replay.events),
      diagnostics_hash: hashCanonical(replay.diagnostics),
      decision: replay.decision.decision,
    }
    artifact.replay_checkpoints = {
      resume_after_sequence: boundary,
      prefix_live: { ...prefixCheckpoint },
      resume_before_followup: { ...prefixCheckpoint },
      stage1_seal_sha256: digest('synthetic-stage1-seal'),
      stage1_boundary: { session_id: artifact.session_id, resume_after_sequence: boundary },
      live: { ...checkpoint },
      replayed: { ...checkpoint },
    }
    artifact.stage1_seal_sha256 = artifact.replay_checkpoints.stage1_seal_sha256
  } else {
    const replay = foldDshGoalEvents(goal, registry, b.events)
    const checkpoint = {
      session_id: artifact.session_id,
      goal_id: goal.goal_id,
      runtime_goal_id: runtimeGoalId,
      contract_hash: goal.contract_hash,
      state_hash: hashCanonical(replay.events),
      diagnostics_hash: hashCanonical(replay.diagnostics),
      decision: replay.decision.decision,
    }
    artifact.replay_checkpoints = { live: { ...checkpoint }, replayed: { ...checkpoint } }
  }
  return artifact
}

const trustedBundle = () => {
  const manifest = makeManifest()
  const manifest_sha256 = manifestDigest(manifest)
  const runLock = makeRunLock(manifest, manifest_sha256)
  const artifacts = Object.fromEntries(CASE_PROTOCOL.map((item) => [item.id, artifactFor(item.id, manifest, runLock)]))
  return { manifest, manifest_sha256, artifacts }
}

const cloneBundle = () => JSON.parse(JSON.stringify(trustedBundle()))
const refreshFinalReplay = (artifact) => {
  const replay = foldDshGoalEvents(artifact.goal_contract, artifact.verifier_registry, artifact.session_events)
  const checkpoint = {
    session_id: artifact.session_id,
    goal_id: artifact.goal_contract.goal_id,
    runtime_goal_id: artifact.runtime_goal_id,
    contract_hash: artifact.goal_contract.contract_hash,
    state_hash: hashCanonical(replay.events),
    diagnostics_hash: hashCanonical(replay.diagnostics),
    decision: replay.decision.decision,
  }
  artifact.replay_checkpoints.live = { ...checkpoint }
  artifact.replay_checkpoints.replayed = { ...checkpoint }
  return artifact
}
const scoreTrustedBundle = (bundle) => scoreBundle(bundle.manifest, bundle.artifacts, {
  manifest_sha256: bundle.manifest_sha256,
  synthetic: true,
})

module.exports = {
  trustedBundle,
  cloneBundle,
  refreshFinalReplay,
  artifactFor,
  costAdmissions,
  scoreTrustedBundle,
  manifestDigest,
  snapshotTreeHash,
}
