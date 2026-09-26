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
  hostPresetTarget,
  hostPresetDir,
} = require(entry)

/**
 * A throwaway stand-in for the DSH presets directory, inside the test's own
 * temporary tree. Every install a test spawns is pointed here, so no test can
 * reach a real DSH installation even by accident.
 *
 * The path is returned WITHOUT creating it: a test that asserts "a refused
 * install wrote nothing" must not find a directory this helper made.
 */
const hostPresetsDirFor = (dshHome) => path.join(dshHome, 'host-presets')

const runInstaller = (dshHome, args, extraEnv = {}) => {
  const env = { ...process.env, DSH_HOME: dshHome, ...extraEnv }
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key]
  env.PATH = path.join(path.dirname(dshHome), 'intentionally-empty-path')
  // Pin the host presets directory for every spawned install. Without this the
  // lookup can fall back to the DSH installation that happens to be on the
  // machine, and a test then writes into the user's own presets — which is
  // exactly how a throwaway path once ended up in a real preset file.
  env.DSH_HOST_PRESETS_DIR = hostPresetsDirFor(dshHome)
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
  assert.equal(VERIFIED_DSH, '0.1.5-rc.3')
  assert.equal(parseDshVersion('DeepSeek Harness v0.1.5-rc.3'), VERIFIED_DSH)
  assert.equal(parseDshVersion('dsh 0.1.5-rc.20'), '0.1.5-rc.20')
  assert.equal(parseDshVersion('unknown'), null)
  const ambiguous = detectDsh({
    cliResult: { status: 0, stdout: 'dsh 0.1.5-rc.3 (node 24.9.0)', stderr: '', error: null },
    resolvedShim: null,
  })
  assert.equal(ambiguous.compatible, false)
  assert.match(ambiguous.detail, /multiple different semantic versions/)
  const splitStreamAmbiguous = detectDsh({
    cliResult: { status: 0, stdout: 'dsh 0.1.5-rc.3', stderr: 'warning runtime 0.1.5-rc.20', error: null },
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

  writeMetadata('@deepseek-ai/dsh', '0.1.5-rc.20')
  const refused = runInstaller(dshHome, ['install', '--dry-run', '--dsh-package', packageFile])
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /Installation refused/)
  assert.match(refused.stderr, /expected exactly 0\.1\.5-rc\.3/)
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
  for (const name of ['researcher', 'governed', 'lib', 'schemas', 'kb', 'runtime-entry', 'runtime-router', 'runtime-kb']) {
    sources[name] = path.join(temp, name)
    fs.mkdirSync(sources[name])
  }
  for (const name of ['researcher', 'governed']) fs.writeFileSync(path.join(sources[name], 'agent.cordis.yml'), 'name: fixture\n')
  // The persona is a single file source, not a tree.
  sources['runtime-persona'] = path.join(temp, 'runtime-persona.yml')
  fs.writeFileSync(sources['runtime-persona'], 'name: fixture\n')
  let traversed = 0
  assert.throws(
    () => validateInstallSourceTrees(sources, (source) => {
      traversed += 1
      if (source === sources.lib) throw new Error('managed trees and backups must not contain symbolic links or junctions: injected')
      return []
    }),
    /symbolic links or junctions/,
  )
  // researcher, governed, then lib throws — so the two preset trees plus lib
  // were inventoried and nothing after the failure was traversed.
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
  const targets = {
    researcher: path.join(targetRoot, 'researcher'),
    governed: path.join(targetRoot, 'governed'),
    // The runtime target lives outside the preset root, under the installer's
    // state root — the replacement machinery takes the map, so it must be here.
    runtime: path.join(dshHome, '.dsh-researcher', 'runtime'),
  }
  fs.mkdirSync(targets.researcher, { recursive: true })
  fs.mkdirSync(targets.governed, { recursive: true })
  fs.mkdirSync(stage, { recursive: true })
  fs.writeFileSync(path.join(targets.researcher, 'keep.txt'), 'do not delete\n')
  let removals = 0
  assert.throws(
    () => replaceTargets(stage, { researcher: 'absent', governed: 'absent', runtime: 'absent' }, {
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
    targets: { researcher: 'present', governed: 'present', runtime: 'absent' },
    inventory: {
      researcher: treeInventory(targets.researcher),
      governed: treeInventory(targets.governed),
    },
  }
  fs.writeFileSync(path.join(targets.researcher, 'late-change.txt'), 'must not be lost\n')
  let driftRemovals = 0
  assert.throws(
    () => replaceTargets(stage, { researcher: 'absent', governed: 'absent', runtime: 'absent' }, {
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
    targets: { researcher: 'present', governed: 'present', runtime: 'absent' },
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
    () => replaceTargets(stage, { researcher: 'absent', governed: 'absent', runtime: 'absent' }, {
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

dshRuntimeTest('the /research runtime is installed OUTSIDE the preset root and survives removing the preset', (t) => {
  // `/research` used to be reachable only through the `researcher` preset, so a
  // user who removed that mode — to keep the picker short, or to stop using the
  // certified form — silently lost the in-session command too. Those are two
  // different things and the installer now keeps them apart: the runtime is its
  // own target under the installer's state root.
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dshr-installer-runtime-'))
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
  const dshHome = path.join(temp, 'dsh-home')
  const installed = runInstaller(dshHome, ['install', '--allow-unsupported-dsh'])
  assert.equal(installed.status, 0, installed.stdout + installed.stderr)

  const runtime = path.join(dshHome, '.dsh-researcher', 'runtime')
  assert.equal(fs.existsSync(path.join(runtime, 'plugins', 'research-entry', 'index.js')), true)
  assert.equal(fs.existsSync(path.join(runtime, 'plugins', 'lens-router', 'index.js')), true, 'the entry resolves lens-router as a sibling')
  assert.equal(fs.existsSync(path.join(runtime, 'docs', 'kb', 'clean')), true, 'the lens corpus must travel with the runtime')
  assert.equal(fs.existsSync(path.join(runtime, 'agent.cordis.yml')), true, 'and the persona the in-session mode reads')

  // It must not live inside the preset root: that root is a place users prune.
  assert.equal(runtime.startsWith(presetRoot(dshHome)), false, 'the runtime must not sit inside the preset root')

  // The entry point points at the runtime, not at the preset.
  const patchFile = path.join(dshHome, 'cordis.patch.yml')
  const patchText = fs.readFileSync(patchFile, 'utf8')
  assert.ok(patchText.includes('.dsh-researcher/runtime/plugins/research-entry/index.js'), 'the entry must address the runtime')
  assert.equal(patchText.includes('.agent-presets/researcher/'), false, 'and must not fall back to the preset path')

  // Removing the preset — how a user disables that mode — leaves the entry intact.
  fs.rmSync(path.join(presetRoot(dshHome), 'researcher'), { recursive: true, force: true })
  assert.equal(fs.existsSync(path.join(runtime, 'plugins', 'research-entry', 'index.js')), true, '/research survives removing the researcher preset')
  assert.equal(fs.existsSync(path.join(runtime, 'docs', 'kb', 'clean')), true)

  // Uninstall still removes it, so nothing is left behind.
  const uninstalled = runInstaller(dshHome, ['uninstall'])
  assert.equal(uninstalled.status, 0, uninstalled.stdout + uninstalled.stderr)
  assert.equal(fs.existsSync(runtime), false, 'uninstall must remove the runtime target too')
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
  assert.deepEqual(initialManifest.targets, { researcher: 'absent', governed: 'absent', runtime: 'absent' })
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

dshRuntimeTest('uninstall reverts the entry point it registered, and install migrated off the old form', (t) => {
  // 这条断言以前不存在，代价是一个真实 bug：`runUninstall` 引用了一个只在
  // `runInstall` 里存在的绑定，较新的 Node 在求值时抛错，撤销被整段跳过，
  // 而旧测试只检查退出码，于是没有任何断言发现补丁仍留在宿主 preset 里。
  //
  // 撤销的载体后来变了：入口从「DSH 安装里的四个 preset」搬到 home patch 层
  // （$DSH_HOME/cordis.patch.yml），因为前者会被 DSH 升级抹掉。断言随之改为
  // 检查新载体，同时保留一条更重要的性质——**DSH 安装目录不再被写**。
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dshr-installer-hostpatch-'))
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
  const dshHome = path.join(temp, 'dsh-home')
  const shipped = [
    '# The `minimal` agent preset.',
    '',
    '- id: persona',
    "  name: '@deepseek-ai/dsh-persona'",
    '  config:',
    '    prefix: You are a helpful software engineer assistant.',
    '',
  ].join('\n')
  // 一个模拟 DSH 安装里的 preset 目录，用来证明安装器不再往这里写。
  const installerPresets = hostPresetsDirFor(dshHome)
  fs.mkdirSync(path.join(installerPresets, 'minimal'), { recursive: true })
  const installerPresetFile = path.join(installerPresets, 'minimal', 'agent.cordis.yml')
  fs.writeFileSync(installerPresetFile, shipped)

  const installed = runInstaller(dshHome, ['install', '--allow-unsupported-dsh'])
  assert.equal(installed.status, 0, installed.stdout + installed.stderr)

  // 1) 入口注册在 home patch 层。
  const patchFile = path.join(dshHome, 'cordis.patch.yml')
  assert.equal(fs.existsSync(patchFile), true, 'the installer registers /research in the home patch layer')
  assert.ok(fs.readFileSync(patchFile, 'utf8').includes('research-entry'), 'precondition: the entry is registered')

  // 2) DSH 安装里的 preset 一个字节都没被改——这正是升级不会再抹掉入口的原因。
  assert.equal(fs.readFileSync(installerPresetFile, 'utf8'), shipped, 'the shipped preset must not be touched at all')
  assert.equal(fs.existsSync(installerPresetFile + '.dsh-researcher-original'), false, 'and no backup is left inside the deployment')

  // 3) 旧式补丁若存在，安装会被迁移掉。
  const legacyPatched = shipped + '\n' + [
    '# >>> dsh-researcher: research-entry (added by the installer) >>>',
    '- id: research-entry',
    "  name: 'C:/nonexistent/research-entry/index.js'",
    '# <<< dsh-researcher: research-entry <<<',
    '',
  ].join('\n')
  fs.writeFileSync(installerPresetFile, legacyPatched)
  fs.writeFileSync(installerPresetFile + '.dsh-researcher-original', shipped)
  const migrated = runInstaller(dshHome, ['install', '--force', '--allow-unsupported-dsh'])
  assert.equal(migrated.status, 0, migrated.stdout + migrated.stderr)
  assert.equal(fs.readFileSync(installerPresetFile, 'utf8'), shipped, 'a legacy patch is reverted byte-for-byte')
  assert.equal(fs.existsSync(installerPresetFile + '.dsh-researcher-original'), false, 'and its backup is removed')

  // 4) 卸载撤销它注册的东西，并带走文件本身。
  const uninstalled = runInstaller(dshHome, ['uninstall'])
  assert.equal(uninstalled.status, 0, uninstalled.stdout + uninstalled.stderr)
  assert.equal(fs.existsSync(patchFile), false, 'uninstall must remove the entry point it created')
  assert.equal(fs.readFileSync(installerPresetFile, 'utf8'), shipped, 'and the shipped preset stays untouched')
})

dshRuntimeTest('a spawned install never touches the machine it runs on', (t) => {
  // 真实事故的回归：测试曾经让安装器回退到 PATH 上那个真实的 DSH 安装，
  // 把临时路径写进了用户自己的 preset，临时目录一清理，用户的会话就挂不上。
  // 这里断言每次生成的子进程都被钉在临时目录里，且不继承调用方的值。
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dshr-installer-isolation-'))
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
  const dshHome = path.join(temp, 'dsh-home')
  process.env.DSH_HOST_PRESETS_DIR = path.join(temp, 'poisoned-by-the-caller')
  t.after(() => { delete process.env.DSH_HOST_PRESETS_DIR })
  const probe = runInstaller(dshHome, ['install', '--dry-run', '--allow-unsupported-dsh'])
  assert.equal(probe.status, 0, probe.stdout + probe.stderr)
  // runInstaller 必须覆盖调用方的值，而不是沿用。
  assert.equal(hostPresetsDirFor(dshHome), path.join(dshHome, 'host-presets'))
  assert.notEqual(hostPresetsDirFor(dshHome), process.env.DSH_HOST_PRESETS_DIR)
  // 子进程真正用的是哪一个目录 —— 断言输出，而不是断言本文件里的辅助函数。
  // 旧版本只检查了上面的 hostPresetsDirFor()，那是测试自己算出来的值，无论
  // 安装器选用什么都会通过：一条永远为真的断言，第二次事故就是它没抓住的。
  //
  // 打补丁的位置现在是 home patch 层（$DSH_HOME/cordis.patch.yml），它不再是
  // DSH 安装里的某个 preset 目录——所以断言的是「没有写到别处」，而不是
  // 「写到了哪个 preset 目录」。
  assert.match(probe.stdout, /home patch layer/, 'the preview must name the home patch layer')
  assert.doesNotMatch(probe.stdout, /poisoned-by-the-caller/, 'the caller value must not reach the child')
})

dshRuntimeTest('an absent host-preset override refuses instead of degrading to the detected install', (t) => {
  // 第二次事故的回归。DSH_HOST_PRESETS_DIR 指向一个还不存在的目录时，
  // 旧实现静默改用它「探测到」的真实 DSH 安装：install 路径被临时插件路径
  // 守卫拦住，但 revert 路径没有那层守卫，于是 uninstall 撤销了用户真实的
  // `/research` 行并删掉了备份。
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dshr-host-preset-absent-'))
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
  const dshHome = path.join(temp, 'dsh-home')
  const override = path.join(temp, 'host-presets')

  const saved = process.env.DSH_HOST_PRESETS_DIR
  t.after(() => {
    if (saved === undefined) delete process.env.DSH_HOST_PRESETS_DIR
    else process.env.DSH_HOST_PRESETS_DIR = saved
  })
  process.env.DSH_HOST_PRESETS_DIR = override

  // 一个真实存在的 DSH 安装形状，装在被探测的位置上。
  const detectedRoot = path.join(temp, 'dsh-package')
  const detectedPresets = path.join(detectedRoot, 'node_modules', '@deepseek-ai', 'dsh-agent-presets', 'presets')
  fs.mkdirSync(path.join(detectedPresets, 'minimal'), { recursive: true })

  const target = hostPresetTarget(detectedRoot)
  assert.equal(target.dir, override, 'an override that does not exist yet must still win')
  assert.notEqual(path.resolve(target.dir), path.resolve(detectedPresets), 'and must not become the detected install')
  assert.equal(target.foreign, true, 'a differing override is a foreign target, which makes the patch refuse')
  assert.equal(hostPresetDir(detectedRoot), detectedPresets, 'the detected directory itself is unchanged')

  // 无覆盖时仍走探测结果——否则这条断言会把正常安装一起禁掉。
  delete process.env.DSH_HOST_PRESETS_DIR
  assert.equal(hostPresetTarget(detectedRoot).dir, detectedPresets)
  assert.equal(hostPresetTarget(detectedRoot).foreign, false)
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
