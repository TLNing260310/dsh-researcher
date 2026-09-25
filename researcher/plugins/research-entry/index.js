// research-entry — 按需进入研究模式的插件。
//
// 常驻物只有一行：注册 `/research` 斜杠命令。**平时不做任何事**——不注入 prompt、
// 不注册工具、不占用注意力。
//
// `/research <task>` 执行四步编排（全部为 DSH 已发布 API，机制已实测）：
//   ① sessions.fork(当前会话)          → 新会话，携带全部历史 + cwd
//   ② agents.create({ seed, setup })   → 新 agent
//   ③ setup 内按序：
//        a. permissionPresets.set(session, 'read-only')   ← 沙箱级只读
//        b. approval.setPolicy(agent, 'never')            ← 封死升级路径
//        c. agentPresets.mount(agentCtx, presetId)        ← 只读认知面
//   ④ agent/pre-step 时注入 Route Manifest（透镜选择，不是透镜正文）
//
// **顺序不可调换**：preset 的只读守卫在 mount 时自检环境，要求会话已是
// read-only + never。实测中先 mount 后切权限会被 fail-closed 拒绝。
//
// 为什么必须新建 agent 而不能原地切换：preset 的 per-agent 安装只在**创建期**的
// setup 内执行。对已发布的 agent 调 recompose / mount 只重绑 scope，per-agent
// 安装不会重跑——只读契约不会建立。这是实测结论，不是设计偏好。
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const GUARANTEE_SANDBOX = 'SANDBOX'
const GUARANTEE_CATALOG = 'CATALOG'
const GUARANTEE_DEGRADED = 'DEGRADED'

const USAGE = [
  '用法：',
  '  /research <任务>     以只读研究模式研究该项目（新建只读研究会话，携带当前上下文）',
  '  /research status     查看研究模式所需的运行时事实',
].join('\n')

// 一次会话最多派生多少个研究会话。`/research` 会新建 agent，没有上限时
// 一次误触或一次循环调用就能持续派生——这是本插件引入的唯一资源放大器。
const MAX_CONCURRENT_RESEARCH = 3

// 研究族 preset：在这些 preset 里不允许再派生研究模式（防无限嵌套）。
const RESEARCH_PRESET_FAMILY = ['researcher', 'researcher-quick', 'researcher-deep']

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

const ROUTE_PREAMBLE = [
  '研究模式已由用户显式进入。以下 ROUTE MANIFEST 是本轮被选中的架构审查视角。',
  '',
  '纪律：',
  '  1. 每条被选中的透镜必须以 HIT（附 path:line）/ CLEAR（写明什么证据会推翻该结论）/ UNKNOWN 之一结案。',
  '  2. SKIPPED 的透镜**不得**拿来充数——低于阈值就是低于阈值。',
  '  3. UNASSESSABLE 是覆盖缺口，如实写进报告，不要猜测。',
  '  4. 透镜正文不在本消息里；需要哪条的完整内容，用 skill 工具按需加载。',
  '',
  '任务：',
].join('\n')

