#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const {
  DRAFT_STATE_SCHEMA, createEmptyState, validateState, sealState, diffStates, evaluateFreshness, renderMarkdown,
} = require('../lib/cognition-core/index.js')
const {
  validateGoalContract, approveContract, prepareRevision, validateObservation, recommendMode, renderGoalContractMarkdown, renderGoalStatusMarkdown,
  validateGoalEvent, decideGoal, validateAdapterManifest, EVENT_SCHEMA,
} = require('../lib/goal-core/index.js')
const { validateRegistry, sealRegistry } = require('../lib/verifier-core/index.js')

const usage = () => `project-cognition

  init [root]
  doctor [root]
  cognition validate [state-file]
  cognition draft [root] --out <draft-state.json>
  cognition diff <draft-or-sealed.json> [--root <root>]
  cognition seal <draft-state.json> [--out <sealed-state.json>]
  cognition install <sealed-state.json> --root <root> --replace --expect-current-hash <sha256>
  cognition render [root]
  cognition freshness <fingerprints.json> [root]
  verifier validate <registry.json>
  verifier seal <draft-registry.json>
  verifier install <draft-or-sealed.json> [--root <root>] [--replace]
  goal validate <contract.json>
  goal recommend <risk.json>
  goal approve <draft.json> --actor <name> [--root <root>]
  goal show <contract.json> [--format json|markdown]
  goal observe <observation.json>
  goal decide|status <contract.json> <events.json|events.jsonl> [--format json|markdown]
  goal revise <approved.json> <next-draft.json>
  goal cancel <approved.json> [--sequence <n>]
  adapter doctor <manifest.json>

JSON is written to stdout. Diagnostics and errors use stderr.`

const args = process.argv.slice(2)
const flagValue = (name) => {
  const indexes = args.map((value, index) => value === name ? index : -1).filter((index) => index >= 0)
  if (indexes.length === 0) return undefined
  if (indexes.length > 1) throw new Error('duplicate argument: ' + name)
  const value = args[indexes[0] + 1]
  if (!value || value.startsWith('--')) throw new Error(name + ' requires a value')
  return value
}
const outputFormat = () => {
  const format = flagValue('--format') || 'json'
  if (!['json', 'markdown'].includes(format)) throw new Error('--format must be json or markdown')
  return format
}
const positional = args.filter((value, index) => !value.startsWith('--') && (index === 0 || !args[index - 1].startsWith('--')))

