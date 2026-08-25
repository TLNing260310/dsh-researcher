'use strict'

// Pure read-only provenance helpers shared by run-lock creation, verification,
// the outer runner, and the host verifier. Nothing here starts DSH.
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { pathToFileURL } = require('node:url')
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
      // ESM-only packages may export only an "import" condition and hide
      // package.json, so createRequire cannot resolve either spelling even
      // though the dependency is correctly installed. Walk only the normal
      // node_modules ancestry inside the pinned module root, then bind the
      // canonical package root and verified manifest name below.
      let cursor = path.resolve(parentRoot)
      while (isWithin(moduleRoot, cursor)) {
        const direct = path.join(cursor, 'node_modules', ...dependencyName.split('/'), 'package.json')
        if (fs.existsSync(direct) && fs.statSync(direct).isFile()) {
          const manifest = readJson(direct)
          if (manifest.name !== dependencyName) throw new Error('pinned DSH dependency identity drifted: ' + dependencyName)
          entry = direct
          break
        }
        if (cursor === moduleRoot || path.dirname(cursor) === cursor) break
        cursor = path.dirname(cursor)
      }
      if (!entry) {
        if (optional) return null
        throw new Error('pinned DSH dependency is missing: ' + dependencyName)
      }
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

const dshPackageImportMap = (provenance, requiredNames) => {
  if (!provenance || !provenance.module_root || !Array.isArray(provenance.dependencies)) throw new Error('complete DSH provenance is required for package imports')
  if (!Array.isArray(requiredNames) || requiredNames.length === 0) throw new Error('required DSH package imports must be declared')
  const required = new Set(requiredNames)
  const values = {}
  for (const entry of provenance.dependencies) {
    if (!required.has(entry.name)) continue
    const root = canonicalExisting(path.resolve(provenance.module_root, entry.root_relative))
    if (!isWithin(provenance.module_root, root)) throw new Error('DSH package import root escapes module root: ' + entry.name)
    const manifest = readJson(path.join(root, 'package.json'))
    if (manifest.name !== entry.name || typeof manifest.main !== 'string' || manifest.main === '') continue
    const target = canonicalExisting(path.resolve(root, manifest.main))
    if (!isWithin(root, target) || !fs.statSync(target).isFile()) throw new Error('DSH package main escapes package root: ' + entry.name)
    values[entry.name] = pathToFileURL(target).href
  }
  for (const name of required) if (!values[name]) throw new Error('required DSH package import is unavailable: ' + name)
  return values
}

const directoryInventory = (root, options = {}) => {
  const absolute = canonicalExisting(path.resolve(root))
  const allowedLinkRoot = options.allowedLinkRoot === undefined
    ? null
    : canonicalExisting(path.resolve(options.allowedLinkRoot))
  const files = []
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const target = path.join(directory, entry.name)
      const relative = slash(path.relative(absolute, target))
      if (entry.isSymbolicLink()) {
        if (!allowedLinkRoot) throw new Error('symbolic links are not allowed in frozen E1 inputs: ' + relative)
        const resolved = canonicalExisting(target)
        if (!isWithin(allowedLinkRoot, resolved)) throw new Error('DSH_HOME dependency link escapes the locked DSH module root: ' + relative)
        files.push({
          path: relative,
          sha256: hashJson({ kind: 'locked-dependency-link', target_relative: slash(path.relative(allowedLinkRoot, resolved)) }),
        })
      } else if (entry.isDirectory()) visit(target)
      else if (entry.isFile()) files.push({ path: relative, sha256: sha256File(target) })
      else throw new Error('unsupported filesystem entry in frozen E1 input: ' + relative)
    }
  }
  visit(absolute)
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
  dshPackageImportMap,
  publicDshProvenance,
  directoryInventory,
  assertSameProvenance,
}
