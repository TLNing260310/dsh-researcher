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

if (command === 'metrics') {
  const reportFile = process.argv[3]
  const outFlag = process.argv.indexOf('--out')
  const outFile = outFlag >= 0 && process.argv[outFlag + 1] ? process.argv[outFlag + 1] : null
  if (!reportFile || !fs.existsSync(reportFile)) {
    console.error('usage: node benchmark-runner.js metrics <report.md> [--out <metrics.json>]')
    process.exit(1)
  }
  const report = fs.readFileSync(reportFile, 'utf8')
  const metrics = {
    schema: 'dsh-researcher/metrics/v1',
    token_input: null,
    token_output: null,
    tool_calls: null,
    llm_duration: null,
    claim_cards: (report.match(/C\d+/g) || []).length,
    build_count: (report.match(/BUILD/g) || []).length,
    dont_build_count: (report.match(/DON'T\s*BUILD/g) || []).length,
    investigate_count: (report.match(/INVESTIGATE/g) || []).length,
    certificate: (report.match(/Overall:\s*(\w+)/) || [])[1] || null,
  }
  const usage = report.match(/输入\s*([\d.]+[KM]?)\s*tok[^·]*·\s*输出\s*([\d.]+[KM]?)\s*tok/)
  if (usage) {
    metrics.token_input = usage[1]
    metrics.token_output = usage[2]
  }
  const toolMatch = report.match(/工具调用\s*([\d.]+)\s*s/)
  if (toolMatch) metrics.tool_calls = toolMatch[1]
  const durationMatch = report.match(/LLM\s*([\d.m]+s)/)
  if (durationMatch) metrics.llm_duration = durationMatch[1]
  const json = JSON.stringify(metrics, null, 2)
  if (outFile) fs.writeFileSync(outFile, json)
  console.log(json)
  process.exit(0)
}

console.error('usage: node benchmark-runner.js <generate|score|metrics> ...')
process.exit(1)
