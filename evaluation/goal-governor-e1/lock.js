#!/usr/bin/env node
'use strict'

// Run locks are created and verified entirely offline. A lock intentionally has
// no timestamp so identical frozen inputs produce identical bytes and hash.
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

const EVAL_ROOT = __dirname
const REPO_ROOT = path.resolve(EVAL_ROOT, '..', '..')
const MANIFEST_PATH = path.join(EVAL_ROOT, 'manifest.json')

const toRepoPath = (absolute) => path.relative(REPO_ROOT, absolute).split(path.sep).join('/')

const git = (args) => {
  const result = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error('git ' + args.join(' ') + ' failed: ' + String(result.stderr || result.stdout).trim())
  return String(result.stdout).trim()
}

const repositoryRevision = () => git(['rev-parse', '--verify', 'HEAD'])

const assertFrozenInputsClean = (manifest) => {
  const paths = manifest.lock_inputs.map((value) => value.replace(/\\/g, '/'))
  const tracked = spawnSync('git', ['diff', '--quiet', 'HEAD', '--', ...paths], { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true })
  if (tracked.error) throw tracked.error
  if (tracked.status !== 0) throw new Error('lock inputs contain tracked changes; commit them before creating or verifying a live run-lock')
  const untracked = git(['ls-files', '--others', '--exclude-standard', '--', ...paths])
  if (untracked !== '') throw new Error('lock inputs contain untracked files; commit them before creating or verifying a live run-lock: ' + untracked.split(/\r?\n/).slice(0, 5).join(', '))
}

const collectInputs = (manifest) => {
  const inputs = {}
  const declaredPaths = manifest.lock_inputs.map((value) => value.replace(/\\/g, '/'))
  for (const declared of manifest.lock_inputs) {
    const absolute = assertWithin(REPO_ROOT, path.resolve(REPO_ROOT, declared), 'lock input')
    if (!fs.existsSync(absolute)) throw new Error('lock input is missing: ' + declared)
    const stat = fs.lstatSync(absolute)
    if (!stat.isFile() && !stat.isDirectory()) throw new Error('lock input is not a regular file or directory: ' + declared)
  }
  const tracked = git(['ls-files', '--cached', '--', ...declaredPaths]).split(/\r?\n/).filter(Boolean)
  if (tracked.length === 0) throw new Error('lock inputs resolve to no tracked files')
  for (const relative of tracked) {
    const absolute = assertWithin(REPO_ROOT, path.resolve(REPO_ROOT, relative), 'tracked lock input')
    const stat = fs.lstatSync(absolute)
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('tracked lock input must be a regular file: ' + relative)
    inputs[toRepoPath(absolute)] = sha256File(absolute)
  }
  return Object.fromEntries(Object.entries(inputs).sort(([left], [right]) => left.localeCompare(right)))
}

const candidatePathFromLock = (lock) => path.isAbsolute(lock.candidate.package_path)
  ? path.resolve(lock.candidate.package_path)
  : assertWithin(REPO_ROOT, path.resolve(REPO_ROOT, lock.candidate.package_path), 'candidate package')

const createRunLock = (options) => {
  const manifest = validateManifest(readJson(MANIFEST_PATH))
  assertFrozenInputsClean(manifest)
  const head = repositoryRevision()
  const requestedRevision = requireString(options.candidateRevision, '--candidate-revision')
  if (requestedRevision !== head) throw new Error('--candidate-revision must exactly equal host-observed git HEAD ' + head)
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
    inputs: collectInputs(manifest),
    candidate: {
      repo_revision: head,
      package_path: storedCandidate,
      package_sha256: sha256File(candidatePackage),
      package_version: repoPackage.version,
    },
    runtime: JSON.parse(JSON.stringify(manifest.runtime)),
    model: {
      provider: requireString(options.provider, '--provider'),
      model: requireString(options.model, '--model'),
      reasoning_effort: requireString(options.reasoningEffort, '--reasoning-effort'),
    },
    budget: {
      max_tokens: manifest.budget.max_tokens,
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
  return lock
}

const verifyRunLock = (lockPath, options = {}) => {
  const lock = validateRunLockShape(readJson(path.resolve(lockPath)))
  const normative = JSON.parse(JSON.stringify(lock))
  delete normative.lock_hash
  if (hashJson(normative) !== lock.lock_hash) throw new Error('run-lock lock_hash does not match its canonical content')
  const manifest = validateManifest(readJson(MANIFEST_PATH))
  assertFrozenInputsClean(manifest)
  if (repositoryRevision() !== lock.candidate.repo_revision) throw new Error('current git HEAD does not match the host-owned run-lock candidate revision')
  if (sha256File(MANIFEST_PATH) !== lock.manifest_sha256) throw new Error('run-lock manifest hash drifted')
  if (canonicalize(collectInputs(manifest)) !== canonicalize(lock.inputs)) throw new Error('run-lock frozen input hashes drifted')
  if (canonicalize(lock.runtime) !== canonicalize(manifest.runtime)) throw new Error('run-lock runtime drifted from manifest')
  const frozenBudget = { max_tokens: manifest.budget.max_tokens, max_time_sec: manifest.budget.max_time_sec }
  if (canonicalize(lock.budget) !== canonicalize(frozenBudget)) throw new Error('run-lock budget drifted from manifest')
  const candidatePackage = candidatePathFromLock(lock)
  if (!fs.existsSync(candidatePackage) || !fs.statSync(candidatePackage).isFile()) throw new Error('run-lock candidate package is missing: ' + candidatePackage)
  if (sha256File(candidatePackage) !== lock.candidate.package_sha256) throw new Error('run-lock candidate package hash drifted')
  const repoPackage = readJson(path.join(REPO_ROOT, 'package.json'))
  if (repoPackage.version !== lock.candidate.package_version) throw new Error('run-lock candidate package version drifted from repository package.json')
  if (options.dshModuleRoot) {
    assertSameProvenance(currentNodeProvenance(), lock.host_runtime.node, 'Node runtime')
    const actualDsh = publicDshProvenance(dshRuntimeProvenance(options.dshModuleRoot))
    assertSameProvenance(actualDsh, lock.host_runtime.dsh, 'DSH dependency closure')
  }
  return { lock, manifest, candidatePackage }
}

const usage = () => [
  'Offline E1 run-lock utility:',
  '  node lock.js create --out <external-file> --candidate-package <tgz> --candidate-revision <git-revision> --provider <id> --model <id> --reasoning-effort <level> --dsh-module-root <node_modules> --visible-tools-snapshot <json>',
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
    const output = path.resolve(requireString(args.out, '--out'))
    const relative = path.relative(REPO_ROOT, output)
    if (relative === '' || (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))) throw new Error('--out must be outside the repository so the run-lock cannot hash itself')
    if (fs.existsSync(output)) throw new Error('refusing to overwrite existing run-lock: ' + output)
    const lock = createRunLock({
      candidatePackage: args['candidate-package'],
      candidateRevision: args['candidate-revision'],
      provider: args.provider,
      model: args.model,
      reasoningEffort: args['reasoning-effort'],
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

module.exports = { collectInputs, createRunLock, verifyRunLock, candidatePathFromLock, repositoryRevision, assertFrozenInputsClean }
