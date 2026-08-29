'use strict'

// Host-owned seal for the resume-replay process boundary. It binds every
// stage-one evidence file and the exact workspace content that stage two must
// resume. This module is pure filesystem/hash logic and never starts DSH.
const fs = require('node:fs')
const path = require('node:path')
const { canonicalize, readJson, sha256File, snapshotTree, treeHash } = require('./lib.js')
const { directoryInventory } = require('./runtime-provenance.js')

const STAGE1_SEAL_SCHEMA = 'dsh-researcher/goal-governor-e1/stage1-seal/v1'
const STAGE1_FILES = Object.freeze([
  'resume-token.json',
  'session.stage1.jsonl',
  'session.stage1.events.json',
  'resume-stage1.json',
  'immutable-inputs.json',
  'stage1/post/git-status.txt',
  'stage1/post/diff.patch',
  'stage1/post/tree-hash.txt',
  'stage1/post/worktree.json',
  'stage1/post/verifier.json',
  'stage1/post/dsh-home-inventory.json',
])

const workspaceSnapshot = (workspace) => snapshotTree(workspace, { exclude: ['.git', 'materialization.json'] })
const sealPath = (caseDir) => path.join(caseDir, 'stage1', 'seal.json')
const absoluteEvidence = (caseDir, relative) => path.join(caseDir, ...relative.split('/'))

const createStage1Seal = ({ caseDir, runLockHash, contractHash }) => {
  const token = readJson(path.join(caseDir, 'resume-token.json'))
  if (token.run_lock_hash !== runLockHash || token.contract_hash !== contractHash) throw new Error('stage-one token identity differs from the requested seal identity')
  const files = {}
  for (const relative of STAGE1_FILES) {
    const file = absoluteEvidence(caseDir, relative)
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error('stage-one evidence is missing: ' + relative)
    files[relative] = sha256File(file)
  }
  const seal = {
    schema: STAGE1_SEAL_SCHEMA,
    case_id: 'resume-replay',
    run_lock_hash: runLockHash,
    contract_hash: contractHash,
    session_id: token.session_id,
    resume_after_sequence: token.resume_after_sequence,
    files,
  }
  const output = sealPath(caseDir)
  if (fs.existsSync(output)) throw new Error('refusing to overwrite an existing stage-one seal')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, JSON.stringify(seal, null, 2) + '\n', { flag: 'wx' })
  return { seal, seal_sha256: sha256File(output) }
}

const validateStage1Seal = ({ caseDir, workspace, dshHome, dshModuleRoot, runLockHash, contractHash, sessionId, expectedVerifierExit }) => {
  if (![0, 1].includes(expectedVerifierExit)) throw new Error('stage-one expected verifier exit must be frozen as 0 or 1')
  const file = sealPath(caseDir)
  if (!fs.existsSync(file)) throw new Error('resume continuation requires stage1/seal.json')
  const seal = readJson(file)
  const keys = Object.keys(seal).sort()
  const expectedKeys = ['schema', 'case_id', 'run_lock_hash', 'contract_hash', 'session_id', 'resume_after_sequence', 'files'].sort()
  if (canonicalize(keys) !== canonicalize(expectedKeys) || seal.schema !== STAGE1_SEAL_SCHEMA || seal.case_id !== 'resume-replay') throw new Error('stage-one seal envelope drifted')
  if (seal.run_lock_hash !== runLockHash || seal.contract_hash !== contractHash || seal.session_id !== sessionId) throw new Error('stage-one seal identity drifted')
  if (!Number.isFinite(seal.resume_after_sequence) || seal.resume_after_sequence < 1) throw new Error('stage-one seal resume boundary is invalid')
  if (canonicalize(Object.keys(seal.files)) !== canonicalize(STAGE1_FILES)) throw new Error('stage-one seal file set drifted')
  for (const relative of STAGE1_FILES) {
    const expected = seal.files[relative]
    if (!/^[a-f0-9]{64}$/.test(String(expected || '')) || sha256File(absoluteEvidence(caseDir, relative)) !== expected) throw new Error('stage-one sealed file drifted: ' + relative)
  }
  const token = readJson(path.join(caseDir, 'resume-token.json'))
  if (token.session_id !== seal.session_id || token.run_lock_hash !== seal.run_lock_hash || token.contract_hash !== seal.contract_hash || token.resume_after_sequence !== seal.resume_after_sequence) throw new Error('stage-one token differs from its seal')
  const stageArtifact = readJson(path.join(caseDir, 'resume-stage1.json'))
  if (stageArtifact.session_id !== seal.session_id || stageArtifact.case_id !== 'resume-replay') throw new Error('stage-one artifact identity differs from its seal')
  if (stageArtifact.outer_finalized !== true || stageArtifact.outer_finalization?.finalized !== true || stageArtifact.runner_exit_code !== 0 || stageArtifact.runner_signal !== null || stageArtifact.runner_timed_out !== false || stageArtifact.runner_error !== null) throw new Error('stage-one artifact was not successfully outer-finalized')
  const post = readJson(path.join(caseDir, 'stage1', 'post', 'worktree.json'))
  const recordedTreeHash = fs.readFileSync(path.join(caseDir, 'stage1', 'post', 'tree-hash.txt'), 'utf8').trim()
  if (treeHash(post) !== recordedTreeHash) throw new Error('stage-one post worktree hash is internally inconsistent')
  const verifier = readJson(path.join(caseDir, 'stage1', 'post', 'verifier.json'))
  if (verifier.schema !== 'dsh-researcher/goal-governor-e1/external-verifier-result/v1' || verifier.exit_code !== expectedVerifierExit || verifier.integrity?.ok !== true || verifier.workspace?.unchanged !== true || verifier.workspace.after_tree_sha256 !== recordedTreeHash) throw new Error('stage-one host verifier result is invalid')
  if (canonicalize(stageArtifact.host_verifier) !== canonicalize(verifier) || stageArtifact.outer_finalization.expected_host_verifier_exit !== expectedVerifierExit) throw new Error('stage-one artifact does not bind its sealed host verifier result')
  const dshHomeInventory = readJson(path.join(caseDir, 'stage1', 'post', 'dsh-home-inventory.json'))
  if (!dshHome || canonicalize(directoryInventory(dshHome, { allowedLinkRoot: dshModuleRoot })) !== canonicalize(dshHomeInventory)) throw new Error('current DSH_HOME is not byte-identical to the sealed stage-one inventory')
  const current = workspaceSnapshot(workspace)
  if (canonicalize(current) !== canonicalize(post)) throw new Error('current workspace is not byte-identical to the sealed stage-one post worktree')
  return {
    seal,
    seal_sha256: sha256File(file),
    post_worktree: post,
    post_tree_sha256: recordedTreeHash,
    expected_git_status: fs.readFileSync(path.join(caseDir, 'stage1', 'post', 'git-status.txt'), 'utf8'),
    expected_diff: fs.readFileSync(path.join(caseDir, 'stage1', 'post', 'diff.patch'), 'utf8'),
    dsh_home_inventory: dshHomeInventory,
  }
}

module.exports = { STAGE1_SEAL_SCHEMA, STAGE1_FILES, createStage1Seal, validateStage1Seal, workspaceSnapshot }
