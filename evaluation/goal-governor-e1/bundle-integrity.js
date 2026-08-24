'use strict'

// Deterministic byte-level commitment and optional Ed25519 attribution for an
// E1 bundle. A valid signature proves only that the supplied external trust
// root signed these bytes; it does not prove that DSH ran or that the signer is
// an honest experiment operator.
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { canonicalize, hashJson, readJson, sha256 } = require('./lib.js')

const BUNDLE_COMMITMENT_SCHEMA = 'dsh-researcher/goal-governor-e1/bundle-commitment/v1'
const ATTESTATION_SCHEMA = 'dsh-researcher/goal-governor-e1/attestation/v1'
const EXCLUDED_TOP_LEVEL_FILES = Object.freeze(['score.json'])
const REQUIRED_ROOT_FILES = Object.freeze(['attempt-ledger.jsonl', 'manifest.json', 'run-lock.json'])
const SHA256_PATTERN = /^[a-f0-9]{64}$/

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0
const slash = (value) => value.split(path.sep).join('/')

const exactKeys = (value, expected, label) => {
  if (!isPlainObject(value)) throw new Error(label + ' must be an object')
  const actual = Object.keys(value).sort(compareText)
  const wanted = [...expected].sort(compareText)
  if (canonicalize(actual) !== canonicalize(wanted)) throw new Error(label + ' keys drifted')
}

const isWithin = (root, target) => {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative === '' || !(relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative))
}

const lstatIfPresent = (target) => {
  try { return fs.lstatSync(target) } catch (error) {
    if (error && error.code === 'ENOENT') return null
    throw error
  }
}

const pathChain = (target) => {
  const absolute = path.resolve(target)
  const root = path.parse(absolute).root
  const relative = path.relative(root, absolute)
  const chain = [root]
  let cursor = root
  for (const component of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component)
    chain.push(cursor)
  }
  return chain
}

const assertExistingRealPath = (target, label, finalKind) => {
  const absolute = path.resolve(target)
  const chain = pathChain(absolute)
  for (const [index, component] of chain.entries()) {
    const stat = lstatIfPresent(component)
    if (!stat) throw new Error(label + ' does not exist: ' + absolute)
    if (stat.isSymbolicLink()) throw new Error(label + ' path must not traverse a symbolic link or junction: ' + component)
    const final = index === chain.length - 1
    if (!final && !stat.isDirectory()) throw new Error(label + ' path traverses a non-directory: ' + component)
    if (final && finalKind === 'directory' && !stat.isDirectory()) throw new Error(label + ' must be a real directory')
    if (final && finalKind === 'file' && !stat.isFile()) throw new Error(label + ' must be a real regular file')
  }
  return absolute
}

const assertMissingPathWithRealAncestors = (target, label) => {
  const absolute = path.resolve(target)
  const chain = pathChain(absolute)
  let missing = false
  let deepestExisting = chain[0]
  for (const component of chain) {
    const stat = lstatIfPresent(component)
    if (!stat) {
      missing = true
      continue
    }
    if (missing) throw new Error(label + ' has an existing descendant below a missing ancestor: ' + component)
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(label + ' path must not traverse a symbolic link, junction, or non-directory ancestor: ' + component)
    }
    deepestExisting = component
  }
  if (!missing) throw new Error('refusing to overwrite existing ' + label + ': ' + absolute)
  return { absolute, deepestExisting }
}

const assertBundleRoot = (root) => {
  const absolute = assertExistingRealPath(root, 'bundle root', 'directory')
  return { absolute, real: fs.realpathSync(absolute) }
}

const assertExternalExistingFile = (bundleRoot, candidate, label) => {
  const root = assertBundleRoot(bundleRoot)
  const absolute = assertExistingRealPath(candidate, label, 'file')
  const stat = fs.lstatSync(absolute)
  if (stat.nlink !== 1) throw new Error(label + ' must not be hard-linked')
  const real = fs.realpathSync(absolute)
  if (isWithin(root.absolute, absolute) || isWithin(root.real, real)) throw new Error(label + ' must be outside the bundle root')
  return absolute
}

const assertExternalOutputPath = (bundleRoot, candidate, label) => {
  const root = assertBundleRoot(bundleRoot)
  const { absolute, deepestExisting } = assertMissingPathWithRealAncestors(candidate, label)
  if (isWithin(root.absolute, absolute)) throw new Error(label + ' must be outside the bundle root')
  const real = path.resolve(fs.realpathSync(deepestExisting), path.relative(deepestExisting, absolute))
  if (isWithin(root.real, real)) throw new Error(label + ' must resolve outside the bundle root')
  return absolute
}

