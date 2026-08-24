'use strict'

// Append-only receipts live at the bundle root, outside replaceable case
// directories. A killed process leaves an unresolved STARTED receipt, which is
// intentionally invalid rather than silently reusable.
const fs = require('node:fs')
const path = require('node:path')
const { canonicalize, hashJson } = require('./lib.js')

const RECEIPT_SCHEMA = 'dsh-researcher/goal-governor-e1/attempt-receipt/v1'
const STATUSES = new Set(['STARTED', 'FINALIZED', 'FAILED'])

const receiptHash = (receipt) => {
  const copy = { ...receipt }
  delete copy.receipt_hash
  return hashJson(copy)
}

const validateReceipt = (receipt, index, previousHash) => {
  const keys = ['schema', 'sequence', 'attempt_id', 'case_id', 'stage', 'status', 'previous_receipt_hash', 'run_lock_hash', 'artifact_relative', 'artifact_sha256', 'outer_finalized', 'error_code', 'at', 'receipt_hash']
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) || canonicalize(Object.keys(receipt).sort()) !== canonicalize(keys.sort())) throw new Error('attempt receipt envelope drifted at sequence ' + index)
  if (receipt.schema !== RECEIPT_SCHEMA || receipt.sequence !== index || !STATUSES.has(receipt.status)) throw new Error('attempt receipt sequence/status drifted at sequence ' + index)
  for (const field of ['attempt_id', 'case_id', 'stage', 'at']) if (typeof receipt[field] !== 'string' || receipt[field] === '') throw new Error('attempt receipt ' + field + ' is invalid at sequence ' + index)
  if (!/^[a-f0-9]{64}$/.test(String(receipt.run_lock_hash || '')) || !/^[a-f0-9]{64}$/.test(String(receipt.receipt_hash || ''))) throw new Error('attempt receipt hash field is invalid at sequence ' + index)
  if (receipt.previous_receipt_hash !== previousHash) throw new Error('attempt receipt hash chain is broken at sequence ' + index)
  if (receipt.receipt_hash !== receiptHash(receipt)) throw new Error('attempt receipt self-hash is invalid at sequence ' + index)
  if (receipt.status === 'STARTED') {
    if (receipt.artifact_relative !== null || receipt.artifact_sha256 !== null || receipt.outer_finalized !== null || receipt.error_code !== null) throw new Error('STARTED receipt contains terminal fields')
  } else if (receipt.status === 'FINALIZED') {
    if (typeof receipt.artifact_relative !== 'string' || !/^[a-f0-9]{64}$/.test(String(receipt.artifact_sha256 || '')) || receipt.outer_finalized !== true || receipt.error_code !== null) throw new Error('FINALIZED receipt is incomplete')
  } else if (typeof receipt.error_code !== 'string' || receipt.error_code === '' || receipt.outer_finalized !== false) throw new Error('FAILED receipt is incomplete')
  if (receipt.artifact_relative !== null) {
    if (typeof receipt.artifact_relative !== 'string' || receipt.artifact_relative === '' || receipt.artifact_relative.includes('\\') || path.isAbsolute(receipt.artifact_relative) || path.posix.normalize(receipt.artifact_relative).startsWith('../') || !/^[a-f0-9]{64}$/.test(String(receipt.artifact_sha256 || ''))) throw new Error('attempt receipt artifact binding is invalid')
  } else if (receipt.artifact_sha256 !== null) throw new Error('attempt receipt artifact hash has no relative path')
  return receipt
}

const readLedger = (file) => {
  if (!fs.existsSync(file)) return []
  const text = fs.readFileSync(file, 'utf8')
  if (text === '') return []
  if (!text.endsWith('\n')) throw new Error('attempt ledger has a truncated final row')
  const receipts = text.trimEnd().split(/\r?\n/).map((line, index) => {
    try { return JSON.parse(line) } catch (_) { throw new Error('attempt ledger contains invalid JSON at sequence ' + index) }
  })
  let previous = null
  const open = new Map()
  const completedKeys = new Set()
  for (let index = 0; index < receipts.length; index++) {
    const receipt = validateReceipt(receipts[index], index, previous)
    previous = receipt.receipt_hash
    const key = receipt.case_id + ':' + receipt.stage
    if (receipt.status === 'STARTED') {
      if (open.has(receipt.attempt_id) || completedKeys.has(key) || [...open.values()].some((value) => value.key === key)) throw new Error('attempt ledger contains a duplicate case/stage attempt: ' + key)
      open.set(receipt.attempt_id, { key, run_lock_hash: receipt.run_lock_hash })
    } else {
      const started = open.get(receipt.attempt_id)
      if (!started || started.key !== key || started.run_lock_hash !== receipt.run_lock_hash) throw new Error('attempt ledger terminal receipt has no matching STARTED row')
      open.delete(receipt.attempt_id)
      completedKeys.add(key)
    }
  }
  return receipts
}

const appendReceipt = (file, fields) => {
  const receipts = readLedger(file)
  const previous = receipts.at(-1)?.receipt_hash || null
  const receipt = {
    schema: RECEIPT_SCHEMA,
    sequence: receipts.length,
    attempt_id: fields.attempt_id,
    case_id: fields.case_id,
    stage: fields.stage,
    status: fields.status,
    previous_receipt_hash: previous,
    run_lock_hash: fields.run_lock_hash,
    artifact_relative: fields.artifact_relative ?? null,
    artifact_sha256: fields.artifact_sha256 ?? null,
    outer_finalized: fields.outer_finalized ?? null,
    error_code: fields.error_code ?? null,
    at: new Date().toISOString(),
  }
  receipt.receipt_hash = receiptHash(receipt)
  validateReceipt(receipt, receipts.length, previous)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const handle = fs.openSync(file, 'a')
  try {
    fs.writeSync(handle, JSON.stringify(receipt) + '\n')
    fs.fsyncSync(handle)
  } finally { fs.closeSync(handle) }
  return receipt
}

const beginAttempt = (file, fields) => {
  const receipts = readLedger(file)
  const key = fields.case_id + ':' + fields.stage
  if (receipts.some((receipt) => receipt.case_id + ':' + receipt.stage === key)) throw new Error('attempt ledger already contains case/stage ' + key + '; evidence is append-only')
  return appendReceipt(file, { ...fields, status: 'STARTED' })
}

const finishAttempt = (file, started, fields) => appendReceipt(file, {
  attempt_id: started.attempt_id,
  case_id: started.case_id,
  stage: started.stage,
  run_lock_hash: started.run_lock_hash,
  ...fields,
})

const assertClosedLedger = (file) => {
  const receipts = readLedger(file)
  const open = new Set()
  for (const receipt of receipts) receipt.status === 'STARTED' ? open.add(receipt.attempt_id) : open.delete(receipt.attempt_id)
  if (open.size > 0) throw new Error('attempt ledger contains unresolved STARTED receipt(s)')
  return receipts
}

module.exports = { RECEIPT_SCHEMA, receiptHash, validateReceipt, readLedger, appendReceipt, beginAttempt, finishAttempt, assertClosedLedger }
