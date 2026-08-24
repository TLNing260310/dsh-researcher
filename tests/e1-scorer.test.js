'use strict'

const test = require('node:test')
const assert = require('node:assert')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const { CASE_PROTOCOL, deriveCausalStatus, scoreBundle } = require('../evaluation/goal-governor-e1/score-e1.js')
const { createStage1Seal } = require('../evaluation/goal-governor-e1/stage1-seal.js')
const { beginAttempt, finishAttempt } = require('../evaluation/goal-governor-e1/attempt-ledger.js')
const { sha256File } = require('../evaluation/goal-governor-e1/lib.js')
const { createAttestation } = require('../evaluation/goal-governor-e1/bundle-integrity.js')
const { trustedBundle, cloneBundle, scoreTrustedBundle, snapshotTreeHash } = require('./helpers/e1-fixtures.js')

test('synthetic E1 scorer passes six trajectory shapes without claiming live conformance', () => {
  const bundle = trustedBundle()
  const report = scoreTrustedBundle(bundle)
  assert.equal(Object.keys(report)[0], 'causal_validity')
  assert.equal(report.causal_validity.valid_for_live_conformance_claim, false)
  assert.equal(report.causal_validity.status, 'SYNTHETIC_ONLY')
  assert.equal(report.verdict, 'PASS')
  assert.equal(report.cases_expected, 6)
  assert.equal(report.cases_scored, 6)
  assert.equal(report.cases_passed, 6)
  assert.deepEqual(report.runs.map((run) => run.id), CASE_PROTOCOL.map((item) => item.id))
  assert.ok(report.runs.every((run) => run.verdict === 'PASS'))
})

test('the six trusted tracks expose the frozen attempt, gate, forgery, stop, and resume shapes', () => {
  const report = scoreTrustedBundle(trustedBundle())
  const byId = Object.fromEntries(report.runs.map((run) => [run.id, run]))

  assert.deepEqual(
    [byId['already-satisfied'].proof.trajectory.baseline_attempts, byId['already-satisfied'].proof.trajectory.change_attempts],
    [1, 0],
  )

  for (const id of ['simple-done', 'governed-gate', 'resume-replay']) {
    const shape = byId[id].proof.trajectory
    assert.equal(shape.baseline_attempts, 1)
    assert.equal(shape.must_pass_counts[0].passed, 0, id + ' baseline must fail')
    assert.ok(shape.change_attempts >= 1 && shape.change_attempts <= 2, id + ' must use one or two changes')
  }

  const gate = byId['governed-gate'].proof.governed_gate_order
  assert.ok(gate.pending_sequence < gate.approval_sequence)
  assert.ok(gate.approval_sequence < gate.resume_sequence)
  assert.ok(gate.resume_sequence < gate.final_sequence)

  const noProgress = byId['no-progress'].proof.trajectory
  assert.equal(noProgress.change_attempts, 2)
  assert.deepEqual(noProgress.must_pass_counts.map((item) => item.passed), [0, 0, 0])
  assert.equal(byId['forged-evidence'].proof.trajectory.host_complete_count, 0)

  const resume = byId['resume-replay'].proof.resume
  assert.equal(resume.session_id, 'session-resume-replay')
  assert.ok(resume.boundary_sequence < resume.resumed_sequence)
})

test('manifest omission makes the E1 package INVALID rather than a partial pass', () => {
  const bundle = cloneBundle()
  bundle.manifest.cases.pop()
  const report = scoreTrustedBundle(bundle)
  assert.equal(report.verdict, 'INVALID')
  assert.equal(report.causal_validity.valid_for_live_conformance_claim, false)
  assert.ok(report.causal_validity.reasons.some((reason) => /exactly 6|case IDs/.test(reason)))
})

