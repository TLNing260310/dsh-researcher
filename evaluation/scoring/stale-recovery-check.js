#!/usr/bin/env node
// stale-recovery-check — for each B run, check whether its PCR invalidates
// the expected stale claims (by id or by statement content), and whether it
// over-invalidates (invalidates claims NOT in the expected set).
// Evaluator aid only: final verdicts go into adjudication-exp-cplus.json.
const fs = require('node:fs')

const pairs = {
  'exp-cplus-mut01-b': { src: 'exp-a-quick-01', mut: 'MUT-01' },
  'exp-cplus-mut02-b': { src: 'exp-a-quick-02', mut: 'MUT-02' },
  'exp-cplus-mut03-b': { src: 'exp-a-deep-02', mut: 'MUT-03' },
  'exp-cplus-mut04-b': { src: 'exp-a-deep-01', mut: 'MUT-04' },
  'exp-cplus-mut05-b': { src: 'exp-a-quick-03', mut: 'MUT-05' },
  'exp-cplus-mut06-b': { src: 'exp-a-deep-03', mut: 'MUT-06' },
}

const invalidationWords = ['no longer', 'no longer holds', 'superseded', 'invalidated', 'stale', 'obsolete', 'outdated', 'does not hold', 'changed', 'no longer true', 'revised', 'correction', 'prior claim', 'previously', 'no longer applies', 'not applicable anymore', 'must be updated', 'no longer valid', 'invalid', 'contradicted', 'supersede']

for (const [id, p] of Object.entries(pairs)) {
  const f = 'evaluation/scoring/out/_stale-' + p.src + '-' + p.mut + '.json'
  const d = JSON.parse(fs.readFileSync(f, 'utf8'))
  const expectedIds = d.stale_claims.map((c) => c.id)
  const t = fs.readFileSync('evaluation/scoring/out/pcr-full-' + id + '.txt', 'utf8')

  const hits = []
  for (const eid of expectedIds) {
    const idHit = t.includes(eid)
    const words = invalidationWords.filter((w) => t.includes(w))
    hits.push({ id: eid, id_mentioned: idHit, invalidation_words: words.length })
  }
  console.log('=== ' + id + ' expected=[' + expectedIds.join(',') + '] ===')
  for (const h of hits) console.log('  ' + h.id + ': mentioned=' + h.id_mentioned + ' invalidation-signals=' + h.invalidation_words)
  // over-invalidation proxy: count 'claim' mentions with invalidation words not in expected set
  const over = []
  const claimMentions = t.match(/C\d[\w-]*/g) || []
  const mentioned = [...new Set(claimMentions)]
  for (const m of mentioned) {
    if (!expectedIds.includes(m)) {
      const idx = t.indexOf(m)
      const ctx = t.slice(Math.max(0, idx - 60), idx + 120)
      if (invalidationWords.some((w) => ctx.includes(w))) over.push(m)
    }
  }
  console.log('  over-invalidation candidates (non-expected claims in invalidation context): ' + (over.slice(0, 8).join(',') || 'none'))
}