const snapshotBundle = (bundleRoot) => {
  const root = assertBundleRoot(bundleRoot)
  const files = []
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => compareText(left.name, right.name))) {
      const absolute = path.join(directory, entry.name)
      const relative = slash(path.relative(root.absolute, absolute))
      if (entry.isSymbolicLink()) throw new Error('bundle contains a symbolic link: ' + relative)
      if (entry.isDirectory()) {
        visit(absolute)
        continue
      }
      if (!entry.isFile()) throw new Error('bundle contains a non-regular filesystem entry: ' + relative)
      if (!relative.includes('/') && EXCLUDED_TOP_LEVEL_FILES.includes(relative)) continue
      const stat = fs.lstatSync(absolute)
      if (stat.nlink !== 1) throw new Error('bundle contains a hard-linked file: ' + relative)
      const bytes = fs.readFileSync(absolute)
      files.push({ path: relative, size: bytes.length, sha256: sha256(bytes) })
    }
  }
  visit(root.absolute)
  files.sort((left, right) => compareText(left.path, right.path))
  return files
}

const validateCommitment = (value) => {
  exactKeys(value, ['schema', 'hash_algorithm', 'path_encoding', 'excluded_top_level_files', 'required_root_files', 'file_count', 'byte_count', 'files', 'commitment_sha256'], 'bundle commitment')
  if (value.schema !== BUNDLE_COMMITMENT_SCHEMA || value.hash_algorithm !== 'sha256' || value.path_encoding !== 'portable-posix-relative') throw new Error('bundle commitment algorithm or path encoding drifted')
  if (canonicalize(value.excluded_top_level_files) !== canonicalize(EXCLUDED_TOP_LEVEL_FILES)) throw new Error('bundle commitment exclusion policy drifted')
  if (canonicalize(value.required_root_files) !== canonicalize(REQUIRED_ROOT_FILES)) throw new Error('bundle commitment required-root policy drifted')
  if (!Array.isArray(value.files) || value.file_count !== value.files.length || !Number.isSafeInteger(value.byte_count) || value.byte_count < 0) throw new Error('bundle commitment counts are invalid')
  const seen = new Set()
  let bytes = 0
  let prior = null
  for (const [index, entry] of value.files.entries()) {
    exactKeys(entry, ['path', 'size', 'sha256'], 'bundle commitment file ' + index)
    if (typeof entry.path !== 'string' || entry.path === '' || entry.path === '.' || entry.path.includes('\\') || path.posix.isAbsolute(entry.path) || path.win32.isAbsolute(entry.path) || path.posix.normalize(entry.path) !== entry.path || entry.path === '..' || entry.path.startsWith('../')) throw new Error('bundle commitment contains an unsafe path')
    if (prior !== null && compareText(prior, entry.path) >= 0) throw new Error('bundle commitment files are not strictly sorted')
    if (seen.has(entry.path)) throw new Error('bundle commitment contains a duplicate path')
    if (!Number.isSafeInteger(entry.size) || entry.size < 0 || !SHA256_PATTERN.test(String(entry.sha256 || ''))) throw new Error('bundle commitment file metadata is invalid')
    prior = entry.path
    seen.add(entry.path)
    bytes += entry.size
  }
  if (bytes !== value.byte_count) throw new Error('bundle commitment byte_count drifted')
  for (const required of REQUIRED_ROOT_FILES) if (!seen.has(required)) throw new Error('bundle commitment omitted required root file ' + required)
  if (!SHA256_PATTERN.test(String(value.commitment_sha256 || ''))) throw new Error('bundle commitment digest is invalid')
  const normative = JSON.parse(JSON.stringify(value))
  delete normative.commitment_sha256
  if (hashJson(normative) !== value.commitment_sha256) throw new Error('bundle commitment digest does not match its canonical content')
  return value
}

const createBundleCommitment = (bundleRoot) => {
  const files = snapshotBundle(bundleRoot)
  const commitment = {
    schema: BUNDLE_COMMITMENT_SCHEMA,
    hash_algorithm: 'sha256',
    path_encoding: 'portable-posix-relative',
    excluded_top_level_files: [...EXCLUDED_TOP_LEVEL_FILES],
    required_root_files: [...REQUIRED_ROOT_FILES],
    file_count: files.length,
    byte_count: files.reduce((sum, entry) => sum + entry.size, 0),
    files,
  }
  commitment.commitment_sha256 = hashJson(commitment)
  return validateCommitment(commitment)
}

