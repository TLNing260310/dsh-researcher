#!/usr/bin/env node
// Mutation selector — mechanical, seeded, reproducible (protocol v1.1 §2/§4.3).
//
// Purpose: choose Experiment B/C mutation points from the frozen snapshot
// WITHOUT cherry-picking. The pool is enumerated mechanically from the
// snapshot workspace (public API surface, internal architecture, compatibility
// constraints), then a seeded PRNG (same construction as t0-selector.js:
// mulberry32(sha256(seed).readUInt32LE(0))) draws the mutations.
//
// Usage:
//   node mutation-selector.js --workspace <snapshot-workspace> --seed <seed-string> [--count <per-category>] [--json]
//
// Output: selection record { seed, pools, draws, mutations } — each mutation:
//   { id, kind, candidate, anchor(s), pool_idx } — the GT (impact chain) is
//   NOT auto-generated here; it is compiled by evaluators per protocol v1.1
//   §4.2/§4.3 AFTER the mechanical draw (draft status recorded in manifest).
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const flag = (name) => {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null
}
const workspace = flag('workspace')
const seed = flag('seed')
if (!workspace || !seed) {
  console.error('usage: node mutation-selector.js --workspace <dir> --seed <seed-string> [--count <n>] [--json]')
  process.exit(1)
}
const perCategory = parseInt(flag('count') || '2', 10)

// ---------- pool enumeration (mechanical, from the snapshot only) ----------

const read = (p) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '') : ''

const libDir = path.join(workspace, 'lib')
const libFiles = fs.existsSync(libDir)
  ? fs.readdirSync(libDir).filter((f) => f.endsWith('.js')).sort()
  : []

// API pool: named exports from index.js + esm.mjs, plus public (non-underscore)
// Command prototype methods.
const indexSrc = read(path.join(workspace, 'index.js'))
const esmSrc = read(path.join(workspace, 'esm.mjs'))
const apiExports = []
for (const m of indexSrc.matchAll(/exports\.([A-Za-z_$][\w$]*)/g)) apiExports.push(m[1])
for (const m of esmSrc.matchAll(/\b([A-Za-z_$][\w$]*),/g)) apiExports.push(m[1])
const commandSrc = read(path.join(workspace, 'lib', 'command.js'))
const publicMethods = []
for (const m of commandSrc.matchAll(/^\s{2}([A-Za-z_$][\w$]*)\(/gm)) {
  const name = m[1]
  if (!name.startsWith('_') && !['constructor'].includes(name) && !publicMethods.includes(name)) publicMethods.push(name)
}
const apiPool = [...new Set([...apiExports, ...publicMethods])].sort()

// Architecture pool: lib module files + internal (underscore) methods of
// command.js + parseOptions (public but architecture-bearing).
const archPool = [...libFiles.map((f) => 'lib/' + f)]
const internalMethods = []
for (const m of commandSrc.matchAll(/^\s{2}(_[A-Za-z_$][\w$]*)\(/gm)) {
  if (!internalMethods.includes(m[1])) internalMethods.push(m[1])
}
archPool.push(...internalMethods)
archPool.push('parseOptions')
archPool.sort()

// Compatibility pool: deprecated.md catalog entries + engines + error codes.
const depSrc = read(path.join(workspace, 'docs', 'deprecated.md'))
const compatPool = []
for (const m of depSrc.matchAll(/^#{3,4} (.+)$/gm)) compatPool.push('deprecated: ' + m[1].trim())
for (const m of depSrc.matchAll(/^## (.+)$/gm)) compatPool.push('removed: ' + m[1].trim())
const pkgSrc = read(path.join(workspace, 'package.json'))
for (const m of pkgSrc.matchAll(/"engines"\s*:\s*\{[^}]*\}/g)) compatPool.push('engines: ' + m[0])
for (const m of commandSrc.matchAll(/'commander\.([a-zA-Z.]+)'/g)) {
  const c = 'commander.' + m[1]
  if (!compatPool.includes('error code: ' + c)) compatPool.push('error code: ' + c)
}
compatPool.sort()

// ---------- seeded draw (same PRNG construction as t0-selector.js) ----------

const hash = crypto.createHash('sha256').update(seed).digest()
const mulberry32 = (a) => () => {
  a |= 0
  a = (a + 0x6D2B79F5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const rand = mulberry32(hash.readUInt32LE(0))

const pools = {
  api_contract: apiPool,
  internal_architecture: archPool,
  compatibility_constraint: compatPool,
}
const draws = {}
const mutations = []
let n = 1
for (const kind of Object.keys(pools)) {
  const pool = pools[kind]
  const chosen = []
  const idxs = []
  for (let i = 0; i < Math.min(perCategory, pool.length); i++) {
    const idx = Math.floor(rand() * pool.length)
    idxs.push(idx)
    chosen.push(pool[idx])
  }
  draws[kind] = { pool_size: pool.length, idxs }
  for (const c of chosen) {
    mutations.push({
      id: 'MUT-' + String(n++).padStart(2, '0'),
      kind,
      candidate: c,
      anchors: [],
      gt_status: 'DRAFT — impact chain to be compiled by evaluators (protocol v1.1 §4.2/§4.3), then frozen',
    })
  }
}

const result = {
  schema: 'dsh-researcher/mutation-selection/v1',
  rule: 'seeded mechanical draw from snapshot-derived pools (no cherry-pick)',
  seed,
  workspace,
  per_category: perCategory,
  pools,
  draws,
  mutations,
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2))
} else {
  console.log('Mutation selection — seed ' + seed)
  for (const kind of Object.keys(pools)) {
    console.log('  ' + kind + ': pool=' + pools[kind].length + ' idx=' + JSON.stringify(draws[kind].idxs))
  }
  for (const m of mutations) console.log('  ' + m.id + ' [' + m.kind + '] ' + m.candidate)
}
