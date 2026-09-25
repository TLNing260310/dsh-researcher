// DSH host preset patch: append one `research-entry` row to the DSH presets people
// actually run, reversibly.
//
// Why this exists: the in-place `/research` entry only works if the preset a
// session runs on carries a `research-entry` row. The alternative — asking the
// user to switch to a copied preset — defeats the point of an in-place mode.
//
// The change is deliberately minimal and reversible:
//   - exactly one row is appended; every row the preset already had is untouched
//   - the block is delimited by markers, so removal is a marker search rather
//     than a three-way merge
//   - an unpatched copy is kept beside the file as `.dsh-researcher-original`
//   - a file that does not look like a shipped preset is left alone and reported,
//     never guessed at
//
// It is a separate module so the installer's orchestration stays readable and so
// this path can be tested without running an install.
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const MARKER_BEGIN = '# >>> dsh-researcher: research-entry (added by the installer) >>>'
const MARKER_END = '# <<< dsh-researcher: research-entry <<<'
const DEFAULT_TARGETS = ['minimal', 'standard']
const BACKUP_SUFFIX = '.dsh-researcher-original'
const SCHEMA = 'dsh-researcher/host-preset-patch/v1'

// Which plugin path the row should carry.
//
// A relative path cannot work here. The patched preset lives in the DSH install,
// while the installed researcher preset lives in the user preset root; those are
// different directories, so `../researcher/...` would resolve inside the install
// where no such preset exists.
//
// The row therefore carries an ABSOLUTE path. That avoids every expansion
// ambiguity: `~` means the user's home to a loader but `DSH_HOME` to some
// deployments, and a deployment with a custom `DSH_HOME` would silently load the
// wrong thing. The path is verified to exist before the row is written.
const ROW_PLUGIN_RELATIVE = '../researcher/plugins/research-entry/index.js'

/** Build the appended block for one concrete plugin path. */
const rowBlock = (pluginPath) => [
  MARKER_BEGIN,
  '# `/research <task>` enters read-only research in the CURRENT session; the main',
  '# agent keeps executing. To switch it off, remove everything between these two',
  '# markers. The path is absolute because the patched preset and the researcher',
  '# preset live in different roots, so a relative path would resolve elsewhere.',
  '- id: research-entry',
  "  name: '" + String(pluginPath).replace(/\\/gu, '/') + "'",
  MARKER_END,
  '',
].join('\n')

/** Where the installed research-entry plugin lives, given a DSH home. */
const installedPluginPath = (dshHome) =>
  path.join(dshHome, '.agent-presets', 'researcher', 'plugins', 'research-entry', 'index.js')

/** Where the row's plugin path points in a same-root layout. */
const pluginPathFor = (presetDir, presetName = 'minimal') =>
  path.resolve(path.join(presetDir, presetName), ROW_PLUGIN_RELATIVE)

/** Where the patched preset itself lives, used to locate its backup and siblings. */
const siblingPresetPath = (presetDir, presetName = 'researcher') => path.join(presetDir, presetName)

/**
 * Resolve the plugin path the row will load. A same-root relative layout is still
 * accepted as a fallback so a deployment keeping everything in one root works.
 */
const resolveInstalledPlugin = (presetDir, presetName, dshHome) => {
  const candidates = [
    dshHome === undefined ? undefined : installedPluginPath(dshHome),
    pluginPathFor(presetDir, presetName),
    path.join(presetDir, 'researcher', 'plugins', 'research-entry', 'index.js'),
  ]
  for (const candidate of candidates) {
    try {
      if (typeof candidate === 'string' && fs.existsSync(candidate)) return candidate
    } catch (error) { /* try the next root */ }
  }
  return undefined
}

const isPatched = (text) => text.includes(MARKER_BEGIN) && text.includes(MARKER_END)

/** Strip one patched block. Returns undefined when the text carries no block. */
const withoutPatch = (text) => {
  const begin = text.indexOf(MARKER_BEGIN)
  const end = text.indexOf(MARKER_END)
  if (begin === -1 || end === -1 || end < begin) return undefined
  const stripped = text.slice(0, begin) + text.slice(end + MARKER_END.length)
  return stripped.replace(/[ \t]+$/gmu, '').replace(/\n{3,}/gu, '\n\n').replace(/\s+$/u, '') + '\n'
}

/** Whether a file looks like a preset composition rather than something else. */
const looksLikePreset = (text) => /^\s*-\s*id:\s*persona\s*$/mu.test(text)

/**
 * Apply or revert the patch across the given preset root.
 *
 * @param {object} options
 * @param {string|undefined} options.presetDir - the DSH presets directory.
 * @param {boolean} options.apply - true to patch, false to revert.
 * @param {boolean} [options.dryRun] - compute the manifest without writing.
 * @param {string[]} [options.targets] - preset names to touch.
 * @returns a manifest describing every decision, including the ones it refused.
 */
const patchHostPresets = ({ presetDir, dshHome, apply, dryRun = false, targets = DEFAULT_TARGETS }) => {
  const manifest = { schema: SCHEMA, presetDir: presetDir === undefined ? null : presetDir, dshHome: dshHome === undefined ? null : dshHome, applied: Boolean(apply), dryRun: Boolean(dryRun), targets: {} }
  if (typeof presetDir !== 'string' || presetDir.length === 0 || !fs.existsSync(presetDir)) return manifest
  for (const name of targets) {
    const file = path.join(presetDir, name, 'agent.cordis.yml')
    const record = { file, action: 'skipped', reason: null, backup: null, pluginPath: null }
    manifest.targets[name] = record
    if (!fs.existsSync(file)) { record.reason = 'preset not present'; continue }
    let text
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch (error) {
      record.reason = 'unreadable: ' + (error && error.message ? error.message : String(error))
      continue
    }
    const patched = isPatched(text)
    if (apply) {
      if (patched) { record.action = 'already-patched'; continue }
      if (!looksLikePreset(text)) { record.reason = 'does not look like a shipped preset'; continue }
      const pluginPath = resolveInstalledPlugin(presetDir, name, dshHome)
      if (pluginPath === undefined) { record.reason = 'research-entry plugin is not installed'; continue }
      record.pluginPath = pluginPath
      record.backup = file + BACKUP_SUFFIX
      if (!dryRun) {
        if (!fs.existsSync(record.backup)) fs.copyFileSync(file, record.backup)
        const separator = text.endsWith('\n') ? '' : '\n'
        fs.writeFileSync(file, text + separator + '\n' + rowBlock(pluginPath))
      }
      record.action = dryRun ? 'would-patch' : 'patched'
      continue
    }
    if (!patched) { record.action = 'not-patched'; continue }
    if (!dryRun) {
      const stripped = withoutPatch(text)
      if (stripped === undefined) { record.reason = 'markers are inconsistent'; continue }
      fs.writeFileSync(file, stripped)
      if (fs.existsSync(record.backup)) {
        try { fs.rmSync(record.backup, { force: true }) } catch (error) { /* 尽力 */ }
      }
    }
    record.action = dryRun ? 'would-revert' : 'reverted'
  }
  return manifest
}

module.exports = {
  SCHEMA, MARKER_BEGIN, MARKER_END, DEFAULT_TARGETS, BACKUP_SUFFIX,
  ROW_PLUGIN_RELATIVE, rowBlock, installedPluginPath,
  isPatched, withoutPatch, looksLikePreset, pluginPathFor, siblingPresetPath, resolveInstalledPlugin, patchHostPresets,
}
