// research-entry tests: 参数解析、工具拒绝判定、会话内编排、退出恢复、派生上限。
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const entry = require('../researcher/plugins/research-entry/index.js')
const T = entry.__test

// ── 参数解析 ────────────────────────────────────────────────────────────────

test('parseResearchInput routes to in-session by default', () => {
  assert.deepEqual(T.parseResearchInput('审计这个仓库的并发模型'), { mode: 'in-session', task: '审计这个仓库的并发模型' })
  assert.deepEqual(T.parseResearchInput('  review the retry policy  '), { mode: 'in-session', task: 'review the retry policy' })
})

test('parseResearchInput recognises --session, off and status', () => {
  assert.deepEqual(T.parseResearchInput('--session 审计并发'), { mode: 'derived', task: '审计并发' })
  assert.deepEqual(T.parseResearchInput('off'), { mode: 'off' })
  assert.deepEqual(T.parseResearchInput('EXIT'), { mode: 'off' })
  assert.deepEqual(T.parseResearchInput('stop'), { mode: 'off' })
  assert.deepEqual(T.parseResearchInput('status'), { mode: 'status' })
  assert.deepEqual(T.parseResearchInput(''), { mode: 'usage' })
  assert.deepEqual(T.parseResearchInput('--session'), { mode: 'in-session', task: '--session' })
  assert.deepEqual(T.parseResearchInput('--session   '), { mode: 'in-session', task: '--session' })
})

// ── 工具拒绝判定 ────────────────────────────────────────────────────────────

test('isDeniedTool denies every mutation and process surface', () => {
  for (const name of ['write', 'edit', 'bash', 'pwsh', 'shell', 'terminal', 'terminal_bash', 'terminal_pwsh', 'subagent', 'subagent_fork', 'workflow', 'ralph', 'run_code']) {
    assert.equal(T.isDeniedTool(name), true, name + ' must be denied')
  }
  for (const name of ['persistent-bash', 'persistent_shell', 'persistent-pwsh']) {
    assert.equal(T.isDeniedTool(name), true, name + ' must be denied by prefix')
  }
})

test('isDeniedTool allows the read-only research surface', () => {
  for (const name of ['read', 'read_image', 'glob', 'grep', 'git_read', 'web_search', 'web_fetch', 'ask_user_question', 'todo_write', 'skill', 'lens_route', 'present']) {
    assert.equal(T.isDeniedTool(name), false, name + ' must stay available')
  }
  assert.equal(T.isDeniedTool(undefined), false)
  assert.equal(T.isDeniedTool(''), false)
})

test('the denial text forbids retrying and names the exit command', () => {
  assert.match(T.IN_SESSION_DENIAL, /只读契约/)
  assert.match(T.IN_SESSION_DENIAL, /\/research off/)
})

test('the in-session preamble states the constraint and the exit path', () => {
  assert.match(T.IN_SESSION_PREAMBLE, /沙箱只读/)
  assert.match(T.IN_SESSION_PREAMBLE, /不要尝试绕过/)
  assert.match(T.IN_SESSION_PREAMBLE, /\/research off/)
  assert.match(T.IN_SESSION_PREAMBLE, /HIT/)
  assert.match(T.IN_SESSION_PREAMBLE, /CLEAR/)
  assert.match(T.IN_SESSION_PREAMBLE, /UNKNOWN/)
})

// ── 会话内编排 ──────────────────────────────────────────────────────────────

