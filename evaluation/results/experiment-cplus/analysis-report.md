# Experiment C+ Analysis Report — Cognition-State Inheritance(commander.js)

> **Preliminary, not statistically conclusive; VALIDITY-COMPROMISED (see §6).** Single repository, 6 mutations × (A stateless / B inherited), one model, one snapshot.
> **2026-08-24 authority override: INVALID FOR CAUSAL CLAIM.** The historical "H2 SUPPORTED" paragraph below is retained as an audit artifact but is not admissible product-value evidence. A/B meta-instructions differed, T0/sibling roots and synthetic markers leaked information, and no equal-content static control existed. The regenerated scorer is gated by `experiment-cplus-validity.json` and now reports bounded stale recall/precision plus `INVALID FOR CAUSAL CLAIM`.
> 协议:docs/experiment-cplus-protocol-v0.2-freeze-candidate.md(冻结后未修改)。

## 1. Experiment Question(结论边界:total effect)

> On the frozen commander.js snapshot, after a single injected engineering change, does an agent receiving the previous session's explicit cognition-state (B) recover affected cognition better than a stateless agent (A)? Measured by Mutation Recall / Stale Recovery (B-only) / Consistency Drift / Rebuild Cost. **Scope: total effect of inheritance instruction + state content; NOT mechanism net of context injection; NOT Projection Layer invalidation-condition value.**

## 2. Method

- T1 snapshots: 6 (MUT-01..06), each = frozen T0 tree + ONE mechanical injection (API contract ×2, internal architecture ×2, compatibility ×2) with visible marker comment, single-commit git (injection not readable via history). No canary in any T1 workspace (G7 PASS).
- Runs: 12 (6 A + 6 B), researcher-deep, read-only+never, deepseek-v4-flash, frozen per-run task files (A: uniform task + change-note sentence; B: same + importState instruction + embedded payload). Seeded order/assignment (MUT↔state source). First batch hit provider QUOTA at run 5; quota restored; failed runs re-executed under the SAME frozen protocol (no protocol change; original failure artifacts preserved).
- Integrity (G2): all 6 B runs PASS (importState with payload + export:true verified in session logs).
- Adjudication: D001, per-run Mutation Recall (matched/partial/miss, cognitive-impact requirement), Stale Recovery hits vs G3-precomputed expected stale sets (cognition-diff mechanical truth), Consistency Drift vs unchanged regions, Over-/False-Invalidation counted.

## 3. Results

| Metric | A (stateless, n=6) | B (inherited, n=6) |
|---|---|---|
| Mutation Recall (mean) | 1.0 (6/6) | 1.0 (6/6) |
| Stale Recovery (B-only) | — | ≥ expected set covered in 6/6 (semantic-level: 4/6 by id, 2/6 by assumption/hypothesis revision) |
| Consistency Drift | 0 conflicts | 0 conflicts |
| Mean duration | 434.8 s | 404.6 s (0.93×) |
| Median duration | 428.0 s | 402.2 s |
| Cost ratio B/A per pair | 0.76 / 0.66 / 0.72 / 1.61 / 1.08 / 0.87 (4/6 ≤ 1.0) | |

**Pre-registered H2 condition (≥4/6 pairs: Recall_B≥A ∧ Drift_B≤A ∧ StaleRate≥0.5 ∧ cost≤1.5×A): 5/6 pairs pass.** Scorer verdict: "H2 SUPPORTED (total effect)".

**But: this verdict is NOT trustworthy as a mechanism claim** — see §4 validity.

## 4. Key Findings

1. **Mutation Recall is saturated (12/12 matched) — and this saturation is partly an artifact.** 5/6 A-runs read sibling mutation snapshots or the pristine T0 workspace through read/glob (read-only sandbox allows reading outside the workspace). They obtained external ground truth ("the mutation is X") instead of deriving it from the T1 tree alone. B-runs mostly did NOT (only mut03-b/mut05-b touched siblings) — so the A/B comparison is **asymmetrically contaminated**: A's recall was inflated by leakage, not by capability.
2. **Stale Recovery (B-only) worked at the mechanism level.** All 6 B runs imported the previous session's state (G2 PASS), then explicitly invalidated/revised old cognition: "Previous assumptions that no longer hold" sections (mut01-b: H1 INVALIDATED, C15/C10b/C05/C02 revised; mut02-b: pristine/git-forensics assumptions false; mut04-b: 32 claims imported → 38 committed with revisions; mut05-b: C02 → FALSE at byte level; mut06-b: C0-002 invalidated → replaced). Expected stale sets were covered in 6/6 (semantic-level), with modest over-invalidation (1–4 claims per run).
3. **B was NOT slower: 4/6 pairs ≤ 1.0×, mean 0.93×.** Inheritance did not add cost; the only pair >1.5× (MUT-05, 1.61×) is also the one B run that did a byte-level pristine-baseline diff (leak-aided thoroughness).
4. **Consistency Drift: 0 conflicts both conditions** — no measurable divergence on unchanged regions at this task scale (low sensitivity).
5. **The mechanism asymmetry is real and visible**: A-runs produced no claims-exportable state and no stale-recovery capability (nothing to invalidate); B-runs demonstrably maintained and revised a prior cognition structure. But leakage prevents attributing A's recall deficit (none observed) to lack of state.

