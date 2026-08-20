#!/usr/bin/env node
// Cross-platform installer for the dsh-researcher preset.
//
// Primary usage (no clone, no npm publish needed — npx runs straight from
// the GitHub repository):
//
//   npx -y github:TLNing260310/dsh-researcher
//
// Also: node bin/install.js [--force]
// Copies researcher/ into ${DSH_HOME:-~/.dsh}/.agent-presets/researcher.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const SOURCE = path.join(__dirname, '..', 'researcher')
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const TARGET = path.join(DSH_HOME, '.agent-presets', 'researcher')
const FORCE = process.argv.includes('--force')
const VERIFIED_DSH = '0.1.0-rc.6'

if (!fs.existsSync(path.join(SOURCE, 'agent.cordis.yml'))) {
  console.error('preset source not found at ' + SOURCE)
  process.exit(1)
}

// Version preflight (informative; the preset itself fails closed at runtime).
try {
  const result = spawnSync('dsh', ['--version'], { encoding: 'utf8' })
  const version = String(result.stdout || result.stderr || '').trim().split('\n')[0]
  if (!version) {
    console.warn('Warning: "dsh" reported no version (verified on ' + VERIFIED_DSH + ').')
  } else if (!version.includes(VERIFIED_DSH)) {
    console.warn('Warning: verified on DSH ' + VERIFIED_DSH + '; you are running "' + version + '".')
    console.warn('The preset guard fails closed on incompatible runtimes — a refused session is expected, not silent degradation.')
  }
} catch (error) {
  console.warn('Warning: could not detect a dsh install (verified on ' + VERIFIED_DSH + ').')
}

if (fs.existsSync(TARGET)) {
  if (!FORCE) {
    console.error('Target preset already exists: ' + TARGET)
    console.error('Re-run with --force to replace it.')
    process.exit(1)
  }
  fs.rmSync(TARGET, { recursive: true, force: true })
}

fs.mkdirSync(path.dirname(TARGET), { recursive: true })
fs.cpSync(SOURCE, TARGET, { recursive: true })

console.log('')
console.log('Installed "researcher" preset to ' + TARGET)
console.log('Next steps:')
console.log('  1. Start dsh, create a new session with preset "项目研究 Project Research".')
console.log('  2. Choose permission read-only + approval never.')
console.log('  3. The first tool call will be research_doctor (Runtime Certificate) — SAFE means you are good to go.')
