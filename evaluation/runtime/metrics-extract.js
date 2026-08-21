#!/usr/bin/env node
// Per-run metrics extraction for Phase A runs.
//
// Usage: node metrics-extract.js <run-dir> [--out <metrics.json>]
// Reads run.json + session.events.json (+ stdout.log) and derives the
// protocol metrics: tokens (summed usage events), tool calls, claims
// (research_checkpoint calls), duration, final text, certificate verdict.
const fs = require('node:fs')
const path = require('node:path')

const dir = process.argv[2]
if (!dir) {
  console.error('usage: node metrics-extract.js <run-dir> [--out <file>]')
  process.exit(1)
}
const outFlag = process.argv.indexOf('--out')
const outFile = outFlag >= 0 ? process.argv[outFlag + 1] : null

const runJson = JSON.parse(fs.readFileSync(path.join(dir, 'run.json'), 'utf8'))
const events = JSON.parse(fs.readFileSync(path.join(dir, 'session.events.json'), 'utf8'))

let tokens = { input: 0, output: 0, cacheRead: 0, reasoning: 0 }
let toolCalls = 0
let claims = 0
let doctorCalls = 0
let writeAttempts = 0
const toolNames = new Map()
let finalText = ''

for (const ev of events) {
  if (ev.type === 'assistant/message' && ev.data && ev.data.usage) {
    const u = ev.data.usage
    tokens.input += u.inputTokens || 0
    tokens.output += u.outputTokens || 0
    tokens.cacheRead += u.cacheReadTokens || 0
    tokens.reasoning += u.reasoningTokens || 0
  }
  if (ev.type === 'assistant/chunk' && ev.data && ev.data.chunk && ev.data.chunk.type === 'usage') {
    const u = ev.data.chunk.usage || {}
    tokens.input += u.inputTokens || 0
    tokens.output += u.outputTokens || 0
    tokens.cacheRead += u.cacheReadTokens || 0
    tokens.reasoning += u.reasoningTokens || 0
  }
  if (ev.type === 'tool/call' && ev.data) {
    toolCalls += 1
    const name = ev.data.name
    toolNames.set(name, (toolNames.get(name) || 0) + 1)
    if (name === 'research_checkpoint') claims += 1
    if (name === 'research_doctor') doctorCalls += 1
    if (name === 'write' || name === 'edit') writeAttempts += 1
  }
  if (ev.type === 'assistant/message' && ev.data && ev.data.message && Array.isArray(ev.data.message.content)) {
    const text = ev.data.message.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
    if (text !== '') finalText = text
  }
}

const stdout = fs.existsSync(path.join(dir, 'stdout.log')) ? fs.readFileSync(path.join(dir, 'stdout.log'), 'utf8') : ''
const cert = (stdout.match(/Overall:\s*(\w+)/) || [])[1] || null

const metrics = {
  schema: 'dsh-researcher/run-metrics/v1',
  run_id: runJson.run_id,
  preset: runJson.preset,
  plan_mode: runJson.plan_mode,
  duration_ms: runJson.duration_ms,
  tokens_total: tokens.input + tokens.output + tokens.cacheRead,
  tokens_input: tokens.input,
  tokens_output: tokens.output,
  tokens_cache_read: tokens.cacheRead,
  tokens_reasoning: tokens.reasoning,
  tool_calls: toolCalls,
  tool_breakdown: Object.fromEntries(toolNames),
  claims: claims,
  doctor_calls: doctorCalls,
  write_attempts: writeAttempts,
  certificate_overall: cert,
  final_text_chars: finalText.length,
  exit: runJson.exit,
  final_reason: runJson.final_reason,
}
if (outFile) fs.writeFileSync(outFile, JSON.stringify(metrics, null, 2))
console.log(JSON.stringify(metrics, null, 2))
process.exit(0)
