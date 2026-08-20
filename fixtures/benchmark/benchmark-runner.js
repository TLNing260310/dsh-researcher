#!/usr/bin/env node
// dsh-researcher benchmark suite.
//
// Usage:
//   node benchmark-runner.js generate <dir>          build all three cases
//   node benchmark-runner.js score <case-dir> <report.md>
//                                                    score a research report
//                                                    against the case's ground
//                                                    truth (marker matching)
//
// The runner cannot drive a live DSH session; scoring is the deterministic
// part. The research run itself is manual (open the case dir in a researcher
// session) — the report's Runtime Certificate section is itself part of the
// evidence.
const fs = require('node:fs')
const path = require('node:path')
const { architectureDrift, documentationDrift, falseProgress } = require('./lib.js')

const command = process.argv[2]

if (command === 'generate') {
  const target = process.argv[3]
  if (!target) {
    console.error('usage: node benchmark-runner.js generate <dir>')
    process.exit(1)
  }
  const cases = path.join(target, 'cases')
  architectureDrift(path.join(cases, 'architecture-drift'))
  documentationDrift(path.join(cases, 'documentation-drift'))
  falseProgress(path.join(cases, 'false-progress'))
  console.log('benchmark cases written to ' + cases)
  console.log('Next: open each case dir in a researcher session and produce a report;')
  console.log('then score with: node benchmark-runner.js score <case-dir> <report.md>')
  process.exit(0)
}

if (command === 'score') {
  const caseDir = process.argv[3]
  const reportFile = process.argv[4]
  if (!caseDir || !reportFile) {
    console.error('usage: node benchmark-runner.js score <case-dir> <report.md>')
    process.exit(1)
  }
  const gtPath = path.join(caseDir, 'ground-truth.json')
  if (!fs.existsSync(gtPath)) {
    console.error('ground-truth.json not found in ' + caseDir + ' (is this a generated case dir?)')
    process.exit(1)
  }
  if (!fs.existsSync(reportFile)) {
    console.error('report not found: ' + reportFile)
    process.exit(1)
  }
  const gt = JSON.parse(fs.readFileSync(gtPath, 'utf8'))
  const report = fs.readFileSync(reportFile, 'utf8')
  let matched = 0
  const rows = []
  for (const item of gt.required) {
    const lower = report.toLowerCase()
    const needle = item.marker.toLowerCase()
    const ok = lower.includes(needle)
    if (ok) matched++
    rows.push({ marker: item.marker, subject: item.subject, found: ok })
  }
  const total = gt.required.length
  console.log('Case: ' + gt.case)
  for (const row of rows) {
    console.log('  [' + (row.found ? 'PASS' : 'MISS') + '] ' + row.marker + ' — ' + row.subject)
  }
  console.log('Score: ' + matched + '/' + total)
  console.log('Note: marker matching is a floor, not the whole evaluation — evidence citations and the Runtime Certificate are checked by a human reviewer.')
  process.exit(matched === total ? 0 : 1)
}

console.error('usage: node benchmark-runner.js <generate|score> ...')
process.exit(1)
