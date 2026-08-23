#!/usr/bin/env node
// score-exp-cplus — Experiment C+ scorer (host-side, evaluator-tool).
//
// Consumes: per-run artifacts under evaluation/runs/commander.js/exp-cplus/
//   - run.json / session.events.json / stdout.log / report.txt / final-report.txt
//   - G2 integrity flags from execution-log.jsonl
//   - precomputed expected stale sets (G3) from evaluation/scoring/out/_stale-*.json
// Produces: evaluation/results/experiment-cplus/score-report.json
//
// Metrics (protocol v0.2 §6, unchanged):
//   1. Mutation Recall — run presents the injected change WITH cognitive
//      impact (matched 1.0 / partial 0.5 / miss 0). Evaluator-mediated:
//      this script extracts candidate passages; final verdicts entered
//      manually via an adjudication file (adjudication-exp-cplus.json).
//   2. Stale Recovery (B-only) — invalidated claims among the mechanical
//      expected stale set (cognition-diff). Verdicts from adjudication.
//   3. Consistency Drift — contradictions vs unchanged regions; False
//      Invalidation and Over-Invalidation counted separately.
//   4. Rebuild Cost — billed tokens / duration / tool calls from run.json.
//
// This script performs the mechanical folding; per-run entry verdicts are
// read from adjudication-exp-cplus.json (evaluator-filled, frozen AFTER the
// runs). No scoring rule changes after results.

const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..', '..')
const runsBase = path.join(root, 'evaluation', 'runs', 'commander.js', 'exp-cplus')
const manifest = JSON.parse(fs.readFileSync(path.join(runsBase, 'exp-cplus-runs-manifest.json'), 'utf8'))
const exec = JSON.parse(fs.readFileSync(path.join(runsBase, 'exp-cplus-exec-config.json'), 'utf8'))
const execRuns = new Map(exec.runs.map((r) => [r.run_id, r]))
const validityPath = path.join(root, 'evaluation', 'cases', 'commander.js', 'gt-calibration', 'experiment-cplus-validity.json')
const validity = fs.existsSync(validityPath)
  ? JSON.parse(fs.readFileSync(validityPath, 'utf8'))
  : { valid_for_causal_claim: false, reasons: ['missing experiment validity declaration'] }

// execution log integrity
const integrity = new Map()
const logFile = path.join(runsBase, 'execution-log.jsonl')
if (fs.existsSync(logFile)) {
  for (const line of fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean)) {
    const j = JSON.parse(line)
    integrity.set(j.run_id, { exit: j.exit, integrity: j.integrity, duration_ms: j.duration_ms })
  }
}

// precomputed expected stale sets (G3)
const staleDir = path.join(root, 'evaluation', 'scoring', 'out')
const expectedStale = new Map()
for (const f of fs.readdirSync(staleDir)) {
  if (!f.startsWith('_stale-')) continue
  const j = JSON.parse(fs.readFileSync(path.join(staleDir, f), 'utf8'))
  const m = f.match(/^_stale-(exp-a-[a-z]+-\d+)-(MUT-\d+)\.json$/)
  if (m) expectedStale.set(m[1] + '|' + m[2], j)
}

// adjudication file (evaluator-filled; absent => scaffolding only)
const adjPath = path.join(root, 'evaluation', 'cases', 'commander.js', 'gt-calibration', 'adjudication-exp-cplus.json')
let adjudication = { runs: {} }
if (fs.existsSync(adjPath)) adjudication = JSON.parse(fs.readFileSync(adjPath, 'utf8'))

// ── per-run metrics ─────────────────────────────────────────────────────────

const rows = []
for (const run of manifest.runs) {
  const ex = execRuns.get(run.run_id)
  const runDir = path.join(runsBase, run.condition, run.run_id)
  const metrics = { run_id: run.run_id, condition: run.condition, mutation: run.mutation, state_source: ex ? ex.state_source : null }

  // Rebuild Cost
  const runJsonPath = path.join(runDir, 'run.json')
  if (fs.existsSync(runJsonPath)) {
    const rj = JSON.parse(fs.readFileSync(runJsonPath, 'utf8'))
    metrics.duration_ms = rj.duration_ms
    metrics.exit = rj.exit
    metrics.final_reason = rj.final_reason && rj.final_reason.kind
    metrics.preset = rj.preset
    metrics.plan = rj.plan
  }

  // tool calls + billed tokens from events (best effort; usage events)
  const evPath = path.join(runDir, 'session.events.json')
  let toolCalls = 0
  if (fs.existsSync(evPath)) {
    const ev = JSON.parse(fs.readFileSync(evPath, 'utf8'))
    toolCalls = ev.filter((e) => e.type === 'tool/call').length
    metrics.tool_calls = toolCalls
  }

  // integrity
  const int = integrity.get(run.run_id)
  metrics.integrity = int ? int.integrity : 'UNKNOWN'
  metrics.exit_code = int ? int.exit : null

  // expected stale set
  const key = (ex && ex.state_source) + '|' + run.mutation
  const exp = expectedStale.get(key)
  metrics.expected_stale_set = exp ? exp.metrics.stale_candidates : null
  metrics.expected_stale_ids = exp ? exp.stale_claims.map((c) => c.id) : []

  // adjudication verdicts (filled post-run by evaluator)
  const adj = (adjudication.runs && adjudication.runs[run.run_id]) || {}
  const hits = Array.isArray(adj.stale_recovery_hits) ? adj.stale_recovery_hits : []
  metrics.adj = {
    mutation_recall: adj.mutation_recall,        // 1.0 | 0.5 | 0
    stale_recovery_hits: hits,
    consistency_conflicts: adj.consistency_conflicts || 0,
    false_invalidation: adj.false_invalidation || 0,
    over_invalidation: adj.over_invalidation || 0,
    notes: adj.notes || '',
  }
  const expectedIds = new Set(metrics.expected_stale_ids)
  const uniqueHits = [...new Set(hits)]
  const trueHits = uniqueHits.filter((id) => expectedIds.has(id))
  const falseHits = uniqueHits.filter((id) => !expectedIds.has(id))
  metrics.stale_recovery = {
    expected: expectedIds.size,
    reported_unique: uniqueHits.length,
    true_hits: trueHits,
    false_hits: falseHits,
    recall: expectedIds.size > 0 ? trueHits.length / expectedIds.size : null,
    precision: uniqueHits.length > 0 ? trueHits.length / uniqueHits.length : null,
  }
  rows.push(metrics)
}

