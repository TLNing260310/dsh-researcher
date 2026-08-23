#!/usr/bin/env node
// Cross-platform installer for the dsh-researcher preset.
//
// Primary usage (no clone, no npm publish needed — npx runs straight from
// the GitHub repository):
//
//   npx -y github:TLNing260310/dsh-researcher
//
// Also: node bin/install.js [--force]
// Copies the certified researcher and governed coding presets plus the
// portable core into ${DSH_HOME:-~/.dsh}/.agent-presets/.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const REPOSITORY = path.join(__dirname, '..')
const SOURCES = {
  researcher: path.join(REPOSITORY, 'researcher'),
  governed: path.join(REPOSITORY, 'governed'),
}
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const TARGET_ROOT = path.join(DSH_HOME, '.agent-presets')
const TARGETS = {
  researcher: path.join(TARGET_ROOT, 'researcher'),
  governed: path.join(TARGET_ROOT, 'governed'),
}
const FORCE = process.argv.includes('--force')
const VERIFIED_DSH = '0.1.0-rc.7'

for (const source of Object.values(SOURCES)) if (!fs.existsSync(path.join(source, 'agent.cordis.yml'))) {
  console.error('preset source not found at ' + source)
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

for (const target of Object.values(TARGETS)) if (fs.existsSync(target)) {
  if (!FORCE) {
    console.error('Target preset already exists: ' + target)
    console.error('Re-run with --force to replace it.')
    process.exit(1)
  }
}

fs.mkdirSync(TARGET_ROOT, { recursive: true })
for (const target of Object.values(TARGETS)) if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true })
fs.cpSync(SOURCES.researcher, TARGETS.researcher, { recursive: true })
fs.cpSync(SOURCES.governed, TARGETS.governed, { recursive: true })
const portableTarget = path.join(TARGETS.researcher, 'project-cognition')
fs.cpSync(path.join(REPOSITORY, 'lib'), path.join(portableTarget, 'lib'), { recursive: true })
fs.cpSync(path.join(REPOSITORY, 'schemas'), path.join(portableTarget, 'schemas'), { recursive: true })

console.log('')
console.log('Installed "researcher" preset to ' + TARGETS.researcher)
console.log('Installed "governed" preset to ' + TARGETS.governed)
console.log('Next steps:')
console.log('  1. Certified research: select "项目研究 Project Research", permission read-only + approval never.')
console.log('  2. Governed execution: select "目标治理编码 Governed Coding" and run /researcher run <approved-contract>.')
console.log('  3. In Governed Coding, /researcher <question> is one read-only turn; /researcher on is persistent guarded mode.')
