'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const CLAUDE_SDK_LOCK = Object.freeze({
  name: '@anthropic-ai/claude-agent-sdk',
  version: '0.3.251',
  claudeCodeVersion: '2.1.251',
  files: Object.freeze({
    'package.json': '0559ea545c7cbe07cf8fbc163cbacfa3bf6f79c767226302f6b64a27cdb7f92f',
    'sdk.mjs': '9235fac983c29e614d7f572a578406dc5dbda006305faa99f9447f577738eb93',
    'sdk.d.ts': '4b30226ce2ea3d4ff0b81b4f3a229fa9fc1d60bf464452263608d26547a72cfe',
  }),
})

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

const inspectClaudeSdkRoot = (sdkRoot) => {
  const root = path.resolve(sdkRoot)
  const files = Object.fromEntries(Object.keys(CLAUDE_SDK_LOCK.files).map((name) => [name, path.join(root, name)]))
  for (const [name, file] of Object.entries(files)) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error('--sdk-root is missing ' + name)
  }
  let pkg
  try { pkg = JSON.parse(fs.readFileSync(files['package.json'], 'utf8')) } catch (error) { throw new Error('SDK package.json is invalid: ' + error.message) }
  const hashes = Object.fromEntries(Object.entries(files).map(([name, file]) => [name, sha256(file)]))
  return { root, files, hashes, pkg }
}

const assertLockedClaudeSdk = (sdkRoot, expected = CLAUDE_SDK_LOCK) => {
  const inspected = inspectClaudeSdkRoot(sdkRoot)
  if (inspected.pkg.name !== expected.name || inspected.pkg.version !== expected.version || inspected.pkg.claudeCodeVersion !== expected.claudeCodeVersion) throw new Error('SDK package identity/version drifted')
  for (const [name, expectedHash] of Object.entries(expected.files)) {
    if (inspected.hashes[name] !== expectedHash) throw new Error('SDK content hash drifted: ' + name)
  }
  return inspected
}

module.exports = { CLAUDE_SDK_LOCK, assertLockedClaudeSdk, inspectClaudeSdkRoot }
