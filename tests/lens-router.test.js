// lens-router tests: 门禁、透镜库加载、信号扫描、路由产物与 RRF。
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const router = require('../researcher/plugins/lens-router/index.js')
const R = router.__test
const REPO_ROOT = path.join(__dirname, '..')
const KB_ROOT = path.join(REPO_ROOT, 'docs', 'kb', 'clean')

test('gate: a trigger word enables routing, a negated one does not', () => {
  assert.equal(R.explicitlyRequested('用透镜审查一下这个项目', ['透镜']), true)
  assert.equal(R.explicitlyRequested('不要用透镜审查', ['透镜']), false)
  assert.equal(R.explicitlyRequested('这次不检索透镜库', ['透镜']), false)
  // 否定词必须离触发词足够近才构成否定——远距离的否定不该误伤
  assert.equal(R.explicitlyRequested('不要提交，先用透镜审查', ['透镜']), true)
  assert.equal(R.explicitlyRequested('', ['透镜']), false)
  assert.equal(R.explicitlyRequested('随便聊聊', ['透镜']), false)
})

test('gate: refusal text tells the model not to keep asking', () => {
  assert.match(R.REFUSAL_TEXT, /不要反复询问/)
})

test('currentDirectUserText reads only user-authored text from the current turn', () => {
  const agent = {
    session: {
      snapshotEvents: () => [
        { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '上一轮' }] } },
        { type: 'turn/start', data: { turn: 2 } },
        { type: 'user/message', data: { source: { kind: 'plugin' }, content: [{ type: 'text', text: '插件注入的内容' }] } },
        { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '本轮用户话' }] } },
      ],
    },
  }
  assert.equal(R.currentDirectUserText(agent), '本轮用户话')
  assert.equal(R.currentDirectUserText({}), '')
})

test('lensDefects rejects a lens missing the minimum contract', () => {
  assert.deepEqual(R.lensDefects({ lens: 'X-1', name: 'n', domain: 'd', trigger: 't', questions: ['a', 'b', 'c'], failure_modes: [{ name: 'f' }], alternatives: [], evidence_anchors: [], tags: {}, sources: [], provenance: {} }), [])
  const bad = R.lensDefects({ lens: 'X-2', questions: ['a'], failure_modes: [] })
  assert.ok(bad.includes('domain'))
  assert.ok(bad.includes('questions<3'))
  assert.ok(bad.includes('failure_modes=0'))
})

test('the shipped lens corpus is loadable and every lens satisfies the contract', () => {
  const { lenses, rejected } = R.loadLenses(KB_ROOT)
  assert.equal(rejected.length, 0, 'rejected: ' + JSON.stringify(rejected))
  assert.ok(lenses.length >= 30, 'expected the shipped corpus, got ' + lenses.length)
  for (const lens of lenses) assert.deepEqual(R.lensDefects(lens), [], 'defective lens ' + lens.lens)
  assert.equal(new Set(lenses.map((l) => l.lens)).size, lenses.length, 'lens ids must be unique')
})

test('scanSignals reads repository facts and never invents them', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-scan-'))
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { '@modelcontextprotocol/sdk': '^1.0.0', express: '^4' } }))
    fs.mkdirSync(path.join(dir, 'migrations'))
    const { signals } = R.scanSignals(dir)
    const ids = signals.map((s) => s.id)
    assert.ok(ids.includes('structure:migrations'))
    assert.ok(ids.includes('dep:@modelcontextprotocol/sdk'))
    assert.ok(ids.includes('dep:express'))
    assert.ok(!ids.includes('structure:k8s'), 'must not report paths that do not exist')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('route returns an auditable manifest with skipped and unassessable as required fields', () => {
  const manifest = R.route({
    kbRoot: KB_ROOT,
    task: '给项目加一个新的模型 provider 适配层，并接入一个 MCP server 暴露工具',
    signals: [
      { id: 'dep:@modelcontextprotocol/sdk', kind: 'dependency', evidence: 'package.json', weight: 2 },
      { id: 'structure:providers', kind: 'structure', evidence: 'providers/', weight: 2 },
      { id: 'structure:migrations', kind: 'structure', evidence: 'migrations/', weight: 2 },
    ],
  })
  assert.equal(manifest.schema, R.MANIFEST_SCHEMA)
  assert.ok(Array.isArray(manifest.selected) && manifest.selected.length > 0)
  assert.ok(Array.isArray(manifest.skipped), 'skipped must be present')
  assert.ok(Array.isArray(manifest.unassessable), 'unassessable must be present')
  assert.ok(manifest.corpus.lenses >= 30)
  for (const entry of manifest.selected) {
    assert.ok(typeof entry.lens === 'string')
    assert.ok(Array.isArray(entry.questions) && entry.questions.length >= 3)
    assert.ok(Array.isArray(entry.why))
  }
})

test('route always covers the two gap domains', () => {
  // 即使任务文本与这两个域毫无关系，也必须各选一条——依据实测故障分布。
  const manifest = R.route({ kbRoot: KB_ROOT, task: '完全无关的任务文本 zzzz', signals: [] })
  for (const domain of R.GAP_DOMAINS) {
    assert.ok(
      manifest.selected.some((entry) => entry.domain === domain),
      'gap domain not covered: ' + domain,
    )
  }
  assert.deepEqual(manifest.coverage.gapDomainsCovered, R.GAP_DOMAINS)
})

test('route never substitutes an approximate lens for a real match', () => {
  // 空信号 + 无关任务：可以选中的只有缺口域强制的两条，其余一律进 unassessable。
  const manifest = R.route({ kbRoot: KB_ROOT, task: 'zzzz qqqq', signals: [] })
  assert.equal(manifest.selected.length, R.GAP_DOMAINS.length)
  assert.ok(manifest.unassessable.length > 0)
  for (const entry of manifest.unassessable) assert.match(entry.why, /no evidence anchor/)
})

test('renderManifest injects lens ids and questions, not lens bodies', () => {
  const manifest = R.route({ kbRoot: KB_ROOT, task: '透镜 审查', signals: [] })
  const text = R.renderManifest(manifest)
  assert.match(text, /ROUTE MANIFEST/)
  assert.match(text, /SELECTED \(/)
  assert.match(text, /SKIPPED \(below threshold/)
  assert.match(text, /UNASSESSABLE \(no evidence in this repository\)/)
  assert.match(text, /verdict: HIT .* CLEAR .* UNKNOWN/s)
})

test('reciprocal rank fusion rewards items ranked by both lists', () => {
  const fused = R.reciprocalRankFusion([['a', 'b'], ['b', 'a']])
  assert.ok(fused.get('a') > 0 && fused.get('b') > 0)
  assert.ok(Math.abs(fused.get('a') - fused.get('b')) < 1e-12, 'symmetric input must fuse symmetrically')
  const onlyFirst = R.reciprocalRankFusion([['x'], []])
  assert.ok(onlyFirst.get('x') > 0)
})
