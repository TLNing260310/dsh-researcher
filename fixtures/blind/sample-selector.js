#!/usr/bin/env node
// Sample selector — mechanical, seeded, reproducible.
//
// Usage: node sample-selector.js
//
// Reads evaluation/candidate_pool.json + selection_rules.json +
// random_seed.txt (all frozen and committed BEFORE any run), applies the
// rules, and picks `sample_size` repositories with a seeded PRNG, stratified
// by language. Writes evaluation/selection_result.json — the selection is
// therefore reproducible and cannot be post-hoc adjusted.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const root = path.join(__dirname, '..', '..')
const pool = JSON.parse(fs.readFileSync(path.join(root, 'evaluation', 'candidate_pool.json'), 'utf8'))
const rules = JSON.parse(fs.readFileSync(path.join(root, 'evaluation', 'selection_rules.json'), 'utf8'))
const seed = fs.readFileSync(path.join(root, 'evaluation', 'random_seed.txt'), 'utf8').trim()

const hash = crypto.createHash('sha256').update(seed).digest()
const mulberry32 = (a) => () => {
  a |= 0
  a = (a + 0x6D2B79F5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const rand = mulberry32(hash.readUInt32LE(0))

const frozenAt = Date.parse(pool.frozen_at)
const applyRules = (repo) => {
  const reasons = []
  if (repo.excluded_by_hand) reasons.push('excluded_by_hand: ' + repo.excluded_by_hand)
  const ageMonths = (frozenAt - Date.parse(repo.created_at)) / (30.44 * 24 * 3600 * 1000)
  if (ageMonths < rules.min_history_months) reasons.push('history ' + ageMonths.toFixed(0) + 'm < ' + rules.min_history_months + 'm')
  const idleMonths = (frozenAt - Date.parse(repo.pushed_at)) / (30.44 * 24 * 3600 * 1000)
  if (idleMonths > rules.max_push_idle_months) reasons.push('pushed ' + idleMonths.toFixed(1) + 'm ago (> ' + rules.max_push_idle_months + 'm)')
  if (repo.size_kb < rules.size_kb_min || repo.size_kb > rules.size_kb_max) {
    reasons.push('size ' + repo.size_kb + 'KB outside [' + rules.size_kb_min + ',' + rules.size_kb_max + ']')
  }
  return reasons
}

const eligible = []
const excluded = []
for (const repo of pool.repos) {
  const reasons = applyRules(repo)
  if (reasons.length === 0) eligible.push(repo)
  else excluded.push({ repo: repo.repo, reasons })
}

// Stratified by language: shuffle each group with the seeded PRNG, then pick
// round-robin across languages.
const byLang = new Map()
for (const repo of eligible) {
  if (!byLang.has(repo.language)) byLang.set(repo.language, [])
  byLang.get(repo.language).push(repo)
}
const groups = [...byLang.values()]
for (const group of groups) {
  for (let i = group.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[group[i], group[j]] = [group[j], group[i]]
  }
}
const selected = []
let round = 0
while (selected.length < rules.sample_size && round < 10) {
  for (const group of groups) {
    if (group.length > round && selected.length < rules.sample_size) selected.push(group[round])
  }
  round++
}

fs.writeFileSync(path.join(root, 'evaluation', 'selection_result.json'), JSON.stringify({
  schema: 'dsh-researcher/selection-result/v1',
  generated_at: new Date().toISOString(),
  seed,
  pool_size: pool.repos.length,
  eligible_count: eligible.length,
  excluded,
  selected: selected.map((repo) => ({ repo: repo.repo, language: repo.language })),
}, null, 2))

console.log('eligible:', eligible.length, 'of', pool.repos.length)
console.log('selected:')
for (const repo of selected) console.log('  - ' + repo.repo + ' (' + repo.language + ')')
console.log('result written to evaluation/selection_result.json')
