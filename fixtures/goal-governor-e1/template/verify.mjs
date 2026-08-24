import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const workspace = path.resolve(process.env.DSH_E1_VERIFIER_WORKSPACE || process.cwd())
const fixture = JSON.parse(fs.readFileSync(path.join(workspace, 'fixture-case.json'), 'utf8'))
const { normalizeName } = await import(pathToFileURL(path.join(workspace, 'src', 'task.js')).href + '?e1=' + Date.now())

if (fixture.case_id === 'no-progress') {
  process.stderr.write('E1_NO_PROGRESS: frozen verifier remains failing by construction.\n')
  process.exit(1)
}

const actual = normalizeName('  Ada  ')
if (actual !== 'ada') {
  process.stderr.write(`Expected "ada", received ${JSON.stringify(actual)}.\n`)
  process.exit(1)
}

process.stdout.write('E1 verifier PASS\n')
