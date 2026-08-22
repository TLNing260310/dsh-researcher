#!/usr/bin/env node
// cognition-state-export — host-plane, evaluator-side Cognition State exporter (v0.8-alpha).
//
// Pure projection: folds a session log's research_checkpoint events via the
// research-state plugin's EXPORTED PURE FUNCTIONS (__test.foldCheckpointEvents)
// and serializes the resulting state into cognition-state.json (schema
// dsh-researcher/cognition-state/v1). This script:
//   - NEVER calls the plugin's apply() (no plugin assembly, no tool
//     registration, no events, no side effects beyond writing the output file);
//   - writes ONLY to the output path given via --out (evaluation/scoring/out/);
//   - adds evidence anchors with file / line_span / blob_sha256 when the
//     narrative evidence text parses into a file:line anchor that exists in
//     the frozen snapshot workspace; unparseable anchors are kept with
//     anchorable:false and null fingerprint (unverifiable bucket).
//
// Usage:
//   node cognition-state-export.js <session.events.json> \
//     --workspace <snapshot-workspace-dir> \
//     --project <name> --run <run-label> --snapshot-commit <sha> \
//     --out <output.json>
//
// Output schema (v1) — ONLY claims / evidence_anchors / dependencies /
// freshness. NO user memory, NO planning, NO actions.

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

// ── argument parsing ─────────────────────────────────────────────────────────

const flag = (name) => {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null
}

const eventsFile = process.argv[2]
const workspace = flag('workspace')
const project = flag('project') || 'unknown'
const runLabel = flag('run') || 'run-unknown'
const snapshotCommit = flag('snapshot-commit') || 'unknown'
const outFile = flag('out')

if (!eventsFile || !workspace || !outFile) {
  console.error('usage: node cognition-state-export.js <session.events.json> --workspace <dir> --project <name> --run <label> --snapshot-commit <sha> --out <out.json>')
  process.exit(1)
}

// ── pure-function reuse (NEVER apply()) ─────────────────────────────────────

const { makeState, foldCheckpointEvents, fullExport } = require('../../researcher/plugins/research-state/index.js').__test

// ── helpers ──────────────────────────────────────────────────────────────────

const sha256Hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

const loadEvents = (file) => {
  const raw = fs.readFileSync(file, 'utf8')
  const events = JSON.parse(raw)
  return Array.isArray(events) ? events : []
}

// Extract the FIRST file:line anchor from narrative evidence text.
// Pattern: path-like token ending in a known source extension followed by
// :<line> or :<line>-<line>. Path may include directory components.
const ANCHOR_RE = /([A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:js|mjs|cjs|ts|mts|cts|json|md|yml|yaml)):(\d{1,6}(?:-\d{1,6})?)/

const candidatePaths = (rel) => {
  // Try as-is, then common roots (lib/, tests/, docs/, typings/, .github/)
  const bases = ['', 'lib/', 'tests/', 'docs/', 'typings/', '.github/', 'examples/']
  const out = []
  for (const b of bases) out.push(path.join(workspace, b, rel))
  return out
}

// Resolve an evidence text to { file, line_span, blob_sha256, anchorable }.
const resolveAnchor = (evidenceText) => {
  const m = String(evidenceText || '').match(ANCHOR_RE)
  if (!m) return { ref: String(evidenceText || ''), file: null, line_span: null, blob_sha256: null, anchorable: false }
  const rel = m[1]
  const lineSpan = m[2]
  for (const candidate of candidatePaths(rel)) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      try {
        const blob = fs.readFileSync(candidate)
        return {
          ref: m[0],
          file: path.relative(workspace, candidate).split(path.sep).join('/'),
          line_span: lineSpan,
          blob_sha256: sha256Hex(blob),
          anchorable: true,
        }
      } catch (error) {
        return { ref: m[0], file: null, line_span: null, blob_sha256: null, anchorable: false }
      }
    }
  }
  // File path parsed but not present in this snapshot (e.g. repo-root-relative
  // path with different base) — keep as unverifiable, never guess.
  return { ref: m[0], file: rel, line_span: lineSpan, blob_sha256: null, anchorable: false }
}

// ── fold + project ───────────────────────────────────────────────────────────

const events = loadEvents(eventsFile)
const folded = fullExport(foldCheckpointEvents(events, makeState()))

const claims = (folded.claims || [])
  .slice()
  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  .map((c) => ({
    id: c.id,
    statement: c.statement,
    tier: c.tier,
    verdict: c.verdict,
    confidence: c.confidence,
    revision: c.revision,
    evidence_anchors: (Array.isArray(c.evidence) ? c.evidence : []).map(resolveAnchor),
  }))

const dependencies = {
  claims: (folded.claims || []).map((c) => c.id).sort(),
  hypotheses: (folded.hypotheses || [])
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((h) => ({ id: h.id, status: h.status, dependsOn: (h.dependsOn || []).slice().sort(), revision: h.revision })),
  views: (folded.views || [])
    .slice()
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((v) => ({ name: v.name, dependsOn: (v.dependsOn || []).slice().sort(), revision: v.revision })),
}

const state = {
  schema: 'dsh-researcher/cognition-state/v1',
  run: runLabel,
  project,
  claims,
  dependencies,
  freshness: {
    generated_at: new Date().toISOString(),
    snapshot_commit: snapshotCommit,
    source_log: path.relative(process.cwd(), eventsFile).split(path.sep).join('/'),
    fold_replayable: true,
  },
}

// ── determinism self-check: fold twice, must be byte-identical state ─────────

try {
  const again = fullExport(foldCheckpointEvents(events, makeState()))
  const same = JSON.stringify(again) === JSON.stringify(folded)
  state.freshness.fold_replayable = same
} catch (error) {
  state.freshness.fold_replayable = false
}

fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, JSON.stringify(state, null, 2) + '\n')

// console summary (evaluator-facing)
const anchorable = claims.reduce((n, c) => n + c.evidence_anchors.filter((a) => a.anchorable).length, 0)
const totalAnchors = claims.reduce((n, c) => n + c.evidence_anchors.length, 0)
console.log(
  `[cognition-state-export] run=${runLabel} claims=${claims.length} hypotheses=${dependencies.hypotheses.length} ` +
    `views=${dependencies.views.length} anchors=${totalAnchors} anchorable=${anchorable} ` +
    `fold_replayable=${state.freshness.fold_replayable} -> ${outFile}`
)