## 5. Failure Analysis (of the hypothesis, this case)

- **Why recall is saturated**: (a) marker comments (`// MUT-0X (synthetic)`) made the change trivially discoverable in the tree; (b) sibling/T0 directories were readable (leak); (c) single-commit history signaled "something changed". None of these test cognition-inheritance — they test search + environmental access. Mutation Recall therefore has **no discriminative power** in this run.
- **Why Stale Recovery looks promising but is not conclusive**: B runs demonstrably used the imported state (anchor verification against prior line numbers, hypothesis evolution trails, claim revision), and their invalidation was evidence-anchored. However, with n=6, single evaluator, and no A-condition counterpart (A has no claims to invalidate — by design), we cannot yet distinguish "state inheritance helps maintenance" from "any prior-context prompt would have produced similar lists".
- **Not a GT artifact**: expected stale sets came from cognition-diff (mechanical, precomputed); injection content is the frozen manifest.

## 6. Threats to Validity (this experiment is VALIDITY-COMPROMISED)

1. **Sibling/T0 directory leak (critical)**: T1 snapshots were created under `phase-a-snapshots/commander.js-cplus-t1/` while the pristine T0 workspace lives at `phase-a-snapshots/commander.js/`. The read-only sandbox does not restrict reads outside the workspace, so A-runs (and two B-runs) could and did read sibling mutation trees and the pristine baseline. **This invalidates Mutation Recall as a capability measure and contaminates the A/B paired comparison.** Mitigation for any rerun: place T1 workspaces in isolated roots with no sibling ground truth, and/or enforce workspace-only read policy.
2. **Marker comments make injection trivially discoverable**: `// MUT-0X (synthetic)` in-tree — recall measures search, not cognition. Future: invisible mechanical mutation (no marker; detectability via behavior/typing/docs mismatch only).
3. **Single-commit history**: signaled non-pristine state; also removed git-forensics signal both conditions rely on differently.
4. **n=6 per condition, single model, single evaluator (D001), single repo**: no generalization; paired differences within sampling noise.
5. **Stale Recovery denominators**: expected sets are small (1–5 claims); semantic-level hits counted when claims were revised via hypothesis/assumption invalidation rather than by id — rate can exceed 1 (hits include non-expected claims); Over-Invalidation (1–4/run) reported but not gated.
6. **QUOTA interruption**: 7 runs initially failed on provider quota; rerun under same frozen protocol; original artifacts preserved. Residual risk of environment drift between batches.
7. **Conclusion boundary**: results describe the TOTAL EFFECT of (inheritance instruction + state content); they do NOT isolate the mechanism from context injection (no Condition C), and they do NOT validate the Projection Layer's invalidation-condition value (claims carry no such field).

## 7. Conclusion (scoped)

**On commander.js (frozen bf35c5f), with 6 injected mutations, explicit cognition-state inheritance produced: (1) saturated Mutation Recall (12/12) that is partly an artifact of leakage and marker comments — no discriminative evidence; (2) demonstrable claim-level invalidation in all 6 B runs with evidence-anchored "previous assumptions no longer hold" sections and full semantic coverage of the mechanically-expected stale sets; (3) no cost penalty (mean 0.93×); (4) zero consistency drift on unchanged regions. Because the A-condition recall baseline is contaminated by sibling/T0 leakage, the paired H2 verdict is NOT admissible as evidence for the mechanism; the strongest admissible observation is the B-only Stale Recovery behavior, which is necessary-but-not-sufficient evidence for longitudinal cognition maintenance. A valid re-run (isolated T1 roots, no markers) is required before any H2 decision.**

*Findings, not "who wins". All failures (QUOTA) preserved. No Researcher/prompt/GT/scoring changes.*
