// DSH home-level patch: register `research-entry` in `$DSH_HOME/cordis.patch.yml`.
//
// Why this replaces editing the shipped presets
// ---------------------------------------------
// The first implementation appended a row to each shipped preset's
// `agent.cordis.yml` (`minimal`, `standard`, `cordis`, `ptc`). Those files live
// inside the DSH installation under `node_modules`, so:
//
//   1. Every DSH upgrade overwrites them and silently removes `/research`.
//   2. The installer has to keep a `.dsh-researcher-original` copy inside the
//      deployment's own tree, and a crash between the two writes leaves a preset
//      pointing at a plugin that may not exist.
//   3. Reverting has to reconstruct the original bytes. That reconstruction was
//      wrong once — it normalized whitespace and silently edited one byte of
//      `cordis` — because "remove what I added" was implemented as "rewrite the
//      file".
//
// `$DSH_HOME/cordis.patch.yml` is the machine-local patch layer DSH applies OVER
// every profile's own layer. It lives under the user's DSH home, which no DSH
// upgrade touches, so the entry point survives an upgrade with no repair step.
// It needs no backup inside the DSH install, and there is no shipped file to
// reconstruct.
//
// The entry mounts the plugin on the HOST plane. `commands.register` there is
// global, and a host-plane command is visible to a session running on a shipped
// preset. That was verified against this deployment before adopting this form:
// a throwaway agent composed from `minimal`, `standard`, and `ptc` each resolved
// `/research` while the host preset files were byte-identical to the published
// package.
//
// Reversibility is a marker search over one file we own, not a rewrite of a file
// that belongs to the deployment.
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const PATCH_FILENAME = 'cordis.patch.yml'
const MARKER_BEGIN = '# >>> dsh-researcher: research-entry (home patch layer) >>>'
const MARKER_END = '# <<< dsh-researcher: research-entry <<<'
const SCHEMA = 'dsh-researcher/home-patch/v1'

/** The user's home patch layer path for one DSH home. */
const homePatchPath = (dshHome) => path.join(dshHome, PATCH_FILENAME)

/** The plugin path the inserted row should carry. */
const installedPluginPath = (dshHome) =>
  path.join(dshHome, '.dsh-researcher', 'runtime', 'plugins', 'research-entry', 'index.js')

/**
 * Where the runtime lives for an install that predates the relocation.
 *
 * The first layout kept the runtime inside the installed preset
 * (`<dshHome>/.agent-presets/researcher/plugins/...`). An upgrade of this
 * installer must still find that path so the row it writes keeps working until
 * the runtime is moved.
 */
const legacyPluginPath = (dshHome) =>
  path.join(dshHome, '.agent-presets', 'researcher', 'plugins', 'research-entry', 'index.js')

/** Pick the plugin path that actually exists, preferring the relocated runtime. */
const resolvePluginPath = (dshHome) => {
  for (const candidate of [installedPluginPath(dshHome), legacyPluginPath(dshHome)]) {
    try {
      if (fs.existsSync(candidate)) return candidate
    } catch (error) { /* try the next */ }
  }
  return undefined
}

const isUsablePath = (value) => typeof value === 'string' && value.length > 0

