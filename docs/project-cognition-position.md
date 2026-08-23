# Project Cognition Position — dsh-researcher 架构定位(2026-08)

> 作者:Evaluation Principal + Software Architect。工程审计风格。
> 定位:**evolving toward a Project Cognition Infrastructure** —— 不是"已完成的基础设施",不是"更强的 Research Agent"。诚实分层:已验证的基础设施能力 + 未验证的应用层价值。

---

## 1. 为什么需要 Project Cognition Infrastructure

### 1.1 当前 AI Agent 的 context loss 问题

现代 AI coding agent 每次会话的工作方式:

```
session N:  Read code → 修改 → session 结束(上下文丢弃)
session N+1: 重新读 code → 重新理解 → 修改(再次丢弃)
```

**Context loss 的三个层面**:

1. **会话级丢失**:每次 session 结束,模型的推理图、已核实的 claim、版本化的假设全部消失;下次从零重建。Experiment A 已显示"从零重建"在清单核对任务上约 0.70 GUS —— 每次重建都重新付这个成本。
2. **理解级失真**:长上下文压缩(compaction)丢失细节;短上下文无法容纳全局关系(landscape.md 的 Context Fidelity Failure)。
3. **时间级漂移**:项目 80 天后的状态与当初的设计意图脱节(Temporal Drift Failure);没有机制记录"当初为什么这样设计"。

**结论**:问题不是"模型不够聪明",而是**认知没有持久性**。模型单次推理再强,每次会话都从零开始 —— 这是结构性问题,不是模型能力问题。

### 1.2 dsh-researcher 的解决方式

把"认知"从会话中**抽离为可持久化、可迁移、可验证的状态**:

```
Research Mode(应用层,产生认知)      Project Cognition Infrastructure(基础设施层,承载认知)
  └─ 十一阶段分析                          ├─ cognition-state:结构化状态机
      └─ claims/evidence/假设                ├─ claims graph + dependency tracking
          └─ 会话结束                         ├─ revision tracking(版本化,不删除)
                                              ├─ state export/import(跨会话迁移)
                                              ├─ cognition-diff(证据锚对账)
                                              └─ evaluation governance(G1–G7/锁/完整性)
```

**核心机制**:认知的生产(Research Mode)与认知的承载(Infrastructure)分离。生产是一次性的,承载是持续的。

### 1.3 与普通 coding agent 的区别

| 维度 | 普通 Coding Agent | dsh-researcher |
|---|---|---|
| 认知生命周期 | 会话内,结束即丢 | **跨会话,版本化,可迁移**(已验证机制) |
| 证据纪律 | 无(直接回答) | C0–C4 定级 + 裁决态(证据锚) |
| 失效处理 | 无(旧认知静默过期) | 依赖图局部失效 + 版本化假设 |
| 可验证性 | 无 | Runtime Certificate + 评测治理(G1–G7) |
| 修改影响 | 无预判 | 证据锚指纹 → 失效候选(cognition-diff) |

**注意**:以上"区别"描述的是**机制存在性**(已验证),不是"Research Mode 更优越"(未验证)。

---

## 2. 当前验证边界(2026-08,Experiment A + C+ 后)

### 2.1 Validated(已验证 —— 基础设施层)

| 能力 | 证据 |
|---|---|
| **cognition state model** | research-state 状态机(schemaVersion 1;claims/hypotheses/views/dirty;单 reducer 事件溯源;会话日志重放);137 claims 实证写入 |
| **state export/import(migration pipeline)** | export → cognition-state-to-import(round-trip 32/32 零失真)→ importState;6/6 C+ B-runs G2 PASS(importState+export:true) |
| **cognition continuity(跨会话认知继承)** | 6/6 B-runs 证据锚定失效旧认知("no longer hold" 清单、32→38 claims 修订);成本 0.93× 无惩罚 |
| **evaluation integrity(评测治理)** | G1–G7 gate;完整性检测抓住 QUOTA 失败;eval-lock 20 项哈希;失败保留纪律 |

### 2.2 Invalidated(已证伪/不可采信 —— 应用层)

| 主张 | 状态 | 原因 |
|---|---|---|
| Researcher beats Agent(优越性) | ❌ 未支持 | Experiment A 方向相反(GUS Plan ≥ Standard ≥ Quick ≥ Deep);C+ 配对被快照泄漏污染 |
| Mutation Recall superiority | ❌ 不可采信 | 12/12 饱和 = marker 可搜索 + sibling/T0 泄漏的产物 |
| Projection Layer effectiveness | ❌ 未验证 | claims 无 invalidation_condition 字段;C+ 未触及条目级价值 |

