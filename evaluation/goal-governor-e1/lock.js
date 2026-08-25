#!/usr/bin/env node
'use strict'

// Run locks are created and verified entirely offline. A lock intentionally has
// no timestamp so identical frozen inputs produce identical bytes and hash.
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const {
  RUN_LOCK_SCHEMA,
  assertWithin,
  canonicalize,
  hashJson,
  parseArgs,
  readJson,
  requireString,
  sha256File,
  validateManifest,
  validateRunLockShape,
  treeHash,
} = require('./lib.js')
const {
  NODE_ENV_DENYLIST,
  currentNodeProvenance,
  dshRuntimeProvenance,
  publicDshProvenance,
  assertSameProvenance,
} = require('./runtime-provenance.js')
const { validateCaptureReport } = require('./visible-tool-contract.js')
const { PROJECT_PACKAGE_NAME } = require('../../lib/runtime-requirements.js')

const EVAL_ROOT = __dirname
const REPO_ROOT = path.resolve(EVAL_ROOT, '..', '..')
const MANIFEST_PATH = path.join(EVAL_ROOT, 'manifest.json')

const gitAt = (root, args) => {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' },
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error('git ' + args.join(' ') + ' failed: ' + String(result.stderr || result.stdout).trim())
  return String(result.stdout).trim()
}

const git = (args) => gitAt(REPO_ROOT, args)

const repositoryRevision = () => git(['rev-parse', '--verify', 'HEAD'])

const gitBlobOid = (bytes, length) => crypto
  .createHash(length === 64 ? 'sha256' : 'sha1')
  .update(Buffer.from('blob ' + bytes.length + '\0'))
  .update(bytes)
  .digest('hex')

const parseTreeEntries = (raw, label) => {
  const entries = new Map()
  for (const row of raw.split('\0').filter(Boolean)) {
    const match = row.match(/^([0-7]{6}) ([a-z]+) ([a-f0-9]{40,64})\t(.+)$/)
    if (!match) throw new Error(label + ' contains an unparseable Git tree row')
    const [, mode, type, oid, file] = match
    if (entries.has(file)) throw new Error(label + ' contains duplicate path ' + file)
    entries.set(file, { mode, type, oid })
  }
  return entries
}

const parseIndexEntries = (raw) => {
  const entries = new Map()
  for (const row of raw.split('\0').filter(Boolean)) {
    const match = row.match(/^([0-7]{6}) ([a-f0-9]{40,64}) ([0-3])\t(.+)$/)
    if (!match) throw new Error('frozen input index contains an unparseable row')
    const [, mode, oid, stage, file] = match
    if (stage !== '0') throw new Error('frozen input index contains an unmerged entry: ' + file)
    if (entries.has(file)) throw new Error('frozen input index contains duplicate path ' + file)
    entries.set(file, { mode, oid })
  }
  return entries
}

const assertRealRegularFile = (root, relative) => {
  const absoluteRoot = path.resolve(root)
  const absolute = assertWithin(absoluteRoot, path.resolve(absoluteRoot, relative), 'tracked lock input')
  const parts = path.relative(absoluteRoot, absolute).split(path.sep).filter(Boolean)
  let cursor = absoluteRoot
  for (const part of parts) {
    cursor = path.join(cursor, part)
    const stat = fs.lstatSync(cursor)
    if (stat.isSymbolicLink()) throw new Error('tracked lock input path contains a symbolic link: ' + relative)
  }
  const stat = fs.lstatSync(absolute)
  if (!stat.isFile()) throw new Error('tracked lock input must be a regular file: ' + relative)
  return { absolute, stat }
}

