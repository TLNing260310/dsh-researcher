#!/usr/bin/env node
// Synthetic Case Generator: payment-service with architecture drift.
//
// Produces a small repository under <target>/payment-service that models the
// core research scenario WITHOUT touching any real project:
//
//   v1  "clean" architecture: Controller -> Service -> Repository -> DB
//   10 AI-style "locally reasonable" edits accumulated (in the git history
//       sense via a CHANGELOG, plus the drift applied to the working tree)
//   final state: Controller imports DB directly (layering broken), caching
//       hacked into the Controller, and README still describes the OLD
//       layered architecture.
//
// The Researcher is expected to find, with evidence:
//   - Claim "follows a layered architecture" -> Contradicted
//       (src/controller.ts imports db directly)
//   - README describes v1 architecture while code drifted (doc drift)
//   - The "performance optimization" edits are locally optimal but globally
//       corrosive (layering + cache coherence)
// Ground truth is written to ground-truth.json for benchmark scoring.
//
// Usage: node generate.js <target-dir>

const fs = require('node:fs')
const path = require('node:path')

const target = process.argv[2]
if (!target) {
  console.error('usage: node generate.js <target-dir>')
  process.exit(1)
}

const root = path.join(target, 'payment-service')
fs.mkdirSync(path.join(root, 'src'), { recursive: true })
fs.mkdirSync(path.join(root, 'tests'), { recursive: true })

fs.writeFileSync(path.join(root, 'README.md'), [
  '# payment-service',
  '',
  'A payment processing service with a clean layered architecture:',
  '',
  '```',
  'Controller -> Service -> Repository -> Database',
  '```',
  '',
  'All database access goes through the repository layer. The service layer',
  'owns business rules. Controllers only handle HTTP concerns.',
  '',
  '## Tests',
  '',
  '- Unit tests: 42 passing (see tests/)',
  '',
].join('\n'))

// v1 files (the "clean" architecture), as described by README.
fs.writeFileSync(path.join(root, 'src', 'repository.ts'), [
  'export class PaymentRepository {',
  '  async save(payment) { /* INSERT INTO payments */ }',
  '  async find(id) { /* SELECT ... */ }',
  '}',
  '',
].join('\n'))

fs.writeFileSync(path.join(root, 'src', 'service.ts'), [
  'import { PaymentRepository } from "./repository"',
  '',
  'export class PaymentService {',
  '  constructor(private repo: PaymentRepository) {}',
  '  async charge(payment) {',
  '    // business rules here',
  '    return this.repo.save(payment)',
  '  }',
  '}',
  '',
].join('\n'))

// Drifted controller: after ten "locally reasonable" edits it imports the DB
// directly and hacks in a cache — each edit looked fine alone.
fs.writeFileSync(path.join(root, 'src', 'controller.ts'), [
  '// NOTE: after several performance fixes, the controller reaches the DB',
  '// directly. The repository layer is now bypassed in the hot path.',
  'import { db } from "./db"',
  'import { PaymentRepository } from "./repository"',
  '',
  'const localCache = new Map()',
  '',
  'export class PaymentController {',
  '  async handleCharge(req) {',
  '    const cached = localCache.get(req.id)',
  '    if (cached) return cached',
  '    // direct DB write (was: service -> repository)',
  '    const result = await db.query("INSERT INTO payments ...", req.body)',
  '    localCache.set(req.id, result)',
  '    return result',
  '  }',
  '}',
  '',
].join('\n'))

fs.writeFileSync(path.join(root, 'src', 'db.ts'), [
  'export const db = {',
  '  async query(sql, args) { /* raw driver */ return { ok: true } },',
  '}',
  '',
].join('\n'))

fs.writeFileSync(path.join(root, 'CHANGELOG.md'), [
  '# CHANGELOG',
  '',
  '## v1.9',
  '- feat: cache hot payments in the controller (latency -40%)',
  '- perf: direct DB insert in charge path (one less hop)',
  '## v1.8',
  '- perf: bypass repository for charge hot path',
  '## v1.0',
  '- initial layered architecture (Controller -> Service -> Repository -> DB)',
  '',
].join('\n'))

// Only 3 real tests exist — README claims 42.
fs.writeFileSync(path.join(root, 'tests', 'service.test.ts'), [
  '// 3 tests only.',
  'test("charge saves via repository", () => { /* ... */ })',
  '',
].join('\n'))

fs.writeFileSync(path.join(root, 'ground-truth.json'), JSON.stringify({
  schema: 'dsh-researcher/fixture/v1',
  fixture: 'payment-service-architecture-drift',
  expected: [
    {
      kind: 'contradicted-claim',
      claim: 'follows a layered architecture (Controller -> Service -> Repository -> DB)',
      verdict: 'Contradicted',
      tier: 'C1',
      evidence: ['src/controller.ts:1-13 (imports db directly)', 'README.md:5-7'],
    },
    {
      kind: 'doc-drift',
      claim: 'README describes v1 architecture while the code drifted',
      evidence: ['README.md:5-7', 'src/controller.ts'],
    },
    {
      kind: 'corrosion-not-evolution',
      claim: 'the performance edits are locally optimal but globally corrosive',
      reason: 'layering broken + controller-owned cache coherence risk; the CHANGELOG shows each edit was a reasonable perf win',
      evidence: ['CHANGELOG.md:v1.8, v1.9', 'src/controller.ts:5-13'],
    },
    {
      kind: 'contradicted-claim',
      claim: '42 unit tests passing',
      verdict: 'Contradicted',
      tier: 'C0',
      evidence: ['README.md:10', 'tests/service.test.ts (3 tests only)'],
    },
  ],
}, null, 2))

console.log('fixture written to', root)