const readJson = (file) => JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'))
const canonicalExisting = (value) => {
  try { return fs.realpathSync.native ? fs.realpathSync.native(value) : fs.realpathSync(value) } catch (error) { return path.resolve(value) }
}
const canonicalWithMissingTail = (value) => {
  let cursor = path.resolve(value)
  const missing = []
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor)
    if (parent === cursor) break
    missing.unshift(path.basename(cursor))
    cursor = parent
  }
  return path.resolve(canonicalExisting(cursor), ...missing)
}
const isWithin = (root, target) => {
  const relative = path.relative(root, target)
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
}
const readEvents = (file) => {
  const raw = fs.readFileSync(path.resolve(file), 'utf8').trim()
  if (raw.length === 0) return []
  if (raw.startsWith('[')) return JSON.parse(raw)
  return raw.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line) } catch (error) { throw new Error('invalid JSONL event at line ' + (index + 1) + ': ' + error.message) }
  })
}
const assertWithin = (root, target) => {
  const lexicalRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)
  if (isWithin(lexicalRoot, resolvedTarget) && isWithin(canonicalExisting(lexicalRoot), canonicalWithMissingTail(resolvedTarget))) return resolvedTarget
  throw new Error('refusing path outside project root: ' + resolvedTarget)
}
const pathsFor = (rootArg) => {
  const root = path.resolve(rootArg || process.cwd())
  return {
    root,
    dir: assertWithin(root, path.join(root, '.project-cognition')),
    state: assertWithin(root, path.join(root, '.project-cognition', 'state.json')),
    goals: assertWithin(root, path.join(root, '.project-cognition', 'goals')),
    verifiers: assertWithin(root, path.join(root, '.project-cognition', 'verifiers.json')),
    markdown: assertWithin(root, path.join(root, 'PROJECT_COGNITION.md')),
  }
}
const atomicWrite = (file, content, options = {}) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  if (options.exclusive) {
    try { fs.writeFileSync(file, content, { encoding: 'utf8', flag: 'wx' }) } catch (error) {
      if (error && error.code === 'EEXIST') throw new Error('refusing to overwrite immutable file: ' + file)
      throw error
    }
    return
  }
  const temp = file + '.tmp-' + process.pid + '-' + Math.random().toString(16).slice(2)
  try {
    fs.writeFileSync(temp, content, { encoding: 'utf8', flag: 'wx' })
    fs.renameSync(temp, file)
  } finally {
    if (fs.existsSync(temp)) fs.rmSync(temp, { force: true })
  }
}
const writeJson = (file, value, options) => atomicWrite(file, JSON.stringify(value, null, 2) + '\n', options)
const withExclusiveLock = (file, action) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  let handle
  try {
    try { handle = fs.openSync(file, 'wx') } catch (error) {
      if (error && error.code === 'EEXIST') throw new Error('another cognition promotion is active or left a stale lock: ' + file)
      throw error
    }
    fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }) + '\n')
    return action()
  } finally {
    if (handle !== undefined) {
      try { fs.closeSync(handle) } catch (error) { /* removal below remains fail-closed */ }
      try { fs.rmSync(file) } catch (error) { /* a stale lock safely blocks the next promotion */ }
    }
  }
}
// Keeps the two projections aligned on ordinary in-process filesystem errors.
// This is not a cross-file power-loss transaction. Doctor detects a missing or
// mismatched canonical pair and an active/stale governance lock; it does not
// enumerate every temporary/backup residue or perform crash recovery.
const rollbackProtectedWrite = (entries) => {
  const prepared = []
  let committedAll = false
  try {
    for (const source of entries) {
      const file = path.resolve(source.file)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      if (fs.existsSync(file) && !fs.statSync(file).isFile()) throw new Error('refusing to replace non-file path: ' + file)
      const suffix = process.pid + '-' + Math.random().toString(16).slice(2)
      const entry = { file, temp: file + '.tmp-' + suffix, backup: file + '.bak-' + suffix, existed: fs.existsSync(file), backedUp: false, committed: false }
      fs.writeFileSync(entry.temp, source.content, { encoding: 'utf8', flag: 'wx' })
      prepared.push(entry)
    }
    for (const entry of prepared) {
      if (entry.existed) {
        fs.renameSync(entry.file, entry.backup)
        entry.backedUp = true
      }
      fs.renameSync(entry.temp, entry.file)
      entry.committed = true
    }
    committedAll = true
  } catch (error) {
    const rollbackErrors = []
    for (const entry of [...prepared].reverse()) {
      try {
        if (entry.committed && fs.existsSync(entry.file)) fs.rmSync(entry.file, { force: true })
        if (entry.backedUp && fs.existsSync(entry.backup)) fs.renameSync(entry.backup, entry.file)
      } catch (rollbackError) {
        rollbackErrors.push(entry.file + ': ' + rollbackError.message)
      }
    }
    if (rollbackErrors.length > 0) throw new Error(error.message + '; rollback failed for ' + rollbackErrors.join('; '))
    throw error
  } finally {
    for (const entry of prepared) {
      if (fs.existsSync(entry.temp)) fs.rmSync(entry.temp, { force: true })
    }
  }
  if (committedAll) {
    for (const entry of prepared) {
      try { if (entry.backedUp && fs.existsSync(entry.backup)) fs.rmSync(entry.backup, { force: true }) } catch (error) { /* a stale backup is safer than rolling back a committed pair */ }
    }
  }
}
const print = (value) => process.stdout.write(JSON.stringify(value, null, 2) + '\n')
const goalFilename = (goal) => encodeURIComponent(goal.goal_id) + '.r' + goal.revision + '.json'
const governanceLockFor = (locations) => path.join(path.dirname(locations.state), '.governance.lock')

