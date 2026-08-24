'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const {
  assertExternalOutputPath,
  createAttestation,
  createBundleCommitment,
  verifyAttestation,
} = require('../evaluation/goal-governor-e1/bundle-integrity.js')

const makeLayout = () => {
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-e1-attestation-'))
  const bundle = path.join(outer, 'bundle')
  const trust = path.join(outer, 'trust')
  fs.mkdirSync(path.join(bundle, 'case', 'nested'), { recursive: true })
  fs.mkdirSync(trust)
  fs.writeFileSync(path.join(bundle, 'manifest.json'), '{"schema":"manifest"}\n')
  fs.writeFileSync(path.join(bundle, 'run-lock.json'), '{"schema":"lock"}\n')
  fs.writeFileSync(path.join(bundle, 'attempt-ledger.jsonl'), '{"sequence":0}\n')
  fs.writeFileSync(path.join(bundle, 'case', 'raw.bin'), Buffer.from([0, 10, 13, 255]))
  fs.writeFileSync(path.join(bundle, 'case', 'nested', 'score.json'), '{"included":true}\n')
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
  const privateFile = path.join(trust, 'private.pem')
  const publicFile = path.join(trust, 'public.pem')
  const attestationFile = path.join(trust, 'attestation.json')
  fs.writeFileSync(privateFile, privateKey.export({ type: 'pkcs8', format: 'pem' }))
  fs.writeFileSync(publicFile, publicKey.export({ type: 'spki', format: 'pem' }))
  return { outer, bundle, trust, privateFile, publicFile, attestationFile }
}

test('bundle commitment is byte-deterministic and excludes only exact top-level score.json', () => {
  const layout = makeLayout()
  try {
    const initial = createBundleCommitment(layout.bundle)
    assert.deepEqual(initial.files.map((entry) => entry.path), [
      'attempt-ledger.jsonl',
      'case/nested/score.json',
      'case/raw.bin',
      'manifest.json',
      'run-lock.json',
    ])
    fs.writeFileSync(path.join(layout.bundle, 'score.json'), 'first\n')
    assert.deepEqual(createBundleCommitment(layout.bundle), initial)
    fs.writeFileSync(path.join(layout.bundle, 'score.json'), 'second\n')
    assert.deepEqual(createBundleCommitment(layout.bundle), initial)
    fs.writeFileSync(path.join(layout.bundle, 'attestation.json'), 'included\n')
    assert.notEqual(createBundleCommitment(layout.bundle).commitment_sha256, initial.commitment_sha256)
    fs.rmSync(path.join(layout.bundle, 'attestation.json'))
    fs.appendFileSync(path.join(layout.bundle, 'case', 'nested', 'score.json'), 'changed\n')
    assert.notEqual(createBundleCommitment(layout.bundle).commitment_sha256, initial.commitment_sha256)
  } finally { fs.rmSync(layout.outer, { recursive: true, force: true }) }
})

test('external Ed25519 attestation detects mutation and a wrong trust root without making a causal claim', () => {
  const layout = makeLayout()
  try {
    const attestation = createAttestation({ bundleRoot: layout.bundle, privateKeyFile: layout.privateFile })
    fs.writeFileSync(layout.attestationFile, JSON.stringify(attestation, null, 2) + '\n')
    const proof = verifyAttestation({ bundleRoot: layout.bundle, attestationFile: layout.attestationFile, trustedPublicKeyFile: layout.publicFile })
    assert.equal(proof.status, 'VERIFIED_AGAINST_SUPPLIED_TRUST_ROOT')
    assert.equal(proof.commitment_sha256, attestation.commitment.commitment_sha256)
    assert.equal(Object.prototype.hasOwnProperty.call(proof, 'valid_for_live_conformance_claim'), false)

    const wrong = crypto.generateKeyPairSync('ed25519').publicKey
    const wrongFile = path.join(layout.trust, 'wrong.pem')
    fs.writeFileSync(wrongFile, wrong.export({ type: 'spki', format: 'pem' }))
    assert.throws(() => verifyAttestation({ bundleRoot: layout.bundle, attestationFile: layout.attestationFile, trustedPublicKeyFile: wrongFile }), /fingerprint differs/)

    fs.appendFileSync(path.join(layout.bundle, 'case', 'raw.bin'), Buffer.from([1]))
    assert.throws(() => verifyAttestation({ bundleRoot: layout.bundle, attestationFile: layout.attestationFile, trustedPublicKeyFile: layout.publicFile }), /bundle bytes differ/)
  } finally { fs.rmSync(layout.outer, { recursive: true, force: true }) }
})

