// research-entry tests: 保证强度分级、命令契约与编排前提。
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const entry = require('../researcher/plugins/research-entry/index.js')
const T = entry.__test

test('guarantee is three-level and never conflates the levels', () => {
  assert.equal(T.guaranteeOf({ mode: 'read-only', policy: 'never' }), T.GUARANTEE_SANDBOX)
  assert.equal(T.guaranteeOf({ mode: 'read-only', policy: 'ask' }), T.GUARANTEE_CATALOG)
  assert.equal(T.guaranteeOf({ mode: 'workspace-write', policy: 'never' }), T.GUARANTEE_DEGRADED)
  assert.equal(T.guaranteeOf({ mode: 'danger-full-access', policy: 'never' }), T.GUARANTEE_DEGRADED)
  assert.equal(T.guaranteeOf(undefined), T.GUARANTEE_DEGRADED)
})

test('each guarantee level renders a distinct, honest statement', () => {
  const sandbox = T.renderGuarantee(T.GUARANTEE_SANDBOX)
  const catalog = T.renderGuarantee(T.GUARANTEE_CATALOG)
  const degraded = T.renderGuarantee(T.GUARANTEE_DEGRADED)
  assert.match(sandbox, /SANDBOX/)
  assert.match(catalog, /CATALOG/)
  assert.match(catalog, /无升级路径的保证不成立/)
  assert.match(degraded, /DEGRADED/)
  assert.match(degraded, /拒绝以研究模式运行/)
  assert.notEqual(sandbox, catalog)
  assert.notEqual(catalog, degraded)
})

test('the route preamble carries the injection discipline', () => {
  assert.match(T.ROUTE_PREAMBLE, /HIT/)
  assert.match(T.ROUTE_PREAMBLE, /CLEAR/)
  assert.match(T.ROUTE_PREAMBLE, /UNKNOWN/)
  assert.match(T.ROUTE_PREAMBLE, /不得.*充数/)
  assert.match(T.ROUTE_PREAMBLE, /透镜正文不在本消息里/)
})

test('usage documents both supported forms', () => {
  assert.match(T.USAGE, /\/research <任务>/)
  assert.match(T.USAGE, /\/research status/)
})

test('the plugin declares the services its orchestration needs', () => {
  assert.equal(entry.name, 'research-entry')
  for (const service of ['commands', 'agents', 'sessions', 'agentPresets', 'approval', 'permissionPresets']) {
    assert.ok(entry.inject.includes(service), 'missing injected service: ' + service)
  }
})

test('the only resource amplifier this plugin adds is bounded', () => {
  // `/research` creates a new agent. Without a cap, one stray call or one loop
  // could derive research sessions indefinitely.
  assert.ok(Number.isInteger(T.MAX_CONCURRENT_RESEARCH) && T.MAX_CONCURRENT_RESEARCH > 0)
  assert.deepEqual(T.RESEARCH_PRESET_FAMILY, ['researcher', 'researcher-quick', 'researcher-deep'])
  const fs = require('node:fs')
  const path = require('node:path')
  const source = fs.readFileSync(path.join(__dirname, '..', 'researcher', 'plugins', 'research-entry', 'index.js'), 'utf8')
  assert.match(source, /entryRefusal/)
  assert.match(source, /派生的研究 agent 数量上限|研究 agent 数量上限/)
  // 拒绝必须是只读的：守卫体内不得出现任何会改变状态的调用。
  const guardBody = source.slice(source.indexOf('const entryRefusal'), source.indexOf('const buildManifest'))
  assert.doesNotMatch(guardBody, /(?:permissionPresets|approval)\.(?:set|setPolicy)\(/)
  assert.doesNotMatch(guardBody, /agentPresets\.mount\(/)
  assert.doesNotMatch(guardBody, /agents\.create\(/)
  assert.doesNotMatch(guardBody, /\.dispose\(/)
  assert.doesNotMatch(guardBody, /sessions\.fork\(/)
})

test('the plugin source encodes the fixed setup order and the recompose finding', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const source = fs.readFileSync(path.join(__dirname, '..', 'researcher', 'plugins', 'research-entry', 'index.js'), 'utf8')
  // 顺序不可调换：权限必须在 mount 之前。
  const permAt = source.indexOf('ctx.permissionPresets.set(')
  const mountAt = source.indexOf('ctx.agentPresets.mount(')
  assert.ok(permAt > 0 && mountAt > 0, 'both orchestration steps must be present')
  assert.ok(permAt < mountAt, 'permission switch must precede the preset mount')
  // 必须写明"不能原地 recompose"的实测依据，防止后人改回去。
  assert.match(source, /per-agent 安装只在\*\*创建期\*\*/)
  // 不得使用不存在的服务方法。
  assert.doesNotMatch(source, /sandboxPolicy\.setSandboxMode/)
})
