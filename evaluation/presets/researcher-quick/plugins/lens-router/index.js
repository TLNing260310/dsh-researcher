// lens-router — 研究模式的注意力路由器。
//
// 解决什么：研究模式的瓶颈不是"模型不够聪明"，是**注意力落点**。本插件给定一个任务，
// 从透镜库（docs/kb/clean/**/*.json）里确定性地选出少量审查视角，并产出一份
// **可审计的 Route Manifest**——写明选了哪些、**跳过了哪些以及为什么**、哪些无法评估。
//
// 设计纪律（三条，均为外部实测结论，见 THIRD-PARTY-NOTICES.md）：
//   1. **只有显式门禁决定"要不要查"**；其它信号只用于"选哪条"。
//      依据：dsh-learn-wiki 实测——"检索未命中"太廉价（任何新话题都会未命中），
//      故触发器改为"挣扎"；我们进一步收紧为**只有人类显式调用**。
//   2. **绝不用近似但错误的透镜充数**。依据：twiceshy——注入近似错误的经验会主动
//      损害 agent。低于阈值的透镜进 `unassessable`，不硬塞。
//   3. **选择必须可见**。`skipped` 与 `unassessable` 是必需字段，不是可选项。
//
// 无第三方运行时依赖。纯函数，可离线复算。
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const MANIFEST_SCHEMA = 'dsh-researcher/route-manifest/v1'
const RRF_K = 60

// ── 门禁：三条放行线索（任一命中即视为"用户明确要求"） ──────────────────────
// 原则与 dsh-company-kb/lib/gate.js 一致：会话粘性 / 触发词 + 否定窗口 / 路径点名。
const DENIAL = /(?:不要|不用|不需要|无需|无须|禁止|关闭|停用|停掉|别再|别用|不使用|不涉及|不包含|不含|无关|不查|不查询|不检索|不搜索|不搜|不看|不引用|no\b|don't|dont|do not|without|disable)/iu

const REFUSAL_TEXT = [
  '透镜库在本会话尚未启用，因此没有执行路由。',
  '这不是错误：本插件的设计就是"只有用户明确要求时才检索审查视角"。',
  '如果确实需要，请由用户显式调用（例如 /research <任务>）。',
  '在此之前，请基于其它信息继续，**不要反复询问是否启用透镜库**。',
].join('')

/** 本轮"直接用户消息"文本：只取 source.kind === 'user' 的消息，排除插件注入与技能内容。 */
function currentDirectUserText(agent) {
  const events = agent && agent.session && typeof agent.session.snapshotEvents === 'function'
    ? agent.session.snapshotEvents()
    : undefined
  if (!Array.isArray(events)) return ''
  let turnStart = -1
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index] && events[index].type === 'turn/start') { turnStart = index; break }
  }
  return events.slice(turnStart + 1)
    .filter((event) => event && event.type === 'user/message')
    .map((event) => event.data)
    .filter((message) => message && message.source && message.source.kind === 'user')
    .flatMap((message) => message.content || [])
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
}

const clausesOf = (text) => String(text)
  .toLocaleLowerCase('zh-CN')
  .split(/[。！？!?；;\n，,、]+/u)
  .map((clause) => clause.trim())
  .filter(Boolean)

/** 触发词命中，且同子句 24 字窗口内无否定词。 */
function clauseHasTrigger(clause, triggers) {
  for (const trigger of triggers) {
    if (typeof trigger !== 'string' || trigger.length === 0) continue
    const at = clause.indexOf(trigger.toLocaleLowerCase('zh-CN'))
    if (at === -1) continue
    const window = clause.slice(Math.max(0, at - 24), at + trigger.length + 24)
    if (DENIAL.test(window)) continue
    return true
  }
  return false
}

function explicitlyRequested(text, triggers) {
  if (typeof text !== 'string' || text.trim().length === 0) return false
  return clausesOf(text).some((clause) => clauseHasTrigger(clause, triggers))
}

// ── 透镜库加载 ────────────────────────────────────────────────────────────
function collectJsonFiles(dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectJsonFiles(full))
    else if (entry.name.endsWith('.json')) out.push(full)
  }
  return out.sort()
}

