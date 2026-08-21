#!/usr/bin/env node
// Phase A Flask final scoring: folds adjudication + metrics into the results
// table and writes evaluation-result.md.
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..', '..')
const adjud = JSON.parse(fs.readFileSync(path.join(root, 'evaluation', 'cases', 'flask', 'adjudication.json'), 'utf8'))
const runsDir = path.join(root, 'evaluation', 'runs', 'flask')

const MODE_OF = { standard: 'Standard', plan: 'Plan', quick: 'Quick', deep: 'Deep' }
const GT_IDS = ['GT-01', 'GT-02', 'GT-03', 'GT-04', 'GT-05']

const runMetrics = {}
for (const mode of ['standard', 'plan', 'quick', 'deep']) {
  const dir = path.join(runsDir, mode)
  for (const r of fs.readdirSync(dir)) {
    const mf = path.join(dir, r, 'metrics.json')
    if (!fs.existsSync(mf)) continue
    runMetrics[r] = JSON.parse(fs.readFileSync(mf, 'utf8'))
  }
}

const rows = []
for (const mode of ['standard', 'plan', 'quick', 'deep']) {
  const dir = path.join(runsDir, mode)
  for (const r of fs.readdirSync(dir).sort()) {
    const m = runMetrics[r]
    if (!m) continue
    const gt = adjud.gt_verdicts[r] || {}
    const recall = GT_IDS.filter((g) => gt[g] === 'matched').length
    const prec = adjud.precision[r] || { findings: [] }
    const findings = prec.findings
    const sup = findings.filter((f) => f.support === 'supported').length
    const par = findings.filter((f) => f.support === 'partial').length
    const uns = findings.filter((f) => f.support === 'unsupported').length
    const billed = m.tokens_input + m.tokens_output + m.tokens_reasoning
    rows.push({
      run: r, mode, recall, recall_total: GT_IDS.length,
      findings_total: findings.length, supported: sup, partial: par, unsupported: uns,
      precision: findings.length ? sup / findings.length : 0,
      tokens_total: m.tokens_total, tokens_billed: billed, tokens_cache: m.tokens_cache_read,
      duration_min: m.duration_ms / 60000, tool_calls: m.tool_calls,
      cert: m.certificate_overall, exit: m.exit,
    })
  }
}

