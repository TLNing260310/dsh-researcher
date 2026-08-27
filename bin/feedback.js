#!/usr/bin/env node
// researcher feedback export — LOCAL, redacted, opt-in.
//
// Usage:
//   node bin/feedback.js export <session.jsonl.zstd> [--claims] [--out <file>]
//
// Produces a feedback bundle (schema dsh-researcher/feedback/v1):
//   Level 1 (default): anonymous run metrics only.
//   Level 2 (--claims): adds redacted claim summaries.
//
// What is NEVER included: prompts, model responses, absolute paths, repo
// URLs, git remotes, code content, environment variable names. Evidence
// references are reduced to basenames.
//
// This tool NEVER uploads anything. The file is written locally for you to
// inspect and attach to a GitHub Issue/Discussion if you choose to. It
// respects DO_NOT_TRACK=1 by refusing to proceed (as a convention signal —
// there is no telemetry to disable).
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')
const { buildBundle, validateBundle } = require('../lib/feedback-core.js')

const MAX_BUNDLE_BYTES = 1024 * 1024

const usage = () => {
  console.error('usage: researcher-feedback export <session.jsonl.zstd> [--claims] [--out <file>]')
  console.error('       researcher-feedback validate <feedback.json>')
}

const command = process.argv[2]
if (!['export', 'validate'].includes(command)) {
  usage()
  process.exit(1)
}

if (command === 'validate') {
  const input = process.argv[3]
  if (!input || !fs.existsSync(input)) {
    console.error('feedback bundle not found: ' + input)
    process.exit(1)
  }
  const stat = fs.statSync(input)
  if (!stat.isFile() || stat.size > MAX_BUNDLE_BYTES) {
    console.error('feedback bundle must be a regular file no larger than 1 MiB')
    process.exit(1)
  }
  let bundle
  try { bundle = JSON.parse(fs.readFileSync(input, 'utf8')) } catch (error) {
    console.error('feedback bundle is not valid JSON: ' + error.message)
    process.exit(1)
  }
  const errors = validateBundle(bundle)
  if (errors.length > 0) {
    for (const error of errors) console.error('- ' + error)
    process.exit(1)
  }
  console.log(JSON.stringify({ ok: true, schema: bundle.schema, level: bundle.level, bytes: stat.size }))
  process.exit(0)
}

const sessionFile = process.argv[3]
const includeClaims = process.argv.includes('--claims')
const outFlag = process.argv.indexOf('--out')
const outFile = outFlag >= 0 && process.argv[outFlag + 1] ? process.argv[outFlag + 1]
  : path.join(process.cwd(), 'researcher-feedback-' + new Date().toISOString().slice(0, 10) + '.json')

if (!sessionFile || !fs.existsSync(sessionFile)) {
  console.error('session file not found: ' + sessionFile)
  process.exit(1)
}

if (process.env.DO_NOT_TRACK === '1') {
  console.log('DO_NOT_TRACK=1 is set. This tool never uploads anything anyway — the local bundle was NOT written out of respect for the convention. Unset DO_NOT_TRACK to proceed, or review the source.')
  process.exit(0)
}

// Session persistence stores concatenated zstd frames; decompress all of them.
const raw = fs.readFileSync(sessionFile)
const MAGIC = Buffer.from([0x28, 0xB5, 0x2F, 0xFD])
const candidates = [0]
let pos = 0
while (true) {
  const i = raw.indexOf(MAGIC, pos + 1)
  if (i < 0) break
  candidates.push(i)
  pos = i
}
const chunks = []
for (const start of candidates) {
  try {
    chunks.push(zlib.zstdDecompressSync(raw.subarray(start), { maxOutputLength: 512 * 1024 * 1024 }))
  } catch (error) { /* skip non-frame magic */ }
}
// Decode ONCE after concatenating buffers: frame boundaries can split UTF-8
// multi-byte characters; per-frame decoding would corrupt them.
const lines = Buffer.concat(chunks).toString('utf8').split('\n').filter((l) => l.length > 0)
const events = []
for (const line of lines) {
  try { events.push(JSON.parse(line)) } catch { /* partial line at frame edges */ }
}

const bundle = buildBundle(events, { includeClaims })
fs.writeFileSync(outFile, JSON.stringify(bundle, null, 2))
console.log('Feedback bundle written to ' + outFile)
console.log('Level: ' + bundle.level + ' | tool calls: ' + Object.keys(bundle.metrics.tool_calls).length + ' kinds | claims: ' + bundle.metrics.claims_created + ' created / ' + bundle.metrics.claims_revised + ' revised | decision: ' + bundle.metrics.decision)
console.log('Review the file, then attach it to a GitHub Issue/Discussion if you want to share it. Nothing was uploaded.')
