#!/usr/bin/env node
// Freeze Integrity Check — automated verification. Exits 1 on any failure.
// 1. GT file integrity: 25 entries, unique IDs, all from the candidate set,
//    required fields present, source trace present.
// 2. Coverage consistency: coverage-map covers exactly the 25 Core ids
//    (clusters + independent), no overlap, no orphans; max_total_credit
//    consistent with cluster credits and independent count.
const fs = require('node:fs')
const path = require('node:path')

const base = path.join(__dirname, '..', '..', 'evaluation', 'cases', 'commander.js', 'gt-calibration')
const candidateFile = path.join(base, 'core-gt-v0.1.candidate.json')
const gtFile = path.join(base, 'core-gt-v0.1.json')
const covFile = path.join(base, 'coverage-map.json')

const fail = (msg) => { console.log('FAIL: ' + msg); process.exitCode = 1 }
const pass = (msg) => console.log('PASS: ' + msg)

// --- 1. GT file integrity ---
const candidates = JSON.parse(fs.readFileSync(candidateFile, 'utf8')).entries
const candIds = new Set(candidates.map((c) => c.id))
const gt = JSON.parse(fs.readFileSync(gtFile, 'utf8'))

if (gt.entries.length !== 25) fail('expected 25 entries, got ' + gt.entries.length)
else pass('25 entries')

const ids = gt.entries.map((e) => e.id)
if (new Set(ids).size !== 25) fail('duplicate ids')
else pass('ids unique')
if (ids.some((id) => !candIds.has(id))) fail('id(s) outside candidate set: ' + ids.filter((id) => !candIds.has(id)))
else pass('all ids from candidate set')

const REQUIRED = ['id', 'category', 'weight_bucket', 'claim', 'evidence', 'relation', 'understanding_value', 'confidence', 'judge', 'source']
const missing = gt.entries.flatMap((e) => REQUIRED.filter((f) => e[f] === undefined).map((f) => e.id + ':' + f))
if (missing.length) fail('missing fields: ' + missing.join(', '))
else pass('all required fields present (claim/evidence/category/judge/source)')

const noSource = gt.entries.filter((e) => !e.source || !Array.isArray(e.source.A) || !Array.isArray(e.source.B))
if (noSource.length) fail('entries without evaluator source trace: ' + noSource.map((e) => e.id).join(','))
else pass('source evaluator trace present on all 25 entries')

// no additions/deletions vs candidate wording
const candById = Object.fromEntries(candidates.map((c) => [c.id, c]))
const wordingChanged = gt.entries.filter((e) => candById[e.id].claim !== e.claim || candById[e.id].evidence.join('|') !== e.evidence.join('|'))
if (wordingChanged.length) fail('wording changed vs candidate: ' + wordingChanged.map((e) => e.id).join(','))
else pass('claim/evidence wording byte-identical to candidates (no rewrite)')

// --- 2. Coverage consistency ---
const cov = JSON.parse(fs.readFileSync(covFile, 'utf8'))
const clusterIds = cov.clusters.flatMap((c) => c.core_ids)
const indIds = cov.independent_ids
const covIds = new Set([...clusterIds, ...indIds])

const missed = ids.filter((id) => !covIds.has(id))
if (missed.length) fail('Core entries missing from coverage map: ' + missed.join(', '))
else pass('coverage map covers all 25 Core entries')

const overlap = clusterIds.filter((id) => indIds.includes(id))
if (overlap.length) fail('overlap between clusters and independent list: ' + overlap.join(', '))
else pass('no overlap (clusters vs independent)')

const dupCluster = clusterIds.filter((id, i) => clusterIds.indexOf(id) !== i)
if (dupCluster.length) fail('duplicate id across clusters: ' + dupCluster.join(', '))
else pass('no duplicate ids across clusters')

const orphanCov = [...covIds].filter((id) => !candIds.has(id) || !ids.includes(id))
if (orphanCov.length) fail('coverage references non-Core ids: ' + orphanCov.join(', '))
else pass('no orphan coverage references')

const expectedCredit = cov.independent_ids.length + cov.clusters.reduce((s, c) => s + c.max_credit, 0)
if (cov.max_total_credit !== expectedCredit) fail('max_total_credit ' + cov.max_total_credit + ' != computed ' + expectedCredit)
else pass('max_total_credit consistent (' + cov.max_total_credit + ' credits = ' + cov.independent_ids.length + ' independent + ' + cov.clusters.length + ' clusters)')

if (process.exitCode) { console.log('\nINTEGRITY CHECK: FAIL'); process.exit(1) }
console.log('\nINTEGRITY CHECK: PASS (GT count 25 != scoring denominator 23 — duplicate cognition units explicitly merged)')
