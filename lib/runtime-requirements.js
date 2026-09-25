'use strict'

const PACKAGE = require('../package.json')

const PROJECT_PACKAGE_NAME = PACKAGE.name
const PROJECT_PACKAGE_VERSION = PACKAGE.version
// TWO SEPARATE PINS — do not couple them again.
//
// `VERIFIED_DSH` is the PRODUCT pin: the DSH runtime this preset bundle is
// verified against for installation. It moves forward as DSH releases.
//
// `FROZEN_E1_DSH` is the EVALUATION pin: the runtime the E1 protocol was
// frozen against. It is written into the E1 manifest and run-lock schemas as a
// `const` and must NEVER move with the product — changing it would rewrite an
// already-frozen experimental condition (invariant I4).
//
// They diverged when DSH moved 0.1.1-rc.2 -> 0.1.5-rc.2. Holding both roles in
// one constant made a product upgrade impossible without invalidating E1, and
// that constant reached into E21's fingerprint-frozen set. Owner-authorized
// unfreeze: cognition revision 38.
const VERIFIED_DSH = '0.1.5-rc.2'
const FROZEN_E1_DSH = '0.1.1-rc.2'
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
  FROZEN_E1_DSH,
  DSH_NODE_RANGE,
  parseNodeVersion,
  supportsDshNode,
  assertDshNodeSupported,
}
