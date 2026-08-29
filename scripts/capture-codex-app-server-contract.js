#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const EXPECTED_VERSION = '0.150.0-alpha.12.2'
const EXPECTED_VERSION_OUTPUT = 'codex-cli ' + EXPECTED_VERSION

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')
const sha256File = (file) => sha256(fs.readFileSync(file))
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

const extractMethods = (schema) => {
  if (!schema || !Array.isArray(schema.oneOf)) throw new Error('method schema must contain oneOf')
  const methods = schema.oneOf.flatMap((entry) => entry?.properties?.method?.enum || [])
  if (methods.length !== schema.oneOf.length || methods.some((item) => typeof item !== 'string' || item.length === 0)) throw new Error('method schema contains an unbound variant')
  if (new Set(methods).size !== methods.length) throw new Error('method schema contains duplicate methods')
  return methods.sort()
}

const summarizeMethods = (methods) => ({
  count: methods.length,
  sha256: sha256(Buffer.from('dsh-researcher/codex-method-inventory/v1\0' + JSON.stringify(methods))),
})

const bundleTreeHash = (root) => {
  const files = []
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(absolute)
      else if (entry.isFile()) files.push(absolute)
      else throw new Error('schema bundle contains a non-file entry')
    }
  }
  walk(root)
  const hash = crypto.createHash('sha256')
  hash.update('dsh-researcher/codex-schema-bundle/v1\0')
  for (const absolute of files.sort()) {
    const relative = path.relative(root, absolute).split(path.sep).join('/')
    hash.update(relative + '\0')
    hash.update(fs.readFileSync(absolute))
    hash.update('\0')
  }
  return { file_count: files.length, sha256: hash.digest('hex') }
}

const sanitizedEnvironment = (codexHome, source = process.env) => {
  const environment = {}
  const removed = []
  for (const [name, value] of Object.entries(source)) {
    if (/^(?:OPENAI|CODEX|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY)/i.test(name) || /(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN)$/i.test(name)) {
      removed.push(name)
      continue
    }
    environment[name] = value
  }
  environment.CODEX_HOME = codexHome
  return { environment, removed: removed.sort() }
}

const checkedSpawn = (command, args, options) => {
  const result = spawnSync(command, args, { ...options, encoding: 'utf8', windowsHide: true, timeout: 30000 })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(command + ' ' + args.join(' ') + ' failed with status ' + result.status + ': ' + String(result.stderr || '').trim().slice(-500))
  return String(result.stdout || result.stderr).trim()
}

const capture = () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-codex-contract-'))
  const codexHome = path.join(tempRoot, 'codex-home')
  const schemaRoot = path.join(tempRoot, 'schema')
  fs.mkdirSync(codexHome)
  fs.mkdirSync(schemaRoot)
  try {
    const sanitized = sanitizedEnvironment(codexHome)
    const versionOutput = checkedSpawn('codex', ['--version'], { env: sanitized.environment })
    if (versionOutput !== EXPECTED_VERSION_OUTPUT) throw new Error('Codex CLI version drifted: ' + versionOutput)
    checkedSpawn('codex', ['app-server', 'generate-json-schema', '--out', schemaRoot, '--experimental'], { env: sanitized.environment })

    const combined = readJson(path.join(schemaRoot, 'codex_app_server_protocol.v2.schemas.json'))
    const definitions = combined.definitions || {}
    const clientRequests = extractMethods(definitions.ClientRequest)
    const serverNotifications = extractMethods(definitions.ServerNotification)
    const clientNotifications = extractMethods(readJson(path.join(schemaRoot, 'ClientNotification.json')))
    const serverRequests = extractMethods(readJson(path.join(schemaRoot, 'ServerRequest.json')))
    const required = {
      client_requests: ['initialize', 'thread/start', 'thread/read', 'thread/resume', 'turn/start', 'turn/interrupt'],
      server_requests: ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/permissions/requestApproval', 'item/tool/requestUserInput'],
      server_notifications: ['thread/started', 'turn/started', 'item/started', 'item/completed', 'turn/completed', 'thread/tokenUsage/updated'],
    }
    for (const [group, names] of Object.entries(required)) {
      const observed = group === 'client_requests' ? clientRequests : group === 'server_requests' ? serverRequests : serverNotifications
      for (const name of names) if (!observed.includes(name)) throw new Error('required ' + group + ' method is missing: ' + name)
    }
    const tree = bundleTreeHash(schemaRoot)
    return {
      schema: 'dsh-researcher/adapter-contract-capture/v1',
      client: 'codex-app-server-stdio',
      runtime_version: EXPECTED_VERSION,
      capture_kind: 'schema-generation-no-model',
      model_calls: 0,
      prompt_submissions: 0,
      session_creations: 0,
      network_calls_initiated_by_capture: 0,
      network_observation: 'not instrumented; capture invokes only codex --version and local app-server schema generation',
      credential_boundary: {
        policy: 'remove OpenAI, Codex, proxy, API-key, access-token, and auth-token environment names; use fresh temporary CODEX_HOME',
        removed_name_count: sanitized.removed.length,
        names_not_disclosed: true,
      },
      generator: 'codex app-server generate-json-schema --experimental',
      schema_bundle: {
        file_count: tree.file_count,
        tree_sha256: tree.sha256,
        v2_schema_sha256: sha256File(path.join(schemaRoot, 'codex_app_server_protocol.v2.schemas.json')),
      },
      method_inventory: {
        client_requests: summarizeMethods(clientRequests),
        client_notifications: summarizeMethods(clientNotifications),
        server_requests: summarizeMethods(serverRequests),
        server_notifications: summarizeMethods(serverNotifications),
      },
      required_governance_subset: required,
      claim_boundary: 'Schema generation and method inventory only; no thread, turn, item, approval, prompt, session, tool, model, resume, or replay path was invoked.',
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

const main = () => process.stdout.write(JSON.stringify(capture(), null, 2) + '\n')

if (require.main === module) {
  try { main() } catch (error) {
    process.stderr.write('Codex App Server contract capture failed: ' + error.message + '\n')
    process.exitCode = 1
  }
}

module.exports = { bundleTreeHash, capture, extractMethods, sanitizedEnvironment, summarizeMethods }
