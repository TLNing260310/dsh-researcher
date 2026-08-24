#!/usr/bin/env node

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const repositoryRoot = path.resolve(__dirname, '..')
const packageJson = require(path.join(repositoryRoot, 'package.json'))

const REQUIRED_PACKAGE_FILES = [
  'scripts/build-release-artifacts.js',
  'lib/index.js',
  'PROJECT_COGNITION.md',
  'schemas/cognition-state-v1.schema.json',
  'schemas/cognition-state-draft-v1.schema.json',
  'schemas/goal-contract-v1.schema.json',
  'researcher/agent.cordis.yml',
  'governed/agent.cordis.yml',
  'evaluation/goal-governor-e1/manifest.json',
  'evaluation/goal-governor-e1/attest-e1.js',
  'evaluation/goal-governor-e1/bundle-integrity.js',
  'evaluation/goal-governor-e1/bundle-commitment.schema.json',
  'evaluation/goal-governor-e1/attestation.schema.json',
  'evaluation/goal-governor-e1/score-report.schema.json',
  'evaluation/goal-governor-e1/preflight.js',
  'evaluation/goal-governor-e1/score-e1.js',
  'evaluation/goal-governor-e1/run-e1.js',
  'evaluation/goal-governor-e1/external-verifier.js',
  'evaluation/goal-governor-e1/stage1-seal.js',
  'evaluation/goal-governor-e1/runner/e1.patch.yml',
  'evaluation/goal-governor-e1/runner/e1-headless.mjs',
  'evaluation/goal-governor-e1/runner/e1-host-tool.js',
  'fixtures/goal-governor-e1/materialize.js',
  'schemas/cognition-revision-diff-v1.schema.json',
  'schemas/release-package-manifest-v1.schema.json',
  '.project-cognition/state.json',
  '.project-cognition/verifiers.json',
  'SECURITY.md',
]

const fail = (message) => {
  throw new Error(message)
}

const parseArguments = (argv) => {
  const values = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--require-clean') {
      if (values[token]) fail('duplicate argument: ' + token)
      values[token] = true
      continue
    }
    if (!['--out', '--expected-version', '--expected-revision'].includes(token)) fail('unknown argument: ' + token)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) fail(token + ' requires a value')
    if (values[token]) fail('duplicate argument: ' + token)
    values[token] = value
    index += 1
  }
  if (!values['--out']) fail('--out <directory> is required')
  if (!values['--expected-version']) fail('--expected-version <version> is required')
  return {
    out: path.resolve(values['--out']),
    expectedVersion: values['--expected-version'],
    expectedRevision: values['--expected-revision'],
    requireClean: values['--require-clean'] === true,
  }
}

const isInside = (parent, candidate) => {
  const relative = path.relative(parent, candidate)
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
}

const lstatIfPresent = (target) => {
  try { return fs.lstatSync(target) } catch (error) {
    if (error && error.code === 'ENOENT') return null
    throw error
  }
}

const existingRealAncestor = (target) => {
  const absolute = path.resolve(target)
  const root = path.parse(absolute).root
  const relative = path.relative(root, absolute)
  let deepest = root
  let missing = false
  for (const component of [root, ...relative.split(path.sep).filter(Boolean).map((part, index, parts) => path.join(root, ...parts.slice(0, index + 1)))]) {
    const stat = lstatIfPresent(component)
    if (!stat) {
      missing = true
      continue
    }
    if (missing) fail('output path has an existing descendant below a missing ancestor: ' + component)
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('output path must not traverse a symlink, junction, or non-directory ancestor: ' + component)
    deepest = component
  }
  return { absolute, deepest, exists: !missing && deepest === absolute }
}

