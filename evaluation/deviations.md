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

## D003 — Model switched to deepseek-v4-flash before the Phase A matrix (quota)

- **Deviation**: The frozen model was `deepseek-official/deepseek-v4-pro` (reasoning max). After 2 completed exploratory runs (standard-01, quick-03) and 1 failed run (deep-03, `QUOTA: Insufficient Balance` at the LLM API), the operator switched the eval model to `deepseek-official/deepseek-v4-flash` (reasoning max) — same reasoning configuration, same token budget.
- **Reason**: The pro-model API balance was exhausted mid-matrix; the operator decided the cheaper model for the whole experiment ("pro is too expensive; effect is similar").
- **Risk**: The model change is a confound if mixed with pro runs — per the protocol's same-model rule, **all scored runs must share one model**.
- **Mitigation**:
  1. The eval settings document, runtime manifest, and eval lock were updated and re-frozen BEFORE any flash run; `eval-lock --check` verifies the new model string.
  2. **All 12 matrix runs are re-executed under flash**; no pro run enters scoring.
  3. The three pro runs (standard-01, quick-03, deep-03-quota-failed) are preserved under `evaluation/runs/flask-pro/` as exploratory artifacts, including the quota failure — nothing is deleted.
- **Status**: Accepted for Phase A (operator decision, recorded pre-rerun).

## D004 — Researcher runtime bug fixes during harness validation (infra)

- **Deviation**: None in protocol inputs — recorded for transparency. Two shipped `research_doctor` regressions (v0.5.2: block-scoped `session` referenced outside its try block → `ReferenceError` on every call; replay check destructured reducer helpers from the plugin's top-level exports → `makeState is not a function`) were fixed before any scored run, and the doctor's Preset check accepts the D002 variant ids. Classification: protocol §6a infra-audit fixes (plugin crash), not design or scoring changes; unit tests stay green; the lock was re-frozen pre-run (preset hash changed). Details: `evaluation/cases/flask/notes.md` N-01.
- **Status**: Accepted for Phase A.
