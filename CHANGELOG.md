# Changelog

## Unreleased (v0.6.0 — Verified Project Intelligence, in progress)

发布纪律变更：从 v0.5.3 起，小改动只进 main 不贴 tag；功能攒成有意义的版本再正式发布（频繁小版本会向外部传递"设计边界未稳定"的信号）。v0.6.0 的目标：从"研究预设"到"具备验证、评估与持续认知能力的项目智能层"。

- **Benchmark Suite**：`fixtures/benchmark/` — 三个公开可复现案例（architecture-drift / documentation-drift / false-progress），每个含 `ground-truth.json`（marker 级期望判定）与 `expected-result.md`；`benchmark-runner.js` 支持 `generate` 与 `score`（报告 marker 打分），新增 `metrics`（token/时长/工具调用/claims/证书抽取，供 A/B 对比）。这是第一道护城河：别人可以写 Research Prompt，我们提供公开评测标准。
- **Blindness Integrity（P0.5a）**：`blind-snapshot.js` v2 生成物理 T0 快照——截断全部未来 ref、expire reflog、gc --prune=now、验证无晚于 T0 的可达提交（冒烟证实未来提交物理消失）；`ground-truth/`（未来事实 + 金丝雀）置于运行环境之外；`blind-doctor.js` 六项失明完整性校验（历史截断/refs/隔离/ground-truth sha256 锁/金丝雀），任何 FAIL = 运行 INVALID。
- **evaluation-protocol-v1 冻结**：仓库入选标准、机械 T0 选择（禁 cherry-pick）、ground truth 分类（T0 已潜伏才算 ✅，新需求不算 ❌）、Run Matrix（3 repos × Standard/Plan/Quick/Deep × 3 = 36 次）、四指标评分（Recall / Precision / Researcher Lift / Cost-adjusted）、v0.6.0 release gate。**预设成绩（21/47、35/47）已删除，结果跑出前一律 pending。**
- **env-drift fail-closed（P0）**：执行时守卫改为**每次调用重验环境**——会话中途 /permission 切换立即回退拒绝，不再信任缓存的 verified 状态；新增回归测试。
- **Evaluation Framework**：`docs/evaluation.md` — 三条证据线（自己跑/历史盲测/真人测试）与三级反馈通道（默认关闭 + 匿名指标 + 脱敏主张包，全部本地优先、绝不自动上传、尊重 DO_NOT_TRACK）。
- **Feedback Export**：`bin/feedback.js export <session.jsonl.zstd> [--claims]` — 本地生成脱敏 feedback bundle（schema v1），无网络、无上传。
- **Quick / Deep 两档深度**：Quick = 5 moves（小仓库/单一问题），Deep = 11 moves；按规模/历史/歧义度/影响半径自动建议，用户可否决。
- **Handoff 接口**：`docs/handoff-schema.md` — `research_handoff.json`（schema v1：build_items 带 id/problem/evidence/confidence/scope/do_not_touch）；报告模板与 persona 强制双形态交接（JSON + Markdown）。
- **证书审计入口**：`docs/runtime-certificates/` — 长期项目的多运行审计用法（Run # / Evidence 占比 / 新不确定性）。
- **README 最终稳定版**：按陌生用户认知路径 + When to use / Non-goals / Benchmark Proof 重构，中英双语并置，目标半年不动。

## 0.5.3 (2026-08-20)

One-line install.

- `package.json` + cross-platform `bin/install.js`: `npx -y github:TLNing260310/dsh-researcher` installs the preset straight from the GitHub repository (no clone, no npm publish required). Idempotent (refuses existing target) with `--force` for updates; DSH version preflight included. install.ps1/sh and ZIP remain as manual alternatives.

## 0.5.2 (2026-08-20)

Runtime proof completes the trustworthy-runtime loop.

- **Doctor runs are numbered and remembered**: `research_doctor` now emits `Run: #N` (counted from prior doctor calls in the session log) and `History: #1 SAFE · #2 DEGRADED …` (reconstructed from tool/call + tool/result events) — every run has identity and every certificate is durable in the session log.
- **The doctor always runs, even in a bad environment**: the health gate now lets `research_doctor` execute under a failed environment so it can render the UNSAFE certificate as the explanation, while every other tool stays permanently denied (fail-closed). Guard semantics updated + tests.
- **Runtime Proof in every report**: report template §0 mandates quoting the certificate (Run + History); the persona requires it in the final message. "Research Run #17 / Certificate: SAFE" is now part of every deliverable.
- Tests: 25 total, all green.

