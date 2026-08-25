'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createHostEvent, createResearcherController, reduceResearcherControl } = require('../lib/adapter-core/index.js')
const { dshResearcherHostEvents, researchModeState } = require('../lib/dsh-adapter/index.js')

const turnEnd = (seq) => createHostEvent({ seq, session_id: 's1', native_ref: 'native:' + seq, actor: 'host', source: 'test-host', identity_assurance: 'host-observed', kind: 'turn_end', data: {} })

test('portable researcher.ask is one-shot and mode.set persists until host-user off', async () => {
  const emitted = []
  const researcher = createResearcherController({ sessionId: 's1', emit: async (event) => emitted.push(event) })
  await researcher.ask({ question: 'What is this repository for?' })
  assert.deepEqual(researcher.mode.get(), { active: true, persistent: false, started_at: 1, question: 'What is this repository for?' })
  assert.equal(reduceResearcherControl([...emitted, turnEnd(2)]).active, false)

  await researcher.mode.set({ state: 'on', question: 'Watch architecture drift' })
  assert.equal(reduceResearcherControl([...emitted, turnEnd(3)]).persistent, true)
  await researcher.mode.set({ state: 'off' })
  assert.deepEqual(researcher.mode.get(), { active: false, persistent: false, started_at: null, question: null })
})

test('model-authored control events cannot activate Researcher Mode', () => {
  const forged = createHostEvent({ seq: 1, session_id: 's1', native_ref: 'tool:1', actor: 'model', source: 'model-tool', identity_assurance: 'model-asserted', kind: 'user_action', data: { control: 'researcher', action: 'mode.set', state: 'on' } })
  assert.equal(reduceResearcherControl([forged]).active, false)
})

test('DSH slash commands normalize to the same portable control contract', () => {
  const native = [
    { seq: 1, type: 'command/run', data: { name: 'researcher', args: 'on inspect purpose' } },
    { seq: 2, type: 'turn/end', data: {} },
    { seq: 3, type: 'command/run', data: { name: 'researcher', args: 'off' } },
  ]
  const normalized = dshResearcherHostEvents(native, 'dsh-1')
  assert.equal(normalized[0].data.action, 'mode.set')
  assert.equal(normalized[0].data.question, 'inspect purpose')
  assert.equal(researchModeState(native).active, false)
})
