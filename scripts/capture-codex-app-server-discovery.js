#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const readline = require('node:readline')
const { spawn, spawnSync } = require('node:child_process')
const { sanitizedEnvironment } = require('./capture-codex-app-server-contract.js')
const { CODEX_CLI_LOCK, assertLockedCodexExecutable, parseCodexBin, publicExecutableIdentity } = require('./codex-cli-lock.js')

const TIMEOUT_MS = 15000

const capture = (codexBin, dependencies = {}) => new Promise((resolve, reject) => {
  const assertLocked = dependencies.assertLockedCodexExecutable || assertLockedCodexExecutable
  const executable = assertLocked(codexBin, dependencies.lock || CODEX_CLI_LOCK, dependencies.host || {})
  const spawnCommand = dependencies.spawnProcess || spawn
  const spawnVersion = dependencies.spawnSync || spawnSync
  const tempRoot = fs.mkdtempSync(path.join(dependencies.tempRoot || os.tmpdir(), 'dsh-codex-native-'))
  const codexHome = path.join(tempRoot, 'codex-home')
  fs.mkdirSync(codexHome)
  const sanitized = sanitizedEnvironment(codexHome, dependencies.environment || process.env)
  const version = spawnVersion(executable.path, ['--version'], { env: sanitized.environment, encoding: 'utf8', windowsHide: true, timeout: 30000 })
  if (version.error || version.status !== 0) {
    fs.rmSync(tempRoot, { recursive: true, force: true })
    throw version.error || new Error('codex --version failed with status ' + version.status)
  }
  const versionOutput = String(version.stdout || version.stderr).trim()
  if (versionOutput !== CODEX_CLI_LOCK.versionOutput) {
    fs.rmSync(tempRoot, { recursive: true, force: true })
    throw new Error('Codex CLI version drifted: ' + versionOutput)
  }

  const child = spawnCommand(executable.path, ['app-server', '--stdio'], {
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: sanitized.environment,
  })
  const requests = []
  const responses = []
  let stderr = ''
  let settled = false
  const send = (message) => {
    requests.push({ id: message.id ?? null, method: message.method })
    child.stdin.write(JSON.stringify(message) + '\n')
  }
  const finish = (error) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    const complete = () => {
      let cleanupErrorCode = null
      try { fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) } catch (cleanupError) {
        cleanupErrorCode = typeof cleanupError?.code === 'string' ? cleanupError.code : 'UNKNOWN'
      }
      if (error || cleanupErrorCode) {
        const diagnostic = stderr.split(/\r?\n/).filter(Boolean).slice(-4).join(' | ').replace(/[A-Za-z]:\\[^ |]+/g, '<redacted-path>')
        reject(new Error((error?.message || 'temporary CODEX_HOME cleanup failed') + (diagnostic ? ' (' + diagnostic + ')' : '') + (cleanupErrorCode ? ' [cleanup=' + cleanupErrorCode + ']' : '')))
        return
      }
      resolve(buildTrace())
    }
    if (child.exitCode !== null) complete()
    else {
      child.once('close', complete)
      child.stdin.end()
      child.kill()
    }
  }
  const buildTrace = () => ({
      schema: 'dsh-researcher/adapter-native-trace/v1',
      client: 'codex-app-server-stdio',
      runtime_version: CODEX_CLI_LOCK.version,
      executable: publicExecutableIdentity(executable, versionOutput),
      capture_kind: 'live-no-model',
      model_calls: 0,
      prompt_submissions: 0,
      session_creations: 0,
      network_calls_initiated_by_capture: 0,
      credential_boundary: {
        policy: 'remove OpenAI, Codex, proxy, API-key, access-token, and auth-token environment names; use fresh temporary CODEX_HOME',
        removed_name_count: sanitized.removed.length,
        names_not_disclosed: true,
      },
      redaction: 'values removed; only method names, ids, and result key names retained',
      requests,
      responses,
      claim_boundary: 'Initialize and empty thread/list only. No thread creation, turn, prompt, item, approval, tool, model, resume, replay, user session, or governed adapter behavior is proven.',
    })
  const timer = setTimeout(() => finish(new Error('timed out waiting for app-server')), dependencies.timeoutMs || TIMEOUT_MS)
  const lines = readline.createInterface({ input: child.stdout })
  child.stderr.on('data', (chunk) => { stderr = (stderr + String(chunk)).slice(-8192) })
  lines.on('line', (line) => {
    let message
    try { message = JSON.parse(line) } catch { return }
    if (message.id === 1 && message.result) {
      responses.push({ id: 1, result_keys: Object.keys(message.result).sort() })
      send({ jsonrpc: '2.0', method: 'initialized', params: {} })
      send({ jsonrpc: '2.0', id: 2, method: 'thread/list', params: { limit: 0, useStateDbOnly: true } })
    } else if (message.id === 2) {
      if (message.error) finish(new Error('thread/list returned JSON-RPC error code ' + message.error.code))
      else {
        responses.push({ id: 2, result_keys: Object.keys(message.result || {}).sort() })
        finish()
      }
    }
  })
  child.on('error', finish)
  child.on('exit', (code) => { if (!settled) finish(new Error('app-server exited before capture completed with code ' + code)) })
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
    clientInfo: { name: 'dsh-researcher-discovery', title: 'dsh-researcher discovery', version: '1' },
    capabilities: { experimentalApi: true },
  } })
})

const main = async () => {
  const { codexBin } = parseCodexBin(process.argv.slice(2))
  process.stdout.write(JSON.stringify(await capture(codexBin), null, 2) + '\n')
}

if (require.main === module) main().catch((error) => {
  process.stderr.write('Codex discovery capture failed: ' + error.message + '\n')
  process.exitCode = 1
})

module.exports = { capture }
