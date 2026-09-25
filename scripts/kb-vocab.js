'use strict'
// 从 docs/kb/clean/**/*.json 的实际用法固化标签词表。
// 用法：node scripts/kb-vocab.js [--check]
// --check 模式下不写文件，只在词表与用法不一致时以非零退出（供 CI 使用）。
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const lensDir = path.join(root, 'docs', 'kb', 'clean')
const outFile = path.join(root, 'docs', 'kb', 'tags.yml')
const CATEGORIES = ['structure', 'symptom', 'stack', 'store', 'surface']
const FENCE = '```'

const collectFiles = (dir) => {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectFiles(full))
    else if (entry.name.endsWith('.json')) out.push(full)
  }
  return out
}

const collectLenses = () => {
  const files = collectFiles(lensDir).sort()
  const lenses = []
  for (const file of files) {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!Array.isArray(parsed)) throw new Error('lens file must contain a JSON array: ' + path.relative(root, file))
    for (const lens of parsed) lenses.push({ lens, file: path.relative(root, file) })
  }
  return lenses
}

const buildVocab = (lenses) => {
  const vocab = {}
  for (const category of CATEGORIES) {
    const set = new Set()
    for (const { lens } of lenses) {
      const values = (lens.tags && lens.tags[category]) || []
      if (!Array.isArray(values)) throw new Error('tags.' + category + ' must be an array in ' + lens.lens)
      for (const value of values) set.add(String(value))
    }
    vocab[category] = [...set].sort()
  }
  return vocab
}

const TITLES = {
  structure: '结构信号（权重 2）— 主要用于**域初筛**',
  symptom: '症状信号（权重 2）— 主要用于**选哪条透镜**',
  stack: '技术栈（权重 1）',
  store: '存储与中间件（权重 1）',
  surface: '接触面（权重 1）— 用于定位证据锚点',
}

const render = (vocab, lenses) => {
  const lines = []
  lines.push('# 闭集标签词表（Tag Vocabulary）', '')
  lines.push('> **本文件由 `npm run kb:vocab` 从 `docs/kb/clean/**/*.json` 的实际用法固化生成，请勿手改。**', '>')
  lines.push('> 路由**只允许**从这里取值。新增标签是一次 schema 变更：先加透镜、再重跑 `kb:vocab`、然后审阅 diff。', '>')
  lines.push('> 词表不是先验设计出来的，而是**从首批 ' + lenses.length + ' 条透镜的实际用法收敛出来的**——比拍脑袋的粗粒度词表精确得多。', '')
  for (const category of CATEGORIES) {
    lines.push('## ' + category + ' — ' + TITLES[category], '')
    lines.push(FENCE)
    for (let i = 0; i < vocab[category].length; i += 4) lines.push(vocab[category].slice(i, i + 4).join('  '))
    lines.push(FENCE, '')
  }
  lines.push('## 缺口域强制覆盖', '')
  lines.push('路由**必须**至少各选一条 `state-consistency` 与 `failure-resilience` 的透镜——这两个域是正向开发思维最容易漏掉的。', '')
  lines.push('**依据（实测故障分布）**：*Metastable Failures in the Wild*（USENIX ;login:, 2022）分析数百份公开事故报告、识别 21 起：**>50% 的 sustaining effect 是 retry policy，>55% 靠 load shedding 才恢复**；Dan Luu 统计约 **50% 的 global outage 由配置变更引起**；OSDI 2014 Yuan et al.：约 200 个 bug 中 48 个 critical failure，**92% 源于错误处理代码**。', '')
  return lines.join('\n')
}

const run = (checkOnly) => {
  const lenses = collectLenses()
  const vocab = buildVocab(lenses)
  const next = render(vocab, lenses)
  const current = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : ''
  const counts = CATEGORIES.map((c) => c + '=' + vocab[c].length).join(' ')
  if (checkOnly) {
    if (current !== next) throw new Error('docs/kb/tags.yml is stale; run `npm run kb:vocab` (' + counts + ')')
    process.stdout.write('kb-vocab: up to date — ' + lenses.length + ' lenses, ' + counts + '\n')
    return
  }
  fs.writeFileSync(outFile, next)
  process.stdout.write('kb-vocab: wrote docs/kb/tags.yml — ' + lenses.length + ' lenses, ' + counts + '\n')
}

if (require.main === module) {
  try {
    run(process.argv.includes('--check'))
  } catch (error) {
    process.stderr.write('kb-vocab failed: ' + (error && error.message ? error.message : String(error)) + '\n')
    process.exitCode = 1
  }
}

module.exports = { collectLenses, buildVocab, render, CATEGORIES }
