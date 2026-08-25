#!/usr/bin/env node
'use strict'

// Cross-platform lifecycle manager for the DSH presets. The PowerShell and
// Bash entry points delegate here so install, backup, uninstall, and rollback
// have one fail-closed implementation.

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const REPOSITORY = path.join(__dirname, '..')
const PACKAGE = require(path.join(REPOSITORY, 'package.json'))
const { VERIFIED_DSH, DSH_NODE_RANGE, assertDshNodeSupported } = require('../lib/runtime-requirements.js')
const TARGET_NAMES = ['researcher', 'governed']
const ACTIONS = new Set(['install', 'backup', 'uninstall', 'rollback'])
const DSH_HOME = path.resolve(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'))
const TARGET_ROOT = path.join(DSH_HOME, '.agent-presets')
const STATE_ROOT = path.join(DSH_HOME, '.dsh-researcher')
const BACKUP_ROOT = path.join(STATE_ROOT, 'backups')
const STAGING_ROOT = path.join(STATE_ROOT, 'staging')
const LOCK_FILE = path.join(STATE_ROOT, 'lifecycle.lock')
const SOURCES = {
  researcher: path.join(REPOSITORY, 'researcher'),
  governed: path.join(REPOSITORY, 'governed'),
}
const INSTALL_SOURCES = {
  ...SOURCES,
  lib: path.join(REPOSITORY, 'lib'),
  schemas: path.join(REPOSITORY, 'schemas'),
}
const TARGETS = Object.fromEntries(TARGET_NAMES.map((name) => [name, path.join(TARGET_ROOT, name)]))
const SNAPSHOT_SCHEMA = 'dsh-researcher/preset-backup/v1'
const LOCK_SCHEMA = 'dsh-researcher/installer-lock/v1'

const fail = (message) => { throw new Error(message) }

const usage = () => `dsh-researcher ${PACKAGE.version}

Usage:
  dsh-researcher [install] [--force] [--dry-run] [--allow-unsupported-dsh]
  dsh-researcher backup [--dry-run]
  dsh-researcher uninstall [--dry-run]
  dsh-researcher rollback [--backup-id <id>] [--dry-run]

Lifecycle:
  install     Install both presets. Existing targets require --force.
  backup      Snapshot the current researcher/governed target state.
  uninstall   Snapshot first, then remove both installed presets.
  rollback    Snapshot current state, then restore a complete backup.

Safety options:
  --dry-run                Validate without writing installer-owned paths.
  --allow-unsupported-dsh  UNSAFE: install when exact DSH ${VERIFIED_DSH}
                           compatibility cannot be established.
  --dsh-package <path>     Verify an explicit @deepseek-ai/dsh package.json
                           when the pinned CLI reports no version.
  Runtime                  DSH requires Node ${DSH_NODE_RANGE}.
  --backup-id <id>         Restore this backup instead of the newest one.
  --force                  Replace existing targets after taking a backup.
  --help                    Show this help.
`

const parseArguments = (argv) => {
  const options = {
    action: 'install',
    actionExplicit: false,
    dryRun: false,
    force: false,
    allowUnsupportedDsh: false,
    dshPackage: null,
    backupId: null,
    help: false,
    version: false,
  }
  const seen = new Set()
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (ACTIONS.has(token)) {
      if (options.actionExplicit) fail('multiple lifecycle actions were provided')
      options.action = token
      options.actionExplicit = true
      continue
    }
    if (token === '--help' || token === '-h') { options.help = true; continue }
    if (token === '--version') { options.version = true; continue }
    if (['--dry-run', '--force', '--allow-unsupported-dsh'].includes(token)) {
      if (seen.has(token)) fail('duplicate option: ' + token)
      seen.add(token)
      if (token === '--dry-run') options.dryRun = true
      if (token === '--force') options.force = true
      if (token === '--allow-unsupported-dsh') options.allowUnsupportedDsh = true
      continue
    }
    if (token === '--backup-id') {
      if (seen.has(token)) fail('duplicate option: ' + token)
      const value = argv[index + 1]
      if (!value || value.startsWith('-')) fail('--backup-id requires a backup id')
      options.backupId = value
      seen.add(token)
      index += 1
      continue
    }
    if (token === '--dsh-package') {
      if (seen.has(token)) fail('duplicate option: ' + token)
      const value = argv[index + 1]
      if (!value || value.startsWith('-')) fail('--dsh-package requires an absolute package.json path')
      options.dshPackage = value
      seen.add(token)
      index += 1
      continue
    }
    fail('unknown argument: ' + token)
  }
  if (!options.help && !options.version) {
    if (options.force && options.action !== 'install') fail('--force is only valid with install')
    if (options.allowUnsupportedDsh && options.action !== 'install') fail('--allow-unsupported-dsh is only valid with install')
    if (options.dshPackage && options.action !== 'install') fail('--dsh-package is only valid with install')
    if (options.backupId && options.action !== 'rollback') fail('--backup-id is only valid with rollback')
    if (options.backupId && !isBackupId(options.backupId)) fail('invalid backup id: ' + options.backupId)
  }
  return options
}

const lstatIfPresent = (target) => {
  try { return fs.lstatSync(target) } catch (error) {
    if (error && error.code === 'ENOENT') return null
    throw error
  }
}

