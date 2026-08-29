# Changelog

## 0.8.0-alpha.10-dev.0 (unreleased) — E1 Negative Evidence and v1.12 Offline Correction

- Preserved the official Flash v1.5 result as `1 PASS / 4 FAIL / 1 INVALID`; no v1.5 artifact is rescored or promoted to PASS.
- Added a non-disclosing workspace-root hash binding so the offline scorer can validate DSH absolute edit paths without publishing personal absolute paths.
- Corrected the `resume-replay:observe` outer verifier policy to expect the post-correction final verifier exit.
- Strengthened the frozen `already-satisfied` and `no-progress` prompts to require explicit, non-overlapping Governor sequences.
- Promoted canonical Project Cognition revision 9 and preregistered protocol v1.6. E1, outcome value, and portability remain NOT PROVEN.
- Preserved the incomplete v1.6 official Flash run: `already-satisfied` reached its expected host terminal, while `simple-done` exposed stale mutation-tool responses and correctly ended `NEEDS_HUMAN`; remaining tracks were not run and the bundle remains INVALID.
- Added DSH-call-ID-bound read-your-write projection for Governor mutation tools, with idempotence and fail-closed missing-ID tests. v1.7 proved that mutation responses still reused the last explicit decision snapshot; v1.8 derived current state but exposed candidate `DONE`, causing Flash to stop before formal host completion. v1.9 returns progress/diagnostics only and explicitly routes closed attempts through `request_goal_decision`.
- Fixed Gate 0 provenance discovery for ESM-only dependencies in a flat npm `node_modules` root; the runtime inventory still binds the canonical package root, manifest identity, content tree, and complete dependency closure.
- Preserved the v1.9 official Flash bundle as `3 PASS / 1 FAIL / 2 INVALID`. v1.10 derives resume stage-one verifier expectations from the frozen manifest and recognizes DSH native `goal.blockedReason.code` without weakening the exact `stopped` requirement.
- Preserved the v1.10 official Flash result as `4 PASS / 0 FAIL / 2 INVALID`: all completed tracks passed, while a provider `TRANSPORT` retry without auditable usage correctly invalidated resume observe. v1.11 changes no runtime or threshold and preregisters exactly one complete replacement bundle before E1 stops.
- Preserved the v1.11 replacement as INVALID and stopped further paid E1 runs. Its two-process resume reached host `DONE`, but the frozen scorer replayed stage one without the runtime-goal scope used by the runner. v1.12 applies that scope offline and adds a pre-goal-traffic regression test; diagnostic rescoring cannot overwrite v1.11 or establish 6/6.
- Added version-locked, non-product adapter discovery for Claude Code Agent SDK `0.3.251` and Codex App Server stdio `0.150.0-alpha.12.2`. Codex completed a redacted no-model initialize/list trace; Claude locks official package/types without fabricating a runtime trace. Both remain `HOLD`, and the offline checker forbids compatibility or conformance claims.
- Added a credential-stripped, no-session Claude runtime-load capture: the exact SDK module imports, required session/query exports exist, and the bundled native CLI reports Claude Code `2.1.251`. No query, prompt, session or model path is invoked, so the record remains `HOLD` rather than compatibility evidence.
- Added a credential-stripped Codex App Server contract capture that regenerates the complete experimental schema bundle under a fresh `CODEX_HOME`, binds its tree and method-inventory hashes, and verifies the governance subset without creating a thread, turn, prompt, session or model call. Codex remains `HOLD` because real raw replay and enforcement receipts are still absent.
- Corrected the v1.12 manifest from stale `live_e1=NOT_RUN` to `STOPPED` and added a protocol-authority gate that rejects every live invocation before argument/path handling, output mutation, DSH startup, or cost admission. A future run now requires a reviewed protocol/candidate change rather than only `--ack-live-cost`.
- Added an explicit-use-gated Codex App Server native-turn capture spike with ephemeral threads, read-only/network-disabled execution, hashed identifiers, automatic refusal of unexpected server requests, and cleanup-safe output. Three authorized attempts retained no valid event trace: one stopped before model use and two reached post-completion paths before a Windows cleanup race discarded the artifact. At most two Codex turns may have been billed; the incident is preserved as INVALID. A zero-model in-memory App Server now proves the repaired refusal, redaction, lifecycle, process-close and cleanup code paths, but both discoveries remain HOLD and canonical truth forbids promoting synthetic coverage to compatibility evidence.
- Added a credential-stripped Claude SDK session-read capture. The exact locked SDK executed `listSessions`, `getSessionInfo`, and `getSessionMessages` against a fresh `CLAUDE_CONFIG_DIR` and empty project, returning only expected empty/absent results with zero prompt, session creation, model, or capture-initiated network calls. This proves local API callability only; Claude remains HOLD because no non-empty session, tool, approval, resume, replay, usage, or write-enforcement trace exists.
- Added a second zero-model Claude local-parser capture using a deterministic host-authored JSONL transcript. The locked SDK listed the synthetic session, extracted bounded metadata, reconstructed its user/assistant parent chain, and left the transcript hash unchanged. The fixture is explicitly not an authentic Claude Code session or native event stream, promotes no governed capability, and leaves Claude on HOLD.
- Made all three Claude discovery capture paths fail closed on exact SDK content, not just package/version labels. One shared lock binds `package.json`, `sdk.mjs`, and `sdk.d.ts`; same-version tampering is rejected before import or child-process execution, and the offline discovery checker validates stored traces and the native contract against that same lock.
- Bound all three Codex discovery capture entries to an explicit `win32-x64` executable path, version output, size, and SHA-256 before process start. Stored evidence omits the personal path, same-version byte tampering fails closed, unsupported capture hosts remain explicitly unverified, and the no-model native capture now waits for process close before cleaning its isolated `CODEX_HOME` on Windows.
- Added a machine-checked Claude/Codex HostEvent convergence record. The checker recomputes both version-locked mapping hashes and confirms only a shared seven-kind candidate projection; `guard_violation`, authenticated human receipts, usage completeness, restart checkpoints, raw-first durability, and terminal write enforcement remain explicit gaps, so the artifact is discovery-only and cannot become compatibility or conformance evidence.

