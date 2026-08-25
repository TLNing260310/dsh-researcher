'use strict'

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { supportsDshNode } = require('../lib/runtime-requirements.js')

const root = path.resolve(__dirname, '..')
const entry = path.join(root, 'bin', 'install.js')
const dshRuntimeTest = supportsDshNode(process.version) ? test : test.skip
const {
  VERIFIED_DSH,
  SNAPSHOT_SCHEMA,
  LOCK_SCHEMA,
  parseArguments,
  parseDshVersion,
  detectDsh,
  resolveDshOnPath,
  treeInventory,
  validateInstallSourceTrees,
  replaceTargets,
  acquireLifecycleLock,
  releaseLifecycleLock,
  isBackupId,
} = require(entry)

const runInstaller = (dshHome, args) => {
  const env = { ...process.env, DSH_HOME: dshHome }
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key]
  env.PATH = path.join(path.dirname(dshHome), 'intentionally-empty-path')
  return spawnSync(process.execPath, [entry, ...args], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    env,
  })
}

const backupIdFrom = (output, prefix = 'Backup created: ') => {
  const line = String(output).split(/\r?\n/).find((item) => item.startsWith(prefix))
  assert.ok(line, 'missing backup id in output:\n' + output)
  const id = line.slice(prefix.length).trim()
  assert.equal(isBackupId(id), true)
  return id
}

const backupRoot = (dshHome) => path.join(dshHome, '.dsh-researcher', 'backups')
const presetRoot = (dshHome) => path.join(dshHome, '.agent-presets')

test('installer argument and exact DSH version parsing fail closed', () => {
  assert.equal(VERIFIED_DSH, '0.1.1-rc.2')
  assert.equal(parseDshVersion('DeepSeek Harness v0.1.1-rc.2'), VERIFIED_DSH)
  assert.equal(parseDshVersion('dsh 0.1.1-rc.20'), '0.1.1-rc.20')
  assert.equal(parseDshVersion('unknown'), null)
  const ambiguous = detectDsh({
    cliResult: { status: 0, stdout: 'dsh 0.1.1-rc.2 (node 24.9.0)', stderr: '', error: null },
    resolvedShim: null,
  })
  assert.equal(ambiguous.compatible, false)
  assert.match(ambiguous.detail, /multiple different semantic versions/)
  const splitStreamAmbiguous = detectDsh({
    cliResult: { status: 0, stdout: 'dsh 0.1.1-rc.2', stderr: 'warning runtime 0.1.1-rc.20', error: null },
    resolvedShim: null,
  })
  assert.equal(splitStreamAmbiguous.compatible, false)
  assert.match(splitStreamAmbiguous.detail, /multiple different semantic versions/)
  assert.equal(parseArguments([]).action, 'install')
  const validId = '20260825T000000000Z-1-abcdef'
  assert.equal(parseArguments(['rollback', '--backup-id', validId]).backupId, validId)
  assert.throws(() => parseArguments(['backup', '--force']), /only valid with install/)
  assert.throws(() => parseArguments(['uninstall', '--allow-unsupported-dsh']), /only valid with install/)
  assert.throws(() => parseArguments(['rollback', '--backup-id', '..\\escape']), /invalid|unknown|backup id/)
})

