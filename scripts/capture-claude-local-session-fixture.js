#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { sanitizedEnvironment } = require('./capture-claude-agent-sdk-discovery.js')
const { CLAUDE_SDK_LOCK, assertLockedClaudeSdk } = require('./claude-agent-sdk-lock.js')

const EXPECTED_VERSION = CLAUDE_SDK_LOCK.version

const parseArgs = (argv) => {
  if (argv.length !== 2 || argv[0] !== '--sdk-root' || !argv[1] || argv[1].startsWith('--')) throw new Error('usage: --sdk-root <exact-package-root>')
  return { sdkRoot: argv[1] }
}

const capture = (sdkRoot, dependencies = {}) => {
  const locked = (dependencies.assertLockedClaudeSdk || assertLockedClaudeSdk)(sdkRoot)
  const { pkg } = locked
  const sdkFile = locked.files['sdk.mjs']

  const tempRoot = fs.mkdtempSync(path.join(dependencies.tempRoot || os.tmpdir(), 'dsh-claude-local-session-fixture-'))
  const configRoot = path.join(tempRoot, 'config')
  const projectRoot = path.join(tempRoot, 'project')
  fs.mkdirSync(configRoot)
  fs.mkdirSync(projectRoot)
  try {
    const sanitized = sanitizedEnvironment(configRoot, dependencies.environment || process.env)
    const helper = path.join(__dirname, 'claude-local-session-fixture-probe.mjs')
    const result = (dependencies.spawnSync || spawnSync)(process.execPath, [helper, sdkFile, projectRoot, configRoot], {
      encoding: 'utf8',
      env: sanitized.environment,
      windowsHide: true,
      timeout: 30000,
    })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error('isolated Claude local session fixture probe failed with status ' + result.status + ': ' + String(result.stderr || '').trim().slice(-500))
    const probe = JSON.parse(String(result.stdout || '').trim())
    if (probe.schema !== 'dsh-researcher/claude-local-session-fixture-probe/v1' || !Array.isArray(probe.calls) || probe.calls.length !== 3) throw new Error('Claude local session fixture probe output drifted')

    return {
      schema: 'dsh-researcher/adapter-local-session-parser-trace/v1',
      client: 'claude-code-agent-sdk',
      runtime_version: EXPECTED_VERSION,
      capture_kind: 'host-authored-local-session-fixture-no-model',
      model_calls: 0,
      prompt_submissions: 0,
      sdk_session_creations: 0,
      host_fixture_sessions: 1,
      network_calls_initiated_by_capture: 0,
      network_observation: 'not instrumented; the capture imports the locked SDK and invokes only local session-read APIs against a host-authored transcript',
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
        sdk_types_sha256: locked.hashes['sdk.d.ts'],
      },
      fixture: probe.fixture,
      api_calls: probe.calls,
      isolated_config: true,
      isolated_project: true,
      user_session_data_read: false,
      claim_boundary: 'The real locked SDK parsed one host-authored local JSONL fixture without model use and without mutating it. The fixture is not an authentic Claude Code session or native event stream and proves no resume, replay, tool, approval, compatibility, or conformance capability.',
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
    process.stderr.write('Claude local session fixture discovery capture failed: ' + error.message + '\n')
    process.exitCode = 1
  }
}

module.exports = { capture, parseArgs }
