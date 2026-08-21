#!/usr/bin/env node
// T0 selector — mechanical, seeded, reproducible (protocol §2 Rule A).
//
// Usage:
//   node t0-selector.js --commits <window-commits.json> --seed <seed-string> [--json]
//
// Input JSON: array of { sha, author_date, message } covering the candidate
// window. The script sorts candidates deterministically (author_date, then
// sha), then picks one with the SAME PRNG construction as sample-selector.js:
//   mulberry32(sha256(seed).readUInt32LE(0)),  idx = floor(rand() * n)
// The seed string is the frozen repo-selection seed namespaced per case
// (e.g. "dsh-researcher-v0.6-phase-a:flask") and is recorded in the case
// manifest. Same inputs => same T0, always.
const fs = require('node:fs')
const crypto = require('node:crypto')

const flag = (name) => {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null
}
const commitsFile = flag('commits')
const seed = flag('seed')
if (!commitsFile || !seed) {
  console.error('usage: node t0-selector.js --commits <json> --seed <seed-string> [--json]')
  process.exit(1)
}

const commits = JSON.parse(fs.readFileSync(commitsFile, 'utf8').replace(/^\uFEFF/, ''))
commits.sort((a, b) => (a.author_date < b.author_date ? -1 : a.author_date > b.author_date ? 1 : a.sha < b.sha ? -1 : 1))

const hash = crypto.createHash('sha256').update(seed).digest()
const mulberry32 = (a) => () => {
  a |= 0
  a = (a + 0x6D2B79F5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const rand = mulberry32(hash.readUInt32LE(0))
const idx = Math.floor(rand() * commits.length)
const chosen = commits[idx]

const result = {
  schema: 'dsh-researcher/t0-selection/v1',
  rule: 'A',
  seed,
  candidates: commits.map((c) => ({ sha: c.sha, author_date: c.author_date, message: c.message })),
  count: commits.length,
  draw: { idx, random_draw: rand() },
  t0: { sha: chosen.sha, author_date: chosen.author_date, message: chosen.message },
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2))
} else {
  console.log('T0 (Rule A) — seed ' + seed)
  console.log('  candidates in window: ' + commits.length)
  console.log('  draw: ' + idx + ' of ' + commits.length)
  console.log('  T0: ' + chosen.sha + '  ' + chosen.author_date + '  ' + (chosen.message || ''))
}