## 0.8.0-alpha.9 (2026-08-27) — Truth Alignment and E1 v1.5 Readiness

- Added an English-first README with a Chinese counterpart, a problem-led first screen, deterministic mechanism visuals, and a lower-friction ten-minute trial form.
- Made the npm identity boundary explicit. The unscoped registry name belongs to another project; this repository now uses private scoped package metadata while preserving pinned GitHub and verified release installation.
- Added a self-audit calibration case that demonstrates evidence-graded reporting without counting itself as an external user case, Live E1, or outcome evidence.
- Added exact DSH `0.1.1-rc.2` live-run isolation, credential separation, evidence references, resume repair, official Flash v1.4 partial-result preservation, and v1.5 layered budget preregistration.
- Promoted canonical Project Cognition revision 8, added file-backed evidence freshness checks, and separated published and development version identities.
- Exposed the experimental `adapterCore` package-root surface while preserving `dshAdapter`, function-call, and mode-switch semantics; no second client adapter is delivered.
- Added local-only `researcher-feedback export/validate`, its JSON Schema, and a frozen opt-in Pilot 0 protocol. No telemetry or automatic upload was added.

Release boundary: **E1 infrastructure v1.5: READY / Live E1 v1.5: NOT RUN / v1.4 historical result: 2 PASS, 1 FAIL, 3 NOT RUN / outcome value and multi-client portability: NOT PROVEN**.

## 0.8.0-alpha.8 (2026-08-25) — Windows Canonical-Path Hotfix

- Supersedes alpha.7 after its post-release CI matrix exposed one Windows-only test expectation: GitHub-hosted runners supplied an 8.3 short temp path while Quickstart intentionally persisted the native canonical long path.
- The assertion now compares against `fs.realpathSync.native`, matching the production identity function. Quickstart's device/inode/path binding and runtime behavior are unchanged.
- The release remains evidence-conservative: no new model run, remote API call or Live E1 execution was performed. All alpha.7 capability and outcome boundaries still apply.

Release boundary: **Windows CI portability fix / no runtime feature expansion / Goal Governor live E1: NOT RUN / outcome value and multi-client portability: NOT PROVEN**.

## 0.8.0-alpha.7 (2026-08-25) — Safe Trial and Guided Governance

