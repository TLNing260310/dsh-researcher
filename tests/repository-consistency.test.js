'use strict'

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const { CASE_PROTOCOL, CASE_IDS, MANIFEST_SCHEMA, RUN_SCHEMA, validateManifest } = require('../evaluation/goal-governor-e1/score-e1.js')
const { validateCapturePaths } = require('../evaluation/goal-governor-e1/capture-visible-tools.js')
const { renderMarkdown } = require('../lib/cognition-core/index.js')

const root = path.join(__dirname, '..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')
const readJson = (...parts) => JSON.parse(read(...parts))

test('declared Node floor, public quickstart, and CI matrix cover the floor and current LTS', () => {
  const pkg = readJson('package.json')
  const readme = read('README.md')
  const quickstart = read('docs', 'quickstart.md')
  const workflow = read('.github', 'workflows', 'test.yml')
  assert.equal(pkg.engines.node, '>=22.12.0')
  assert.match(readme, /Node\.js[^\n]*`>=22\.12\.0`/)
  assert.match(workflow, /node:\s*\[22\.12\.0,\s*24\.x\]/)
  assert.doesNotMatch(workflow, /node:\s*\[[^\]]*(?:16|18|20)(?:\.|,|\])/)
  const initAt = readme.indexOf('project-cognition init .')
  const scaffoldAt = readme.indexOf('project-cognition quickstart --root')
  assert.ok(initAt >= 0 && scaffoldAt > initAt, 'homepage quickstart must initialize canonical state before the first scaffold')
  assert.doesNotMatch(quickstart, /project-cognition quickstart[^\n]*\\\s*$/m, 'public quickstart must remain pasteable in PowerShell')
})

