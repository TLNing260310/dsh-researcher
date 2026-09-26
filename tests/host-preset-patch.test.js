// host-preset-patch tests: 追加、幂等、回退、拒绝。
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const patch = require('../lib/host-preset-patch.js')

const SHIPPED = [
  '# The `minimal` agent preset.',
  '',
  '- id: persona',
  "  name: '@deepseek-ai/dsh-persona'",
  '  config:',
  '    prefix: You are a helpful software engineer assistant.',
  '    complete: true',
  '',
].join('\n')

/**
 * A shipped preset with the shape that broke the first revert implementation.
 *
 * `SHIPPED` has no run of more than two newlines, so a revert that normalized
 * whitespace passed every assertion. `cordis` really does carry a blank line
 * between two comment paragraphs (byte 685), and that normalization collapsed it
 * — a silent one-byte edit to a deployment file, found only by byte-comparing a
 * real install against the published package.
 */
const SHIPPED_WITH_BLANK_RUN = [
  '# The `cordis` agent preset.',
  '',
  '# A first comment paragraph.',
  '# documentation makes the same statement.',
  '',
  '',
  "# The preset's own persona, shadowing the deployment one.",
  '',
  '- id: persona',
  "  name: '@deepseek-ai/dsh-persona'",
  '  config:',
  '    prefix: You are a helpful software engineer assistant.',
  '',
].join('\n')

/** Build a throwaway DSH-shaped preset root. */
const makeRoot = ({ withPlugin = true, withPresets = ['minimal', 'standard'], body = SHIPPED } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'host-patch-'))
  for (const name of withPresets) {
    fs.mkdirSync(path.join(root, name), { recursive: true })
    fs.writeFileSync(path.join(root, name, 'agent.cordis.yml'), body)
  }
  if (withPlugin) {
    fs.mkdirSync(path.join(root, 'researcher', 'plugins', 'research-entry'), { recursive: true })
    fs.writeFileSync(path.join(root, 'researcher', 'plugins', 'research-entry', 'index.js'), 'module.exports = {}\n')
  }
  return root
}

const read = (root, name) => fs.readFileSync(path.join(root, name, 'agent.cordis.yml'), 'utf8')

test('patch appends exactly one row and leaves the original content byte-identical', (t) => {
  const root = makeRoot()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const manifest = patch.patchHostPresets({ presetDir: root, dshHome: root, apply: true })
  assert.equal(manifest.targets.minimal.action, 'patched')
  assert.equal(manifest.targets.standard.action, 'patched')
  const after = read(root, 'minimal')
  assert.ok(after.startsWith(SHIPPED), 'the original content must be preserved as a prefix')
  assert.ok(patch.isPatched(after))
  assert.match(after, /- id: research-entry/)
  assert.match(after, /plugins\/research-entry\/index\.js/)
  // 一份未打补丁的副本留在旁边
  assert.equal(fs.readFileSync(manifest.targets.minimal.backup, 'utf8'), SHIPPED)
})

test('patch is idempotent', (t) => {
  const root = makeRoot()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  patch.patchHostPresets({ presetDir: root, dshHome: root, apply: true })
  const once = read(root, 'minimal')
  const second = patch.patchHostPresets({ presetDir: root, dshHome: root, apply: true })
  assert.equal(second.targets.minimal.action, 'already-patched')
  assert.equal(read(root, 'minimal'), once, 'a second patch must not change the file')
})

