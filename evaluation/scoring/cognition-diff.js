#!/usr/bin/env node
// cognition-diff — host-plane, evaluator-side stale-claim reconciliation (v0.8-alpha).
//
// Mechanical reconciliation, NOT prediction:
//   input:  an older cognition-state.json (schema v1, from cognition-state-export)
//           + the CURRENT snapshot workspace (the 'after' state)
//   logic:  for each claim, for each evidence anchor:
//             - unparseable anchor (anchorable:false)      -> unverifiable bucket
//             - file missing in current workspace          -> anchor STALE (file gone)
//             - blob_sha256(current file) != recorded      -> anchor STALE (content changed)
//             - otherwise                                  -> anchor FRESH
//           a claim whose anchorable anchors are ALL STALE -> stale-candidate
//           hypotheses/views depending on a stale claim    -> affected (propagation)
//   output: { stale_claims, affected_hypotheses, affected_views, unchanged_claims,
//             unverifiable_claims, metrics } — NO bug judgment, NO severity, NO
//             fix suggestions, NO claim re-evaluation. The diff only marks
//             candidates; confirmation of invalidation is a human/evaluator step.
//
// Usage:
//   node cognition-diff.js <old-cognition-state.json> --workspace <current-workspace-dir> --out <diff.json>

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const flag = (name) => {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null
}

const stateFile = process.argv[2]
const workspace = flag('workspace')
const outFile = flag('out')

if (!stateFile || !workspace || !outFile) {
  console.error('usage: node cognition-diff.js <old-cognition-state.json> --workspace <current-workspace-dir> --out <diff.json>')
  process.exit(1)
}

const sha256Hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
if (state.schema !== 'dsh-researcher/cognition-state/v1') {
  console.error('cognition-diff: unsupported schema ' + state.schema)
  process.exit(1)
}

const currentBlob = (file) => {
  const p = path.join(workspace, file)
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return null // file gone
  try {
    return sha256Hex(fs.readFileSync(p))
  } catch (error) {
    return null
  }
}

const staleClaims = []
const unchangedClaims = []
const unverifiableClaims = []

for (const claim of state.claims || []) {
  const anchors = Array.isArray(claim.evidence_anchors) ? claim.evidence_anchors : []
  const anchorable = anchors.filter((a) => a.anchorable && a.blob_sha256)
  const unverifiable = anchors.filter((a) => !(a.anchorable && a.blob_sha256))

  let verdict
  if (anchorable.length === 0) {
    verdict = 'unverifiable'
    unverifiableClaims.push({ id: claim.id, reason: 'no anchorable evidence anchors', anchor_count: anchors.length })
  } else {
    let staleCount = 0
    const detail = []
    for (const a of anchorable) {
      const current = currentBlob(a.file)
      const isStale = current === null || current !== a.blob_sha256
      if (isStale) staleCount++
      detail.push({ file: a.file, line_span: a.line_span, recorded_sha: a.blob_sha256, current_sha: current, stale: isStale })
    }
    if (staleCount === anchorable.length) {
      verdict = 'stale-candidate'
      staleClaims.push({ id: claim.id, stale_anchors: staleCount, total_anchorable: anchorable.length, detail })
    } else if (staleCount === 0) {
      verdict = 'unchanged'
      unchangedClaims.push({ id: claim.id, fresh_anchors: anchorable.length })
    } else {
      // Partial staleness: at least one anchor still matches -> not a full
      // candidate, but the claim's evidence base is partly changed. Reported
      // as 'partially-changed' (not stale-candidate).
      verdict = 'partially-changed'
      unchangedClaims.push({ id: claim.id, note: 'partial staleness', stale_anchors: staleCount, total_anchorable: anchorable.length, detail })
    }
  }
  if (verdict === 'unverifiable' && unverifiable.length > 0) {
    // keep the first unverifiable reason for reporting
    unverifiableClaims[unverifiableClaims.length - 1].reason = unverifiable.map((u) => u.ref).slice(0, 3).join(' | ')
  }
}

// ── dependency propagation (existing state dependencies only) ────────────────

const staleIds = new Set(staleClaims.map((c) => c.id))
const affectedHypotheses = []
const affectedViews = []

for (const h of (state.dependencies && state.dependencies.hypotheses) || []) {
  const hits = (h.dependsOn || []).filter((id) => staleIds.has(id))
  if (hits.length > 0) affectedHypotheses.push({ id: h.id, status: h.status, stale_dependencies: hits })
}
for (const v of (state.dependencies && state.dependencies.views) || []) {
  const hits = (v.dependsOn || []).filter((id) => staleIds.has(id))
  if (hits.length > 0) affectedViews.push({ name: v.name, stale_dependencies: hits })
}

const result = {
  schema: 'dsh-researcher/cognition-diff/v1',
  source_state: state.run || stateFile,
  generated_at: new Date().toISOString(),
  stale_claims: staleClaims,
  affected_hypotheses: affectedHypotheses,
  affected_views: affectedViews,
  unchanged_claims: unchangedClaims,
  unverifiable_claims: unverifiableClaims,
  metrics: {
    total_claims: (state.claims || []).length,
    stale_candidates: staleClaims.length,
    unchanged: unchangedClaims.length,
    unverifiable: unverifiableClaims.length,
    affected_hypotheses: affectedHypotheses.length,
    affected_views: affectedViews.length,
  },
}

fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, JSON.stringify(result, null, 2) + '\n')

console.log(
  `[cognition-diff] claims=${result.metrics.total_claims} stale=${result.metrics.stale_candidates} ` +
    `unchanged=${result.metrics.unchanged} unverifiable=${result.metrics.unverifiable} ` +
    `affected_hyp={${affectedHypotheses.map((h) => h.id).join(',')}} affected_view={${affectedViews.map((v) => v.name).join(',')}}`
)