const assertPlainDirectory = (target, label, allowMissing = true) => {
  const stat = lstatIfPresent(target)
  if (!stat) {
    if (allowMissing) return false
    fail(label + ' does not exist: ' + target)
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail(label + ' must be a real directory, not a symlink, junction, or file: ' + target)
  }
  return true
}

const ensurePlainDirectory = (target, label) => {
  if (!lstatIfPresent(target)) fs.mkdirSync(target, { recursive: true })
  assertPlainDirectory(target, label, false)
}

const validateRuntimeRoots = () => {
  assertPlainDirectory(DSH_HOME, 'DSH_HOME')
  assertPlainDirectory(TARGET_ROOT, 'preset root')
  assertPlainDirectory(STATE_ROOT, 'installer state root')
  assertPlainDirectory(BACKUP_ROOT, 'backup root')
  assertPlainDirectory(STAGING_ROOT, 'staging root')
  for (const name of TARGET_NAMES) assertPlainDirectory(TARGETS[name], name + ' target')
}

const validateSources = () => {
  for (const name of TARGET_NAMES) {
    assertPlainDirectory(SOURCES[name], name + ' preset source', false)
    if (!fs.existsSync(path.join(SOURCES[name], 'agent.cordis.yml'))) {
      fail('preset source is incomplete: ' + SOURCES[name])
    }
  }
  for (const name of ['lib', 'schemas']) assertPlainDirectory(path.join(REPOSITORY, name), name + ' source', false)
}

const validateInstallSourceTrees = (sources = INSTALL_SOURCES, inventoryFn = treeInventory) => {
  for (const name of ['researcher', 'governed', 'lib', 'schemas']) assertPlainDirectory(sources[name], name + ' source', false)
  for (const name of ['researcher', 'governed']) {
    if (!fs.existsSync(path.join(sources[name], 'agent.cordis.yml'))) fail('preset source is incomplete: ' + sources[name])
  }
  const inventories = {}
  for (const name of ['researcher', 'governed', 'lib', 'schemas']) inventories[name] = inventoryFn(sources[name])
  return { sources, inventories }
}

const targetStatuses = () => Object.fromEntries(TARGET_NAMES.map((name) => [name, lstatIfPresent(TARGETS[name]) ? 'present' : 'absent']))
const hasPresentTarget = (statuses) => TARGET_NAMES.some((name) => statuses[name] === 'present')

const treeInventory = (root, fsOps = fs) => {
  const entries = []
  const visit = (directory, prefix) => {
    const children = fsOps.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
    for (const child of children) {
      const absolute = path.join(directory, child.name)
      const relative = prefix ? prefix + '/' + child.name : child.name
      const stat = fsOps.lstatSync(absolute)
      if (stat.isSymbolicLink()) fail('managed trees and backups must not contain symbolic links or junctions: ' + absolute)
      if (stat.isDirectory()) {
        entries.push({ path: relative, type: 'directory' })
        visit(absolute, relative)
        continue
      }
      if (!stat.isFile()) fail('managed trees and backups must contain only regular files and directories: ' + absolute)
      const bytes = fsOps.readFileSync(absolute)
      entries.push({ path: relative, type: 'file', size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') })
    }
  }
  visit(root, '')
  return entries
}

const sameInventory = (left, right) => JSON.stringify(left) === JSON.stringify(right)

const validatePresentTargetTrees = (statuses) => {
  for (const name of TARGET_NAMES) {
    if (statuses[name] === 'present') treeInventory(TARGETS[name])
  }
}

const parseDshVersions = (raw) => [...new Set(
  [...String(raw || '').matchAll(/v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)/g)].map((match) => match[1]),
)]

const parseDshVersion = (raw) => parseDshVersions(raw)[0] || null

const packageMetadata = (packageFile, origin) => {
  const absolute = path.resolve(packageFile)
  if (!path.isAbsolute(packageFile)) return { compatible: false, exists: true, detail: origin + ' DSH package path must be absolute' }
  let stat
  try { stat = lstatIfPresent(absolute) } catch (error) {
    return { compatible: false, exists: true, detail: origin + ' package.json could not be inspected: ' + absolute + ' (' + error.code + ')' }
  }
  if (!stat) return { compatible: false, exists: false, detail: origin + ' package.json was not found at ' + absolute }
  if (stat.isSymbolicLink() || !stat.isFile()) return { compatible: false, exists: true, detail: origin + ' package.json is not a real regular file: ' + absolute }
  const packageRoot = path.dirname(absolute)
  let rootStat
  try { rootStat = lstatIfPresent(packageRoot) } catch (error) {
    return { compatible: false, exists: true, detail: origin + ' package root could not be inspected: ' + packageRoot + ' (' + error.code + ')' }
  }
  if (!rootStat || rootStat.isSymbolicLink() || !rootStat.isDirectory()) return { compatible: false, exists: true, detail: origin + ' package root is not a real directory: ' + packageRoot }
  let metadata
  try { metadata = JSON.parse(fs.readFileSync(absolute, 'utf8')) } catch (error) {
    return { compatible: false, exists: true, detail: origin + ' package.json is unreadable or invalid JSON: ' + absolute }
  }
  if (metadata.name !== '@deepseek-ai/dsh') return { compatible: false, exists: true, detail: origin + ' package name is ' + JSON.stringify(metadata.name) + ', expected "@deepseek-ai/dsh"' }
  const binRelative = typeof metadata.bin === 'string' ? metadata.bin : metadata.bin && metadata.bin.dsh
  const hasDshBin = typeof binRelative === 'string' && binRelative.length > 0
  if (!hasDshBin) return { compatible: false, exists: true, detail: origin + ' package does not declare a dsh executable' }
  if (path.isAbsolute(binRelative)) return { compatible: false, exists: true, detail: origin + ' package dsh executable must be relative to its package root' }
  const binFile = path.resolve(packageRoot, binRelative)
  const relativeBin = path.relative(packageRoot, binFile)
  if (!relativeBin || relativeBin.startsWith('..' + path.sep) || path.isAbsolute(relativeBin)) {
    return { compatible: false, exists: true, detail: origin + ' package dsh executable escapes its package root' }
  }
  let binStat
  try { binStat = lstatIfPresent(binFile) } catch (error) {
    return { compatible: false, exists: true, detail: origin + ' package dsh executable could not be inspected: ' + binFile + ' (' + error.code + ')' }
  }
  if (!binStat || binStat.isSymbolicLink() || !binStat.isFile()) {
    return { compatible: false, exists: true, detail: origin + ' package dsh executable is not a real regular file: ' + binFile }
  }
  try {
    const realRoot = fs.realpathSync(packageRoot)
    const realBin = fs.realpathSync(binFile)
    const realRelative = path.relative(realRoot, realBin)
    if (!realRelative || realRelative.startsWith('..' + path.sep) || path.isAbsolute(realRelative)) {
      return { compatible: false, exists: true, detail: origin + ' package dsh executable resolves outside its package root' }
    }
  } catch (error) {
    return { compatible: false, exists: true, detail: origin + ' package dsh executable could not be resolved: ' + binFile }
  }
  if (metadata.version !== VERIFIED_DSH) return { compatible: false, exists: true, detected: metadata.version, detail: origin + ' package version is ' + JSON.stringify(metadata.version) + ', expected exactly ' + VERIFIED_DSH }
  return {
    compatible: true,
    exists: true,
    detected: metadata.version,
    detail: 'DSH ' + metadata.version + ' from ' + origin + ' package metadata',
    packageFile: absolute,
    binFile,
    binRelative,
  }
}

const pathValue = () => {
  const key = Object.keys(process.env).find((name) => name.toLowerCase() === 'path')
  return key ? String(process.env[key] || '') : ''
}

const pathExtValue = () => {
  const key = Object.keys(process.env).find((name) => name.toLowerCase() === 'pathext')
  return key ? String(process.env[key] || '') : ''
}

const windowsDshNames = (rawPathExt) => {
  const configured = String(rawPathExt || '.COM;.EXE;.BAT;.CMD').split(';')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => /^\.[a-z0-9]+$/.test(item))
  const extensions = [...new Set([...configured, '.ps1', ''])]
  return extensions.map((extension) => 'dsh' + extension)
}

