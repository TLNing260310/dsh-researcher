#!/usr/bin/env node
// Experiment A final artifacts builder: aggregates raw results, score report,
// analysis report, limitations into evaluation/results/experiment-a/.
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..', '..')
const runsRoot = path.join(root, 'evaluation', 'runs', 'commander.js', 'exp-a')
const outDir = path.join(root, 'evaluation', 'results', 'experiment-a')
fs.mkdirSync(outDir, { recursive: true })

const scores = JSON.parse(fs.readFileSync(path.join(runsRoot, 'exp-a-scores.json'), 'utf8'))
const adjud = JSON.parse(fs.readFileSync(path.join(root, 'evaluation', 'cases', 'commander.js', 'gt-calibration', 'adjudication-exp-a.json'), 'utf8'))
const metricsByRun = {}
for (const m of ['standard', 'plan', 'quick', 'deep']) {
  for (const r of fs.readdirSync(path.join(runsRoot, m))) {
    metricsByRun[r] = JSON.parse(fs.readFileSync(path.join(runsRoot, m, r, 'metrics.json'), 'utf8'))
  }
}

// raw-results.json
const raw = {
  schema: 'dsh-researcher/experiment-a/raw-results/v1',
  experiment: 'exp-a',
  case: 'commander.js',
  snapshot: 'bf35c5f99c20',
  protocol: 'evaluation-protocol-v1.1',
  gt: 'core-gt-v0.1.json (25 entries, 23 credits)',
  model: 'deepseek-official/deepseek-v4-flash (reasoning max, budget 500000)',
  rows: scores.rows.map((r) => ({
    run_id: r.run_id,
    mode: r.mode,
    gus: r.gus.gus,
    gus_parts: r.gus.parts,
    risk: r.risk,
    metrics: metricsByRun[r.run_id],
    verdicts: adjud.verdicts[r.run_id],
  })),
}
fs.writeFileSync(path.join(outDir, 'raw-results.json'), JSON.stringify(raw, null, 2))

// score-report.json
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
const byMode = {}
for (const r of scores.rows) {
  byMode[r.mode] = byMode[r.mode] || []
  byMode[r.mode].push(r)
}
const scoreReport = {
  schema: 'dsh-researcher/experiment-a/score-report/v1',
  summary: {},
  per_mode: {},
}
for (const m of ['standard', 'plan', 'quick', 'deep']) {
  const rs = byMode[m]
  const gus = rs.map((r) => r.gus.gus)
  const billed = rs.map((r) => metricsByRun[r.run_id].tokens_input + metricsByRun[r.run_id].tokens_output + metricsByRun[r.run_id].tokens_reasoning)
  const dur = rs.map((r) => metricsByRun[r.run_id].duration_ms / 60000)
  scoreReport.per_mode[m] = {
    gus: { values: gus.map((v) => Number(v.toFixed(3))), mean: Number(mean(gus).toFixed(3)), min: Number(Math.min(...gus).toFixed(3)), max: Number(Math.max(...gus).toFixed(3)) },
    billed_k: { values: billed.map((v) => Math.round(v / 1000)), mean_k: Math.round(mean(billed) / 1000) },
    duration_min: { values: dur.map((v) => Number(v.toFixed(1))), mean: Number(mean(dur).toFixed(1)) },
  }
}
scoreReport.summary = {
  gus_rank: ['plan', 'standard', 'quick', 'deep'],
  gus_means: { plan: scoreReport.per_mode.plan.gus.mean, standard: scoreReport.per_mode.standard.gus.mean, quick: scoreReport.per_mode.quick.gus.mean, deep: scoreReport.per_mode.deep.gus.mean },
  deep_cost_ratio_vs_standard: { tokens: (scoreReport.per_mode.deep.billed_k.mean_k / scoreReport.per_mode.standard.billed_k.mean_k).toFixed(1) + 'x', duration: (scoreReport.per_mode.deep.duration_min.mean / scoreReport.per_mode.standard.duration_min.mean).toFixed(1) + 'x' },
}
fs.writeFileSync(path.join(outDir, 'score-report.json'), JSON.stringify(scoreReport, null, 2))

// runs-manifest.json (copy)
fs.copyFileSync(path.join(runsRoot, 'exp-a-runs-manifest.json'), path.join(outDir, 'runs-manifest.json'))

