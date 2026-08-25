#!/usr/bin/env node
'use strict'

// Explicit capture-only bridge for the run-lock's tool schema snapshot. This
// boots pinned DSH with an idle agent but has no code path that submits a
// prompt, command, tool call, or model request.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { parseArgs, readJson, requireString, canonicalize, snapshotTree, sha256File } = require('./lib.js')
const { materialize } = require('../../fixtures/goal-governor-e1/materialize.js')
const { immutableSnapshot } = require('./external-verifier.js')
const { verifyInstalledCandidate, verifyDshRuntime } = require('./run-e1.js')
const { currentNodeProvenance, dshRuntimeProvenance, publicDshProvenance, directoryInventory, sanitizeNodeEnvironment } = require('./runtime-provenance.js')
const { validateCaptureReport } = require('./visible-tool-contract.js')
const { PROJECT_PACKAGE_NAME, VERIFIED_DSH, assertDshNodeSupported } = require('../../lib/runtime-requirements.js')

const EVAL_ROOT = __dirname
const REPO_ROOT = path.resolve(EVAL_ROOT, '..', '..')
const PATCH_PATH = path.join(EVAL_ROOT, 'runner', 'e1.patch.yml')
const DRIVER_PATH = path.join(EVAL_ROOT, 'runner', 'capture-visible-tools.mjs')
const HOST_TOOL_PATH = path.join(EVAL_ROOT, 'runner', 'e1-host-tool.js')
const CONTRACT_MODULE = path.join(EVAL_ROOT, 'visible-tool-contract.js')
const VERIFIER_PATH = path.join(REPO_ROOT, 'fixtures', 'goal-governor-e1', 'template', 'verify.mjs')

const digestMap = (entries) => Object.fromEntries(entries.map((entry) => [entry.path, entry.sha256]))
const isWithin = (root, target) => {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
}
const assertDisjoint = (left, right, label) => {
  if (isWithin(left, right) || isWithin(right, left)) throw new Error(label + ' paths must be disjoint')
}
const validateCapturePaths = ({ output, workspace, dshModuleRoot, dshHome, presetRoot }) => {
  for (const [left, right, label] of [
    [output, REPO_ROOT, 'output/repository'],
    [output, workspace, 'output/workspace'],
    [output, dshModuleRoot, 'output/modules'],
    [output, dshHome, 'output/DSH_HOME'],
    [output, presetRoot, 'output/candidate'],
    [workspace, REPO_ROOT, 'workspace/repository'],
    [workspace, dshHome, 'workspace/DSH_HOME'],
    [workspace, presetRoot, 'workspace/candidate'],
    [dshHome, dshModuleRoot, 'DSH_HOME/modules'],
    [dshHome, presetRoot, 'DSH_HOME/candidate'],
  ]) assertDisjoint(left, right, label)
}