/** 构造一个最小可用的插件宿主，记录所有副作用以便断言。 */
const makeHarness = (options = {}) => {
  const calls = { setPermission: [], setPolicy: [], injected: [], guarded: 0, guardReleased: 0, sections: [], sectionDisposed: 0 }
  let registered
  let guardFn
  let sandboxMode = options.sandboxMode || 'workspace-full'
  const agent = {
    session: { id: 's-1', header: { cwd: path.join(__dirname, '..') } },
    ctx: {
      tools: {
        guard(fn) {
          calls.guarded += 1
          guardFn = fn
          return () => { calls.guardReleased += 1; guardFn = undefined }
        },
      },
      get(name) {
        if (name !== 'systemPrompt') return undefined
        return {
          section(section) {
            calls.sections.push(section)
            return () => { calls.sectionDisposed += 1 }
          },
        }
      },
    },
    inject(message) { calls.injected.push(message) },
  }
  const ctx = {
    commands: { register(definition) { registered = definition } },
    agents: { get() { return agent }, create: options.create },
    sessions: { fork: options.fork },
    agentPresets: { composedPreset: () => options.composedPreset, mount: options.mount },
    approval: {
      overrideOf: () => options.approvalPolicy,
      setPolicy(_agent, policy) { calls.setPolicy.push(policy) },
    },
    permissionPresets: {
      current: () => options.currentPreset,
      set(_session, name) { calls.setPermission.push(name); sandboxMode = name === 'read-only' ? 'read-only' : 'workspace-full' },
    },
    sandboxPolicy: { resolve: () => ({ mode: sandboxMode }) },
  }
  entry.apply(ctx, options.config)
  return { calls, agent, command: registered, guard: () => guardFn }
}

const invoke = async (harness, rawInput) => harness.command.handler({ agent: harness.agent, rawInput, signal: new AbortController().signal })

test('a slash command named research is registered', () => {
  const h = makeHarness()
  assert.equal(h.command.name, 'research')
  assert.equal(typeof h.command.handler, 'function')
})

test('the default path enters in-session: sandbox switch, tool guard, manifest, no new agent', async () => {
  const h = makeHarness({ currentPreset: 'workspace-write', sandboxMode: 'workspace-full', approvalPolicy: 'ask' })
  const result = await invoke(h, '审计这个仓库的并发与重试策略')
  assert.equal(result.kind, 'success')
  assert.match(result.text, /会话内研究模式已启用/)
  assert.match(result.text, /\/research off/)
  // 权限被切到只读
  assert.deepEqual(h.calls.setPermission, ['read-only'])
  // 工具层守卫被装上，且拒绝写工具与 shell
  assert.equal(h.calls.guarded, 1)
  assert.ok(h.guard()({ name: 'write' }), 'write must be denied')
  assert.ok(h.guard()({ name: 'bash' }), 'bash must be denied')
  assert.equal(h.guard()({ name: 'read' }), undefined, 'read must stay allowed')
  // Route Manifest 被注入
  assert.equal(h.calls.injected.length, 1)
  assert.match(h.calls.injected[0].content[0].text, /ROUTE MANIFEST/)
  assert.equal(h.calls.injected[0].source.plugin, 'research-entry')
  // 没有新建 agent
  assert.equal(h.calls.setPolicy.length, 0, 'in-session mode must not set an approval policy on a new agent')
})

test('the in-session path refuses to nest inside a research preset', async () => {
  const h = makeHarness({ composedPreset: 'researcher' })
  const result = await invoke(h, '再来一次')
  assert.equal(result.kind, 'error')
  assert.match(result.text, /已经处于研究模式/)
  assert.equal(h.calls.guarded, 0, 'a refused entry must not install a guard')
})

test('a second entry while already active is refused, not silently re-applied', async () => {
  const h = makeHarness({ currentPreset: 'workspace-write', sandboxMode: 'workspace-full' })
  assert.equal((await invoke(h, '第一次')).kind, 'success')
  const second = await invoke(h, '第二次')
  assert.equal(second.kind, 'error')
  assert.match(second.text, /已经处于会话内研究模式/)
  assert.equal(h.calls.guarded, 1, 'guard must be installed exactly once')
})

test('off exits and restores the permission preset that was active before entry', async () => {
  const h = makeHarness({ currentPreset: 'workspace-write', sandboxMode: 'workspace-full' })
  await invoke(h, '研究一下')
  const exited = await invoke(h, 'off')
  assert.equal(exited.kind, 'success')
  assert.match(exited.text, /已退出研究模式/)
  assert.match(exited.text, /workspace-write/)
  assert.deepEqual(h.calls.setPermission, ['read-only', 'workspace-write'])
  assert.equal(h.calls.guardReleased, 1, 'the tool guard must be released on exit')
})

test('off is idempotent when research mode is not active', async () => {
  const h = makeHarness({})
  const result = await invoke(h, 'off')
  assert.equal(result.kind, 'success')
  assert.match(result.text, /不在会话内研究模式/)
})

