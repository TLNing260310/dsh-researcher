'use strict'

const PACKAGE = require('../package.json')

const PROJECT_PACKAGE_NAME = PACKAGE.name
const PROJECT_PACKAGE_VERSION = PACKAGE.version
const VERIFIED_DSH = '0.1.1-rc.2'
const DSH_NODE_RANGE = '^22.19.0 || >=24.0.0'

const parseNodeVersion = (value) => {
  const match = String(value || '').match(/^v?(\d+)\.(\d+)\.(\d+)/)
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) } : null
}

const supportsDshNode = (value) => {
  const parsed = parseNodeVersion(value)
  return Boolean(parsed && (parsed.major >= 24 || (parsed.major === 22 && parsed.minor >= 19)))
}

const assertDshNodeSupported = (value = process.version) => {
  if (!supportsDshNode(value)) throw new Error('DSH ' + VERIFIED_DSH + ' requires Node ' + DSH_NODE_RANGE + '; current runtime is ' + value)
  return value
}

module.exports = {
  PROJECT_PACKAGE_NAME,
  PROJECT_PACKAGE_VERSION,
  VERIFIED_DSH,
  DSH_NODE_RANGE,
  parseNodeVersion,
  supportsDshNode,
  assertDshNodeSupported,
}