const assertSafeOutput = (out) => {
  const repositoryReal = fs.realpathSync(repositoryRoot)
  const checked = existingRealAncestor(out)
  if (isInside(repositoryRoot, checked.absolute)) {
    fail('output directory must be outside the repository so release artifacts cannot enter a later package')
  }
  const ancestorReal = fs.realpathSync(checked.deepest)
  const resolvedRealOutput = path.resolve(ancestorReal, path.relative(checked.deepest, checked.absolute))
  if (isInside(repositoryReal, resolvedRealOutput)) fail('output directory resolves inside the repository')
  if (!checked.exists) return
  if (!isInside(fs.realpathSync(checked.absolute), resolvedRealOutput) || !isInside(resolvedRealOutput, fs.realpathSync(checked.absolute))) fail('output path real location changed during validation')
  if (fs.readdirSync(checked.absolute).length !== 0) fail('output directory must be empty: ' + checked.absolute)
}

const gitRun = (root, gitArgs, options = {}) => {
  const { env = {}, ...spawnOptions } = options
  const result = spawnSync('git', gitArgs, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    ...spawnOptions,
    env: { ...process.env, ...env, GIT_NO_REPLACE_OBJECTS: '1' },
  })
  if (result.error || result.status !== 0) fail('git ' + gitArgs.join(' ') + ' failed: ' + String(result.stderr || result.error && result.error.message || ''))
  return String(result.stdout || '')
}

const parseHeadTree = (raw) => {
  const entries = new Map()
  for (const row of raw.split('\0').filter(Boolean)) {
    const match = row.match(/^([0-7]{6}) ([a-z]+) ([a-f0-9]{40,64})\t(.+)$/)
    if (!match) fail('git HEAD tree contains an unparseable row')
    const [, mode, type, oid, file] = match
    if (type !== 'blob' || !['100644', '100755'].includes(mode)) fail('release source contains a non-regular tracked entry: ' + file)
    if (/[\r\n\0]/.test(file)) fail('release source contains a path unsupported by the source verifier')
    entries.set(file, { mode, oid })
  }
  return entries
}

const parseIndex = (raw) => {
  const entries = new Map()
  for (const row of raw.split('\0').filter(Boolean)) {
    const match = row.match(/^([0-7]{6}) ([a-f0-9]{40,64}) ([0-3])\t(.+)$/)
    if (!match) fail('git index contains an unparseable row')
    const [, mode, oid, stage, file] = match
    if (stage !== '0') fail('release source contains an unmerged index entry: ' + file)
    entries.set(file, { mode, oid })
  }
  return entries
}

const gitBlobOid = (bytes, length) => crypto
  .createHash(length === 64 ? 'sha256' : 'sha1')
  .update(Buffer.from('blob ' + bytes.length + '\0'))
  .update(bytes)
  .digest('hex')

// Git may report a checkout as clean after its built-in text conversion even
// though the working representation contains CRLF and the committed blob LF.
// Accept only that reversible representation difference; every other byte
// still has to bind directly to the HEAD blob without invoking a clean filter.
const normalizeCrLf = (bytes) => {
  let pairs = 0
  for (let index = 0; index + 1 < bytes.length; index++) {
    if (bytes[index] === 0x0d && bytes[index + 1] === 0x0a) pairs++
  }
  if (pairs === 0) return bytes
  const normalized = Buffer.allocUnsafe(bytes.length - pairs)
  let target = 0
  for (let index = 0; index < bytes.length; index++) {
    if (bytes[index] === 0x0d && bytes[index + 1] === 0x0a) continue
    normalized[target++] = bytes[index]
  }
  return normalized
}

const workingBytesMatchBlob = (bytes, expectedOid) => {
  if (gitBlobOid(bytes, expectedOid.length) === expectedOid) return true
  const normalized = normalizeCrLf(bytes)
  return normalized !== bytes && gitBlobOid(normalized, expectedOid.length) === expectedOid
}

