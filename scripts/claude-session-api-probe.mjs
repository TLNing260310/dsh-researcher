#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const [sdkFileArg, projectDirArg] = process.argv.slice(2)
if (!sdkFileArg || !projectDirArg) throw new Error('sdk module and project directory are required')

const sdkFile = path.resolve(sdkFileArg)
const projectDir = path.resolve(projectDirArg)
if (!fs.statSync(sdkFile).isFile() || !fs.statSync(projectDir).isDirectory()) throw new Error('probe inputs must exist')

const sdk = await import(pathToFileURL(sdkFile).href)
for (const name of ['listSessions', 'getSessionInfo', 'getSessionMessages']) {
  if (typeof sdk[name] !== 'function') throw new Error('missing SDK session API: ' + name)
}

const absentSessionId = '00000000-0000-4000-8000-000000000000'
const sessions = await sdk.listSessions({ dir: projectDir, limit: 1, offset: 0, includeWorktrees: false, includeProgrammatic: true })
const info = await sdk.getSessionInfo(absentSessionId, { dir: projectDir })
const messages = await sdk.getSessionMessages(absentSessionId, { dir: projectDir, limit: 1, offset: 0, includeSystemMessages: false })

if (!Array.isArray(sessions) || sessions.length !== 0) throw new Error('fresh isolated config unexpectedly exposed sessions')
if (info !== undefined) throw new Error('absent isolated session unexpectedly returned metadata')
if (!Array.isArray(messages) || messages.length !== 0) throw new Error('absent isolated session unexpectedly returned messages')

process.stdout.write(JSON.stringify({
  schema: 'dsh-researcher/claude-session-api-probe/v1',
  calls: [
    { method: 'listSessions', result_kind: 'array', result_count: sessions.length },
    { method: 'getSessionInfo', result_kind: 'undefined', found: false },
    { method: 'getSessionMessages', result_kind: 'array', result_count: messages.length },
  ],
}) + '\n')
