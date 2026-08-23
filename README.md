# dsh-researcher

## 1. Project Introduction — 项目介绍

> **EN** — **Evolving toward a Project Cognition Infrastructure for AI Software Engineering.**
> **中文** — **正在向 AI 软件工程项目认知基础设施方向发展(演化中,不是已完成的基础设施)。**

**EN** — dsh-researcher is an **AI project-cognition research tool** and a **Project Cognition Infrastructure prototype**. It builds an evidence-backed model of a software project — its purpose, architecture, constraints, risks, and change impact — **before any code is changed**, and persists that cognition across sessions.

**中文** — dsh-researcher 是 **AI 项目认知研究工具**与 **Project Cognition Infrastructure 原型**。它在动手修改之前,建立一份基于证据的软件项目认知模型(项目目的、架构、约束、风险与修改影响),并让这份认知跨会话持续存在。

**第一眼定位 / First-glance positioning**:

- ✅ **是 / It is**:项目认知研究工具 · Project Cognition Infrastructure 原型 · AI 编码时代的项目理解层
- ❌ **不是 / It is not**:AI chatbot · 普通 repository analyzer · 更强的 Research Agent(优越性未验证)· 已完成的基础设施

> **EN** — The problem is not that AI can't write code. It's that AI can modify code quickly while not knowing **why the project was designed this way**. Local correctness does not guarantee global correctness.
> **中文** — 问题不是 AI 不会写代码,而是 AI 可以快速修改代码,却不知道**这个项目为什么这样设计**。局部正确不保证全局正确(米格-25 效应)。

## 2. Why This Exists — 为什么需要它

**传统 Agent 的工作方式 / Traditional agents**:

```
read repository
    ↓
generate answer
    ↓
forget(会话结束,上下文丢弃 — context discarded at session end)
```

**dsh-researcher 的工作方式 / dsh-researcher**:

```
observe project
    ↓
build cognition state(claims/evidence/依赖图,版本化)
    ↓
maintain understanding(证据锚定,局部失效)
    ↓
continue future reasoning(export/import 跨会话迁移)
```

**EN** — AI coding tools have made implementation cheap, but software development has another bottleneck: **understanding the whole system**. A single change may be correct; a hundred correct changes may still create architectural drift, outdated assumptions, and loss of original intent. The structural problem is that agent cognition is **session-local**: each session re-derives what the previous one already learned. dsh-researcher separates the *production* of cognition (Research Mode) from the *carriage* of cognition (Infrastructure) — the research direction, not a completed product.

**中文** — AI 编码工具让实现变得廉价,但软件开发还有另一个瓶颈:**理解整个系统**。一次修改可能是正确的;一百次正确的修改仍可能累积出架构漂移、过期假设与最初意图的丢失。结构性问题是 agent 认知是**会话局部的**:每次会话重新推导上一次已学到的东西。dsh-researcher 将认知的**生产**(Research Mode)与认知的**承载**(Infrastructure)分离 —— 这是研究方向,不是已完成产品。

## 3. Architecture Overview — 架构总览

```
dsh-researcher — Project Cognition System(演化中 / evolving)
    |
    +-------------------------------------------+
    |                                           |
Infrastructure Layer                      Application Layer
Project Cognition Infrastructure          Research Mode
  - cognition-state                       - repository research
  - claims graph                          - architecture analysis
  - evidence anchors                      - risk analysis
  - dependency tracking                   - decision support
  - revision tracking                     - handoff
  - export / import migration
  - evaluation governance
```

**EN — Application consumes Infrastructure; the two layers must not be conflated.** Research Mode (the application layer) *produces* cognition through the eleven-stage pipeline and `research_checkpoint`; the Infrastructure layer *carries* it: a versioned, dependency-carrying state machine with evidence anchors, revision history, cross-session export/import migration, and evaluation governance. The application layer's superiority over ordinary agents is **not yet validated**; the infrastructure layer's engineering capability **is validated** (see §4).

**中文 — Application 消费 Infrastructure;两层不可混淆。** Research Mode(应用层)通过十一阶段管道与 `research_checkpoint` **生产**认知;Infrastructure 层(底层)**承载**认知:版本化、带依赖的状态机,含证据锚、修订历史、跨会话 export/import 迁移与评测治理。应用层相对普通 agent 的优越性**尚未验证**;基础设施层的工程能力**已验证**(见 §4)。