test('entry rolls back the sandbox switch when the tool guard cannot be installed', async () => {
  const h = makeHarness({ currentPreset: 'workspace-write', sandboxMode: 'workspace-full' })
  let guardCalls = 0
  h.agent.ctx.tools.guard = () => { guardCalls += 1; throw new Error('guard registry unavailable') }
  const result = await invoke(h, '研究一下')
  assert.equal(result.kind, 'error')
  assert.match(result.text, /权限已回滚/)
  assert.equal(guardCalls, 1)
  // read-only 之后必须回到进入前的 preset
  assert.deepEqual(h.calls.setPermission, ['read-only', 'workspace-write'])
})

test('status reports whether in-session research is active', async () => {
  const h = makeHarness({ currentPreset: 'workspace-write', sandboxMode: 'workspace-full' })
  assert.match((await invoke(h, 'status')).text, /会话内研究模式: 未启用/)
  await invoke(h, '研究一下')
  assert.match((await invoke(h, 'status')).text, /会话内研究模式: 启用中/)
})

test('usage is returned for an empty invocation', async () => {
  const h = makeHarness({})
  const result = await invoke(h, '')
  assert.equal(result.kind, 'error')
  assert.match(result.text, /\/research <任务>/)
  assert.match(result.text, /\/research --session <任务>/)
  assert.match(result.text, /\/research off/)
})

// ── 派生模式 ────────────────────────────────────────────────────────────────

test('--session refuses to derive from a writable session', async () => {
  const h = makeHarness({ sandboxMode: 'workspace-full' })
  const result = await invoke(h, '--session 审计')
  assert.equal(result.kind, 'error')
  assert.match(result.text, /要求只读环境/)
})

test('--session contains a setup failure and leaves the parent session untouched', async () => {
  // 当 setup reject 时，agents.create 本身 reject，factory 已经回滚了那次创建：
  // 此时没有可处置的 handle。这里要证明的是**失败被收住**——命令返回错误，
  // 不抛穿、不改动父会话。
  const h = makeHarness({
    sandboxMode: 'read-only',
    fork: () => ({ id: 'fork-1', firstLiveSeq: 10, snapshotEvents: () => [] }),
    create: async (options) => {
      const child = {
        id: 'child',
        session: { id: 'child' },
        ctx: { on() {}, tools: { guard: () => () => {} } },
      }
      await options.setup(child.ctx, child)
      // 不应到达这里
      return { agent: child, dispose: async () => { throw new Error('must not be reached') } }
    },
    mount: async () => { throw new Error('preset failed to mount') },
  })
  const result = await invoke(h, '--session 审计')
  assert.equal(result.kind, 'error')
  assert.match(result.text, /启动失败/)
  assert.match(result.text, /原会话未受影响/)
  // 父会话的权限没有被改动
  assert.deepEqual(h.calls.setPermission, ['read-only'], 'only the child session may be switched')
  assert.equal(h.calls.guarded, 0, 'the parent session must not receive a guard')
})

// ── 人格遮蔽 ────────────────────────────────────────────────────────────────

test('extractPersonaPrefix pulls the persona block out of a real preset file', () => {
  const yaml = fs.readFileSync(path.join(__dirname, '..', 'researcher', 'agent.cordis.yml'), 'utf8')
  const text = T.extractPersonaPrefix(yaml)
  assert.equal(typeof text, 'string')
  assert.ok(text.length > 1000, 'the shipped research persona is long; got ' + text.length)
  assert.match(text, /Project Research/)
  // 行首缩进被剥掉，正文不再是 YAML 块
  assert.doesNotMatch(text, /^\s{4,}\S/m)
})

test('extractPersonaPrefix declines rather than guessing', () => {
  assert.equal(T.extractPersonaPrefix(''), undefined)
  assert.equal(T.extractPersonaPrefix('no persona here'), undefined)
  assert.equal(T.extractPersonaPrefix('- id: persona\n  config:\n    prefix: |-\n'), undefined)
  assert.equal(T.extractPersonaPrefix(undefined), undefined)
})

test('the fallback persona is short but keeps the read-only contract', () => {
  assert.ok(T.IN_SESSION_PERSONA_FALLBACK.length > 100)
  assert.match(T.IN_SESSION_PERSONA_FALLBACK, /只读/)
  assert.match(T.IN_SESSION_PERSONA_FALLBACK, /BUILD/)
  assert.match(T.IN_SESSION_PERSONA_FALLBACK, /不知道/)
})

