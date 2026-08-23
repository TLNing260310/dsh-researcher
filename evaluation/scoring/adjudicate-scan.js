#!/usr/bin/env node
// adjudicate-scan — keyword pre-scan for C+ adjudication (evaluator aid).
// Prints per-run detection hits + mutation-relevant passages, so the
// evaluator can fill adjudication-exp-cplus.json with grounded verdicts.
const fs = require('node:fs')

const checks = {
  'MUT-01': ['restoreStateBeforeParse', 'storeOptionsAsProperties', 'repeated parse', 'MUT-01', 'parse again', 'stateBeforeParse'],
  'MUT-02': ['configureHelp', 'createHelp', 'base', 'MUT-02', 'descriptor', 'merge'],
  'MUT-03': ['_executeSubCommand', 'sourceExt', 'extension', 'probing', 'MUT-03', 'resolveExecutable', 'findFile'],
  'MUT-04': ['_excessArguments', 'excess argument', 'parseOptions', 'MUT-04', 'too many arguments', 'operand'],
  'MUT-05': ['invalidArgumentValue', '_callParseArg', 'parseArg', 'MUT-05', 'CommanderError'],
  'MUT-06': ['missingMandatoryOptionValue', 'flags', 'MUT-06', 'required option', 'message'],
}

const ids = [
  'exp-cplus-mut01-a', 'exp-cplus-mut01-b', 'exp-cplus-mut02-a', 'exp-cplus-mut02-b',
  'exp-cplus-mut03-a', 'exp-cplus-mut03-b', 'exp-cplus-mut04-a', 'exp-cplus-mut04-b',
  'exp-cplus-mut05-a', 'exp-cplus-mut05-b', 'exp-cplus-mut06-a', 'exp-cplus-mut06-b',
]

for (const id of ids) {
  const t = fs.readFileSync('evaluation/scoring/out/pcr-full-' + id + '.txt', 'utf8')
  const num = id.match(/mut(\d+)/)[1]
  const mut = 'MUT-' + num
  const kws = checks[mut]
  const hits = kws.filter((k) => t.includes(k))
  // find passages mentioning the mutation area (context around first hit)
  const passages = []
  for (const k of kws) {
    const i = t.indexOf(k)
    if (i >= 0) passages.push('...' + t.slice(Math.max(0, i - 120), i + 200).replace(/\n+/g, ' ') + '...')
  }
  console.log('=== ' + id + ' [' + mut + '] hits=[' + hits.join(',') + '] ===')
  for (const p of passages.slice(0, 3)) console.log('  ' + p)
}