const inspectGitSource = (root = repositoryRoot) => {
  const absoluteRoot = path.resolve(root)
  const revision = gitRun(absoluteRoot, ['rev-parse', 'HEAD']).trim()
  const porcelain = gitRun(absoluteRoot, ['status', '--porcelain=v1', '--untracked-files=all'])
  if (porcelain !== '') return { revision, clean: false, headFiles: null }
  try {
    const head = parseHeadTree(gitRun(absoluteRoot, ['ls-tree', '-r', '-z', '--full-tree', revision]))
    const index = parseIndex(gitRun(absoluteRoot, ['ls-files', '--stage', '-z']))
    if (head.size !== index.size) fail('git index inventory differs from HEAD')
    for (const [file, expected] of head) {
      const indexed = index.get(file)
      if (!indexed || indexed.mode !== expected.mode || indexed.oid !== expected.oid) fail('git index blob/mode differs from HEAD: ' + file)
      const absolute = path.join(absoluteRoot, ...file.split('/'))
      const stat = fs.lstatSync(absolute)
      if (stat.isSymbolicLink() || !stat.isFile()) fail('release source path is not a real regular file: ' + file)
      if (process.platform !== 'win32') {
        const expectedExecutable = expected.mode === '100755'
        if (((stat.mode & 0o111) !== 0) !== expectedExecutable) fail('release source filesystem mode differs from HEAD: ' + file)
      }
      if (!workingBytesMatchBlob(fs.readFileSync(absolute), expected.oid)) {
        fail('release source raw working bytes differ from HEAD blob after permitted CRLF normalization: ' + file)
      }
    }
    if (gitRun(absoluteRoot, ['rev-parse', 'HEAD']).trim() !== revision) fail('git HEAD changed during release source inspection')
    const paths = [...head.keys()]
    return { revision, clean: true, headFiles: new Set(paths), headEntries: head }
  } catch (error) {
    return { revision, clean: false, headFiles: null, headEntries: null, integrityError: error.message }
  }
}

const gitSource = () => {
  const source = inspectGitSource(repositoryRoot)
  return {
    revision: source.revision,
    clean: source.clean,
    headFiles: source.headFiles,
    headEntries: source.headEntries,
    integrityError: source.integrityError,
  }
}

const digest = (algorithm, bytes, encoding = 'hex') => crypto.createHash(algorithm).update(bytes).digest(encoding)

const npmInvocation = () => {
  const configured = process.env.npm_execpath
  if (configured && fs.existsSync(configured)) return { command: process.execPath, prefix: [configured] }

  const bundled = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  if (fs.existsSync(bundled)) return { command: process.execPath, prefix: [bundled] }

  return { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', prefix: [] }
}

const verifyHeadSnapshot = (snapshot, headEntries) => {
  const seen = new Set()
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      const relative = path.relative(snapshot, absolute).split(path.sep).join('/')
      if (entry.isSymbolicLink()) fail('HEAD package snapshot contains a symbolic link: ' + relative)
      if (entry.isDirectory()) {
        visit(absolute)
        continue
      }
      if (!entry.isFile()) fail('HEAD package snapshot contains a non-regular entry: ' + relative)
      const expected = headEntries.get(relative)
      if (!expected) fail('HEAD package snapshot contains an unbound file: ' + relative)
      const bytes = fs.readFileSync(absolute)
      if (gitBlobOid(bytes, expected.oid.length) !== expected.oid) fail('HEAD package snapshot bytes differ from the bound Git blob: ' + relative)
      if (process.platform !== 'win32') {
        const actualExecutable = (fs.statSync(absolute).mode & 0o111) !== 0
        if (actualExecutable !== (expected.mode === '100755')) fail('HEAD package snapshot mode differs from the bound Git mode: ' + relative)
      }
      seen.add(relative)
    }
  }
  visit(snapshot)
  if (seen.size !== headEntries.size) fail('HEAD package snapshot inventory is incomplete')
  for (const file of headEntries.keys()) if (!seen.has(file)) fail('HEAD package snapshot omitted tracked file: ' + file)
}

