#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const {
  createEmptyState, validateState, sealState, evaluateFreshness, renderMarkdown,
} = require('../lib/cognition-core/index.js')
const {
  validateGoalContract, approveContract, prepareRevision, validateObservation, recommendMode, renderGoalContractMarkdown,
  validateGoalEvent, decideGoal, validateAdapterManifest, EVENT_SCHEMA,
} = require('../lib/goal-core/index.js')
const { validateRegistry, sealRegistry } = require('../lib/verifier-core/index.js')

const usage = () => `project-cognition

  init [root]
  doctor [root]
  cognition validate [state-file]
  cognition seal <draft-state.json>
  cognition install <draft-or-sealed.json> [--root <root>] [--replace]
  cognition render [root]
  cognition freshness <fingerprints.json> [root]
  verifier validate <registry.json>
  verifier seal <draft-registry.json>
  verifier install <draft-or-sealed.json> [--root <root>] [--replace]
  goal validate <contract.json>
  goal recommend <risk.json>
  goal approve <draft.json> --actor <name> [--root <root>]
  goal show <contract.json>
  goal observe <observation.json>
  goal decide|status <contract.json> <events.json|events.jsonl>
  goal revise <approved.json> <next-draft.json>
  goal cancel <approved.json> [--sequence <n>]
  adapter doctor <manifest.json>

JSON is written to stdout. Diagnostics and errors use stderr.`

const args = process.argv.slice(2)
const flagValue = (name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const positional = args.filter((value, index) => !value.startsWith('--') && (index === 0 || !args[index - 1].startsWith('--')))

const readJson = (file) => JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'))
const readEvents = (file) => {
  const raw = fs.readFileSync(path.resolve(file), 'utf8').trim()
  if (raw.length === 0) return []
  if (raw.startsWith('[')) return JSON.parse(raw)
  return raw.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line) } catch (error) { throw new Error('invalid JSONL event at line ' + (index + 1) + ': ' + error.message) }
  })
}
const assertWithin = (root, target) => {
  const relative = path.relative(root, target)
  if (relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) return target
  throw new Error('refusing path outside project root: ' + target)
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
  if (options.exclusive && fs.existsSync(file)) throw new Error('refusing to overwrite immutable file: ' + file)
  const temp = file + '.tmp-' + process.pid + '-' + Math.random().toString(16).slice(2)
  try {
    fs.writeFileSync(temp, content, { encoding: 'utf8', flag: 'wx' })
    fs.renameSync(temp, file)
  } finally {
    if (fs.existsSync(temp)) fs.rmSync(temp, { force: true })
  }
}
const writeJson = (file, value, options) => atomicWrite(file, JSON.stringify(value, null, 2) + '\n', options)
const print = (value) => process.stdout.write(JSON.stringify(value, null, 2) + '\n')
const goalFilename = (goal) => encodeURIComponent(goal.goal_id) + '.r' + goal.revision + '.json'

const main = () => {
  const group = positional[0]
  const command = positional[1]
  if (!group || group === 'help' || group === '--help') {
    process.stdout.write(usage() + '\n')
    return
  }

  if (group === 'init') {
    const locations = pathsFor(positional[1])
    fs.mkdirSync(locations.goals, { recursive: true })
    let state
    if (fs.existsSync(locations.state)) {
      state = readJson(locations.state)
      validateState(state)
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
    print({ ok: true, root: locations.root, state: locations.state, projection: locations.markdown })
    return
  }

  if (group === 'doctor') {
    const locations = pathsFor(positional[1])
    const checks = []
    let state
    try {
      state = readJson(locations.state)
      validateState(state)
      checks.push({ name: 'cognition_state', status: 'PASS', detail: state.state_hash })
    } catch (error) {
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
    validateState(state)
    print({ ok: true, schema: state.schema, revision: state.revision, state_hash: state.state_hash })
    return
  }
  if (group === 'cognition' && command === 'seal') {
    if (!positional[2]) throw new Error('draft-state.json is required')
    const input = readJson(positional[2])
    print(input.state_hash ? (validateState(input), input) : sealState(input))
    return
  }
  if (group === 'cognition' && command === 'install') {
    if (!positional[2]) throw new Error('draft-or-sealed state file is required')
    const locations = pathsFor(flagValue('--root'))
    const input = readJson(positional[2])
    const state = input.state_hash ? (validateState(input), input) : sealState(input)
    if (fs.existsSync(locations.state) && !args.includes('--replace')) throw new Error('cognition state exists; pass --replace for an explicit atomic revision change')
    atomicWrite(locations.state, JSON.stringify(state, null, 2) + '\n')
    atomicWrite(locations.markdown, renderMarkdown(state) + '\n')
    print({ ok: true, state: locations.state, projection: locations.markdown, revision: state.revision, state_hash: state.state_hash })
    return
  }
  if (group === 'cognition' && command === 'render') {
    const locations = pathsFor(positional[2])
    const state = readJson(locations.state)
    validateState(state)
    atomicWrite(locations.markdown, renderMarkdown(state) + '\n')
    print({ ok: true, projection: locations.markdown, state_hash: state.state_hash })
    return
  }
  if (group === 'cognition' && command === 'freshness') {
    if (!positional[2]) throw new Error('fingerprints.json is required')
    const locations = pathsFor(positional[3])
    print(evaluateFreshness(readJson(locations.state), readJson(positional[2])))
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
    const input = readJson(positional[2])
    const registry = input.registry_hash ? (validateRegistry(input), input) : sealRegistry(input)
    if (fs.existsSync(locations.verifiers) && !args.includes('--replace')) throw new Error('verifier registry exists; pass --replace for an explicit atomic revision change')
    atomicWrite(locations.verifiers, JSON.stringify(registry, null, 2) + '\n')
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
    const draft = readJson(positional[2])
    const cognition = readJson(locations.state)
    validateState(cognition)
    const registry = readJson(locations.verifiers)
    validateRegistry(registry)
    if (draft.baseline && draft.baseline.cognition_hash !== cognition.state_hash) throw new Error('draft baseline cognition_hash does not match the current canonical state')
    if (draft.verifier_registry_hash !== registry.registry_hash) throw new Error('draft verifier_registry_hash does not match the installed registry')
    const registryIds = new Set(registry.entries.map((entry) => entry.id))
    const missingVerifiers = (draft.criteria || []).filter((criterion) => criterion.authority === 'tool' && !registryIds.has(criterion.verifier_id)).map((criterion) => criterion.verifier_id)
    if (missingVerifiers.length > 0) throw new Error('draft references verifier ids missing from the installed registry: ' + [...new Set(missingVerifiers)].join(', '))
    const approved = approveContract(draft, actor)
    const target = assertWithin(locations.root, path.join(locations.goals, goalFilename(approved)))
    writeJson(target, approved, { exclusive: true })
    print({ ok: true, contract: target, goal_id: approved.goal_id, revision: approved.revision, contract_hash: approved.contract_hash })
    return
  }
  if (group === 'goal' && command === 'show') {
    const goal = readJson(positional[2])
    validateGoalContract(goal)
    print({ contract: goal, human_card: renderGoalContractMarkdown(goal) })
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
    print(decideGoal(readJson(positional[2]), readEvents(positional[3])))
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
