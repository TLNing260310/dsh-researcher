#!/usr/bin/env node
// v0.7.1 Core Cognition GT Refinement — build the GT hierarchy from the 41
// candidate entries using the pre-registered A/B/C judgment.
//
// A: core to project understanding (missing it => misunderstanding of essence)
// B: affects future modification decisions (any change must know this)
// C: relational / constraint / design-intent (NOT a knowledge fact)
//
// Core  = (A=high and B>=medium) or (A>=medium and B=high) and C ok
// Extended = passes C, still valuable, but not core scoring surface
// Removed = fails C (knowledge fact) or redundant duplication
const fs = require('node:fs')
const path = require('node:path')

const base = path.join(__dirname, '..', '..', 'evaluation', 'cases', 'commander.js', 'gt-calibration')
const candidates = JSON.parse(fs.readFileSync(path.join(base, 'core-gt-v0.1.candidate.json'), 'utf8')).entries

// Judgment table: id -> { A, B, C, note }
const JUDGE = {
  'GT-C01': { A: 'high', B: 'high', note: 'essence: declarative spec->behavior mapping; any API/behavior change must honor it' },
  'GT-C02': { A: 'high', B: 'high', note: 'identity constraint; dependency-adding changes are near-blocked' },
  'GT-C03': { A: 'medium', B: 'medium', note: 'dual entry matters for tests/integration but is not essence' },
  'GT-C04': { A: 'high', B: 'high', note: 'strict-by-default + major ratchet governs all behavior changes' },
  'GT-C05': { A: 'high', B: 'high', note: 'semver/major timing constrains when breaking changes are allowed' },
  'GT-C06': { A: 'high', B: 'high', note: 'recursive descent is the core parse flow; every arg lands somewhere along it' },
  'GT-C07': { A: 'high', B: 'high', note: 'cli>env>implied + source tagging; env/implied semantics changes ripple' },
  'GT-C08': { A: 'high', B: 'medium', note: 'non-obvious help/version channels; help-flag edge cases' },
  'GT-C09': { A: 'high', B: 'high', note: 'unknown funnel is the key to cross-level option placement' },
  'GT-C10': { A: 'high', B: 'high', note: 'dispatch/error precedence encodes user-visible behavior' },
  'GT-C11': { A: 'high', B: 'medium', note: 'hook order + reversal; extension authors depend on it' },
  'GT-C12': { A: 'high', B: 'high', note: 'public callback protocol; adding args changes handler signatures' },
  'GT-C13': { A: 'high', B: 'high', note: 'executable externalization: naming/filesystem/spawn conventions constrain new subcommands' },
  'GT-C14': { A: 'medium', B: 'medium', note: 'ancestor validation is cross-level; valuable but not essence' },
  'GT-C15': { A: 'high', B: 'high', note: 'counter-intuitive global-wins merge; change = breaking' },
  'GT-C16': { A: 'high', B: 'high', note: 'dual-option value deduction drives implies/conflict semantics' },
  'GT-C17': { A: 'high', B: 'medium', note: 'help render pipeline with two customization seams' },
  'GT-C18': { A: 'high', B: 'high', note: 'single CJS implementation + ESM wrapper; export additions need multi-file sync' },
  'GT-C19': { A: 'high', B: 'high', note: 'command.js hub: change-risk concentration' },
  'GT-C20': { A: 'high', B: 'high', note: 'parseOptions semantic density; the sharpest edge' },
  'GT-C21': { A: 'medium', B: 'high', note: 'Help subclass compat breaks at majors' },
  'GT-C22': { A: 'high', B: 'high', note: 'value pipeline choke point; option semantics regress together' },
  'GT-C23': { A: 'medium', B: 'high', note: 'executable env coupling; overlaps C13 mechanism, adds risk attribution' },
  'GT-C24': { A: 'high', B: 'high', note: 'typings mirror: API changes need three-way sync' },
  'GT-C25': { A: 'high', B: 'high', note: 'deprecated catalog constrains refactors and removal timing' },
  'GT-C26': { A: 'medium', B: 'medium', note: 're-parse state model; partial re-entrancy' },
  'GT-C27': { A: 'medium', B: 'medium', note: 'color conventions drift; niche' },
  'GT-C28': { A: 'medium', B: 'medium', note: 'release-model concentration; derived from C05' },
  'GT-C29': { A: 'high', B: 'high', note: 'error codes are a stability contract consumers match on' },
  'GT-C30': { A: 'medium', B: 'medium', note: 'TS identity + extra-typings; related to C24' },
  'GT-C31': { A: 'medium', B: 'high', note: 'dual-option pairing re-derived in 3 sites; change must touch all' },
  'GT-C32': { A: 'medium', B: 'medium', note: 'preformatted help contract; user-facing but narrow' },
  'GT-C33': { A: 'medium', B: 'high', note: 'ESM manual enumeration: adding exports touches 5 surfaces' },
  'GT-C34': { A: 'medium', B: 'medium', note: 'executable help fallback; flow constraint' },
  'GT-C35': { A: 'medium', B: 'high', note: 'passThrough/positional parent-child invariant enforced at registration' },
  'GT-C36': { A: 'medium', B: 'medium', note: '_optionValues storage decision + legacy escape hatch' },
  'GT-C37': { A: 'medium', B: 'medium', note: 'dash-dash escape hatch contract' },
  'GT-C38': { A: 'medium', B: 'medium', note: 'weakly-typed EventEmitter surface risk' },
  'GT-C39': { A: 'medium', B: 'medium', note: 'dispatch regression history; risk reasoning' },
  'GT-C40': { A: 'medium', B: 'medium', note: 'singleton statefulness hazard' },
  'GT-C41': { A: 'medium', B: 'medium', note: 'help output environment dependence' },
}