// Do not use `git diff` as an integrity oracle here. Both assume-unchanged and
// skip-worktree can suppress a real working-tree change. Instead, bind the
// index and filtered working bytes independently to HEAD's tree entries, then
// reject every untracked path under a declared input without consulting ignore
// rules. This makes candidate.repo_revision describe the bytes actually locked.
const frozenInputSnapshot = (manifest, root = REPO_ROOT, expectedRevision = null) => {
  const absoluteRoot = path.resolve(root)
  const revision = gitAt(absoluteRoot, ['rev-parse', '--verify', 'HEAD'])
  if (expectedRevision && revision !== expectedRevision) throw new Error('git HEAD changed before frozen input inspection')
  const paths = manifest.lock_inputs.map((value) => value.replace(/\\/g, '/'))
  for (const declared of paths) {
    const absolute = assertWithin(absoluteRoot, path.resolve(absoluteRoot, declared), 'lock input')
    if (!fs.existsSync(absolute)) throw new Error('lock input is missing: ' + declared)
    const stat = fs.lstatSync(absolute)
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw new Error('lock input is not a real regular file or directory: ' + declared)
  }

  const head = parseTreeEntries(gitAt(absoluteRoot, ['ls-tree', '-r', '-z', '--full-tree', revision, '--', ...paths]), 'HEAD frozen inputs')
  if (head.size === 0) throw new Error('lock inputs resolve to no files tracked by HEAD')
  const index = parseIndexEntries(gitAt(absoluteRoot, ['ls-files', '--stage', '-z', '--', ...paths]))
  if (index.size !== head.size) throw new Error('frozen input index inventory differs from HEAD')

  const inputs = {}
  for (const [relative, expected] of head) {
    if (expected.type !== 'blob' || !['100644', '100755'].includes(expected.mode)) {
      throw new Error('frozen input HEAD entry is not a regular file: ' + relative + ' (' + expected.mode + ' ' + expected.type + ')')
    }
    const indexed = index.get(relative)
    if (!indexed || indexed.mode !== expected.mode || indexed.oid !== expected.oid) {
      throw new Error('frozen input index blob/mode differs from HEAD: ' + relative)
    }
    const { absolute, stat } = assertRealRegularFile(absoluteRoot, relative)
    if (process.platform !== 'win32') {
      const expectedExecutable = expected.mode === '100755'
      const actualExecutable = (stat.mode & 0o111) !== 0
      if (expectedExecutable !== actualExecutable) throw new Error('frozen input filesystem mode differs from HEAD: ' + relative)
    }
    const actualOid = gitBlobOid(fs.readFileSync(absolute), expected.oid.length)
    if (actualOid !== expected.oid) throw new Error('frozen input raw working bytes differ from HEAD blob: ' + relative)
    inputs[relative] = sha256File(absolute)
  }

  // Deliberately omit --exclude-standard: ignored files are still executable
  // input bytes and therefore invalidate a revision-bound live experiment.
  const untracked = gitAt(absoluteRoot, ['ls-files', '--others', '-z', '--', ...paths]).split('\0').filter(Boolean)
  if (untracked.length > 0) {
    throw new Error('lock inputs contain untracked or ignored files; commit or remove them before a live run-lock: ' + untracked.slice(0, 5).join(', '))
  }
  if (gitAt(absoluteRoot, ['rev-parse', '--verify', 'HEAD']) !== revision) throw new Error('git HEAD changed during frozen input inspection')
  return Object.fromEntries(Object.entries(inputs).sort(([left], [right]) => left.localeCompare(right)))
}

const assertFrozenInputsClean = (manifest, root = REPO_ROOT) => {
  frozenInputSnapshot(manifest, root)
}

const collectInputs = (manifest, root = REPO_ROOT, expectedRevision = null) => frozenInputSnapshot(manifest, root, expectedRevision)

const isWithin = (root, target) => {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
}

const lstatIfPresent = (file) => {
  try { return fs.lstatSync(file) } catch (error) {
    if (error && error.code === 'ENOENT') return null
    throw error
  }
}