const resolveDshOnPath = (options = {}) => {
  const platform = options.platform || process.platform
  const searchPath = options.pathValue === undefined ? pathValue() : String(options.pathValue || '')
  const delimiter = platform === 'win32' ? ';' : ':'
  const names = platform === 'win32'
    ? windowsDshNames(options.pathExtValue === undefined ? pathExtValue() : options.pathExtValue)
    : ['dsh']
  for (const rawDirectory of searchPath.split(delimiter)) {
    const unquoted = rawDirectory.length >= 2 && rawDirectory.startsWith('"') && rawDirectory.endsWith('"')
      ? rawDirectory.slice(1, -1)
      : rawDirectory
    // Empty and relative PATH entries mean "the current directory" on common
    // shells. Never execute a repository-local lookalike during a dry-run.
    if (!unquoted || !path.isAbsolute(unquoted)) continue
    const directory = path.resolve(unquoted)
    for (const name of names) {
      const candidate = path.join(directory, name)
      let stat
      try { stat = lstatIfPresent(candidate) } catch (error) { continue }
      if (!stat) continue
      if (stat.isFile()) return candidate
      if (stat.isSymbolicLink()) {
        try { if (fs.statSync(candidate).isFile()) return candidate } catch (error) { /* broken link: ignore */ }
      }
    }
  }
  return null
}