**Research Mode 输出 / Output**:Project Cognition Report(7 节用户层 + AI 内部层附录:Evidence Ledger / Claims / Confidence / Certificate / Checkpoint State)+ Decision Memo(BUILD / DON'T BUILD / INVESTIGATE)+ `research_handoff.json`。

## 4. Validation Status — 验证状态表

> 依据:Experiment A(commander.js,12 runs)+ Experiment C+(cognition-state inheritance,12 runs)。完整结论:[docs/evaluation-cplus-conclusion.md](./docs/evaluation-cplus-conclusion.md)。

### ✅ Validated(已验证 —— 基础设施层)

| # | 能力 | 证据 |
|---|---|---|
| V1 | **cognition-state schema** | 版本化状态机(claims/依赖图/局部失效/会话日志重放);137 claims 实证写入 |
| V2 | **state export / import** | 跨会话迁移管线;G1 保真(32/32 零失真);6/6 注入运行 G2 PASS |
| V3 | **cross-session cognition migration** | 证据锚定旧认知失效可复现(6/6 B-runs);成本 0.93× 无惩罚 |
| V4 | **evaluation integrity framework** | G1–G7 gate;完整性检测真实抓住 QUOTA 失败;eval-lock;失败保留 |

### ❌ Invalidated / Not Admissible(已证伪或不可采信)

| # | 主张 | 状态 | 原因 |
|---|---|---|---|
| U1 | Researcher 超过普通 Agent | ❌ 不可采信 | C+ A/B 配对被 T1 snapshot isolation leakage 污染(见 §5);Exp A 方向亦不支持 |
| U2 | Mutation Recall 优越性 | ❌ 不可采信 | 12/12 饱和 = marker 可搜索 + 泄漏的产物 |
| U3 | Projection Layer 有效性 | ❌ 未验证 | claims 无 invalidation_condition 字段,实验未触及 |

### ❓ Unknown(未知 —— 需后续实验)

| # | 问题 | 需要 |
|---|---|---|
| K1 | 维护生产力(maintenance productivity) | 隔离重跑 + 长期维护评估 |
| K2 | 长期开发者价值(long-term developer value) | 多阶段维护实验 |

## 5. Experiment C+ Honest Result — 诚实结论(含漏洞披露)

**Experiment C+ — Cognition-State Inheritance(2026-08,commander.js,6 mutations × (A stateless / B inherited)):**

- **Validated**:状态注入管线可运行(6/6 B-runs G2 PASS:importState + export:true 验证);跨会话认知迁移技术上可行(B-runs 展示证据锚定的旧认知失效,成本 0.93×);评测系统能检测完整性问题(抓住 QUOTA 失败)。
- **Invalidated**:**snapshot isolation leakage** —— T1 快照建于 `commander.js-cplus-t1/`,与原始 T0 同级;只读沙箱允许读 workspace 之外,5/6 A-runs(和 2 个 B-runs)读取了 sibling mutation 目录或原始 T0,获得外部 ground truth。**因此 Mutation Recall 的 A/B 比较不成立,Researcher 优越性结论不成立。** 本问题不隐藏。
- 失败记录(QUOTA 中断 7 runs)与泄漏记录全部保留 —— 失败是可信度资产。

完整结论与剩余验证路径(R1 隔离重跑 / R2 机制隔离 / R3 长期维护):[docs/evaluation-cplus-conclusion.md](./docs/evaluation-cplus-conclusion.md)。实验产物:[evaluation/results/experiment-cplus/](./evaluation/results/experiment-cplus/)。

## 6. Roadmap — 路线图

> 详见 [docs/roadmap.md](./docs/roadmap.md)。每阶段由前一步结果裁决;失败保留为反例资产。

| 阶段 | 内容 | 状态 |
|---|---|---|
| **Phase 1 — Infrastructure prototype** | state model(cognition-state schema)✅ · migration(export/import)✅ · evaluation governance(G1–G7)✅ | **已完成(原型级,非产品级)** |
| **Phase 2 — Real value validation** | maintenance experiments(多阶段注入)· fresh analysis vs cognition recovery(隔离重跑 R1 + 机制隔离 R2 + 长期维护 R3) | **进行中(未完成)** |
| **Phase 3 — Future extensions** | semantic dependency(语义依赖)· invalidation condition(失效条件)· automatic migration(自动迁移) | **未开始(取决于 Phase 2)** |

---

## Trust — 为什么相信它：Research Runtime Health Gate

**EN** — Many agents claim to be safe. **Researcher proves its operating conditions.**
**中文** — 很多 Agent 声称自己安全。**Researcher 证明自己的运行条件。**

```
Researcher Runtime Certificate
Run: #1
History: none (first run)
Preset:        PASS   (composedPreset=researcher)
Sandbox:       PASS   (mode=read-only)
Approval:      PASS   (policy=never)
Write tools:   PASS   (write/edit = refusing stubs)
Shell surface: PASS   (git_read only; no pwsh/bash)
Checkpoint:    PASS
Replay:        PASS   (log folds deterministically)
Overall: SAFE
```

**EN** — The certificate is an **enforced first step**: every other tool is refused by the health gate until it is produced; in a bad environment the certificate still renders UNSAFE as the explanation. Every run is numbered with history (`Run #N` + `History: #1 SAFE · #2 DEGRADED`), every report starts with the certificate block — Researcher itself is an auditable system (see [docs/runtime-certificates/](./docs/runtime-certificates/)).
**中文** — 证书是**执行级强制首步**：在它产出之前，其他一切工具被健康门禁拒绝；环境不达标时证书照常渲染 UNSAFE 作为解释。每次运行可编号、带历史（`Run #N` + `History: #1 SAFE · #2 DEGRADED`），每一份报告以证书块开头——Researcher 自己也是可审计系统（见 [docs/runtime-certificates/](./docs/runtime-certificates/)）。

## Proof — 证明：Benchmark Suite

**EN** — Three public, reproducible synthetic cases with ground truth and a scorer — **the moat: anyone can write a research prompt; we publish an evaluation standard.**
**中文** — 三个公开、可复现的合成案例（带 ground truth 与打分器）——**这是第一道护城河：别人可以写 Research Prompt，我们提供公开评测标准。**

| 案例 Case | 埋入的事实 Planted facts | 期望判定 Expected verdicts |
|---|---|---|
| **architecture-drift** | EN: v1 layered architecture → ten "locally reasonable" perf edits → Controller hits DB directly, cache leaks in, README describes the old architecture. 中文：v1 分层架构 → 十次"局部合理"的性能修改 → Controller 直连 DB、缓存入侵、README 描述旧架构 | 架构主张 **Contradicted**；修改 = **腐蚀而非演化 corrosion, not evolution**；BUILD 修复边界 / DON'T BUILD 继续补丁 |
| **documentation-drift** | EN: README claims "42 tests passing, CI green"; actually 3 test files, no CI, never executed. 中文：README 声称"42 tests passing, CI green"，实际 3 个测试文件、无 CI、从未执行 | 测试主张 **Contradicted**；文档漂移发现 doc-drift；真实状态 **INVESTIGATE** |
| **false-progress** | EN: v1.1/v1.2 added 10 peripheral features; the core problem (cold-start quality) has had no evaluation since v1.0. 中文：v1.1/v1.2 加了 10 个外围功能，核心问题（冷启动质量）自 v1.0 起无评测 | 功能速度上升 ≠ 问题被解决 feature velocity ≠ problem resolution；额外功能 **DON'T BUILD**，核心问题 **INVESTIGATE** |

```
node fixtures/benchmark/benchmark-runner.js generate <dir>
node fixtures/benchmark/benchmark-runner.js score <case-dir> <report.md>
```

（marker 打分是下限，证据引用与证书由人工复核。/ Marker matching is a floor; citations and the certificate are human-reviewed.）

### Historical Blind Benchmark — Phase A（范围声明，不是广告）

**EN** — The first real-world blind evaluation (pallets/flask @ 2025-11-17, 4 modes × 3 runs, deepseek-v4-flash, full protocol in [docs/evaluation-protocol-v1.md](./docs/evaluation-protocol-v1.md)) is published as-is in [evaluation/cases/flask/evaluation-result.md](./evaluation/cases/flask/evaluation-result.md). The honest summary:
**中文** — 第一次真实仓库盲测（pallets/flask @ 2025-11-17，4 模式 × 3 次，deepseek-v4-flash，完整协议见 [docs/evaluation-protocol-v1.md](./docs/evaluation-protocol-v1.md)）原样公开在 [evaluation/cases/flask/evaluation-result.md](./evaluation/cases/flask/evaluation-result.md)。诚实的结论：

| 指标 Metric | 结果 Result | 解读 Reading |
|---|---|---|
| Future Issue Recall（机会性指标） | **0/60** | Researcher 不是 Bug 预测器；未来 issue 召回不在能力面。**这是范围声明，不是缺陷。** |
| Precision（重要发现证据支持率，mean） | Standard 80% / Plan 76% / Quick 85% / Deep 81% | 四种模式的发现均高度证据锚定 |
| 认知重建 | 12/12 运行正确重建项目主导现实（3.2 上下文合并 + shim + 文档漂移） | 项目理解是真实能力 |
| Risk Discovery | 全模式收敛发现 shim/文档/语义破坏类风险；Deep 额外发现 CVE-2026-27205、devcontainer 损坏、MethodView 405 等已验证缺陷 | **发现"未来容易错的地方"（Risk）≠ 预测具体 Bug** |

**EN** — What the experiment proved: structured project understanding (claims ledger, evidence tiers, architecture mapping, risk analysis, handoff, certificate) — what ordinary agents do not natively produce. What it did not prove: prediction of specific future bugs. The benchmark suite is being extended with Understanding / Risk / Change Impact / Drift benchmarks (see [docs/evaluation.md](./docs/evaluation.md)).
**中文** — 实验证明的：结构化项目理解（claims ledger、证据分级、架构映射、风险分析、交接包、证书）——普通 Agent 不天然具备的能力。实验没有证明的：预测具体未来 Bug。评测套件正在扩展 Understanding / Risk / Change Impact / Drift 四个基准（见 [docs/evaluation.md](./docs/evaluation.md)）。

## How it works — 工作原理（三层 / three layers）

**Layer 1 — Understand 理解**：Repository → Code / Docs / History / Tests / Issues / External context → **Project Model**（项目身份 / 架构地图 / 核心组件 / 设计决策）
**Layer 2 — Judge 判断**：Claim → Evidence → Confidence → Contradiction → **Risk Map**（证据分级 evidence tiers C0–C4 + 裁决态 verdicts Known/Likely/Claimed/Unknown/Contradicted；风险 = "这里未来容易错"，不是"这里错了"）
**Layer 3 — Guide 引导**：Risk Map → **Decision Memo（BUILD / DON'T BUILD / INVESTIGATE）** → Plan Mode

十一阶段管道 Pipeline：`DISCOVER → RECONSTRUCT → EVIDENCE MAP → DIAGNOSE → TRADEOFF ANALYSIS → EXTERNAL RESEARCH → COMPARE → CHALLENGE → SHAPE → CLASSIFY → SELF-EVAL → HANDOFF`。**The pipeline is linear in execution but stateful in reasoning. 执行是线性的，推理是有状态的。**

## Non-goals — 明确不做什么

Researcher is **NOT**：
- ❌ 一个 Coding Agent（它从不修改代码）/ a coding agent (it never modifies code)
- ❌ 自动重构工具（它只诊断，不执行）/ an automatic refactoring tool (it diagnoses, it does not execute)
- ❌ **Bug 预测器（未来 issue 召回 0/60 是范围声明）**/ a bug predictor (0/60 future-issue recall is the scope statement)
- ❌ **AI 架构师（它提供架构师式的理解流程，不承诺最优架构决策）**/ an AI architect (it offers architect-style understanding, not architecture decisions)
- ❌ 通用网页调研器（它面向代码仓库，不是 Deep Research）/ a general web researcher (it targets code repositories, not web deep research)
- ❌ 架构分析工具的替代品（GitNexus / Serena / RepoMap 等 L0/L1 能力应被整合，见 [docs/landscape.md](./docs/landscape.md)）/ a replacement for architecture tools (integrate L0/L1 instead)

它负责 It does：✅ Understanding 理解 ✅ Evidence 证据 ✅ Risk Discovery 风险发现 ✅ Decision 决策依据。

## Install — 快速安装

```bash
npx -y github:TLNing260310/dsh-researcher
```

**EN** — One line (no clone, no npm publish) installs into `${DSH_HOME}/.agent-presets/researcher`; `--force` overwrites. Alternatives: `git clone` + `install.ps1/sh`, or Download ZIP and copy manually.
**中文** — 一行安装（无需 clone、无需 npm 发布），装进 `${DSH_HOME}/.agent-presets/researcher`；`--force` 覆盖更新。备选：`git clone` + `install.ps1/sh`，或 Download ZIP 手动复制。

**EN Usage** — New session → preset「项目研究 Project Research」→ permission read-only + approval never → the first tool call is automatically `research_doctor` (Runtime Certificate) → research after SAFE; the final report starts with the certificate block and ends with the handoff package.
**中文 使用** — 新建会话 → 预设选「项目研究 Project Research」→ 权限 read-only + 审批 never → 第一次工具调用自动是 `research_doctor`（Runtime Certificate）→ SAFE 后开始研究，最终报告以证书块开头、以交接包结尾。

## Docs — 深入文档

| 入口 Entry | 内容 Contents |
|---|---|
| [docs/architecture.md](./docs/architecture.md) | 真实架构：Application Layer(Research Mode)消费 Infrastructure Layer(Project Cognition Infrastructure)/ real architecture (two layers, application consumes infrastructure) |
| [docs/validation-status.md](./docs/validation-status.md) | 验证状态：Validated / Unknown / Invalidated 三段（含 C+ leakage 披露）/ validation status (three-way split, honest) |
| [docs/project-cognition-position.md](./docs/project-cognition-position.md) | 当前架构定位：evolving toward a Project Cognition Infrastructure（双层架构、验证边界、竞争位置）/ current positioning（two-layer architecture, verified boundary, competitive position） |
| [docs/evaluation-cplus-conclusion.md](./docs/evaluation-cplus-conclusion.md) | Experiment C+ 诚实结论（Validated / Invalidated / Unknown / Remaining,含 leakage 披露）/ honest C+ conclusion |
| [docs/repositioning-v0.7.md](./docs/repositioning-v0.7.md) | v0.7 定位重构备忘录 / repositioning memo（认知层定位、PCR 结构、评测调整、分阶段计划） |
| [docs/landscape.md](./docs/landscape.md) | 竞品格局与 L0–L5 分层 / competitive landscape & L0–L5 layering（Cairn / Drift / GitNexus / Serena / Understand Anything） |
| [docs/roadmap.md](./docs/roadmap.md) | 路线图 / roadmap（Phase 1 基础设施原型 → Phase 2 价值验证 → Phase 3 未来扩展） |
| [docs/ai-engineering-skills-map.md](./docs/ai-engineering-skills-map.md) | 与 AI Engineering Skills Map 的能力映射与方法论保留 / capability mapping & methodological caveats |
| [docs/handoff-schema.md](./docs/handoff-schema.md) | `research_handoff.json` 机器可读交接接口 / machine-readable handoff interface（schema v1） |
| [docs/postmortems/](./docs/postmortems/) | 事后分析 / postmortems："配置正确 ≠ 运行正确"（recompose 洞） |
| [docs/runtime-certificates/](./docs/runtime-certificates/) | 证书审计日志用法 / certificate audit log |
| [fixtures/benchmark/](./fixtures/benchmark/) | 公开评测基准 / public benchmark（三案例 + 打分器 / three cases + scorer） |
| `researcher/` | 预设本体 / the preset itself：组合 composition、persona、三个内嵌插件 plugins、两个方法技能 skills |

社区索引约定 Community index convention：以 GitHub topic **`dsh-plugin`** 打标；内置市场提案见 / marketplace proposal: [deepseek-harness#2994](https://github.com/deepseek-ai/deepseek-harness/discussions/2994)。

## Compatibility — 兼容性

**EN** — Verified on DeepSeek Harness **0.1.0-rc.6**; on other versions the guard fails closed (refuses to start rather than degrading silently).
**中文** — 已验证 DeepSeek Harness **0.1.0-rc.6**；其他版本守卫 fail-closed（拒绝启动而非静默退化）。

## License

[MIT](./LICENSE) © 2026 TLNing260310