module.exports = {
  name: 'research-entry',
  inject: ['commands', 'agents', 'sessions', 'agentPresets', 'approval', 'permissionPresets'],
  apply(ctx, config) {
    const presetId = (config && config.presetId) || 'researcher'
    const readOnlyPreset = (config && config.readOnlyPermissionPreset) || 'read-only'
    const kbRoot = resolveKbRoot(config && config.kbRoot)
    const routerPath = path.join(__dirname, '..', 'lens-router', 'index.js')
    let guaranteeReport = ''

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

    // 会话 → 它派生出去的、仍然存活的研究 agent id。
    // 用来挡住"一次误触 / 一次循环调用持续派生"这一唯一的资源放大器。
    const derived = new Map()
    const liveResearchOf = (sessionId) => (derived.get(sessionId) || []).filter((id) => ctx.agents.get(id) !== undefined)

    /**
     * 进入研究模式前的两道守卫。返回 undefined 表示放行，否则返回拒绝说明。
     * 均为**非致命**拒绝：不改动任何状态。
     */
    const entryRefusal = (agent) => {
      if (ctx.sessions === undefined || agent === undefined || agent === null) return undefined
      const sessionId = agent.session && agent.session.id

      // 守卫一：不允许从研究模式内部再派生研究模式。
      let currentPreset
      try {
        currentPreset = ctx.agentPresets.composedPreset(agent.ctx)
      } catch (error) {
        currentPreset = undefined
      }
      if (typeof currentPreset === 'string' && RESEARCH_PRESET_FAMILY.includes(currentPreset)) {
        return '当前会话已经处于研究模式（preset=' + currentPreset + '）。不再从研究会话内部派生新的研究会话，以免无限嵌套。'
      }

      // 守卫二：同一会话同时存在的研究 agent 数量上限。
      if (sessionId !== undefined) {
        const live = liveResearchOf(sessionId)
        if (live.length >= MAX_CONCURRENT_RESEARCH) {
          return '这个会话已经有 ' + live.length + ' 个仍在运行的研究会话（上限 ' + MAX_CONCURRENT_RESEARCH + '）。' +
            '请先关闭其中一些，再启动新的研究。'
        }
      }
      return undefined
    }

    /** 只读路由：调 lens-router 的纯函数，不经过工具层。 */
    const buildManifest = (task, repositoryRoot) => {
      try {
        const router = require(routerPath)
        const scan = router.__test.scanSignals(repositoryRoot)
        const manifest = router.__test.route({ kbRoot, task, signals: scan.signals })
        return { text: router.__test.renderManifest(manifest), manifest }
      } catch (error) {
        return {
          text: 'ROUTE MANIFEST unavailable: ' + String(error && error.message ? error.message : error),
          manifest: undefined,
        }
      }
    }

    const startResearch = async (invocation, task) => {
      const parent = invocation.agent
      const repositoryRoot = (parent.session && parent.session.header && parent.session.header.cwd) || process.cwd()
      const parentSessionId = parent.session && parent.session.id

      const refusal = entryRefusal(parent)
      if (refusal !== undefined) return { kind: 'error', text: refusal }

      // 沙箱级只读是硬前提：不满足就不进入。
      const before = readEnvironment(parent.session)
      if (before.mode !== 'read-only' && (config == null || config.allowWritableEntry !== true)) {
        return {
          kind: 'error',
          text: '研究模式要求只读环境。当前会话沙箱是 "' + String(before.mode) + '"，不是 read-only。\n' +
            '请用 Read Only 权限设置创建会话，或由用户显式确认降级进入。',
        }
      }

      let handle
      try {
        const fork = ctx.sessions.fork(parent.session)
        const mounted = { preset: undefined, error: undefined }
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
            try {
              const preset = await ctx.agentPresets.mount(agentCtx, presetId)
              mounted.preset = preset && preset.id
            } catch (error) {
              mounted.error = String(error && error.message ? error.message : error)
              throw error
            }
            // 注入 Route Manifest：透镜选择 + 检查问题，不含正文。
            const built = buildManifest(task, repositoryRoot)
            const env = readEnvironment(agent.session)
            const guarantee = guaranteeOf(env)
            if (guarantee === GUARANTEE_DEGRADED) {
              throw new Error('研究模式拒绝在非只读沙箱中运行：' + renderGuarantee(guarantee))
            }
            const preamble = ROUTE_PREAMBLE.split('\n')
            preamble.splice(1, 0, renderGuarantee(guarantee), '')
            agentCtx.on('agent/pre-step', async () => {
              agent.inject({
                id: 'research-entry-manifest',
                role: 'user',
                source: { kind: 'plugin', plugin: 'research-entry', form: 'instructions' },
                content: [{ type: 'text', text: preamble.join('\n') + task + '\n\n' + built.text }],
              })
            })
            guaranteeReport = renderGuarantee(guarantee)
          },
        })
        handle = created
        if (parentSessionId !== undefined) {
          const live = liveResearchOf(parentSessionId)
          derived.set(parentSessionId, [...live, String(created.agent.id)])
        }
        const env = readEnvironment(created.agent.session)
        return {
          kind: 'success',
          text: [
            '研究模式已启动。',
            renderGuarantee(guaranteeOf(env)),
            'Preset: ' + (mounted.preset || presetId),
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
          text: '研究模式启动失败（原会话未受影响）：' + String(error && error.message ? error.message : error),
        }
      }
    }

    ctx.commands.register({
      name: 'research',
      description: 'Enter read-only research mode: fork this session, compose the research agent in a read-only sandbox, and route the task to architecture review lenses.',
      input: { hint: '<task> | status' },
      handler: async (invocation) => {
        const raw = String(invocation.rawInput || '').trim()
        if (raw.length === 0) return { kind: 'error', text: USAGE }
        if (raw === 'status') {
          const env = readEnvironment(invocation.agent.session)
          return {
            kind: 'success',
            text: [
              '研究模式运行时事实：',
              '  当前沙箱: ' + String(env.mode),
              '  当前审批: ' + String(env.policy),
              '  目标 preset: ' + presetId,
              '  只读 permission preset: ' + readOnlyPreset,
              '  透镜库: ' + kbRoot,
              '  可进入研究模式: ' + (env.mode === 'read-only' ? '是' : '否（需要 Read Only 会话）'),
            ].join('\n'),
          }
        }
        return await startResearch(invocation, raw)
      },
    })

    // 供测试观察：最近一次进入研究模式时上报的保证强度（空字符串=尚未进入过）。
    ctx.provide('researchEntryLastGuarantee', () => guaranteeReport)
  },
  __test: {
    GUARANTEE_SANDBOX, GUARANTEE_CATALOG, GUARANTEE_DEGRADED,
    guaranteeOf, renderGuarantee, ROUTE_PREAMBLE, USAGE, resolveKbRoot,
    MAX_CONCURRENT_RESEARCH, RESEARCH_PRESET_FAMILY,
  },
}