test('revert restores a preset that carries its own run of blank lines, byte for byte', (t) => {
  // 真实事故：第一版 withoutPatch 末尾做了 `.replace(/\n{3,}/gu, '\n\n')`，
  // 把 preset 自身内容里的连续空行压掉了。`cordis` 在第 685 字节就是这样，
  // 于是 revert 静默改动了 DSH 自带文件的一个字节。夹具过去没有这种空行，
  // 所以这条断言当时不可能失败。
  const root = makeRoot({ withPresets: ['minimal'], body: SHIPPED_WITH_BLANK_RUN })
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, 'minimal', 'agent.cordis.yml')
  const before = fs.readFileSync(file)
  const patched = patch.patchHostPresets({ presetDir: root, dshHome: root, apply: true })
  assert.equal(patched.targets.minimal.action, 'patched')
  assert.ok(fs.readFileSync(file, 'utf8').includes(patch.MARKER_BEGIN))
  patch.patchHostPresets({ presetDir: root, dshHome: root, apply: false })
  const after = fs.readFileSync(file)
  assert.deepEqual(after, before, 'a revert must return the exact pre-patch bytes')
  assert.equal(after.length, before.length)
})

test('revert without a backup still removes only the block it added', (t) => {
  // 没有备份时的回退路径也必须是无损的：只摘掉插入的块。
  const root = makeRoot({ withPresets: ['minimal'], body: SHIPPED_WITH_BLANK_RUN })
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, 'minimal', 'agent.cordis.yml')
  const before = fs.readFileSync(file)
  patch.patchHostPresets({ presetDir: root, dshHome: root, apply: true })
  fs.rmSync(file + patch.BACKUP_SUFFIX, { force: true })
  const manifest = patch.patchHostPresets({ presetDir: root, dshHome: root, apply: false })
  assert.equal(manifest.targets.minimal.action, 'reverted')
  assert.equal(manifest.targets.minimal.restoredFromBackup, false, 'the fallback path is the one under test')
  assert.deepEqual(fs.readFileSync(file), before)
})

test('revert prefers the backup over reconstructing the text', (t) => {
  const root = makeRoot({ withPresets: ['minimal'] })
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, 'minimal', 'agent.cordis.yml')
  patch.patchHostPresets({ presetDir: root, dshHome: root, apply: true })
  const manifest = patch.patchHostPresets({ presetDir: root, dshHome: root, apply: false })
  assert.equal(manifest.targets.minimal.restoredFromBackup, true, 'the exact source is preferred when it exists')
  assert.equal(read(root, 'minimal'), SHIPPED)
})

test('revert removes the block and restores the pre-patch bytes', (t) => {
  const root = makeRoot()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const patched = patch.patchHostPresets({ presetDir: root, dshHome: root, apply: true })
  const backup = patched.targets.minimal.backup
  assert.ok(fs.existsSync(backup), 'a backup is taken before patching')
  const manifest = patch.patchHostPresets({ presetDir: root, dshHome: root, apply: false })
  assert.equal(manifest.targets.minimal.action, 'reverted')
  assert.equal(read(root, 'minimal'), SHIPPED)
  assert.equal(manifest.targets.minimal.backupRemoved, true)
  assert.ok(!fs.existsSync(backup), 'uninstall must not leave the backup as litter')
  assert.ok(!fs.existsSync(patched.targets.standard.backup), 'and not for the other target either')
})

test('revert clears a stray backup even when the file carries no patch', (t) => {
  // 上一次被中断的安装可能留下备份而文件已还原；那也是我们的垃圾，要一并带走。
  const root = makeRoot()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const backup = path.join(root, 'minimal', 'agent.cordis.yml' + patch.BACKUP_SUFFIX)
  fs.writeFileSync(backup, SHIPPED)
  const manifest = patch.patchHostPresets({ presetDir: root, dshHome: root, apply: false })
  assert.equal(manifest.targets.minimal.action, 'not-patched')
  assert.equal(manifest.targets.minimal.backupRemoved, true)
  assert.ok(!fs.existsSync(backup))
  assert.equal(read(root, 'minimal'), SHIPPED, 'the file itself is untouched')
})

test('revert is a no-op on an unpatched file', (t) => {
  const root = makeRoot()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const manifest = patch.patchHostPresets({ presetDir: root, dshHome: root, apply: false })
  assert.equal(manifest.targets.minimal.action, 'not-patched')
  assert.equal(read(root, 'minimal'), SHIPPED)
})

