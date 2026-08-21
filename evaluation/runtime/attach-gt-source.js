#!/usr/bin/env node
// Freeze Integrity Check — Part 1: attach the source evaluator trace to every
// Core entry WITHOUT touching claim/evidence/wording. The trace maps each Core
// id to the evaluator-A/B candidate ids it was merged from (calibration report
// consensus table). Single-sided entries carry one side.
const fs = require('node:fs')
const path = require('node:path')

const base = path.join(__dirname, '..', '..', 'evaluation', 'cases', 'commander.js', 'gt-calibration')
const gtFile = path.join(base, 'core-gt-v0.1.json')
const gt = JSON.parse(fs.readFileSync(gtFile, 'utf8'))

// Core id -> evaluator source trace (from gt-calibration-report-v0.1.md §2)
const SOURCE = {
  'GT-C01': { A: ['A-01'], B: ['B-01'] },
  'GT-C02': { A: ['A-07', 'A-30'], B: ['B-03'] },
  'GT-C04': { A: ['A-03', 'A-04', 'A-37'], B: ['B-05'] },
  'GT-C05': { A: ['A-05'], B: ['B-06'] },
  'GT-C06': { A: ['A-08'], B: ['B-10'] },
  'GT-C07': { A: ['A-09', 'A-10'], B: ['B-08'] },
  'GT-C08': { A: ['A-11', 'A-12'], B: ['B-11'] },
  'GT-C09': { A: ['A-13'], B: ['B-19'] },
  'GT-C10': { A: ['A-14'], B: ['B-15'] },
  'GT-C11': { A: ['A-15'], B: ['B-14'] },
  'GT-C12': { A: ['A-16'], B: ['B-31'] },
  'GT-C13': { A: ['A-17', 'A-18'], B: ['B-13'] },
  'GT-C15': { A: ['A-20'], B: ['B-17'] },
  'GT-C16': { A: ['A-21', 'A-43'], B: ['B-09'] },
  'GT-C17': { A: ['A-22'], B: ['B-18'] },
  'GT-C18': { A: ['A-31'], B: ['B-20'] },
  'GT-C19': { A: ['A-23'], B: ['B-21'] },
  'GT-C20': { A: ['A-24', 'A-41'], B: ['B-25'] },
  'GT-C22': { A: ['A-28'], B: ['B-22'] },
  'GT-C24': { A: ['A-39'], B: ['B-24', 'B-33'] },
  'GT-C25': { A: ['A-32', 'A-38'], B: ['B-29', 'B-34'] },
  'GT-C29': { A: ['A-27', 'A-36'], B: ['B-15'], note: 'B-15 covers error-check ordering (partial consensus); primary sources A-27/A-36' },
  'GT-C31': { A: ['A-26'], B: [] },
  'GT-C33': { A: ['A-40'], B: [] },
  'GT-C35': { A: [], B: ['B-30'] },
}

let changed = 0
for (const e of gt.entries) {
  const src = SOURCE[e.id]
  if (!src) throw new Error('missing source trace for ' + e.id)
  if (e.source) throw new Error('source already present for ' + e.id)
  e.source = src
  changed++
}
fs.writeFileSync(gtFile, JSON.stringify(gt, null, 2))
console.log('source traces attached to ' + changed + ' entries (wording untouched)')
