# Competitive Landscape

本文件记录与 dsh-researcher 相邻的项目、各自最强之处、与我们的区别，以及整合策略。核心结论：**"AI 编程中的全局—局部失配"正在成为真实赛道，但每个项目只解决了问题的一部分；我们把"代码结构变化"提升为"项目决策问题"（L2+L3），这是目前无人占据的位置。**

**竞争定位（2026-08，工程审计）**：

```
dsh-researcher 是：
  ❌ 不是 Coding Agent（不修改代码，不竞争实现能力）
  ❌ 不是 RepoMap / 符号检索器（不竞争"给模型什么上下文"）
  ❌ 不是架构 enforcement 工具（不竞争"阻止违反约定"）
  ✅ 而是长期项目认知层（Project Cognition Infrastructure prototype）：
     认知状态建模 → 跨会话迁移 → 证据锚定失效 → 评测治理
     竞争维度 = 认知的持久性/可验证性/可迁移性（已验证机制）
     价值维度 = Research Mode 应用层收益（未验证，待 Phase 2）
```

**与最接近竞争者的边界**：Cairn 维护"已知"架构意图（L1）；我们推断"未知"并承载认知状态（L2/L3 + 基础设施）。普通 Coding Agent 是我们的**最大竞争者**，但其认知是会话局部的 —— 我们的差异点（认知持久性）是机制存在（已验证），不是收益（未验证）。

## 相邻项目

