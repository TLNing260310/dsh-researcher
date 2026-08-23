# Roadmap

> 当前定位(2026-08):**evolving toward a Project Cognition Infrastructure**。路线按三阶段组织:Phase 1(基础设施原型,已完成)→ Phase 2(真实价值验证,进行中)→ Phase 3(未来扩展,未开始)。每阶段由前一步结果裁决;失败保留为反例资产。

## Phase 1 — Infrastructure Prototype(已完成,原型级)

**目标**:验证认知基础设施的工程能力(非产品化,非优越性)。

- ✅ **state model**:cognition-state schema(schemaVersion:1;claims/hypotheses/views/dirty;单 reducer 事件溯源;会话日志重放)—— 137 claims 实证写入。
- ✅ **migration**:export(fullExport → cognition-state-export.js)/ import(cognition-state-to-import.js → importState)—— G1 保真(32/32 零失真);6/6 C+ B-runs G2 PASS。
- ✅ **evaluation**:G1–G7 gate、eval-lock(20 项 sha256)、blind-doctor 金丝雀、research-doctor 8 项检查、完整性检测(抓住 QUOTA 失败)、失败保留。
- ✅ **实验**:Experiment A(commander.js GUS,12 runs)+ Experiment C+(状态继承,12 runs)+ 全部协议/GT/评分/锁冻结。
- ⚠️ **未完成(原型边界)**:产品化(v0.9 capsule / Memory Bridge / 自动迁移)未做;应用层价值未验证。

## Phase 2 — Real Value Validation(进行中,未完成)

**目标**:验证基础设施是否带来真实价值 —— 隔离重跑与长期维护实验。

- **R1 — Isolated rerun(隔离重跑)**:修复 C+ 的 T1 snapshot isolation leakage(根目录隔离 + 无 marker 注入;同冻结协议)→ 获得可采信的 Mutation Recall 与 A/B 配对比较。
- **R2 — Mechanism isolation(机制隔离)**:Condition C(context injection 对照)→ 区分"信息增量"(A vs C)与"机制净效应"(C vs B);需 protocol bump 或独立实验。
- **R3 — Long-term maintenance evaluation(长期维护评估)**:多阶段连续变更(T0→T1→T2→T3),维护臂 vs 重建臂 → Maintenance Recall / Consistency Drift / Rebuild Cost Ratio。
- **判定纪律**:Phase 2 结果裁决 Phase 3 是否开始;H2 无增益 → 按失败标准降级(保留只读分析模式价值);失败记录全部保留。

## Phase 3 — Future Extensions(未开始,取决于 Phase 2)

**目标**:基础设施扩展(仅当 Phase 2 显示价值后)。

- **semantic dependency(语义依赖)**:claim 级 relation(当前依赖图只在 hypotheses/views 层)。
- **invalidation condition(失效条件)**:条目级"被推翻条件"字段(Projection Layer 核心主张,当前 claims 无此字段)。
- **automatic migration(自动迁移)**:host-plane capsule 持久化与自动状态桥(v0.9 Memory Bridge 方向)。
- **产品化决策**:仅当 Phase 2/R3 显示真实维护价值后,才评估 v0.9 路线。

---

## 历史(版本记录,保留)

## 已发布

- **v0.1.0** — 只读研究预设：证据分级 C0–C4、八步流程、永拒桩 + 指引段遮蔽。
- **v0.2.0** — Build-Shaping 升级：项目模型、裁决态、Tradeoff Scanner、Problem-Before-Solution、BUILD/DON'T BUILD/INVESTIGATE、反证检索、研究自查（受 AI Engineering Skills Map 启发）。
- **v0.3.0** — 工程硬化：fail-closed 守卫、Research State（局部失效 + 会话日志持久化）、L0→L2 令牌层、compaction 调优、版本预检。
- **v0.4.0** — 环境自包含：启动预检验证 sandbox=read-only 与 approval=never，显式错误配置拒绝启动、未钉住会话收紧；状态自动重放（会话日志重建推理图）+ export/import。
- **v0.4.1** — Correctness hardening：replay 死代码、单 reducer、view export、material-change 失效、per-knob 预检；移除 pwsh、git_read 上线；测试 + CI。
- **v0.4.2** — 定位锐化：三失效模式、腐蚀 vs 演化之问、L0/L1 整合 L2+L3 核心（docs/landscape.md）。
- **v0.4.3** — 零写契约硬化：git_read 参数注入封死、hypothesis 真版本化；14 测试。
- **v0.4.4** — 执行时守卫（recompose 洞修复）；17 测试。
- **v0.5.0** — Self-verification：`research_doctor` Runtime Certificate；定位 Evidence-driven Project Intelligence；案例库开启。
- **v0.5.1** — 健康门禁强制化（doctor 执行级强制首步）+ 失败案例测试 + 合成案例生成器（payment-drift fixture）+ recompose 洞事后分析归档；23 测试。

## v0.6 — Evaluation-first（进行中）

**版本目标不再是"Researcher 更聪明"，而是"我们终于知道 Researcher 到底有没有更聪明"。** Measure → Learn → Simplify → Amplify。