const createCommittedSnapshot = (bundleRoot, commitment) => {
  const root = assertBundleRoot(bundleRoot)
  validateCommitment(commitment)
  const snapshot = fs.mkdtempSync(path.join(os.tmpdir(), 'dshr-e1-snapshot-'))
  try {
    for (const entry of commitment.files) {
      const source = path.resolve(root.absolute, ...entry.path.split('/'))
      if (!isWithin(root.absolute, source) || !fs.existsSync(source)) throw new Error('committed bundle file is unavailable: ' + entry.path)
      const stat = fs.lstatSync(source)
      if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) throw new Error('committed bundle file is not an isolated regular file: ' + entry.path)
      const bytes = fs.readFileSync(source)
      if (bytes.length !== entry.size || sha256(bytes) !== entry.sha256) throw new Error('bundle file changed while creating the private scoring snapshot: ' + entry.path)
      const target = path.join(snapshot, ...entry.path.split('/'))
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, bytes, { flag: 'wx' })
    }
    const copied = createBundleCommitment(snapshot)
    if (copied.commitment_sha256 !== commitment.commitment_sha256) throw new Error('private scoring snapshot differs from the committed bundle')
    return snapshot
  } catch (error) {
    fs.rmSync(snapshot, { recursive: true, force: true })
    throw error
  }
}

const keyFingerprint = (publicKey) => sha256(publicKey.export({ type: 'spki', format: 'der' }))
const signingBytes = (commitment) => Buffer.from(canonicalize(validateCommitment(commitment)), 'utf8')

const createAttestation = ({ bundleRoot, privateKeyFile }) => {
  const keyFile = assertExternalExistingFile(bundleRoot, privateKeyFile, 'private key')
  const privateKey = crypto.createPrivateKey(fs.readFileSync(keyFile))
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('private key must be Ed25519')
  const publicKey = crypto.createPublicKey(privateKey)
  const commitment = createBundleCommitment(bundleRoot)
  return {
    schema: ATTESTATION_SCHEMA,
    algorithm: 'Ed25519',
    key_fingerprint_sha256: keyFingerprint(publicKey),
    commitment,
    signature_base64: crypto.sign(null, signingBytes(commitment), privateKey).toString('base64'),
  }
}

const validateAttestation = (value) => {
  exactKeys(value, ['schema', 'algorithm', 'key_fingerprint_sha256', 'commitment', 'signature_base64'], 'attestation')
  if (value.schema !== ATTESTATION_SCHEMA || value.algorithm !== 'Ed25519') throw new Error('attestation schema or algorithm drifted')
  if (!SHA256_PATTERN.test(String(value.key_fingerprint_sha256 || ''))) throw new Error('attestation key fingerprint is invalid')
  validateCommitment(value.commitment)
  if (typeof value.signature_base64 !== 'string' || value.signature_base64 === '') throw new Error('attestation signature is missing')
  const signature = Buffer.from(value.signature_base64, 'base64')
  if (signature.length !== 64 || signature.toString('base64') !== value.signature_base64) throw new Error('attestation signature is not canonical Ed25519 base64')
  return value
}

const verifyAttestation = ({ bundleRoot, attestationFile, trustedPublicKeyFile }) => {
  const attestationPath = assertExternalExistingFile(bundleRoot, attestationFile, 'attestation')
  const publicKeyPath = assertExternalExistingFile(bundleRoot, trustedPublicKeyFile, 'trusted public key')
  const attestation = validateAttestation(readJson(attestationPath))
  const publicKey = crypto.createPublicKey(fs.readFileSync(publicKeyPath))
  if (publicKey.asymmetricKeyType !== 'ed25519') throw new Error('trusted public key must be Ed25519')
  const fingerprint = keyFingerprint(publicKey)
  if (attestation.key_fingerprint_sha256 !== fingerprint) throw new Error('attestation key fingerprint differs from the supplied trust root')
  if (!crypto.verify(null, signingBytes(attestation.commitment), publicKey, Buffer.from(attestation.signature_base64, 'base64'))) throw new Error('attestation signature verification failed')
  const actual = createBundleCommitment(bundleRoot)
  if (canonicalize(actual) !== canonicalize(attestation.commitment)) throw new Error('bundle bytes differ from the signed commitment')
  return {
    status: 'VERIFIED_AGAINST_SUPPLIED_TRUST_ROOT',
    algorithm: 'Ed25519',
    key_fingerprint_sha256: fingerprint,
    commitment_sha256: actual.commitment_sha256,
    file_count: actual.file_count,
    byte_count: actual.byte_count,
    excluded_top_level_files: [...EXCLUDED_TOP_LEVEL_FILES],
  }
}

module.exports = {
  BUNDLE_COMMITMENT_SCHEMA,
  ATTESTATION_SCHEMA,
  EXCLUDED_TOP_LEVEL_FILES,
  REQUIRED_ROOT_FILES,
  assertExternalExistingFile,
  assertExternalOutputPath,
  snapshotBundle,
  validateCommitment,
  createBundleCommitment,
  createCommittedSnapshot,
  validateAttestation,
  createAttestation,
  verifyAttestation,
}
