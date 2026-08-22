#!/usr/bin/env node
// cognition-state-to-import — host-plane converter: cognition artifacts ->
// research_checkpoint importState payload (Experiment C+ injection carrier).
//
// TWO input modes (both read-only, both reuse research-state pure functions):
//   --from-state <cognition-state.json>   project the exported v1 state into
//                                         the internal payload shape (claims
//                                         from evidence_anchors refs)
//   --from-log <session.events.json>      fold the ORIGINAL session log via
//                                         foldCheckpointEvents (highest
//                                         fidelity: full claims incl.
//                                         hypothesis statements) and emit the
//                                         internal payload directly
// Usage:
//   node cognition-state-to-import.js --from-log <session.events.json> --out <payload.json>
//   node cognition-state-to-import.js --from-state <cognition-state.json> --out <payload.json>
//
// Output payload shape = research-state importState contract:
//   { schemaVersion: 1, phase, claims: [{id,statement,tier,verdict,evidence[],
//     confidence,revision}], hypotheses: [{id,statement,status,dependsOn,
//     revision}], views: [{name,dependsOn,revision}], dirty: [] }
// G1 (round-trip fidelity) is checked by comparing --from-state vs --from-log
// claim counts + statements (see check mode below):
//   --check <payloadA.json> <payloadB.json>   compare claims by id.

const fs = require('node:fs')
const path = require('node:path')

const flag = (name) => {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null
}

const mode = process.argv[2]
const outFile = flag('out')

const { makeState, foldCheckpointEvents, fullExport } = require('../../researcher/plugins/research-state/index.js').__test

const toPayload = (folded) => ({
  schemaVersion: 1,
  phase: folded.phase || null,
  claims: (folded.claims || []).map((c) => ({
    id: c.id,
    statement: c.statement,
    tier: c.tier,
    verdict: c.verdict,
    evidence: Array.isArray(c.evidence) ? c.evidence : [],
    confidence: c.confidence,
    revision: c.revision ?? 1,
  })),
  hypotheses: (folded.hypotheses || []).map((h) => ({
    id: h.id,
    statement: h.statement,
    status: h.status,
    dependsOn: h.dependsOn || [],
    revision: h.revision ?? 1,
  })),
  views: (folded.views || []).map((v) => ({
    name: v.name,
    dependsOn: v.dependsOn || [],
    revision: v.revision ?? 1,
  })),
  dirty: [],
})

if (mode === '--from-log') {
  const logFile = process.argv[3]
  if (!logFile || !outFile) {
    console.error('usage: node cognition-state-to-import.js --from-log <session.events.json> --out <payload.json>')
    process.exit(1)
  }
  const events = JSON.parse(fs.readFileSync(logFile, 'utf8').replace(/^\uFEFF/, ''))
  const folded = fullExport(foldCheckpointEvents(Array.isArray(events) ? events : [], makeState()))
  const payload = toPayload(folded)
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[cognition-state-to-import] from-log claims=${payload.claims.length} hyps=${payload.hypotheses.length} views=${payload.views.length} -> ${outFile}`)
} else if (mode === '--from-state') {
  const stateFile = process.argv[3]
  if (!stateFile || !outFile) {
    console.error('usage: node cognition-state-to-import.js --from-state <cognition-state.json> --out <payload.json>')
    process.exit(1)
  }
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  const payload = {
    schemaVersion: 1,
    phase: null,
    claims: (state.claims || []).map((c) => ({
      id: c.id,
      statement: c.statement,
      tier: c.tier,
      verdict: c.verdict,
      evidence: (c.evidence_anchors || []).map((a) => a.ref),
      confidence: c.confidence,
      revision: c.revision ?? 1,
    })),
    hypotheses: ((state.dependencies && state.dependencies.hypotheses) || []).map((h) => ({
      id: h.id,
      statement: h.statement || h.id, // projection lost statements; degrade to id
      status: h.status || 'active',
      dependsOn: h.dependsOn || [],
      revision: h.revision ?? 1,
    })),
    views: ((state.dependencies && state.dependencies.views) || []).map((v) => ({
      name: v.name,
      dependsOn: v.dependsOn || [],
      revision: v.revision ?? 1,
    })),
    dirty: [],
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[cognition-state-to-import] from-state claims=${payload.claims.length} hyps=${payload.hypotheses.length} views=${payload.views.length} -> ${outFile}`)
} else if (mode === '--check') {
  const aFile = process.argv[3]
  const bFile = process.argv[4]
  if (!aFile || !bFile) {
    console.error('usage: node cognition-state-to-import.js --check <payloadA.json> <payloadB.json>')
    process.exit(1)
  }
  const a = JSON.parse(fs.readFileSync(aFile, 'utf8'))
  const b = JSON.parse(fs.readFileSync(bFile, 'utf8'))
  const aMap = new Map(a.claims.map((c) => [c.id, c]))
  const bMap = new Map(b.claims.map((c) => [c.id, c]))
  const idsA = new Set(aMap.keys())
  const idsB = new Set(bMap.keys())
  const onlyA = [...idsA].filter((id) => !idsB.has(id))
  const onlyB = [...idsB].filter((id) => !idsA.has(id))
  let statementMismatch = 0
  for (const id of idsA) {
    if (idsB.has(id) && aMap.get(id).statement !== bMap.get(id).statement) statementMismatch++
  }
  const ok = onlyA.length === 0 && onlyB.length === 0 && statementMismatch === 0
  console.log(`[cognition-state-to-import] check claims: A=${a.claims.length} B=${b.claims.length} onlyA=${onlyA.length} onlyB=${onlyB.length} statementMismatch=${statementMismatch} -> ${ok ? 'G1 PASS (round-trip fidelity)' : 'G1 FAIL'}`)
  process.exit(ok ? 0 : 1)
} else {
  console.error('usage: node cognition-state-to-import.js --from-log|--from-state|--check ...')
  process.exit(1)
}