test('keys and attestation trust inputs are rejected inside the bundle or through a symlink', (t) => {
  const layout = makeLayout()
  try {
    const insidePrivate = path.join(layout.bundle, 'private.pem')
    fs.copyFileSync(layout.privateFile, insidePrivate)
    assert.throws(() => createAttestation({ bundleRoot: layout.bundle, privateKeyFile: insidePrivate }), /outside the bundle root/)

    const valid = createAttestation({ bundleRoot: layout.bundle, privateKeyFile: layout.privateFile })
    fs.writeFileSync(layout.attestationFile, JSON.stringify(valid) + '\n')
    const insideAttestation = path.join(layout.bundle, 'attestation.json')
    fs.writeFileSync(insideAttestation, JSON.stringify(valid) + '\n')
    assert.throws(() => verifyAttestation({ bundleRoot: layout.bundle, attestationFile: insideAttestation, trustedPublicKeyFile: layout.publicFile }), /outside the bundle root/)

    const link = path.join(layout.trust, 'public-link.pem')
    let fileLinkCreated = false
    try { fs.symlinkSync(layout.publicFile, link, 'file') } catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
        t.diagnostic('symbolic-link creation is unavailable on this host')
      } else throw error
    }
    if (fs.existsSync(link)) fileLinkCreated = true
    if (fileLinkCreated) assert.throws(() => verifyAttestation({ bundleRoot: layout.bundle, attestationFile: layout.attestationFile, trustedPublicKeyFile: link }), /symbolic link/)

    const directoryAlias = path.join(layout.outer, 'trust-alias')
    try { fs.symlinkSync(layout.trust, directoryAlias, process.platform === 'win32' ? 'junction' : 'dir') } catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
        t.diagnostic('directory-link creation is unavailable on this host')
        return
      }
      throw error
    }
    assert.throws(
      () => createAttestation({ bundleRoot: layout.bundle, privateKeyFile: path.join(directoryAlias, 'private.pem') }),
      /symbolic link or junction/,
    )
    assert.throws(
      () => verifyAttestation({ bundleRoot: layout.bundle, attestationFile: path.join(directoryAlias, 'attestation.json'), trustedPublicKeyFile: layout.publicFile }),
      /symbolic link or junction/,
    )
    assert.throws(
      () => assertExternalOutputPath(layout.bundle, path.join(directoryAlias, 'new-attestation.json'), 'attestation output'),
      /symbolic link, junction|symlink/,
    )
  } finally { fs.rmSync(layout.outer, { recursive: true, force: true }) }
})

test('bundle and trust inputs reject hard links instead of accepting aliased bytes', (t) => {
  const layout = makeLayout()
  try {
    const source = path.join(layout.bundle, 'case', 'raw.bin')
    const alias = path.join(layout.bundle, 'case', 'raw-hardlink.bin')
    try { fs.linkSync(source, alias) } catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
        t.diagnostic('hard-link creation is unavailable on this host')
        return
      }
      throw error
    }
    assert.throws(() => createBundleCommitment(layout.bundle), /hard-linked file/)
    fs.unlinkSync(alias)

    const keyAlias = path.join(layout.trust, 'private-hardlink.pem')
    fs.linkSync(layout.privateFile, keyAlias)
    assert.throws(() => createAttestation({ bundleRoot: layout.bundle, privateKeyFile: keyAlias }), /must not be hard-linked/)
  } finally { fs.rmSync(layout.outer, { recursive: true, force: true }) }
})

test('attestation CLI creates and verifies only external artifacts', () => {
  const layout = makeLayout()
  try {
    const cli = path.join(__dirname, '..', 'evaluation', 'goal-governor-e1', 'attest-e1.js')
    const created = spawnSync(process.execPath, [cli, 'create', '--run', layout.bundle, '--private-key', layout.privateFile, '--out', layout.attestationFile], { encoding: 'utf8', windowsHide: true })
    assert.equal(created.status, 0, String(created.stderr || created.stdout))
    assert.equal(JSON.parse(created.stdout).causal_claim, false)
    const verified = spawnSync(process.execPath, [cli, 'verify', '--run', layout.bundle, '--attestation', layout.attestationFile, '--trusted-public-key', layout.publicFile], { encoding: 'utf8', windowsHide: true })
    assert.equal(verified.status, 0, String(verified.stderr || verified.stdout))
    const report = JSON.parse(verified.stdout)
    assert.equal(report.bundle_signature.status, 'VERIFIED_AGAINST_SUPPLIED_TRUST_ROOT')
    assert.equal(report.causal_claim, false)

    const internalOut = spawnSync(process.execPath, [cli, 'create', '--run', layout.bundle, '--private-key', layout.privateFile, '--out', path.join(layout.bundle, 'attestation.json')], { encoding: 'utf8', windowsHide: true })
    assert.equal(internalOut.status, 2)
    assert.match(internalOut.stderr, /outside the bundle root/)
  } finally { fs.rmSync(layout.outer, { recursive: true, force: true }) }
})