/** Forward slashes and YAML-safe quoting: the value is an absolute Windows path. */
const yamlPath = (value) => "'" + String(value).replace(/\\/gu, '/').replace(/'/gu, "''") + "'"

/** The block this module appends, for one concrete plugin path. */
const entryBlock = (pluginPath) => [
  MARKER_BEGIN,
  '# `/research <task>` enters read-only research in the CURRENT session; the main',
  '# agent keeps executing. Remove everything between these two markers to disable',
  '# it, or delete this file if it holds nothing else.',
  '#',
  '# This lives in the home patch layer rather than inside a shipped preset: the',
  '# layer is applied over every profile and DSH upgrades do not touch it, so the',
  '# command survives an upgrade without being reinstalled.',
  '- insert:',
  '    - id: research-entry',
  '      name: ' + yamlPath(pluginPath),
  MARKER_END,
].join('\n')

const isPatched = (text) => text.includes(MARKER_BEGIN) && text.includes(MARKER_END)

/**
 * Remove one block, keeping everything else byte-identical.
 *
 * The append is `text + '\n' + block`, so the inverse removes the block plus the
 * single separating newline. Nothing else is rewritten: an earlier sibling
 * module normalized whitespace here and corrupted a file it did not own.
 */
const withoutEntry = (text) => {
  const begin = text.indexOf(MARKER_BEGIN)
  const end = text.indexOf(MARKER_END)
  if (begin === -1 || end === -1 || end < begin) return undefined
  let head = text.slice(0, begin)
  let tail = text.slice(end + MARKER_END.length)
  if (head.endsWith('\n')) head = head.slice(0, -1)
  if (tail.startsWith('\n')) tail = tail.slice(1)
  return head + tail
}

/**
 * Whether a file holds nothing but the empty-list literal.
 *
 * `cordis.patch.yml` ships as `[]`, which is a valid empty patch list rather
 * than blank space. Appending after it would produce `[]\n- insert:` — invalid
 * YAML — so an untouched template is replaced, not appended to.
 */
const isEmptyListTemplate = (text) => {
  const meaningful = text
    .split('\n')
    .filter((line) => line.trim().length > 0 && !line.trimStart().startsWith('#'))
  return meaningful.length === 1 && meaningful[0].trim() === '[]'
}

/**
 * Apply or revert the home patch.
 *
 * @param {object} options
 * @param {string|undefined} options.dshHome - the DSH home holding the patch layer.
 * @param {boolean} options.apply - true to install the entry, false to remove it.
 * @param {boolean} [options.dryRun] - compute the result without writing.
 * @returns a manifest describing what was decided.
 */
const patchHomeLayer = ({ dshHome, apply, dryRun = false }) => {
  const manifest = { schema: SCHEMA, dshHome: dshHome === undefined ? null : dshHome, file: null, applied: Boolean(apply), dryRun: Boolean(dryRun), action: 'skipped', reason: null, pluginPath: null }
  if (!isUsablePath(dshHome)) { manifest.reason = 'no DSH home to patch'; return manifest }
  const file = homePatchPath(dshHome)
  manifest.file = file

  let text
  try {
    text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined
  } catch (error) {
    manifest.reason = 'unreadable: ' + (error && error.message ? error.message : String(error))
    return manifest
  }
  const present = text !== undefined && isPatched(text)

  if (apply) {
    if (present) { manifest.action = 'already-patched'; return manifest }
    const pluginPath = resolvePluginPath(dshHome)
    if (pluginPath === undefined) {
      manifest.reason = 'research-entry runtime is not installed under ' + dshHome
      return manifest
    }
    manifest.pluginPath = pluginPath
    if (!dryRun) {
      try {
        if (text === undefined) {
          fs.writeFileSync(file, '# dsh-researcher research entry\n' + entryBlock(pluginPath) + '\n')
        } else if (isEmptyListTemplate(text)) {
          // Replace the untouched `[]` template, preserving any comments above it.
          const body = text.replace(/^[ \t]*\[\][ \t]*$/mu, entryBlock(pluginPath))
          fs.writeFileSync(file, body.endsWith('\n') ? body : body + '\n')
        } else {
          const separator = text.endsWith('\n') ? '' : '\n'
          fs.writeFileSync(file, text + separator + entryBlock(pluginPath) + '\n')
        }
      } catch (error) {
        manifest.reason = 'write failed: ' + (error && error.message ? error.message : String(error))
        return manifest
      }
    }
    manifest.action = dryRun ? 'would-patch' : 'patched'
    return manifest
  }

  if (!present) {
    manifest.action = 'not-patched'
    return manifest
  }
  if (!dryRun) {
    const stripped = withoutEntry(text)
    if (stripped === undefined) { manifest.reason = 'markers are inconsistent'; return manifest }
    try {
      // A file that held only our entry is removed rather than left as an empty
      // husk: leaving a stray file in DSH_HOME is the kind of residue that makes
      // an uninstall unverifiable.
      const rest = stripped
        .split('\n')
        .filter((line) => line.trim().length > 0 && !line.trimStart().startsWith('#'))
      if (rest.length === 0) fs.rmSync(file, { force: true })
      else fs.writeFileSync(file, stripped.endsWith('\n') ? stripped : stripped + '\n')
    } catch (error) {
      manifest.reason = 'write failed: ' + (error && error.message ? error.message : String(error))
      return manifest
    }
  }
  manifest.action = dryRun ? 'would-revert' : 'reverted'
  return manifest
}

module.exports = {
  SCHEMA, PATCH_FILENAME, MARKER_BEGIN, MARKER_END,
  homePatchPath, installedPluginPath, legacyPluginPath, resolvePluginPath,
  entryBlock, isPatched, withoutEntry, isEmptyListTemplate, patchHomeLayer,
}