test('package identity cannot be confused with the unrelated unscoped npm package', () => {
  const pkg = readJson('package.json')
  const readme = read('README.md')
  const readmeZh = read('README.zh-CN.md')
  const installation = read('docs', 'installation.md')
  assert.equal(pkg.name, '@tlning260310/dsh-researcher')
  assert.equal(pkg.private, true)
  for (const content of [readme, readmeZh, installation]) {
    assert.match(content, /npm[^\n]*dsh-researcher[^\n]*(?:different|另一)/i)
    assert.match(content, /github:TLNing260310\/dsh-researcher#(?:v0\.8\.0-alpha\.8|<tag>)/)
  }
  assert.doesNotMatch(readme, /npm (?:install|i) dsh-researcher(?=\s|$)/)
})

test('every installer describes the actual DSH Web permission transition', () => {
  const installer = read('bin', 'install.js')
  assert.match(installer, /Certified research:[^\n]*Read Only[^\n]*Project Research/, 'canonical installer lost the real UI selection order')
  assert.match(installer, /tightens approval to never[^\n]*Custom/, 'canonical installer must explain the one-way approval reduction and Custom UI state')
  assert.doesNotMatch(installer, /Project Research[^\n]*(?:permission )?read-only \+ approval never/, 'canonical installer asks for a UI combination DSH Web does not expose')
  assert.match(installer, /detected !== VERIFIED_DSH/)
  assert.match(installer, /Installation refused/)
  assert.match(installer, /UNSAFE OVERRIDE/)
  assert.match(installer, /@deepseek-ai\/dsh/)
  assert.match(installer, /--dsh-package/)
  for (const action of ['install', 'backup', 'uninstall', 'rollback']) assert.match(installer, new RegExp("'" + action + "'"))

  const powershell = read('install.ps1')
  const bash = read('install.sh')
  assert.match(powershell, /bin\\install\.js/)
  assert.match(powershell, /@args/)
  assert.match(bash, /bin\/install\.js/)
  assert.match(bash, /"\$@"/)
})

test('canonical cognition state carries the verified runtime and protocol-owned live E1 P1, and its projection has not drifted', () => {
  const state = readJson('.project-cognition', 'state.json')
  assert.ok(state.mission.environment.some((item) => /Node\.js 22\.12/.test(item)), 'canonical environment lost the Node.js 22.12 floor')

  const p1 = state.next_proofs.find((item) => item.id === 'P1')
  assert.ok(p1, 'canonical state lost next proof P1')
  assert.match(p1.statement, /every live DSH E1 trajectory/)
  assert.match(p1.statement, /frozen Goal Governor Evaluation Protocol/)

  assert.equal(read('PROJECT_COGNITION.md'), renderMarkdown(state) + '\n')
})

test('public/current guidance points to the frozen protocol without copying E1 counts or thresholds', () => {
  for (const relative of [
    'README.md',
    path.join('docs', 'goal-governor.md'),
    path.join('docs', 'roadmap.md'),
    path.join('docs', 'validation-status.md'),
    path.join('docs', 'cognition-governance.md'),
  ]) {
    const content = read(...relative.split(path.sep))
    assert.match(content, /goal-governor-evaluation-protocol\.md|Goal Governor Evaluation Protocol|frozen evaluation protocol/i, relative + ' lost the canonical protocol reference')
    assert.doesNotMatch(content, /E1[^\n]{0,80}(?:all six|six cases|6\s*(?:cases|tracks|trajectories)|六(?:个|条|项)?轨迹)/i, relative + ' copied the E1 case count')
    assert.doesNotMatch(content, /E1[^\n]{0,120}(?:3\s*\/\s*5|≥\s*3|threshold\s*[:=]\s*\d)/i, relative + ' copied an E1 threshold')
  }
})

test('E1 manifest contains exactly the frozen six case identities and terminals', () => {
  const manifest = readJson('evaluation', 'goal-governor-e1', 'manifest.json')
  assert.deepEqual(validateManifest(manifest), [])
  assert.equal(manifest.schema, MANIFEST_SCHEMA)
  assert.equal(manifest.protocol_version, '1.3')
  assert.deepEqual(manifest.cost_policy, {
    schema: 'dsh-researcher/model-cost-policy/v1',
    timezone: 'Asia/Shanghai',
    utc_offset_minutes: 480,
    restricted_weekdays: [1, 2, 3, 4, 5],
    restricted_windows: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
    remote: { route: 'deepseek-api', provider: 'deepseek-official', model: 'deepseek-v4-flash', base_url: 'https://api.deepseek.com' },
    local: { route: 'local-loopback', provider: 'deepseek-official', endpoint_assurance: 'resolved-adapter-base-url-loopback' },
    unknown_route: 'deny',
  })
  assert.equal(manifest.cases.length, 6)
  assert.deepEqual(manifest.cases.map((item) => item.id), CASE_IDS)
  assert.deepEqual(
    manifest.cases.map((item) => item.expected_terminal),
    CASE_PROTOCOL.map((item) => item.expected_terminal),
  )
  assert.equal(new Set(manifest.cases.map((item) => item.artifact)).size, 6)
  for (const item of manifest.cases) {
    assert.equal(path.isAbsolute(item.artifact), false)
    assert.equal(path.normalize(item.artifact).startsWith('..'), false)
  }
  assert.equal(manifest.artifacts.schema, RUN_SCHEMA)
  const required = new Set(manifest.artifacts.required_raw_fields)
  for (const field of ['run_lock', 'cost_admissions', 'fixture_baseline', 'cognition_state', 'goal_contract', 'verifier_registry', 'session_events', 'visible_tools', 'visible_tool_schemas', 'worktree', 'replay_checkpoints', 'host_verifier', 'budget_evidence', 'runtime_provenance', 'attempt_identity']) {
    assert.equal(required.has(field), true, 'missing E1 raw artifact field: ' + field)
  }
})

test('protocol v1.3 cost enforcement and superseded protocol provenance cannot drift silently', () => {
  const runner = read('evaluation', 'goal-governor-e1', 'run-e1.js')
  const child = read('evaluation', 'goal-governor-e1', 'runner', 'e1-headless.mjs')
  const scorer = read('evaluation', 'goal-governor-e1', 'score-e1.js')
  const archive = read('docs', 'goal-governor-evaluation-protocol-v1.md')
  const archiveV11 = read('docs', 'goal-governor-evaluation-protocol-v1.1.md')
  const archiveV12 = read('docs', 'goal-governor-evaluation-protocol-v1.2.md')
  for (const phase of ['pre-output', 'pre-spawn']) assert.match(runner, new RegExp("phase: '" + phase + "'"))
  assert.match(child, /resolveAdapterOptions/)
  assert.match(child, /resolved DSH DeepSeek baseURL differs from the frozen run-lock/)
  assert.match(child, /before-model-followup/)
  assert.match(child, /after-model-followup/)
  assert.match(runner, /DEEPSEEK_BASE_URL:\s*lockResult\.lock\.model\.base_url/)
  assert.match(runner, /frozen-dsh-settings\.yaml/)
  assert.match(runner, /cost-admission-denied\.json/)
  assert.match(read('evaluation', 'goal-governor-e1', 'runner', 'e1.patch.yml'), /watch:\s*false/)
  assert.match(scorer, /independently recomputed policy decision/)
  assert.match(archive, /Live runs under v1 \| `0`/)
  assert.match(archive, /86691ec89951b1d5319760856d21e58ef7d98a04/)
  assert.match(archive, /ce8047a4c569ebeda07be5d1882a820da7efbfac392dabb24123503bf01ea856/)
  assert.match(archiveV11, /Live runs under v1\.1: `0`/)
  assert.match(archiveV11, /4e29b361056588bd9a625cc2335ef8721f52e8a4/)
  assert.match(archiveV11, /47e75b262c4e4b4342889a175192726ffdb2da8e4d1bd31e3108e956131f0cca/)
  assert.match(archiveV12, /model calls: `0`/i)
  assert.match(archiveV12, /acfa74ab70eb5570268e9a3f176b9f6870a1b4b2/)
  assert.match(archiveV12, /48c5e88603c1214e896c6ec6139ccddc91fa3d7a901029b61f9a81ca6e9c8152/i)
})

test('E1 runner defaults to offline preflight and live mode fails before launch without cost acknowledgement', () => {
  const entry = path.join(root, 'evaluation', 'goal-governor-e1', 'run-e1.js')
  const offline = spawnSync(process.execPath, [entry], { cwd: root, encoding: 'utf8', windowsHide: true })
  assert.equal(offline.status, 0, offline.stderr)
  const report = JSON.parse(offline.stdout)
  assert.equal(report.offline, true)
  assert.equal(report.model_calls, 0)
  assert.equal(report.network_calls, 0)

  const refused = spawnSync(process.execPath, [entry, '--mode', 'live'], { cwd: root, encoding: 'utf8', windowsHide: true })
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /requires the literal flag --ack-live-cost/)
})

