#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const CODEX_CLI_LOCK = Object.freeze({
  version: '0.150.0-alpha.12.2',
  versionOutput: 'codex-cli 0.150.0-alpha.12.2',
  executables: Object.freeze({
    'win32-x64': Object.freeze({
      basename: 'codex.exe',
      size: 310753072,
      sha256: '34e9cfe7d5bbcec306fe6ab3fd502a713a7a1f0fb644c11ad2990fc80599fd4f',
    }),
  }),
})

const sha256File = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const hostKey = (platform = process.platform, arch = process.arch) => platform + '-' + arch

const inspectCodexExecutable = (file, options = {}) => {
  if (typeof file !== 'string' || !path.isAbsolute(file)) throw new Error('--codex-bin must be an absolute file path')
  const stat = fs.lstatSync(file)
  if (stat.isSymbolicLink()) throw new Error('Codex executable must not be a symbolic link')
  if (!stat.isFile()) throw new Error('Codex executable must be a regular file')
  const resolved = fs.realpathSync(file)
  return {
    path: resolved,
    host: hostKey(options.platform, options.arch),
    basename: path.basename(resolved),
    size: stat.size,
    sha256: sha256File(resolved),
  }
}

const assertLockedCodexExecutable = (file, lock = CODEX_CLI_LOCK, options = {}) => {
  const observed = inspectCodexExecutable(file, options)
  const expected = lock.executables?.[observed.host]
  if (!expected) throw new Error('Codex executable content lock is unavailable for host ' + observed.host)
  for (const field of ['basename', 'size', 'sha256']) {
    if (observed[field] !== expected[field]) throw new Error('Codex executable ' + field + ' drifted')
  }
  return observed
}

const parseCodexBin = (args, allowedFlags = new Set()) => {
  let codexBin = null
  const flags = new Set()
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--codex-bin') {
      if (codexBin !== null || index + 1 >= args.length) throw new Error('usage: --codex-bin <absolute-path>')
      codexBin = args[++index]
    } else if (allowedFlags.has(arg)) flags.add(arg)
    else throw new Error('unknown argument: ' + arg)
  }
  if (!codexBin) throw new Error('usage: --codex-bin <absolute-path>')
  if (!path.isAbsolute(codexBin)) throw new Error('--codex-bin must be an absolute file path')
  return { codexBin, flags }
}

const publicExecutableIdentity = (observed, versionOutput = CODEX_CLI_LOCK.versionOutput) => ({
  host: observed.host,
  basename: observed.basename,
  size: observed.size,
  sha256: observed.sha256,
  version_output: versionOutput,
  path_recorded: false,
})

module.exports = { CODEX_CLI_LOCK, assertLockedCodexExecutable, hostKey, inspectCodexExecutable, parseCodexBin, publicExecutableIdentity }
