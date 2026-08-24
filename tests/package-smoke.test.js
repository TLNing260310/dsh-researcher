const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const run = (command, args, options = {}) => spawnSync(command, args, {
  cwd: root,
  encoding: 'utf8',
  ...options,
})
const runNpm = (args, options = {}) => {
  const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  assert.equal(fs.existsSync(npmCli), true, 'npm CLI is required for the package smoke test')
  return run(process.execPath, [npmCli, ...args], options)
}

test('release tarball installs both presets and resolves the governed portable core', { timeout: 120000 }, (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dshr-package-smoke-'))
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
  const cache = path.join(temp, 'npm-cache')
  const packed = runNpm(['pack', '--json', '--pack-destination', temp, '--cache', cache])
  assert.equal(packed.status, 0, packed.stdout + packed.stderr)
  const manifest = JSON.parse(packed.stdout)[0]
  const tarball = path.join(temp, manifest.filename)
  assert.equal(fs.existsSync(tarball), true)
  assert.equal(manifest.files.some((entry) => entry.path.startsWith('evaluation/runs/')), false)
  for (const required of [
    'lib/index.js',
    'schemas/goal-contract-v1.schema.json',
    'researcher/agent.cordis.yml',
    'governed/agent.cordis.yml',
    'evaluation/goal-governor-e1/manifest.json',
    'evaluation/goal-governor-e1/preflight.js',
    'evaluation/goal-governor-e1/score-e1.js',
    'evaluation/goal-governor-e1/run-e1.js',
    'evaluation/goal-governor-e1/external-verifier.js',
    'evaluation/goal-governor-e1/stage1-seal.js',
    'evaluation/goal-governor-e1/runner/e1.patch.yml',
    'evaluation/goal-governor-e1/runner/e1-headless.mjs',
    'evaluation/goal-governor-e1/runner/e1-host-tool.js',
    'fixtures/goal-governor-e1/materialize.js',
    'SECURITY.md',
  ]) {
    assert.equal(manifest.files.some((entry) => entry.path === required), true, 'missing packaged file: ' + required)
  }

  const prefix = path.join(temp, 'installed-package')
  const installed = runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', prefix, '--cache', cache, tarball])
  assert.equal(installed.status, 0, installed.stdout + installed.stderr)
  const packageRoot = path.join(prefix, 'node_modules', 'dsh-researcher')
  const dshHome = path.join(temp, 'dsh-home')
  const installer = run(process.execPath, [path.join(packageRoot, 'bin', 'install.js')], {
    cwd: packageRoot,
    env: { ...process.env, DSH_HOME: dshHome },
  })
  assert.equal(installer.status, 0, installer.stdout + installer.stderr)

  const presetRoot = path.join(dshHome, '.agent-presets')
  assert.equal(fs.existsSync(path.join(presetRoot, 'researcher', 'agent.cordis.yml')), true)
  assert.equal(fs.existsSync(path.join(presetRoot, 'governed', 'agent.cordis.yml')), true)
  assert.equal(fs.existsSync(path.join(presetRoot, 'researcher', 'project-cognition', 'lib', 'goal-core', 'index.js')), true)
  const wrapper = path.join(presetRoot, 'governed', 'plugins', 'goal-governor', 'index.js')
  assert.equal(typeof require(wrapper).apply, 'function')
})
