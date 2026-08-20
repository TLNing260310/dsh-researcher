// Shared fixture builders for the dsh-researcher benchmark suite.
// Each case writes a small repository with KNOWN ground truth: the
// Researcher is expected to produce the verdicts listed in ground-truth.json.
// These are synthetic, public, and reproducible — real projects never appear.
const fs = require('node:fs')
const path = require('node:path')

const writeFiles = (dir, files) => {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
  }
}

const groundTruth = (caseName, required) => ({
  schema: 'dsh-researcher/benchmark/v1',
  case: caseName,
  required,
})

// Case A — Architecture Drift: every edit was a reasonable perf win, yet the
// layering collapsed. Expected: Contradicted on the architecture claim,
// "corrosion not evolution" on the edits, BUILD restore / DON'T BUILD more.
const architectureDrift = (dir) => {
  writeFiles(dir, {
    'README.md': [
      '# payment-service', '',
      'A payment processing service with a clean layered architecture:', '',
      '```', 'Controller -> Service -> Repository -> Database', '```', '',
      'All database access goes through the repository layer.', '',
      '## Tests', '', '- Unit tests: 42 passing (see tests/)', '',
    ].join('\n'),
    'src/repository.ts': 'export class PaymentRepository {\n  async save(payment) { /* INSERT INTO payments */ }\n  async find(id) { /* SELECT ... */ }\n}\n',
    'src/service.ts': 'import { PaymentRepository } from "./repository"\n\nexport class PaymentService {\n  constructor(private repo: PaymentRepository) {}\n  async charge(payment) { return this.repo.save(payment) }\n}\n',
    'src/controller.ts': [
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
      '    const result = await db.query("INSERT INTO payments ...", req.body)',
      '    localCache.set(req.id, result)',
      '    return result',
      '  }',
      '}',
    ].join('\n'),
    'src/db.ts': 'export const db = { async query(sql, args) { return { ok: true } } }\n',
    'CHANGELOG.md': [
      '# CHANGELOG', '',
      '## v1.9', '- feat: cache hot payments in the controller (latency -40%)', '- perf: direct DB insert in charge path (one less hop)',
      '## v1.8', '- perf: bypass repository for charge hot path',
      '## v1.0', '- initial layered architecture (Controller -> Service -> Repository -> DB)',
      '',
    ].join('\n'),
    'tests/service.test.ts': '// 3 tests only.\ntest("charge saves via repository", () => { /* ... */ })\n',
    'ground-truth.json': JSON.stringify(groundTruth('architecture-drift', [
      { marker: 'Contradicted', subject: 'layered architecture claim' },
      { marker: 'corrosion', subject: 'performance edits (not evolution)' },
      { marker: 'BUILD', subject: 'restore the layering boundary' },
      { marker: 'DON\'T BUILD', subject: 'more performance patches' },
    ]), null, 2),
    'expected-result.md': [
      '# Expected result — architecture-drift', '',
      'The Researcher must, with file:line evidence:', '',
      '1. Grade the "clean layered architecture" claim as **Contradicted** (src/controller.ts imports db directly).',
      '2. Diagnose the perf edits as **corrosion, not evolution** (layering broken + controller-owned cache coherence risk).',
      '3. Classify: BUILD = restore the boundary; DON\'T BUILD = further performance patches.',
      '4. Grade the "42 tests passing" claim as **Contradicted** (tests/ holds 3).',
      '',
    ].join('\n'),
  })
  return dir
}

