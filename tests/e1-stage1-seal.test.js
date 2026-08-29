'use strict'

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { treeHash } = require('../evaluation/goal-governor-e1/lib.js')
const { directoryInventory } = require('../evaluation/goal-governor-e1/runtime-provenance.js')
const {
  createStage1Seal,
  validateStage1Seal,
  workspaceSnapshot,
} = require('../evaluation/goal-governor-e1/stage1-seal.js')

const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
}

test('resume stage-one seal accepts the manifest-frozen passing verifier exit', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-e1-stage1-pass-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const caseDir = path.join(root, 'case')
  const workspace = path.join(root, 'workspace')
  const dshHome = path.join(root, 'dsh-home')
  fs.mkdirSync(workspace)
  fs.mkdirSync(dshHome)
  fs.writeFileSync(path.join(workspace, 'task.js'), 'module.exports = true\n')

  const sessionId = 'session-stage1-pass'
  const runLockHash = 'a'.repeat(64)
  const contractHash = 'b'.repeat(64)
  const post = workspaceSnapshot(workspace)
  const postHash = treeHash(post)
  const verifier = {
    schema: 'dsh-researcher/goal-governor-e1/external-verifier-result/v1',
    exit_code: 0,
    integrity: { ok: true, errors: [] },
    workspace: { unchanged: true, after_tree_sha256: postHash },
  }

  writeJson(path.join(caseDir, 'resume-token.json'), {
    session_id: sessionId,
    run_lock_hash: runLockHash,
    contract_hash: contractHash,
    resume_after_sequence: 2,
  })
  fs.writeFileSync(path.join(caseDir, 'session.stage1.jsonl'), '{"type":"session"}\n')
  writeJson(path.join(caseDir, 'session.stage1.events.json'), [{ seq: 1, type: 'session/created' }])
  writeJson(path.join(caseDir, 'resume-stage1.json'), {
    case_id: 'resume-replay',
    session_id: sessionId,
    runner_exit_code: 0,
    runner_signal: null,
    runner_timed_out: false,
    runner_error: null,
    host_verifier: verifier,
    outer_finalized: true,
    outer_finalization: { finalized: true, expected_host_verifier_exit: 0 },
  })
  writeJson(path.join(caseDir, 'immutable-inputs.json'), {})
  fs.mkdirSync(path.join(caseDir, 'stage1', 'post'), { recursive: true })
  fs.writeFileSync(path.join(caseDir, 'stage1', 'post', 'git-status.txt'), '')
  fs.writeFileSync(path.join(caseDir, 'stage1', 'post', 'diff.patch'), '')
  fs.writeFileSync(path.join(caseDir, 'stage1', 'post', 'tree-hash.txt'), postHash + '\n')
  writeJson(path.join(caseDir, 'stage1', 'post', 'worktree.json'), post)
  writeJson(path.join(caseDir, 'stage1', 'post', 'verifier.json'), verifier)
  writeJson(path.join(caseDir, 'stage1', 'post', 'dsh-home-inventory.json'), directoryInventory(dshHome))

  createStage1Seal({ caseDir, runLockHash, contractHash })
  const checked = validateStage1Seal({
    caseDir,
    workspace,
    dshHome,
    runLockHash,
    contractHash,
    sessionId,
    expectedVerifierExit: 0,
  })
  assert.equal(checked.post_tree_sha256, postHash)
  assert.throws(() => validateStage1Seal({
    caseDir,
    workspace,
    dshHome,
    runLockHash,
    contractHash,
    sessionId,
    expectedVerifierExit: 1,
  }), /host verifier result is invalid/)
})
