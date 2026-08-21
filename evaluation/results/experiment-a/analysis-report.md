# Experiment A Analysis Report — commander.js (v0.7.1, Project Cognition Layer validation)

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