const packageCandidatesNearShim = (shim) => {
  const candidates = []
  let cursor = path.dirname(shim)
  for (let depth = 0; depth < 7; depth += 1) {
    candidates.push(path.join(cursor, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'))
    candidates.push(path.join(cursor, '@deepseek-ai', 'dsh', 'package.json'))
    if (path.basename(cursor).toLowerCase() === 'dsh' && path.basename(path.dirname(cursor)).toLowerCase() === '@deepseek-ai') {
      candidates.push(path.join(cursor, 'package.json'))
    }
    const parent = path.dirname(cursor)
    if (parent === cursor) break
    cursor = parent
  }
  return candidates
}

const shimBindsPackage = (shim, assessment) => {
  if (!assessment.compatible) return false
  let shimStat
  try { shimStat = fs.lstatSync(shim) } catch (error) { return false }
  if (shimStat.isSymbolicLink()) {
    try { return fs.realpathSync(shim) === fs.realpathSync(assessment.binFile) } catch (error) { return false }
  }
  if (!shimStat.isFile() || shimStat.size > 128 * 1024) return false
  const extension = path.extname(shim).toLowerCase()
  if (extension === '.exe' || extension === '.com') return false
  // Metadata fallback supports only the canonical cmd-shim program emitted by
  // the npm version used by the verified DSH distribution. A substring in a
  // comment, echo, dead label, or arbitrary PowerShell program is not a
  // binding. Other shim formats must use --dsh-package explicitly.
  if (!['.cmd', '.bat'].includes(extension)) return false
  let source
  try { source = fs.readFileSync(shim, 'utf8') } catch (error) { return false }
  const lines = source.split(/\r?\n/)
    .map((line) => line.trim().replace(/\\/g, '/').replace(/\s+/g, ' ').toLowerCase())
    .filter(Boolean)
  const prefix = [
    '@echo off',
    'goto start',
    ':find_dp0',
    'set dp0=%~dp0',
    'exit /b',
    ':start',
    'setlocal',
    'call :find_dp0',
    'if exist "%dp0%/node.exe" (',
    'set "_prog=%dp0%/node.exe"',
    ') else (',
    'set "_prog=node"',
    'set pathext=%pathext:;.js;=;%',
    ')',
  ]
  if (lines.length !== prefix.length + 1 || prefix.some((line, index) => lines[index] !== line)) return false
  const relativeBin = assessment.binRelative.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()
  const invocation = 'endlocal & goto #_undefined_# 2>nul || title %comspec% & "%_prog%" "%dp0%/node_modules/@deepseek-ai/dsh/' + relativeBin + '" %*'
  return lines[prefix.length] === invocation
}

const packageBoundToShim = (shim) => {
  const seen = new Set()
  const rejected = []
  for (const candidate of packageCandidatesNearShim(shim)) {
    const key = process.platform === 'win32' ? path.resolve(candidate).toLowerCase() : path.resolve(candidate)
    if (seen.has(key)) continue
    seen.add(key)
    const assessment = packageMetadata(candidate, 'PATH-resolved shim')
    if (!assessment.exists) continue
    if (!assessment.compatible) {
      rejected.push(assessment.detail)
      continue
    }
    if (!shimBindsPackage(shim, assessment)) {
      rejected.push('PATH-resolved shim is not bound to the declared @deepseek-ai/dsh executable: ' + shim)
      continue
    }
    assessment.detail = 'DSH ' + assessment.detected + ' from package metadata bound to PATH shim ' + shim
    assessment.shim = shim
    return assessment
  }
  return { compatible: false, detected: null, detail: rejected[0] || 'no @deepseek-ai/dsh package metadata is bound to PATH shim ' + shim }
}

const detectDsh = (options = {}) => {
  // An explicit package binding is also the opt-out from executing an
  // external CLI during preflight. Synthetic callers may still provide a
  // cliResult/resolvedShim to exercise CLI-evidence adjudication directly.
  if (options.explicitPackage && options.cliResult === undefined && options.resolvedShim === undefined) {
    return packageMetadata(options.explicitPackage, 'explicit')
  }
  const platform = options.platform || process.platform
  const shim = options.resolvedShim === undefined
    ? resolveDshOnPath({ platform, pathValue: options.pathValue })
    : options.resolvedShim
  let result = options.cliResult
  if (!result && shim) {
    const extension = path.extname(shim).toLowerCase()
    // Node cannot safely launch Windows npm cmd/PowerShell shims without a
    // command shell. Bind their bytes to the adjacent package metadata instead
    // of using shell:true or concatenating an untrusted path.
    result = platform === 'win32' && ['.cmd', '.bat', '.ps1'].includes(extension)
      ? { status: null, stdout: '', stderr: '', skippedShimExecution: true }
      : spawnSync(shim, ['--version'], { encoding: 'utf8', windowsHide: true })
  }
  if (!result) result = { status: null, stdout: '', stderr: '', error: { code: 'ENOENT' } }
  // A wrapper may print its own version on stdout and a different runtime or
  // dependency version on stderr. Treat both streams as one evidence surface
  // so a warning cannot hide an ambiguous DSH identity.
  const raw = [result.stdout, result.stderr]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n')
  const detectedVersions = parseDshVersions(raw)
  if (detectedVersions.length > 1) {
    return { compatible: false, detected: null, detail: 'dsh --version reported multiple different semantic versions: ' + detectedVersions.join(', ') }
  }
  const detected = detectedVersions[0] || null
  if (detected) {
    if (result.status !== 0) return { compatible: false, detected, detail: 'dsh --version reported a version but exited with status ' + result.status }
    if (detected !== VERIFIED_DSH) return { compatible: false, detected, detail: 'detected DSH ' + detected + ', expected exactly ' + VERIFIED_DSH }
    return { compatible: true, detected, detail: 'DSH ' + detected + ' from CLI output' }
  }
  if (result.error && result.error.code !== 'ENOENT') return { compatible: false, detected: null, detail: result.error.message }
  if (!result.error && !result.skippedShimExecution && result.status !== 0) return { compatible: false, detected: null, detail: 'dsh --version exited with status ' + result.status }

  // An unrelated global package is not proof that the user can invoke DSH.
  // Automatic metadata fallback is allowed only after a real CLI was found
  // and returned no parseable version. An explicit package path remains an
  // opt-in recovery path for installations whose shim is intentionally not on
  // PATH.
  if (!shim && result.error && result.error.code === 'ENOENT' && !options.explicitPackage) {
    return { compatible: false, detected: null, detail: 'dsh was not executable from PATH; automatic package metadata cannot substitute for a missing CLI' }
  }

  if (options.explicitPackage) return packageMetadata(options.explicitPackage, 'explicit')
  if (!options.disableAutomatic && shim) return packageBoundToShim(shim)
  const cliDetail = result.error && result.error.code === 'ENOENT' ? 'dsh was not executable from PATH' : 'dsh --version reported no parseable version'
  return { compatible: false, detected: null, detail: cliDetail + ' and no package metadata bound to the resolved shim was found' }
}

const requireCompatibleDsh = (allowUnsupported, explicitPackage) => {
  const assessment = detectDsh({ explicitPackage })
  if (assessment.compatible) return assessment
  if (!allowUnsupported) {
    fail(assessment.detail + '. Installation refused; use --allow-unsupported-dsh only for an isolated, explicitly unsupported test.')
  }
  process.stderr.write('UNSAFE OVERRIDE: ' + assessment.detail + '. Runtime compatibility is NOT certified.\n')
  return assessment
}

const newOperationId = () => {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('.', '')
  return stamp + '-' + process.pid + '-' + crypto.randomBytes(3).toString('hex')
}

function isBackupId (value) { return /^\d{8}T\d{9}Z-\d+-[a-f0-9]{6}$/.test(value) }

const acquireLifecycleLock = (action, options = {}) => {
  const stateRoot = options.stateRoot || STATE_ROOT
  const lockFile = options.lockFile || (options.stateRoot ? path.join(stateRoot, 'lifecycle.lock') : LOCK_FILE)
  ensurePlainDirectory(path.dirname(stateRoot), 'DSH_HOME')
  ensurePlainDirectory(stateRoot, 'installer state root')
  const token = crypto.randomBytes(16).toString('hex')
  const metadata = {
    schema: LOCK_SCHEMA,
    token,
    pid: process.pid,
    action,
    created_at: new Date().toISOString(),
    package_version: PACKAGE.version,
  }
  let descriptor
  try {
    descriptor = fs.openSync(lockFile, 'wx', 0o600)
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      let holder = 'existing lock metadata is unreadable'
      try {
        const parsed = JSON.parse(fs.readFileSync(lockFile, 'utf8'))
        holder = 'recorded action=' + String(parsed.action || 'unknown') + ', pid=' + String(parsed.pid || 'unknown') + ', created_at=' + String(parsed.created_at || 'unknown')
      } catch (readError) { /* fail closed on an unreadable or non-file lock */ }
      fail('installer lifecycle lock already exists at ' + lockFile + ' (' + holder + '). Stale locks are never removed automatically. Confirm no installer process is running, then remove this exact lock file manually before retrying.')
    }
    throw error
  }
  try {
    fs.writeFileSync(descriptor, JSON.stringify(metadata, null, 2) + '\n')
    fs.fsyncSync(descriptor)
  } catch (error) {
    try { fs.closeSync(descriptor) } catch (closeError) { /* preserve write error */ }
    fs.rmSync(lockFile, { force: true })
    throw error
  }
  fs.closeSync(descriptor)
  return { stateRoot, lockFile, token, metadata }
}

const releaseLifecycleLock = (lock) => {
  let installed
  try { installed = JSON.parse(fs.readFileSync(lock.lockFile, 'utf8')) } catch (error) {
    fail('installer lifecycle lock disappeared or became unreadable; refusing to remove an unverified lock at ' + lock.lockFile)
  }
  if (!installed || installed.schema !== LOCK_SCHEMA || installed.token !== lock.token) {
    fail('installer lifecycle lock ownership changed; refusing to remove another process lock at ' + lock.lockFile)
  }
  fs.rmSync(lock.lockFile, { force: false })
}

const withLifecycleLock = (action, operation, options = {}) => {
  const lock = acquireLifecycleLock(action, options)
  let result
  let operationError
  try { result = operation() } catch (error) { operationError = error }
  let releaseError
  try { releaseLifecycleLock(lock) } catch (error) { releaseError = error }
  if (operationError) {
    if (releaseError) operationError.message += '; lock release also failed: ' + releaseError.message
    throw operationError
  }
  if (releaseError) throw releaseError
  return result
}

const createBackup = (reason, dryRun = false) => {
  validateRuntimeRoots()
  const statuses = targetStatuses()
  const id = newOperationId()
  const manifest = {
    schema: SNAPSHOT_SCHEMA,
    id,
    created_at: new Date().toISOString(),
    reason,
    package_version: PACKAGE.version,
    targets: statuses,
    inventory: { researcher: [], governed: [] },
  }
  if (dryRun) return manifest

  ensurePlainDirectory(DSH_HOME, 'DSH_HOME')
  ensurePlainDirectory(STATE_ROOT, 'installer state root')
  ensurePlainDirectory(BACKUP_ROOT, 'backup root')
  const temporary = path.join(BACKUP_ROOT, '.tmp-' + id)
  const destination = path.join(BACKUP_ROOT, id)
  fs.mkdirSync(temporary, { recursive: false })
  try {
    for (const name of TARGET_NAMES) {
      if (statuses[name] !== 'present') continue
      const before = treeInventory(TARGETS[name])
      const copiedTarget = path.join(temporary, name)
      fs.cpSync(TARGETS[name], copiedTarget, { recursive: true, errorOnExist: true })
      const copied = treeInventory(copiedTarget)
      const after = treeInventory(TARGETS[name])
      if (!sameInventory(before, copied) || !sameInventory(copied, after)) fail(name + ' changed while its backup was being created')
      manifest.inventory[name] = copied
    }
    if (JSON.stringify(targetStatuses()) !== JSON.stringify(statuses)) fail('target presence changed while the backup was being created')
    fs.writeFileSync(path.join(temporary, '.complete.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
    fs.renameSync(temporary, destination)
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true })
    throw error
  }
  return manifest
}

const loadSnapshot = (id) => {
  if (!isBackupId(id)) fail('invalid backup id: ' + id)
  assertPlainDirectory(BACKUP_ROOT, 'backup root', false)
  const directory = path.join(BACKUP_ROOT, id)
  assertPlainDirectory(directory, 'backup', false)
  const manifestFile = path.join(directory, '.complete.json')
  if (!fs.existsSync(manifestFile)) fail('backup is incomplete (missing .complete.json): ' + id)
  let manifest
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) } catch (error) { fail('backup manifest is invalid JSON: ' + id) }
  if (!manifest || manifest.schema !== SNAPSHOT_SCHEMA || manifest.id !== id || !manifest.targets || !manifest.inventory) fail('backup manifest is invalid: ' + id)
  for (const name of TARGET_NAMES) {
    const status = manifest.targets[name]
    if (!['present', 'absent'].includes(status)) fail('backup has an invalid ' + name + ' status: ' + id)
    const snapshotTarget = path.join(directory, name)
    if (!Array.isArray(manifest.inventory[name])) fail('backup has no ' + name + ' inventory: ' + id)
    if (status === 'present') {
      assertPlainDirectory(snapshotTarget, name + ' backup', false)
      if (!sameInventory(treeInventory(snapshotTarget), manifest.inventory[name])) fail('backup ' + name + ' integrity does not match its manifest: ' + id)
    }
    if (status === 'absent' && lstatIfPresent(snapshotTarget)) fail('backup contradicts its absent ' + name + ' status: ' + id)
    if (status === 'absent' && manifest.inventory[name].length !== 0) fail('backup has inventory for absent ' + name + ': ' + id)
  }
  return { id, directory, manifest }
}