| 项目 | 相似度 | 最强之处 | 与我们的根本区别 |
|---|---|---|---|
| [Cairn](https://github.com/cairn-framework/cairn)（另见 [isaacriehm/cairn](https://github.com/isaacriehm/cairn)） | 9/10 | 架构 blueprint 记忆、跨会话、漂移检测、commit 前拦截；有 CLI/MCP/grammar/测试/CI | 它维护"**已知**架构意图"不被破坏；我们推断"**未知**"的架构/意图/问题并判断下一步该不该做。`Architecture Intent → Code` vs `Code+Docs+History+Reality → 决策` |
| [dadbodgeoff/Drift](https://github.com/dadbodgeoff/drift) | 8.5/10 | 自动学习 repo 约定并阻止违反；Rust 引擎 + repo map + baseline + eval battery（~785 stars） | Architecture **enforcement** vs Architecture **intelligence**：它判"新代码是否符合已有结构"；我们继续问"已有结构本身还合理吗？这个 convention 过时了吗？该重构吗？这功能该做吗？" |
| [anrcy/Understand-Anything](https://github.com/anrcy/Understand-Anything) | 8/10 | 全项目知识图谱 + 多 Agent 流水线 + 增量更新 + Diff Impact Analysis（~80k stars） | 它回答"系统是什么、怎么连接"；我们回答"为什么会变成这样、哪里不合理、该做什么"。它验证了"whole-codebase model"的巨大需求——适合做我们的 **L0 后端** |
| [GitNexus](https://github.com/anthropics/GitNexus) | 7.5/10 | 依赖图/调用链/影响半径/GraphRAG，MCP 查询（context/impact/trace/detect_changes） | 底层 code intelligence，不是研究 Agent；`impact(symbol, depth)` 正好补"局部修改→全局影响"的机械部分 |
| Serena | 6.5/10 | Symbol 级检索 + 项目记忆，Token 效率成熟（~28k stars） | Coding Agent 的 IDE 层；我们借思路，不竞争 |
| Aider Repo Map | 5/10 | 成熟的全仓结构化降维（~48k stars） | 只解决"给模型什么上下文"；我们是"用什么上下文做全局决策" |
| [architecture-drift-checker (inDriver)](https://github.com/inDriver/architecture-drift-checker) | 7/10 思路，3/10 成熟度 | layer/cycle/dependency 漂移检测 + PR 报告 | 4 stars、5 commits：强需求信号，非成熟竞品 |
| [peopleworks/codeboarding-mcp](https://github.com/peopleworks/codeboarding-mcp) | 7/10 | 活文档架构 + 无 LLM 漂移检测（确定性） | 与 Cairn 同类的 L1 能力；同样是维护既定架构 |

## 三个失败模式与本模式的对应

| 失败模式 | 含义 | 我们的机制 |
|---|---|---|
| **A. Local Optimum Failure（米格-25）** | 每个 diff 局部最优，五十次之后全局更差 | CHALLENGE 的"腐蚀 vs 演化"之问 + DIAGNOSE 的"局部最优≠全局最优"检查 + CLASSIFY 三态收束 |
| **B. Context Fidelity Failure** | 长上下文昂贵有噪声；短上下文压缩失真、局部正确全局失真 | L0→L2 令牌层（制图→证据包→证据晋升）+ 将来整合 Serena/GitNexus 的符号级检索 |
| **C. Temporal Drift Failure** | 每一步当天都合理，80 天后项目已不是当初的系统（路径依赖） | RECONSTRUCT 的 git 历史对照 + 假设版本化演化轨迹 + 将来 Capsule freshness gate |

## 分层定位与整合策略

```
L0 项目有什么   → GitNexus / Serena / Aider RepoMap / Understand Anything（整合，不重造）
L1 发生了什么   → Cairn / Drift / codeboarding（整合，不重造）
L2 哪些结论是真的 → dsh-researcher：证据台账、层级、裁决、依赖失效        ★ 核心
L3 变化是不是好事、该不该做 → dsh-researcher：项目模型、问题链、权衡、三态  ★ 核心
L4 怎么做       → DSH Plan Mode
L5 做           → Coding Agent
```

**双层架构（2026-08，Experiment C+ 后，见 docs/evaluation-cplus-conclusion.md 与 docs/project-cognition-position.md）**：

```
Infrastructure 层（已验证）   Project Cognition Infrastructure
  ├─ cognition-state：会话内状态机（claims / 依赖图 / 局部失效 / 重放）
  ├─ 状态迁移管线：export → importState（跨会话认知继承，6/6 运行验证，
  │    证据锚定失效可复现，成本 0.93× 无惩罚）
  ├─ 对账工具：cognition-diff（证据锚指纹 → 失效候选，机械真值）
  └─ 评测治理：G1–G7 gate、注入完整性检测、锁、失败保留

Application 层（未验证优越性）   Research Mode（十一阶段 Research Agent）
  ├─ 只读能力面、证据纪律 C0–C4、BUILD / DON'T BUILD / INVESTIGATE
  ├─ PCR 双层输出 + Runtime Certificate
  └─ 优越性主张待隔离重跑裁决（Experiment A 未支持；C+ 配对因快照
       隔离泄漏不可采信，见 evaluation-cplus-conclusion.md Unvalidated）
```

**整合原则**：L0/L1 通过它们的 MCP 端点/导出图/blueprint 文件接入；Researcher 的独特价值是把它们的输出提升为**决策问题**——例如 Drift 报 "Controller→DB 违反 convention"，Researcher 不问"要不要拦"，而问"这个 convention 为什么存在？理由今天还成立吗？这次 deviation 是架构腐蚀还是合理演化？"

## 与 DSH 官方的关系

官方 shipped 预设（standard/code/minimal/cordis）与 Plan Mode 均未覆盖"任务成立之前"的决策层；Plan Mode 已相当工程化（durable plan stance、resume/fork 状态重建），但它默认任务已经成立。我们位于其上游（Research → Plan → Code），已进入官方 Show Your Plugins! 区。

## 风险备注

- 相邻项目多数是**平台无关的**（MCP/CLI/Claude Code skills）；dsh-researcher 目前绑定 DSH——harness 原生强制（scope 层守卫、会话日志事件溯源）是我们的护城河，也是生态天花板。对策已在路线图：方法论与报告规范保持工具无关，可移植。
- 我们的 L0/L1 暂用 git_read + 子代理证据包，属"够用级"；等整合缝设计好后替换，而不是在此之前自建知识图谱。