test('E1 runner and scorer share the honest external-TTY evidence contract', () => {
  const runner = read('evaluation', 'goal-governor-e1', 'runner', 'e1-headless.mjs')
  const scorer = read('evaluation', 'goal-governor-e1', 'score-e1.js')
  for (const token of [
    'external-interactive-tty-input',
    'interactive-tty-input',
    'not-cryptographic-human-identity',
  ]) {
    assert.match(runner, new RegExp(token), 'runner lost TTY evidence token ' + token)
    assert.match(scorer, new RegExp(token), 'scorer drifted from runner TTY evidence token ' + token)
  }
  assert.doesNotMatch(runner, /external-tty-human/, 'runner must not claim cryptographic human identity from a TTY')
  assert.doesNotMatch(scorer, /external-tty-human/, 'scorer must not require an identity claim the runner cannot prove')
})

test('E1 rc.2 patch and package imports are host-materialized and exact-tool restricted', () => {
  const patch = read('evaluation', 'goal-governor-e1', 'runner', 'e1.patch.yml')
  const materializer = read('evaluation', 'goal-governor-e1', 'patch-materializer.js')
  const capture = read('evaluation', 'goal-governor-e1', 'runner', 'capture-visible-tools.mjs')
  const live = read('evaluation', 'goal-governor-e1', 'runner', 'e1-headless.mjs')
  assert.match(patch, /"__DSH_E1_HOST_TOOL_URL__"/)
  assert.match(patch, /"__DSH_E1_DRIVER_URL__"/)
  assert.match(materializer, /pathToFileURL/)
  assert.match(capture, /DSH_E1_PACKAGE_IMPORTS/)
  assert.match(live, /DSH_E1_PACKAGE_IMPORTS/)
  assert.match(capture, /EXACT_VISIBLE_TOOL_NAMES/)
  assert.match(live, /EXACT_VISIBLE_TOOL_NAMES/)
})