dshRuntimeTest('strict install refuses an unverified DSH before writes and dry-run leaves installer-owned paths untouched', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dshr-installer-preflight-'))
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
  const dshHome = path.join(temp, 'dsh-home')
  const packageRoot = path.join(temp, 'dsh-package')
  fs.mkdirSync(packageRoot)
  const packageFile = path.join(packageRoot, 'package.json')
  fs.mkdirSync(path.join(packageRoot, 'dist'))
  fs.writeFileSync(path.join(packageRoot, 'dist', 'cli.js'), '#!/usr/bin/env node\n')
  const writeMetadata = (name, version, bin = 'dist/cli.js') => fs.writeFileSync(packageFile, JSON.stringify({ name, version, bin: { dsh: bin } }))

  writeMetadata('@deepseek-ai/dsh', VERIFIED_DSH)
  const emptyCli = { status: 0, stdout: '', stderr: '', error: null }
  const metadataFallback = detectDsh({ cliResult: emptyCli, resolvedShim: null, explicitPackage: packageFile, disableAutomatic: true })
  assert.equal(metadataFallback.compatible, true)
  assert.match(metadataFallback.detail, /package metadata/)
  const missingCli = { status: null, stdout: '', stderr: '', error: { code: 'ENOENT' } }
  const automaticMustNotSubstitute = detectDsh({ cliResult: missingCli, resolvedShim: null })
  assert.equal(automaticMustNotSubstitute.compatible, false)
  assert.match(automaticMustNotSubstitute.detail, /not executable from PATH/)
  const explicitMissingCliRecovery = detectDsh({ cliResult: missingCli, resolvedShim: null, explicitPackage: packageFile })
  assert.equal(explicitMissingCliRecovery.compatible, true)
  const trustedPreview = runInstaller(dshHome, ['install', '--dry-run', '--dsh-package', packageFile])
  assert.equal(trustedPreview.status, 0, trustedPreview.stdout + trustedPreview.stderr)
  assert.match(trustedPreview.stdout, /package metadata/)
  assert.equal(fs.existsSync(dshHome), false)

  writeMetadata('@deepseek-ai/dsh', '0.1.1-rc.20')
  const refused = runInstaller(dshHome, ['install', '--dry-run', '--dsh-package', packageFile])
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /Installation refused/)
  assert.match(refused.stderr, /expected exactly 0\.1\.1-rc\.2/)
  assert.equal(fs.existsSync(dshHome), false)

  const overridden = runInstaller(dshHome, ['install', '--dry-run', '--dsh-package', packageFile, '--allow-unsupported-dsh'])
  assert.equal(overridden.status, 0, overridden.stdout + overridden.stderr)
  assert.match(overridden.stderr, /UNSAFE OVERRIDE/)
  assert.match(overridden.stderr, /NOT certified/)
  assert.match(overridden.stdout, /No installer-owned paths were written/)
  assert.equal(fs.existsSync(dshHome), false)

  writeMetadata('lookalike-dsh', VERIFIED_DSH)
  const wrongName = detectDsh({ cliResult: emptyCli, resolvedShim: null, explicitPackage: packageFile, disableAutomatic: true })
  assert.equal(wrongName.compatible, false)
  assert.match(wrongName.detail, /package name/)
  fs.writeFileSync(packageFile, '{not-json')
  const unreadable = detectDsh({ cliResult: emptyCli, resolvedShim: null, explicitPackage: packageFile, disableAutomatic: true })
  assert.equal(unreadable.compatible, false)
  assert.match(unreadable.detail, /unreadable or invalid JSON/)

  writeMetadata('@deepseek-ai/dsh', VERIFIED_DSH, '../outside.js')
  const escapingBin = detectDsh({ cliResult: emptyCli, resolvedShim: null, explicitPackage: packageFile, disableAutomatic: true })
  assert.equal(escapingBin.compatible, false)
  assert.match(escapingBin.detail, /escapes its package root/)

  const backup = runInstaller(dshHome, ['backup', '--dry-run'])
  assert.equal(backup.status, 0, backup.stdout + backup.stderr)
  assert.equal(fs.existsSync(dshHome), false)
})

