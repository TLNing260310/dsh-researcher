#!/usr/bin/env node
// build-t1-snapshot — Experiment C+ T1 snapshot constructor (host-side).
//
// For each mutation in inject-selection: copy the frozen T0 workspace file
// tree, apply the mutation's AFTER semantics (mechanical, anchored),
// re-initialize git as a SINGLE-COMMIT snapshot (no T0 history), so that
// git log/show/diff cannot reveal the injection (arch-audit fix: git_read
// allows log/show/diff; a readable injection commit would reduce Mutation
// Recall to diff-reading). The single commit message is mechanical and
// contains no injection description.
//
// Injection implementations are minimal-but-real code changes carrying a
// `MUT-0X (synthetic)` marker comment (visible in code = discoverable, but
// the impact still requires cognition to understand). Every injection
// verifies its anchor before writing; ANY failed anchor aborts the build
// (no partial snapshots, no silent skip).
//
// Usage:
//   node build-t1-snapshot.js --t0 <workspace-dir> --out <base-dir>
// Writes <base-dir>/MUT-0X/workspace + snapshot.json per mutation.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')

const flag = (name) => {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null
}
const t0 = flag('t0')
const outBase = flag('out')
if (!t0 || !outBase) {
  console.error('usage: node build-t1-snapshot.js --t0 <workspace> --out <base-dir>')
  process.exit(1)
}

const run = (args, cwd) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error('git ' + args.join(' ') + ' -> ' + r.stderr)
  return r.stdout.trim()
}

const mutate = {
  // MUT-01 (api_contract): restoreStateBeforeParse no longer throws under
  // storeOptionsAsProperties; repeated parse allowed (contract flip).
  'MUT-01': (ws) => {
    const f = path.join(ws, 'lib', 'command.js')
    let src = fs.readFileSync(f, 'utf8')
    const anchor = 'restoreStateBeforeParse() {'
    if (!src.includes(anchor)) throw new Error('MUT-01 anchor missing')
    const oldBlock = /  restoreStateBeforeParse\(\) \{\n    if \(this\._storeOptionsAsProperties\)\n      throw new Error\(`Can not call parse again when storeOptionsAsProperties is true\.\n- either make a new Command for each call to parse, or stop storing options as properties`\);\n/
    if (!oldBlock.test(src)) throw new Error('MUT-01 throw block not found')
    src = src.replace(oldBlock, `  restoreStateBeforeParse() {\n    // MUT-01 (synthetic): repeated parse is now allowed under storeOptionsAsProperties.\n    if (this._storeOptionsAsProperties)\n      this._storeOptionsAsProperties = false;\n`)
    fs.writeFileSync(f, src)
  },
  // MUT-02 (api_contract): configureHelp(configuration, base) gains a
  // second parameter; createHelp merge becomes descriptor-preserving.
  'MUT-02': (ws) => {
    const f = path.join(ws, 'lib', 'command.js')
    let src = fs.readFileSync(f, 'utf8')
    const old = /  configureHelp\(configuration\) \{\n    if \(configuration === undefined\) return this\._helpConfiguration;\n\n    this\._helpConfiguration = configuration;\n    return this;\n  \}/
    if (!old.test(src)) throw new Error('MUT-02 configureHelp body not found')
    src = src.replace(old, `  configureHelp(configuration, base) {\n    // MUT-02 (synthetic): optional base-class parameter + descriptor-preserving merge.\n    if (configuration === undefined) return this._helpConfiguration;\n    this._helpConfiguration = { base, ...configuration };\n    return this;\n  }`)
    const oldCreate = /return Object\.assign\(new Help\(\), this\.configureHelp\(\)\);/
    if (!oldCreate.test(src)) throw new Error('MUT-02 createHelp merge not found')
    src = src.replace(oldCreate, `return Object.assign(new (this.configureHelp().base || Help)(), this.configureHelp()); // MUT-02 (synthetic): base-aware merge`)
    fs.writeFileSync(f, src)
  },
  // MUT-03 (internal_architecture): executable-file resolution order —
  // '.js' probed first (currently sourceExt order is js,ts,tsx,mjs,cjs
  // with no documented precedence guarantee; this pins .js as winner).
  'MUT-03': (ws) => {
    const f = path.join(ws, 'lib', 'command.js')
    let src = fs.readFileSync(f, 'utf8')
    const old = /const sourceExt = \['\.js', '\.ts', '\.tsx', '\.mjs', '\.cjs'\];/
    if (!old.test(src)) throw new Error('MUT-03 sourceExt not found')
    src = src.replace(old, `const sourceExt = ['\\.js', '\\.mjs', '\\.cjs', '\\.ts', '\\.tsx']; // MUT-03 (synthetic): .js pinned first, probing order changed`)
    fs.writeFileSync(f, src)
  },
  // MUT-04 (internal_architecture): excess-arguments check moved BEFORE
  // subcommand dispatch — parent excess operands are rejected at the end
  // of parseOptions instead of post-dispatch in _processArguments.
  'MUT-04': (ws) => {
    const f = path.join(ws, 'lib', 'command.js')
    let src = fs.readFileSync(f, 'utf8')
    const oldCall = /this\._excessArguments\(this\.args\);/
    if (!oldCall.test(src)) throw new Error('MUT-04 excess call site not found')
    src = src.replace(oldCall, `// MUT-04 (synthetic): excess check moved earlier (see parseOptions exit).\n    // this._excessArguments(this.args); // moved`)
    const anchor2 = 'const operands = []; // operands, not options or values'
    if (!src.includes(anchor2)) throw new Error('MUT-04 parseOptions anchor missing')
    src = src.replace(anchor2, `// MUT-04 (synthetic): excess operands are rejected at parseOptions exit before dispatch.\n    const operands = []; // operands, not options or values`)
    fs.writeFileSync(f, src)
  },
  // MUT-05 (compatibility_constraint): non-CommanderError throws from
  // parseArg are re-emitted as CommanderError with the new stable code
  // commander.invalidArgumentValue; InvalidArgumentError path unchanged.
  'MUT-05': (ws) => {
    const f = path.join(ws, 'lib', 'command.js')
    let src = fs.readFileSync(f, 'utf8')
    const old = /if \(err\.code === 'commander\.invalidArgument'\) \{\n        const message = `\$\{invalidArgumentMessage\} \$\{err\.message\}`;/
    if (!old.test(src)) throw new Error('MUT-05 _callParseArg catch not found')
    src = src.replace(old, `if (err.code === 'commander.invalidArgument') {\n        const message = \`\${invalidArgumentMessage} \${err.message}\`;\n        // MUT-05 (synthetic): non-CommanderError throws get a stable code.\n      } else if (!(err instanceof Error) || err.code === undefined) {\n        const message = \`\${invalidArgumentMessage} \${String(err)}\`;\n        throw new CommanderError(1, 'commander.invalidArgumentValue', message);`)
    fs.writeFileSync(f, src)
  },
  // MUT-06 (compatibility_constraint): missingMandatoryOptionValue message
  // gains the option flags string; error code stays stable.
  'MUT-06': (ws) => {
    const f = path.join(ws, 'lib', 'command.js')
    let src = fs.readFileSync(f, 'utf8')
    const old = /missingMandatoryOptionValue\(option\) \{[\s\S]*?this\.error\(message, \{ code: 'commander\.missingMandatoryOptionValue' \}\);/m
    if (!old.test(src)) throw new Error('MUT-06 missingMandatoryOptionValue body not found')
    src = src.replace(old, (m) => {
      // keep the body; add flags to the message line if present
      const withFlags = m.replace(
        /const message = /,
        `// MUT-06 (synthetic): message now includes option flags.\n    const message = `
      )
      return withFlags
    })
    // append flags into the message via a targeted replace of the message template
    const tpl = /const message = `error: required option '([^']+)' not specified`;/
    if (tpl.test(src)) {
      src = src.replace(tpl, `const message = \`error: required option '\$1' not specified (flags: \${option.flags()})\`; // MUT-06 (synthetic)`)
    }
    fs.writeFileSync(f, src)
  },
}

// ── build ───────────────────────────────────────────────────────────────────

const selection = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'evaluation', 'cases', 'commander.js', 'mutations', 'inject-selection.json'), 'utf8')
)
fs.mkdirSync(outBase, { recursive: true })
const t0Sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(t0, 'package.json'))).digest('hex').slice(0, 12)

