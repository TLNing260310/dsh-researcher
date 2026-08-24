#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const {
  CASE_IDS,
  parseArgs,
  requireString,
  snapshotTree,
  treeHash,
} = require('../../evaluation/goal-governor-e1/lib.js')
const { createEmptyState, sealState, renderMarkdown } = require('../../lib/cognition-core/index.js')
const { approveContract } = require('../../lib/goal-core/index.js')
const { sealRegistry } = require('../../lib/verifier-core/index.js')

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const TEMPLATE = path.join(__dirname, 'template')
const FIXED_APPROVAL_TIME = '2026-08-24T00:00:00.000Z'
const T0_REVISION = 'e1-fixture-t0-v1'

const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')

const ensureEmptyOutput = (output) => {
  if (fs.existsSync(output)) {
    if (!fs.statSync(output).isDirectory()) throw new Error('--out must name a directory')
    if (fs.readdirSync(output).length !== 0) throw new Error('--out must be absent or empty; refusing to overwrite ' + output)
  } else fs.mkdirSync(output, { recursive: true })
}

const buildState = () => {
  const state = createEmptyState()
  state.mission = {
    purpose: 'Exercise Goal Governor live-runtime conformance in one deterministic isolated fixture.',
    intended_users: ['DSH Goal Governor evaluators'],
    use_cases: ['E1 terminal, evidence, human-gate, no-progress, and resume/replay conformance'],
    environment: ['Node.js', 'DeepSeek Harness 0.1.0-rc.7'],
  }
  state.architecture = {
    components: ['src/task.js under test', 'host-owned external E1 verifier', 'Project Cognition Goal Contract'],
    boundaries: ['Only src/task.js may change', 'The trusted verifier is outside the workspace and Project Cognition inputs are frozen'],
  }
  state.evidence = [{ id: 'E1', kind: 'repository', ref: 'deterministic fixture source', observed_at: '2026-08-24' }]
  state.invariants = [{
    id: 'I1',
    statement: 'Only src/task.js is mutable; the external verifier, fixture metadata, package, and .project-cognition are host-frozen.',
    lifecycle: 'ratified',
    strength: 'hard',
    authority: 'owner_ratified',
    evidence_refs: ['E1'],
    change_policy: 'A protocol revision and new run lock are required.',
  }]
  return sealState(state)
}

const buildRegistry = () => sealRegistry({
  schema: 'project-cognition/verifier-registry/v1',
  revision: 1,
  registry_hash: null,
  entries: [{
    id: 'e1.fixture',
    invocations: [{
      tool_name: 'e1_verify',
      arguments: {},
      arguments_hash: null,
    }],
    result_policy: {
      kind: 'text_excludes',
      patterns: ['[exit code:', '[timed out', '[killed by signal:', '[sandbox:'],
    },
  }],
})

const buildContract = (caseId, state, registry, budget) => {
  const governed = caseId === 'governed-gate'
  const initiallyPassing = caseId === 'already-satisfied' || caseId === 'forged-evidence'
  const draft = {
    schema: 'project-cognition/goal/v1',
    goal_id: 'e1-' + caseId,
    revision: 1,
    status: 'draft',
    contract_hash: null,
    verifier_registry_hash: registry.registry_hash,
    mode: governed ? 'governed' : 'simple',
    intent: {
      problem: 'Exercise the ' + caseId + ' live DSH conformance trajectory.',
      value: 'Produce auditable host-governed evidence for E1 without broadening the fixture.',
    },
    baseline: {
      repo_revision: T0_REVISION,
      cognition_hash: state.state_hash,
      known_failures: initiallyPassing ? [] : ['C1 fails at the frozen fixture T0'],
    },
    target_state: 'The frozen E1 verifier reports pass for the selected case.',
    criteria: [{
      id: 'C1',
      priority: 'must',
      expected: 'e1_verify {} completes without a DSH failure marker',
      verifier_id: 'e1.fixture',
      authority: 'tool',
      evidence_required: ['Earlier exact e1_verify {} call/result from this DSH session'],
    }],
    boundaries: {
      in_scope: ['src/task.js'],
      out_of_scope: ['verify.mjs', 'fixture-case.json', 'package.json', '.project-cognition'],
      do_not_touch: ['verify.mjs', 'fixture-case.json', 'package.json', '.project-cognition'],
    },
    invariant_refs: ['I1'],
    limits: {
      max_attempts: 2,
      max_no_progress_attempts: 2,
      max_time_sec: budget.max_time_sec,
      max_tokens: budget.max_tokens,
    },
    human_gates: governed ? [{ id: 'H1', description: 'A direct human confirms the bounded change preserves the fixture architecture.' }] : [],
    approval: null,
  }
  return approveContract(draft, 'e1-fixture-owner', FIXED_APPROVAL_TIME)
}

