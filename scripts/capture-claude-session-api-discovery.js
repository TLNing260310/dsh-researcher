#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { sanitizedEnvironment } = require('./capture-claude-agent-sdk-discovery.js')

const EXPECTED_PACKAGE = '@anthropic-ai/claude-agent-sdk'
const EXPECTED_VERSION = '0.3.251'
const EXPECTED_CLAUDE_CODE_VERSION = '2.1.251'

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

const parseArgs = (argv) => {
  if (argv.length !== 2 || argv[0] !== '--sdk-root' || !argv[1] || argv[1].startsWith('--')) throw new Error('usage: --sdk-root <exact-package-root>')
  return { sdkRoot: argv[1] }
}

const capture = (sdkRoot, dependencies = {}) => {
  const root = path.resolve(sdkRoot)
  const packageFile = path.join(root, 'package.json')
  const sdkFile = path.join(root, 'sdk.mjs')
  const typesFile = path.join(root, 'sdk.d.ts')
  for (const file of [packageFile, sdkFile, typesFile]) if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error('--sdk-root is missing ' + path.basename(file))
  const pkg = readJson(packageFile)
  if (pkg.name !== EXPECTED_PACKAGE || pkg.version !== EXPECTED_VERSION || pkg.claudeCodeVersion !== EXPECTED_CLAUDE_CODE_VERSION) throw new Error('SDK package identity/version drifted')

  const tempRoot = fs.mkdtempSync(path.join(dependencies.tempRoot || os.tmpdir(), 'dsh-claude-session-api-'))
  const configRoot = path.join(tempRoot, 'config')
  const projectRoot = path.join(tempRoot, 'project')
  fs.mkdirSync(configRoot)
  fs.mkdirSync(projectRoot)
  try {
    const sanitized = sanitizedEnvironment(configRoot, dependencies.environment || process.env)
    const helper = path.join(__dirname, 'claude-session-api-probe.mjs')
    const result = (dependencies.spawnSync || spawnSync)(process.execPath, [helper, sdkFile, projectRoot], {
      encoding: 'utf8',
      env: sanitized.environment,
      windowsHide: true,
      timeout: 30000,
    })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error('isolated Claude session API probe failed with status ' + result.status + ': ' + String(result.stderr || '').trim().slice(-500))
    const probe = JSON.parse(String(result.stdout || '').trim())
    if (probe.schema !== 'dsh-researcher/claude-session-api-probe/v1' || !Array.isArray(probe.calls) || probe.calls.length !== 3) throw new Error('Claude session API probe output drifted')

    return {
      schema: 'dsh-researcher/adapter-native-session-api-trace/v1',
      client: 'claude-code-agent-sdk',
      runtime_version: EXPECTED_VERSION,
      capture_kind: 'isolated-session-read-no-model',
      model_calls: 0,
      prompt_submissions: 0,
      session_creations: 0,
      network_calls_initiated_by_capture: 0,
      network_observation: 'not instrumented; the capture invokes only documented local session-read APIs against a fresh config and empty project directory',
      credential_boundary: {
        policy: 'remove provider, Claude, proxy, API-key, access-token, and auth-token environment names; use fresh temporary CLAUDE_CONFIG_DIR',
        removed_name_count: sanitized.removed.length,
        names_not_disclosed: true,
      },
      package: {
        name: pkg.name,
        version: pkg.version,
        claude_code_version: pkg.claudeCodeVersion,
        package_json_sha256: sha256(packageFile),
        sdk_module_sha256: sha256(sdkFile),
        sdk_types_sha256: sha256(typesFile),
      },
      api_calls: probe.calls,
      isolated_config: true,
      isolated_project: true,
      user_session_data_read: false,
      claim_boundary: 'Real SDK local session-read functions executed only against an empty isolated config. No existing user session, query, prompt, tool, model, approval, resume, replay, or native event stream was observed.',
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

const main = () => {
  const args = parseArgs(process.argv.slice(2))
  process.stdout.write(JSON.stringify(capture(args.sdkRoot), null, 2) + '\n')
}

if (require.main === module) {
  try { main() } catch (error) {
    process.stderr.write('Claude session API discovery capture failed: ' + error.message + '\n')
    process.exitCode = 1
  }
}

module.exports = { capture, parseArgs }