const createHeadSnapshot = (root, destination, headEntries) => {
  if (!(headEntries instanceof Map) || headEntries.size === 0) fail('cannot create a HEAD package snapshot without a verified tree inventory')
  fs.mkdirSync(destination, { recursive: true })
  if (fs.readdirSync(destination).length !== 0) fail('HEAD package snapshot destination must be empty')
  const entries = [...headEntries.entries()]
  const result = spawnSync('git', ['cat-file', '--batch'], {
    cwd: root,
    input: entries.map(([, entry]) => entry.oid).join('\n') + '\n',
    encoding: null,
    windowsHide: true,
    maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' },
  })
  if (result.error || result.status !== 0) fail('git cat-file --batch failed while creating the HEAD package snapshot')
  const output = result.stdout
  let offset = 0
  for (const [file, expected] of entries) {
    const newline = output.indexOf(0x0a, offset)
    if (newline < 0) fail('git cat-file returned a truncated object header')
    const header = output.subarray(offset, newline).toString('utf8')
    const match = header.match(/^([a-f0-9]{40,64}) blob ([0-9]+)$/)
    if (!match || match[1] !== expected.oid) fail('git cat-file returned an unexpected object while creating the HEAD package snapshot')
    const size = Number(match[2])
    if (!Number.isSafeInteger(size) || size < 0) fail('git cat-file returned an invalid blob size')
    const start = newline + 1
    const end = start + size
    if (end >= output.length || output[end] !== 0x0a) fail('git cat-file returned truncated blob bytes')
    const target = path.join(destination, ...file.split('/'))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, output.subarray(start, end), { flag: 'wx', mode: expected.mode === '100755' ? 0o755 : 0o644 })
    offset = end + 1
  }
  if (offset !== output.length) fail('git cat-file returned unexpected trailing bytes')
  verifyHeadSnapshot(destination, headEntries)
  return destination
}