test('the persona shadow targets the real DSH persona section names and orders', () => {
  assert.equal(T.PERSONA_SECTION_NAME, 'deployment:persona-prefix')
  assert.equal(T.PERSONA_SUFFIX_SECTION_NAME, 'deployment:persona-suffix')
  assert.equal(T.PERSONA_PREFIX_ORDER, 0)
  assert.equal(T.PERSONA_SUFFIX_ORDER, 10200)
})

test('entering research mode registers the persona shadow on the agent scope', async () => {
  const h = makeHarness({ currentPreset: 'workspace-write', sandboxMode: 'workspace-full' })
  const result = await invoke(h, '研究一下')
  assert.equal(result.kind, 'success')
  assert.match(result.text, /研究人格已启用/)
  const sections = h.calls.sections
  assert.equal(sections.length, 2, 'prefix and suffix sections must both be registered')
  const prefix = sections.find((s) => s.name === 'deployment:persona-prefix')
  const suffix = sections.find((s) => s.name === 'deployment:persona-suffix')
  assert.ok(prefix && typeof prefix.text === 'function', 'the prefix text must be dynamic')
  assert.ok(suffix && typeof suffix.text === 'function', 'the suffix text must be dynamic')
  // 未进入研究模式的 agent 拿到空文本 —— 即"没有遮蔽"
  assert.equal(prefix.text({ agent: {} }), '')
  // 进入后的 agent 拿到研究人格
  const rendered = prefix.text({ agent: h.agent })
  assert.ok(rendered.length > 100)
  assert.match(rendered, /Project Research/)
  // 后缀在研究模式下被遮蔽为空
  assert.equal(suffix.text({ agent: h.agent }), '')
})

test('exiting research mode turns the persona back off without re-registering', async () => {
  const h = makeHarness({ currentPreset: 'workspace-write', sandboxMode: 'workspace-full' })
  await invoke(h, '研究一下')
  const sections = h.calls.sections.slice()
  await invoke(h, 'off')
  assert.equal(h.calls.sections.length, sections.length, 'exit must not register more sections')
  const prefix = sections.find((s) => s.name === 'deployment:persona-prefix')
  assert.equal(prefix.text({ agent: h.agent }), '', 'after exit the persona is off')
})

test('a second entry does not register a second persona shadow', async () => {
  const h = makeHarness({ currentPreset: 'workspace-write', sandboxMode: 'workspace-full' })
  await invoke(h, '第一次')
  await invoke(h, '第二次')
  assert.equal(h.calls.sections.length, 2)
})

// ── 源码不变量 ──────────────────────────────────────────────────────────────

test('the plugin never uses the non-existent sandbox setter', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'researcher', 'plugins', 'research-entry', 'index.js'), 'utf8')
  assert.doesNotMatch(source, /sandboxPolicy\.setSandboxMode/)
})

test('the reason the tool guard exists is documented in the source', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'researcher', 'plugins', 'research-entry', 'index.js'), 'utf8')
  // permissionPresets only constrains the filesystem; shell writes pass through it.
  assert.match(source, /shell 里的写穿过 fs 沙箱/)
  // the in-session mode has no research persona from the preset — say so, and say
  // how the persona is supplied instead, rather than hiding the limitation.
  assert.match(source, /没有研究 persona/)
})

test('no preset-local plugin publishes a process-global service', () => {
  // A row that publishes a service without an `isolate` realm is rejected at mount.
  // This entry has to load in the host presets too, where a realm cannot be added,
  // so the guarantee is that none of these rows provides anything process-global.
  const pluginDir = path.join(__dirname, '..', 'researcher', 'plugins')
  for (const entry of fs.readdirSync(pluginDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const file = path.join(pluginDir, entry.name, 'index.js')
    if (!fs.existsSync(file)) continue
    const source = fs.readFileSync(file, 'utf8')
    assert.doesNotMatch(source, /ctx\.provide\s*\(/u, entry.name + ' publishes a process-global service via ctx.provide')
    assert.doesNotMatch(source, /\bctx\.set\s*\(/u, entry.name + ' writes a service through ctx.set')
  }
})
