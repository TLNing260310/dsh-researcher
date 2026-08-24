'use strict'

// Pure read-only provenance helpers shared by run-lock creation, verification,
// the outer runner, and the host verifier. Nothing here starts DSH.
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { canonicalize, hashJson, readJson, sha256File, snapshotTree, treeHash } = require('./lib.js')

const NODE_ENV_DENYLIST = Object.freeze([
  'NODE_OPTIONS',
  'NODE_PATH',
  'NODE_REPL_EXTERNAL_MODULE',
  'NODE_EXTRA_CA_CERTS',
  'NODE_V8_COVERAGE',
  'OPENSSL_CONF',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
])

const canonicalExisting = (value) => fs.realpathSync.native ? fs.realpathSync.native(value) : fs.realpathSync(value)
const slash = (value) => value.split(path.sep).join('/')
const isWithin = (root, target) => {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
}

const sanitizeNodeEnvironment = (source = process.env) => {
  const env = { ...source }
  const removed = []
  for (const name of NODE_ENV_DENYLIST) if (Object.prototype.hasOwnProperty.call(env, name)) {
    delete env[name]
    removed.push(name)
  }
  return { env, removed }
}

const currentNodeProvenance = () => ({
  version: process.version,
  platform: process.platform,
  arch: process.arch,
  executable_sha256: sha256File(process.execPath),
})

const packageRootFromEntry = (entry, expectedName) => {
  let cursor = fs.statSync(entry).isDirectory() ? entry : path.dirname(entry)
  while (path.dirname(cursor) !== cursor) {
    const candidate = path.join(cursor, 'package.json')
    if (fs.existsSync(candidate)) {
      const manifest = readJson(candidate)
      if (manifest.name === expectedName) return cursor
    }
    cursor = path.dirname(cursor)
  }
  throw new Error('could not locate package root for ' + expectedName)
}

const resolveDependencyRoot = (parentRoot, dependencyName, moduleRoot, optional) => {
  const resolver = createRequire(path.join(parentRoot, 'package.json'))
  let entry
  try { entry = resolver.resolve(dependencyName + '/package.json') } catch (_) {
    try { entry = resolver.resolve(dependencyName) } catch (error) {
      if (optional) return null
      throw new Error('pinned DSH dependency is missing: ' + dependencyName)
    }
  }
  const root = canonicalExisting(packageRootFromEntry(entry, dependencyName))
  if (!isWithin(moduleRoot, root)) throw new Error('pinned DSH dependency resolves outside --dsh-module-root: ' + dependencyName)
  return root
}

const packageInventory = (packageRoot, moduleRoot) => {
  const manifestFile = path.join(packageRoot, 'package.json')
  const manifest = readJson(manifestFile)
  const files = snapshotTree(packageRoot, { exclude: ['node_modules'] })
  return {
    name: manifest.name,
    version: manifest.version,
    root_relative: slash(path.relative(moduleRoot, packageRoot)),
    package_json_sha256: sha256File(manifestFile),
    content_tree_sha256: treeHash(files),
    file_count: files.length,
  }
}

const dshRuntimeProvenance = (dshModuleRoot) => {
  const moduleRoot = canonicalExisting(path.resolve(dshModuleRoot))
  const dshRoot = canonicalExisting(path.join(moduleRoot, '@deepseek-ai', 'dsh'))
  const dshManifestFile = path.join(dshRoot, 'package.json')
  if (!fs.existsSync(dshManifestFile)) throw new Error('--dsh-module-root does not contain @deepseek-ai/dsh/package.json')
  const queue = [dshRoot]
  const seen = new Set()
  const packages = []
  while (queue.length > 0) {
    const packageRoot = queue.shift()
    if (seen.has(packageRoot)) continue
    seen.add(packageRoot)
    const manifest = readJson(path.join(packageRoot, 'package.json'))
    packages.push(packageInventory(packageRoot, moduleRoot))
    const required = Object.keys(manifest.dependencies || {})
    const optional = new Set([...Object.keys(manifest.optionalDependencies || {}), ...Object.keys(manifest.peerDependenciesMeta || {}).filter((name) => manifest.peerDependenciesMeta[name]?.optional === true)])
    const peer = Object.keys(manifest.peerDependencies || {})
    for (const name of [...new Set([...required, ...Object.keys(manifest.optionalDependencies || {}), ...peer])].sort()) {
      const root = resolveDependencyRoot(packageRoot, name, moduleRoot, optional.has(name) || (!required.includes(name) && peer.includes(name)))
      if (root) queue.push(root)
    }
  }
  packages.sort((left, right) => left.root_relative.localeCompare(right.root_relative))
  const dshManifest = readJson(dshManifestFile)
  const binValues = typeof dshManifest.bin === 'string'
    ? [dshManifest.bin]
    : dshManifest.bin && typeof dshManifest.bin === 'object' ? [...new Set(Object.values(dshManifest.bin))] : []
  if (binValues.length !== 1 || typeof binValues[0] !== 'string') throw new Error('pinned DSH package must declare one unique CLI entry in package.json#bin')
  const cliFile = canonicalExisting(path.resolve(dshRoot, binValues[0]))
  if (!isWithin(dshRoot, cliFile) || !fs.statSync(cliFile).isFile()) throw new Error('pinned DSH CLI entry escapes its package root')
  const publicEvidence = {
    package_name: dshManifest.name,
    package_version: dshManifest.version,
    package_json_sha256: sha256File(dshManifestFile),
    cli_relative: slash(path.relative(dshRoot, cliFile)),
    cli_sha256: sha256File(cliFile),
    dependency_inventory_sha256: hashJson(packages),
    dependencies: packages,
  }
  return { ...publicEvidence, module_root: moduleRoot, package_root: dshRoot, cli_file: cliFile }
}

const directoryInventory = (root) => {
  const absolute = canonicalExisting(path.resolve(root))
  const files = snapshotTree(absolute)
  return {
    schema: 'dsh-researcher/goal-governor-e1/directory-inventory/v1',
    files,
    inventory_sha256: treeHash(files),
    file_count: files.length,
  }
}

const publicDshProvenance = (value) => ({
  package_name: value.package_name,
  package_version: value.package_version,
  package_json_sha256: value.package_json_sha256,
  cli_relative: value.cli_relative,
  cli_sha256: value.cli_sha256,
  dependency_inventory_sha256: value.dependency_inventory_sha256,
  dependencies: value.dependencies,
})

const assertSameProvenance = (actual, expected, label) => {
  if (canonicalize(actual) !== canonicalize(expected)) throw new Error(label + ' provenance differs from the run lock')
}

module.exports = {
  NODE_ENV_DENYLIST,
  sanitizeNodeEnvironment,
  currentNodeProvenance,
  dshRuntimeProvenance,
  publicDshProvenance,
  directoryInventory,
  assertSameProvenance,
}
