'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { sha256File } = require('./lib.js')

const TOKENS = Object.freeze({
  '__DSH_E1_HOST_TOOL_URL__': 'hostTool',
  '__DSH_E1_DRIVER_URL__': 'driver',
})

const materializeE1Patch = ({ template, output, hostTool, driver }) => {
  let content = fs.readFileSync(template, 'utf8')
  const values = { hostTool, driver }
  for (const [token, key] of Object.entries(TOKENS)) {
    const needle = JSON.stringify(token)
    if (content.split(needle).length !== 2) throw new Error('E1 patch template must contain exactly one quoted ' + token)
    const target = path.resolve(values[key])
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error('E1 patch module is missing: ' + target)
    content = content.replace(needle, JSON.stringify(pathToFileURL(target).href))
  }
  if (Object.keys(TOKENS).some((token) => content.includes(token))) throw new Error('E1 patch template placeholder remained after materialization')
  fs.writeFileSync(output, content, { flag: 'wx' })
  return { path: output, sha256: sha256File(output) }
}

module.exports = { TOKENS, materializeE1Patch }