// ── paired summary ──────────────────────────────────────────────────────────

const byMutation = new Map()
for (const r of rows) {
  if (!byMutation.has(r.mutation)) byMutation.set(r.mutation, {})
  byMutation.get(r.mutation)[r.condition] = r
}

const pairs = []
for (const [mutation, conds] of byMutation) {
  const a = conds.A
  const b = conds.B
  if (!a || !b) continue
  const judged = a.adj.mutation_recall !== undefined && b.adj.mutation_recall !== undefined
  const bValid = b.integrity === 'OK' || b.integrity === 'N/A'
  pairs.push({
    mutation,
    recall_A: a.adj.mutation_recall,
    recall_B: b.adj.mutation_recall,
    recall_delta: judged ? (b.adj.mutation_recall - a.adj.mutation_recall) : null,
    stale_recovery_B: b.stale_recovery.expected > 0 ? b.stale_recovery.true_hits.length + '/' + b.stale_recovery.expected : null,
    stale_recall_B: b.stale_recovery.recall,
    stale_precision_B: b.stale_recovery.precision,
    stale_false_hits_B: b.stale_recovery.false_hits,
    consistency_A: a.adj.consistency_conflicts,
    consistency_B: b.adj.consistency_conflicts,
    cost_A_ms: a.duration_ms,
    cost_B_ms: b.duration_ms,
    cost_ratio: (a.duration_ms && b.duration_ms) ? (b.duration_ms / a.duration_ms) : null,
    b_integrity: b.integrity,
    b_valid: bValid,
  })
}

const validPairs = pairs.filter((p) => p.b_valid && p.recall_A !== null && p.recall_B !== null)
const h2Checks = validPairs.filter((p) => p.recall_B >= p.recall_A && p.consistency_B <= p.consistency_A && p.stale_recall_B >= 0.5 && p.cost_ratio <= 1.5)
const mechanicalH2 = validPairs.length >= 4 && h2Checks.length >= 4
const h2 = validity.valid_for_causal_claim === true && mechanicalH2

const summary = {
  schema: 'dsh-researcher/experiment-cplus/score-report/v1',
  adjudicated: adjudication.finalized === true,
  pairs_total: pairs.length,
  pairs_valid: validPairs.length,
  h2_checks_passed: h2Checks.length,
  mechanical_h2_condition_met: mechanicalH2,
  h2_condition_met: h2,
  causal_validity: validity,
  verdict: validity.valid_for_causal_claim !== true
    ? 'INVALID FOR CAUSAL CLAIM'
    : adjudication.finalized ? (h2 ? 'H2 SUPPORTED (total effect)' : 'H2 NOT SUPPORTED') : 'PENDING ADJUDICATION',
  pairs,
  rows,
  note: 'Mutation Recall / Stale Recovery / Consistency adjudicated via adjudication-exp-cplus.json (filled by evaluator AFTER runs). Rebuild Cost mechanical.',
}

fs.mkdirSync(path.join(root, 'evaluation', 'results', 'experiment-cplus'), { recursive: true })
fs.writeFileSync(path.join(root, 'evaluation', 'results', 'experiment-cplus', 'score-report.json'), JSON.stringify(summary, null, 2) + '\n')
console.log('[score-exp-cplus] pairs=' + pairs.length + ' valid=' + validPairs.length + ' h2_checks=' + h2Checks.length + ' -> results/experiment-cplus/score-report.json')
if (!adjudication.finalized) {
  console.log('[score-exp-cplus] PENDING: fill evaluation/cases/commander.js/gt-calibration/adjudication-exp-cplus.json (mutation_recall per run, stale_recovery_hits ids, consistency_conflicts, false_invalidation, over_invalidation) then set finalized=true')
}