### 2.3 Unknown(未知 —— 需后续实验)

| 问题 | 状态 | 需要 |
|---|---|---|
| maintenance productivity(维护生产力) | ❓ 未知 | 隔离重跑(R1)+ 长期维护评估(R3) |
| long-term usefulness(长期价值) | ❓ 未知 | 多阶段维护实验(R3) |

---

## 3. 架构图(当前真实状态)

```
┌─────────────────────────────────────────────────────────────┐
│ Application Layer: Research Mode(未验证优越性)              │
│   十一阶段管道 · 只读能力面 · C0–C4 证据纪律                │
│   BUILD/DON'T BUILD/INVESTIGATE · PCR · Runtime Certificate │
└──────────────────────────┬──────────────────────────────────┘
                           │ research_checkpoint(产生认知)
┌──────────────────────────▼──────────────────────────────────┐
│ Infrastructure Layer: Project Cognition Infrastructure      │
│   (已验证工程能力)                                          │
│                                                             │
│  cognition-state  ── schemaVersion:1,单 reducer 事件溯源    │
│       │                                                    │
│  claims graph ──── claims → hypotheses → views 依赖图      │
│  dependency ────── dependentsOf 递归失效,局部重算           │
│  revision ──────── 版本化假设(invalidated 保留历史)        │
│       │                                                    │
│  export/import ─── fullExport → importState(跨会话迁移)    │
│  cognition-diff ── 证据锚 blob 指纹 → stale-candidate      │
│       │                                                    │
│  evaluation ────── G1–G7 gate · eval-lock · blind-doctor   │
└─────────────────────────────────────────────────────────────┘
```

**架构判断(工程审计)**:四项 Infrastructure 特征 —— state schema ✅、migration pipeline ✅、evidence graph ✅、validation system ✅ —— **全部已存在于代码中,不是概念虚构**。但**不因此宣称"基础设施已完成"**:这些是原型级实现,产品化(v0.9 capsule/Memory Bridge)未做,且应用层价值未验证。

---

## 4. 竞争位置

| 项目 | 与我们的区别 | 对我们定位的含义 |
|---|---|---|
| Cairn | 维护"已知"架构意图;我们是"推断未知"+ 认知状态基础设施 | L1 竞争;我们的差异在 L2/L3 + 状态迁移 |
| Drift / codeboarding | 架构 enforcement;我们是架构 intelligence | 互补,非竞争 |
| Understand-Anything | 全项目知识图谱(回答"是什么");我们回答"为什么/该不该" | 可作 L0 后端 |
| GitNexus | 依赖图/影响半径(code intelligence) | 机械部分,我们的证据层在其上 |
| **普通 coding agent(最大竞争者)** | 会话内认知,零持久性 | **我们的基础设施差异点 = 认知持久性/迁移/验证** |

**竞争位置结论**:基础设施层(状态/迁移/治理)目前无直接竞争者 —— 但**这是"位置",不是"优势"**:位置的价值取决于应用层(R1 隔离重跑)能否证明 Research Mode 因基础设施而更好。

---

## 5. 未来最小路线

| # | 动作 | 目的 | 前置 |
|---|---|---|---|
| R1 | 隔离重跑(T1 根隔离 + 无 marker;同冻结协议) | 可采信的 A/B 配对 | 批准 |
| R2 | 机制隔离(Condition C 文本对照;protocol bump) | 总效应 vs 机制净效应 | R1 后 |
| R3 | 长期维护评估(多阶段 T0→T3,维护 vs 重建) | H2 在维护维度 | R1/R2 后 |
| P1 | 基础设施产品化决策(v0.9 capsule) | 仅当 R1–R3 显示价值后 | R3 后 |

**纪律**:不预先宣称任何路线成功;每步由前一步结果裁决;失败保留为反例资产。

---

## 6. 一句话定位

> **dsh-researcher 正在从"更强的 Research Agent"演化为"Project Cognition Infrastructure Prototype":认知的生产(Research Mode)与承载(状态/迁移/治理)分离,前者优越性未验证,后者工程能力已验证 —— 当前真实状态是"基础设施原型 + 未验证的应用层",不是"已完成的基础设施",也不是"更强的 agent"。**

---

*本文件不修改任何实验 protocol/scoring,不删除任何失败记录(QUOTA/leakage 保留),不宣称 Projection Layer 已验证。*