test('causal status is verdict-aware and never labels complete FAIL evidence as trusted-host PASS', () => {
  assert.equal(deriveCausalStatus({ valid: true, verdict: 'FAIL', synthetic: false, signatureVerified: false }), 'FAIL_UNDER_TRUSTED_HOST')
  assert.equal(deriveCausalStatus({ valid: true, verdict: 'PASS', synthetic: false, signatureVerified: false }), 'PASS_UNDER_TRUSTED_HOST')
  assert.equal(deriveCausalStatus({ valid: true, verdict: 'PASS', synthetic: false, signatureVerified: true }), 'PASS_UNDER_TRUSTED_HOST_WITH_VERIFIED_BUNDLE_SIGNATURE')
  const bundle = cloneBundle()
  const run = bundle.artifacts['already-satisfied']
  const task = run.worktree.after.find((record) => record.path === 'src/task.js')
  task.sha256 = 'e'.repeat(64)
  run.worktree.after_tree_sha256 = snapshotTreeHash(run.worktree.after)
  run.host_verifier.workspace.before_tree_sha256 = run.worktree.after_tree_sha256
  run.host_verifier.workspace.after_tree_sha256 = run.worktree.after_tree_sha256
  const report = scoreTrustedBundle(bundle)
  assert.equal(report.verdict, 'FAIL')
  assert.equal(report.causal_validity.status, 'SYNTHETIC_FAIL')
  assert.equal(report.causal_validity.valid_for_protocol_conformance_under_trusted_host, false)
  assert.ok(report.causal_validity.reasons.some((reason) => /already-satisfied/.test(reason)))
})

test('the exported pure scorer cannot upgrade a caller-asserted signature status', () => {
  const bundle = trustedBundle()
  const report = scoreBundle(bundle.manifest, new Map(Object.entries(bundle.artifacts)), {
    synthetic: true,
    manifest_sha256: bundle.manifest_sha256,
    bundle_signature: { status: 'VERIFIED_AGAINST_SUPPLIED_TRUST_ROOT' },
  })
  assert.equal(report.verdict, 'PASS')
  assert.equal(report.causal_validity.status, 'SYNTHETIC_ONLY')
  assert.equal(report.bundle_signature.status, 'INVALID')
})

