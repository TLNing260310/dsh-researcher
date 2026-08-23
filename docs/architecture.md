# Architecture — dsh-researcher 真实架构

> 作者:Release Architect + Open Source Project Reviewer。工程审计风格。
> 本文档描述**当前真实架构**(代码事实,非概念愿景)。定位:**evolving toward a Project Cognition Infrastructure prototype**。
> 关键原则:**Application Layer 消费 Infrastructure Layer;两层不可混淆。**

---

## 1. 架构总览(双层)

```
dsh-researcher — Project Cognition System(演化中)
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

**数据流(单向)**:

```
Research Mode(应用层)
    │  research_checkpoint(产生认知:claims/hypotheses/views 修订)
    ▼
cognition-state(基础设施:状态机,内存 + 会话日志事件溯源)
    │  fullExport → cognition-state-export.js → cognition-state.json
    ▼
状态迁移管线(export/import:cognition-state-to-import.js → importState)
    │
    ▼
cognition-diff(证据锚 blob 指纹 → stale-candidate → 依赖传播)
    │
    ▼
evaluation governance(G1–G7 gate · eval-lock · blind-doctor · 失败保留)
```

---

## 2. Application Layer — Research Mode

**职责(应用层)**:

| 能力 | 代码/文档证据 |
|---|---|
| repository research(项目研究) | 十一阶段管道(DISCOVER → … → HANDOFF),methodology SKILL |
| architecture analysis(架构分析) | PCR §2 Architecture Map / §3 Critical Components |
| risk analysis(风险分析) | PCR §5 Risk Map(风险区域,非 bug 预测) |
| decision support(决策支持) | PCR §7 Decision Memo(BUILD / DON'T BUILD / INVESTIGATE) |
| handoff(交接) | `research_handoff.json`(schema v1) |

**身份边界(能力面强制,非 prompt 自觉)**:无 shell(唯一子进程 = git_read 固定 allowlist)、write/edit 永拒桩、只读沙箱 + never 审批 —— Researcher 是**认知生产者**,不是执行者。

**验证状态**:应用层**优越性未验证**(Experiment A 方向不支持;C+ 配对被快照泄漏污染)。

## 3. Infrastructure Layer — Project Cognition Infrastructure

**职责(基础设施层,代码事实)**:

| 能力 | 代码证据 | 验证状态 |
|---|---|---|
| **cognition-state** | `researcher/plugins/research-state/index.js`:schemaVersion:1;claims/hypotheses/views/dirty;单 reducer(applyCheckpoint)事件溯源;会话日志重放 | ✅ 已验证(137 claims 实证写入) |
| **claims graph** | claims → hypotheses → views 依赖图(dependsOn 字段) | ✅ 代码存在(89 边实证);传播机制测试不足 |
| **evidence anchors** | evidence 字符串数组 + 导出器解析为 file/line_span/blob_sha256 | ✅ 已验证(锚解析 + 指纹计算) |
| **dependency tracking** | `dependentsOf` 递归失效 → 局部重算(只重算脏节点) | ✅ 代码存在(invalidate 机制) |
| **revision tracking** | 版本化假设(invalidated 保留历史,revision 递增) | ✅ 代码存在 |
| **export / import migration** | `fullExport` → `cognition-state-export.js` → `cognition-state-to-import.js` → `importState` | ✅ 已验证(G1 32/32 保真;6/6 C+ B-runs G2 PASS) |
| **evaluation governance** | `fixtures/blind/eval-lock.js`(sha256 锁)、`blind-doctor.js`(金丝雀)、`research-doctor`(8 项运行时检查)、G1–G7 gate | ✅ 已验证(抓住 QUOTA 失败;LOCK OK) |

**原型边界(诚实声明)**:以上全部为**原型级实现**,不是商业级基础设施 —— 产品化(v0.9 capsule / Memory Bridge / 自动迁移)未做;应用层价值未验证。

## 4. Application Consumes Infrastructure(消费关系,不可混淆)

| 维度 | Infrastructure Layer | Application Layer |
|---|---|---|
| 角色 | 认知的**承载**(carriage) | 认知的**生产**(production) |
| 生命周期 | 跨会话(状态持久于会话日志,可导出/导入) | 会话内(每次分析一次生产) |
| 写入方 | research_checkpoint(模型自驱)+ host 导出器 | 模型(十一阶段管道) |
| 可验证性 | 机械对账(cognition-diff)+ 锁 + 完整性检测 | 证书(doctor)+ PCR 双层 |
| 价值声明 | **已验证**(工程能力) | **未验证**(优越性) |

**禁止混淆的两件事**:
1. "状态迁移可行" ≠ "Research Mode 更优" —— 前者已验证,后者未验证;
2. "基础设施是原型" ≠ "基础设施是营销" —— 原型是真实的工程资产,但产品化未做。

## 5. 与相邻系统的边界

```
L0 项目有什么   → GitNexus / Serena / Aider RepoMap / Understand Anything(整合,不重造)
L1 发生了什么   → Cairn / Drift / codeboarding(整合,不重造)
L2 哪些结论是真的 → dsh-researcher Infrastructure:证据台账、层级、裁决、依赖失效   ★ 核心
L3 变化是不是好事 → dsh-researcher Application:项目模型、问题链、权衡、三态       ★ 核心
L4 怎么做       → DSH Plan Mode
L5 做           → Coding Agent
```

详见 [docs/landscape.md](./landscape.md)。

## 6. 架构决策记录(ADR-lite)

| # | 决策 | 理由 | 状态 |
|---|---|---|---|
| A1 | Application/Infrastructure 分层 | 认知生产与承载分离;已验证能力归基础设施,未验证价值归应用层 | 2026-08 采纳 |
| A2 | 单一事实源 = cognition-state(会话日志事件溯源) | 可重放、可审计、零写契约 | 已实现 |
| A3 | 状态迁移走 export/importState(现有工具面) | 零新 agent 工具;G1 保真验证 | 已验证 |
| A4 | 检测 = 标注不动作(cognition-diff 只输出 stale-candidate) | 零自动失效承诺;人工裁决 | 已实现 |
| A5 | 失败保留为反例资产 | 可信度优先;QUOTA/leakage 记录不删除 | 已执行 |

---

*本文档描述当前真实架构(代码审计);不包含任何"已完成基础设施"或"Researcher 更优"的声明。*
