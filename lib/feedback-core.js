// Feedback core — pure extraction and redaction. No network, no upload.
//
// Level 1 (default): anonymous run metrics only — no prompts, no paths, no
// code, no repo identity. Level 2 (--claims): adds redacted claim summaries
// (statement + tier + verdict + confidence; evidence refs reduced to
// basenames). The bundle is LOCAL: the user decides what to share and where.
// DO_NOT_TRACK is respected as a hint for tooling; this module never
// transmits anything.
const REDACT_PATHS = true

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
    researcher_version: '0.6.0-wip',
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
    session_completed: false,
    error_codes: [],
  }
  let firstTime = null
  let lastTime = null
  let finalText = ''
  const seenClaimIds = new Set()
  const finalHypotheses = new Map()

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
      if (event.data.isError) {
        const code = event.data.code || 'error'
        if (!metrics.error_codes.includes(code)) metrics.error_codes.push(code)
      }
      const content = event.data.content
      const text = textOf(content)
      const overall = text.match(/Overall:\s*(\w+)/)
      if (overall && text.includes('Researcher Runtime Certificate')) metrics.certificate = overall[1]
    }
    if (event.type === 'assistant/message' || event.type === 'assistant/chunk') {
      const d = event.data
      const content = d && (d.content || d.text || d.message)
      // Accumulate chunks: the final message arrives fragmented; the last
      // chunk alone would be a meaningless fragment.
      const text = textOf(content)
      if (text.length > 0) finalText += text
    }
  }

  for (const status of finalHypotheses.values()) {
    if (status === 'invalidated') metrics.hypotheses_invalidated++
  }
  if (firstTime !== null && lastTime !== null) metrics.session_duration_sec = Math.round((lastTime - firstTime) / 1000)
  metrics.session_completed = finalText.includes('研究报告') || finalText.includes('Project Model') || finalText.includes('证据台账')
  const buildMatch = finalText.match(/BUILD/g)
  const dontMatch = finalText.match(/DON'T\s*BUILD/g)
  const investMatch = finalText.match(/INVESTIGATE/g)
  const counts = [
    ['BUILD', buildMatch ? buildMatch.length : 0],
    ['DON\'T_BUILD', dontMatch ? dontMatch.length : 0],
    ['INVESTIGATE', investMatch ? investMatch.length : 0],
  ].sort((a, b) => b[1] - a[1])
  if (counts[0][1] > 0) metrics.decision = counts[0][0]

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
    schema: 'dsh-researcher/feedback/v1',
    generated_at: new Date().toISOString(),
    level: options.includeClaims ? 2 : 1,
    metrics: extractMetrics(events),
  }
  if (options.includeClaims) bundle.claims = extractClaims(events)
  return bundle
}

module.exports = { extractMetrics, extractClaims, buildBundle, redactEvidence }