test('Windows npm shim discovery is PATH-bound, shell-free, and ignores repository-relative entries', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dshr-windows-shim-'))
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
  const shadow = path.join(temp, 'shadow')
  const npmBin = path.join(temp, 'npm-bin')
  const packageRoot = path.join(npmBin, 'node_modules', '@deepseek-ai', 'dsh')
  fs.mkdirSync(shadow, { recursive: true })
  fs.mkdirSync(packageRoot, { recursive: true })
  fs.mkdirSync(path.join(packageRoot, 'dist'))
  fs.writeFileSync(path.join(packageRoot, 'dist', 'cli.js'), '#!/usr/bin/env node\n')
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({
    name: '@deepseek-ai/dsh',
    version: VERIFIED_DSH,
    bin: { dsh: 'dist/cli.js' },
  }))
  const trustedShim = path.join(npmBin, 'dsh.cmd')
  fs.writeFileSync(trustedShim, [
    '@ECHO off',
    'GOTO start',
    ':find_dp0',
    'SET dp0=%~dp0',
    'EXIT /b',
    ':start',
    'SETLOCAL',
    'CALL :find_dp0',
    'IF EXIST "%dp0%\\node.exe" (',
    '  SET "_prog=%dp0%\\node.exe"',
    ') ELSE (',
    '  SET "_prog=node"',
    '  SET PATHEXT=%PATHEXT:;.JS;=;%',
    ')',
    'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@deepseek-ai\\dsh\\dist\\cli.js" %*',
    '',
  ].join('\r\n'))

  const resolved = resolveDshOnPath({ platform: 'win32', pathValue: 'relative-entry;;' + npmBin, pathExtValue: '.CMD;.EXE' })
  assert.equal(resolved, trustedShim)
  const trusted = detectDsh({ platform: 'win32', resolvedShim: resolved })
  assert.equal(trusted.compatible, true)
  assert.equal(trusted.detected, VERIFIED_DSH)
  assert.match(trusted.detail, /bound to PATH shim/)

  fs.writeFileSync(trustedShim, '@rem @deepseek-ai/dsh/dist/cli.js\r\n@echo unrelated\r\n')
  const commentForgery = detectDsh({ platform: 'win32', resolvedShim: trustedShim })
  assert.equal(commentForgery.compatible, false)
  assert.match(commentForgery.detail, /not bound/)

  // Restore the trusted shim for the first-PATH-hit checks below.
  fs.writeFileSync(trustedShim, [
    '@ECHO off', 'GOTO start', ':find_dp0', 'SET dp0=%~dp0', 'EXIT /b', ':start', 'SETLOCAL', 'CALL :find_dp0',
    'IF EXIST "%dp0%\\node.exe" (', 'SET "_prog=%dp0%\\node.exe"', ') ELSE (', 'SET "_prog=node"',
    'SET PATHEXT=%PATHEXT:;.JS;=;%', ')',
    'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%" "%dp0%\\node_modules\\@deepseek-ai\\dsh\\dist\\cli.js" %*', '',
  ].join('\r\n'))

  // The first absolute PATH hit controls the decision. A later valid package
  // cannot vouch for an earlier unrelated shim.
  const shadowShim = path.join(shadow, 'dsh.cmd')
  fs.writeFileSync(shadowShim, '@echo unrelated\r\n')
  const first = resolveDshOnPath({ platform: 'win32', pathValue: shadow + ';' + npmBin })
  assert.equal(first, shadowShim)
  const refused = detectDsh({ platform: 'win32', resolvedShim: first })
  assert.equal(refused.compatible, false)
  assert.doesNotMatch(refused.detail, new RegExp(npmBin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

dshRuntimeTest('source and final-stage preflights reject nested links before replacement', (t) => {
  const fakeLinkFs = {
    readdirSync: () => [{ name: 'nested-link' }],
    lstatSync: () => ({ isSymbolicLink: () => true, isDirectory: () => false, isFile: () => false }),
    readFileSync: () => Buffer.alloc(0),
  }
  assert.throws(() => treeInventory(path.parse(process.cwd()).root, fakeLinkFs), /symbolic links or junctions/)

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dshr-installer-source-tree-'))
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
  const sources = {}
  for (const name of ['researcher', 'governed', 'lib', 'schemas']) {
    sources[name] = path.join(temp, name)
    fs.mkdirSync(sources[name])
  }
  for (const name of ['researcher', 'governed']) fs.writeFileSync(path.join(sources[name], 'agent.cordis.yml'), 'name: fixture\n')
  let traversed = 0
  assert.throws(
    () => validateInstallSourceTrees(sources, (source) => {
      traversed += 1
      if (source === sources.lib) throw new Error('managed trees and backups must not contain symbolic links or junctions: injected')
      return []
    }),
    /symbolic links or junctions/,
  )
  assert.equal(traversed, 3, 'source preflight must stop before copying after a nested-link failure')

  const dshHome = path.join(temp, 'dry-run-home')
  const existingResearcher = path.join(presetRoot(dshHome), 'researcher')
  const outside = path.join(temp, 'outside-target')
  fs.mkdirSync(existingResearcher, { recursive: true })
  fs.mkdirSync(outside)
  fs.writeFileSync(path.join(existingResearcher, 'keep.txt'), 'unchanged\n')
  fs.symlinkSync(outside, path.join(existingResearcher, 'nested-link'), process.platform === 'win32' ? 'junction' : 'dir')
  const refusedPreview = runInstaller(dshHome, ['install', '--force', '--dry-run', '--allow-unsupported-dsh'])
  assert.equal(refusedPreview.status, 1)
  assert.match(refusedPreview.stderr, /symbolic links or junctions/)
  assert.equal(fs.existsSync(path.join(dshHome, '.dsh-researcher')), false)
  assert.equal(fs.readFileSync(path.join(existingResearcher, 'keep.txt'), 'utf8'), 'unchanged\n')
})

test('cross-device stage is refused before any existing target is deleted', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dshr-installer-device-'))
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
  const dshHome = path.join(temp, 'dsh-home')
  const targetRoot = path.join(dshHome, '.agent-presets')
  const stage = path.join(dshHome, '.dsh-researcher', 'staging', 'candidate')
  const targets = { researcher: path.join(targetRoot, 'researcher'), governed: path.join(targetRoot, 'governed') }
  fs.mkdirSync(targets.researcher, { recursive: true })
  fs.mkdirSync(targets.governed, { recursive: true })
  fs.mkdirSync(stage, { recursive: true })
  fs.writeFileSync(path.join(targets.researcher, 'keep.txt'), 'do not delete\n')
  let removals = 0
  assert.throws(
    () => replaceTargets(stage, { researcher: 'absent', governed: 'absent' }, {
      dshHome,
      targetRoot,
      targets,
      statSync: (candidate) => ({ dev: candidate === stage ? 101 : 202 }),
      rmSync: () => { removals += 1 },
    }),
    /share one filesystem device.*before deleting any target/,
  )
  assert.equal(removals, 0)
  assert.equal(fs.readFileSync(path.join(targets.researcher, 'keep.txt'), 'utf8'), 'do not delete\n')

  const expected = {
    targets: { researcher: 'present', governed: 'present' },
    inventory: {
      researcher: treeInventory(targets.researcher),
      governed: treeInventory(targets.governed),
    },
  }
  fs.writeFileSync(path.join(targets.researcher, 'late-change.txt'), 'must not be lost\n')
  let driftRemovals = 0
  assert.throws(
    () => replaceTargets(stage, { researcher: 'absent', governed: 'absent' }, {
      dshHome,
      targetRoot,
      targets,
      expectedCurrent: expected,
      rmSync: () => { driftRemovals += 1 },
    }),
    /changed after the pre-operation snapshot/,
  )
  assert.equal(driftRemovals, 0)
  assert.equal(fs.readFileSync(path.join(targets.researcher, 'late-change.txt'), 'utf8'), 'must not be lost\n')

  const expectedBeforeLink = {
    targets: { researcher: 'present', governed: 'present' },
    inventory: {
      researcher: treeInventory(targets.researcher),
      governed: treeInventory(targets.governed),
    },
  }
  const outside = path.join(temp, 'late-link-target')
  fs.mkdirSync(outside)
  fs.symlinkSync(outside, path.join(targets.researcher, 'late-link'), process.platform === 'win32' ? 'junction' : 'dir')
  let linkedDriftRemovals = 0
  assert.throws(
    () => replaceTargets(stage, { researcher: 'absent', governed: 'absent' }, {
      dshHome,
      targetRoot,
      targets,
      expectedCurrent: expectedBeforeLink,
      rmSync: () => { linkedDriftRemovals += 1 },
    }),
    /could not be proven unchanged.*symbolic links or junctions/,
  )
  assert.equal(linkedDriftRemovals, 0)
  assert.equal(fs.existsSync(path.join(targets.researcher, 'late-change.txt')), true)
})

dshRuntimeTest('atomic lifecycle lock serializes writers and stale locks require manual confirmation', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dshr-installer-lock-'))
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
  const directState = path.join(temp, 'direct-home', '.dsh-researcher')
  const first = acquireLifecycleLock('backup', { stateRoot: directState })
  assert.equal(JSON.parse(fs.readFileSync(first.lockFile, 'utf8')).schema, LOCK_SCHEMA)
  assert.throws(() => acquireLifecycleLock('uninstall', { stateRoot: directState }), /never removed automatically.*Confirm no installer process/)
  releaseLifecycleLock(first)
  assert.equal(fs.existsSync(first.lockFile), false)

  const dshHome = path.join(temp, 'dsh-home')
  const installed = runInstaller(dshHome, ['install', '--allow-unsupported-dsh'])
  assert.equal(installed.status, 0, installed.stdout + installed.stderr)
  const stateRoot = path.join(dshHome, '.dsh-researcher')
  const staleLock = path.join(stateRoot, 'lifecycle.lock')
  const stale = JSON.stringify({ schema: LOCK_SCHEMA, token: 'stale', pid: 1, action: 'install', created_at: '2000-01-01T00:00:00.000Z' }) + '\n'
  fs.writeFileSync(staleLock, stale, { flag: 'wx' })

  const preview = runInstaller(dshHome, ['backup', '--dry-run'])
  assert.equal(preview.status, 0, preview.stdout + preview.stderr)
  assert.equal(fs.readFileSync(staleLock, 'utf8'), stale, 'dry-run must neither create nor remove a lifecycle lock')

  for (const args of [
    ['backup'],
    ['uninstall'],
    ['rollback'],
    ['install', '--force', '--allow-unsupported-dsh'],
  ]) {
    const refused = runInstaller(dshHome, args)
    assert.equal(refused.status, 1, args.join(' ') + '\n' + refused.stdout + refused.stderr)
    assert.match(refused.stderr, /lifecycle lock already exists/)
    assert.match(refused.stderr, /remove this exact lock file manually/)
    assert.equal(fs.readFileSync(staleLock, 'utf8'), stale)
  }

  const emptyHome = path.join(temp, 'empty-home')
  const emptyState = path.join(emptyHome, '.dsh-researcher')
  fs.mkdirSync(emptyState, { recursive: true })
  const emptyLock = path.join(emptyState, 'lifecycle.lock')
  fs.writeFileSync(emptyLock, stale, { flag: 'wx' })
  const emptyUninstall = runInstaller(emptyHome, ['uninstall'])
  assert.equal(emptyUninstall.status, 1, emptyUninstall.stdout + emptyUninstall.stderr)
  assert.match(emptyUninstall.stderr, /lifecycle lock already exists/)
  assert.equal(fs.readFileSync(emptyLock, 'utf8'), stale)
})

