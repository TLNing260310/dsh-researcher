'use strict'

// The policy surface is repository-owned; concrete JSON Schemas are captured
// from the pinned DSH installation before a live run and frozen in run-lock.
const { canonicalize, hashJson, EXACT_VISIBLE_TOOL_NAMES, INHERITED_VISIBLE_TOOL_NAMES, VISIBLE_TOOL_POLICY } = require('./lib.js')
const { PROJECT_PACKAGE_NAME } = require('../../lib/runtime-requirements.js')

const schemaName = (value) => typeof value === 'string'
  ? value
  : value && (value.name || value.id || value.tool_name)

const assertModelVisibleParameters = (schema, name) => {
  const parameters = schema.parameters
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters) || parameters.type !== 'object') throw new Error('visible tool schema parameters must be a JSON Schema object: ' + name)
  const properties = parameters.properties === undefined ? {} : parameters.properties
  if (typeof properties !== 'object' || properties === null || Array.isArray(properties)) throw new Error('visible tool schema properties must be an object: ' + name)
  if (parameters.required !== undefined) {
    if (!Array.isArray(parameters.required) || parameters.required.some((field) => typeof field !== 'string' || !Object.prototype.hasOwnProperty.call(properties, field))) throw new Error('visible tool schema required fields must name declared properties: ' + name)
  }
  for (const [field, definition] of Object.entries(properties)) {
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) throw new Error('visible tool property schema must be an object: ' + name + '.' + field)
    if (Object.prototype.hasOwnProperty.call(definition, 'required')) throw new Error('visible tool property uses legacy nested required instead of root required: ' + name + '.' + field)
  }
}

const normalizeVisibleToolSchemas = (input) => {
  const source = Array.isArray(input) ? input : Array.isArray(input && input.tools) ? input.tools : null
  if (!source) throw new Error('visible tool schema snapshot must be an array or {tools: array}')
  // JSON round-tripping rejects functions/undefined and prevents later object
  // mutation from changing the evidence after its hash was computed.
  const values = source.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('visible tool schema at index ' + index + ' must be an object')
    const name = schemaName(value)
    if (typeof name !== 'string' || name === '') throw new Error('visible tool schema at index ' + index + ' has no name')
    const json = JSON.parse(JSON.stringify(value))
    if (schemaName(json) !== name) throw new Error('visible tool schema is not canonically serializable: ' + name)
    assertModelVisibleParameters(json, name)
    return json
  }).sort((left, right) => schemaName(left).localeCompare(schemaName(right)))
  const names = values.map(schemaName)
  if (new Set(names).size !== names.length) throw new Error('visible tool schema snapshot contains duplicate names')
  if (canonicalize(names) !== canonicalize(EXACT_VISIBLE_TOOL_NAMES)) {
    throw new Error('visible tool schema names differ from the exact E1 contract')
  }
  return values
}

const createVisibleToolContract = (input) => {
  const schemas = normalizeVisibleToolSchemas(input)
  return {
    mode: 'exact',
    names: [...EXACT_VISIBLE_TOOL_NAMES],
    schema_hash: hashJson(schemas),
    schemas,
  }
}

const validateVisibleToolContract = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('run-lock visible tool contract is missing')
  const keys = Object.keys(value).sort()
  if (canonicalize(keys) !== canonicalize(['mode', 'names', 'schema_hash', 'schemas'].sort())) throw new Error('run-lock visible tool contract keys drifted')
  if (value.mode !== 'exact' || canonicalize(value.names) !== canonicalize(EXACT_VISIBLE_TOOL_NAMES)) throw new Error('run-lock visible tool names drifted')
  const normalized = normalizeVisibleToolSchemas(value.schemas)
  if (!/^[a-f0-9]{64}$/.test(String(value.schema_hash || '')) || value.schema_hash !== hashJson(normalized)) throw new Error('run-lock visible tool schema hash drifted')
  if (canonicalize(normalized) !== canonicalize(value.schemas)) throw new Error('run-lock visible tool schemas are not canonical')
  return value
}

const validateCaptureReport = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('visible tool capture report is missing')
  const keys = ['schema', 'model_calls', 'prompt_submissions', 'command_submissions', 'node', 'dsh', 'candidate', 'visible_tool_contract']
  if (canonicalize(Object.keys(value).sort()) !== canonicalize(keys.sort()) || value.schema !== 'dsh-researcher/goal-governor-e1/visible-tools-capture/v1') throw new Error('visible tool capture report envelope drifted')
  if (value.model_calls !== 0 || value.prompt_submissions !== 0 || value.command_submissions !== 0) throw new Error('visible tool snapshot was not captured without model/prompt/command submissions')
  for (const field of ['node', 'dsh', 'candidate']) if (!value[field] || typeof value[field] !== 'object' || Array.isArray(value[field])) throw new Error('visible tool capture ' + field + ' provenance is missing')
  if (value.candidate.package_name !== PROJECT_PACKAGE_NAME || typeof value.candidate.package_version !== 'string' || value.candidate.package_version === '') throw new Error('visible tool capture candidate identity is invalid')
  validateVisibleToolContract(value.visible_tool_contract)
  return value
}

module.exports = {
  EXACT_VISIBLE_TOOL_NAMES,
  INHERITED_VISIBLE_TOOL_NAMES,
  VISIBLE_TOOL_POLICY,
  schemaName,
  assertModelVisibleParameters,
  normalizeVisibleToolSchemas,
  createVisibleToolContract,
  validateVisibleToolContract,
  validateCaptureReport,
}