## 0.5.1 (2026-08-20)

Mandatory health gate, failure-case tests, synthetic fixtures, postmortem.

- **Health gate enforced**: the execution-time guard now refuses every tool until `research_doctor` has been called once per agent (write/edit are denied always). The certificate is no longer a suggestion — research literally cannot start without it. The doctor call also completes the per-agent environment verification.
- **Failure-case tests**: guard state machine extracted as a pure function (`decideGuard`) with 4 new tests (gate before doctor, write/edit after doctor, bad environment denies even the doctor).
- **Synthetic Case Generator**: `fixtures/payment-drift/generate.js` produces a shareable payment-service scenario (v1 layered architecture → ten locally-reasonable perf edits → Controller→DB drift + stale README + false test-count claim) with `ground-truth.json` for benchmark scoring — real projects stay private.
- **Postmortem archived**: docs/postmortems/2026-08-20-recompose-guard-hole.md ("配置正确 ≠ 运行正确" — declared state researcher vs actual state minimal + danger-full-access).
- Positioning: "Evidence-driven Project Intelligence Layer" (avoid Deep Research conflation), layer diagram (Coding / Plan / Researcher / Repository).
- Tests: 23 total, all green.

## 0.5.0 (2026-08-20)

Self-verification becomes a capability: the Researcher Runtime Certificate.

- New `research_doctor` tool (plugins/research-doctor): renders a certificate with per-check PASS/WARN/FAIL and an overall SAFE/DEGRADED/UNSAFE verdict. Checks: preset binding (live scope chain), effective sandbox=read-only, approval=never, write/edit resolve to the refusing stubs (mechanically catches the recompose hole), git_read as the only code surface (no pwsh/bash), research_checkpoint availability, and deterministic session-log fold (same log → same state, double-fold equality).
- Persona: run research_doctor at session start and after any environment change; on DEGRADED/UNSAFE, print the certificate and stop until fixed.
- Positioning upgrade: "Evidence-driven Project Intelligence Agent — 基于证据的 AI 项目认知与健康审计 Agent"; new pitch: 防止 AI 在长期开发中逐渐失去项目全局认知. Case Library opened (docs/case-studies/).
- First real-run forensics (the airecimmunity session) drove this release: the methodology and evidence engine worked end-to-end (15 claims with tiers/verdicts, hypothesis dependency graph, Contradicted finding), and the preset-switch (recompose) path was confirmed to bypass creation-time guards — fixed in v0.4.4 and now self-detectable via the certificate.
- Tests: 20 total, all green.

## 0.4.4 (2026-08-20)

Execution-time guard — fixes the recompose hole found in the first real run.

- **The hole**: a session created on another preset and switched to researcher before the first message (preset recompose) joins the standing composition AFTER `agent/created` fired — so the per-agent stubs, prompt shadows, and environment preflight never installed. Forensics on the first real research session confirmed it: real `write` schema (no stub), `danger-full-access` sandbox, guard absent — zero-write was held by persona alone.
- **The fix**: a standing-scope `tools.guard` (layer-based, not event-based) now applies to EVERY agent under this preset regardless of how it joined: `write`/`edit` execution is always denied with the read-only reason, and every other tool is denied until the agent's environment has been verified once (sandbox=read-only, approval=never) — fail-closed at first use. The creation-time preflight remains for stubs/shadowing on the normal path.
- Tests: 17 total, all green (3 new guard-logic tests: env verdict matrix, refusal text, stub shape).

## 0.4.3 (2026-08-19)

Zero-write contract hardening (P0) and real hypothesis versioning.