dshRuntimeTest('install, force replacement, backup, uninstall, and exact rollback are reversible', { timeout: 120000 }, (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dshr-installer-lifecycle-'))
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
  const dshHome = path.join(temp, 'dsh-home')
  const researcher = path.join(presetRoot(dshHome), 'researcher')
  const governed = path.join(presetRoot(dshHome), 'governed')

  const installed = runInstaller(dshHome, ['install', '--allow-unsupported-dsh'])
  assert.equal(installed.status, 0, installed.stdout + installed.stderr)
  const initialBackup = backupIdFrom(installed.stdout)
  const initialManifest = JSON.parse(fs.readFileSync(path.join(backupRoot(dshHome), initialBackup, '.complete.json'), 'utf8'))
  assert.equal(initialManifest.schema, SNAPSHOT_SCHEMA)
  assert.deepEqual(initialManifest.targets, { researcher: 'absent', governed: 'absent' })
  assert.equal(fs.existsSync(path.join(researcher, 'agent.cordis.yml')), true)
  assert.equal(fs.existsSync(path.join(governed, 'agent.cordis.yml')), true)

  const marker = path.join(researcher, 'user-marker.txt')
  fs.writeFileSync(marker, 'must survive via backup\n')
  const refusedReplace = runInstaller(dshHome, ['install', '--allow-unsupported-dsh'])
  assert.equal(refusedReplace.status, 1)
  assert.equal(fs.readFileSync(marker, 'utf8'), 'must survive via backup\n')

  const replaced = runInstaller(dshHome, ['install', '--force', '--allow-unsupported-dsh'])
  assert.equal(replaced.status, 0, replaced.stdout + replaced.stderr)
  const replacementBackup = backupIdFrom(replaced.stdout)
  assert.equal(fs.existsSync(path.join(backupRoot(dshHome), replacementBackup, 'researcher', 'user-marker.txt')), true)
  assert.equal(fs.existsSync(marker), false)

  const restoredReplacement = runInstaller(dshHome, ['rollback', '--backup-id', replacementBackup])
  assert.equal(restoredReplacement.status, 0, restoredReplacement.stdout + restoredReplacement.stderr)
  assert.equal(fs.readFileSync(marker, 'utf8'), 'must survive via backup\n')

  const manual = runInstaller(dshHome, ['backup'])
  assert.equal(manual.status, 0, manual.stdout + manual.stderr)
  const manualBackup = backupIdFrom(manual.stdout)
  assert.equal(fs.existsSync(path.join(backupRoot(dshHome), manualBackup, 'governed', 'agent.cordis.yml')), true)

  const uninstallPreview = runInstaller(dshHome, ['uninstall', '--dry-run'])
  assert.equal(uninstallPreview.status, 0, uninstallPreview.stdout + uninstallPreview.stderr)
  assert.equal(fs.existsSync(marker), true)

  const uninstalled = runInstaller(dshHome, ['uninstall'])
  assert.equal(uninstalled.status, 0, uninstalled.stdout + uninstalled.stderr)
  const uninstallBackup = backupIdFrom(uninstalled.stdout)
  assert.equal(fs.existsSync(researcher), false)
  assert.equal(fs.existsSync(governed), false)

  const rollbackUninstall = runInstaller(dshHome, ['rollback', '--backup-id', uninstallBackup])
  assert.equal(rollbackUninstall.status, 0, rollbackUninstall.stdout + rollbackUninstall.stderr)
  assert.equal(fs.readFileSync(marker, 'utf8'), 'must survive via backup\n')

  const rollbackFirstInstall = runInstaller(dshHome, ['rollback', '--backup-id', initialBackup])
  assert.equal(rollbackFirstInstall.status, 0, rollbackFirstInstall.stdout + rollbackFirstInstall.stderr)
  assert.equal(fs.existsSync(researcher), false)
  assert.equal(fs.existsSync(governed), false)
  assert.equal(fs.existsSync(path.join(dshHome, '.dsh-researcher', 'lifecycle.lock')), false)
})

