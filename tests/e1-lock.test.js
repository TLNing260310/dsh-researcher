const test = require('node:test')
const assert = require('node:assert')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const { collectInputs, assertFrozenInputsClean, assertExternalRunLockOutput } = require('../evaluation/goal-governor-e1/lock.js')
const { validateRunLockShape } = require('../evaluation/goal-governor-e1/lib.js')
const { trustedBundle } = require('./helpers/e1-fixtures.js')

const git = (root, args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, String(result.stdout || '') + String(result.stderr || ''))
  return String(result.stdout || '').trim()
}

const fixture = (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshr-e1-lock-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'locked'))
  fs.writeFileSync(path.join(root, 'locked', 'input.txt'), 'frozen input\n')
  fs.writeFileSync(path.join(root, '.gitignore'), 'locked/*.ignored\n')
  git(root, ['init', '--quiet'])
  git(root, ['config', 'user.email', 'tests@example.invalid'])
  git(root, ['config', 'user.name', 'dsh-researcher tests'])
  git(root, ['add', '.'])
  git(root, ['commit', '--quiet', '-m', 'frozen baseline'])
  return { root, manifest: { lock_inputs: ['locked'] } }
}

test('E1 lock inputs are hashed only after their working bytes and index mode match HEAD', (t) => {
  const { root, manifest } = fixture(t)
  const expected = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'locked', 'input.txt'))).digest('hex')
  assert.deepEqual(collectInputs(manifest, root), { 'locked/input.txt': expected })
  assert.doesNotThrow(() => assertFrozenInputsClean(manifest, root))

  git(root, ['update-index', '--chmod=+x', 'locked/input.txt'])
  assert.throws(() => collectInputs(manifest, root), /index blob\/mode differs from HEAD/)
})

test('E1 lock source binding does not trust assume-unchanged', (t) => {
  const { root, manifest } = fixture(t)
  git(root, ['update-index', '--assume-unchanged', 'locked/input.txt'])
  fs.writeFileSync(path.join(root, 'locked', 'input.txt'), 'tampered behind assume-unchanged\n')
  assert.equal(git(root, ['status', '--porcelain=v1', '--', 'locked/input.txt']), '')
  assert.throws(() => collectInputs(manifest, root), /working bytes differ from HEAD blob/)
})

test('E1 lock source binding does not trust skip-worktree', (t) => {
  const { root, manifest } = fixture(t)
  git(root, ['update-index', '--skip-worktree', 'locked/input.txt'])
  fs.writeFileSync(path.join(root, 'locked', 'input.txt'), 'tampered behind skip-worktree\n')
  assert.equal(git(root, ['status', '--porcelain=v1', '--', 'locked/input.txt']), '')
  assert.throws(() => collectInputs(manifest, root), /working bytes differ from HEAD blob/)
})

test('E1 lock source binding rejects ignored files under a declared input', (t) => {
  const { root, manifest } = fixture(t)
  fs.writeFileSync(path.join(root, 'locked', 'payload.ignored'), 'uncommitted executable input\n')
  assert.equal(git(root, ['status', '--porcelain=v1', '--', 'locked']), '')
  assert.throws(() => collectInputs(manifest, root), /untracked or ignored files.*locked\/payload\.ignored/)
})

test('E1 lock source binding rejects staged blobs that differ from HEAD', (t) => {
  const { root, manifest } = fixture(t)
  fs.writeFileSync(path.join(root, 'locked', 'input.txt'), 'staged replacement\n')
  git(root, ['add', 'locked/input.txt'])
  assert.throws(() => collectInputs(manifest, root), /index blob\/mode differs from HEAD/)
})

test('E1 lock source binding ignores Git replace-object aliases', (t) => {
  const { root, manifest } = fixture(t)
  const original = git(root, ['rev-parse', 'HEAD'])
  fs.writeFileSync(path.join(root, 'locked', 'input.txt'), 'replacement commit\n')
  git(root, ['add', 'locked/input.txt'])
  git(root, ['commit', '--quiet', '-m', 'replacement'])
  const replacement = git(root, ['rev-parse', 'HEAD'])
  git(root, ['reset', '--hard', '--quiet', original])
  git(root, ['replace', original, replacement])
  git(root, ['read-tree', '--reset', '-u', replacement])
  assert.equal(git(root, ['status', '--porcelain=v1']), '')
  assert.throws(() => collectInputs(manifest, root), /index blob\/mode differs from HEAD|working bytes differ from HEAD blob/)
})

