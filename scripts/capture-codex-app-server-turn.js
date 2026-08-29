#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const readline = require('node:readline')
const { spawn } = require('node:child_process')

const EXPECTED_VERSION = '0.150.0-alpha.12.2'
const EXPECTED_VERSION_OUTPUT = 'codex-cli ' + EXPECTED_VERSION
const PROMPT = 'Return exactly the single token OK. Do not call tools, inspect files, or modify anything.'
const TIMEOUT_MS = 120000

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')
const hashId = (value) => typeof value === 'string' && value.length > 0 ? sha256('dsh-researcher/codex-native-id/v1\0' + value) : null
const keys = (value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).sort() : []

const parseArgs = (args) => {
  const allowed = new Set(['--ack-codex-usage'])
  for (const arg of args) if (!allowed.has(arg)) throw new Error('unknown argument: ' + arg)
  return { ackUsage: args.includes('--ack-codex-usage') }
}

const capture = ({ ackUsage }, dependencies = {}) => new Promise((resolve, reject) => {
  if (!ackUsage) throw new Error('refusing to start a model turn without --ack-codex-usage')

  const spawnProcess = dependencies.spawnProcess || spawn
  const timeoutMs = dependencies.timeoutMs || TIMEOUT_MS
  const synthetic = dependencies.synthetic === true
  const workspace = fs.mkdtempSync(path.join(dependencies.tempRoot || os.tmpdir(), 'dsh-codex-turn-'))
  const child = spawnProcess('codex', ['app-server', '--stdio'], {
    cwd: path.resolve(__dirname, '..'),
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    env: { ...process.env },
  })
  const requests = []
  const notifications = []
  const serverRequests = []
  const responses = []
  const itemTypes = []
  const turnStatuses = []
  let stderr = ''
  let threadId = null
  let turnId = null
  let ephemeralThread = false
  let settled = false

  const send = (message, policy = null) => {
    const responseId = !message.method && Object.hasOwn(message, 'id') ? hashId(String(message.id)) : null
    requests.push({ id: message.method ? message.id ?? null : null, response_id_sha256: responseId, method: message.method || '<response>', policy })
    child.stdin.write(JSON.stringify(message) + '\n')
  }
  const finish = (error) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    const complete = () => {
      let temporaryWorkspaceRemoved = false
      let cleanupErrorCode = null
      try {
        fs.rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
        temporaryWorkspaceRemoved = true
      } catch (cleanupError) {
        cleanupErrorCode = typeof cleanupError?.code === 'string' ? cleanupError.code : 'UNKNOWN'
      }
      if (error) {
        const diagnostic = stderr.split(/\r?\n/).filter(Boolean).slice(-4).join(' | ').replace(/[A-Za-z]:\\[^ |]+/g, '<redacted-path>')
        reject(new Error(error.message + (diagnostic ? ' (' + diagnostic + ')' : '') + (cleanupErrorCode ? ' [cleanup=' + cleanupErrorCode + ']' : '')))
        return
      }
      resolve({
        schema: 'dsh-researcher/adapter-native-turn-trace/v1',
        client: 'codex-app-server-stdio',
        runtime_version: EXPECTED_VERSION,
        capture_kind: synthetic ? 'synthetic-single-turn-no-model' : 'live-single-turn-model',
        model_calls: synthetic ? 0 : 1,
        prompt_submissions: synthetic ? 0 : 1,
        network_observation: synthetic ? 'in-memory protocol fixture; no process or network call' : 'not instrumented; one authenticated Codex model turn was intentionally initiated',
        isolated_workspace: true,
        sandbox_policy: { type: 'readOnly', networkAccess: false },
        approval_policy: 'never',
        unexpected_server_requests: serverRequests.length,
        auto_approved_requests: 0,
        refused_server_requests: serverRequests.length,
        prompt_sha256: sha256(PROMPT),
        requests,
        responses,
        notifications,
        observed_item_types: [...new Set(itemTypes)].sort(),
        observed_turn_statuses: [...new Set(turnStatuses)],
        correlation: { thread_id_sha256: hashId(threadId), turn_id_sha256: hashId(turnId) },
        cleanup: { temporary_workspace_removed: temporaryWorkspaceRemoved, cleanup_error_code: cleanupErrorCode, ephemeral_thread: ephemeralThread, persisted_thread_created: false },
        redaction: 'prompt content, response text, reasoning, paths, account data, raw identifiers, token counts, and native payload values omitted',
        claim_boundary: synthetic
          ? 'Synthetic protocol lifecycle only. No native client behavior, model call, HostEvent mapping, compatibility, or governed adapter behavior is proven.'
          : 'One text-only native turn lifecycle was observed. No tool, approval acceptance, write, resume, replay, hard-stop, usage-completeness, or governed adapter behavior is proven.',
      })
    }
    if (child.exitCode !== null) complete()
    else {
      let completed = false
      const completeOnce = () => {
        if (completed) return
        completed = true
        complete()
      }
      child.once('close', completeOnce)
      child.stdin.end()
      child.kill()
      setTimeout(completeOnce, 2000)
    }
  }

  const timer = setTimeout(() => {
    if (threadId && turnId) send({ jsonrpc: '2.0', id: 90, method: 'turn/interrupt', params: { threadId, turnId } }, 'timeout-interrupt')
    setTimeout(() => finish(new Error('timed out waiting for app-server turn')), 1000).unref()
  }, timeoutMs)

  child.stderr.on('data', (chunk) => { stderr = (stderr + String(chunk)).slice(-8192) })
  child.on('error', finish)
  child.on('exit', (code) => { if (!settled) finish(new Error('app-server exited before capture completed with code ' + code)) })

  const lines = readline.createInterface({ input: child.stdout })
  lines.on('line', (line) => {
    let message
    try { message = JSON.parse(line) } catch { return }

    if (message.method && Object.hasOwn(message, 'id')) {
      serverRequests.push({ method: message.method, id_sha256: hashId(String(message.id)), param_keys: keys(message.params) })
      send({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: 'Client policy denied unexpected server request' } }, 'automatic-safety-refusal')
      return
    }
    if (message.method) {
      const item = message.params?.item
      const turn = message.params?.turn
      if (typeof item?.type === 'string') itemTypes.push(item.type)
      if (typeof turn?.status === 'string') turnStatuses.push(turn.status)
      notifications.push({
        method: message.method,
        param_keys: keys(message.params),
        item_type: typeof item?.type === 'string' ? item.type : null,
        item_status: typeof item?.status === 'string' ? item.status : null,
        turn_status: typeof turn?.status === 'string' ? turn.status : null,
      })
      if (message.method === 'turn/completed' && threadId) finish()
      return
    }
    if (!Object.hasOwn(message, 'id')) return
    if (message.error) return finish(new Error('JSON-RPC request ' + message.id + ' failed with code ' + message.error.code))
    responses.push({ id: message.id, result_keys: keys(message.result) })
    if (message.id === 1) {
      send({ jsonrpc: '2.0', method: 'initialized', params: {} })
      send({
        jsonrpc: '2.0', id: 2, method: 'thread/start', params: {
          cwd: workspace,
          approvalPolicy: 'never',
          sandbox: 'read-only',
          ephemeral: true,
          serviceName: 'dsh_researcher_discovery',
        },
      })
    } else if (message.id === 2) {
      threadId = message.result?.thread?.id
      if (!threadId) return finish(new Error('thread/start returned no thread id'))
      ephemeralThread = message.result?.thread?.ephemeral === true
      if (!ephemeralThread) return finish(new Error('thread/start did not create an ephemeral thread'))
      send({
        jsonrpc: '2.0', id: 3, method: 'turn/start', params: {
          threadId,
          input: [{ type: 'text', text: PROMPT }],
          cwd: workspace,
          approvalPolicy: 'never',
          sandboxPolicy: { type: 'readOnly', networkAccess: false },
          effort: 'low',
        },
      })
    } else if (message.id === 3) {
      turnId = message.result?.turn?.id
      if (!turnId) return finish(new Error('turn/start returned no turn id'))
    }
  })

  send({
    jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      clientInfo: { name: 'dsh-researcher-discovery', title: 'dsh-researcher discovery', version: '1' },
      capabilities: { experimentalApi: true },
    },
  })
})

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  if (!options.ackUsage) throw new Error('refusing to start a model turn without --ack-codex-usage')
  const version = await new Promise((resolve, reject) => {
    const child = spawn('codex', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let output = ''
    child.stdout.on('data', (chunk) => { output += String(chunk) })
    child.stderr.on('data', (chunk) => { output += String(chunk) })
    child.on('error', reject)
    child.on('exit', (code) => code === 0 ? resolve(output.trim().split(/\r?\n/).filter(Boolean).at(-1)) : reject(new Error('codex --version failed with code ' + code)))
  })
  if (version !== EXPECTED_VERSION_OUTPUT) throw new Error('Codex CLI version drifted: ' + version)
  process.stdout.write(JSON.stringify(await capture(options), null, 2) + '\n')
}

if (require.main === module) main().catch((error) => {
  process.stderr.write('Codex App Server turn capture failed: ' + error.message + '\n')
  process.exitCode = 1
})

module.exports = { EXPECTED_VERSION, PROMPT, capture, hashId, parseArgs }