dshRuntimeTest('rollback rejects incomplete or contradictory evidence without changing targets', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dshr-installer-invalid-backup-'))
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
  const dshHome = path.join(temp, 'dsh-home')
  const installed = runInstaller(dshHome, ['install', '--allow-unsupported-dsh'])
  assert.equal(installed.status, 0, installed.stdout + installed.stderr)
  const marker = path.join(presetRoot(dshHome), 'researcher', 'stable.txt')
  fs.writeFileSync(marker, 'unchanged\n')

  const integrityBackup = runInstaller(dshHome, ['backup'])
  const integrityId = backupIdFrom(integrityBackup.stdout)
  fs.appendFileSync(path.join(backupRoot(dshHome), integrityId, 'researcher', 'agent.cordis.yml'), '\n# corrupted after backup\n')
  const integrityRefused = runInstaller(dshHome, ['rollback', '--backup-id', integrityId, '--dry-run'])
  assert.equal(integrityRefused.status, 1)
  assert.match(integrityRefused.stderr, /integrity does not match/)
  assert.equal(fs.readFileSync(marker, 'utf8'), 'unchanged\n')

  const incompleteBackup = runInstaller(dshHome, ['backup'])
  const incompleteId = backupIdFrom(incompleteBackup.stdout)
  fs.rmSync(path.join(backupRoot(dshHome), incompleteId, '.complete.json'))
  const incompleteRefused = runInstaller(dshHome, ['rollback', '--backup-id', incompleteId, '--dry-run'])
  assert.equal(incompleteRefused.status, 1)
  assert.match(incompleteRefused.stderr, /backup is incomplete/)
  assert.equal(fs.readFileSync(marker, 'utf8'), 'unchanged\n')
})

test('platform wrappers delegate every argument and installation guide binds release bytes', () => {
  const powershell = fs.readFileSync(path.join(root, 'install.ps1'), 'utf8')
  const bash = fs.readFileSync(path.join(root, 'install.sh'), 'utf8')
  const guide = fs.readFileSync(path.join(root, 'docs', 'installation.md'), 'utf8')
  assert.match(powershell, /bin\\install\.js/)
  assert.match(powershell, /@args/)
  assert.match(bash, /bin\/install\.js/)
  assert.match(bash, /"\$@"/)
  for (const token of ['--dry-run', 'backup', 'uninstall', 'rollback', '--allow-unsupported-dsh', '--dsh-package', 'lifecycle.lock', 'ACL', 'xattr']) assert.match(guide, new RegExp(token))
  for (const token of ['SHA256SUMS', 'package-manifest.json', 'Get-FileHash', 'sha256sum --check', '本地 tarball']) assert.match(guide, new RegExp(token))
  assert.match(guide, /Source code[^\n]*不/)
})