test('E1 lock source binding does not trust custom Git clean filters', (t) => {
  const { root, manifest } = fixture(t)
  fs.writeFileSync(path.join(root, '.gitattributes'), 'locked/input.txt filter=mask\n')
  git(root, ['add', '.gitattributes'])
  git(root, ['commit', '--quiet', '-m', 'bind filter attribute'])
  fs.writeFileSync(path.join(root, '.git', 'mask-output'), 'frozen input\n')
  git(root, ['config', 'filter.mask.clean', 'cat .git/mask-output'])
  git(root, ['config', 'filter.mask.required', 'true'])
  fs.writeFileSync(path.join(root, 'locked', 'input.txt'), 'evil payload\n')
  assert.equal(git(root, ['status', '--porcelain=v1', '--', 'locked/input.txt']), '')
  assert.throws(() => collectInputs(manifest, root), /raw working bytes differ from HEAD blob/)
})

test('E1 run-lock output is lexically and canonically outside the repository', (t) => {
  const { root } = fixture(t)
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'dshr-e1-lock-output-'))
  t.after(() => fs.rmSync(external, { recursive: true, force: true }))

  const safe = path.join(external, 'new-directory', 'run-lock.json')
  assert.equal(assertExternalRunLockOutput(safe, root), path.resolve(safe))
  assert.throws(() => assertExternalRunLockOutput(path.join(root, 'run-lock.json'), root), /outside the repository/)

  const alias = path.join(external, 'repository-alias')
  let linked = false
  try {
    fs.symlinkSync(root, alias, process.platform === 'win32' ? 'junction' : 'dir')
    linked = true
  } catch (error) {
    assert.ok(['EPERM', 'EACCES', 'UNKNOWN'].includes(error.code), error.message)
  }
  if (linked) {
    assert.throws(
      () => assertExternalRunLockOutput(path.join(alias, 'aliased-run-lock.json'), root),
      /symlink|junction|resolves inside/,
    )
  }
})

const syntheticRunLock = () => JSON.parse(JSON.stringify(trustedBundle().artifacts['simple-done'].run_lock))

test('E1 run-lock accepts the frozen synthetic loopback route', () => {
  const lock = syntheticRunLock()
  assert.equal(lock.model.base_url, 'http://127.0.0.1:11434/v1')
  assert.doesNotThrow(() => validateRunLockShape(lock))
})

test('E1 run-lock accepts only the frozen DeepSeek Flash API identity', () => {
  const lock = syntheticRunLock()
  lock.model = {
    route: 'deepseek-api',
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
    reasoning_effort: 'low',
    base_url: 'https://api.deepseek.com',
  }
  assert.doesNotThrow(() => validateRunLockShape(lock))

  lock.model.model = 'deepseek-v4-pro'
  assert.throws(() => validateRunLockShape(lock), /flash|remote execution|cost policy/i)
})

test('E1 run-lock rejects a local route whose resolved adapter base_url is not loopback', () => {
  const lock = syntheticRunLock()
  lock.model.base_url = 'https://api.deepseek.com'
  assert.throws(() => validateRunLockShape(lock), /loopback|base_url|cost policy/i)
})

test('E1 run-lock rejects endpoint aliases and a non-DeepSeek local provider', () => {
  const lock = syntheticRunLock()
  lock.model.endpoint = lock.model.base_url
  assert.throws(() => validateRunLockShape(lock), /exactly.*base_url|run-lock model/i)
  delete lock.model.endpoint
  lock.model.provider = 'local'
  assert.throws(() => validateRunLockShape(lock), /official DeepSeek adapter|provider/i)
})

test('E1 run-lock rejects a cost policy that drifts from protocol v1.6', () => {
  const lock = syntheticRunLock()
  lock.cost_policy.restricted_windows[0].end = '12:01'
  assert.throws(() => validateRunLockShape(lock), /cost policy|restricted_windows|12:00/i)
})
