#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const [sdkFileArg, projectDirArg, configDirArg] = process.argv.slice(2)
if (!sdkFileArg || !projectDirArg || !configDirArg) throw new Error('sdk module, project directory, and config directory are required')

const sdkFile = path.resolve(sdkFileArg)
const projectDir = path.resolve(projectDirArg)
const configDir = path.resolve(configDirArg)
if (!fs.statSync(sdkFile).isFile() || !fs.statSync(projectDir).isDirectory() || !fs.statSync(configDir).isDirectory()) throw new Error('fixture probe inputs must exist')
if (path.resolve(process.env.CLAUDE_CONFIG_DIR || '') !== configDir) throw new Error('fixture config must equal the isolated CLAUDE_CONFIG_DIR')

const sdk = await import(pathToFileURL(sdkFile).href)
for (const name of ['listSessions', 'getSessionInfo', 'getSessionMessages']) {
  if (typeof sdk[name] !== 'function') throw new Error('missing SDK session API: ' + name)
}

const sessionId = '11111111-1111-4111-8111-111111111111'
const userUuid = '22222222-2222-4222-8222-222222222222'
const assistantUuid = '33333333-3333-4333-8333-333333333333'
const titleUuid = '44444444-4444-4444-8444-444444444444'
const projectKey = projectDir.replace(/[^a-zA-Z0-9]/g, '-')
const transcriptDir = path.join(configDir, 'projects', projectKey)
const transcriptFile = path.join(transcriptDir, sessionId + '.jsonl')
fs.mkdirSync(transcriptDir, { recursive: true })

const entries = [
  {
    parentUuid: null,
    isSidechain: false,
    userType: 'external',
    cwd: projectDir,
    sessionId,
    version: '2.1.251',
    gitBranch: 'fixture-only',
    type: 'user',
    message: { role: 'user', content: 'DSH fixture prompt' },
    uuid: userUuid,
    timestamp: '2026-08-29T00:00:00.000Z',
  },
  {
    parentUuid: userUuid,
    isSidechain: false,
    userType: 'external',
    cwd: projectDir,
    sessionId,
    version: '2.1.251',
    gitBranch: 'fixture-only',
    type: 'assistant',
    message: {
      id: 'msg_fixture_no_model',
      type: 'message',
      role: 'assistant',
      model: 'fixture-no-model',
      content: [{ type: 'text', text: 'DSH fixture response' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
    requestId: 'req_fixture_no_model',
    uuid: assistantUuid,
    timestamp: '2026-08-29T00:00:01.000Z',
  },
  {
    parentUuid: assistantUuid,
    isSidechain: false,
    userType: 'external',
    cwd: projectDir,
    sessionId,
    version: '2.1.251',
    gitBranch: 'fixture-only',
    type: 'custom-title',
    customTitle: 'DSH synthetic session fixture',
    uuid: titleUuid,
    timestamp: '2026-08-29T00:00:02.000Z',
  },
]
const fixtureBytes = Buffer.from(entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n')
const normalizedFixtureBytes = Buffer.from(entries.map((entry) => JSON.stringify({ ...entry, cwd: '<isolated-project>' })).join('\n') + '\n')
fs.writeFileSync(transcriptFile, fixtureBytes, { flag: 'wx', mode: 0o600 })
const beforeHash = crypto.createHash('sha256').update(fs.readFileSync(transcriptFile)).digest('hex')
const normalizedHash = crypto.createHash('sha256').update(normalizedFixtureBytes).digest('hex')

const sessions = await sdk.listSessions({ dir: projectDir, limit: 2, offset: 0, includeWorktrees: false, includeProgrammatic: true })
const info = await sdk.getSessionInfo(sessionId, { dir: projectDir })
const messages = await sdk.getSessionMessages(sessionId, { dir: projectDir, limit: 5, offset: 0, includeSystemMessages: false })

const afterHash = crypto.createHash('sha256').update(fs.readFileSync(transcriptFile)).digest('hex')
if (beforeHash !== afterHash) throw new Error('session read APIs mutated the fixture transcript')
if (sessions.length !== 1 || sessions[0]?.sessionId !== sessionId) throw new Error('listSessions did not return the isolated fixture session')
if (info?.sessionId !== sessionId || info.customTitle !== 'DSH synthetic session fixture') throw new Error('getSessionInfo did not parse the isolated fixture metadata')
if (messages.length !== 2 || messages[0]?.type !== 'user' || messages[1]?.type !== 'assistant') throw new Error('getSessionMessages did not reconstruct the fixture user/assistant chain')
if (messages[0]?.uuid !== userUuid || messages[1]?.uuid !== assistantUuid) throw new Error('getSessionMessages did not preserve fixture message identity')

const summarizeInfo = (value) => ({
  session_id_matches: value.sessionId === sessionId,
  summary: value.summary,
  custom_title: value.customTitle,
  first_prompt: value.firstPrompt,
  git_branch: value.gitBranch,
  cwd_matches_fixture: value.cwd === projectDir,
  created_at: value.createdAt,
})

process.stdout.write(JSON.stringify({
  schema: 'dsh-researcher/claude-local-session-fixture-probe/v1',
  fixture: {
    provenance: 'host-authored synthetic transcript; not emitted by Claude Code or a model',
    entry_count: entries.length,
    path_normalization: 'replace every fixture cwd with <isolated-project> before canonical JSONL hashing',
    normalized_transcript_sha256: normalizedHash,
    unchanged_after_reads: true,
  },
  calls: [
    { method: 'listSessions', result_count: sessions.length, session: summarizeInfo(sessions[0]) },
    { method: 'getSessionInfo', found: true, session: summarizeInfo(info) },
    {
      method: 'getSessionMessages',
      result_count: messages.length,
      types: messages.map((message) => message.type),
      ids_match_fixture: messages[0].uuid === userUuid && messages[1].uuid === assistantUuid,
      session_ids_match: messages.every((message) => message.session_id === sessionId),
      parent_tool_use_ids: messages.map((message) => message.parent_tool_use_id),
    },
  ],
}) + '\n')
