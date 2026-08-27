// Feedback core — pure extraction and redaction. No network, no upload.
//
// Level 1 (default): anonymous run metrics only — no prompts, no paths, no
// code, no repo identity. Level 2 (--claims): adds redacted claim summaries
// (statement + tier + verdict + confidence; evidence refs reduced to
// basenames). The bundle is LOCAL: the user decides what to share and where.
// DO_NOT_TRACK is respected as a hint for tooling; this module never
// transmits anything.
const REDACT_PATHS = true
const RESEARCHER_VERSION = require('../package.json').version
const FEEDBACK_SCHEMA = 'dsh-researcher/feedback/v1'
const FORBIDDEN_KEYS = new Set([
  'prompt', 'prompts', 'response', 'responses', 'transcript', 'transcripts',
  'code', 'diff', 'absolute_path', 'absolute_paths', 'repo_url', 'repository_url',
  'git_remote', 'remote_url', 'environment_variables', 'env', 'secrets', 'api_key',
])

const toolNameOf = (name) => name

const textOf = (content) => {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((b) => textOf(b)).join('\n')
  if (content && typeof content === 'object') {
    if (typeof content.text === 'string') return content.text
    if (content.content !== undefined) return textOf(content.content)
  }
  return ''
}

const extractMetrics = (events) => {
  const metrics = {
    researcher_version: RESEARCHER_VERSION,
    preset: null,
    permission: null,
    certificate: null,
    session_duration_sec: null,
    tool_calls: {},
    checkpoint_calls: 0,
    claims_created: 0,
    claims_revised: 0,
    hypotheses_invalidated: 0,
    decision: null,
    goal_decision: null,
    session_completed: false,
    error_codes: [],
  }
  let firstTime = null
  let lastTime = null
  let finalText = ''
  const seenClaimIds = new Set()
  const finalHypotheses = new Map()
  const callsById = new Map()

  for (const event of Array.isArray(events) ? events : []) {
    if (!event || typeof event !== 'object') continue
    const t = typeof event.time === 'number' ? event.time : null
    if (t !== null) {
      if (firstTime === null || t < firstTime) firstTime = t
      if (lastTime === null || t > lastTime) lastTime = t
    }
    if (event.type === 'session') metrics.preset = event.agentPreset
    if (event.type === 'permission/preset' && event.data) metrics.permission = event.data.preset
    if (event.type === 'tool/call' && event.data) {
      const name = toolNameOf(event.data.name)
      if (event.data.callId !== undefined) callsById.set(String(event.data.callId), name)
      metrics.tool_calls[name] = (metrics.tool_calls[name] || 0) + 1
      let args = event.data.arguments
      if (typeof args === 'string') { try { args = JSON.parse(args) } catch { args = null } }
      if (name === 'research_checkpoint' && args) {
        metrics.checkpoint_calls++
        for (const claim of args.revise || []) {
          if (!seenClaimIds.has(claim.id)) {
            seenClaimIds.add(claim.id)
            metrics.claims_created++
          } else {
            metrics.claims_revised++
          }
        }
        for (const h of args.hypotheses || []) {
          finalHypotheses.set(h.id, h.status || 'active')
        }
      }
      if (name === 'research_doctor' && args === null) { /* doctor args are empty */ }
    }
    if (event.type === 'tool/result' && event.data) {
      const message = event.data.message
      const isError = event.data.isError || event.data.error || message && message.isError
      if (isError) {
        const code = event.data.code || event.data.error && event.data.error.code || 'error'
        if (!metrics.error_codes.includes(code)) metrics.error_codes.push(code)
      }
      const content = event.data.content !== undefined ? event.data.content : message && message.content
      const text = textOf(content)
      const overall = text.match(/Overall:\s*(\w+)/)
      if (overall && text.includes('Researcher Runtime Certificate')) metrics.certificate = overall[1]
      const callId = event.data.callId || event.data.call_id || message && (message.callId || message.call_id || message.toolCallId || message.tool_call_id)
      if (!isError && callId !== undefined && callsById.get(String(callId)) === 'request_goal_decision') {
        try {
          const decoded = JSON.parse(text)
          const decision = String(decoded.decision || '').toUpperCase()
          if (['ALREADY_SATISFIED', 'CONTINUE', 'NEEDS_HUMAN', 'DONE', 'BLOCKED', 'STOPPED', 'CANCELLED'].includes(decision)) metrics.goal_decision = decision
        } catch { /* malformed governor output is not completion evidence */ }
      }
    }
    if (event.type === 'assistant/message' || event.type === 'assistant/chunk') {
      const d = event.data
      const content = d && (d.content || d.text || d.message)
      // Accumulate chunks: the final message arrives fragmented; the last
      // chunk alone would be a meaningless fragment.
      const text = textOf(content)
      if (text.length > 0) finalText += text
    }
    if ((event.type === 'project-cognition/goal-decision' || event.type === 'goal/decision') && event.data) {
      const decision = String(event.data.decision || '').toUpperCase()
      if (['ALREADY_SATISFIED', 'CONTINUE', 'NEEDS_HUMAN', 'DONE', 'BLOCKED', 'STOPPED', 'CANCELLED'].includes(decision)) {
        metrics.goal_decision = decision
      }
    }
  }

  for (const status of finalHypotheses.values()) {
    if (status === 'invalidated') metrics.hypotheses_invalidated++
  }
  if (firstTime !== null && lastTime !== null) metrics.session_duration_sec = Math.round((lastTime - firstTime) / 1000)
  metrics.session_completed = metrics.goal_decision === 'DONE' || metrics.goal_decision === 'ALREADY_SATISFIED'

  // Scan recommendation labels as mutually-exclusive tokens. Matching BUILD
  // independently would also count the BUILD substring in DON'T BUILD.
  const recommendationCounts = { BUILD: 0, "DON'T_BUILD": 0, INVESTIGATE: 0 }
  const labels = finalText.match(/\bDON(?:'|’)?T\s+BUILD\b|\bINVESTIGATE\b|\bBUILD\b/gi) || []
  for (const label of labels) {
    const normalized = label.toUpperCase().replace('’', "'").replace(/\s+/g, ' ')
    if (/^DON'?T BUILD$/.test(normalized)) recommendationCounts["DON'T_BUILD"]++
    else if (normalized === 'INVESTIGATE') recommendationCounts.INVESTIGATE++
    else if (normalized === 'BUILD') recommendationCounts.BUILD++
  }
  const counts = Object.entries(recommendationCounts).sort((a, b) => b[1] - a[1])
  if (counts[0][1] > 0 && (counts.length === 1 || counts[0][1] > counts[1][1])) metrics.decision = counts[0][0]

  return metrics
}

const redactEvidence = (evidence) => {
  if (!Array.isArray(evidence)) return []
  if (!REDACT_PATHS) return evidence
  return evidence.map((ref) => String(ref).split(/[/\\]/).pop()).filter((x) => x && x.length > 0).slice(0, 6)
}

const extractClaims = (events) => {
  const claims = new Map()
  for (const event of Array.isArray(events) ? events : []) {
    if (!event || event.type !== 'tool/call' || !event.data || event.data.name !== 'research_checkpoint') continue
    let args = event.data.arguments
    if (typeof args === 'string') { try { args = JSON.parse(args) } catch { args = null } }
    if (!args) continue
    for (const claim of args.revise || []) {
      const previous = claims.get(claim.id) || {}
      // Mirror the reducer's merge semantics: fields omitted in a revision
      // keep their previous values (the bundle shows the final state).
      const next = {
        id: claim.id,
        statement: String(claim.statement !== undefined ? claim.statement : previous.statement || '').slice(0, 300),
        tier: claim.tier !== undefined ? claim.tier : previous.tier,
        verdict: claim.verdict !== undefined ? claim.verdict : previous.verdict,
        confidence: typeof claim.confidence === 'number' ? claim.confidence : (typeof previous.confidence === 'number' ? previous.confidence : null),
        evidence_basenames: claim.evidence !== undefined ? redactEvidence(claim.evidence) : previous.evidence_basenames,
      }
      claims.set(claim.id, next)
    }
  }
  return [...claims.values()]
}

const buildBundle = (events, options = {}) => {
  const bundle = {
    schema: FEEDBACK_SCHEMA,
    generated_at: new Date().toISOString(),
    level: options.includeClaims ? 2 : 1,
    metrics: extractMetrics(events),
  }
  if (options.includeClaims) bundle.claims = extractClaims(events)
  return bundle
}

const plainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

const validateBundle = (bundle) => {
  const errors = []
  if (!plainObject(bundle)) return ['bundle must be an object']
  if (bundle.schema !== FEEDBACK_SCHEMA) errors.push('schema must be ' + FEEDBACK_SCHEMA)
  if (![1, 2].includes(bundle.level)) errors.push('level must be 1 or 2')
  if (typeof bundle.generated_at !== 'string' || Number.isNaN(Date.parse(bundle.generated_at))) errors.push('generated_at must be an ISO timestamp')
  if (!plainObject(bundle.metrics)) errors.push('metrics must be an object')
  if (bundle.level === 1 && Object.prototype.hasOwnProperty.call(bundle, 'claims')) errors.push('Level 1 bundles must not contain claims')
  if (bundle.level === 2 && !Array.isArray(bundle.claims)) errors.push('Level 2 bundles must contain a claims array')

  const visit = (value, label) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, label + '[' + index + ']'))
      return
    }
    if (!plainObject(value)) return
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) errors.push(label + '.' + key + ' is a forbidden sensitive field')
      visit(item, label + '.' + key)
    }
  }
  visit(bundle, 'bundle')
  return [...new Set(errors)]
}

module.exports = { FEEDBACK_SCHEMA, extractMetrics, extractClaims, buildBundle, redactEvidence, validateBundle }