test('dry run reports the plan without writing', (t) => {
  const root = makeRoot()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const manifest = patch.patchHostPresets({ presetDir: root, dshHome: root, apply: true, dryRun: true })
  assert.equal(manifest.targets.minimal.action, 'would-patch')
  assert.equal(read(root, 'minimal'), SHIPPED, 'dry run must not touch the file')
  assert.ok(!fs.existsSync(manifest.targets.minimal.backup))
})

test('refuses a file that does not look like a shipped preset', (t) => {
  const root = makeRoot({ withPresets: [] })
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'minimal'), { recursive: true })
  fs.writeFileSync(path.join(root, 'minimal', 'agent.cordis.yml'), 'not: a preset\n')
  const manifest = patch.patchHostPresets({ presetDir: root, dshHome: root, apply: true })
  assert.equal(manifest.targets.minimal.action, 'skipped')
  assert.match(manifest.targets.minimal.reason, /does not look like a shipped preset/)
  assert.equal(read(root, 'minimal'), 'not: a preset\n')
})

test('refuses to patch when the referenced plugin is not installed', (t) => {
  const root = makeRoot({ withPlugin: false })
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const manifest = patch.patchHostPresets({ presetDir: root, dshHome: root, apply: true })
  assert.equal(manifest.targets.minimal.action, 'skipped')
  assert.match(manifest.targets.minimal.reason, /research-entry plugin is not installed/)
  assert.equal(read(root, 'minimal'), SHIPPED)
})

test('a missing preset directory yields an empty manifest rather than a throw', () => {
  assert.deepEqual(patch.patchHostPresets({ presetDir: undefined, dshHome: undefined, apply: true }).targets, {})
  assert.deepEqual(patch.patchHostPresets({ presetDir: path.join(os.tmpdir(), 'definitely-absent-xyz'), dshHome: undefined, apply: true }).targets, {})
})

test('absent individual presets are reported, not invented', (t) => {
  const root = makeRoot({ withPresets: ['minimal'] })
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const manifest = patch.patchHostPresets({ presetDir: root, dshHome: root, apply: true })
  assert.equal(manifest.targets.minimal.action, 'patched')
  assert.equal(manifest.targets.standard.action, 'skipped')
  assert.match(manifest.targets.standard.reason, /preset not present/)
})

test('the row carries an absolute path to the installed plugin', (t) => {
  // 被打补丁的 preset 在 DSH 安装目录，而 researcher preset 在用户 preset 根。
  // 相对路径会解析到安装目录里并不存在的位置，`~` 的展开基准在不同部署下也不一致，
  // 所以行里写绝对路径。
  const root = makeRoot()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const dshHome = path.join(root, 'fake-home')
  const plugin = patch.installedPluginPath(dshHome)
  fs.mkdirSync(path.dirname(plugin), { recursive: true })
  fs.writeFileSync(plugin, 'module.exports = {}\n')

  const manifest = patch.patchHostPresets({ presetDir: root, dshHome, apply: true })
  assert.equal(manifest.targets.minimal.action, 'patched')
  assert.equal(manifest.targets.minimal.pluginPath, plugin)
  const written = read(root, 'minimal')
  // 写入的是绝对路径，且反斜杠被规范化成正斜杠（YAML 与跨平台都安全）
  assert.ok(written.includes(plugin.replace(/\\/gu, '/')), 'the row must carry the resolved absolute path')
  const row = patch.rowBlock(plugin)
  assert.ok(row.includes(patch.MARKER_BEGIN))
  assert.ok(row.includes(patch.MARKER_END))
  assert.match(row, /absolute because/)

  // 同根布局仍作为回退：
  assert.equal(patch.pluginPathFor(root, 'minimal'), path.join(root, 'researcher', 'plugins', 'research-entry', 'index.js'))
  assert.equal(patch.resolveInstalledPlugin(root, 'minimal', dshHome), plugin, 'the DSH home plugin is preferred')
  assert.equal(patch.resolveInstalledPlugin(root, 'minimal', undefined), path.join(root, 'researcher', 'plugins', 'research-entry', 'index.js'))
})