const assertExternalRunLockOutput = (candidate, repository = REPO_ROOT) => {
  const repositoryAbsolute = path.resolve(repository)
  const repositoryReal = fs.realpathSync(repositoryAbsolute)
  const output = path.resolve(candidate)
  if (isWithin(repositoryAbsolute, output)) throw new Error('--out must be outside the repository so the run-lock cannot hash itself')
  if (lstatIfPresent(output)) throw new Error('refusing to overwrite existing run-lock: ' + output)

  const missing = [path.basename(output)]
  let ancestor = path.dirname(output)
  let stat = lstatIfPresent(ancestor)
  while (!stat) {
    const parent = path.dirname(ancestor)
    if (parent === ancestor) throw new Error('--out has no existing directory ancestor: ' + output)
    missing.unshift(path.basename(ancestor))
    ancestor = parent
    stat = lstatIfPresent(ancestor)
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('--out existing ancestor must be a real directory, not a symlink or junction: ' + ancestor)

  const chain = []
  for (let cursor = ancestor; ; cursor = path.dirname(cursor)) {
    chain.unshift(cursor)
    if (path.dirname(cursor) === cursor) break
  }
  for (const component of chain) {
    const componentStat = fs.lstatSync(component)
    if (componentStat.isSymbolicLink() || !componentStat.isDirectory()) {
      throw new Error('--out path must not traverse a symlink, junction, or non-directory ancestor: ' + component)
    }
  }

  const realOutput = path.resolve(fs.realpathSync(ancestor), ...missing)
  if (isWithin(repositoryReal, realOutput)) throw new Error('--out resolves inside the repository through a filesystem alias')
  return output
}

const candidatePathFromLock = (lock) => path.isAbsolute(lock.candidate.package_path)
  ? path.resolve(lock.candidate.package_path)
  : assertWithin(REPO_ROOT, path.resolve(REPO_ROOT, lock.candidate.package_path), 'candidate package')

const createRunLock = (options) => {
  const manifest = validateManifest(readJson(MANIFEST_PATH))
  const head = repositoryRevision()
  const requestedRevision = requireString(options.candidateRevision, '--candidate-revision')
  if (requestedRevision !== head) throw new Error('--candidate-revision must exactly equal host-observed git HEAD ' + head)
  const frozenInputs = collectInputs(manifest, REPO_ROOT, head)
  const candidatePackage = path.resolve(requireString(options.candidatePackage, '--candidate-package'))
  if (!fs.existsSync(candidatePackage) || !fs.statSync(candidatePackage).isFile()) throw new Error('--candidate-package must be an existing regular file')
  const repoPackage = readJson(path.join(REPO_ROOT, 'package.json'))
  const dshProvenance = dshRuntimeProvenance(requireString(options.dshModuleRoot, '--dsh-module-root'))
  if (dshProvenance.package_name !== '@deepseek-ai/dsh' || dshProvenance.package_version !== manifest.runtime.version) throw new Error('DSH module root does not contain the manifest-pinned runtime')
  const captureReport = validateCaptureReport(readJson(path.resolve(requireString(options.visibleToolsSnapshot, '--visible-tools-snapshot'))))
  assertSameProvenance(captureReport.node, currentNodeProvenance(), 'schema-capture Node runtime')
  assertSameProvenance(captureReport.dsh, publicDshProvenance(dshProvenance), 'schema-capture DSH dependency closure')
  if (captureReport.candidate.package_name !== repoPackage.name || captureReport.candidate.package_version !== repoPackage.version) throw new Error('schema-capture candidate identity/version differs from repository package.json')
  const visibleToolContract = captureReport.visible_tool_contract
  const relativeCandidate = path.relative(REPO_ROOT, candidatePackage)
  const storedCandidate = relativeCandidate && !relativeCandidate.startsWith('..' + path.sep) && !path.isAbsolute(relativeCandidate)
    ? relativeCandidate.split(path.sep).join('/')
    : candidatePackage
  const lock = {
    schema: RUN_LOCK_SCHEMA,
    manifest_sha256: sha256File(MANIFEST_PATH),
    inputs: frozenInputs,
    candidate: {
      repo_revision: head,
      package_name: repoPackage.name,
      package_path: storedCandidate,
      package_sha256: sha256File(candidatePackage),
      package_version: repoPackage.version,
    },
    runtime: JSON.parse(JSON.stringify(manifest.runtime)),
    cost_policy: JSON.parse(JSON.stringify(manifest.cost_policy)),
    model: {
      route: requireString(options.route, '--route'),
      provider: requireString(options.provider, '--provider'),
      model: requireString(options.model, '--model'),
      reasoning_effort: requireString(options.reasoningEffort, '--reasoning-effort'),
      base_url: requireString(options.baseUrl, '--base-url'),
    },
    budget: {
      max_tokens: manifest.budget.max_tokens,
      max_cache_read_tokens: manifest.budget.max_cache_read_tokens,
      max_request_attempts: manifest.budget.max_request_attempts,
      max_time_sec: manifest.budget.max_time_sec,
    },
    host_runtime: {
      node: currentNodeProvenance(),
      dsh: publicDshProvenance(dshProvenance),
      environment: {
        policy: 'sanitized-node-spawn-environment/v1',
        removed_names: [...NODE_ENV_DENYLIST],
      },
    },
    dsh_home_policy: {
      mode: 'fresh-empty-per-case',
      initial_inventory_sha256: treeHash([]),
      initial_file_count: 0,
    },
    visible_tool_contract: visibleToolContract,
  }
  lock.lock_hash = hashJson(lock)
  validateRunLockShape(lock)
  if (repositoryRevision() !== head) throw new Error('git HEAD changed while the run-lock was created')
  return lock
}

const verifyRunLock = (lockPath, options = {}) => {
  const lock = validateRunLockShape(readJson(path.resolve(lockPath)))
  const normative = JSON.parse(JSON.stringify(lock))
  delete normative.lock_hash
  if (hashJson(normative) !== lock.lock_hash) throw new Error('run-lock lock_hash does not match its canonical content')
  const manifest = validateManifest(readJson(MANIFEST_PATH))
  if (repositoryRevision() !== lock.candidate.repo_revision) throw new Error('current git HEAD does not match the host-owned run-lock candidate revision')
  const frozenInputs = collectInputs(manifest, REPO_ROOT, lock.candidate.repo_revision)
  if (sha256File(MANIFEST_PATH) !== lock.manifest_sha256) throw new Error('run-lock manifest hash drifted')
  if (canonicalize(frozenInputs) !== canonicalize(lock.inputs)) throw new Error('run-lock frozen input hashes drifted')
  if (canonicalize(lock.runtime) !== canonicalize(manifest.runtime)) throw new Error('run-lock runtime drifted from manifest')
  if (canonicalize(lock.cost_policy) !== canonicalize(manifest.cost_policy)) throw new Error('run-lock cost policy drifted from manifest')
  const frozenBudget = {
    max_tokens: manifest.budget.max_tokens,
    max_cache_read_tokens: manifest.budget.max_cache_read_tokens,
    max_request_attempts: manifest.budget.max_request_attempts,
    max_time_sec: manifest.budget.max_time_sec,
  }
  if (canonicalize(lock.budget) !== canonicalize(frozenBudget)) throw new Error('run-lock budget drifted from manifest')
  const candidatePackage = candidatePathFromLock(lock)
  if (!fs.existsSync(candidatePackage) || !fs.statSync(candidatePackage).isFile()) throw new Error('run-lock candidate package is missing: ' + candidatePackage)
  if (sha256File(candidatePackage) !== lock.candidate.package_sha256) throw new Error('run-lock candidate package hash drifted')
  const repoPackage = readJson(path.join(REPO_ROOT, 'package.json'))
  if (repoPackage.name !== lock.candidate.package_name || repoPackage.name !== PROJECT_PACKAGE_NAME || repoPackage.version !== lock.candidate.package_version) throw new Error('run-lock candidate package identity/version drifted from repository package.json')
  if (options.dshModuleRoot) {
    assertSameProvenance(currentNodeProvenance(), lock.host_runtime.node, 'Node runtime')
    const actualDsh = publicDshProvenance(dshRuntimeProvenance(options.dshModuleRoot))
    assertSameProvenance(actualDsh, lock.host_runtime.dsh, 'DSH dependency closure')
  }
  if (repositoryRevision() !== lock.candidate.repo_revision) throw new Error('git HEAD changed while the run-lock was verified')
  return { lock, manifest, candidatePackage }
}

const usage = () => [
  'Offline E1 run-lock utility:',
  '  node lock.js create --out <external-file> --candidate-package <tgz> --candidate-revision <git-revision> --route <deepseek-api|local-loopback> --provider <id> --model <id> --reasoning-effort <level> --base-url <resolved-adapter-base-url> --dsh-module-root <node_modules> --visible-tools-snapshot <json>',
  '  node lock.js verify --run-lock <file> --dsh-module-root <node_modules>',
].join('\n')

const main = () => {
  const args = parseArgs(process.argv.slice(2))
  const command = args._[0]
  if (!command || args.help === true) {
    process.stdout.write(usage() + '\n')
    return
  }
  if (command === 'create') {
    const output = assertExternalRunLockOutput(requireString(args.out, '--out'))
    const lock = createRunLock({
      candidatePackage: args['candidate-package'],
      candidateRevision: args['candidate-revision'],
      route: args.route,
      provider: args.provider,
      model: args.model,
      reasoningEffort: args['reasoning-effort'],
      baseUrl: args['base-url'],
      dshModuleRoot: args['dsh-module-root'],
      visibleToolsSnapshot: args['visible-tools-snapshot'],
    })
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, JSON.stringify(lock, null, 2) + '\n', { flag: 'wx' })
    process.stdout.write(JSON.stringify({ ok: true, offline: true, run_lock: output, lock_hash: lock.lock_hash }, null, 2) + '\n')
    return
  }
  if (command === 'verify') {
    const result = verifyRunLock(requireString(args['run-lock'], '--run-lock'), { dshModuleRoot: requireString(args['dsh-module-root'], '--dsh-module-root') })
    process.stdout.write(JSON.stringify({ ok: true, offline: true, lock_hash: result.lock.lock_hash, candidate_package: result.candidatePackage }, null, 2) + '\n')
    return
  }
  throw new Error('unknown command\n' + usage())
}

if (require.main === module) {
  try { main() } catch (error) {
    process.stderr.write('E1 run-lock: ' + error.message + '\n')
    process.exitCode = 1
  }
}

module.exports = { collectInputs, createRunLock, verifyRunLock, candidatePathFromLock, repositoryRevision, assertFrozenInputsClean, frozenInputSnapshot, assertExternalRunLockOutput }
