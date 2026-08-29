#!/usr/bin/env node
'use strict'

const { spawn } = require('node:child_process')
const readline = require('node:readline')

const timeoutMs = 15000
const child = spawn('codex', ['app-server', '--stdio'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
  env: { ...process.env },
})

const requests = []
const responses = []
let stderr = ''
let finished = false

const send = (message) => {
  requests.push({ id: message.id ?? null, method: message.method })
  child.stdin.write(JSON.stringify(message) + '\n')
}

const finish = (error) => {
  if (finished) return
  finished = true
  clearTimeout(timer)
  child.kill()
  if (error) {
    const diagnostic = stderr.split(/\r?\n/).filter(Boolean).slice(-4).join(' | ').replace(/[A-Za-z]:\\[^ |]+/g, '<redacted-path>')
    process.stderr.write('Codex discovery capture failed: ' + error.message + (diagnostic ? ' (' + diagnostic + ')' : '') + '\n')
    process.exitCode = 1
    return
  }
  process.stdout.write(JSON.stringify({
    schema: 'dsh-researcher/adapter-native-trace/v1',
    client: 'codex-app-server-stdio',
    runtime_version: '0.150.0-alpha.12.2',
    capture_kind: 'live-no-model',
    model_calls: 0,
    network_calls_initiated_by_capture: 0,
    redaction: 'values removed; only method names, ids, and result key names retained',
    requests,
    responses,
  }, null, 2) + '\n')
}

const timer = setTimeout(() => finish(new Error('timed out waiting for app-server')), timeoutMs)
const lines = readline.createInterface({ input: child.stdout })
child.stderr.on('data', (chunk) => { stderr += String(chunk).slice(0, 8192) })

lines.on('line', (line) => {
  let message
  try { message = JSON.parse(line) } catch { return }
  if (message.id === 1 && message.result) {
    responses.push({ id: 1, result_keys: Object.keys(message.result).sort() })
    send({ jsonrpc: '2.0', method: 'initialized', params: {} })
    send({ jsonrpc: '2.0', id: 2, method: 'thread/list', params: { limit: 0, useStateDbOnly: true } })
    return
  }
  if (message.id === 2) {
    if (message.error) return finish(new Error('thread/list returned JSON-RPC error code ' + message.error.code))
    responses.push({ id: 2, result_keys: Object.keys(message.result || {}).sort() })
    finish()
  }
})

child.on('error', finish)
child.on('exit', (code) => {
  if (!finished) finish(new Error('app-server exited before capture completed with code ' + code))
})

send({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    clientInfo: { name: 'dsh-researcher-discovery', version: '1' },
    capabilities: { experimentalApi: true },
  },
})
