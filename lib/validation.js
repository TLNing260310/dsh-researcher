const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

const fail = (label, message) => {
  const error = new TypeError(label + ': ' + message)
  error.code = 'VALIDATION_ERROR'
  throw error
}

const allowedKeys = (value, keys, label) => {
  if (!isPlainObject(value)) fail(label, 'must be an object')
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(label, 'unknown field "' + key + '"')
}

const text = (value, label, options = {}) => {
  if (typeof value !== 'string') fail(label, 'must be a string')
  if (options.nonEmpty !== false && value.trim().length === 0) fail(label, 'must not be empty')
  if (value.length > (options.max || 10000)) fail(label, 'is too long')
  if (value.includes('\0')) fail(label, 'contains a NUL character')
  return value
}

const stringArray = (value, label, options = {}) => {
  if (!Array.isArray(value)) fail(label, 'must be an array')
  if (value.length > (options.maxItems || 1000)) fail(label, 'has too many items')
  value.forEach((item, index) => text(item, label + '[' + index + ']', { nonEmpty: options.nonEmpty !== false, max: options.maxLength || 2000 }))
  if (options.unique !== false && new Set(value).size !== value.length) fail(label, 'must not contain duplicates')
  return value
}

const enumValue = (value, values, label) => {
  if (!values.includes(value)) fail(label, 'must be one of: ' + values.join(', '))
  return value
}

const positiveInteger = (value, label, options = {}) => {
  const minimum = options.minimum === undefined ? 1 : options.minimum
  if (!Number.isSafeInteger(value) || value < minimum) fail(label, 'must be an integer >= ' + minimum)
  return value
}

const finiteNumber = (value, label, options = {}) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(label, 'must be a finite number')
  if (options.minimum !== undefined && value < options.minimum) fail(label, 'must be >= ' + options.minimum)
  if (options.maximum !== undefined && value > options.maximum) fail(label, 'must be <= ' + options.maximum)
  return value
}

const uniqueBy = (items, key, label) => {
  const seen = new Set()
  for (const item of items) {
    if (seen.has(item[key])) fail(label, 'contains duplicate ' + key + ' "' + item[key] + '"')
    seen.add(item[key])
  }
}

module.exports = { isPlainObject, fail, allowedKeys, text, stringArray, enumValue, positiveInteger, finiteNumber, uniqueBy }
