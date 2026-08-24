'use strict'

// Host-owned E1 verifier execution. The trusted program lives in the locked
// repository, outside the model-writable fixture. Both the DSH tool plugin and
// the outer runner use this exact implementation.
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { canonicalize, sha256File, snapshotTree, treeHash } = require('./lib.js')
const { NODE_ENV_DENYLIST, sanitizeNodeEnvironment, currentNodeProvenance, assertSameProvenance } = require('./runtime-provenance.js')

const EXTERNAL_VERIFIER_SCHEMA = 'dsh-researcher/goal-governor-e1/external-verifier-result/v1'
const TOOL_NAME = 'e1_verify'

const isWithin = (root, target) => {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
}

// Protocol worktree hashes exclude host materialization metadata so they are
// byte-identical to artifact.worktree.{before,after}. Immutable inventory
// below deliberately includes materialization.json as a separately protected
// input.
const workspaceTree = (workspace) => snapshotTree(workspace, { exclude: ['.git', 'materialization.json'] })
const fullWorkspaceTree = (workspace) => snapshotTree(workspace, { exclude: ['.git'] })

const immutableSnapshot = (workspace, allowedChanges) => {
  const allowed = new Set(allowedChanges)
  return fullWorkspaceTree(workspace).filter((entry) => !allowed.has(entry.path))
}

const toDigestMap = (entries) => Object.fromEntries(entries.map((entry) => [entry.path, entry.sha256]))

const runExternalVerifier = ({
  workspace,
  verifierPath,
  verifierSource,
  expectedVerifierSha256,
  expectedImmutableFiles,
  allowedChanges = ['src/task.js'],
  timeoutMs = 10000,
  expectedNodeProvenance = currentNodeProvenance(),
}) => {
  const root = path.resolve(workspace)
  const program = path.resolve(verifierPath)
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error('external verifier workspace is unavailable')
  if (!fs.existsSync(program) || !fs.statSync(program).isFile()) throw new Error('external verifier program is unavailable')
  if (isWithin(root, program)) throw new Error('trusted external verifier must be outside the model-writable workspace')
  if (!/^[a-f0-9]{64}$/.test(String(expectedVerifierSha256 || ''))) throw new Error('trusted external verifier hash is invalid')
  if (!expectedImmutableFiles || typeof expectedImmutableFiles !== 'object' || Array.isArray(expectedImmutableFiles)) throw new Error('expected immutable file map is required')

  const beforeTree = workspaceTree(root)
  const beforeImmutable = toDigestMap(immutableSnapshot(root, allowedChanges))
  const verifierBefore = sha256File(program)
  const integrityErrors = []
  const nodeProvenance = currentNodeProvenance()
  try { assertSameProvenance(nodeProvenance, expectedNodeProvenance, 'external verifier Node runtime') } catch (error) { integrityErrors.push(error.message) }
  if (verifierBefore !== expectedVerifierSha256) integrityErrors.push('external verifier hash differs from the run lock')
  if (canonicalize(beforeImmutable) !== canonicalize(expectedImmutableFiles)) integrityErrors.push('workspace immutable inputs differ from the host baseline')

  let execution = null
  const sanitized = sanitizeNodeEnvironment({ ...process.env, DSH_E1_VERIFIER_WORKSPACE: root })
  if (integrityErrors.length === 0) {
    execution = spawnSync(process.execPath, [program], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      timeout: timeoutMs,
      env: sanitized.env,
    })
  }

  const afterTree = workspaceTree(root)
  const afterImmutable = toDigestMap(immutableSnapshot(root, allowedChanges))
  const verifierAfter = sha256File(program)
  if (verifierAfter !== expectedVerifierSha256) integrityErrors.push('external verifier changed during execution')
  if (canonicalize(afterImmutable) !== canonicalize(expectedImmutableFiles)) integrityErrors.push('workspace immutable inputs changed during verifier execution')
  if (canonicalize(beforeTree) !== canonicalize(afterTree)) integrityErrors.push('external verifier modified the workspace')

  const timedOut = Boolean(execution && execution.error && execution.error.code === 'ETIMEDOUT')
  const spawnError = execution && execution.error ? { code: execution.error.code || 'SPAWN_ERROR', message: execution.error.message } : null
  const failureMarkers = []
  if (integrityErrors.length > 0) failureMarkers.push('[sandbox: ' + integrityErrors.join('; ') + ']')
  if (timedOut) failureMarkers.push('[timed out]')
  else if (execution && execution.status !== 0) failureMarkers.push('[exit code: ' + String(execution.status) + ']')
  else if (spawnError) failureMarkers.push('[sandbox: verifier spawn failed]')

  return {
    schema: EXTERNAL_VERIFIER_SCHEMA,
    tool_name: TOOL_NAME,
    arguments: {},
    command: { runtime: 'node', source: verifierSource, source_sha256: expectedVerifierSha256 },
    runtime: {
      node: nodeProvenance,
      expected_node: expectedNodeProvenance,
      matched: canonicalize(nodeProvenance) === canonicalize(expectedNodeProvenance),
      environment: {
        policy: 'sanitized-node-spawn-environment/v1',
        denied_names: [...NODE_ENV_DENYLIST],
        removed_present_names: sanitized.removed,
      },
    },
    verifier: {
      expected_sha256: expectedVerifierSha256,
      before_sha256: verifierBefore,
      after_sha256: verifierAfter,
      external_to_workspace: true,
    },
    exit_code: execution ? execution.status : null,
    signal: execution ? execution.signal || null : null,
    timed_out: timedOut,
    stdout: execution ? String(execution.stdout || '') : '',
    stderr: execution ? String(execution.stderr || '') : '',
    spawn_error: spawnError,
    integrity: { ok: integrityErrors.length === 0, errors: integrityErrors },
    immutable_inputs: {
      expected: expectedImmutableFiles,
      before: beforeImmutable,
      after: afterImmutable,
      unchanged: canonicalize(beforeImmutable) === canonicalize(afterImmutable),
    },
    workspace: {
      before_tree_sha256: treeHash(beforeTree),
      after_tree_sha256: treeHash(afterTree),
      unchanged: canonicalize(beforeTree) === canonicalize(afterTree),
    },
    failure_markers: failureMarkers,
  }
}

const renderToolResult = (result) => JSON.stringify(result) + (result.failure_markers.length > 0 ? '\n' + result.failure_markers.join('\n') : '')

module.exports = {
  EXTERNAL_VERIFIER_SCHEMA,
  TOOL_NAME,
  immutableSnapshot,
  runExternalVerifier,
  renderToolResult,
  workspaceTree,
}