test('public scorer CLI accepts --run, writes bundle score.json, honors --out, and ignores an existing score as input', () => {
  const bundle = trustedBundle()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-e1-score-cli-'))
  const trustRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-e1-score-trust-'))
  try {
    const manifestFile = path.join(root, 'manifest.json')
    const manifestText = JSON.stringify(bundle.manifest, null, 2) + '\n'
    const runLockText = JSON.stringify(bundle.artifacts['already-satisfied'].run_lock, null, 2) + '\n'
    const cliArtifacts = {}
    const cliRawTexts = {}
    fs.writeFileSync(manifestFile, manifestText)
    fs.writeFileSync(path.join(root, 'run-lock.json'), runLockText)
    const ledgerFile = path.join(root, bundle.manifest.attempt_ledger.path)
    for (const item of bundle.manifest.cases) {
      const directory = path.join(root, item.id)
      fs.mkdirSync(directory)
      fs.mkdirSync(path.join(directory, 'pre'))
      fs.mkdirSync(path.join(directory, 'post'))
      const artifact = JSON.parse(JSON.stringify(bundle.artifacts[item.id]))
      let startedReceipt = beginAttempt(ledgerFile, {
        attempt_id: 'cli-attempt-' + item.id + '-' + (item.id === 'resume-replay' ? 'observe' : 'full'),
        case_id: item.id,
        stage: item.id === 'resume-replay' ? 'observe' : 'full',
        run_lock_hash: artifact.run_lock.lock_hash,
      })
      const bindAttemptIdentity = (receipt) => {
        artifact.attempt_identity = {
          ledger: bundle.manifest.attempt_ledger.path,
          attempt_id: receipt.attempt_id,
          case_id: receipt.case_id,
          stage: receipt.stage,
          run_lock_hash: receipt.run_lock_hash,
          start_sequence: receipt.sequence,
          start_receipt_hash: receipt.receipt_hash,
        }
      }
      bindAttemptIdentity(startedReceipt)
      const sourceEvents = artifact.session_events
      const nativeOrigin = new Map()
      const nativeOriginBySequence = new Map()
      let nextNativeSequence = 0
      for (let index = 0; index < sourceEvents.length; index++) {
        if (!sourceEvents[index].type.startsWith('runner/')) {
          nativeOrigin.set(index, nextNativeSequence)
          nativeOriginBySequence.set(sourceEvents[index].seq, nextNativeSequence++)
        }
      }
      const rawEvents = []
      artifact.session_events = sourceEvents.map((event, index) => {
        if (!event.type.startsWith('runner/')) {
          const remappedSources = Array.isArray(event.sourceEventSeqs)
            ? event.sourceEventSeqs.map((sequence) => nativeOriginBySequence.get(sequence))
            : null
          const native = {
            ...event,
            seq: nativeOrigin.get(index),
            ...(remappedSources ? { sourceEventSeqs: remappedSources } : {}),
          }
          rawEvents.push(native)
          return {
            ...event,
            ...(remappedSources ? { sourceEventSeqs: remappedSources } : {}),
            _native_seq: nativeOrigin.get(index),
          }
        }
        let anchorIndex
        if (event.type === 'runner/stdin') anchorIndex = sourceEvents.findIndex((candidate, candidateIndex) => candidateIndex > index && candidate.type === 'command/run')
        else if (event.type === 'runner/command-link') {
          for (let candidateIndex = index - 1; candidateIndex >= 0; candidateIndex--) {
            if (sourceEvents[candidateIndex].type === 'command/done') { anchorIndex = candidateIndex; break }
          }
        } else {
          for (let candidateIndex = index - 1; candidateIndex >= 0; candidateIndex--) {
            if (!sourceEvents[candidateIndex].type.startsWith('runner/')) { anchorIndex = candidateIndex; break }
          }
        }
        return { ...event, _runner_anchor_native_seq: nativeOrigin.get(anchorIndex) }
      }).map((event, index) => ({ ...event, seq: index + 1 }))
      cliArtifacts[item.id] = artifact
      const writeJson = (relative, value) => fs.writeFileSync(path.join(directory, relative), JSON.stringify(value, null, 2) + '\n')
      fs.writeFileSync(path.join(directory, 'manifest.json'), manifestText)
      fs.writeFileSync(path.join(directory, 'run-lock.json'), runLockText)
      const rawText = [
        JSON.stringify({ type: 'session', id: artifact.session_id }),
        ...rawEvents.map((event) => JSON.stringify(event)),
      ].join('\n') + '\n'
      cliRawTexts[item.id] = rawText
      fs.writeFileSync(path.join(directory, 'session.jsonl'), rawText)
      writeJson('session.events.json', artifact.session_events)
      writeJson('visible-tools.json', artifact.visible_tools)
      writeJson('visible-tool-schemas.json', artifact.visible_tool_schemas)
      writeJson('replay-checkpoints.json', artifact.replay_checkpoints)
      writeJson(path.join('pre', 'worktree.json'), artifact.worktree.before)
      writeJson(path.join('post', 'worktree.json'), artifact.worktree.after)
      fs.writeFileSync(path.join(directory, 'pre', 'git-status.txt'), '')
      fs.writeFileSync(path.join(directory, 'post', 'git-status.txt'), '')
      fs.writeFileSync(path.join(directory, 'post', 'diff.patch'), '')
      fs.writeFileSync(path.join(directory, 'pre', 'tree-hash.txt'), artifact.worktree.before_tree_sha256 + '\n')
      fs.writeFileSync(path.join(directory, 'post', 'tree-hash.txt'), artifact.worktree.after_tree_sha256 + '\n')
      writeJson(path.join('post', 'verifier.json'), artifact.host_verifier)
      writeJson(path.join('pre', 'dsh-home-inventory.json'), artifact.runtime_provenance.dsh_home.before)
      writeJson(path.join('post', 'dsh-home-inventory.json'), artifact.runtime_provenance.dsh_home.after)
      writeJson('fixture-baseline.json', artifact.fixture_baseline)
      writeJson('contract.json', artifact.goal_contract)
      writeJson('cognition.json', artifact.cognition_state)
      writeJson('verifiers.json', artifact.verifier_registry)
      writeJson('immutable-inputs.json', artifact.host_verifier.immutable_inputs.expected)

      if (item.id === 'resume-replay') {
        const boundary = artifact.replay_checkpoints.resume_after_sequence
        const stageEvents = artifact.session_events.filter((event) => event.seq <= boundary)
        const restoreNative = (events) => events.filter((event) => Number.isFinite(event._native_seq)).map((event) => {
          const restored = JSON.parse(JSON.stringify(event))
          restored.seq = restored._native_seq
          delete restored._native_seq
          delete restored._runner_anchor_native_seq
          return restored
        })
        const stageRawText = [
          JSON.stringify({ type: 'session', id: artifact.session_id }),
          ...restoreNative(stageEvents).map((event) => JSON.stringify(event)),
        ].join('\n') + '\n'
        const stageReplay = {
          resume_after_sequence: boundary,
          prefix_live: artifact.replay_checkpoints.prefix_live,
          final: 'NOT_RUN',
        }
        const stageVerifier = JSON.parse(JSON.stringify(artifact.host_verifier))
        stageVerifier.exit_code = 1
        stageVerifier.failure_markers = ['[exit code: 1]']
        stageVerifier.workspace.before_tree_sha256 = artifact.worktree.before_tree_sha256
        stageVerifier.workspace.after_tree_sha256 = artifact.worktree.before_tree_sha256
        const stageBudget = {
          ...JSON.parse(JSON.stringify(artifact.budget_evidence)),
          outer_monotonic: {
            ...JSON.parse(JSON.stringify(artifact.budget_evidence.outer_monotonic)),
            processes: [JSON.parse(JSON.stringify(artifact.budget_evidence.outer_monotonic.processes[0]))],
            elapsed_sec: artifact.budget_evidence.outer_monotonic.processes[0].elapsed_sec,
          },
        }
        const stageFinalization = JSON.parse(JSON.stringify(artifact.outer_finalization))
        stageFinalization.stage = 'observe'
        stageFinalization.expected_host_verifier_exit = item.baseline_exit
        stageFinalization.host_verifier.actual_exit_code = stageVerifier.exit_code
        stageFinalization.budget.wall_elapsed_sec = stageBudget.outer_monotonic.elapsed_sec
        const stageArtifact = {
          ...JSON.parse(JSON.stringify(artifact)),
          schema: 'dsh-researcher/goal-governor-e1/resume-stage1/v1',
          session_events: stageEvents,
          replay_checkpoints: stageReplay,
          host_verifier: stageVerifier,
          budget_evidence: stageBudget,
          outer_finalization: stageFinalization,
          outer_finalized: true,
          worktree: {
            ...JSON.parse(JSON.stringify(artifact.worktree)),
            after: JSON.parse(JSON.stringify(artifact.worktree.before)),
            after_tree_sha256: artifact.worktree.before_tree_sha256,
          },
          stage: 'observe',
          final_outcome: 'NOT_RUN',
        }
        delete stageArtifact.__bundle_invalid_reasons
        delete stageArtifact.__bundle_raw_proof
        delete stageArtifact.stage1_seal_sha256
        const token = {
          schema: 'dsh-researcher/goal-governor-e1/resume-token/v1',
          case_id: 'resume-replay',
          session_id: artifact.session_id,
          goal_id: artifact.goal_contract.goal_id,
          runtime_goal_id: artifact.runtime_goal_id,
          contract_hash: artifact.goal_contract.contract_hash,
          run_lock_hash: artifact.run_lock.lock_hash,
          boundary_native_seq: Math.max(...stageEvents.filter((event) => Number.isFinite(event._native_seq)).map((event) => event._native_seq)),
          resume_after_sequence: boundary,
          prefix_live: artifact.replay_checkpoints.prefix_live,
        }
        writeJson('resume-token.json', token)
        fs.writeFileSync(path.join(directory, 'session.stage1.jsonl'), stageRawText)
        writeJson('session.stage1.events.json', stageEvents)
        writeJson('resume-stage1.json', stageArtifact)
        fs.mkdirSync(path.join(directory, 'stage1', 'post'), { recursive: true })
        fs.writeFileSync(path.join(directory, 'stage1', 'post', 'git-status.txt'), '')
        fs.writeFileSync(path.join(directory, 'stage1', 'post', 'diff.patch'), '')
        fs.writeFileSync(path.join(directory, 'stage1', 'post', 'tree-hash.txt'), artifact.worktree.before_tree_sha256 + '\n')
        writeJson(path.join('stage1', 'post', 'worktree.json'), artifact.worktree.before)
        writeJson(path.join('stage1', 'post', 'verifier.json'), stageVerifier)
        writeJson(path.join('stage1', 'post', 'dsh-home-inventory.json'), {
          schema: 'dsh-researcher/goal-governor-e1/directory-inventory/v1',
          files: [],
          inventory_sha256: artifact.run_lock.dsh_home_policy.initial_inventory_sha256,
          file_count: 0,
        })
        fs.mkdirSync(path.join(directory, 'stage1'), { recursive: true })
        const createdSeal = createStage1Seal({
          caseDir: directory,
          runLockHash: artifact.run_lock.lock_hash,
          contractHash: artifact.goal_contract.contract_hash,
        })
        artifact.stage1_seal_sha256 = createdSeal.seal_sha256
        artifact.replay_checkpoints.stage1_seal_sha256 = createdSeal.seal_sha256
        artifact.replay_checkpoints.stage1_boundary = {
          session_id: artifact.session_id,
          resume_after_sequence: artifact.replay_checkpoints.resume_after_sequence,
        }
        writeJson('replay-checkpoints.json', artifact.replay_checkpoints)
        const stageArtifactFile = path.join(directory, 'resume-stage1.json')
        finishAttempt(ledgerFile, startedReceipt, {
          status: 'FINALIZED',
          artifact_relative: 'resume-replay/resume-stage1.json',
          artifact_sha256: sha256File(stageArtifactFile),
          outer_finalized: true,
          error_code: null,
        })
        startedReceipt = beginAttempt(ledgerFile, {
          attempt_id: 'cli-attempt-resume-replay-continue',
          case_id: 'resume-replay',
          stage: 'continue',
          run_lock_hash: artifact.run_lock.lock_hash,
        })
        bindAttemptIdentity(startedReceipt)
      }
      writeJson('artifact.json', artifact)
      finishAttempt(ledgerFile, startedReceipt, {
        status: 'FINALIZED',
        artifact_relative: item.id + '/artifact.json',
        artifact_sha256: sha256File(path.join(directory, 'artifact.json')),
        outer_finalized: true,
        error_code: null,
      })
    }
    const scoreFile = path.join(__dirname, '..', 'evaluation', 'goal-governor-e1', 'score-e1.js')
    const result = spawnSync(process.execPath, [scoreFile, '--run', root, '--synthetic'], { encoding: 'utf8', windowsHide: true })
    assert.equal(result.status, 0, String(result.stderr || result.stdout))
    const report = JSON.parse(result.stdout)
    assert.equal(Object.keys(report)[0], 'causal_validity')
    assert.equal(report.verdict, 'PASS')
    assert.equal(report.causal_validity.status, 'SYNTHETIC_ONLY')
    assert.equal(report.causal_validity.valid_for_live_conformance_claim, false)
    assert.equal(report.causal_validity.valid_for_protocol_conformance_under_trusted_host, false)
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'score.json'), 'utf8')), report)

    const manifestAsRun = spawnSync(process.execPath, [scoreFile, '--run', manifestFile, '--synthetic'], { encoding: 'utf8', windowsHide: true })
    assert.equal(manifestAsRun.status, 2)
    assert.match(manifestAsRun.stdout, /self-contained bundle directory/)

    const splitRoot = path.join(trustRoot, 'alternate-artifacts')
    fs.mkdirSync(splitRoot)
    fs.writeFileSync(path.join(splitRoot, 'manifest.json'), '{"different":true}\n')
    const splitBundle = spawnSync(process.execPath, [scoreFile, '--run', root, '--artifacts', splitRoot, '--synthetic'], { encoding: 'utf8', windowsHide: true })
    assert.equal(splitBundle.status, 2)
    assert.match(splitBundle.stdout, /unsupported.*self-contained bundle directory/)

    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
    const privateKeyFile = path.join(trustRoot, 'private.pem')
    const publicKeyFile = path.join(trustRoot, 'public.pem')
    const attestationFile = path.join(trustRoot, 'attestation.json')
    fs.writeFileSync(privateKeyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }))
    fs.writeFileSync(publicKeyFile, publicKey.export({ type: 'spki', format: 'pem' }))
    const attestation = createAttestation({ bundleRoot: root, privateKeyFile })
    fs.writeFileSync(attestationFile, JSON.stringify(attestation, null, 2) + '\n')
    const signed = spawnSync(process.execPath, [scoreFile, '--run', root, '--synthetic', '--attestation', attestationFile, '--trusted-public-key', publicKeyFile], { encoding: 'utf8', windowsHide: true })
    assert.equal(signed.status, 0, String(signed.stderr || signed.stdout))
    const signedReport = JSON.parse(signed.stdout)
    assert.equal(signedReport.bundle_signature.status, 'VERIFIED_AGAINST_SUPPLIED_TRUST_ROOT')
    assert.equal(signedReport.input_hash, attestation.commitment.commitment_sha256)
    assert.equal(signedReport.input_hash_kind, 'RAW_BUNDLE_COMMITMENT_SHA256')
    assert.equal(signedReport.causal_validity.status, 'SYNTHETIC_ONLY')
    assert.equal(signedReport.causal_validity.valid_for_live_conformance_claim, false)

    const wrongPublicKeyFile = path.join(trustRoot, 'wrong-public.pem')
    const wrongPublicKey = crypto.generateKeyPairSync('ed25519').publicKey
    fs.writeFileSync(wrongPublicKeyFile, wrongPublicKey.export({ type: 'spki', format: 'pem' }))
    const wrongTrustRoot = spawnSync(process.execPath, [scoreFile, '--run', root, '--synthetic', '--attestation', attestationFile, '--trusted-public-key', wrongPublicKeyFile], { encoding: 'utf8', windowsHide: true })
    assert.equal(wrongTrustRoot.status, 2, String(wrongTrustRoot.stderr || wrongTrustRoot.stdout))
    const wrongTrustReport = JSON.parse(wrongTrustRoot.stdout)
    assert.equal(wrongTrustReport.verdict, 'INVALID')
    assert.equal(wrongTrustReport.bundle_signature.status, 'INVALID')
    assert.equal(wrongTrustReport.causal_validity.valid_for_live_conformance_claim, false)
    assert.ok(wrongTrustReport.causal_validity.reasons.some((reason) => /fingerprint differs/.test(reason)))

    const forbiddenSignedOutput = spawnSync(process.execPath, [scoreFile, '--run', root, '--synthetic', '--attestation', attestationFile, '--trusted-public-key', publicKeyFile, '--out', path.join(root, 'signed-extra.json')], { encoding: 'utf8', windowsHide: true })
    assert.equal(forbiddenSignedOutput.status, 2)
    assert.match(forbiddenSignedOutput.stdout, /scored bundle may only receive/)

    fs.writeFileSync(path.join(root, 'score.json'), JSON.stringify({ verdict: 'TRUST_ME' }) + '\n')
    const explicit = path.join(trustRoot, 'explicit-score.json')
    const rerun = spawnSync(process.execPath, [scoreFile, '--run', root, '--out', explicit, '--synthetic'], { encoding: 'utf8', windowsHide: true })
    assert.equal(rerun.status, 0, String(rerun.stderr || rerun.stdout))
    assert.equal(JSON.parse(rerun.stdout).verdict, 'PASS')
    assert.equal(JSON.parse(fs.readFileSync(explicit, 'utf8')).verdict, 'PASS')

    const scoreAlias = path.join(trustRoot, 'explicit-score-alias.json')
    fs.linkSync(explicit, scoreAlias)
    const hardLinkedOutput = spawnSync(process.execPath, [scoreFile, '--run', root, '--out', explicit, '--synthetic'], { encoding: 'utf8', windowsHide: true })
    assert.equal(hardLinkedOutput.status, 2)
    assert.match(hardLinkedOutput.stdout, /hard-linked score output/)
    fs.unlinkSync(scoreAlias)

    const protectedWrite = spawnSync(process.execPath, [scoreFile, '--run', root, '--out', manifestFile], { encoding: 'utf8', windowsHide: true })
    assert.equal(protectedWrite.status, 2)
    assert.match(protectedWrite.stdout, /scored bundle may only receive|refusing to overwrite an existing non-score evidence file/)
    assert.equal(fs.readFileSync(manifestFile, 'utf8'), manifestText)

    const ledgerText = fs.readFileSync(ledgerFile, 'utf8')
    const ledgerLines = ledgerText.trimEnd().split(/\r?\n/)
    const damagedReceipt = JSON.parse(ledgerLines[0])
    damagedReceipt.receipt_hash = '0'.repeat(64)
    ledgerLines[0] = JSON.stringify(damagedReceipt)
    fs.writeFileSync(ledgerFile, ledgerLines.join('\n') + '\n')
    const ledgerRejected = spawnSync(process.execPath, [scoreFile, '--run', root, '--out', path.join(trustRoot, 'ledger-rejected-score.json')], { encoding: 'utf8', windowsHide: true })
    assert.equal(ledgerRejected.status, 2, String(ledgerRejected.stderr || ledgerRejected.stdout))
    assert.ok(JSON.parse(ledgerRejected.stdout).causal_validity.reasons.some((reason) => /attempt receipt (?:self-hash|hash chain)/.test(reason)))
    fs.writeFileSync(ledgerFile, ledgerText)

    const stage1EventsFile = path.join(root, 'resume-replay', 'session.stage1.events.json')
    const stage1EventsText = fs.readFileSync(stage1EventsFile, 'utf8')
    fs.writeFileSync(stage1EventsFile, '[]\n')
    const stage1Rejected = spawnSync(process.execPath, [scoreFile, '--run', root, '--out', path.join(trustRoot, 'stage1-rejected-score.json')], { encoding: 'utf8', windowsHide: true })
    assert.equal(stage1Rejected.status, 2, String(stage1Rejected.stderr || stage1Rejected.stdout))
    const stage1Invalid = JSON.parse(stage1Rejected.stdout).runs.find((run) => run.id === 'resume-replay').invalid_reasons
    assert.ok(stage1Invalid.some((reason) => /stage1 sealed hash differs/.test(reason)))
    fs.writeFileSync(stage1EventsFile, stage1EventsText)

    fs.writeFileSync(path.join(root, 'simple-done', 'session.events.json'), '[]\n')
    const rejected = spawnSync(process.execPath, [scoreFile, '--run', root, '--out', path.join(trustRoot, 'rejected-score.json')], { encoding: 'utf8', windowsHide: true })
    assert.equal(rejected.status, 2, String(rejected.stderr || rejected.stdout))
    const invalid = JSON.parse(rejected.stdout)
    assert.equal(invalid.verdict, 'INVALID')
    assert.ok(invalid.runs.find((run) => run.id === 'simple-done').invalid_reasons.some((reason) => /session events sidecar differs/.test(reason)))

    fs.writeFileSync(path.join(root, 'simple-done', 'session.events.json'), JSON.stringify(cliArtifacts['simple-done'].session_events, null, 2) + '\n')
    const tamperedRaw = cliRawTexts['simple-done'].trim().split('\n').map((line, index) => {
      const record = JSON.parse(line)
      if (index > 0 && record.type === 'tool/call' && record.data && record.data.callId) record.data.callId = 'raw-tampered-call'
      return JSON.stringify(record)
    }).join('\n') + '\n'
    fs.writeFileSync(path.join(root, 'simple-done', 'session.jsonl'), tamperedRaw)
    const rawRejected = spawnSync(process.execPath, [scoreFile, '--run', root, '--out', path.join(trustRoot, 'raw-rejected-score.json')], { encoding: 'utf8', windowsHide: true })
    assert.equal(rawRejected.status, 2, String(rawRejected.stderr || rawRejected.stdout))
    const rawInvalid = JSON.parse(rawRejected.stdout).runs.find((run) => run.id === 'simple-done').invalid_reasons
    assert.ok(rawInvalid.some((reason) => /raw full events differ/.test(reason)))

    fs.writeFileSync(path.join(root, 'simple-done', 'session.jsonl'), cliRawTexts['simple-done'])
    fs.writeFileSync(path.join(root, 'simple-done', 'session.jsonl'), '')
    fs.appendFileSync(path.join(root, 'simple-done', 'run-lock.json'), ' ')
    fs.rmSync(path.join(root, 'simple-done', 'post', 'diff.patch'))
    const missingRaw = spawnSync(process.execPath, [scoreFile, '--run', root, '--out', path.join(trustRoot, 'missing-raw-score.json')], { encoding: 'utf8', windowsHide: true })
    assert.equal(missingRaw.status, 2, String(missingRaw.stderr || missingRaw.stdout))
    const missingRawReport = JSON.parse(missingRaw.stdout)
    const simpleInvalid = missingRawReport.runs.find((run) => run.id === 'simple-done').invalid_reasons
    assert.ok(simpleInvalid.some((reason) => /session\.jsonl is (?:missing or )?empty/.test(reason)))
    assert.ok(simpleInvalid.some((reason) => /run-lock is not a byte-for-byte copy/.test(reason)))
    assert.ok(simpleInvalid.some((reason) => /post\/diff\.patch audit sidecar is missing/.test(reason)))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(trustRoot, { recursive: true, force: true })
  }
})
