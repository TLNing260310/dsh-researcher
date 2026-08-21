#!/usr/bin/env node
// Per-run report extraction: final report text + claims (for researcher runs:
// the research_checkpoint ledger; otherwise the final message).
//
// Usage: node extract-reports.js <runs-root>
// Writes <run-dir>/report.txt and <run-dir>/claims.json for every run.
const fs = require('node:fs')
const path = require('node:path')

const root = process.argv[2] || path.join(__dirname, '..', '..', 'evaluation', 'runs', 'flask')
if (!fs.existsSync(root)) {
  console.error('runs root not found: ' + root)
  process.exit(1)
}

const walk = (dir, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, acc)
    else if (e.name === 'run.json') acc.push(dir)
  }
  return acc
}

const runs = walk(root)
console.log('runs found:', runs.length)
for (const dir of runs.sort()) {
  const eventsPath = path.join(dir, 'session.events.json')
  if (!fs.existsSync(eventsPath)) {
    console.log('SKIP (no events):', dir)
    continue
  }
  const events = JSON.parse(fs.readFileSync(eventsPath, 'utf8'))
  // The deliverable is the whole assistant message chain of the run (agents
  // may hand off the report in one message and summarize in the last one).
  const texts = []
  const checkpointClaims = []
  const toolCalls = []
  for (const ev of events) {
    if (ev.type === 'assistant/message' && ev.data && ev.data.message) {
      const text = (ev.data.message.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('')
      if (text !== '') texts.push(text)
    }
    if (ev.type === 'tool/call' && ev.data) {
      toolCalls.push({ name: ev.data.name, arguments: ev.data.arguments })
      if (ev.data.name === 'research_checkpoint') {
        try {
          checkpointClaims.push(JSON.parse(ev.data.arguments))
        } catch {
          checkpointClaims.push({ raw: ev.data.arguments })
        }
      }
    }
  }
  const finalText = texts.join('\n\n')
  fs.writeFileSync(path.join(dir, 'report.txt'), finalText)
  fs.writeFileSync(path.join(dir, 'claims.json'), JSON.stringify({
    checkpoint_claims: checkpointClaims,
    tool_calls: toolCalls,
  }, null, 2))
  console.log('extracted:', path.basename(dir), '| report chars:', finalText.length, '| checkpoints:', checkpointClaims.length, '| tool calls:', toolCalls.length)
}