const agg = {}
for (const r of rows) {
  const key = r.mode
  agg[key] = agg[key] || { recall: [], precision: [], billed: [], dur: [], uns: [], sup: [], findings: [], partial: [] }
  agg[key].recall.push(r.recall)
  agg[key].precision.push(r.precision)
  agg[key].billed.push(r.tokens_billed)
  agg[key].dur.push(r.duration_min)
  agg[key].uns.push(r.unsupported)
  agg[key].sup.push(r.supported)
  agg[key].partial.push(r.partial)
  agg[key].findings.push(r.findings_total)
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
const rng = (a) => a.length ? [Math.min(...a), Math.max(...a)] : [0, 0]

const derived = {}
for (const mode of ['standard', 'plan', 'quick', 'deep']) {
  const a = agg[mode]
  derived[mode] = {
    meanSupported: mean(a.sup),
    meanBilledK: mean(a.billed) / 1000,
    meanDur: mean(a.dur),
    costAdjusted: (mean(a.sup) / (mean(a.billed) / 1e6)).toFixed(1),
    usefulPerMin: (mean(a.sup) / mean(a.dur)).toFixed(2),
    partialPer10: (mean(a.partial) / Math.max(mean(a.findings) / 10, 0.001)).toFixed(1),
  }
}

const table = []
table.push('| Mode | Recall (mean) | Precision (mean) | Cost (k billed tok/run) | Duration (min/run) | Unsupported/10 findings |')
table.push('|---|---|---|---|---|---|')
for (const mode of ['standard', 'plan', 'quick', 'deep']) {
  const a = agg[mode]
  const u10 = mean(a.uns) / Math.max(mean(a.findings) / 10, 0.001)
  table.push(`| ${MODE_OF[mode]} | ${mean(a.recall).toFixed(2)} (${a.recall.join('/')}) | ${(mean(a.precision) * 100).toFixed(0)}% (${a.precision.map((p) => (p * 100).toFixed(0)).join('/')}) | ${Math.round(mean(a.billed) / 1000)} (${a.billed.map((b) => Math.round(b / 1000)).join('/')}) | ${mean(a.dur).toFixed(1)} (${a.dur.map((d) => d.toFixed(1)).join('/')}) | ${u10.toFixed(1)} |`)
}

const md = `# Phase A Evaluation Result — Flask (dsh-researcher v0.6.0)

> **Preliminary, not statistically conclusive** (protocol §7). 1 repository × 4 modes × 3 runs. All artifacts, traces, and this report are preserved; nothing was deleted.

## Environment

- Repository: pallets/flask @ T0 \`2579ce9f18e6\` (2025-11-17, 3.2.0.dev), Rule A T0 selection (seed \`dsh-researcher-v0.6-phase-a:flask\`, draw 7/10)
- Snapshot: \`D:/AI_work_project/phase-a-snapshots/flask\` — blind-doctor 6/6 PASS pre/post every run; canary clean on all 12 runs
- Ground truth: v0.1, 5 items (GT-01 teardown chain abort / GT-02 automatic_options enable path / GT-03 should_ignore_error / GT-04 tutorial instance folder / GT-05 400-vs-415 docs drift), sha256 \`e5b3825be560\` locked pre-run
- Model: deepseek-official/deepseek-v4-flash, reasoning max, budget cap 500000 (deviation D003: switched from v4-pro after quota exhaustion; all scored runs share one model)
- Prompt (frozen): "Analyze this repository at the current snapshot. Identify the most important problems, risks, architectural concerns, and recommended next actions."
- Run conditions: fresh headless session per run, cwd = workspace, sandbox read-only + approval never (uniform), seeded random order (\`dsh-researcher-v0.6-phase-a:flask-runs\`), eval presets per mode (D002), runtime certificate SAFE on all researcher runs
- Timestamp: 2026-08-21; run log \`evaluation/runs/flask/execution-log.jsonl\`
- Operational notes: (a) all three Plan runs could not complete the plan-approval flow (headless profile registers no user-questions provider; exit_plan_mode failed twice per run) and delivered their analysis directly while staying in plan mode — the Plan deliverable is the analysis text, not an approved plan; (b) the snapshot working tree is CRLF-converted (Windows checkout artifact) — all runs correctly identified the diff noise, two runs (quick-02, deep-03) additionally recommended normalizing the workspace as an action item (artifact-adjacent false alarm, disclosed by the runs); (c) web_fetch had no usable provider in the researcher runs, limiting external verification (disclosed per run as C0/Unknown); (d) 1 run (deep-02) used subagent delegation (fork) for parallel module audits — within the preset's designed toolset.
- Exploratory (excluded from scoring): flask-standard-01/quick-03 (v4-pro) + deep-03 (QUOTA 402 failure) under \`evaluation/runs/flask-pro/\`

## Results

${table.join('\n')}

**Recall = 0/5 for every mode and every run (0/60).** No mode identified any of the five ground-truth problems. All candidates were keyword false positives (verified per-run: \`options\` → jinja_options/make_default_options_response; \`tutorial\` → repo-structure text; \`415\` → finding-ID digits; \`teardown\` → lifecycle-semantics discussions of the 3.2 context merge, not the chain-abort defect).

## Important cases

1. **Researcher-unique findings (qualitative, not GT-lift)**: deep-02 additionally identified CVE-2026-27205 (Vary: Cookie session-read path, fix shipped in 3.1.3 after T0 — an actual latent security issue), MethodView 405-assert, Blueprint.register atomicity, add_url_rule orphan-rule, get_debug_flag truthiness, SESSION_COOKIE_PARTITIONED docs/code contradiction, pre-commit permissions; deep-03 identified the broken devcontainer (installs nonexistent requirements/dev.txt — verified); plan-01 identified the update_template_context shim gap (verified); standard-03 identified the request-cycle cleanup regression (3.1.2 cleared environ['werkzeug.request'], T0 does not — verified).
2. **Plan-found but Researcher-missed (qualitative)**: plan-01/03's shim warning-cascade-down-hierarchies analysis and plan-02's preserve_context timing shift were not surfaced by standard runs; no GT items were found by anyone, so there is no GT-level Plan-vs-Researcher difference.
3. **All modes failed**: GT-01 (teardown chain abort — 12/12 missed despite every run reading do_teardown_request/app.py deeply; standard-02 and quick-01 found ADJACENT defects in the same pop() region — request.close/reset skipped on raising teardown — but not the chain-abort), GT-03 (should_ignore_error — 0 candidates in any run), GT-04 (tutorial instance folder), GT-05 (docs 400/415 — the internal docs contradiction went unnoticed despite deep-02's extensive docs work).
4. **Researcher misjudgments / false alarms**: all three quick runs and deep-03 surfaced the CRLF working-tree state; quick-02 and deep-03 additionally recommended normalizing the workspace as a BUILD action — the observation is correct (git diff = pure line-ending noise) but it is a harness/snapshot artifact, not a repository defect (quick-01 and quick-03 explicitly labeled it as such; quick-02/deep-03 treated it as an actionable item → false-alarm-adjacent). No run produced an unsupported significant claim in the scored set.

## Recall / Precision / Lift / Cost — commentary

- **Recall: 0.00 across the board.** The v0.1 GT set was compiled as "high-confidence, code-review-discoverable latent issues"; every mode instead converged on the snapshot's dominant reality — the 3.2 context-merge blast radius (shim, docs breakage, semantic changes) — which is real, but none of the five GT problems surfaced. Possible reasons: (a) the GT problems are in code paths the runs read but did not interrogate with the specific question (e.g., "what happens when a teardown raises?" — the docs contract 'callbacks must not fail' rationalizes the chain-abort); (b) the 400/415 docs contradiction sits in patterns/javascript.rst, outside the refactor's doc attention zone; (c) tutorial/instance-folder code is peripheral to a framework-core analysis.
- **Precision: Standard 0.80 / Plan 0.76 / Quick 0.85 / Deep 0.81 (mean of per-run precision).** All four modes produced mostly evidence-backed claims (multi-run convergence on the shim/docs/semantics clusters, spot-verified against the snapshot). Quick and Deep were slightly more precise per scored finding; Plan slightly lower (more inferred behavioral claims marked partial).
- **Researcher Lift: 0 GT-level lift** (nobody matched any GT). Qualitatively, Deep added verified unique findings Standard missed (CVE-2026-27205, devcontainer, MethodView/Blueprint/add_url_rule defects, SESSION_COOKIE_PARTITIONED contradiction) at ~1.5× billed tokens of Standard (mean ${Math.round(derived.deep.meanBilledK)}k vs ${Math.round(derived.standard.meanBilledK)}k) and ~1.9× duration (mean ${derived.deep.meanDur.toFixed(1)} min vs ${derived.standard.meanDur.toFixed(1)} min).
- **Quick vs Deep: Quick's scored findings overlap Deep's core clusters; Deep adds security-ledger depth (CVE, Vary: Cookie, dependency CVEs), more verified unique defects, and a structured handoff ledger, at ~1.9× the tokens (quick mean ${Math.round(derived.quick.meanBilledK)}k billed, deep ${Math.round(derived.deep.meanBilledK)}k). Quick's per-finding precision was 0.85 vs Deep 0.81 — the additional depth did not improve precision.
- **Cost-adjusted value** (supported significant findings per 1M billed tokens, mean): Standard ${derived.standard.costAdjusted}/1M, Plan ${derived.plan.costAdjusted}/1M, Quick ${derived.quick.costAdjusted}/1M, Deep ${derived.deep.costAdjusted}/1M. Useful findings per minute: Standard ${derived.standard.usefulPerMin}, Plan ${derived.plan.usefulPerMin}, Quick ${derived.quick.usefulPerMin}, Deep ${derived.deep.usefulPerMin}. Plan and Standard yield the most supported findings per token/minute; Deep's extra cost buys breadth (more unique verified findings), not precision.
- **False Alarm Burden**: 0 unsupported significant findings per 10 scored findings for all modes (partials per 10: Standard ${derived.standard.partialPer10}, Plan ${derived.plan.partialPer10}, Quick ${derived.quick.partialPer10}, Deep ${derived.deep.partialPer10} — mostly inference-class claims, honestly labeled by the runs). The CRLF-as-BUILD items (quick-02, deep-03) are the closest to false alarms, and both runs disclosed the artifact nature.
- **Decision Change**: all modes would recommend release-blocking work on the compat shim and docs; none would have changed the development direction of the snapshot's own refactor (all judged the merge direction sound — DON'T BUILD on reverting it). On this snapshot, no mode's findings would redirect a maintainer's plan toward the GT problems.

## Conclusion

On this repository snapshot (Flask main @ 2025-11-17, v0.6.0 Phase A), the GT-level comparison is unambiguous: **Recall = 0/5 for every mode and every run (0/60), so Researcher Lift = 0**. No mode found any of the five pre-registered latent problems, despite all modes producing substantial, mostly-evidence-backed analyses of the snapshot's dominant reality (the 3.2 context-merge blast radius). The differences that do exist are: (a) precision per scored finding (Quick 0.85, Deep 0.81, Standard 0.80, Plan 0.76), (b) breadth of verified unique findings (Deep > Quick > Plan ≈ Standard) at proportionally higher cost (Deep: ${Math.round(derived.deep.meanBilledK)}k billed tokens, ${derived.deep.meanDur.toFixed(1)} min/run vs Standard: ${Math.round(derived.standard.meanBilledK)}k, ${derived.standard.meanDur.toFixed(1)} min), and (c) cost-adjusted yield, where Plan (${derived.plan.costAdjusted}/1M tokens) and Quick (${derived.quick.costAdjusted}/1M) beat Deep (${derived.deep.costAdjusted}/1M).

**Current evidence does not justify additional Researcher complexity for GT-level hidden-problem discovery on this snapshot**: with zero GT hits across 60 run-GT pairs, no mode demonstrates an advantage at finding the pre-registered latent issues, and Deep's extra depth/token cost buys breadth rather than GT recall or precision. Per protocol §7 this is **Preliminary, not statistically conclusive** — commander.js and cheerio cases are required before any directional claim; the GT set itself (v0.1, strict matched-only adjudication) may sit outside every mode's attention surface on this snapshot, and the operational notes (Plan approval channel unavailable headless; CRLF artifact pollution) constrain generalization.
`
fs.writeFileSync(path.join(root, 'evaluation', 'runs', 'flask', 'evaluation-result.md'), md)
console.log('wrote evaluation-result.md')
console.log(table.join('\n'))
