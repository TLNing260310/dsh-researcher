#!/usr/bin/env node
// Adjudication merger — merge two evaluator files and compute agreement.
//
// Usage: node adjudicate.js <evaluator-a.json> <evaluator-b.json> [--out merged.json]
//
// Status per item:
//   both true      → included
//   both false     → excluded
//   mismatch/null  → ambiguous (never enters main Recall)
// agreement_rate = agreed items / total candidate items.
const fs = require('node:fs')

const aFile = process.argv[2]
const bFile = process.argv[3]
const outFlag = process.argv.indexOf('--out')
const outFile = outFlag >= 0 ? process.argv[outFlag + 1] : null
if (!aFile || !bFile) {
  console.error('usage: node adjudicate.js <evaluator-a.json> <evaluator-b.json> [--out merged.json]')
  process.exit(1)
}

const a = JSON.parse(fs.readFileSync(aFile, 'utf8'))
const b = JSON.parse(fs.readFileSync(bFile, 'utf8'))
const bBy = new Map((b.items || []).map((item) => [item.id, item]))

const merged = []
let agreed = 0
for (const itemA of a.items || []) {
  const itemB = bBy.get(itemA.id)
  const verdictA = itemA.latent_at_t0 === true || itemA.latent_at_t0 === false ? itemA.latent_at_t0 : null
  const verdictB = itemB && (itemB.latent_at_t0 === true || itemB.latent_at_t0 === false) ? itemB.latent_at_t0 : null
  let status
  if (verdictA === true && verdictB === true) { status = 'included'; agreed++ }
  else if (verdictA === false && verdictB === false) { status = 'excluded'; agreed++ }
  else status = 'ambiguous'
  merged.push({
    id: itemA.id,
    status,
    evaluator_a: verdictA,
    evaluator_b: verdictB,
    future_event: itemA.future_event,
  })
}
const total = merged.length
const result = {
  schema: 'dsh-researcher/adjudication-result/v1',
  generated_at: new Date().toISOString(),
  total_items: total,
  included: merged.filter((m) => m.status === 'included').length,
  excluded: merged.filter((m) => m.status === 'excluded').length,
  ambiguous: merged.filter((m) => m.status === 'ambiguous').length,
  agreement_rate: total > 0 ? +(agreed / total).toFixed(3) : null,
  items: merged,
}
if (outFile) fs.writeFileSync(outFile, JSON.stringify(result, null, 2))
console.log(JSON.stringify({ total_items: result.total_items, included: result.included, excluded: result.excluded, ambiguous: result.ambiguous, agreement_rate: result.agreement_rate }))