const main = () => {
  const group = positional[0]
  const command = positional[1]
  if (!group || group === 'help' || group === '--help') {
    process.stdout.write(usage() + '\n')
    return
  }

  if (group === 'init') {
    const locations = pathsFor(positional[1])
    withExclusiveLock(governanceLockFor(locations), () => {
      fs.mkdirSync(locations.goals, { recursive: true })
      let state
      if (fs.existsSync(locations.state)) {
        state = readJson(locations.state)
        validateState(state, { requireHash: true })
      } else {
        state = sealState(createEmptyState())
        writeJson(locations.state, state, { exclusive: true })
      }
      if (!fs.existsSync(locations.verifiers)) {
        writeJson(locations.verifiers, sealRegistry({ schema: 'project-cognition/verifier-registry/v1', revision: 1, registry_hash: null, entries: [] }), { exclusive: true })
      } else {
        validateRegistry(readJson(locations.verifiers))
      }
      atomicWrite(locations.markdown, renderMarkdown(state) + '\n')
    })
    print({ ok: true, root: locations.root, state: locations.state, projection: locations.markdown })
    return
  }

  if (group === 'doctor') {
    const locations = pathsFor(positional[1])
    const checks = []
    const governanceLock = governanceLockFor(locations)
    checks.push({ name: 'governance_lock', status: fs.existsSync(governanceLock) ? 'FAIL' : 'PASS', detail: fs.existsSync(governanceLock) ? 'active or stale lock requires operator review' : 'absent' })
    let state
    try {
      state = readJson(locations.state)
      validateState(state, { requireHash: true })
      checks.push({ name: 'cognition_state', status: 'PASS', detail: state.state_hash })
    } catch (error) {
      state = undefined
      checks.push({ name: 'cognition_state', status: 'FAIL', detail: error.message })
    }
    if (state) {
      const expected = renderMarkdown(state) + '\n'
      const actual = fs.existsSync(locations.markdown) ? fs.readFileSync(locations.markdown, 'utf8') : null
      checks.push({ name: 'markdown_projection', status: actual === expected ? 'PASS' : 'FAIL', detail: actual === null ? 'missing' : actual === expected ? 'matches state' : 'stale or manually edited' })
    }
    let goalCount = 0
    try {
      const files = fs.existsSync(locations.goals) ? fs.readdirSync(locations.goals).filter((file) => file.endsWith('.json')) : []
      for (const file of files) validateGoalContract(readJson(path.join(locations.goals, file)))
      goalCount = files.length
      checks.push({ name: 'goal_contracts', status: 'PASS', detail: goalCount + ' valid contract(s)' })
    } catch (error) {
      checks.push({ name: 'goal_contracts', status: 'FAIL', detail: error.message })
    }
    try {
      const registry = readJson(locations.verifiers)
      validateRegistry(registry)
      checks.push({ name: 'verifier_registry', status: 'PASS', detail: registry.registry_hash + ' (' + registry.entries.length + ' entries)' })
    } catch (error) {
      checks.push({ name: 'verifier_registry', status: 'FAIL', detail: error.message })
    }
    const ok = checks.every((check) => check.status === 'PASS')
    print({ ok, root: locations.root, checks })
    if (!ok) process.exitCode = 2
    return
  }

  if (group === 'cognition' && command === 'validate') {
    const file = positional[2] ? path.resolve(positional[2]) : pathsFor().state
    const state = readJson(file)
    validateState(state, { requireHash: true })
    print({ ok: true, schema: state.schema, revision: state.revision, state_hash: state.state_hash })
    return
  }
  if (group === 'cognition' && command === 'draft') {
    const output = flagValue('--out')
    if (!output) throw new Error('--out <draft-state.json> is required')
    const locations = pathsFor(flagValue('--root') || positional[2])
    const current = readJson(locations.state)
    validateState(current, { requireHash: true })
    const draft = JSON.parse(JSON.stringify(current))
    draft.revision = current.revision + 1
    delete draft.state_hash
    draft.schema = DRAFT_STATE_SCHEMA
    validateState(draft)
    const target = path.resolve(output)
    writeJson(target, draft, { exclusive: true })
    print({ ok: true, draft: target, base_revision: current.revision, base_state_hash: current.state_hash, revision: draft.revision })
    return
  }
  if (group === 'cognition' && command === 'diff') {
    if (!positional[2]) throw new Error('draft-or-sealed state file is required')
    const locations = pathsFor(flagValue('--root'))
    const current = readJson(locations.state)
    validateState(current, { requireHash: true })
    print(diffStates(current, readJson(positional[2])))
    return
  }
  if (group === 'cognition' && command === 'seal') {
    if (!positional[2]) throw new Error('draft-state.json is required')
    const input = readJson(positional[2])
    const state = input.state_hash ? (validateState(input, { requireHash: true }), input) : sealState(input)
    const output = flagValue('--out')
    if (output) {
      const target = path.resolve(output)
      writeJson(target, state, { exclusive: true })
      print({ ok: true, sealed: target, revision: state.revision, state_hash: state.state_hash })
    } else print(state)
    return
  }
  if (group === 'cognition' && command === 'install') {
    if (!positional[2]) throw new Error('sealed state file is required')
    const locations = pathsFor(flagValue('--root'))
    if (!fs.existsSync(locations.state)) throw new Error('canonical cognition state is missing; run project-cognition init first')
    if (!args.includes('--replace')) throw new Error('cognition state exists; pass --replace for an explicit revision change')
    const expectedHash = flagValue('--expect-current-hash')
    if (!expectedHash) throw new Error('--expect-current-hash <sha256> is required for a reviewed revision change')
    const installed = withExclusiveLock(governanceLockFor(locations), () => {
      const current = readJson(locations.state)
      validateState(current, { requireHash: true })
      if (expectedHash !== current.state_hash) throw new Error('expected current state hash does not match the installed canonical state')
      const state = readJson(positional[2])
      validateState(state, { requireHash: true })
      if (state.revision !== current.revision + 1) throw new Error('sealed state revision must equal the current canonical revision plus one')
      rollbackProtectedWrite([
        { file: locations.state, content: JSON.stringify(state, null, 2) + '\n' },
        { file: locations.markdown, content: renderMarkdown(state) + '\n' },
      ])
      return state
    })
    print({ ok: true, state: locations.state, projection: locations.markdown, revision: installed.revision, state_hash: installed.state_hash })
    return
  }
  if (group === 'cognition' && command === 'render') {
    const locations = pathsFor(positional[2])
    const state = withExclusiveLock(governanceLockFor(locations), () => {
      const current = readJson(locations.state)
      validateState(current, { requireHash: true })
      atomicWrite(locations.markdown, renderMarkdown(current) + '\n')
      return current
    })
    print({ ok: true, projection: locations.markdown, state_hash: state.state_hash })
    return
  }
  if (group === 'cognition' && command === 'freshness') {
    if (!positional[2]) throw new Error('fingerprints.json is required')
    const locations = pathsFor(positional[3])
    const state = readJson(locations.state)
    validateState(state, { requireHash: true })
    print(evaluateFreshness(state, readJson(positional[2])))
    return
  }

  if (group === 'verifier' && command === 'validate') {
    const registry = readJson(positional[2])
    validateRegistry(registry)
    print({ ok: true, revision: registry.revision, registry_hash: registry.registry_hash, entries: registry.entries.length })
    return
  }
  if (group === 'verifier' && command === 'seal') {
    const registry = readJson(positional[2])
    print(registry.registry_hash ? (validateRegistry(registry), registry) : sealRegistry(registry))
    return
  }
  if (group === 'verifier' && command === 'install') {
    if (!positional[2]) throw new Error('draft-or-sealed registry file is required')
    const locations = pathsFor(flagValue('--root'))
    const registry = withExclusiveLock(governanceLockFor(locations), () => {
      const input = readJson(positional[2])
      const next = input.registry_hash ? (validateRegistry(input), input) : sealRegistry(input)
      if (fs.existsSync(locations.verifiers) && !args.includes('--replace')) throw new Error('verifier registry exists; pass --replace for an explicit revision change')
      atomicWrite(locations.verifiers, JSON.stringify(next, null, 2) + '\n')
      return next
    })
    print({ ok: true, registry: locations.verifiers, revision: registry.revision, registry_hash: registry.registry_hash, entries: registry.entries.length })
    return
  }

  if (group === 'goal' && command === 'validate') {
    const goal = readJson(positional[2])
    validateGoalContract(goal)
    print({ ok: true, goal_id: goal.goal_id, revision: goal.revision, status: goal.status, contract_hash: goal.contract_hash })
    return
  }
  if (group === 'goal' && command === 'recommend') {
    if (!positional[2]) throw new Error('risk.json is required')
    print(recommendMode(readJson(positional[2])))
    return
  }
  if (group === 'goal' && command === 'approve') {
    if (!positional[2]) throw new Error('draft.json is required')
    const actor = flagValue('--actor')
    if (!actor) throw new Error('--actor is required')
    const locations = pathsFor(flagValue('--root'))
    const approval = withExclusiveLock(governanceLockFor(locations), () => {
      const draft = readJson(positional[2])
    validateGoalContract(draft)
    const cognition = readJson(locations.state)
    validateState(cognition, { requireHash: true })
    const registry = readJson(locations.verifiers)
    validateRegistry(registry)
    if (draft.baseline && draft.baseline.cognition_hash !== cognition.state_hash) throw new Error('draft baseline cognition_hash does not match the current canonical state')
    if (draft.verifier_registry_hash !== registry.registry_hash) throw new Error('draft verifier_registry_hash does not match the installed registry')
    const registryIds = new Set(registry.entries.map((entry) => entry.id))
    const missingVerifiers = (draft.criteria || []).filter((criterion) => criterion.authority === 'tool' && !registryIds.has(criterion.verifier_id)).map((criterion) => criterion.verifier_id)
    if (missingVerifiers.length > 0) throw new Error('draft references verifier ids missing from the installed registry: ' + [...new Set(missingVerifiers)].join(', '))
    const invariantsById = new Map(cognition.invariants.map((invariant) => [invariant.id, invariant]))
    const invalidInvariants = draft.invariant_refs.filter((id) => !invariantsById.has(id) || invariantsById.get(id).lifecycle === 'superseded')
    if (invalidInvariants.length > 0) throw new Error('draft references unknown or superseded cognition invariants: ' + invalidInvariants.join(', '))
    const encodedGoalId = encodeURIComponent(draft.goal_id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const goalFilenamePattern = new RegExp('^' + encodedGoalId + '\\.r([1-9][0-9]*)\\.json$')
    const existingRevisions = fs.existsSync(locations.goals)
      ? fs.readdirSync(locations.goals).map((file) => file.match(goalFilenamePattern)).filter(Boolean).map((match) => Number(match[1]))
      : []
    if (draft.revision === 1 && existingRevisions.length > 0) throw new Error('goal revision 1 cannot be approved after an existing revision')
    if (draft.revision > 1) {
      let previous
      for (let revision = 1; revision < draft.revision; revision += 1) {
        const chainFile = path.join(locations.goals, goalFilename({ goal_id: draft.goal_id, revision }))
        if (!fs.existsSync(chainFile)) throw new Error('goal revision ' + draft.revision + ' requires the complete installed chain; revision ' + revision + ' is missing')
        const installedRevision = readJson(chainFile)
        validateGoalContract(installedRevision, { allowDraft: false })
        if (installedRevision.goal_id !== draft.goal_id || installedRevision.revision !== revision) throw new Error('installed goal revision chain does not match its expected identity at revision ' + revision)
        previous = installedRevision
      }
      prepareRevision(previous, draft)
      if (existingRevisions.some((revision) => revision >= draft.revision)) throw new Error('goal revision chain already contains revision ' + draft.revision + ' or later')
    }
    const approved = approveContract(draft, actor)
    const target = assertWithin(locations.root, path.join(locations.goals, goalFilename(approved)))
    writeJson(target, approved, { exclusive: true })
      return { ok: true, contract: target, goal_id: approved.goal_id, revision: approved.revision, contract_hash: approved.contract_hash }
    })
    print(approval)
    return
  }
  if (group === 'goal' && command === 'show') {
    const goal = readJson(positional[2])
    validateGoalContract(goal)
    if (outputFormat() === 'markdown') process.stdout.write(renderGoalContractMarkdown(goal) + '\n')
    else print({ contract: goal, human_card: renderGoalContractMarkdown(goal) })
    return
  }
  if (group === 'goal' && command === 'observe') {
    const observation = readJson(positional[2])
    validateObservation(observation)
    print({ ok: true, observation })
    return
  }
  if (group === 'goal' && (command === 'decide' || command === 'status')) {
    if (!positional[2] || !positional[3]) throw new Error('contract and events files are required')
    const goal = readJson(positional[2])
    const decision = decideGoal(goal, readEvents(positional[3]))
    if (outputFormat() === 'markdown') process.stdout.write(renderGoalStatusMarkdown(goal, decision) + '\n')
    else print(decision)
    return
  }
  if (group === 'goal' && command === 'revise') {
    if (!positional[2] || !positional[3]) throw new Error('approved and next-draft files are required')
    print(prepareRevision(readJson(positional[2]), readJson(positional[3])))
    return
  }
  if (group === 'goal' && command === 'cancel') {
    const goal = readJson(positional[2])
    validateGoalContract(goal, { allowDraft: false })
    const sequence = flagValue('--sequence') === undefined ? 1 : Number(flagValue('--sequence'))
    const event = { schema: EVENT_SCHEMA, sequence, goal_id: goal.goal_id, contract_hash: goal.contract_hash, type: 'goal_cancelled', at: new Date().toISOString(), data: {} }
    validateGoalEvent(event)
    print(event)
    return
  }
  if (group === 'adapter' && command === 'doctor') {
    print(validateAdapterManifest(readJson(positional[2])))
    return
  }
  throw new Error('unknown command\n\n' + usage())
}

try {
  main()
} catch (error) {
  process.stderr.write('project-cognition: ' + (error && error.message ? error.message : String(error)) + '\n')
  process.exitCode = 1
}