const selectSnapshot = (requestedId) => {
  if (requestedId) return loadSnapshot(requestedId)
  assertPlainDirectory(BACKUP_ROOT, 'backup root', false)
  const ids = fs.readdirSync(BACKUP_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isBackupId(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse()
  if (ids.length === 0) fail('no complete backup is available to roll back')
  return loadSnapshot(ids[0])
}

const createStage = () => {
  ensurePlainDirectory(DSH_HOME, 'DSH_HOME')
  ensurePlainDirectory(STATE_ROOT, 'installer state root')
  ensurePlainDirectory(STAGING_ROOT, 'staging root')
  const directory = path.join(STAGING_ROOT, newOperationId())
  fs.mkdirSync(directory, { recursive: false })
  return directory
}

const stageInstall = (sourceEvidence) => {
  const directory = createStage()
  const copyVerifiedTree = (name, target) => {
    const source = sourceEvidence.sources[name]
    const expected = sourceEvidence.inventories[name]
    const before = treeInventory(source)
    if (!sameInventory(before, expected)) fail(name + ' source changed after install preflight')
    fs.cpSync(source, target, { recursive: true, errorOnExist: true })
    const staged = treeInventory(target)
    const after = treeInventory(source)
    if (!sameInventory(before, staged) || !sameInventory(staged, after)) fail(name + ' source or stage changed while the install was being prepared')
  }
  try {
    copyVerifiedTree('researcher', path.join(directory, 'researcher'))
    copyVerifiedTree('governed', path.join(directory, 'governed'))
    const portable = path.join(directory, 'researcher', 'project-cognition')
    fs.mkdirSync(portable, { recursive: true })
    copyVerifiedTree('lib', path.join(portable, 'lib'))
    copyVerifiedTree('schemas', path.join(portable, 'schemas'))
    // Re-walk the final trees after composition so nested links introduced by
    // copy behavior or a concurrent source mutation cannot reach replacement.
    treeInventory(path.join(directory, 'researcher'))
    treeInventory(path.join(directory, 'governed'))
    return directory
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true })
    throw error
  }
}

