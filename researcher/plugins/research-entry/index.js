// research-entry — 研究模式的两个入口，按需进入，平时完全惰性。
//
// 常驻物只有一行：注册 `/research` 斜杠命令。不注入 prompt、不注册工具、
// 不占用注意力预算。
//
// ── 默认：会话内研究（in-session） ─────────────────────────────────────────
// `/research <任务>` 在**当前会话**内建立只读研究模式，由**主 agent 继续执行**：
//   ① permissionPresets.set(session, 'read-only')   会话级沙箱只读
//   ② 在当前 agent 的 scope 上装工具层守卫            拒 bash/pwsh/terminal/写工具
//   ③ 注入 Route Manifest                            透镜选择，不是透镜正文
//   `/research off` 退出，恢复进入前的 permission preset。
//
// **为什么需要第 ② 层**：`permissionPresets` 只约束**文件系统**能力。它拦不住
// `bash -c "echo x > f"` —— shell 里的写穿过 fs 沙箱。只切权限而不加工具层守卫，
// 会得到"看起来严格、实际可绕过"的治理，正是本项目最反对的东西。
//
// **已知代价（必须如实告知）**：会话内模式**没有研究 persona**，也没有
// `research_doctor` / `research_checkpoint`。DSH 只在 agent **创建期**的 setup 内
// 应用 preset 的 per-agent 安装；对已发布的 agent 调 recompose / mount 只重绑
// scope，安装不会重跑。所以只读契约可以在会话中途建立，研究认知面不能。
//
// ── 可选：派生只读研究会话（--session） ────────────────────────────────────
// `/research --session <任务>` 保留完整认证形态：fork 会话 + 新建 agent +
// setup 内 mount preset。拿到全部只读安装与 Runtime Certificate，代价是切换会话。
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const GUARANTEE_SANDBOX = 'SANDBOX'
const GUARANTEE_CATALOG = 'CATALOG'
const GUARANTEE_DEGRADED = 'DEGRADED'

// 会话内模式要拒绝的工具：一切能改文件系统、派生进程、或放大派生的能力。
// 用**拒绝清单**而非允许清单：清单外的新工具默认放行，但漏掉一个写工具就破了契约；
// 反过来用允许清单会误伤合法只读工具。这里取"已知危险全列 + 前缀匹配"的折中。
const DENIED_TOOL_NAMES = new Set([
  'write', 'edit',
  'bash', 'pwsh', 'shell', 'terminal', 'terminal_bash', 'terminal_pwsh',
  'subagent', 'subagent_fork', 'workflow', 'ralph', 'run_code',
])
// 前缀匹配：持久 shell 家族在各部署下命名不一（persistent-bash / persistent_shell …）。
const DENIED_TOOL_PREFIXES = ['persistent', 'terminal']

const IN_SESSION_DENIAL = '研究模式已在本会话启用：只读契约生效中，该工具在会话内研究模式下不可用。' +
  '请只读地研究并在对话中报告发现；要退出研究模式，由用户运行 /research off。'

// 研究族的 preset：不允许从研究模式内部再派生会话内研究（防嵌套）。
const RESEARCH_PRESET_FAMILY = ['researcher', 'researcher-quick', 'researcher-deep']

// 派生研究会话的上限。`--session` 会新建 agent，没有上限时一次循环调用即可持续派生。
const MAX_DERIVED_RESEARCH = 3

const USAGE = [
  '用法：',
  '  /research <任务>            在**当前会话**内进入只读研究模式，由主 agent 继续执行',
  '  /research --session <任务>  派生一个独立的只读研究会话（完整认证形态，会切换会话）',
  '  /research off              退出会话内研究模式，恢复进入前的权限',
  '  /research status           查看研究模式所需的运行时事实',
].join('\n')

/**
 * 解析透镜库根目录。
 *
 * 开发态与安装态的目录不同，必须都支持：
 *   - 安装态：`~/.dsh/.agent-presets/<preset>/docs/kb/clean`（安装器把 docs/ 一并复制）
 *   - 开发态：`<repo>/docs/kb/clean`（preset 源码在 `<repo>/researcher/` 下）
 * 返回第一个真实存在的候选；都不存在时返回 `undefined`，由调用方如实降级。
 */