- Replaced the three drifting installer implementations with one cross-platform lifecycle manager. `--dry-run` does not write installer-owned paths; strict compatibility accepts exact DSH `0.1.0-rc.7` from CLI output or constrained package metadata and refuses missing/unknown versions by default. Automatic CLI detection may still start external `dsh --version`.
- Added content-hashed backup, safe force-upgrade, uninstall and rollback. Every mutating lifecycle action snapshots both managed preset states; corrupt, incomplete, contradictory or aliased backup trees fail closed, and failed replacement attempts restore the pre-operation snapshot when possible.
- Added a release-artifact installation guide covering `SHA256SUMS`, `package-manifest.json`, local tarball execution, backup retention and recovery. GitHub-generated source archives are explicitly not treated as verified npm artifacts.
- Added `project-cognition quickstart` and `quickstart sync`. They generate an external owner-review workspace and bind Cognition, Verifier Registry and Git revision without copying hashes, but never approve a goal, install a verifier or seal/install canonical Project Cognition.
- Added `npm run demo`, an isolated real-process walkthrough in which assistant confidence and a verifier child process exiting `1` both yield `CONTINUE`; after a bounded fixture repair, a second process exits `0` and matching captured evidence yields `DONE`. The DSH event envelope is explicitly simulated; this is not Live E1.
- Rewrote the README around user problems, a clear Project Research versus experimental Goal Governor split, safe trial instructions, truthful evidence boundaries and a five-minute review-first path.
- Audited Live E1 publication readiness. The current environment lacks final-candidate capture/run-lock inputs, a pinned readable rc.7 module root, dedicated cost controls and a real interactive TTY for the human gate, so no E1 model run or public bundle was fabricated.
- Ran two real DSH Web Project Research probes through local Ollama only. Qwen3 14B reached SAFE but failed task/tool adherence; local DeepSeek R1 14B emitted unsupported conclusions and was rejected by the terminal gate. The failure is retained publicly and outcome value remains unproven.

Release boundary: **safe install lifecycle: PASS / guided scaffold: PASS / real-process offline Governor demo: PASS / local Researcher output probe: FAIL / Goal Governor live E1: NOT RUN / outcome value and multi-client portability: NOT PROVEN**.

## 0.8.0-alpha.6 (2026-08-24) — Truthful DSH Web Onboarding

- Post-release alpha.5 acceptance installed the exact GitHub release tarball into a fresh DSH_HOME and launched it through PowerShell `dsh web`. The published runtime obtained a full SAFE certificate and rejected post-certificate Workspace Write drift before another model response; the workspace stayed clean.
- That acceptance found one remaining content defect: all three installers still told users to manually choose `read-only + approval never`, a combination current DSH Web does not expose. Node, PowerShell and bash installers now say to choose `Read Only`, then Project Research; the preset tightens approval to never and the UI displays `Custom`.
- A repository consistency test freezes the same guidance across all installer entry points and rejects the stale wording.
- Runtime code is unchanged from alpha.5. No additional model call is needed to validate this text-only delta; the alpha.6 release tarball must still pass isolated install-output, package smoke, full repository checks and cross-platform CI.

Release boundary: **Published Researcher DSH Web smoke: PASS / installer truth alignment: PASS / Goal Governor live E1: NOT RUN / outcome value and multi-client portability: NOT PROVEN**.

## 0.8.0-alpha.5 (2026-08-24) — DSH Web Recompose and Terminal Safety

- A real DSH Web smoke exposed that selecting Project Research after creating a standard agent bypassed `agent/created` attachment. Research-state replay now hydrates at preset selection with an idempotent `agent/pre-step` fallback; the read-only guard attaches to the exact live Web agent.
- DSH Web `Read Only` currently resolves to sandbox=`read-only`, approval=`ask`. Researcher now performs the safe one-way reduction to approval=`never`; writable sandboxes still fail closed.
- A new terminal doctor gate rejects prose-only completion without an actual completed `research_doctor` result, injects one bounded correction, then fails explicitly instead of looping or trusting assistant text.
- Permission is rechecked at every pre-step and terminal stop. A stale SAFE certificate can no longer authorize prose completion after the UI changes to `Workspace Write`; the live adversarial rerun failed before an additional model response.
- Local model evidence is deliberately mixed: `qwen3:14b` obtained a full SAFE certificate, but failed the requested project review by inventing a `project_root` Rust layout; `deepseek-r1:14b` emitted unsupported prose and never called doctor. Runtime conformance improved; useful outcome value remains **NOT PROVEN**.
- Verification used only local Ollama. No DeepSeek remote API, paid model, live Goal Governor E1, second adapter, or historical Phase A runner was used.

Release boundary: **Researcher DSH Web smoke: PASS / Goal Governor live E1: NOT RUN / outcome value and multi-client portability: NOT PROVEN**.

## 0.8.0-alpha.4 (2026-08-24) — Fail-Closed Model Cost Admission