const stageSnapshot = (snapshot) => {
  const directory = createStage()
  try {
    for (const name of TARGET_NAMES) {
      if (snapshot.manifest.targets[name] === 'present') {
        const source = path.join(snapshot.directory, name)
        const before = treeInventory(source)
        const target = path.join(directory, name)
        fs.cpSync(source, target, { recursive: true, errorOnExist: true })
        const copied = treeInventory(target)
        const after = treeInventory(source)
        if (!sameInventory(before, snapshot.manifest.inventory[name]) || !sameInventory(before, copied) || !sameInventory(copied, after)) {
          fail('backup ' + name + ' changed while it was staged for restore: ' + snapshot.id)
        }
      }
    }
    return directory
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true })
    throw error
  }
}

const emptyStage = () => createStage()

const assertSameDevice = (stage, targetRoot, statSync = fs.statSync) => {
  const stageDevice = statSync(stage).dev
  const targetDevice = statSync(targetRoot).dev
  if (stageDevice === undefined || stageDevice === null || targetDevice === undefined || targetDevice === null) {
    fail('could not establish that staging and preset roots share one filesystem device')
  }
  if (String(stageDevice) !== String(targetDevice)) {
    fail('staging and preset roots must share one filesystem device; refusing replacement before deleting any target')
  }
}

