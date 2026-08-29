'use strict'

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { directoryInventory, dshRuntimeProvenance } = require('../evaluation/goal-governor-e1/runtime-provenance.js')

test('DSH provenance resolves ESM-only dependencies from a flat npm module root', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-e1-flat-modules-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const modules = path.join(root, 'node_modules')
  const dsh = path.join(modules, '@deepseek-ai', 'dsh')
  const dependency = path.join(modules, '@earendil-works', 'pi-ai')
  fs.mkdirSync(path.join(dsh, 'lib'), { recursive: true })
  fs.mkdirSync(path.join(dependency, 'dist'), { recursive: true })
  fs.writeFileSync(path.join(dsh, 'package.json'), JSON.stringify({
    name: '@deepseek-ai/dsh',
    version: '0.1.1-rc.2',
    bin: { dsh: 'lib/bin.js' },
    dependencies: { '@earendil-works/pi-ai': '0.82.1' },
  }))
  fs.writeFileSync(path.join(dsh, 'lib', 'bin.js'), 'module.exports = {}\n')
  fs.writeFileSync(path.join(dependency, 'package.json'), JSON.stringify({
    name: '@earendil-works/pi-ai',
    version: '0.82.1',
    type: 'module',
    exports: { '.': { import: './dist/index.js' } },
  }))
  fs.writeFileSync(path.join(dependency, 'dist', 'index.js'), 'export const value = 1\n')

  const provenance = dshRuntimeProvenance(modules)
  assert.equal(provenance.package_version, '0.1.1-rc.2')
  assert.equal(provenance.dependencies.some((entry) => entry.name === '@earendil-works/pi-ai'), true)
  assert.equal(provenance.dependencies.find((entry) => entry.name === '@earendil-works/pi-ai').root_relative, '@earendil-works/pi-ai')
})

test('DSH_HOME inventory commits dependency links only when they resolve inside the locked module root', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-e1-home-links-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const home = path.join(root, 'home')
  const modules = path.join(root, 'modules')
  const outside = path.join(root, 'outside')
  fs.mkdirSync(home)
  fs.mkdirSync(path.join(modules, 'pkg'), { recursive: true })
  fs.mkdirSync(outside)
  fs.writeFileSync(path.join(modules, 'pkg', 'index.js'), 'module.exports = 1\n')
  fs.symlinkSync(path.join(modules, 'pkg'), path.join(home, 'pkg'), process.platform === 'win32' ? 'junction' : 'dir')
  fs.mkdirSync(path.join(home, 'scope'))
  fs.symlinkSync(path.join(modules, 'pkg'), path.join(home, 'scope', 'z'), process.platform === 'win32' ? 'junction' : 'dir')
  fs.symlinkSync(path.join(modules, 'pkg'), path.join(home, 'scope-a'), process.platform === 'win32' ? 'junction' : 'dir')

  assert.throws(() => directoryInventory(home), /symbolic links/)
  const first = directoryInventory(home, { allowedLinkRoot: modules })
  const second = directoryInventory(home, { allowedLinkRoot: modules })
  assert.deepEqual(second, first)
  assert.equal(first.file_count, 3)
  assert.equal(first.files[0].path, 'pkg')
  assert.deepEqual(first.files.map((entry) => entry.path), [...first.files.map((entry) => entry.path)].sort((left, right) => left.localeCompare(right)))

  fs.symlinkSync(outside, path.join(home, 'outside'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(
    () => directoryInventory(home, { allowedLinkRoot: modules }),
    /escapes the locked DSH module root/,
  )
})