- E1 protocol is now frozen as v1.1. Protocol v1 is preserved by exact alpha.3 commit/blob identity and SHA-256, and is explicitly superseded with `0` live runs; no old outcome is rewritten.
- The official E1 manifest/run lock freezes `base_url` and rejects unknown or drifted routes. Remote execution is exactly `deepseek-official/deepseek-v4-flash` at `https://api.deepseek.com`. During Beijing weekday windows `[09:00,12:00)` and `[14:00,18:00)`, DeepSeek API is denied; the only admissible route uses the DSH `deepseek-official` DeepSeek-compatible adapter with a literal, explicit-port loopback `base_url` and no trailing slash.
- Before each child launch, the outer runner writes a frozen DSH settings file with `watch=false` and injects the locked `DEEPSEEK_BASE_URL`. The child uses DSH's public DeepSeek resolver to re-check the resolved base URL before create/resume and before and after every model followup. Cost admission is also re-evaluated before output, before DSH spawn and in every resumed process, reserving `max_time_sec + 60` seconds; the absolute deadline caps child runtime and is bound to offline evidence.
- Weekends waive only the time blackout: run lock, fixed budget, explicit cost acknowledgement, official Flash and its exact remote base URL remain mandatory. A loopback base URL proves only the adapter's first hop is local, not that the local service does not proxy remotely. Repository enforcement applies only to the official runner; host clock/scheduler integrity, egress, provider billing identity, human identity and out-of-band calls require separate operational controls.
- Historical Phase A protocols, locks, bundles and `evaluation/runtime/eval-headless.mjs` are audit-only and must not be used for new model runs.
- Release boundary remains **E1 infrastructure: READY / Live E1 and DSH re-scan: NOT RUN / outcome value and multi-client portability: NOT PROVEN**. This release performs no DSH or model/API call; the local route remains pending DSH-dependent Gate 0 validation.

## 0.8.0-alpha.3 (2026-08-24) — Auditable Promotion and Stop Discipline

- Canonical cognition now fails closed without `state_hash`; the CLI adds `draft → diff → seal --out → install` and refuses draft installation, stale base hashes, rollback/skipped revisions, and sealed artifact overwrite. Install uses best-effort rollback for in-process write failures. `doctor` detects an active/stale governance lock and a missing or mismatched canonical state/projection pair; it does not enumerate all temporary/backup residue, recover a crash, or claim cross-file power-loss atomicity.
- Goal Core binds baseline/observation repo-revision labels, independently recomputes every recorded terminal decision from its evidence prefix, and returns a stable progress object plus Markdown stop card with MUST/gate/budget/next-action state.
- Goal approval rejects unknown/superseded invariants and orphaned or non-linear local revisions; these checks provide structural lineage, not authenticated owner identity or worktree-byte proof.
- E1 scorer fixes the contradiction where valid FAIL evidence could be labeled `PASS_UNDER_TRUSTED_HOST`; PASS, FAIL, INVALID, and synthetic causal statuses are now verdict-aware and report concrete failed cases.
- E1 bundles gain deterministic raw-byte commitments and optional external Ed25519 signing/verification. Signatures bind bytes to a supplied external trust root but never prove DSH execution, signer honesty, human identity, live causal validity, outcome value, or portability.
- The E1 scorer accepts exactly one self-contained bundle directory, rejects split manifest/artifact roots, and rejects symlink, junction, and hard-link aliases across bundle, trust-root, attestation, and output boundaries.
- Release builds disable replace-object aliases, compare working bytes to HEAD blob IDs without invoking clean filters (permitting only an equivalent CRLF checkout form of an LF blob), and pack an isolated snapshot reconstructed from verified HEAD blobs; ignored workspace files cannot alter the tarball. Builds emit `SHA256SUMS` and `package-manifest.json`; CI avoids duplicate tag runs and tests Node `22.12.0` plus current LTS on Windows and Linux.
- Release boundary remains **E1 infrastructure: READY / Live E1 and DSH re-scan: NOT RUN / outcome value and multi-client portability: NOT PROVEN**.

## 0.8.0-alpha.2 (2026-08-24) — Truth and Evidence Governance

