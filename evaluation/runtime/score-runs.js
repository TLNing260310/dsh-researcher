#!/usr/bin/env node
// Phase A scoring — automated GT matching (candidate marking only; final
// matched/partial/unmatched judgment is the evaluator's, per protocol §5).
//
// Usage: node score-runs.js [--runs-root <dir>] [--gt <future.json>]
//   [--out <scores.json>] [--adjudicate <file>]
//
// For each run: marks every GT as CANDIDATE-MATCH / CANDIDATE-PARTIAL / NO
// when the run's report text surfaces the GT's problem (keyword surfacing is
// only a candidate; the evaluator confirms or downgrades afterwards).
// With --adjudicate <file>, loads evaluator verdicts (run_id -> GT -> status)
// and folds them into the final scores.
const fs = require('node:fs')
const path = require('node:path')

const flag = (name) => {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null
}
const root = flag('runs-root') || path.join(__dirname, '..', '..', 'evaluation', 'runs', 'flask')
const gtFile = flag('gt') || path.join(__dirname, '..', '..', '..', 'phase-a-snapshots', 'flask', 'ground-truth', 'future.json')
const outFile = flag('out') || path.join(__dirname, '..', '..', 'evaluation', 'runs', 'flask', 'scores-candidates.json')
const adjudicateFile = flag('adjudicate')

const gt = JSON.parse(fs.readFileSync(gtFile, 'utf8')).ground_truth

// GT surfacing markers: keyword sets + a short human phrase for the record.
const MARKERS = {
  'GT-01': {
    keywords: ['teardown', 'cleanup', 'teardown_request'],
    problem: 'teardown callback chain aborts on the first raising callback / cleanup skipped',
  },
  'GT-02': {
    keywords: ['automatic_options', 'OPTIONS'],
    problem: 'provide_automatic_options can only disable, not enable',
  },
  'GT-03': {
    keywords: ['should_ignore_error'],
    problem: 'should_ignore_error dead weight / always False',
  },
  'GT-04': {
    keywords: ['instance folder', 'instance_path', 'OSError', 'flaskr', 'tutorial'],
    problem: 'tutorial instance folder creation silently swallows OSError',
  },
  'GT-05': {
    keywords: ['415', 'UnsupportedMediaType', 'request.json', 'Content-Type'],
    problem: 'docs claim 400 for wrong Content-Type; actual behavior 415',
  },
}

const walk = (dir, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, acc)
    else if (e.name === 'report.txt') acc.push(dir)
  }
  return acc
}

const runs = walk(root).sort()
const verdicts = adjudicateFile ? JSON.parse(fs.readFileSync(adjudicateFile, 'utf8')).verdicts : {}
const rows = []

for (const dir of runs) {
  const runId = path.basename(dir)
  const mode = path.basename(path.dirname(dir))
  const report = fs.readFileSync(path.join(dir, 'report.txt'), 'utf8')
  const lower = report.toLowerCase()
  const per = {}
  for (const g of gt) {
    const m = MARKERS[g.id]
    const surfaced = m.keywords.some((k) => lower.includes(k.toLowerCase()))
    const verdict = (verdicts[runId] && verdicts[runId][g.id]) || null // evaluator override wins
    per[g.id] = {
      candidate: surfaced ? 'CANDIDATE' : 'NO',
      verdict: verdict || (surfaced ? 'PENDING' : 'NO'),
    }
  }
  const matched = Object.values(per).filter((v) => v.verdict === 'matched').length
  const partial = Object.values(per).filter((v) => v.verdict === 'partial').length
  rows.push({ run_id: runId, mode, gt: per, recall: { matched, partial, total: gt.length } })
}

const result = {
  schema: 'dsh-researcher/phase-a-scores/v1',
  gt_count: gt.length,
  rows,
}
fs.writeFileSync(outFile, JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