// analysis-report.md
const analysis = `# Experiment A Analysis Report — commander.js (v0.7.1, Project Cognition Layer validation)

> **Preliminary, not statistically conclusive.** Single repository, 4 modes × 3 runs, one model, one snapshot. Full scope statement: evaluation/cases/commander.js/experiment-note.md.

## 1. Experiment Question

Does dsh-researcher (Quick/Deep) recover the pre-registered cognition structure of a mature, high-constraint library (commander.js) better than Standard/Plan? Measured by GUS (weighted: architecture relations 40% / design purpose 25% / key constraints 20% / factual 15%; 25 GT entries, 23 scoring credits), plus Risk coverage and cost.

## 2. Method

- Snapshot: commander.js @ bf35c5f (2026-02-01, v14.0.3) — mechanical T0 (Rule A, seeded), blind-truncated, cognition GT locked (sha256 19118a0d) before any scored run.
- GT: 25 Core entries from dual independent evaluators (45+39 candidates → calibration → refinement → freeze audit); coverage map merges duplicate cognition units (C06/C09, C16/C31) → 23 credits.
- Runs: 12 (Standard/Plan/Quick/Deep × 3), fresh headless sessions, read-only + never, deepseek-v4-flash, uniform task (frozen exp-a-pcr.txt), seeded random order (protocol v1.1 §1), pre/post blind-doctor with GT-lock check, canary-clean 12/12.
- Scoring: evaluator adjudication per entry (matched/partial/unmatched; strict: equivalent cognition with evidence = matched; related-but-incomplete = partial; absent/wrong = unmatched), folded into weighted GUS by score-v11.js. No scoring rule was changed after seeing results (the empty-factual-bucket guard was a pre-run scorer fix for the pre-registered 0-fact bucket).
- Boundary checks: 12/12 exit 0, 0 write attempts, researcher certificates SAFE, all PCRs contain the 7 sections.

## 3. Results

| Mode | GUS mean (min–max) | billed tokens (mean k) | duration (mean min) | Risk coverage |
|---|---|---|---|---|
| Standard | 0.702 (0.679–0.721) | 145 | 1.8 | 1/1 |
| Plan | **0.717** (0.679–0.750) | 183 | 2.8 | 1/1 |
| Quick | 0.669 (0.636–0.693) | 177 | 3.0 | 1/1 |
| Deep | 0.629 (0.516–0.707) | 327 | 7.5 | 1/1 |

Bucket-level GUS (mean): design_purpose — Plan/Quick/Standard 1.000, Deep 0.917; key_constraints — Plan 0.905 > Standard 0.881 > Quick 0.786 > Deep 0.714; architecture_relation — Plan 0.714 > Standard 0.690 > Quick 0.655 > Deep 0.643.

## 4. Findings (not "who wins")

1. **Researcher Deep did NOT recover more cognition structure than the baselines; it recovered the least.** GUS mean: Deep 0.629 < Quick 0.669 < Standard 0.702 < Plan 0.717, at 2.3× billed tokens and 4.2× duration vs Standard. The pre-registered anti-expectation ("Deep ≈ Quick ⇒ long inference adds no understanding") is exceeded: Deep is worse than Quick on GUS at 1.8× the cost.
2. **Plan Mode matched or beat Researcher on cognition recovery** (GUS 0.717, best constraint bucket 0.905, best arch bucket 0.714). Plan-01 reached 19/25 matched. This contradicts the "Researcher > Plan on understanding" direction on this snapshot.
3. **The "why" (design purpose) is universally recovered** — all modes at or near 1.000 in that bucket at this task difficulty; differentiation concentrates in constraint identification (Plan best) and architecture relations.
4. **Researcher's consistency is its weakness here**: Deep has the largest GUS variance (0.516–0.707; deep-03 = 0.516, its report was the least structured), Quick the second (0.636–0.693). Baselines were tighter.
5. **Risk surface: no differentiation** — all 12 runs surfaced the pre-registered risk entry (ESM enumeration risk) at matched/partial level; risk cognition did not separate modes at this task.
6. **All modes produced high-quality PCRs** — the difference is coverage of the 25 cognition units, not gross report quality; 0 boundary violations (no writes, no architecture-authority claims, no bug predictions — risk framing only).

## 5. Failure Analysis (of the Researcher hypothesis, this case)

- Why did Deep underperform? Deep reports are longer and more exploratory (subagent fan-out in deep-01/03, richer risk tables), but the extra exploration did not map to the pre-registered GT surface: the GT measures recovery of specific cognition units (flows/constraints), and Deep's added breadth (external CVEs, typosquats, v15 supersession) lies outside it. Longer pipelines may also dilute the structured deliverable: deep-01/03's final messages were short summaries, pushing the cognition into intermediate messages (scored from the full chain, but the deliverable structure suffered).
- Why did Plan win? Plan-01/03 produced the most complete constraint/flow coverage with a disciplined 7-section structure; plan mode's planning discipline (decision-complete enumeration) maps well to GT-style checklist cognition.
- Not a GT artifact: the GT was compiled independently (dual evaluators, snapshot-only) before any run; entry-level verdicts were judged per-report with strict criteria; the same 25 entries were applied to all modes.

## 6. Threats to Validity

See limitations.md. Headline: single repository (commander.js is a Researcher-favorable baseline by design — high-constraint, pipeline-centric), single model, single evaluator (D001), GT subjectivity, model randomness (n=3).

## 7. Conclusion (scoped)

On this repository snapshot (commander.js @ bf35c5f, v14.0.3), under protocol v1.1, **the evidence does not support the hypothesis that Researcher Deep/Quick recovers the pre-registered project-cognition structure better than Plan or Standard — the observed direction is the opposite (Deep lowest at 2–4× the cost), and Plan Mode performed best.** This does not generalize beyond this experiment (single repo, one model, n=3); it does not refute the Project Cognition Layer's other potential values (risk framing, evidence discipline, checkpoint state, multi-session consistency — all unmeasured here by design). The pre-registered anti-expectation ("longer inference adds no extra understanding; extra cost buys breadth not accuracy") is supported on this snapshot.
`
fs.writeFileSync(path.join(outDir, 'analysis-report.md'), analysis)

