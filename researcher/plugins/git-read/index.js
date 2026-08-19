// git_read — read-only git forensics with a fixed allowlist, no shell (v1.1).
//
// This replaces the general pwsh shell for the researcher preset. The model
// no longer receives an arbitrary process-execution primitive at all: the
// only subprocess capability left is `git` invoked through Node's execFile
// with a FIXED argv vector per action — never a shell, never `-c`, never
// alias expansion (only built-in subcommands are callable), never external
// diff or textconv filters, never a pager, never config injection from
// system/global config files.
//
// v1.1 (v0.4.3) closes the option-injection class of holes: model-controlled
// values can no longer smuggle git OPTIONS into argv.
//   - Every revision argument is validated: no leading `-` (kills
//     `--output=…`-style option injection), no NUL/newline/CR, length cap.
//   - Every path is validated: no leading `-`, resolved against the repo cwd
//     and confined inside it (no `../../outside` reads).
//   - Paths are always separated with `--` so they are positional, never
//     options (hash-object included: `-w` can no longer be smuggled).
//   - Fixed argv literals only: no `-c`, no `-C`, no config mutation vectors.
//
// Environment scrubbing: GIT_CONFIG_NOSYSTEM=1, GIT_CONFIG_GLOBAL points at a
// nonexistent file, GIT_PAGER empty, GIT_EXTERNAL_DIFF empty, plus
// --no-pager on every invocation. Output is capped; the process is killed on
// timeout (30s) and the result reports the kill.
//
// Zero-write contract: every action is a read; nothing here can modify the
// repository, the index, the object database, or any file.

const { execFile } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')

const ACTIONS = ['status', 'log', 'show', 'diff', 'ls-files', 'blame', 'rev-parse', 'hash-object']
const MAX_OUTPUT = 20000
const TIMEOUT_MS = 30000
const MAX_REF_LENGTH = 256

const assertSafeRef = (ref) => {
  if (typeof ref !== 'string') throw new Error('git_read: ref must be a string')
  if (ref.length === 0 || ref.length > MAX_REF_LENGTH) throw new Error('git_read: ref length must be 1..' + MAX_REF_LENGTH)
  if (ref.startsWith('-')) throw new Error('git_read: ref must not start with "-" (option injection rejected)')
  if (ref.includes('\0') || ref.includes('\n') || ref.includes('\r')) throw new Error('git_read: ref contains control characters')
  return ref
}

// Confine a model-controlled path to the repository root.
const confinePath = (cwd, filePath) => {
  if (typeof filePath !== 'string' || filePath.length === 0) throw new Error('git_read: path must be a non-empty string')
  if (filePath.startsWith('-')) throw new Error('git_read: path must not start with "-" (option injection rejected)')
  if (filePath.includes('\0') || filePath.includes('\n') || filePath.includes('\r')) throw new Error('git_read: path contains control characters')
  const root = path.resolve(cwd)
  const abs = path.resolve(root, filePath)
  const rel = path.relative(root, abs)
  // Normalize separators so escape attempts are rejected on EVERY platform:
  // a backslash-style traversal must not slip through on POSIX (and vice
  // versa — uniform defense, not platform-dependent).
  const norm = rel.split(path.sep).join('/')
  if (norm === '..' || norm.startsWith('../') || path.isAbsolute(rel)) {
    throw new Error('git_read: path escapes the repository root')
  }
  return abs
}

