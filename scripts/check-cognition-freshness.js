#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { evaluateFreshness } = require('../lib/cognition-core/index.js')

const root = path.resolve(__dirname, '..')
const sourceFile = path.join(root, 'docs', 'evidence', 'evidence-sources.json')
const stateFile = path.join(root, '.project-cognition', 'state.json')
const SOURCE_SCHEMA = 'dsh-researcher/evidence-sources/v1'

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const normalize = (relative) => relative.replace(/\\/g, '/')

const fingerprintFiles = (files, repositoryRoot = root) => {
  const normalized = [...files].map(normalize).sort()
  const hash = crypto.createHash('sha256')
  hash.update('dsh-researcher/evidence-file-set/v1\0')
  for (const relative of normalized) {
    if (path.isAbsolute(relative) || relative.split('/').includes('..')) throw new Error('evidence source path must stay inside the repository: ' + relative)
    const absolute = path.resolve(repositoryRoot, ...relative.split('/'))
    if (!absolute.startsWith(repositoryRoot + path.sep) || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error('evidence source is missing or not a file: ' + relative)
    hash.update(relative + '\0')
    hash.update(fs.readFileSync(absolute))
    hash.update('\0')
  }
  return hash.digest('hex')
}

const validateSources = (manifest) => {
  if (!manifest || manifest.schema !== SOURCE_SCHEMA || !Array.isArray(manifest.entries) || !Array.isArray(manifest.required_fresh)) throw new Error('invalid evidence source manifest')
  const ids = new Set()
  for (const entry of manifest.entries) {
    if (!entry || typeof entry.evidence_id !== 'string' || !Array.isArray(entry.files) || entry.files.length === 0) throw new Error('invalid evidence source entry')
    if (ids.has(entry.evidence_id)) throw new Error('duplicate evidence source id: ' + entry.evidence_id)
    ids.add(entry.evidence_id)
  }
  for (const id of manifest.required_fresh) if (!ids.has(id)) throw new Error('required freshness id has no source entry: ' + id)
}

const run = () => {
  const manifest = readJson(sourceFile)
  const state = readJson(stateFile)
  validateSources(manifest)
  const observed = Object.fromEntries(manifest.entries.map((entry) => [entry.evidence_id, fingerprintFiles(entry.files)]))
  const report = evaluateFreshness(state, observed)
  const statusById = new Map(report.evidence.map((entry) => [entry.id, entry.status]))
  const missing = manifest.required_fresh.filter((id) => statusById.get(id) !== 'fresh')
  const output = { ok: missing.length === 0 && report.stale_evidence.length === 0, source_schema: manifest.schema, required_fresh: manifest.required_fresh, observed, ...report }
  process.stdout.write(JSON.stringify(output, null, 2) + '\n')
  if (!output.ok) throw new Error('required cognition evidence is not fresh: ' + missing.join(', '))
  return output
}

if (require.main === module) {
  try { run() } catch (error) {
    process.stderr.write('cognition freshness failed: ' + error.message + '\n')
    process.exitCode = 1
  }
}

module.exports = { SOURCE_SCHEMA, fingerprintFiles, validateSources, run }