function resolveKbRoot(explicit) {
  const candidates = []
  if (typeof explicit === 'string' && explicit.length > 0) candidates.push(explicit)
  candidates.push(path.join(__dirname, '..', '..', 'docs', 'kb', 'clean'))
  candidates.push(path.join(__dirname, '..', '..', '..', 'docs', 'kb', 'clean'))
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate
    } catch (error) { /* 不可读则试下一个 */ }
  }
  return undefined
}

/** 三级保证强度：如实上报，不同强度不得混称。 */
function guaranteeOf(env) {
  if (!env || env.mode !== 'read-only') return GUARANTEE_DEGRADED
  if (env.policy !== 'never') return GUARANTEE_CATALOG
  return GUARANTEE_SANDBOX
}

function renderGuarantee(guarantee) {
  if (guarantee === GUARANTEE_SANDBOX) {
    return 'GUARANTEE: SANDBOX — 沙箱 read-only + 审批 never，双约束成立。'
  }
  if (guarantee === GUARANTEE_CATALOG) {
    return 'GUARANTEE: CATALOG — 沙箱 read-only，但审批不是 never：无升级路径的保证不成立。'
  }
  return 'GUARANTEE: DEGRADED — 沙箱不是 read-only。该会话无法建立只读保证；拒绝以研究模式运行。'
}

/** 该工具名在会话内研究模式下是否必须被拒绝。纯函数，可测。 */
function isDeniedTool(name) {
  if (typeof name !== 'string') return false
  if (DENIED_TOOL_NAMES.has(name)) return true
  const lowered = name.toLocaleLowerCase('en-US')
  return DENIED_TOOL_PREFIXES.some((prefix) => lowered.startsWith(prefix))
}

/** `/research` 的参数解析：模式 + 任务。纯函数，可测。 */
function parseResearchInput(rawInput) {
  const raw = String(rawInput || '').trim()
  if (raw.length === 0) return { mode: 'usage' }
  const lowered = raw.toLocaleLowerCase('en-US')
  if (lowered === 'off' || lowered === 'exit' || lowered === 'stop') return { mode: 'off' }
  if (lowered === 'status') return { mode: 'status' }
  const sessionFlag = raw.match(/^--session\s+([\s\S]+)$/u)
  if (sessionFlag !== null) {
    const task = sessionFlag[1].trim()
    return task.length === 0 ? { mode: 'usage' } : { mode: 'derived', task }
  }
  return { mode: 'in-session', task: raw }
}

const IN_SESSION_PREAMBLE = [
  '研究模式已由用户显式启用（会话内，只读）。以下 ROUTE MANIFEST 是本轮选中的架构审查视角。',
  '',
  '约束：',
  '  1. 本会话的写入与执行能力已被关闭：沙箱只读，且 shell / 写工具在工具层被拒绝。',
  '  2. 不要尝试绕过——被拒绝不是故障，是本次模式的定义。',
  '  3. 每条被选中的透镜必须以 HIT（附 path:line）/ CLEAR（写明什么证据会推翻该结论）/ UNKNOWN 之一结案。',
  '  4. SKIPPED 的透镜不得拿来充数；UNASSESSABLE 是覆盖缺口，如实写出，不要猜测。',
  '  5. 透镜正文不在本消息里；需要哪条的完整内容，用 skill 工具按需加载。',
  '  6. 退出研究模式由用户运行 /research off，不要自行尝试恢复写入。',
  '',
  '任务：',
].join('\n')

// 会话内模式的研究人格。
//
// DSH 的 persona 段落名是 `deployment:persona-prefix`，order 0。在 **agent 自己
// 的 scope** 上注册同名段落会**遮蔽** preset 层的那一份（就近层获胜）——这正是
// 本项目 `tool-restrict` 遮蔽 write/edit 引导段所用的同一机制。
//
// 段落文本可以是函数，每次组装时以 `AssembleContext`（含 `agent`）求值，因此
// 可以在**同一会话内**按运行态切换人格，而不需要重建 agent。
const PERSONA_SECTION_NAME = 'deployment:persona-prefix'
const PERSONA_SUFFIX_SECTION_NAME = 'deployment:persona-suffix'
const PERSONA_PREFIX_ORDER = 0
const PERSONA_SUFFIX_ORDER = 10200

