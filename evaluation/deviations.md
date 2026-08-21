# Evaluation Deviations（偏差登记，冻结后 append-only）

本文件在 Phase A 首次 lock 之前创建，随 lock 一起被 sha256 冻结。任何新增条目必须在 lock 更新时一并记录；lock 冻结后修改本文件会使 `eval-lock --check` 失败。

## D001 — Single operator for ground truth, runs, scoring and adjudication

- **Deviation**: Ground-truth compilation, agent runs, automated scoring and human adjudication are performed by the same operator (no separate Evaluator A/B persons).
- **Reason**: Early internal validation phase (Internal Phase A), not a public benchmark submission. The pre-registered protocol (§4/§5b) assumes independent adjudicators; a single operator is accepted for Phase A under the conditions below.
- **Risk**: Evaluator bias — the operator who compiled `future.json` knows the answers the tested modes are judged against, which could unconsciously influence run orchestration, scoring, or claim matching.
- **Mitigation** (mandatory for Phase A validity):
  1. Ground truth is locked (sha256) into `snapshot.json` **before any run** and is immutable afterwards (verified by `blind-doctor.js` + `eval-lock --check`).
  2. The uniform prompt is frozen to a file and hashed before any run; no per-run prompt customization is allowed.
  3. All runs, traces, metrics, and claims are archived verbatim; no failed run is deleted.
  4. Adjudication procedure is mechanical (three questions Q1/Q2/Q3, see the Flask case log) and every candidate decision is recorded, including exclusions.
  5. Any deviation from this deviation (i.e., a second evaluator appearing) must be recorded here before use.
- **Status**: Accepted for Internal Phase A. **Public Benchmark** requires a second independent adjudicator (or community-submitted cases reviewed by a maintainer).

## D002 — Quick/Deep depth forcing via evaluation-only preset variants

- **Deviation**: The researcher persona lets the model choose Quick vs Deep depth at DISCOVER ("state it and allow the user to override"). To make Quick and Deep genuinely different experimental conditions, evaluation-only preset variants (`evaluation/presets/researcher-quick`, `evaluation/presets/researcher-deep`) append a frozen depth override to the persona text. These variants live in the evaluation directory and are hashed by the lock; the shipped `researcher` preset is untouched.
- **Reason**: Without forcing, "Quick vs Deep" would measure the model's whim, not the designed depth difference.
- **Risk**: The variant persona text is a copy that can drift from the shipped persona; the lock hash covers the current copy at freeze time, and any drift after freeze breaks the lock.
- **Mitigation**: Variants are generated mechanically from the shipped preset at freeze time (recorded in the case log); the lock covers them.
- **Status**: Accepted for Phase A.