- 明确 `.project-cognition/state.json` 是唯一 canonical project truth；`PROJECT_COGNITION.md` 仅由 CLI 生成，历史 `research-state` 重命名为 provisional Research Session Ledger。
- 新增 owner promotion 流程：ledger/handoff → draft revision → authority/proof/evidence review → seal/install → doctor；doctor 与 evidence freshness 明确分离。
- 将长期价值拆为 V3A（Project Cognition longitudinal value）与 V3B（Goal Governor 在等内容 Research-only 对照上的增量价值），避免一个实验替两个机制归因。
- 固定证明顺序 `Gate 0 → E1 → non-inferential pilot → E2 → second-adapter conformance → E3`；E1 轨迹、estimand 与阈值只由冻结协议定义。
- 保留 Experiment C+ 的历史 causal-invalid 结论：新实验可建立新 claim，但不能洗白或改写历史 validity。
- 统一 Node.js `>=22.12.0`、verifier result policy 和当前路线/验证文档；移除易漂移的测试总数与过强 doctor 表述。
- 新增独立的 `evaluation/goal-governor-e1/`：冻结 manifest/fixture hashes/run lock、零网络零模型 preflight、外部 live runner、原始 evidence bundle 与 `PASS | FAIL | INVALID` 离线 scorer；旧 Phase A runtime 保持不变。
- Scorer 强制 canonical manifest、每轨 live/offline replay、唯一且有序的 call/result 配对，以及 resume stage-one seal 绑定；合规结论明确为 `PASS_UNDER_TRUSTED_HOST`，不把无外部 attestation 的自洽 bundle 误称为无条件 live 因果证明。
- 发布边界固定为 **E1 infrastructure: READY / Live E1: NOT RUN / outcome value and multi-client portability: NOT PROVEN**；缺费用确认、固定 DSH `0.1.0-rc.7`、run lock 或外部交互式 TTY gate 时 live runner fail closed；TTY 只证明输入通道，不冒充密码学真人身份。

## 0.8.0-alpha.1 (2026-08-24) — Project Cognition + Goal Governor

- 新增 portable Cognition / Goal / Verifier Core、严格 JSON schemas、canonical hashing、revision 与确定性 Markdown projection。
- 新增 DSH Governed Coding preset 与 `/researcher` one-shot / persistent guarded mode；移除模型可自我完成的通用 `dsh-tool-goal`。
- Goal Contract 冻结 verifier registry hash；证据必须绑定更早的真实 DSH tool call/result、工具名、参数 hash 与结果策略；host 独占 DONE/STOP/BLOCK/PAUSE 权限。
- Simple 最多 2 次、Governed 最多 5 次修改尝试；连续 2 次无 MUST 进展自动 STOPPED；SHOULD 不维持循环。
- Research handoff 升级到 v2，交接 cognition hash、项目目的、已证明/未证明价值、不变量、约束、未知、desired outcomes 与 non-goals。
- 修复 completion telemetry 文本误判、DON'T BUILD 双计数、research-state import 原子性/严格验证、doctor live-vs-replay 证明、read-root 隔离与 C+ 因果有效性误报。
- 发布仓库补齐双平台 Node 22 CI、Security Policy、贡献指南、反馈模板与诚实竞品/证据说明。

## Development history — v0.7 product alignment

从"研究预设"到"AI 编码时代的项目认知层"的定位一致化：**不增加能力、不修改核心运行逻辑、保留 Flask 实验（含 0/60 范围声明）**。

- **定位重构（v0.7.0）**：官方定位 = Project Cognition Layer（AI 软件工程项目认知层）；用户层 = Architecture Intelligence Assistant（架构智能分析助手，提供架构师式理解流程，不替代架构师）；营销层 = "为 AI Coding Agent 提供架构师级别的项目理解能力"。README 首屏改为"AI 可以快速修改代码，但不知道这个项目为什么这样设计"痛点绑定；Non-goals 明确"不是 Bug 预测器（0/60 是范围声明）"、"不是 AI 架构师"。
- **Project Cognition Report（PCR）双层输出**：报告模板从 14 节研究报告重构为用户层 7 节（Project Identity / Architecture Map / Critical Components / Design Decisions / Risk Map / Change Impact Analysis / Decision Memo）+ AI 内部层附录（Evidence Ledger / Checkpoint State / 外部事实 / 自查）——驾驶舱隐喻：乘客看高度速度，飞行员看完整仪表。每节声明"必须来自代码证据 vs 允许模型推理（须标注）"。
- **Risk Discovery 取代 Bug Discovery 叙事**：风险 = "这里未来容易错"，不是"这里错了"；persona 与 README 同步。
- **Researcher Benchmark Suite（评测体系）**：Understanding（GUS）/ Risk（ARD）/ Change Impact（DQ）/ Drift（CDD）四个主基准；Future Issue Recall 降级为次级（机会性）指标；Flask 实验不删除。
- **治理**：persona/模板/README 变更发生于 Flask Phase A 完成之后——`evaluation/locks/flask.protocol-v1.lock` 是历史冻结，变更后 `--check` 按预期失败；新实验需 protocol v1.1 bump + 重锁。核心运行逻辑（tool-restrict / research-doctor / research-state / git-read）零改动。

