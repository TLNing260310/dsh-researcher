'use strict'

const HOST_EVENT_SCHEMA = 'project-cognition/host-event/v1'
const RESEARCHER_CONTROL_SCHEMA = 'project-cognition/researcher-control/v1'
const HOST_EVENT_KINDS = Object.freeze([
  'user_action', 'tool_call', 'tool_result', 'goal_transition', 'usage',
  'turn_end', 'session_resume', 'guard_violation',
])

const plainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const nonEmpty = (value, label) => {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(label + ' must be a non-empty string')
  return value
}

const createHostEvent = ({ seq, session_id, runtime_goal_id = null, native_ref, actor, source, identity_assurance, kind, data = {} }) => {
  if (!Number.isSafeInteger(seq) || seq < 1) throw new Error('HostEvent seq must be a positive safe integer')
  if (!HOST_EVENT_KINDS.includes(kind)) throw new Error('unsupported HostEvent kind: ' + kind)
  if (!plainObject(data)) throw new Error('HostEvent data must be an object')
  return Object.freeze({
    schema: HOST_EVENT_SCHEMA,
    seq,
    session_id: nonEmpty(session_id, 'HostEvent session_id'),
    runtime_goal_id: runtime_goal_id === null ? null : nonEmpty(String(runtime_goal_id), 'HostEvent runtime_goal_id'),
    native_ref: nonEmpty(native_ref, 'HostEvent native_ref'),
    actor: nonEmpty(actor, 'HostEvent actor'),
    source: nonEmpty(source, 'HostEvent source'),
    identity_assurance: nonEmpty(identity_assurance, 'HostEvent identity_assurance'),
    kind,
    data: Object.freeze({ ...data }),
  })
}

const initialResearcherState = () => ({ active: false, persistent: false, started_at: null, question: null })

const reduceResearcherControl = (events) => {
  let state = initialResearcherState()
  for (const event of events || []) {
    if (!event || event.schema !== HOST_EVENT_SCHEMA) continue
    if (event.kind === 'user_action' && event.data && event.data.control === 'researcher') {
      if (event.actor !== 'host_user' || event.identity_assurance !== 'host-authenticated') continue
      if (event.data.action === 'ask') state = { active: true, persistent: false, started_at: event.seq, question: event.data.question }
      if (event.data.action === 'mode.set' && event.data.state === 'on') state = { active: true, persistent: true, started_at: event.seq, question: event.data.question || null }
      if (event.data.action === 'mode.set' && event.data.state === 'off') state = initialResearcherState()
    }
    if (event.kind === 'turn_end' && state.active && !state.persistent && event.seq > state.started_at) state = initialResearcherState()
  }
  return state
}

const createResearcherController = ({ sessionId, emit, initialEvents = [] }) => {
  nonEmpty(sessionId, 'sessionId')
  if (typeof emit !== 'function') throw new Error('emit must be a function')
  const events = [...initialEvents]
  const publish = async (data) => {
    const event = createHostEvent({
      seq: events.length + 1,
      session_id: sessionId,
      native_ref: 'researcher-control:' + (events.length + 1),
      actor: 'host_user',
      source: RESEARCHER_CONTROL_SCHEMA,
      identity_assurance: 'host-authenticated',
      kind: 'user_action',
      data: { control: 'researcher', ...data },
    })
    await emit(event)
    events.push(event)
    return { accepted: true, event, state: reduceResearcherControl(events) }
  }
  return Object.freeze({
    ask: ({ question }) => publish({ action: 'ask', question: nonEmpty(question, 'question') }),
    mode: Object.freeze({
      set: ({ state, question } = {}) => {
        if (!['on', 'off'].includes(state)) throw new Error('researcher.mode.set state must be on or off')
        if (state === 'off' && question !== undefined) throw new Error('researcher.mode.set off cannot carry a question')
        return publish({ action: 'mode.set', state, ...(question === undefined ? {} : { question: nonEmpty(question, 'question') }) })
      },
      get: () => reduceResearcherControl(events),
    }),
  })
}

module.exports = {
  HOST_EVENT_SCHEMA,
  RESEARCHER_CONTROL_SCHEMA,
  HOST_EVENT_KINDS,
  createHostEvent,
  initialResearcherState,
  reduceResearcherControl,
  createResearcherController,
}