- **P0 — Evaluation Framework**：`benchmark-runner.js metrics`（token/时长/工具调用/claims/最终建议/证书抽取）+ A/B harness（Researcher vs Plan vs Standard，统一 metrics.json 对比）；设计见 [docs/evaluation.md](./evaluation.md)。
- **P0.5 — Historical Blind Benchmark**：`fixtures/blind/blind-snapshot.js`（T0 快照创建 + 历史截断 + 金丝雀）+ `blind-doctor.js`（失明完整性校验）+ [evaluation-protocol-v1](./evaluation-protocol-v1.md)（先冻结协议与 ground truth，再运行，再揭晓——不预填任何期望成绩）。
- **P1 — Feedback Export + Opt-in Metrics**：`bin/feedback.js export`（Level 1 匿名指标 / Level 2 脱敏主张包，本地生成、绝不自动上传、尊重 DO_NOT_TRACK）。
- **P1 — Quick / Deep 两档深度**：Quick（5 moves）与 Deep（11 moves），按仓库规模/历史跨度/歧义度/影响半径自动建议。
- **P2 — Claim Delta**：仅在 benchmark 证明 claim system 本身有增益之后再做（否则是在错误方向加复杂度）。
- **P3 — 外部事实层**：GitNexus / Serena / RepoMap / Cairn 集成缝（L0/L1 商品化）。
- **P4 — Cross-Harness portability**：方法论与报告规范的平台无关化（DSH 仍是 developer preview，runtime surface 不宜过快扩张）。

## v0.7.0 — Product Alignment（定位一致化，不做功能开发）

版本目标：让 README、agent persona、report schema、evaluation 体系与 **Project Cognition Layer** 定位完全一致。**不增加能力、不修改核心运行逻辑、保留 Flask 实验（含 0/60 范围声明）。**

- 定位：Project Cognition Layer（官方）→ Architecture Intelligence Assistant（用户层）→ "架构师级别的项目理解"（营销层）。
- 输出：Project Cognition Report（7 节用户层 + AI 内部层附录）。
- 评测：Researcher Benchmark Suite（Understanding / Risk / Change Impact / Drift；Issue Recall 降为次级）。
- 文档：README / preset.yml / persona 定位段 / report template / docs/evaluation.md（见 docs/repositioning-v0.7.md）。
- 治理：persona/模板变更后 Flask lock 的 `--check` 按预期失败（历史冻结），新实验需 protocol v1.1 bump + 重锁。

## v0.7.1 — Cognition Benchmark（验证认知层是否真实存在，不做功能开发）

版本目标：**证明 Project Cognition Layer 不是包装，而是真能力。** Flask 实验的问题不是模型，而是指标错位（Issue Recall 测错了对象）；v1.1 换四组可测认知属性：GUS（陌生项目理解）/ Impact（修改影响判断）/ Risk（架构风险发现，非未来 bug）/ Drift（跨时间认知一致性）。协议见 docs/evaluation-protocol-v1.1.md。

- 三个实验：A 陌生项目理解（commander.js / cheerio，专家打分，GUS）；B 修改影响范围（给定变更请求，Impact Recall/Precision/Critical Edge）；C 认知漂移（T0 vs T0+n 双快照，Drift Recall + Stale-Claim Invalidation）。
- 顺序：commander.js 先跑通全链，再复制 cheerio。
- 原"Risk Map 深化"移入 v0.9（Risk Map 已存在，缺的是价值证明；深化与 Risk Memory 合并）。

## v0.7 — DSH 生态化

- Plugin showcase 持续维护（讨论帖 #2651）
- 安装流程打磨（install 脚本 + ZIP + 市场提案 #2994 跟进）
- 与 Plan Mode 的 handoff 演示（交接包 + 新会话接线）
- 公开评测报告（v0.6 产物 + v0.7 基准套件）

## v0.8 — 集成缝与缓存（顺序不变）

- `StructuralEvidence` 标准输入：`{ source, subject, relation, target?, evidence[], confidence?, fingerprint? }`——GitNexus / Cairn / Serena / Understand Anything 的输出统一转成 Structural Evidence 进入 L2，成为 C1 级证据；节点模型统一为 `{id, kind, revision, dependencies, sourceFingerprint, dirty}`。
- sidecar 缓存：`$DSH_HOME/researcher-cache/<repo-fingerprint>/`，键 = `sha256(repo + module + git_blob_hashes + schema + question)`，失效与推理失效共用同一引擎。

## v0.9 — Project Intelligence Capsule + Memory Bridge

- 结构化 capsule（findings + constraints + invariants + unknowns + commit + freshness 依赖），**不灌完整报告**；持久化归独立 host-plane Memory Bridge；**Researcher 永不拥有 memory_write**；Coding Agent 侧 `agent/pre-step` 注入 + freshness gate。

## 上游贡献候选

- permission preset 绑定 agent preset（v0.4.0 preflight 是社区侧 workaround）。
- `read-only` + `never` 命名权限预设。
- 社区预设市场（Discussions #2994）。
- `research_doctor` 长期可作为通用 "DSH Agent Runtime Health Check" 提案。
