'use strict'

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { directoryInventory } = require('../evaluation/goal-governor-e1/runtime-provenance.js')

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

  assert.throws(() => directoryInventory(home), /symbolic links/)
  const first = directoryInventory(home, { allowedLinkRoot: modules })
  const second = directoryInventory(home, { allowedLinkRoot: modules })
  assert.deepEqual(second, first)
  assert.equal(first.file_count, 1)
  assert.equal(first.files[0].path, 'pkg')

  fs.symlinkSync(outside, path.join(home, 'outside'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(
    () => directoryInventory(home, { allowedLinkRoot: modules }),
    /escapes the locked DSH module root/,
  )
})