test('capture output cannot be hidden inside any measured or runtime-controlled path', () => {
  const parent = path.dirname(root)
  const paths = {
    output: path.join(parent, 'e1-capture-output', 'visible-tools.json'),
    workspace: path.join(parent, 'e1-capture-workspace'),
    dshModuleRoot: path.join(parent, 'e1-capture-modules'),
    dshHome: path.join(parent, 'e1-capture-home'),
    presetRoot: path.join(parent, 'e1-capture-candidate'),
  }
  assert.doesNotThrow(() => validateCapturePaths(paths))
  for (const key of ['workspace', 'dshModuleRoot', 'dshHome', 'presetRoot']) {
    assert.throws(
      () => validateCapturePaths({ ...paths, output: path.join(paths[key], 'visible-tools.json') }),
      /output\/(?:workspace|modules|DSH_HOME|candidate) paths must be disjoint/,
    )
  }
})

test('the public proof order cannot skip E1, the non-inferential pilot, or E2', () => {
  const canonicalOrder = 'Gate 0 → E1 → non-inferential pilot → E2 → second-adapter conformance → E3'
  assert.match(read('README.md'), new RegExp(canonicalOrder))
  assert.match(read('docs', 'cognition-governance.md'), new RegExp(canonicalOrder))
  const protocol = read('docs', 'goal-governor-evaluation-protocol.md')
  const gate0 = protocol.indexOf('Gate 0')
  const e1 = protocol.indexOf('E1 —')
  const e2 = protocol.indexOf('E2 —')
  const e3 = protocol.indexOf('E3 —')
  assert.ok(gate0 >= 0 && gate0 < e1 && e1 < e2 && e2 < e3, 'protocol sections changed proof order')
})

test('current release identity and public evidence-status language do not drift', () => {
  const pkg = readJson('package.json')
  const readme = read('README.md')
  const readmeZh = read('README.zh-CN.md')
  const changelog = read('CHANGELOG.md')
  const validation = read('docs', 'validation-status.md')
  const roadmap = read('docs', 'roadmap.md')
  const governor = read('docs', 'goal-governor.md')
  const currentVersion = new RegExp('Current release: `v?' + pkg.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '`')
  const pinnedInstall = new RegExp('#v' + pkg.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const firstRelease = changelog.match(/^##\s+([^\s(]+)/m)
  assert.match(readme, currentVersion)
  assert.match(readmeZh, new RegExp('当前版本：`' + pkg.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '`'))
  assert.match(readme, pinnedInstall)
  assert.match(validation, new RegExp('`' + pkg.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '`'))
  assert.match(roadmap, new RegExp('`' + pkg.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '`'))
  assert.equal(fs.existsSync(path.join(root, 'docs', 'releases', 'v' + pkg.version + '.md')), true)
  assert.equal(firstRelease && firstRelease[1], pkg.version)
  assert.match(readme, /Live E1[^\n]*NOT RUN|model productivity[^\n]*not proven/i)
  assert.match(readmeZh, /真实模型端到端成功率[^\n]*尚未证明|真实模型端到端[^\n]*尚未证明/)
  assert.match(validation, /Live conformance[^\n]*\*\*未完成 E1\*\*/)
  assert.match(validation, /不得宣称[^\n]*真实 DSH E2E 已通过/)
  assert.match(governor, /尚未证明：真实 DSH 模型会话端到端成功率/)
  assert.doesNotMatch(governor, /\d+\s*项测试通过/)
})

test('CI and issue templates avoid duplicate tag verification and per-release placeholder drift', () => {
  const workflow = read('.github', 'workflows', 'test.yml')
  assert.match(workflow, /push:\s*\n\s+branches:\s*\[main\]/)
  assert.match(workflow, /concurrency:/)
  assert.match(workflow, /timeout-minutes:/)
  for (const relative of [
    path.join('.github', 'ISSUE_TEMPLATE', 'bug-report.yml'),
    path.join('.github', 'ISSUE_TEMPLATE', 'feedback.yml'),
    path.join('.github', 'ISSUE_TEMPLATE', 'trial-report.yml'),
  ]) assert.doesNotMatch(read(...relative.split(path.sep)), /0\.8\.0-alpha\.\d+/, relative + ' hard-codes a prerelease')
})