## Development history — v0.6 verified project intelligence

发布纪律变更：从 v0.5.3 起，小改动只进 main 不贴 tag；功能攒成有意义的版本再正式发布（频繁小版本会向外部传递"设计边界未稳定"的信号）。v0.6.0 的目标：从"研究预设"到"具备验证、评估与持续认知能力的项目智能层"。

- **Benchmark Suite**：`fixtures/benchmark/` — 三个公开可复现案例（architecture-drift / documentation-drift / false-progress），每个含 `ground-truth.json`（marker 级期望判定）与 `expected-result.md`；`benchmark-runner.js` 支持 `generate` 与 `score`（报告 marker 打分），新增 `metrics`（token/时长/工具调用/claims/证书抽取，供 A/B 对比）。这是第一道护城河：别人可以写 Research Prompt，我们提供公开评测标准。
- **Blindness Integrity（P0.5a）**：`blind-snapshot.js` v2 生成物理 T0 快照——截断全部未来 ref、expire reflog、gc --prune=now、验证无晚于 T0 的可达提交（冒烟证实未来提交物理消失）；`ground-truth/`（未来事实 + 金丝雀）置于运行环境之外；`blind-doctor.js` 六项失明完整性校验（历史截断/refs/隔离/ground-truth sha256 锁/金丝雀），任何 FAIL = 运行 INVALID。
- **evaluation-protocol-v1 冻结**：仓库入选标准、机械 T0 选择（禁 cherry-pick）、ground truth 分类（T0 已潜伏才算 ✅，新需求不算 ❌）、Run Matrix（3 repos × Standard/Plan/Quick/Deep × 3 = 36 次）、四指标评分（Recall / Precision / Researcher Lift / Cost-adjusted）、v0.6.0 release gate。**预设成绩（21/47、35/47）已删除，结果跑出前一律 pending。**
- **env-drift fail-closed（P0）**：执行时守卫改为**每次调用重验环境**——会话中途 /permission 切换立即回退拒绝，不再信任缓存的 verified 状态；新增回归测试。
- **Evaluation Framework**：`docs/evaluation.md` — 三条证据线（自己跑/历史盲测/真人测试）与三级反馈通道（默认关闭 + 匿名指标 + 脱敏主张包，全部本地优先、绝不自动上传、尊重 DO_NOT_TRACK）。
- **Feedback Export**：`bin/feedback.js export <session.jsonl.zstd> [--claims]` — 本地生成脱敏 feedback bundle（schema v1），无网络、无上传。
- **Sample Selection Protocol（⑤a）**：`evaluation/candidate_pool.json`（19 个候选 + 元数据，frozen_at 记录）、`selection_rules.json`、`random_seed.txt`（`dsh-researcher-v0.6-phase-a`）与 `fixtures/blind/sample-selector.js`（mulberry32 种子 PRNG + 语言分层抽样）全部**运行前 commit**。Phase A 机械选出：`pallets/flask`、`tj/commander.js`、`cheeriojs/cheerio`。`github/gh-aw` 只入 stress pool。
- **Dual Adjudication（⑤b）**：`evaluation/adjudication-schema.json` + `fixtures/blind/adjudicate.js`（双人裁决合并：一致收录/排除、分歧 ambiguous 不进主 Recall、agreement_rate）。
- **Evaluation Freeze**：`evaluation/scoring-schema.json`（Recall / Precision / Researcher Lift / **False Alarm Burden** / Cost-adjusted）+ `fixtures/blind/eval-lock.js`（冻结协议/裁决/评分/选择/ground truth/snapshot/prompt/preset/模型/预算的 sha256；`--check` 任何变化即 LOCK BROKEN → protocol bump + 全量重跑）。
- **⑥a/⑥b 基础设施审计规则**：Repo 1 先跑 12 次（Standard/Plan/Quick/Deep ×3），只许修 parser/metrics/session/runner 基建 bug，禁止改 scoring/prompt/ground truth/T0/mode；基建修复 → protocol bump → Repo 1 全量重跑。
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