const validateReplacementStage = (stage, statuses, options = {}) => {
  const targetRoot = options.targetRoot || TARGET_ROOT
  const targets = options.targets || TARGETS
  assertPlainDirectory(stage, 'replacement stage', false)
  assertPlainDirectory(targetRoot, 'preset root', false)
  for (const name of TARGET_NAMES) {
    if (!['present', 'absent'].includes(statuses[name])) fail('invalid replacement status for ' + name)
    const staged = path.join(stage, name)
    if (statuses[name] === 'present') treeInventory(staged)
    if (statuses[name] === 'absent' && lstatIfPresent(staged)) fail('replacement stage unexpectedly contains absent target ' + name)
    if (!Object.hasOwn(targets, name)) fail('replacement target map is missing ' + name)
  }
  assertSameDevice(stage, targetRoot, options.statSync || fs.statSync)
}

const targetDrift = (message) => {
  const error = new Error(message)
  error.code = 'DSH_RESEARCHER_TARGET_DRIFT'
  throw error
}

const validateCurrentTargetsAgainstSnapshot = (manifest, targets = TARGETS) => {
  if (!manifest || !manifest.targets || !manifest.inventory) targetDrift('pre-operation snapshot is incomplete')
  const beforeStatuses = Object.fromEntries(TARGET_NAMES.map((name) => [name, lstatIfPresent(targets[name]) ? 'present' : 'absent']))
  if (JSON.stringify(beforeStatuses) !== JSON.stringify(manifest.targets)) targetDrift('managed target presence changed after the pre-operation snapshot')
  for (const name of TARGET_NAMES) {
    if (beforeStatuses[name] !== 'present') continue
    const first = treeInventory(targets[name])
    const second = treeInventory(targets[name])
    if (!sameInventory(first, manifest.inventory[name]) || !sameInventory(first, second)) {
      targetDrift(name + ' changed after the pre-operation snapshot')
    }
  }
  const afterStatuses = Object.fromEntries(TARGET_NAMES.map((name) => [name, lstatIfPresent(targets[name]) ? 'present' : 'absent']))
  if (JSON.stringify(afterStatuses) !== JSON.stringify(beforeStatuses)) targetDrift('managed target presence changed during final replacement preflight')
}

const replaceTargets = (stage, statuses, options = {}) => {
  const targetRoot = options.targetRoot || TARGET_ROOT
  const targets = options.targets || TARGETS
  if (!options.targetRoot && !options.targets) validateRuntimeRoots()
  ensurePlainDirectory(options.dshHome || DSH_HOME, 'DSH_HOME')
  ensurePlainDirectory(targetRoot, 'preset root')
  // This full preflight is intentionally before the first rmSync. In
  // particular, a cross-device stage can never become a delete-then-EXDEV.
  validateReplacementStage(stage, statuses, { targetRoot, targets, statSync: options.statSync })
  if (options.expectedCurrent) {
    try {
      validateCurrentTargetsAgainstSnapshot(options.expectedCurrent, targets)
    } catch (error) {
      if (error && error.code === 'DSH_RESEARCHER_TARGET_DRIFT') throw error
      targetDrift('managed targets could not be proven unchanged after the pre-operation snapshot: ' + error.message)
    }
  }
  const rmSync = options.rmSync || fs.rmSync
  const renameSync = options.renameSync || fs.renameSync
  for (const name of TARGET_NAMES) {
    if (lstatIfPresent(targets[name])) rmSync(targets[name], { recursive: true, force: false })
  }
  for (const name of TARGET_NAMES) {
    if (statuses[name] !== 'present') continue
    const staged = path.join(stage, name)
    assertPlainDirectory(staged, name + ' staged target', false)
    renameSync(staged, targets[name])
  }
}

const transactionalReplace = (stage, statuses, recoveryBackup) => {
  let boundRecovery
  try {
    boundRecovery = loadSnapshot(recoveryBackup.id)
  } catch (error) {
    fs.rmSync(stage, { recursive: true, force: true })
    throw error
  }
  try {
    replaceTargets(stage, statuses, { expectedCurrent: boundRecovery.manifest })
  } catch (originalError) {
    if (originalError && originalError.code === 'DSH_RESEARCHER_TARGET_DRIFT') {
      fail('operation aborted before replacement because managed targets drifted: ' + originalError.message)
    }
    try {
      const recovery = loadSnapshot(recoveryBackup.id)
      const recoveryStage = stageSnapshot(recovery)
      try { replaceTargets(recoveryStage, recovery.manifest.targets) } finally { fs.rmSync(recoveryStage, { recursive: true, force: true }) }
    } catch (recoveryError) {
      fail('operation failed and automatic recovery also failed: ' + originalError.message + '; recovery: ' + recoveryError.message)
    }
    fail('operation failed; the previous target state was restored from backup ' + recoveryBackup.id + ': ' + originalError.message)
  } finally {
    fs.rmSync(stage, { recursive: true, force: true })
  }
}

const printInstalledNextSteps = () => {
  console.log('Next steps:')
  console.log('  1. Certified research: select "Read Only", then "项目研究 Project Research"; the preset tightens approval to never (UI: Custom).')
  console.log('  2. Governed execution: select "目标治理编码 Governed Coding" and run /researcher run <approved-contract>.')
  console.log('  3. In Governed Coding, /researcher <question> is one read-only turn; /researcher on is persistent guarded mode.')
}