- **git_read option-injection class closed**: model-controlled `ref` values can no longer smuggle git options (`--output=…` wrote files; `-c`/`-w` re-opened config/object-database vectors) — every revision is validated (no leading `-`, no control characters, length cap); every path is validated, resolved against the repo root, and confined inside it (no `../../outside` reads); all paths go after `--` including `hash-object` (`-w` can no longer become an option). New tests cover `--output=x`, `-c`, `-w`, `../../outside`, control characters.
- **Hypothesis history is real**: hypotheses now keep a version history array (previous statement/status/dependencies per revision, capped at 20), including auto-flips to `invalidated`; the persona's "versioned, not overwritten" claim is now true in the state layer, not just in the prompt. export/import round-trips history.
- Tests: 14 total, all green (5 git_read argument-boundary tests + 2 history tests + 7 reducer tests).
- Roadmap: Golden Research Fixtures (incl. dsh-researcher researching dsh-researcher as Fixture 0 — dogfooding the project's own thesis), Delta Research (corrosion-vs-evolution over commit ranges), StructuralEvidence integration seam.

## 0.4.2 (2026-08-19)

Positioning sharpening (no new mechanisms).

- Core problem reframed: "AI coding 可以在每一步都做对的同时，把整个项目做错" — three failure modes formalized: Local Optimum (米格-25), Context Fidelity, Temporal Drift; the mode's job is maintaining the project-level global optimum.
- Persona/methodology: the **corrosion-vs-evolution question** — every deviation from a convention is interrogated (why did the convention exist, do its reasons still hold) before it counts as a finding; DIAGNOSE now checks candidates for "locally optimal, globally worse".
- Layer positioning: L0/L1 (structural intelligence, architecture memory) are commodity to be INTEGRATED (GitNexus / Serena / Aider RepoMap / Cairn / Drift / Understand Anything); L2 (evidence engine) + L3 (build shaping) are this project's core. New docs/landscape.md with the competitive table and integration strategy.
- Roadmap renumbered: v0.4.3 test/compatibility harness; v0.5 integration seams before any self-built knowledge graph.

## 0.4.1 (2026-08-18)

Correctness hardening — design had outpaced implementation reliability.

- **P0-A — replay bug fixed**: DSH `tool/call` events carry `arguments: string` (the model's raw JSON); the replay loop checked `typeof === 'object'` and silently folded nothing. Now `parseCheckpointArgs` accepts both forms and malformed events fail loudly.
- **P0-B — single reducer**: `applyCheckpoint` (parse + importState + mutation) is the ONE entry point for live execution AND session replay — runtime semantics ≡ replay semantics (real event sourcing).
- **P0-C — export bug fixed**: view export mapped a nonexistent `v.name` (views are keyed by name, not fielded); now uses `Map.entries()`; export→import round-trips (covered by tests).
- **P0-D — material-change invalidation**: hypotheses now dirty their dependents on ANY material change (statement / status / dependencies), not only on → invalidated.
- **P0-E — per-knob environment preflight**: unset → tighten, explicit-safe → keep, explicit-unsafe → refuse, independently for sandbox and approval. No more "explicitly wrong sandbox + missing approval → silently fixed".
- **P1 — pwsh removed; git_read added**: fixed-allowlist read-only git tool (status/log/show/diff/ls-files/blame/rev-parse/hash-object), spawned via execFile with `--no-pager --no-ext-diff --no-textconv`, system/global gitconfig ignored, 30s timeout, output capped. The researcher holds NO arbitrary process-execution primitive at all — the upstream loopback-control-plane class of concerns is answered structurally, not by prompt.
- **Tests + CI**: `tests/research-state.test.js` (7 tests, incl. the replay ≡ live invariant) + `.github/workflows/test.yml` (node --test, Node 22). All green.
- Roadmap: v0.4.2 test/compatibility harness + Golden Research Fixtures; v0.5 cache unified as a Research Dependency Engine.

## 0.4.0 (2026-08-18)

Environment self-containment and state recovery.

- **P0 — environment preflight**: the guard now verifies the session's EFFECTIVE sandbox mode (`sandboxPolicy.resolve`/`overrideOf`) and approval policy (`approval.overrideOf`) on `agent/created`. Explicit wrong configuration (e.g. workspace-write + ask) refuses agent startup with a loud error instead of running the researcher in a writable environment; un-pinned programmatic/child sessions are tightened to read-only + never, never relaxed. The zero-write contract is no longer user-dependent.
- **P1 — research state v2**: `research_checkpoint` claims now carry `confidence`; new `export`/`importState` compact transfer; **session-log auto-replay** — on `agent/created` the plugin rebuilds each agent's state graph by folding its logged `research_checkpoint` tool/call events, so resumed sessions, process restarts, and compaction losses all recover the same reasoning graph. Completion doctrine: a move is complete only when its results are committed to the state (text summaries are not completion).
- **P2/P3 designs adopted as roadmap**: research cache layer keyed by git blob hashes ($DSH_HOME/researcher-cache sidecar, v0.5) and an evaluation benchmark system (architecture-understanding accuracy, BUILD/DON'T BUILD/INVESTIGATE precision, modification-avoidance rate, v0.6) — see docs/roadmap.md.
- README/persona: the four-layer guarantee is now described as self-enforcing (verified and refused, not assumed).

## 0.3.0 (2026-08-18)

Pipeline robustness and zero-write contract hardening.

- **P0 — fail-closed read-only guard**: `tool-restrict` defaults to STRICT mode — stub registration, prompt-shadow installation, and an agent-view preflight (`agent.ctx.tools.get(name, agent)` must resolve to the refusing stubs) all must succeed, or the synchronous `agent/created` listener throws and the session refuses to start. `config.mode: 'compat'` restores degrade-with-warning behavior.
- **P1 — research state plugin** (`plugins/research-state`): `research_checkpoint` tool keeps the claim ledger + hypothesis/view dependency graph per agent in memory, with revision bumping and recursive dependent invalidation (no rollback; hypotheses are versioned, not deleted). Writes only to the DSH session log via the tool call itself — zero filesystem writes. todo_write downgraded to a checkpoint index.
- **P2 — token layer L0→L2**: cartography-only L0, subagent evidence packets at L1 (never raw repo dumps), evidence promotion at L2; compaction tuned (thresholdRatio 0.68, retainRatio 0.12, maxTokens 4096, retries 1/1) and pruner tightened (6144/3072/768).
- Install scripts: dsh version preflight (verified 0.1.0-rc.6; warn otherwise, explain fail-closed behavior).
- Persona/methodology: "RESEARCH STATE — evidence-driven partial invalidation" section; pipeline moves read the current ledger and revisit only dirty views.
- P3 (project intelligence capsule + memory bridge + freshness gates) remains on the roadmap, not shipped.

## 0.2.0 (2026-08-17)

Build-Shaping upgrade, inspired by the AI Engineering Skills Map framework (treated as an industry framework, not a strict law).

- Positioning: epistemic upstream of Plan Mode — "What should we build, if anything?"; four-role loop (Researcher → Plan → Agent → Verifier → back to Researcher).
- Pipeline upgraded to eleven moves: DISCOVER → RECONSTRUCT (project model: Mission/User/Problem/Value mechanism/Architecture/State/Evidence/Constraints) → EVIDENCE MAP (tiers + verdicts Known/Likely/Claimed/Unknown/Contradicted) → DIAGNOSE (Problem-Before-Solution chain; problem→feature jumps forbidden) → TRADEOFF ANALYSIS (12-dimension scanner; no "more engineering = better") → EXTERNAL RESEARCH → COMPARE → CHALLENGE (disconfirmation search + revised hypothesis) → SHAPE → CLASSIFY (BUILD / DON'T BUILD / INVESTIGATE; "unknown" is a legitimate output) → SELF-EVAL (10-item research self-check) → HANDOFF (only BUILD items to Plan).
- Report template v2: project model reconstruction, verdict-carrying claim cards, problem chain + tradeoff tables, classification summary, self-check disclosure.
- Read-only boundary unchanged and strengthened in rationale (goal-drift argument).

## 0.1.0 (2026-08-14)

Initial public release.

- Read-only researcher preset: persona (investigator, eight-move method), read-only toolset, evidence ladder C0–C4.
- `plugins/tool-restrict`: per-agent always-refusing `write`/`edit` stubs + same-name shadowing of the `tool:write` / `tool:edit` / `ui:deliverable-file-references` prompt sections.