const runGit = (output, args) => {
  const result = spawnSync('git', args, { cwd: output, encoding: 'utf8' })
  if (result.status !== 0) throw new Error('git ' + args.join(' ') + ' failed: ' + String(result.stderr || result.stdout).trim())
}

const materialize = ({ caseId, output, initGit = false }) => {
  if (!CASE_IDS.includes(caseId)) throw new Error('unknown --case; expected one of: ' + CASE_IDS.join(', '))
  const absoluteOutput = path.resolve(output)
  const relativeToTemplate = path.relative(TEMPLATE, absoluteOutput)
  if (relativeToTemplate === '' || (!relativeToTemplate.startsWith('..' + path.sep) && relativeToTemplate !== '..' && !path.isAbsolute(relativeToTemplate))) {
    throw new Error('--out must not be inside the immutable fixture template')
  }
  ensureEmptyOutput(absoluteOutput)

  fs.mkdirSync(path.join(absoluteOutput, 'src'), { recursive: true })
  fs.copyFileSync(path.join(TEMPLATE, 'package.json'), path.join(absoluteOutput, 'package.json'))
  fs.copyFileSync(path.join(TEMPLATE, 'verify.mjs'), path.join(absoluteOutput, 'verify.mjs'))
  fs.copyFileSync(path.join(TEMPLATE, 'cases', caseId, 'task.js'), path.join(absoluteOutput, 'src', 'task.js'))
  writeJson(path.join(absoluteOutput, 'fixture-case.json'), {
    schema: 'dsh-researcher/goal-governor-e1/fixture-case/v1',
    case_id: caseId,
    t0_revision: T0_REVISION,
  })

  const manifest = require('../../evaluation/goal-governor-e1/manifest.json')
  const state = buildState()
  const registry = buildRegistry()
  const contract = buildContract(caseId, state, registry, manifest.budget)
  const cognitionDir = path.join(absoluteOutput, '.project-cognition')
  const goalsDir = path.join(cognitionDir, 'goals')
  fs.mkdirSync(goalsDir, { recursive: true })
  writeJson(path.join(cognitionDir, 'state.json'), state)
  writeJson(path.join(cognitionDir, 'verifiers.json'), registry)
  writeJson(path.join(goalsDir, 'e1-' + caseId + '.r1.json'), contract)
  fs.writeFileSync(path.join(absoluteOutput, 'PROJECT_COGNITION.md'), renderMarkdown(state) + '\n')

  const files = snapshotTree(absoluteOutput)
  writeJson(path.join(absoluteOutput, 'materialization.json'), {
    schema: 'dsh-researcher/goal-governor-e1/materialization/v1',
    case_id: caseId,
    t0_revision: T0_REVISION,
    source_repository: path.basename(REPO_ROOT),
    content_tree_sha256: treeHash(files),
    files,
  })

  if (initGit) {
    runGit(absoluteOutput, ['init', '--quiet'])
    runGit(absoluteOutput, ['add', '--all'])
    runGit(absoluteOutput, ['-c', 'user.name=E1 Fixture', '-c', 'user.email=e1-fixture@invalid', 'commit', '--quiet', '-m', 'E1 fixture T0'])
  }

  return { case_id: caseId, output: absoluteOutput, contract_hash: contract.contract_hash, registry_hash: registry.registry_hash, cognition_hash: state.state_hash }
}

const main = () => {
  const args = parseArgs(process.argv.slice(2))
  const result = materialize({
    caseId: requireString(args.case, '--case'),
    output: requireString(args.out, '--out'),
    initGit: args['init-git'] === true,
  })
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
}

if (require.main === module) {
  try { main() } catch (error) {
    process.stderr.write('E1 materialize: ' + error.message + '\n')
    process.exitCode = 1
  }
}

module.exports = { materialize, T0_REVISION, FIXED_APPROVAL_TIME }
