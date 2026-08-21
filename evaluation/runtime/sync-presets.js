#!/usr/bin/env node
// Sync Phase A evaluation presets — reproducible regeneration + installation.
//
// The eval variants (researcher-quick / researcher-deep) are the shipped
// researcher preset plus a frozen depth override (deviation D002). They must
// track the researcher source exactly, so this script REGENERATES them from
// `researcher/` instead of hand-editing copies:
//
//   1. copy researcher/ -> evaluation/presets/researcher-quick
//   2. patch preset.yml name/description (eval-only marker)
//   3. patch agent.cordis.yml persona: append the frozen depth override after
//      the RESEARCH_ANCHOR line
//   4. same for researcher-deep
//   5. install researcher/ + both variants into $DSH_HOME/.agent-presets/
//
// Usage: node evaluation/runtime/sync-presets.js
// After any change to researcher/ or the overrides, re-run this, then re-freeze
// the eval lock (the lock hashes evaluation/presets + researcher/).
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const root = path.join(__dirname, '..', '..')
const src = path.join(root, 'researcher')
const base = path.join(root, 'evaluation', 'presets')
const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const presetsHome = path.join(dshHome, '.agent-presets')

// The last line of the persona block in agent.cordis.yml; the override is
// appended right after it (same 6-space indentation keeps it inside the block).
const PERSONA_ANCHOR =
  '      - End with the complete report following the research-report-template skill. The report lives in the conversation; copying it out is the user\'s action, not yours. Every report begins with its Runtime Proof: quote the certificate (Run #N + History) from your mandatory first research_doctor call.'

const VARIANTS = [
  {
    id: 'researcher-quick',
    name: '项目研究 Project Research (Eval Quick — frozen Phase A condition)',
    description: 'EVALUATION-ONLY variant of the researcher preset (deviation D002): forces the Quick depth (DISCOVER → EVIDENCE MAP → DIAGNOSE → CHALLENGE → DECISION). Do not use outside the Phase A benchmark. Evidence-driven, read-only Project Intelligence Layer.',
    override:
      '      EVALUATION OVERRIDE (frozen Phase A condition — deviation D002, see evaluation/deviations.md): this run is Researcher-QUICK. At DISCOVER, use the Quick depth ONLY (DISCOVER → EVIDENCE MAP → DIAGNOSE → CHALLENGE → DECISION). Do not expand to Deep, do not treat this as optional, and do not switch depth based on repo size or request ambiguity.',
  },
  {
    id: 'researcher-deep',
    name: '项目研究 Project Research (Eval Deep — frozen Phase A condition)',
    description: 'EVALUATION-ONLY variant of the researcher preset (deviation D002): forces the Deep depth (all eleven moves). Do not use outside the Phase A benchmark. Evidence-driven, read-only Project Intelligence Layer.',
    override:
      '      EVALUATION OVERRIDE (frozen Phase A condition — deviation D002, see evaluation/deviations.md): this run is Researcher-DEEP. Use the Deep depth (ALL eleven moves: DISCOVER → RECONSTRUCT → EVIDENCE MAP → DIAGNOSE → TRADEOFF ANALYSIS → EXTERNAL RESEARCH → COMPARE → CHALLENGE → SHAPE → CLASSIFY → SELF-EVAL → HANDOFF). Do not downgrade to Quick, do not treat this as optional, and do not switch depth based on repo size or request ambiguity.',
  },
]

const copyTree = (from, to) => {
  fs.rmSync(to, { recursive: true, force: true })
  fs.cpSync(from, to, { recursive: true })
}

for (const variant of VARIANTS) {
  const dir = path.join(base, variant.id)
  copyTree(src, dir)
  const yml = path.join(dir, 'agent.cordis.yml')
  let text = fs.readFileSync(yml, 'utf8')
  if (!text.includes(PERSONA_ANCHOR)) throw new Error(variant.id + ': persona anchor not found; the researcher persona changed — update sync-presets.js')
  if (text.includes('EVALUATION OVERRIDE')) throw new Error(variant.id + ': already contains an override; regenerate from a clean researcher/ copy')
  text = text.replace(PERSONA_ANCHOR, PERSONA_ANCHOR + '\n\n' + variant.override)
  fs.writeFileSync(yml, text)
  fs.writeFileSync(path.join(dir, 'preset.yml'),
    'name: ' + variant.name + '\ndescription: ' + variant.description + '\n')
  console.log('regenerated ' + variant.id)
}

for (const id of ['researcher', 'researcher-quick', 'researcher-deep']) {
  const from = id === 'researcher' ? src : path.join(base, id)
  copyTree(from, path.join(presetsHome, id))
  console.log('installed ' + id + ' -> ' + path.join(presetsHome, id))
}
console.log('done — re-freeze the eval lock after this (preset/eval_presets hashes changed).')