// Case B — Documentation Drift: the project describes itself wrongly.
// Expected: Contradicted on the test-count claim, doc-drift finding.
const documentationDrift = (dir) => {
  writeFiles(dir, {
    'README.md': [
      '# auth-service', '',
      'Production authentication service. **All 42 tests passing, CI green.**', '',
      '## Coverage', '', 'Complete unit coverage for tokens and roles.', '',
    ].join('\n'),
    'src/token.ts': 'export function sign(payload: unknown): string { return "jwt" }\n',
    'src/roles.ts': 'export function can(user: unknown, action: string): boolean { return true }\n',
    'tests/token.test.ts': 'test("sign returns a string", () => {})\n',
    'tests/roles.test.ts': 'test("admin can edit", () => {})\n',
    'tests/smoke.test.ts': 'test("smoke", () => {})\n',
    'docs/run-log.md': '# Run log\n\n## 2026-08-18\n\n- test run: blocked (no execution environment). Counts below are static expectations.\n',
    'ground-truth.json': JSON.stringify(groundTruth('documentation-drift', [
      { marker: 'Contradicted', subject: '"all 42 tests passing / CI green" claim' },
      { marker: 'doc drift', subject: 'README describes an unverified state' },
      { marker: 'INVESTIGATE', subject: 'actual test status' },
    ]), null, 2),
    'expected-result.md': [
      '# Expected result — documentation-drift', '',
      '1. "All 42 tests passing, CI green" → **Contradicted**: 3 test files, no CI config, run-log says tests were never executed.',
      '2. The README describes a state the project cannot prove — a documentation drift finding.',
      '3. Actual test status → **INVESTIGATE** (needs an execution environment), not silently accepted.',
      '',
    ].join('\n'),
  })
  return dir
}

// Case C — False Progress: version numbers and feature counts grew while the
// core problem stayed unresolved. Expected: feature velocity up, problem
// resolution not demonstrated → DON'T BUILD additional features.
const falseProgress = (dir) => {
  writeFiles(dir, {
    'README.md': [
      '# recommender-engine', '',
      'A recommendation system. **Core problem: cold-start recommendation quality.**', '',
      'Recent releases shipped 10 new features.', '',
    ].join('\n'),
    'src/core.ts': '// The cold-start scoring algorithm. Last real change: v1.0.\nexport function scoreColdStart(user: unknown): number { return 0.5 }\n',
    'src/themes.ts': '// v1.1: dark/light theme support\nexport const themes = ["light", "dark"]\n',
    'src/export.ts': '// v1.1: CSV export\nexport function toCsv(rows: unknown[]): string { return "" }\n',
    'src/i18n.ts': '// v1.2: 8 locales\nexport const locales = ["en", "zh", "ja", "de", "fr", "es", "pt", "ru"]\n',
    'CHANGELOG.md': [
      '# CHANGELOG', '',
      '## v1.2', '- feat: 8 locales', '- feat: theme switcher', '- feat: CSV/JSON export', '- feat: notification prefs', '- feat: keyboard shortcuts', '- feat: onboarding tour',
      '## v1.1', '- feat: dark mode', '- feat: CSV export', '- feat: user avatars', '- feat: emoji reactions',
      '## v1.0', '- initial release with the cold-start scoring baseline',
      '',
    ].join('\n'),
    'docs/eval.md': '# Evaluation\n\nCold-start quality: no benchmark run since v1.0. The v1.1/v1.2 features are surface-level and do not touch src/core.ts.\n',
    'ground-truth.json': JSON.stringify(groundTruth('false-progress', [
      { marker: 'DON\'T BUILD', subject: 'additional features' },
      { marker: 'INVESTIGATE', subject: 'cold-start quality (core problem unresolved)' },
      { marker: 'feature velocity', subject: 'increased while problem resolution not demonstrated' },
    ]), null, 2),
    'expected-result.md': [
      '# Expected result — false-progress', '',
      '1. Feature velocity increased (+10 features across v1.1/v1.2) while the core problem (cold-start quality) has no resolution evidence.',
      '2. Classify additional features as **DON\'T BUILD** until the core problem is measured.',
      '3. Cold-start quality → **INVESTIGATE** (no benchmark since v1.0).',
      '',
    ].join('\n'),
  })
  return dir
}

module.exports = { writeFiles, groundTruth, architectureDrift, documentationDrift, falseProgress }