const runInstall = (options) => {
  assertDshNodeSupported()
  validateSources()
  // This inventory walk is part of dry-run too. It rejects nested symlinks,
  // junctions, special files, and unreadable source bytes before any write.
  const sourceEvidence = validateInstallSourceTrees()
  validateRuntimeRoots()
  const dsh = requireCompatibleDsh(options.allowUnsupportedDsh, options.dshPackage)
  const before = targetStatuses()
  if (hasPresentTarget(before) && !options.force) {
    fail('a target preset already exists; re-run with --force to replace both targets after an automatic backup')
  }
  if (options.dryRun) {
    validatePresentTargetTrees(before)
    console.log('[DRY RUN] DSH compatibility: ' + (dsh.compatible ? dsh.detail : 'unsupported override acknowledged: ' + dsh.detail))
    console.log('[DRY RUN] Would snapshot current targets and install both presets under ' + TARGET_ROOT)
    console.log('[DRY RUN] No installer-owned paths were written.')
    return
  }
  withLifecycleLock('install', () => {
    validateRuntimeRoots()
    const lockedBefore = targetStatuses()
    if (hasPresentTarget(lockedBefore) && !options.force) fail('a target preset appeared before the install lock was acquired; use --force only after reviewing it')
    const backup = createBackup('pre-install')
    const stage = stageInstall(sourceEvidence)
    transactionalReplace(stage, { researcher: 'present', governed: 'present' }, backup)
    console.log('Backup created: ' + backup.id)
    console.log('Installed "researcher" preset to ' + TARGETS.researcher)
    console.log('Installed "governed" preset to ' + TARGETS.governed)
    printInstalledNextSteps()
  })
}

const runBackup = (options) => {
  validateRuntimeRoots()
  const statuses = targetStatuses()
  if (options.dryRun) {
    validatePresentTargetTrees(statuses)
    console.log('[DRY RUN] Would snapshot researcher=' + statuses.researcher + ', governed=' + statuses.governed + ' under ' + BACKUP_ROOT)
    console.log('[DRY RUN] No installer-owned paths were written.')
    return
  }
  withLifecycleLock('backup', () => {
    const backup = createBackup('manual-backup')
    console.log('Backup created: ' + backup.id)
  })
}

const runUninstall = (options) => {
  validateRuntimeRoots()
  const before = targetStatuses()
  if (options.dryRun) {
    validatePresentTargetTrees(before)
    if (!hasPresentTarget(before)) {
      console.log('Nothing to uninstall; both managed preset targets are already absent.')
      console.log('[DRY RUN] No installer-owned paths were written.')
      return
    }
    console.log('[DRY RUN] Would snapshot current targets, then remove ' + TARGETS.researcher + ' and ' + TARGETS.governed)
    console.log('[DRY RUN] No installer-owned paths were written.')
    return
  }
  withLifecycleLock('uninstall', () => {
    const lockedBefore = targetStatuses()
    if (!hasPresentTarget(lockedBefore)) {
      console.log('Nothing to uninstall; both managed preset targets became absent before the lock was acquired.')
      return
    }
    const backup = createBackup('pre-uninstall')
    const stage = emptyStage()
    transactionalReplace(stage, { researcher: 'absent', governed: 'absent' }, backup)
    console.log('Backup created: ' + backup.id)
    console.log('Uninstalled both managed presets. Roll back with: dsh-researcher rollback --backup-id ' + backup.id)
  })
}

const runRollback = (options) => {
  validateRuntimeRoots()
  if (options.dryRun) {
    const snapshot = selectSnapshot(options.backupId)
    validatePresentTargetTrees(targetStatuses())
    console.log('[DRY RUN] Would restore backup ' + snapshot.id + ' (researcher=' + snapshot.manifest.targets.researcher + ', governed=' + snapshot.manifest.targets.governed + ').')
    console.log('[DRY RUN] Current targets would first be snapshotted; no installer-owned paths were written.')
    return
  }
  withLifecycleLock('rollback', () => {
    const lockedSnapshot = selectSnapshot(options.backupId)
    const recovery = createBackup('pre-rollback')
    const stage = stageSnapshot(lockedSnapshot)
    transactionalReplace(stage, lockedSnapshot.manifest.targets, recovery)
    console.log('Pre-rollback backup created: ' + recovery.id)
    console.log('Restored backup: ' + lockedSnapshot.id)
  })
}

const main = () => {
  try {
    const options = parseArguments(process.argv.slice(2))
    if (options.help) { process.stdout.write(usage()); return }
    if (options.version) { process.stdout.write(PACKAGE.version + '\n'); return }
    if (options.action === 'install') runInstall(options)
    if (options.action === 'backup') runBackup(options)
    if (options.action === 'uninstall') runUninstall(options)
    if (options.action === 'rollback') runRollback(options)
  } catch (error) {
    process.stderr.write('dsh-researcher: ' + error.message + '\n')
    process.exitCode = 1
  }
}

if (require.main === module) main()

module.exports = {
  VERIFIED_DSH,
  SNAPSHOT_SCHEMA,
  LOCK_SCHEMA,
  parseArguments,
  parseDshVersion,
  parseDshVersions,
  packageMetadata,
  detectDsh,
  resolveDshOnPath,
  shimBindsPackage,
  treeInventory,
  validateInstallSourceTrees,
  assertSameDevice,
  validateReplacementStage,
  replaceTargets,
  acquireLifecycleLock,
  releaseLifecycleLock,
  withLifecycleLock,
  isBackupId,
}