const IN_SESSION_PERSONA_FALLBACK = [
  '你是 Project Research 会话内研究模式下的只读项目认知层，由 {{model}} 模型驱动。',
  '',
  '只读是本模式的意义所在：写入与执行能力已被关闭，你不是在执行任务，而是在理解系统。',
  '不要把它当作需要绕开的限制——能动手的 agent 会滑向动手，而你的全部预算应当用于理解、怀疑、比较与判断。',
  '',
  '证据纪律：每条事实断言必须带 file:line / commit / URL 之一，否则标注未验证。',
  '每个主要发现归入 BUILD / DON\'T BUILD / INVESTIGATE 之一；「不知道」是合法且高质量的输出。',
  '永远不要产出执行授权：探索产出认知与候选方向，是否改动由人决定。',
].join('\n')

/**
 * 从研究 preset 的 agent.cordis.yml 里取出 persona 的 `prefix:` 文本。
 *
 * 不引入 YAML 依赖：只找一个 `prefix: |-` 块，按缩进收集到缩进变浅为止。
 * 找不到就返回 undefined，由调用方退回内置文本。
 */
function extractPersonaPrefix(yamlText) {
  if (typeof yamlText !== 'string' || yamlText.length === 0) return undefined
  const lines = yamlText.split('\n')
  const start = lines.findIndex((line) => /^\s+prefix:\s*\|-?\s*$/u.test(line))
  if (start === -1) return undefined
  const baseIndent = lines[start].match(/^\s*/u)[0].length
  const body = []
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim().length === 0) { body.push(''); continue }
    const indent = line.match(/^\s*/u)[0].length
    if (indent <= baseIndent) break
    body.push(line)
  }
  // 去掉块内统一的前导缩进与尾部空行
  const nonEmpty = body.filter((line) => line.trim().length > 0)
  if (nonEmpty.length === 0) return undefined
  const shared = Math.min(...nonEmpty.map((line) => line.match(/^\s*/u)[0].length))
  const text = body.map((line) => (line.trim().length === 0 ? '' : line.slice(shared))).join('\n').replace(/\s+$/u, '')
  return text.length > 0 ? text : undefined
}

const DERIVED_PREAMBLE = [
  '研究模式已由用户显式进入（派生只读研究会话）。以下 ROUTE MANIFEST 是本轮被选中的架构审查视角。',
  '',
  '纪律：',
  '  1. 每条被选中的透镜必须以 HIT（附 path:line）/ CLEAR（写明什么证据会推翻该结论）/ UNKNOWN 之一结案。',
  '  2. SKIPPED 的透镜不得拿来充数——低于阈值就是低于阈值。',
  '  3. UNASSESSABLE 是覆盖缺口，如实写进报告，不要猜测。',
  '  4. 透镜正文不在本消息里；需要哪条的完整内容，用 skill 工具按需加载。',
  '',
  '任务：',
].join('\n')

