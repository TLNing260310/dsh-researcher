#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { pathToFileURL } = require('node:url')
const { CLAUDE_SDK_LOCK, assertLockedClaudeSdk } = require('./claude-agent-sdk-lock.js')

const EXPECTED_VERSION = CLAUDE_SDK_LOCK.version
const EXPECTED_CLAUDE_CODE_VERSION = CLAUDE_SDK_LOCK.claudeCodeVersion
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

const parseArgs = (argv) => {
  const result = {}
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index]
    if (!value.startsWith('--')) throw new Error('unexpected positional argument')
    const key = value.slice(2)
    const next = argv[index + 1]
    if (next === undefined || next.startsWith('--')) result[key] = true
    else { result[key] = next; index++ }
  }
  return result
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const requireString = (value, label) => {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(label + ' is required')
  return value
}

const nativeIdentity = () => {
  const platform = process.platform
  const arch = process.arch
  if (!['win32', 'linux', 'darwin'].includes(platform) || !['x64', 'arm64'].includes(arch)) throw new Error('unsupported discovery host ' + platform + '-' + arch)
  return {
    package: '@anthropic-ai/claude-agent-sdk-' + platform + '-' + arch,
    executable: platform === 'win32' ? 'claude.exe' : 'claude',
  }
}

const sanitizedEnvironment = (configRoot, source = process.env) => {
  const environment = {}
  const removed = []
  for (const [name, value] of Object.entries(source)) {
    if (/^(?:ANTHROPIC|CLAUDE|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY)/i.test(name) || /(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN)$/i.test(name)) {
      removed.push(name)
      continue
    }
    environment[name] = value
  }
  environment.CLAUDE_CONFIG_DIR = configRoot
  return { environment, removed: removed.sort() }
}

const capture = async (sdkRoot, dependencies = {}) => {
  const locked = (dependencies.assertLockedClaudeSdk || assertLockedClaudeSdk)(sdkRoot)
  const { root, pkg } = locked
  const packageFile = locked.files['package.json']
  const sdkFile = locked.files['sdk.mjs']

  const module = await import(pathToFileURL(sdkFile).href)
  const exports = Object.keys(module).sort()
  for (const required of ['query', 'startup', 'getSessionInfo', 'getSessionMessages', 'listSessions']) {
    if (!exports.includes(required) || typeof module[required] !== 'function') throw new Error('required runtime export is missing: ' + required)
  }

  const native = nativeIdentity()
  const nativeRoot = path.resolve(root, '..', native.package.split('/').at(-1))
  const nativePackageFile = path.join(nativeRoot, 'package.json')
  const executable = path.join(nativeRoot, native.executable)
  if (!fs.existsSync(nativePackageFile) || !fs.existsSync(executable)) throw new Error('locked native CLI package is missing')
  const nativePackage = readJson(nativePackageFile)
  if (nativePackage.name !== native.package || nativePackage.version !== EXPECTED_VERSION) throw new Error('native CLI package identity/version drifted')

  const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-claude-discovery-'))
  try {
    const sanitized = sanitizedEnvironment(configRoot)
    const result = spawnSync(executable, ['--version'], {
      encoding: 'utf8',
      env: sanitized.environment,
      windowsHide: true,
      timeout: 10000,
    })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error('native CLI --version failed with status ' + result.status)
    const cliVersion = String(result.stdout || result.stderr).trim()
    if (cliVersion !== EXPECTED_CLAUDE_CODE_VERSION + ' (Claude Code)') throw new Error('native CLI version drifted')

    return {
      schema: 'dsh-researcher/adapter-native-trace/v1',
      client: 'claude-code-agent-sdk',
      runtime_version: EXPECTED_VERSION,
      capture_kind: 'runtime-load-no-model',
      model_calls: 0,
      prompt_submissions: 0,
      session_creations: 0,
      network_calls_initiated_by_capture: 0,
      network_observation: 'not instrumented; capture performs only a local module import and native CLI --version',
      credential_boundary: {
        policy: 'remove provider, Claude, proxy, API-key, access-token, and auth-token environment names; use fresh temporary CLAUDE_CONFIG_DIR',
        removed_name_count: sanitized.removed.length,
        names_not_disclosed: true,
      },
      package: {
        name: pkg.name,
        version: pkg.version,
        claude_code_version: pkg.claudeCodeVersion,
        package_json_sha256: locked.hashes['package.json'],
        sdk_module_sha256: locked.hashes['sdk.mjs'],
      },
      runtime_exports: exports,
      native_cli: {
        package: nativePackage.name,
        package_version: nativePackage.version,
        version_output: cliVersion,
        executable_sha256: sha256(executable),
      },
      claim_boundary: 'Runtime load and CLI identity only; no query, startup, session, prompt, tool, model, approval, resume, or replay path was invoked.',
    }
  } finally {
    fs.rmSync(configRoot, { recursive: true, force: true })
  }
}

const main = async () => {
  const args = parseArgs(process.argv.slice(2))
  const report = await capture(requireString(args['sdk-root'], '--sdk-root'))
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
}

if (require.main === module) main().catch((error) => {
  process.stderr.write('Claude Agent SDK discovery capture failed: ' + error.message + '\n')
  process.exitCode = 1
})

module.exports = { capture, nativeIdentity, sanitizedEnvironment }
