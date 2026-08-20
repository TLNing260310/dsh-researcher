#!/usr/bin/env node
// Historical blind benchmark — snapshot creator.
//
// Usage: node blind-snapshot.js create <repo-url> <commit> <out-dir>
//
// Clones the repository at the given historical commit (the "T0" cutoff) into
// <out-dir>/project, and scaffolds snapshot.json for you to fill in the
// GROUND TRUTH gathered from what the project ACTUALLY did after T0
// (issues/PRs/refactors in the following 1-3 months).
//
// The blind protocol: a research run may only see the T0 checkout; scoring
// compares its findings against snapshot.json's future facts. See
// docs/evaluation.md.
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const command = process.argv[2]
if (command !== 'create') {
  console.error('usage: node blind-snapshot.js create <repo-url> <commit> <out-dir>')
  process.exit(1)
}
const repoUrl = process.argv[3]
const commit = process.argv[4]
const outDir = process.argv[5]
if (!repoUrl || !commit || !outDir) {
  console.error('usage: node blind-snapshot.js create <repo-url> <commit> <out-dir>')
  process.exit(1)
}

const projectDir = path.join(outDir, 'project')
if (fs.existsSync(projectDir)) {
  console.error('target already exists: ' + projectDir)
  process.exit(1)
}
fs.mkdirSync(outDir, { recursive: true })

const clone = spawnSync('git', ['clone', '--no-checkout', repoUrl, projectDir], { stdio: 'inherit' })
if (clone.status !== 0) {
  console.error('git clone failed')
  process.exit(1)
}
const checkout = spawnSync('git', ['-C', projectDir, 'checkout', '--detach', commit], { stdio: 'inherit' })
if (checkout.status !== 0) {
  console.error('git checkout failed; snapshot dir left at ' + projectDir)
  process.exit(1)
}

const snapshot = {
  schema: 'dsh-researcher/blind-snapshot/v1',
  repo: repoUrl,
  commit,
  cutoff_date: '<ISO date of the T0 commit — fill in>',
  research_window: '1-3 months after cutoff',
  future_issues: [
    // { id: 812, title: '...', summary: 'what the project actually fixed', found_by: null }
  ],
  future_prs: [],
  known_architecture_changes: [],
  known_doc_updates: [],
  scoring: {
    // After running a mode (Researcher / Plan / Standard) on project/,
    // record: identified_future_issues: N, wrong_judgements: N, useless_suggestions: N,
    // unsupported_claims: N, token_usage: { input: N, output: N }, duration_sec: N,
    // changed_decision: true/false
  },
}
fs.writeFileSync(path.join(outDir, 'snapshot.json'), JSON.stringify(snapshot, null, 2))
fs.writeFileSync(path.join(outDir, 'README.md'), [
  '# Blind snapshot at ' + commit,
  '',
  '- `project/` — the repository checked out at T0 (research runs must only see this).',
  '- `snapshot.json` — fill `future_issues` / `future_prs` / `known_architecture_changes` from what the project ACTUALLY did in the following 1–3 months (issues, PRs, refactors, doc fixes).',
  '- Scoring workflow and the A/B harness: docs/evaluation.md.',
  '',
].join('\n'))
console.log('snapshot created at ' + outDir)
console.log('next: fill snapshot.json with future facts, then run Researcher / Plan / Standard on project/ and score per docs/evaluation.md')