// limitations.md
const limitations = `# Limitations — Experiment A (commander.js)

Threats to validity, disclosed per protocol v1.1 and experiment-note.md. This experiment is **Preliminary, not statistically conclusive**.

1. **Single-repository limitation.** One library (commander.js) is a Researcher-favorable baseline by design (mature, high-constraint, pipeline-centric, API-compat heavy). Results cannot be extrapolated to other project types (business-decision-heavy, security-boundary-heavy, data-model-heavy). A repository matrix is required before any directional claim.
2. **Project-type bias.** GT composition follows the repository's intrinsic cognitive structure (arch/constraint heavy, design-purpose light); category imbalance is expected to shift per project type. The GUS weights are fixed pre-run; different project types may make different buckets informative.
3. **GT subjectivity.** The 25-entry Core GT was compiled by two independent evaluators and audited (counterfactual deletion, coverage map, freeze integrity), but entry selection and wording remain human judgments; another evaluator pair could produce a different GT. Mitigations: pre-registration, sha256 lock, source traces, no post-hoc edits.
4. **Model randomness.** n=3 per mode, single model (deepseek-v4-flash), reasoning max. GUS means differ by ≤0.09 between the top (Plan) and bottom (Deep) modes; with n=3 the order could flip under re-sampling. Reported min–max ranges show overlap between Standard/Plan/Quick.
5. **Single evaluator adjudication (D001).** Entry-level matched/partial/unmatched judgments were made by one operator with strict criteria (no forced matching; ambiguous → unmatched). Dual adjudication is required for the public phase.
6. **Run-order deviation note.** The frozen protocol v1.1 §1 mandates a seeded randomized run order (time-trend pollution control); the experiment ran in that frozen order (exp-a-runs-manifest.json), not in a Standard→Plan→Quick→Deep grouping. This is protocol-compliant and disclosed; the operator's later execution-order preference (grouped by mode) was not applied because it would have conflicted with the frozen manifest.
7. **Run-record structure.** Runs are stored under evaluation/runs/commander.js/exp-a/<mode>/<run_id>/ (run.json, session.events.json, stdout.log, report.txt, final-report.txt, claims.json, metrics.json, doctor-post.txt); the operator's suggested run-001-style layout was not adopted (would have required duplicating or renaming frozen outputs mid-experiment). All requested fields (mode, prompt, model, timestamps, output, claims, certificate, metrics) are present in equivalent files.
8. **GUS interpretation boundary.** GUS measures recovery of pre-registered cognition units, not general intelligence, not future-bug prediction (Flask Phase A: 0/60 scope statement), not modification success, not architecture-design quality.
9. **Cost metric scope.** Billed tokens = input+output+reasoning (cache reads excluded and reported separately); token accounting depends on the provider's usage events.
10. **Timeline/independence.** GT was created before any scored run; a non-scored PCR pilot predates GT compilation but was explicitly unreachable to the GT evaluators (snapshot-only prompts; entries are snapshot file:line anchored). See manifest evaluation_integrity block.
`
fs.writeFileSync(path.join(outDir, 'limitations.md'), limitations)

console.log('wrote results to ' + outDir)
for (const f of fs.readdirSync(outDir)) console.log(' - ' + f)