module.exports = {
  name: 'research-entry',
  inject: ['commands', 'agents', 'sessions', 'agentPresets', 'approval', 'permissionPresets'],
  apply(ctx, config) {
    const derivedPresetId = (config && config.presetId) || 'researcher'
    const readOnlyPreset = (config && config.readOnlyPermissionPreset) || 'read-only'
    const kbRoot = resolveKbRoot(config && config.kbRoot)
    const routerPath = path.join(__dirname, '..', 'lens-router', 'index.js')

    // 研究人格文本：优先从研究 preset 的 agent.cordis.yml 取，避免两份文本漂移。
    // 取不到（preset 没装、格式变了）就退回内置文本，并如实降级——不让整个入口失败。
    const personaSource = (() => {
      const explicit = config && config.personaSource
      const candidates = []
      if (typeof explicit === 'string' && explicit.length > 0) candidates.push(explicit)
      candidates.push(path.join(__dirname, '..', '..', 'agent.cordis.yml'))
      candidates.push(path.join(__dirname, '..', '..', '..', 'researcher', 'agent.cordis.yml'))
      for (const candidate of candidates) {
        try {
          if (!fs.existsSync(candidate)) continue
          const text = extractPersonaPrefix(fs.readFileSync(candidate, 'utf8'))
          if (text !== undefined) return { text, source: candidate }
        } catch (error) { /* 试下一个 */ }
      }
      return { text: undefined, source: undefined }
    })()
    const personaPrefix = personaSource.text || IN_SESSION_PERSONA_FALLBACK

    // 处于会话内研究模式的 agent。用 WeakSet 以免持有 agent 强引用。
    const inSessionAgents = new WeakSet()
    // 已为哪些 agent 注册过 persona 遮蔽（注册一次，靠运行态切换文本）。
    const personaShadows = new WeakMap()

    // 会话 id → 会话内研究模式的现场（进入前的 permission preset + 守卫释放器）。
    const inSession = new Map()
    // 会话 id → 它派生出去、仍然存活的研究会话 id。
    const derived = new Map()

    /**
     * 在 **agent 自己的 scope** 上注册人格遮蔽。
     *
     * 遮蔽对象是 `deployment:persona-prefix`：DSH 的 persona 行注册同名段落，
     * 就近层获胜，所以 agent 层的这一份会盖掉 preset 层的那一份。文本是函数，
     * 每次组装时按 `AssembleContext.agent` 判断是否处于研究模式——**同一会话内
     * 切换人格，不需要重建 agent**。
     *
     * 同时遮蔽 `deployment:persona-suffix` 为空：研究模式下不应再拼上编码 agent
     * 的收尾段（例如 minimal 的 `complete: true` 人格）。
     *
     * 任何一步失败都返回错误而不抛出——人格是增强项，不能因为它让只读契约进不来。
     */
    const ensurePersonaShadow = (agent) => {
      if (agent === undefined || agent === null || agent.ctx === undefined) {
        return { ok: false, reason: 'agent has no scoped context' }
      }
      const existing = personaShadows.get(agent)
      if (existing !== undefined) return existing

      let systemPrompt
      try {
        systemPrompt = agent.ctx.get('systemPrompt')
      } catch (error) {
        systemPrompt = undefined
      }
      if (systemPrompt === undefined || typeof systemPrompt.section !== 'function') {
        return { ok: false, reason: 'systemPrompt service unavailable to the agent scope' }
      }

      const disposers = []
      try {
        disposers.push(systemPrompt.section({
          name: PERSONA_SECTION_NAME,
          order: PERSONA_PREFIX_ORDER,
          text: (assembly) => (assembly && inSessionAgents.has(assembly.agent) ? personaPrefix : ''),
        }))
        disposers.push(systemPrompt.section({
          name: PERSONA_SUFFIX_SECTION_NAME,
          order: PERSONA_SUFFIX_ORDER,
          text: (assembly) => (assembly && inSessionAgents.has(assembly.agent) ? '' : undefined),
        }))
      } catch (error) {
        for (const dispose of disposers) {
          try { dispose() } catch (disposeError) { /* 尽力 */ }
        }
        return { ok: false, reason: String(error && error.message ? error.message : error) }
      }

      const record = {
        ok: true,
        release: () => {
          for (const dispose of disposers) {
            try { dispose() } catch (error) { /* 尽力 */ }
          }
        },
      }
      personaShadows.set(agent, record)
      return record
    }

    const readEnvironment = (session) => {
      try {
        return {
          mode: ctx.sandboxPolicy ? ctx.sandboxPolicy.resolve({ session }).mode : undefined,
          policy: ctx.approval.overrideOf(session),
        }
      } catch (error) {
        return { mode: undefined, policy: undefined, error: String(error && error.message ? error.message : error) }
      }
    }

    const liveDerivedOf = (sessionId) => (derived.get(sessionId) || []).filter((id) => ctx.agents.get(id) !== undefined)

    /** 只读路由：调 lens-router 的纯函数，不经过工具层。 */
    const buildManifest = (task, repositoryRoot) => {
      try {
        const router = require(routerPath)
        const scan = router.__test.scanSignals(repositoryRoot)
        const manifest = router.__test.route({ kbRoot, task, signals: scan.signals })
        return { text: router.__test.renderManifest(manifest), manifest }
      } catch (error) {
        return { text: 'ROUTE MANIFEST unavailable: ' + String(error && error.message ? error.message : error), manifest: undefined }
      }
    }

    const repositoryRootOf = (agent) =>
      (agent.session && agent.session.header && agent.session.header.cwd) || process.cwd()

    // ── 会话内模式 ──────────────────────────────────────────────────────────

    /**
     * 进入会话内研究模式。**非致命**：任何一步失败都只返回错误，不改动状态。
     * @returns 命令结果
     */
    const enterInSession = (invocation, task) => {
      const agent = invocation.agent
      const session = agent.session
      const sessionId = session && session.id

      let currentPreset
      try {
        currentPreset = ctx.agentPresets.composedPreset(agent.ctx)
      } catch (error) {
        currentPreset = undefined
      }
      if (typeof currentPreset === 'string' && RESEARCH_PRESET_FAMILY.includes(currentPreset)) {
        return {
          kind: 'error',
          text: '当前会话已经处于研究模式（preset=' + currentPreset + '）。不再从研究会话内部再次进入，以免无限嵌套。',
        }
      }

      if (sessionId !== undefined && inSession.has(sessionId)) {
        return { kind: 'error', text: '本会话已经处于会话内研究模式。要退出请运行 /research off。' }
      }

      // 进入前的现场：先记下来，退出时才能原样恢复。
      let restoreTo
      try {
        restoreTo = ctx.permissionPresets.current(session)
      } catch (error) {
        restoreTo = undefined
      }

      let releaseGuard
      let personaNote = '研究人格已启用。'
      try {
        // ① 会话级沙箱只读。这是**唯一受支持的写路径**；sandboxPolicy 只有读方法。
        ctx.permissionPresets.set(session, readOnlyPreset)
        const envAfter = readEnvironment(session)
        if (envAfter.mode !== 'read-only') {
          throw new Error('permission preset "' + readOnlyPreset + '" did not resolve the session sandbox to read-only (got ' + String(envAfter.mode) + ')')
        }
        // ② 工具层守卫：拦下 fs 沙箱拦不住的东西（shell 里的写、派生、执行）。
        releaseGuard = agent.ctx.tools.guard((execution) => {
          const name = execution && execution.name
          return isDeniedTool(name) ? IN_SESSION_DENIAL : undefined
        })
        // ③ 人格遮蔽。注册一次即可，文本按运行态求值。
        const shadow = ensurePersonaShadow(agent)
        if (shadow.ok !== true) {
          personaNote = '研究人格未启用（' + shadow.reason + '）；只读契约不受影响。'
        }
      } catch (error) {
        // 回滚：守卫已装但后续失败时不能留下半个状态。
        if (typeof releaseGuard === 'function') {
          try { releaseGuard() } catch (rollbackError) { /* 尽力 */ }
        }
        if (restoreTo !== undefined && restoreTo !== 'custom') {
          try { ctx.permissionPresets.set(session, restoreTo) } catch (rollbackError) { /* 尽力 */ }
        }
        return { kind: 'error', text: '进入会话内研究模式失败，权限已回滚：' + String(error && error.message ? error.message : error) }
      }

      // 打开人格：从这一步起，本 agent 的每一次组装都拿到研究人格。
      inSessionAgents.add(agent)

      // ③ 注入 Route Manifest（透镜选择 + 检查问题，不含正文）。
      const built = buildManifest(task, repositoryRootOf(agent))
      const env = readEnvironment(session)
      const guarantee = guaranteeOf(env)
      agent.inject({
        id: 'research-entry-manifest',
        role: 'user',
        source: { kind: 'plugin', plugin: 'research-entry', form: 'instructions' },
        content: [{ type: 'text', text: IN_SESSION_PREAMBLE + task + '\n\n' + built.text }],
      })

      if (sessionId !== undefined) inSession.set(sessionId, { restoreTo, releaseGuard })

      return {
        kind: 'success',
        text: [
          '会话内研究模式已启用，主 agent 继续执行。',
          renderGuarantee(guarantee),
          '写入与执行已关闭：沙箱只读 + 工具层拒绝 shell / 写工具。',
          personaNote,
          '路由清单已注入本轮上下文。',
          '退出：/research off',
        ].join('\n'),
      }
    }

    /** 退出会话内研究模式，恢复进入前的权限。**幂等**。 */
    const exitInSession = (invocation) => {
      const agent = invocation.agent
      const sessionId = agent.session && agent.session.id
      const state = sessionId === undefined ? undefined : inSession.get(sessionId)
      if (state === undefined) {
        return { kind: 'success', text: '本会话当前不在会话内研究模式，无需退出。' }
      }
      inSession.delete(sessionId)
      // 先关人格：否则退出后第一轮仍会带着研究人格。
      inSessionAgents.delete(agent)
      let restored = 'unknown'
      try {
        if (typeof state.releaseGuard === 'function') state.releaseGuard()
      } catch (error) { /* 释放失败不阻塞恢复权限 */ }
      try {
        if (state.restoreTo !== undefined && state.restoreTo !== 'custom') {
          ctx.permissionPresets.set(agent.session, state.restoreTo)
          restored = state.restoreTo
        } else {
          restored = 'custom（进入前即为自定义组合，未自动回退；请用 /permission 选择）'
        }
      } catch (error) {
        return { kind: 'error', text: '已解除工具层限制，但恢复权限失败：' + String(error && error.message ? error.message : error) }
      }
      return { kind: 'success', text: '已退出研究模式。权限已恢复为：' + restored }
    }

    // ── 派生模式（认证形态） ────────────────────────────────────────────────

    const startDerived = async (invocation, task) => {
      const parent = invocation.agent
      const repositoryRoot = repositoryRootOf(parent)
      const parentSessionId = parent.session && parent.session.id

      let currentPreset
      try {
        currentPreset = ctx.agentPresets.composedPreset(parent.ctx)
      } catch (error) {
        currentPreset = undefined
      }
      if (typeof currentPreset === 'string' && RESEARCH_PRESET_FAMILY.includes(currentPreset)) {
        return { kind: 'error', text: '当前会话已经处于研究模式（preset=' + currentPreset + '）。不再派生研究会话。' }
      }
      if (parentSessionId !== undefined) {
        const live = liveDerivedOf(parentSessionId)
        if (live.length >= MAX_DERIVED_RESEARCH) {
          return {
            kind: 'error',
            text: '这个会话已经有 ' + live.length + ' 个仍在运行的研究会话（上限 ' + MAX_DERIVED_RESEARCH + '）。请先关闭其中一些。',
          }
        }
      }

      // 沙箱级只读是硬前提：不满足就不进入。
      const before = readEnvironment(parent.session)
      if (before.mode !== 'read-only' && (config == null || config.allowWritableEntry !== true)) {
        return {
          kind: 'error',
          text: '派生研究会话要求只读环境。当前会话沙箱是 "' + String(before.mode) + '"，不是 read-only。\n' +
            '如需在当前会话内直接研究，去掉 --session 即可。',
        }
      }

      let handle
      try {
        const fork = ctx.sessions.fork(parent.session)
        let mountedPreset
        const created = await ctx.agents.create({
          sessionId: fork.id,
          meta: { cwd: repositoryRoot },
          seed: fork.snapshotEvents(),
          inheritedEventCount: fork.firstLiveSeq,
          agentOptions: {},
          setup: async (agentCtx, agent) => {
            // 顺序固定：先权限、后 mount。反过来会被 preset 的守卫 fail-closed 拒绝。
            ctx.permissionPresets.set(agent.session, readOnlyPreset)
            ctx.approval.setPolicy(agent, 'never')
            const preset = await ctx.agentPresets.mount(agentCtx, derivedPresetId)
            mountedPreset = preset && preset.id
            const built = buildManifest(task, repositoryRoot)
            const guarantee = guaranteeOf(readEnvironment(agent.session))
            if (guarantee === GUARANTEE_DEGRADED) {
              throw new Error('研究模式拒绝在非只读沙箱中运行：' + renderGuarantee(guarantee))
            }
            const lines = DERIVED_PREAMBLE.split('\n')
            lines.splice(1, 0, renderGuarantee(guarantee), '')
            agentCtx.on('agent/pre-step', async () => {
              agent.inject({
                id: 'research-entry-manifest',
                role: 'user',
                source: { kind: 'plugin', plugin: 'research-entry', form: 'instructions' },
                content: [{ type: 'text', text: lines.join('\n') + task + '\n\n' + built.text }],
              })
            })
          },
        })
        handle = created
        if (parentSessionId !== undefined) {
          derived.set(parentSessionId, [...liveDerivedOf(parentSessionId), String(created.agent.id)])
        }
        return {
          kind: 'success',
          text: [
            '派生研究会话已启动。',
            renderGuarantee(guaranteeOf(readEnvironment(created.agent.session))),
            'Preset: ' + (mountedPreset || derivedPresetId),
            '研究会话: ' + String(created.agent.id),
            '原会话未被改动，可继续使用。',
          ].join('\n'),
        }
      } catch (error) {
        if (handle !== undefined) {
          try { await handle.dispose() } catch (disposeError) { /* 尽力回收 */ }
        }
        return {
          kind: 'error',
          text: '派生研究会话启动失败（原会话未受影响）：' + String(error && error.message ? error.message : error),
        }
      }
    }

    // ── 命令注册 ────────────────────────────────────────────────────────────

    ctx.commands.register({
      name: 'research',
      description: 'Enter read-only research mode in this session (default), or derive a separate certified research session with --session. Routes the task to architecture review lenses.',
      input: { hint: '<task> | --session <task> | off | status' },
      handler: async (invocation) => {
        const parsed = parseResearchInput(invocation.rawInput)
        if (parsed.mode === 'usage') return { kind: 'error', text: USAGE }
        if (parsed.mode === 'off') return exitInSession(invocation)
        if (parsed.mode === 'status') {
          const env = readEnvironment(invocation.agent.session)
          const sessionId = invocation.agent.session && invocation.agent.session.id
          const active = sessionId !== undefined && inSession.has(sessionId)
          return {
            kind: 'success',
            text: [
              '研究模式运行时事实：',
              '  会话内研究模式: ' + (active ? '启用中' : '未启用'),
              '  当前沙箱: ' + String(env.mode),
              '  当前审批: ' + String(env.policy),
              '  只读 permission preset: ' + readOnlyPreset,
              '  派生模式 preset: ' + derivedPresetId,
              '  透镜库: ' + String(kbRoot),
            ].join('\n'),
          }
        }
        if (parsed.mode === 'derived') return await startDerived(invocation, parsed.task)
        return enterInSession(invocation, parsed.task)
      },
    })
  },
  __test: {
    GUARANTEE_SANDBOX, GUARANTEE_CATALOG, GUARANTEE_DEGRADED,
    guaranteeOf, renderGuarantee, resolveKbRoot, parseResearchInput, isDeniedTool, extractPersonaPrefix,
    IN_SESSION_PREAMBLE, DERIVED_PREAMBLE, IN_SESSION_DENIAL, USAGE,
    IN_SESSION_PERSONA_FALLBACK, PERSONA_SECTION_NAME, PERSONA_SUFFIX_SECTION_NAME,
    PERSONA_PREFIX_ORDER, PERSONA_SUFFIX_ORDER,
    DENIED_TOOL_NAMES, DENIED_TOOL_PREFIXES, RESEARCH_PRESET_FAMILY, MAX_DERIVED_RESEARCH,
  },
}
