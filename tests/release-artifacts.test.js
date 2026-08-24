const test = require('node:test')
const assert = require('node:assert')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const pkg = require('../package.json')
const { REQUIRED_PACKAGE_FILES, inspectGitSource, createHeadSnapshot } = require('../scripts/build-release-artifacts.js')
const script = path.join(root, 'scripts', 'build-release-artifacts.js')

const sha = (algorithm, bytes, encoding = 'hex') => crypto.createHash(algorithm).update(bytes).digest(encoding)
const run = (args) => spawnSync(process.execPath, [script, ...args], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
})

const git = (root, args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  return result.stdout.trim()
}

const sourceFixture = (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dshr-release-source-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  fs.writeFileSync(path.join(directory, 'input.txt'), 'committed\n')
  git(directory, ['init', '--quiet'])
  git(directory, ['config', 'user.email', 'tests@example.invalid'])
  git(directory, ['config', 'user.name', 'dsh-researcher tests'])
  git(directory, ['add', '.'])
  git(directory, ['commit', '--quiet', '-m', 'baseline'])
  return directory
}

test('release source inspection does not trust assume-unchanged or skip-worktree', async (t) => {
  for (const flag of ['--assume-unchanged', '--skip-worktree']) {
    await t.test(flag, (inner) => {
      const directory = sourceFixture(inner)
      assert.equal(inspectGitSource(directory).clean, true)
      git(directory, ['update-index', flag, 'input.txt'])
      fs.writeFileSync(path.join(directory, 'input.txt'), 'hidden working-tree drift\n')
      assert.equal(git(directory, ['status', '--porcelain=v1']), '')
      const inspected = inspectGitSource(directory)
      assert.equal(inspected.clean, false)
      assert.match(inspected.integrityError, /working bytes differ from HEAD blob/)
    })
  }
})

test('HEAD package snapshot excludes ignored untracked package-control files', (t) => {
  const directory = sourceFixture(t)
  const exclude = path.join(directory, '.git', 'info', 'exclude')
  fs.appendFileSync(exclude, '\n.npmignore\nhidden.txt\n')
  fs.writeFileSync(path.join(directory, '.npmignore'), 'input.txt\n')
  fs.writeFileSync(path.join(directory, 'hidden.txt'), 'not revision-bound\n')
  const inspected = inspectGitSource(directory)
  assert.equal(inspected.clean, true)

  const snapshot = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dshr-head-snapshot-')), 'source')
  t.after(() => fs.rmSync(path.dirname(snapshot), { recursive: true, force: true }))
  createHeadSnapshot(directory, snapshot, inspected.headEntries)
  assert.equal(fs.readFileSync(path.join(snapshot, 'input.txt'), 'utf8'), 'committed\n')
  assert.equal(fs.existsSync(path.join(snapshot, '.npmignore')), false)
  assert.equal(fs.existsSync(path.join(snapshot, 'hidden.txt')), false)
})

test('release source inspection accepts only a CRLF checkout representation of an LF blob', (t) => {
  const directory = sourceFixture(t)
  fs.writeFileSync(path.join(directory, '.gitattributes'), 'input.txt text eol=lf\n')
  git(directory, ['add', '.gitattributes'])
  git(directory, ['commit', '--quiet', '-m', 'declare text normalization'])
  git(directory, ['update-index', '--assume-unchanged', 'input.txt'])
  fs.writeFileSync(path.join(directory, 'input.txt'), 'committed\r\n')
  assert.equal(git(directory, ['status', '--porcelain=v1', '--', 'input.txt']), '')
  assert.equal(inspectGitSource(directory).clean, true)

  fs.writeFileSync(path.join(directory, 'input.txt'), 'changed\r\n')
  const inspected = inspectGitSource(directory)
  assert.equal(inspected.clean, false)
  assert.match(inspected.integrityError, /working bytes differ from HEAD blob/)
})

test('release source inspection ignores Git replace-object aliases', (t) => {
  const directory = sourceFixture(t)
  const original = git(directory, ['rev-parse', 'HEAD'])
  fs.writeFileSync(path.join(directory, 'input.txt'), 'replacement commit\n')
  git(directory, ['add', 'input.txt'])
  git(directory, ['commit', '--quiet', '-m', 'replacement'])
  const replacement = git(directory, ['rev-parse', 'HEAD'])
  git(directory, ['reset', '--hard', '--quiet', original])
  git(directory, ['replace', original, replacement])
  git(directory, ['read-tree', '--reset', '-u', replacement])
  assert.equal(git(directory, ['status', '--porcelain=v1']), '')
  const inspected = inspectGitSource(directory)
  assert.equal(inspected.revision, original)
  assert.equal(inspected.clean, false)
})

test('release source inspection does not trust custom Git clean filters', (t) => {
  const directory = sourceFixture(t)
  fs.writeFileSync(path.join(directory, '.gitattributes'), 'input.txt filter=mask\n')
  git(directory, ['add', '.gitattributes'])
  git(directory, ['commit', '--quiet', '-m', 'bind filter attribute'])
  fs.writeFileSync(path.join(directory, '.git', 'mask-output'), 'committed\n')
  git(directory, ['config', 'filter.mask.clean', 'cat .git/mask-output'])
  git(directory, ['config', 'filter.mask.required', 'true'])
  fs.writeFileSync(path.join(directory, 'input.txt'), 'malicious\n')
  assert.equal(git(directory, ['status', '--porcelain=v1', '--', 'input.txt']), '')
  const inspected = inspectGitSource(directory)
  assert.equal(inspected.clean, false)
  assert.match(inspected.integrityError, /raw working bytes differ from HEAD blob/)
})