const buildArgv = (args, cwd) => {
  if (!ACTIONS.includes(args.action)) throw new Error('git_read: unknown action "' + String(args.action) + '"')
  const ref = args.ref !== undefined && args.ref !== null && args.ref !== '' ? assertSafeRef(args.ref) : undefined
  const filePath = args.path !== undefined && args.path !== null && args.path !== '' ? confinePath(cwd, args.path) : undefined
  const maxCount = Number.isInteger(args.maxCount) && args.maxCount > 0 ? Math.min(args.maxCount, 500) : 50
  switch (args.action) {
    case 'status': {
      const argv = ['status', '--porcelain=v1']
      if (filePath) argv.push('--', filePath)
      return argv
    }
    case 'log': {
      const argv = ['log', '--no-textconv', '--no-ext-diff', '--max-count=' + maxCount, '--format=%h %ad %an %s', '--date=short']
      if (ref) argv.push(ref)
      if (filePath) argv.push('--', filePath)
      return argv
    }
    case 'show': {
      const argv = ['show', '--no-textconv', '--no-ext-diff']
      argv.push(ref || 'HEAD')
      if (filePath) argv.push('--', filePath)
      return argv
    }
    case 'diff': {
      const argv = ['diff', '--no-textconv', '--no-ext-diff']
      if (ref) argv.push(ref)
      if (filePath) argv.push('--', filePath)
      return argv
    }
    case 'ls-files': {
      const argv = ['ls-files']
      if (filePath) argv.push('--', filePath)
      return argv
    }
    case 'blame': {
      if (!filePath) throw new Error('git_read: blame requires path')
      const argv = ['blame', '--no-textconv', '--date=short']
      if (ref) argv.push(ref)
      argv.push('--', filePath)
      return argv
    }
    case 'rev-parse': {
      return ['rev-parse', ref || 'HEAD']
    }
    case 'hash-object': {
      if (!filePath) throw new Error('git_read: hash-object requires path')
      // `--` forces positional interpretation: `-w` can never become an option.
      return ['hash-object', '--', filePath]
    }
    default:
      throw new Error('git_read: unknown action "' + String(args.action) + '"')
  }
}

const runGit = (cwd, argv) => new Promise((resolve) => {
  execFile('git', argv, {
    cwd,
    timeout: TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: path.join(os.tmpdir(), 'dsh-researcher-no-global-gitconfig'),
      GIT_PAGER: '',
      GIT_EXTERNAL_DIFF: '',
    },
  }, (error, stdout, stderr) => {
    let code = 0
    let message
    let killed = false
    if (error) {
      if (typeof error.code === 'number') {
        code = error.code
        killed = !!error.killed
      } else {
        code = -1
        message = error.message
      }
    }
    resolve({
      code,
      killed,
      stdout: String(stdout || ''),
      stderr: String(stderr || '').slice(0, 2000),
      message,
    })
  })
})

module.exports = {
  name: 'git-read',
  inject: ['tools'],
  apply(ctx) {
    const definition = {
      name: 'git_read',
      description: 'Read-only git forensics with a fixed allowlist: status / log / show / diff / ls-files / blame / rev-parse / hash-object. No shell, no -c, no aliases, no external diff or textconv, no pager, system/global gitconfig ignored, 30s timeout, output capped. Model-controlled revisions and paths are strictly validated (no leading "-", no control characters, paths confined to the repository). This is the ONLY subprocess capability of this preset — there is no general shell. Every action is a read; nothing can modify the repository.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ACTIONS },
          ref: { type: 'string', description: 'Commit/tag/branch (log/show/diff/blame/rev-parse); default HEAD where applicable. Must not start with "-".' },
          path: { type: 'string', description: 'Pathspec inside the repository; required for blame and hash-object.' },
          maxCount: { type: 'integer', description: 'log entries, 1..500, default 50.' },
        },
        required: ['action'],
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args, exec) {
        let cwd = process.cwd()
        try {
          const header = exec && exec.agent && exec.agent.session && exec.agent.session.header
          if (header && typeof header.cwd === 'string' && header.cwd.length > 0) cwd = header.cwd
        } catch (error) {
          // fall back to process.cwd()
        }
        let argv
        try {
          argv = buildArgv(args, cwd)
        } catch (error) {
          return 'git_read: ' + (error && error.message ? error.message : String(error))
        }
        const result = await runGit(cwd, ['--no-pager', ...argv])
        let stdout = result.stdout
        let truncated = false
        if (stdout.length > MAX_OUTPUT) {
          stdout = stdout.slice(0, MAX_OUTPUT)
          truncated = true
        }
        return JSON.stringify({
          action: args.action,
          code: result.code,
          killed: result.killed,
          stdout,
          stderr: result.stderr,
          message: result.message,
          truncated,
        })
      },
    }

    ctx.tools.register(definition)
  },
  // Test hooks: the argument builder is pure; unit tests exercise the
  // injection guards directly.
  __test: { buildArgv, assertSafeRef, confinePath },
}