/** 校验一条透镜的最小契约。返回缺失字段名数组（空数组=合格）。 */
function lensDefects(lens) {
  const defects = []
  for (const field of ['lens', 'name', 'domain', 'trigger', 'questions', 'failure_modes', 'alternatives', 'evidence_anchors', 'tags', 'sources', 'provenance']) {
    if (lens == null || lens[field] === undefined || lens[field] === null) defects.push(field)
  }
  if (Array.isArray(lens && lens.questions) && lens.questions.length < 3) defects.push('questions<3')
  if (Array.isArray(lens && lens.failure_modes) && lens.failure_modes.length === 0) defects.push('failure_modes=0')
  return defects
}

function loadLenses(kbRoot) {
  const lenses = []
  const rejected = []
  for (const file of collectJsonFiles(kbRoot)) {
    let parsed
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (error) {
      rejected.push({ file: path.relative(kbRoot, file), reason: 'invalid JSON' })
      continue
    }
    if (!Array.isArray(parsed)) {
      rejected.push({ file: path.relative(kbRoot, file), reason: 'not an array' })
      continue
    }
    for (const lens of parsed) {
      const defects = lensDefects(lens)
      if (defects.length > 0) rejected.push({ lens: lens && lens.lens, file: path.relative(kbRoot, file), reason: defects.join(',') })
      else lenses.push(lens)
    }
  }
  return { lenses, rejected }
}

// ── 信号扫描（确定性，只读仓库事实） ──────────────────────────────────────
const DEPENDENCY_FILES = ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle', 'requirements.txt']
const PROBE_PATHS = [
  'migrations', 'db/migration', 'alembic', 'prisma', 'providers', 'adapters', 'plugins',
  'mcp.json', '.mcp.json', 'Dockerfile', 'docker-compose.yml', 'k8s', 'deploy', 'helm',
  '.github/workflows', 'prometheus', 'grafana', 'opentelemetry', 'terraform',
]
const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'poetry.lock', 'go.sum', 'Cargo.lock']

