#!/usr/bin/env node
// Legacy entry point: generates the architecture-drift case (payment-service)
// through the shared benchmark library.
// Usage: node generate.js <target-dir>
const path = require('node:path')
const { architectureDrift } = require('../benchmark/lib.js')

const target = process.argv[2]
if (!target) {
  console.error('usage: node generate.js <target-dir>')
  process.exit(1)
}
const dir = architectureDrift(path.join(target, 'payment-service'))
console.log('fixture written to', dir)
