const crypto = require('node:crypto')

const canonicalize = (value) => {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON does not support non-finite numbers')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']'
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError('canonical JSON requires plain objects')
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort()
    return '{' + keys.map((key) => JSON.stringify(key) + ':' + canonicalize(value[key])).join(',') + '}'
  }
  throw new TypeError('canonical JSON does not support ' + typeof value)
}

const hashCanonical = (value) => crypto.createHash('sha256').update(canonicalize(value), 'utf8').digest('hex')

module.exports = { canonicalize, hashCanonical }