const runPack = (stage, sourceRoot = repositoryRoot) => {
  const invocation = npmInvocation()
  const result = spawnSync(invocation.command, [
    ...invocation.prefix,
    'pack',
    '--json',
    '--offline',
    '--ignore-scripts',
    '--pack-destination', stage,
    '--cache', path.join(stage, 'npm-cache'),
  ], {
    cwd: sourceRoot,
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.error) fail('could not start npm pack: ' + result.error.message)
  if (result.status !== 0) fail('npm pack failed:\n' + String(result.stdout || '') + String(result.stderr || ''))

  let parsed
  try {
    parsed = JSON.parse(result.stdout)
  } catch (error) {
    fail('npm pack did not return JSON: ' + error.message)
  }
  if (!Array.isArray(parsed) || parsed.length !== 1) fail('npm pack returned an unexpected package count')
  return parsed[0]
}

const validatePackedManifest = (packed, tarballBytes) => {
  if (packed.name !== packageJson.name) fail('packed package name does not match package.json')
  if (packed.version !== packageJson.version) fail('packed package version does not match package.json')
  if (!Array.isArray(packed.files) || packed.files.length === 0) fail('npm pack returned no file inventory')

  const paths = packed.files.map((entry) => entry.path)
  for (const required of REQUIRED_PACKAGE_FILES) {
    if (!paths.includes(required)) fail('required packaged file is missing: ' + required)
  }
  if (paths.some((entry) => entry === 'evaluation/runs' || entry.startsWith('evaluation/runs/'))) {
    fail('raw evaluation runs must not be packaged')
  }
  const allowedCognition = new Set(['.project-cognition/state.json', '.project-cognition/verifiers.json'])
  if (paths.some((entry) => entry.startsWith('.project-cognition/') && !allowedCognition.has(entry))) fail('temporary or unapproved Project Cognition material must not be packaged')
  for (const entry of paths) {
    if (path.isAbsolute(entry) || entry.includes('\\') || entry.split('/').includes('..')) {
      fail('unsafe path in package inventory: ' + entry)
    }
  }

  const sha1 = digest('sha1', tarballBytes)
  const integrity = 'sha512-' + digest('sha512', tarballBytes, 'base64')
  if (packed.shasum !== sha1) fail('npm SHA-1 does not match the tarball bytes')
  if (packed.integrity !== integrity) fail('npm integrity does not match the tarball bytes')
  if (packed.size !== tarballBytes.length) fail('npm package size does not match the tarball bytes')
}

const buildArtifacts = ({ out, expectedVersion, expectedRevision, requireClean = false }) => {
  if (expectedVersion !== packageJson.version) {
    fail('expected version ' + expectedVersion + ' does not match package.json version ' + packageJson.version)
  }
  const source = gitSource()
  if (expectedRevision && source.revision !== expectedRevision) fail('expected revision ' + expectedRevision + ' does not match git HEAD ' + source.revision)
  if (requireClean && !expectedRevision) fail('--require-clean also requires --expected-revision <full-git-object-id>')
  if (requireClean && !source.clean) fail('release artifact build requires HEAD-bound clean source bytes' + (source.integrityError ? ': ' + source.integrityError : ''))
  assertSafeOutput(out)

  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'dshr-release-artifacts-'))
  try {
    const packSource = requireClean
      ? createHeadSnapshot(repositoryRoot, path.join(stage, 'head-source'), source.headEntries)
      : repositoryRoot
    const packed = runPack(stage, packSource)
    const tarball = path.join(stage, packed.filename)
    if (!fs.existsSync(tarball)) fail('npm pack did not create ' + packed.filename)
    const tarballBytes = fs.readFileSync(tarball)
    validatePackedManifest(packed, tarballBytes)

    const sourceAfterPack = gitSource()
    if (sourceAfterPack.revision !== source.revision || sourceAfterPack.clean !== source.clean) {
      fail('git source changed while npm pack was running; discard these artifacts and retry from a stable worktree')
    }
    if (expectedRevision && sourceAfterPack.revision !== expectedRevision) fail('git HEAD changed while npm pack was running')
    if (requireClean && !sourceAfterPack.clean) fail('release worktree became dirty while npm pack was running')
    if (requireClean) {
      verifyHeadSnapshot(packSource, sourceAfterPack.headEntries)
      for (const entry of packed.files) {
        if (!sourceAfterPack.headFiles.has(entry.path)) fail('packed file is not present in the bound git revision: ' + entry.path)
      }
    }

    const tarballSha256 = digest('sha256', tarballBytes)
    const manifest = {
      schema: 'dsh-researcher/release-package-manifest/v1',
      source: {
        git_revision: source.revision,
        worktree_clean: source.clean,
      },
      package: {
        name: packed.name,
        version: packed.version,
        filename: packed.filename,
        sha256: tarballSha256,
        npm_shasum_sha1: packed.shasum,
        npm_integrity_sha512: packed.integrity,
        size: packed.size,
        unpacked_size: packed.unpackedSize,
        entry_count: packed.entryCount,
        node_requirement: packageJson.engines && packageJson.engines.node,
      },
      files: packed.files.map(({ path: filePath, size, mode }) => ({ path: filePath, size, mode })),
    }
    const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n')
    const checksums = [
      tarballSha256 + ' *' + packed.filename,
      digest('sha256', manifestBytes) + ' *package-manifest.json',
      '',
    ].join('\n')

    fs.mkdirSync(out, { recursive: true })
    assertSafeOutput(out)
    fs.copyFileSync(tarball, path.join(out, packed.filename), fs.constants.COPYFILE_EXCL)
    fs.writeFileSync(path.join(out, 'package-manifest.json'), manifestBytes, { flag: 'wx' })
    fs.writeFileSync(path.join(out, 'SHA256SUMS'), checksums, { flag: 'wx' })

    return { out, filename: packed.filename, sha256: tarballSha256, entryCount: packed.entryCount }
  } finally {
    fs.rmSync(stage, { recursive: true, force: true })
  }
}

const main = () => {
  try {
    const result = buildArtifacts(parseArguments(process.argv.slice(2)))
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  } catch (error) {
    process.stderr.write('release artifact build failed: ' + error.message + '\n')
    process.exitCode = 1
  }
}

if (require.main === module) main()

module.exports = { REQUIRED_PACKAGE_FILES, buildArtifacts, parseArguments, inspectGitSource, createHeadSnapshot, verifyHeadSnapshot }