/** 确定性信号扫描：只读仓库事实，不做任何推断。maxFiles 限制避免大仓库失控。 */
function scanSignals(root, options) {
  const maxFiles = (options && options.maxFiles) || 4000
  const signals = []
  let seen = 0

  for (const name of PROBE_PATHS) {
    const target = path.join(root, ...name.split('/'))
    if (fs.existsSync(target)) signals.push({ id: 'structure:' + name, kind: 'structure', evidence: name, weight: 2 })
  }
  for (const name of LOCKFILES) {
    if (fs.existsSync(path.join(root, name))) signals.push({ id: 'lockfile:' + name, kind: 'structure', evidence: name, weight: 1 })
  }
  for (const name of DEPENDENCY_FILES) {
    const target = path.join(root, name)
    if (!fs.existsSync(target)) continue
    let text = ''
    try { text = fs.readFileSync(target, 'utf8') } catch (error) { continue }
    const deps = new Set()
    for (const match of text.matchAll(/["']([@a-zA-Z0-9._/-]{2,60})["']\s*:/g)) deps.add(match[1])
    for (const match of text.matchAll(/^\s*([a-zA-Z0-9._-]{2,60})\s*[=><~]/gm)) deps.add(match[1])
    for (const dep of [...deps].sort()) {
      if (seen >= maxFiles) break
      seen += 1
      signals.push({ id: 'dep:' + dep, kind: 'dependency', evidence: name + ' -> ' + dep, weight: 2 })
    }
  }
  return { signals, truncated: seen >= maxFiles }
}

// ── 打分与选择（确定性；RRF 只用于并列时打破平局） ────────────────────────
const TAG_WEIGHT = { structure: 2, symptom: 2, stack: 1, store: 1, surface: 1 }

/** 把任务文本与仓库信号折成一组小写词元，用于与透镜标签求交。 */
function tokensOf(text) {
  const tokens = new Set()
  for (const raw of String(text).toLocaleLowerCase('zh-CN').split(/[^a-z0-9\u4e00-\u9fff+#._-]+/u)) {
    if (raw.length >= 2) tokens.add(raw)
  }
  return tokens
}

function scoreLens(lens, signals, taskTokens) {
  const why = []
  let score = 0
  const signalIds = new Set(signals.map((s) => s.id))
  for (const anchor of lens.evidence_anchors || []) {
    const key = String(anchor).toLocaleLowerCase('en-US')
    for (const id of signalIds) {
      const tail = id.slice(id.indexOf(':') + 1).toLocaleLowerCase('en-US')
      if (tail.length >= 3 && (key.includes(tail) || tail.includes(key))) {
        score += 2
        why.push('anchor:' + id)
        break
      }
    }
  }
  const tags = lens.tags || {}
  for (const category of Object.keys(TAG_WEIGHT)) {
    const values = Array.isArray(tags[category]) ? tags[category] : []
    let hits = 0
    for (const value of values) {
      const folded = String(value).toLocaleLowerCase('en-US')
      if (taskTokens.has(folded) || [...taskTokens].some((t) => folded.includes(t) || t.includes(folded))) {
        hits += 1
        if (hits <= 2) why.push('tag:' + category + ':' + value)
      }
    }
    if (hits > 0) score += TAG_WEIGHT[category] * Math.min(hits, 3)
  }
  return { score, why }
}

/** RRF：只融合名次，避免不同量纲直接相加（与 dsh-company-kb 的取舍一致）。 */
function reciprocalRankFusion(rankLists) {
  const fused = new Map()
  for (const list of rankLists) {
    list.forEach((id, index) => {
      fused.set(id, (fused.get(id) || 0) + 1 / (RRF_K + index + 1))
    })
  }
  return fused
}

const GAP_DOMAINS = ['state-consistency', 'failure-resilience']
const DEFAULT_TOP_N = 6

/**
 * 产出一份 Route Manifest。
 * @returns manifest，其中 selected / skipped / unassessable 三个字段均为必需。
 */
function route(request) {
  const { lenses, rejected } = loadLenses(request.kbRoot)
  const signals = request.signals || []
  const task = request.task || ''
  const topN = request.topN || DEFAULT_TOP_N
  const minScore = request.minScore === undefined ? 2 : request.minScore
  const taskTokens = tokensOf(task)

  const scored = lenses.map((lens) => {
    const { score, why } = scoreLens(lens, signals, taskTokens)
    return { lens, score, why }
  })

  // 缺口域强制覆盖：state-consistency 与 failure-resilience 各至少一条。
  const forced = []
  for (const domain of GAP_DOMAINS) {
    const pool = scored.filter((entry) => entry.lens.domain === domain).sort((a, b) => b.score - a.score)
    if (pool.length > 0) forced.push(pool[0])
  }

  const ranked = scored.slice().sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const aId = a.lens.lens || ''
    const bId = b.lens.lens || ''
    if (aId === bId) return 0
    return aId < bId ? -1 : 1
  })

  const selected = []
  const selectedIds = new Set()
  const push = (entry, reason) => {
    if (entry === undefined || selectedIds.has(entry.lens.lens)) return
    if (selected.length >= topN) return
    selectedIds.add(entry.lens.lens)
    selected.push({
      lens: entry.lens.lens,
      name: entry.lens.name,
      domain: entry.lens.domain,
      score: entry.score,
      why: entry.why,
      forced: reason === 'gap-domain',
      questions: entry.lens.questions,
    })
  }
  for (const entry of forced) push(entry, 'gap-domain')
  for (const entry of ranked) if (entry.score >= minScore) push(entry, 'score')

  const skipped = scored
    .filter((entry) => !selectedIds.has(entry.lens.lens) && entry.score > 0 && entry.score < minScore)
    .map((entry) => ({ lens: entry.lens.lens, score: entry.score, why: 'below minScore ' + minScore }))

  // 近似但错误的透镜绝不硬塞：证据锚点一个都没命中的，标为无法评估。
  const unassessable = scored
    .filter((entry) => !selectedIds.has(entry.lens.lens) && entry.score === 0)
    .map((entry) => ({ lens: entry.lens.lens, domain: entry.lens.domain, why: 'no evidence anchor and no tag matched this repository' }))

  return {
    schema: MANIFEST_SCHEMA,
    guarantee: request.guarantee || 'UNSPECIFIED',
    task,
    corpus: { lenses: lenses.length, rejected: rejected.length, rejectedDetail: rejected.slice(0, 20) },
    signals: signals.map((s) => ({ id: s.id, kind: s.kind, evidence: s.evidence, weight: s.weight })),
    selected,
    skipped,
    unassessable,
    coverage: {
      domainsSelected: [...new Set(selected.map((entry) => entry.domain))].sort(),
      gapDomainsCovered: GAP_DOMAINS.filter((domain) => selected.some((entry) => entry.domain === domain)),
    },
  }
}

/** 渲染成注入用的紧凑文本——只给透镜 ID + 检查问题，不给正文。 */
function renderManifest(manifest) {
  const lines = []
  lines.push('ROUTE MANIFEST (' + manifest.schema + ')')
  lines.push('GUARANTEE: ' + manifest.guarantee)
  lines.push('CORPUS: ' + manifest.corpus.lenses + ' lenses, ' + manifest.corpus.rejected + ' rejected')
  lines.push('SIGNALS: ' + (manifest.signals.length === 0 ? '(none)' : manifest.signals.map((s) => s.id).join(', ')))
  lines.push('')
  lines.push('SELECTED (' + manifest.selected.length + '):')
  for (const entry of manifest.selected) {
    lines.push('- ' + entry.lens + ' [' + entry.domain + ']' + (entry.forced ? ' (gap-domain, forced)' : '') + ' — ' + entry.name)
    for (const question of entry.questions) lines.push('    ? ' + question)
  }
  lines.push('')
  lines.push('SKIPPED (below threshold — do NOT substitute these): ' + (manifest.skipped.length === 0 ? '(none)' : manifest.skipped.map((e) => e.lens).join(', ')))
  lines.push('UNASSESSABLE (no evidence in this repository): ' + (manifest.unassessable.length === 0 ? '(none)' : manifest.unassessable.map((e) => e.lens).join(', ')))
  lines.push('')
  lines.push('Every selected lens must close with a verdict: HIT (with path:line) / CLEAR (state what evidence would overturn it) / UNKNOWN.')
  return lines.join('\n')
}

/** 解析透镜库根目录：开发态与安装态目录不同，返回第一个真实存在的候选。 */
function resolveKbRoot(explicit) {
  const candidates = []
  if (typeof explicit === 'string' && explicit.length > 0) candidates.push(explicit)
  candidates.push(path.join(__dirname, '..', '..', 'docs', 'kb', 'clean'))
  candidates.push(path.join(__dirname, '..', '..', '..', 'docs', 'kb', 'clean'))
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate
    } catch (error) { /* 试下一个 */ }
  }
  return undefined
}

module.exports = {
  name: 'lens-router',
  inject: ['tools'],
  apply(ctx, config) {
    const kbRoot = resolveKbRoot(config && config.kbRoot)
    const triggers = (config && config.triggers) || ['透镜', 'lens', '审查视角', '研究模式']

    // 工具注册**默认关闭**。
    //
    // 理由：`research-entry` 在进程内直接调用本模块的纯函数（`route` / `renderManifest`），
    // 模型不需要一个工具来路由。研究模式的设计前提是**其余工具会争夺注意力预算**，
    // 因此默认不增加任何工具面。需要显式让模型自行路由时，才把 `registerTool` 设为 true。
    if (!config || config.registerTool !== true) return

    ctx.tools.register({
      name: 'lens_route',
      description: 'Route a task to a small set of architecture review lenses from the local lens library, and return an auditable Route Manifest listing what was selected, what was skipped and why, and what cannot be assessed in this repository. Deterministic and offline; writes nothing.',
      parameters: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'The research task or question to route.' },
          topN: { type: 'number', description: 'Maximum number of lenses to select (default 6).' },
        },
        required: ['task'],
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: String(value) }],
      },
      async execute(args, exec) {
        // 显式门禁：只有人类显式要求时才路由。
        const userText = exec && exec.agent ? currentDirectUserText(exec.agent) : ''
        if (!explicitlyRequested(userText, triggers) && !(args && args.force === true)) {
          return REFUSAL_TEXT
        }
        const root = (config && config.repositoryRoot) || (exec && exec.agent && exec.agent.session && exec.agent.session.header && exec.agent.session.header.cwd) || process.cwd()
        const scan = scanSignals(root)
        const manifest = route({
          kbRoot,
          task: (args && args.task) || userText,
          signals: scan.signals,
          topN: args && typeof args.topN === 'number' ? args.topN : undefined,
        })
        return renderManifest(manifest)
      },
    })
  },
  __test: {
    MANIFEST_SCHEMA, RRF_K, REFUSAL_TEXT, GAP_DOMAINS,
    currentDirectUserText, explicitlyRequested, clausesOf, clauseHasTrigger,
    lensDefects, loadLenses, scanSignals, scoreLens, reciprocalRankFusion, route, renderManifest,
  },
}