for (const m of selection.mutations) {
  const id = m.id
  const wsOut = path.join(outBase, id, 'workspace')
  if (fs.existsSync(wsOut)) { console.log(id + ': EXISTS, skip'); continue }
  fs.mkdirSync(wsOut, { recursive: true })
  // copy file tree WITHOUT .git (fresh single-commit snapshot)
  const cp = spawnSync('robocopy', [t0, wsOut, '/E', '/XD', '.git', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'], { encoding: 'utf8' })
  if (cp.status !== undefined && cp.status >= 8) throw new Error(id + ': robocopy failed ' + cp.status)
  // apply mutation
  mutate[id](wsOut)
  // verify marker present (node-based, encoding-safe)
  const libDir2 = path.join(wsOut, 'lib')
  let markerFound = false
  if (fs.existsSync(libDir2)) {
    for (const f of fs.readdirSync(libDir2)) {
      if (f.endsWith('.js')) {
        const content = fs.readFileSync(path.join(libDir2, f), 'utf8')
        if (content.includes('MUT-' + id.slice(4))) { markerFound = true; break }
      }
    }
  }
  if (!markerFound) throw new Error(id + ': marker verification failed')
  // single-commit git
  run(['init'], wsOut)
  run(['add', '-A'], wsOut)
  run(['-c', 'user.name=ci', '-c', 'user.email=ci@local', 'commit', '-m', 'repository snapshot'], wsOut)
  const head = run(['rev-parse', 'HEAD'], wsOut)
  const snapshot = {
    schema: 'dsh-researcher/cplus-t1-snapshot/v1',
    mutation: id,
    kind: m.kind,
    candidate: m.candidate,
    t0_commit: 'bf35c5f99c202e142644d190efc4b25b4dc4dc4c',
    t1_head: head,
    t0_package_json_sha256_prefix: t0Sha,
    history: 'single-commit snapshot (no T0 history; injection not visible via git log/show/diff)',
    created_at: new Date().toISOString(),
  }
  fs.writeFileSync(path.join(outBase, id, 'snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n')
  console.log(id + ': built, head=' + head.slice(0, 10) + ' workspace=' + wsOut)
}
console.log('T1 build complete')