const byId = Object.fromEntries(candidates.map((c) => [c.id, c]))
const isCore = (j) => ((j.A === 'high' && j.B !== 'low') || (j.B === 'high' && j.A !== 'low'))
const failC = (c) => c.weight_bucket === 'factual_accuracy'
// Quota enforcement: 20-25 Core. These two pass the mechanical rule but their
// subject is already covered by a Core entry (C17 for Help surface, C13 for
// executable mechanism); they stay in Extended as risk supplements.
const FORCE_EXTENDED = new Map([
  ['GT-C21', 'overlaps Core GT-C17 (Help surface); subclass-compat risk kept as Extended supplement'],
  ['GT-C23', 'overlaps Core GT-C13 (executable mechanism); env-coupling risk kept as Extended supplement'],
])

const core = []
const extended = []
const removed = []
for (const c of candidates) {
  const j = JUDGE[c.id]
  if (!j) throw new Error('missing judgment for ' + c.id)
  const entry = { ...c, judge: j }
  if (failC(c)) removed.push({ entry, reason: 'knowledge-fact bucket (file-listing-answerable)' })
  else if (FORCE_EXTENDED.has(c.id)) extended.push({ ...entry, force_reason: FORCE_EXTENDED.get(c.id) })
  else if (isCore(j)) core.push(entry)
  else extended.push(entry)
}

console.log('core:', core.length, 'extended:', extended.length, 'removed:', removed.length)
console.log('core ids:', core.map((c) => c.id).join(','))

const hierarchy = {
  schema: 'dsh-researcher/cognition-gt-hierarchy/v0.1',
  case: 'commander.js',
  created: '2026-08-21',
  judge_rule: 'Core = (A=high and B>=medium) or (B=high and A>=medium), C must be relational/constraint/design-intent; Extended = passes C but not core; Removed = knowledge fact or redundancy',
  core: core.map((c) => ({ id: c.id, category: c.category, weight_bucket: c.weight_bucket, judge: c.judge })),
  extended: extended.map((c) => ({ id: c.id, category: c.category, weight_bucket: c.weight_bucket, judge: c.judge })),
  removed: removed.map((r) => ({ id: r.entry.id, reason: r.reason })),
  bucket_counts: {
    core: core.reduce((m, c) => { m[c.weight_bucket] = (m[c.weight_bucket] || 0) + 1; return m }, {}),
    extended: extended.reduce((m, c) => { m[c.weight_bucket] = (m[c.weight_bucket] || 0) + 1; return m }, {}),
  },
}
fs.writeFileSync(path.join(base, 'gt-hierarchy.json'), JSON.stringify(hierarchy, null, 2))
console.log('wrote gt-hierarchy.json')

// Official Core GT v0.1 (scoring set; NOT locked — freeze requires the
// pre-freeze review + dual confirmation).
const coreGt = {
  schema: 'dsh-researcher/cognition-gt/v0.1',
  case: 'commander.js',
  snapshot: 'bf35c5f99c202e142644d190efc4b25b4dc4dc4c (2026-02-01, v14.0.3)',
  status: 'REFINED — scoring candidate; NOT locked (pre-freeze review pending)',
  weights: { architecture_relation: 0.40, design_purpose: 0.25, key_constraints: 0.20, factual_accuracy: 0.15 },
  entries: core.map((c) => ({ id: c.id, category: c.category, weight_bucket: c.weight_bucket, claim: c.claim, evidence: c.evidence, relation: c.relation, understanding_value: c.understanding_value, confidence: c.confidence, judge: c.judge })),
}
fs.writeFileSync(path.join(base, 'core-gt-v0.1.json'), JSON.stringify(coreGt, null, 2))
console.log('wrote core-gt-v0.1.json (' + core.length + ' entries)')
