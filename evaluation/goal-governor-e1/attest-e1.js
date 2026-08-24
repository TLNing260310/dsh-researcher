#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const { parseArgs, requireString } = require('./lib.js')
const {
  assertExternalOutputPath,
  createAttestation,
  verifyAttestation,
} = require('./bundle-integrity.js')

const usage = () => [
  'Offline E1 bundle attestation:',
  '  node attest-e1.js create --run <bundle-dir> --private-key <external-ed25519-private.pem> --out <external-attestation.json>',
  '  node attest-e1.js verify --run <bundle-dir> --attestation <external-attestation.json> --trusted-public-key <external-ed25519-public.pem>',
  '',
  'A verified signature authenticates bundle bytes against the supplied external trust root.',
  'It does not prove that DSH ran, that a human approved a gate, or that the signer was honest.',
].join('\n')

const main = () => {
  const args = parseArgs(process.argv.slice(2))
  const command = args._[0]
  if (!command || args.help === true) {
    process.stdout.write(usage() + '\n')
    process.exitCode = args.help === true ? 0 : 2
    return
  }
  const bundleRoot = path.resolve(requireString(args.run, '--run'))
  if (command === 'create') {
    const output = assertExternalOutputPath(bundleRoot, requireString(args.out, '--out'), 'attestation output')
    const attestation = createAttestation({
      bundleRoot,
      privateKeyFile: requireString(args['private-key'], '--private-key'),
    })
    fs.mkdirSync(path.dirname(output), { recursive: true })
    assertExternalOutputPath(bundleRoot, output, 'attestation output')
    fs.writeFileSync(output, JSON.stringify(attestation, null, 2) + '\n', { flag: 'wx' })
    process.stdout.write(JSON.stringify({
      ok: true,
      offline: true,
      attestation: output,
      commitment_sha256: attestation.commitment.commitment_sha256,
      key_fingerprint_sha256: attestation.key_fingerprint_sha256,
      causal_claim: false,
    }, null, 2) + '\n')
    return
  }
  if (command === 'verify') {
    const proof = verifyAttestation({
      bundleRoot,
      attestationFile: requireString(args.attestation, '--attestation'),
      trustedPublicKeyFile: requireString(args['trusted-public-key'], '--trusted-public-key'),
    })
    process.stdout.write(JSON.stringify({ ok: true, offline: true, bundle_signature: proof, causal_claim: false }, null, 2) + '\n')
    return
  }
  throw new Error('unknown command\n' + usage())
}

if (require.main === module) {
  try { main() } catch (error) {
    process.stderr.write('E1 attestation: ' + error.message + '\n')
    process.exitCode = 2
  }
}

module.exports = { main }
