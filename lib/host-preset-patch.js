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
const os = require('node:os')
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

/** Whether a path-like value can safely be handed to fs. */
const isUsablePath = (value) => typeof value === 'string' && value.length > 0

/** existsSync with a guard: a derived path can be undefined on a partial record. */
const safeExists = (value) => (isUsablePath(value) ? fs.existsSync(value) : false)

/** Best-effort removal that never throws and never receives a non-string path. */
const safeRemove = (value) => {
  if (!isUsablePath(value)) return false
  try {
    if (!fs.existsSync(value)) return false
    fs.rmSync(value, { force: true })
    return true
  } catch (error) {
    return false
  }
}

/** Whether a file looks like a preset composition rather than something else. */
const looksLikePreset = (text) => /^\s*-\s*id:\s*persona\s*$/mu.test(text)

/**
 * Guard against the failure that actually happened: a test suite ran the
 * installer, the host preset lookup fell back to the DSH installation on the
 * machine, and a throwaway plugin path was written into the user's own presets.
 * When the temporary directory was cleaned up, the user's sessions could no
 * longer mount — a stray test took down the real environment.
 *
 * A caller that deliberately targets somewhere other than the detected DSH
 * installation must say so, and the path must sit under a temporary root. This is
 * checked before any write, so a misdirected call refuses instead of corrupting a
 * real preset file.
 */
const isTemporaryPath = (value) => {
  if (typeof value !== 'string' || value.length === 0) return false
  const normalized = value.replace(/\\/gu, '/').toLowerCase()
  const temp = os.tmpdir().replace(/\\/gu, '/').toLowerCase()
  return normalized.startsWith(temp) || normalized.includes('/temp/') || normalized.includes('/tmp/')
}

/**
 * Decide whether this call may touch `presetDir`.
 * @returns null when the write is allowed, or a reason string when it is refused.
 */
const targetedRootRefusal = ({ presetDir, expectedPresetDir, allowForeignPresetDir }) => {
  if (typeof expectedPresetDir !== 'string' || expectedPresetDir.length === 0) return null
  if (path.resolve(presetDir) === path.resolve(expectedPresetDir)) return null
  if (allowForeignPresetDir === true && isTemporaryPath(presetDir)) return null
  return 'refusing to patch ' + presetDir + ': not the detected DSH presets directory (' + expectedPresetDir + ') and no explicit foreign-target permission was given'
}

/**
 * Apply or revert the patch across the given preset root.
 *
 * @param {object} options
 * @param {string|undefined} options.presetDir - the DSH presets directory.
 * @param {string|undefined} options.dshHome - the DSH home holding the installed preset.
 * @param {boolean} options.apply - true to patch, false to revert.
 * @param {boolean} [options.dryRun] - compute the manifest without writing.
 * @param {string[]} [options.targets] - preset names to touch.
 * @returns a manifest describing every decision, including the ones it refused.
 */
const patchHostPresets = ({ presetDir, dshHome, apply, dryRun = false, targets = DEFAULT_TARGETS, expectedPresetDir, allowForeignPresetDir }) => {
  const manifest = { schema: SCHEMA, presetDir: presetDir === undefined ? null : presetDir, dshHome: dshHome === undefined ? null : dshHome, applied: Boolean(apply), dryRun: Boolean(dryRun), targets: {} }
  if (!isUsablePath(presetDir) || !fs.existsSync(presetDir)) return manifest
  // Refuse before writing anything when the target is not the one this run
  // detected. See targetedRootRefusal: this is the fix for a test that corrupted
  // a real preset file.
  const refusal = targetedRootRefusal({ presetDir, expectedPresetDir, allowForeignPresetDir })
  if (refusal !== null) {
    manifest.refused = refusal
    for (const name of targets) {
      manifest.targets[name] = { file: path.join(presetDir, name, 'agent.cordis.yml'), action: 'skipped', reason: refusal, backup: null, pluginPath: null }
    }
    return manifest
  }
  for (const name of targets) {
    const file = path.join(presetDir, name, 'agent.cordis.yml')
    // The backup path is DERIVED from the file every time, never read back from a
    // recorded manifest: a partial or older record would otherwise hand fs a null
    // path, which newer Node versions report as an invalid argument.
    const backupPath = file + BACKUP_SUFFIX
    const record = { file, action: 'skipped', reason: null, backup: backupPath, pluginPath: null }
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
      // The dangerous combination is a REAL preset file receiving a TEMPORARY
      // plugin path: the path outlives nothing, so it breaks the machine as soon
      // as the temporary directory is cleaned up. That is exactly what happened
      // when a test's throwaway path was written into a user's preset. A target
      // that is itself temporary is a test working inside its own tree, which is
      // the intended way to exercise this code.
      if (isTemporaryPath(pluginPath) && !isTemporaryPath(presetDir)) {
        record.reason = 'refusing to write a temporary plugin path into a real preset directory (' + presetDir + ')'
        continue
      }
      record.pluginPath = pluginPath
      if (!dryRun) {
        if (!safeExists(backupPath)) fs.copyFileSync(file, backupPath)
        const separator = text.endsWith('\n') ? '' : '\n'
        fs.writeFileSync(file, text + separator + '\n' + rowBlock(pluginPath))
      }
      record.action = dryRun ? 'would-patch' : 'patched'
      continue
    }
    if (!patched) {
      // Nothing of ours is in this file. A stray backup from an interrupted run is
      // still our litter, so take it with us rather than leaving it behind.
      if (!dryRun) record.backupRemoved = safeRemove(backupPath)
      record.action = 'not-patched'
      continue
    }
    if (!dryRun) {
      const stripped = withoutPatch(text)
      if (stripped === undefined) { record.reason = 'markers are inconsistent'; continue }
      fs.writeFileSync(file, stripped)
      // The backup exists to restore a patched file. On revert the patch is gone,
      // so keeping the backup would leave uninstall litter behind.
      record.backupRemoved = safeRemove(backupPath)
    }
    record.action = dryRun ? 'would-revert' : 'reverted'
  }
  return manifest
}

module.exports = {
  SCHEMA, MARKER_BEGIN, MARKER_END, DEFAULT_TARGETS, BACKUP_SUFFIX,
  ROW_PLUGIN_RELATIVE, rowBlock, installedPluginPath, isTemporaryPath, targetedRootRefusal,
  isPatched, withoutPatch, looksLikePreset, pluginPathFor, siblingPresetPath, resolveInstalledPlugin, patchHostPresets,
}
