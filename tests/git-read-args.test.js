// git_read argument-boundary tests: the option-injection class must be dead.
const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { __test } = require('../researcher/plugins/git-read/index.js')
const { buildArgv, assertSafeRef, confinePath } = __test

const CWD = path.resolve('/repo/root')

test('ref option injection is rejected', () => {
  for (const evil of ['--output=/tmp/x.txt', '-c', '--no-textconv', '-w']) {
    assert.throws(() => buildArgv({ action: 'diff', ref: evil }, CWD), /must not start with "-"/)
    assert.throws(() => buildArgv({ action: 'log', ref: evil }, CWD), /must not start with "-"/)
    assert.throws(() => buildArgv({ action: 'show', ref: evil }, CWD), /must not start with "-"/)
  }
})

test('path option injection is rejected and paths are positional', () => {
  assert.throws(() => buildArgv({ action: 'hash-object', path: '-w' }, CWD), /must not start with "-"/)
  const argv = buildArgv({ action: 'hash-object', path: 'src/a.ts' }, CWD)
  assert.deepEqual(argv, ['hash-object', '--', path.resolve(CWD, 'src/a.ts')])
})

test('path escaping the repository is rejected', () => {
  assert.throws(() => buildArgv({ action: 'hash-object', path: '../../outside.txt' }, CWD), /escapes the repository/)
  assert.throws(() => buildArgv({ action: 'blame', path: '..\\outside.txt' }, CWD), /escapes the repository/)
})

test('control characters are rejected in ref and path', () => {
  assert.throws(() => assertSafeRef('HEAD\n--output=x'), /control characters/)
  assert.throws(() => confinePath(CWD, 'src\0x.ts'), /control characters/)
})

test('legitimate refs and confined paths still build valid argv', () => {
  assert.deepEqual(buildArgv({ action: 'rev-parse', ref: 'HEAD~3' }, CWD), ['rev-parse', 'HEAD~3'])
  const diff = buildArgv({ action: 'diff', ref: 'HEAD~3', path: 'src/foo.ts' }, CWD)
  assert.deepEqual(diff, ['diff', '--no-textconv', '--no-ext-diff', 'HEAD~3', '--', path.resolve(CWD, 'src/foo.ts')])
  const inside = confinePath(CWD, 'src/sub/../foo.ts')
  assert.equal(inside, path.resolve(CWD, 'src/foo.ts'))
})