const main = () => {
  const args = parseArgs(process.argv.slice(2))
  if (args.help === true) {
    process.stdout.write('node capture-visible-tools.js --output <external-json> --workspace <empty-dir> --dsh-module-root <node_modules> --dsh-home <empty-dir> --preset-root <installed-candidate>\n')
    return
  }
  const output = path.resolve(requireString(args.output, '--output'))
  const workspace = path.resolve(requireString(args.workspace, '--workspace'))
  const dshModuleRoot = path.resolve(requireString(args['dsh-module-root'], '--dsh-module-root'))
  const dshHome = path.resolve(requireString(args['dsh-home'], '--dsh-home'))
  const presetRoot = path.resolve(requireString(args['preset-root'], '--preset-root'))
  if (fs.existsSync(output)) throw new Error('refusing to overwrite schema capture output')
  if (!fs.existsSync(dshHome) || !fs.statSync(dshHome).isDirectory() || fs.readdirSync(dshHome).length !== 0) throw new Error('schema capture requires a fresh empty DSH_HOME')
  if (fs.existsSync(workspace) && (!fs.statSync(workspace).isDirectory() || fs.readdirSync(workspace).length !== 0)) throw new Error('schema capture workspace must be absent or empty')
  validateCapturePaths({ output, workspace, dshModuleRoot, dshHome, presetRoot })
  const dsh = dshRuntimeProvenance(dshModuleRoot)
  assertDshNodeSupported()
  if (dsh.package_version !== VERIFIED_DSH) throw new Error('schema capture requires @deepseek-ai/dsh@' + VERIFIED_DSH)
  const dshHomeBefore = directoryInventory(dshHome)
  const verifiedDsh = verifyDshRuntime(dshModuleRoot, dshHome, publicDshProvenance(dsh))
  if (canonicalize(directoryInventory(dshHome)) !== canonicalize(dshHomeBefore)) throw new Error('DSH --version mutated the fresh capture home')
  const candidatePackage = readJson(path.join(presetRoot, 'package.json'))
  if (candidatePackage.name !== PROJECT_PACKAGE_NAME) throw new Error('schema capture preset root is not ' + PROJECT_PACKAGE_NAME)
  // This synthetic lock shape is used only to reuse the candidate closure
  // inventory verifier; no live/model decision trusts it.
  const manifest = readJson(path.join(EVAL_ROOT, 'manifest.json'))
  const inputs = {}
  for (const relative of manifest.lock_inputs) {
    const absolute = path.resolve(REPO_ROOT, relative)
    if (fs.statSync(absolute).isFile()) inputs[relative] = sha256File(absolute)
    else for (const entry of require('./lib.js').walkFiles(absolute)) inputs[relative + '/' + entry.path] = entry.sha256
  }
  verifyInstalledCandidate(presetRoot, { candidate: { package_name: candidatePackage.name, package_version: candidatePackage.version }, inputs })
  materialize({ caseId: 'simple-done', output: workspace, initGit: false })
  const before = snapshotTree(workspace)
  const expectedImmutableFiles = digestMap(immutableSnapshot(workspace, ['src/task.js']))
  const innerOut = path.join(os.tmpdir(), 'dsh-researcher-e1-schema-' + crypto.randomUUID() + '.json')
  const sanitized = sanitizeNodeEnvironment({
    ...process.env,
    DSH_HOME: dshHome,
    DSH_PERMISSION_MODE: 'workspace-write',
    DSH_E1_PRESET_ROOT: presetRoot,
    DSH_E1_DSH_MODULE_ROOT: dshModuleRoot,
    DSH_E1_DRIVER: DRIVER_PATH,
    DSH_E1_HOST_TOOL: HOST_TOOL_PATH,
    DSH_E1_WORKSPACE: workspace,
    DSH_E1_EXTERNAL_VERIFIER: VERIFIER_PATH,
    DSH_E1_EXTERNAL_VERIFIER_SOURCE: 'fixtures/goal-governor-e1/template/verify.mjs',
    DSH_E1_EXTERNAL_VERIFIER_SHA256: sha256File(VERIFIER_PATH),
    DSH_E1_IMMUTABLE_FILES: JSON.stringify(expectedImmutableFiles),
    DSH_E1_ALLOWED_CHANGES: JSON.stringify(['src/task.js']),
    DSH_E1_NODE_PROVENANCE: JSON.stringify(currentNodeProvenance()),
    DSH_E1_SESSION_ROOT: path.join(dshHome, 'e1-session-store'),
    DSH_E1_VISIBLE_TOOL_CONTRACT_MODULE: CONTRACT_MODULE,
    DSH_E1_CAPTURE_OUT: innerOut,
    DSH_E1_DISABLE_MODEL_COMPACTION: '1',
    DSH_E1_RESTRICT_TOOL_SURFACE: '1',
  })
  const child = spawnSync(process.execPath, [verifiedDsh.cli_file, '--profile', 'headless', '--patch', PATCH_PATH, 'e1-schema-capture'], { cwd: workspace, env: sanitized.env, stdio: 'inherit', windowsHide: false, timeout: 60000 })
  if (child.error || child.status !== 0 || !fs.existsSync(innerOut)) throw new Error('capture-only DSH process failed without producing a snapshot')
  const inner = readJson(innerOut)
  try { fs.unlinkSync(innerOut) } catch (_) { /* OS temp residue is non-normative */ }
  if (canonicalize(snapshotTree(workspace)) !== canonicalize(before)) throw new Error('capture-only DSH process modified the workspace')
  const report = validateCaptureReport({
    schema: 'dsh-researcher/goal-governor-e1/visible-tools-capture/v1',
    model_calls: inner.model_calls,
    prompt_submissions: inner.prompt_submissions,
    command_submissions: inner.command_submissions,
    node: currentNodeProvenance(),
    dsh: publicDshProvenance(dsh),
    candidate: { package_name: candidatePackage.name, package_version: candidatePackage.version },
    visible_tool_contract: inner.visible_tool_contract,
  })
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
  process.stdout.write(JSON.stringify({ ok: true, model_calls: 0, prompt_submissions: 0, output, schema_hash: report.visible_tool_contract.schema_hash }, null, 2) + '\n')
}

if (require.main === module) {
  try { main() } catch (error) {
    process.stderr.write('E1 visible tools capture: ' + error.message + '\n')
    process.exitCode = 1
  }
}

module.exports = { main, validateCapturePaths }