test('release artifact builder emits a self-consistent offline package bundle', { timeout: 120000 }, (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dshr-release-test-'))
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
  const out = path.join(temp, 'out')

  const result = run(['--out', out, '--expected-version', pkg.version])
  assert.equal(result.status, 0, result.stdout + result.stderr)

  const names = fs.readdirSync(out).sort()
  const tarballName = `dsh-researcher-${pkg.version}.tgz`
  assert.deepEqual(names, ['SHA256SUMS', tarballName, 'package-manifest.json'].sort())

  const tarballBytes = fs.readFileSync(path.join(out, tarballName))
  const manifestBytes = fs.readFileSync(path.join(out, 'package-manifest.json'))
  const manifest = JSON.parse(manifestBytes)
  assert.equal(manifest.schema, 'dsh-researcher/release-package-manifest/v1')
  assert.match(manifest.source.git_revision, /^[a-f0-9]{40,64}$/)
  assert.equal(typeof manifest.source.worktree_clean, 'boolean')
  assert.equal(manifest.package.name, pkg.name)
  assert.equal(manifest.package.version, pkg.version)
  assert.equal(manifest.package.filename, tarballName)
  assert.equal(manifest.package.size, tarballBytes.length)
  assert.equal(manifest.package.entry_count, manifest.files.length)
  assert.equal(manifest.package.sha256, sha('sha256', tarballBytes))
  assert.equal(manifest.package.npm_shasum_sha1, sha('sha1', tarballBytes))
  assert.equal(manifest.package.npm_integrity_sha512, 'sha512-' + sha('sha512', tarballBytes, 'base64'))

  const packagedPaths = manifest.files.map((entry) => entry.path)
  for (const required of REQUIRED_PACKAGE_FILES) assert.ok(packagedPaths.includes(required), required)
  assert.equal(packagedPaths.some((entry) => entry === 'evaluation/runs' || entry.startsWith('evaluation/runs/')), false)

  const checksumLines = fs.readFileSync(path.join(out, 'SHA256SUMS'), 'utf8').trim().split(/\r?\n/)
  assert.deepEqual(checksumLines, [
    sha('sha256', tarballBytes) + ' *' + tarballName,
    sha('sha256', manifestBytes) + ' *package-manifest.json',
  ])
})

test('release artifact builder fails closed on version drift and unsafe outputs', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dshr-release-reject-'))
  try {
    const mismatch = path.join(temp, 'mismatch')
    const mismatchResult = run(['--out', mismatch, '--expected-version', '0.0.0-wrong'])
    assert.notEqual(mismatchResult.status, 0)
    assert.match(mismatchResult.stderr, /does not match package\.json version/)
    assert.equal(fs.existsSync(mismatch), false)

    const insideRepository = path.join(root, '.release-artifacts-test')
    const insideResult = run(['--out', insideRepository, '--expected-version', pkg.version])
    assert.notEqual(insideResult.status, 0)
    assert.match(insideResult.stderr, /outside the repository/)
    assert.equal(fs.existsSync(insideRepository), false)

    const nonempty = path.join(temp, 'nonempty')
    fs.mkdirSync(nonempty)
    fs.writeFileSync(path.join(nonempty, 'keep.txt'), 'keep')
    const nonemptyResult = run(['--out', nonempty, '--expected-version', pkg.version])
    assert.notEqual(nonemptyResult.status, 0)
    assert.match(nonemptyResult.stderr, /must be empty/)
    assert.equal(fs.readFileSync(path.join(nonempty, 'keep.txt'), 'utf8'), 'keep')

    const wrongRevision = path.join(temp, 'wrong-revision')
    const revisionResult = run(['--out', wrongRevision, '--expected-version', pkg.version, '--expected-revision', '0'.repeat(40)])
    assert.notEqual(revisionResult.status, 0)
    assert.match(revisionResult.stderr, /does not match git HEAD/)

    const insideTarget = path.join(root, `.release-output-target-${process.pid}`)
    const alias = path.join(temp, 'output-alias')
    fs.mkdirSync(insideTarget)
    try {
      try { fs.symlinkSync(insideTarget, alias, process.platform === 'win32' ? 'junction' : 'dir') } catch (error) {
        assert.ok(['EPERM', 'EACCES', 'UNKNOWN'].includes(error.code), error.message)
      }
      if (fs.existsSync(alias)) {
        const aliasResult = run(['--out', alias, '--expected-version', pkg.version])
        assert.notEqual(aliasResult.status, 0)
        assert.match(aliasResult.stderr, /symlink|junction|resolves inside/)
      }
    } finally {
      if (fs.existsSync(alias)) fs.unlinkSync(alias)
      fs.rmSync(insideTarget, { recursive: true, force: true })
    }


    const externalTarget = path.join(temp, 'external-target')
    const externalAlias = path.join(temp, 'external-alias')
    fs.mkdirSync(externalTarget)
    try {
      try { fs.symlinkSync(externalTarget, externalAlias, process.platform === 'win32' ? 'junction' : 'dir') } catch (error) {
        if (['EPERM', 'EACCES', 'ENOTSUP', 'UNKNOWN'].includes(error.code)) {
          t.diagnostic('directory-link creation is unavailable on this host')
        } else throw error
      }
      if (fs.existsSync(externalAlias)) {
        const aliasedExternalResult = run(['--out', path.join(externalAlias, 'nested'), '--expected-version', pkg.version])
        assert.notEqual(aliasedExternalResult.status, 0)
        assert.match(aliasedExternalResult.stderr, /symlink|junction/)
        assert.equal(fs.existsSync(path.join(externalTarget, 'nested')), false)
      }
    } finally {
      if (fs.existsSync(externalAlias)) fs.unlinkSync(externalAlias)
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
})
