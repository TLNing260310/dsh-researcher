// home-patch tests: 追加到 home patch 层、幂等、回退、`[]` 模板替换、无损。
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const home = require('../lib/home-patch.js')

/** A DSH home with the runtime the patch points at. */
const makeHome = ({ runtime = true, legacy = false } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'home-patch-'))
  const target = legacy
    ? path.join(root, '.agent-presets', 'researcher', 'plugins', 'research-entry')
    : path.join(root, '.dsh-researcher', 'runtime', 'plugins', 'research-entry')
  if (runtime || legacy) {
    fs.mkdirSync(target, { recursive: true })
    fs.writeFileSync(path.join(target, 'index.js'), 'module.exports = {}\n')
  }
  return root
}

const read = (root) => fs.readFileSync(home.homePatchPath(root), 'utf8')

test('a missing patch file is created with one insert entry', (t) => {
  const root = makeHome()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const manifest = home.patchHomeLayer({ dshHome: root, apply: true })
  assert.equal(manifest.action, 'patched')
  assert.equal(manifest.file, home.homePatchPath(root))
  const text = read(root)
  assert.ok(text.includes(home.MARKER_BEGIN))
  assert.ok(text.includes(home.MARKER_END))
  assert.match(text, /- insert:/)
  assert.match(text, /- id: research-entry/)
  assert.ok(text.includes('.dsh-researcher/runtime/plugins/research-entry/index.js'))
})

test('the shipped empty-list template is replaced, not appended to', (t) => {
  // `[]` 是合法的空 patch 列表，不是空白。直接追加会产出 `[]\n- insert:` —— 无效 YAML。
  const root = makeHome()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.writeFileSync(home.homePatchPath(root), '# Your patch layer.\n[]\n')
  home.patchHomeLayer({ dshHome: root, apply: true })
  const text = read(root)
  assert.ok(!/^\[\]$/mu.test(text), 'the empty-list literal must be gone')
  assert.ok(text.includes('# Your patch layer.'), 'comments above it are preserved')
  assert.match(text, /- insert:/)
})

test('a user file with other entries keeps them byte-identical', (t) => {
  const root = makeHome()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const mine = ['# my own layer', '- insert:', '    - id: my-plugin', "      name: './mine.js'", ''].join('\n')
  fs.writeFileSync(home.homePatchPath(root), mine)
  home.patchHomeLayer({ dshHome: root, apply: true })
  const text = read(root)
  assert.ok(text.startsWith(mine), 'existing content is preserved as a prefix')
  assert.match(text, /- id: research-entry/)
})

test('patching twice is idempotent', (t) => {
  const root = makeHome()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  home.patchHomeLayer({ dshHome: root, apply: true })
  const once = read(root)
  const second = home.patchHomeLayer({ dshHome: root, apply: true })
  assert.equal(second.action, 'already-patched')
  assert.equal(read(root), once)
})

test('revert removes only our block and leaves the user content byte-identical', (t) => {
  const root = makeHome()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const mine = ['# my own layer', '- insert:', '    - id: my-plugin', "      name: './mine.js'", ''].join('\n')
  fs.writeFileSync(home.homePatchPath(root), mine)
  home.patchHomeLayer({ dshHome: root, apply: true })
  const manifest = home.patchHomeLayer({ dshHome: root, apply: false })
  assert.equal(manifest.action, 'reverted')
  assert.equal(read(root), mine, 'the user content must come back byte for byte')
})

test('revert deletes a file that held nothing but our entry', (t) => {
  const root = makeHome()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  home.patchHomeLayer({ dshHome: root, apply: true })
  assert.ok(fs.existsSync(home.homePatchPath(root)))
  home.patchHomeLayer({ dshHome: root, apply: false })
  assert.equal(fs.existsSync(home.homePatchPath(root)), false, 'no empty husk is left in DSH_HOME')
})

test('revert is a no-op when the file carries no entry', (t) => {
  const root = makeHome()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const mine = '- insert:\n    - id: other\n'
  fs.writeFileSync(home.homePatchPath(root), mine)
  const manifest = home.patchHomeLayer({ dshHome: root, apply: false })
  assert.equal(manifest.action, 'not-patched')
  assert.equal(read(root), mine)
})

test('a runtime that is not installed refuses instead of writing a dead path', (t) => {
  const root = makeHome({ runtime: false })
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const manifest = home.patchHomeLayer({ dshHome: root, apply: true })
  assert.equal(manifest.action, 'skipped')
  assert.match(manifest.reason, /not installed/)
  assert.equal(fs.existsSync(home.homePatchPath(root)), false, 'a refusal writes nothing')
})

test('the pre-relocation runtime path is still honoured', (t) => {
  // 早期布局把运行时放在已安装的 preset 里。升级安装器时那一行必须继续有效。
  const root = makeHome({ runtime: false, legacy: true })
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const manifest = home.patchHomeLayer({ dshHome: root, apply: true })
  assert.equal(manifest.action, 'patched')
  assert.match(read(root), /\.agent-presets\/researcher\/plugins\/research-entry\/index\.js/)
})

test('dry run reports the plan without writing', (t) => {
  const root = makeHome()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const manifest = home.patchHomeLayer({ dshHome: root, apply: true, dryRun: true })
  assert.equal(manifest.action, 'would-patch')
  assert.equal(fs.existsSync(home.homePatchPath(root)), false)
})

test('with no DSH home the call refuses rather than guessing', () => {
  const manifest = home.patchHomeLayer({ dshHome: undefined, apply: true })
  assert.equal(manifest.action, 'skipped')
  assert.match(manifest.reason, /no DSH home/)
})

test('the inserted path is quoted so a Windows path cannot break the YAML', () => {
  const block = home.entryBlock('C:\\Users\\a b\\x\\index.js')
  assert.ok(block.includes("'C:/Users/a b/x/index.js'"))
})
