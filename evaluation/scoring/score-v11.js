#!/usr/bin/env node
// score-v11.js — Experiment A scoring (GUS weighted + Risk candidates).
//
// Usage: node score-v11.js --runs-root <dir> --gt <core-gt.json> --coverage <coverage-map.json> [--adjudicate <verdicts.json>] [--out <scores.json>]
//
// GUS: per GT entry, mechanical candidate = evidence-anchor hit (file:line
// pattern from the entry's evidence) OR keyword co-occurrence (>=2 distinctive
// claim words within 200 chars). Candidates are a FLOOR: final
// matched/partial/unmatched is the evaluator's, folded via --adjudicate.
// Credits follow the coverage map (cluster = 1 credit; independent = 1);
// weighted GUS = sum(weight_bucket_weight * bucket_matched_credit/bucket_total_credit).
const fs = require('node:fs')
const path = require('node:path')

const flag = (name) => {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null
}
const runsRoot = flag('runs-root') || path.join(__dirname, '..', 'runs', 'commander.js', 'exp-a')
const gtFile = flag('gt') || path.join(__dirname, '..', 'cases', 'commander.js', 'gt-calibration', 'core-gt-v0.1.json')
const covFile = flag('coverage') || path.join(__dirname, '..', 'cases', 'commander.js', 'gt-calibration', 'coverage-map.json')
const outFile = flag('out') || path.join(runsRoot, 'exp-a-scores-candidates.json')
const adjudicateFile = flag('adjudicate')

const gt = JSON.parse(fs.readFileSync(gtFile, 'utf8'))
const cov = JSON.parse(fs.readFileSync(covFile, 'utf8'))
const WEIGHTS = gt.weights

const STOPWORDS = new Set('a an the of to in on for with and or is are was were be been this that these those it its as at by from which who what how why not no do does did has have had will would can could should may might must than then there here about into over under between after before'.split(' '))
const anchorRe = (evidence) => {
  const out = []
  for (const e of evidence) {
    const m = String(e).match(/([A-Za-z0-9_.-]+\.(?:js|md|ts|json|yml|yaml|mjs|mts|txt|test\.js|d\.ts))[:\s]+(\d+)/)
    if (m) out.push(new RegExp(m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[:, ]+\\s*' + m[2], 'i'))
  }
  return out
}
const keywordsOf = (claim) => {
  const words = String(claim).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((w) => w.length >= 5 && !STOPWORDS.has(w))
  return [...new Set(words)]
}

const entryMeta = new Map()
for (const c of cov.clusters) for (const id of c.core_ids) entryMeta.set(id, { cluster: c.concept_cluster, credit: c.max_credit })
for (const id of cov.independent_ids) if (!entryMeta.has(id)) entryMeta.set(id, { credit: 1 })

const walk = (dir, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, acc)
    else if (e.name === 'report.txt') acc.push(dir)
  }
  return acc
}
const runs = walk(runsRoot).sort()
const verdicts = adjudicateFile ? JSON.parse(fs.readFileSync(adjudicateFile, 'utf8')).verdicts : {}

const rows = []
for (const dir of runs) {
  const runId = path.basename(dir)
  const mode = path.basename(path.dirname(dir))
  const report = fs.readFileSync(path.join(dir, 'report.txt'), 'utf8')
  const lower = report.toLowerCase()
  const per = {}
  for (const e of gt.entries) {
    const anchors = anchorRe(e.evidence)
    const kws = keywordsOf(e.claim)
    let hit = anchors.some((re) => re.test(report))
    if (!hit && kws.length >= 2) {
      // co-occurrence: any two keywords within 200 chars
      const idx = kws.map((k) => lower.indexOf(k)).filter((i) => i >= 0).sort((a, b) => a - b)
      for (let i = 0; i < idx.length - 1; i++) if (idx[i + 1] - idx[i] <= 200) { hit = true; break }
    }
    const v = (verdicts[runId] && verdicts[runId][e.id]) || (hit ? 'PENDING' : 'NO')
    per[e.id] = { candidate: hit ? 'CANDIDATE' : 'NO', verdict: v, cluster: entryMeta.get(e.id) }
  }
  rows.push({ run_id: runId, mode, gt: per })
}

// Weighted GUS per run (only entries with verdict matched/partial counted;
// partial = 0.5 credit).
const computeGus = (per) => {
  const buckets = {}
  for (const e of gt.entries) {
    const b = e.weight_bucket
    buckets[b] = buckets[b] || { total: 0, credit: 0 }
    buckets[b].total += entryMeta.get(e.id).credit
    const v = per[e.id].verdict
    if (v === 'matched') buckets[b].credit += entryMeta.get(e.id).credit
    else if (v === 'partial') buckets[b].credit += 0.5 * entryMeta.get(e.id).credit
  }
  let gus = 0
  const parts = {}
  for (const [b, w] of Object.entries(WEIGHTS)) {
    const s = buckets[b] ? buckets[b].credit / buckets[b].total : 0
    parts[b] = { weight: w, score: s, credit: buckets[b] ? buckets[b].credit : 0, total: buckets[b] ? buckets[b].total : 0 }
    gus += w * s
  }
  return { gus, parts }
}

for (const r of rows) {
  r.gus = computeGus(r.gt)
  const risk = gt.entries.filter((e) => e.category === 'risk_surface')
  r.risk = { entries: risk.map((e) => ({ id: e.id, verdict: r.gt[e.id].verdict })), covered: risk.filter((e) => r.gt[e.id].verdict === 'matched' || r.gt[e.id].verdict === 'partial').length, total: risk.length }
}

const result = { schema: 'dsh-researcher/phase-a-v11-scores/v1', gt_entries: gt.entries.length, max_total_credit: cov.max_total_credit, weights: WEIGHTS, rows }
fs.writeFileSync(outFile, JSON.stringify(result, null, 2))
console.log('wrote ' + outFile)
for (const r of rows) console.log(r.run_id.padEnd(22) + (r.mode.padEnd(9)) + 'GUS=' + r.gus.gus.toFixed(3) + '  risk=' + r.risk.covered + '/' + r.risk.total + '  candidates=' + Object.values(r.gt).filter((v) => v.candidate === 'CANDIDATE').length)
