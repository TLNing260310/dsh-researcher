# Validation Status — dsh-researcher 验证状态(2026-08)

> 作者:Open Source Project Architect。工程审计标准。
> 目的:公开仓库准确表达"什么已被验证、什么未知、什么已被证伪/不可采信"。**不夸大,不隐藏。**
> 依据:Experiment A(commander.js GUS,12 runs)、Experiment C+(cognition-state inheritance,12 runs)、G1–G7 gate 执行记录。完整结论:[evaluation-cplus-conclusion.md](./evaluation-cplus-conclusion.md)。

---

## ✅ Validated(已验证)

| # | 能力 | 证据 | 层级 |
|---|---|---|---|
| V1 | **structured cognition state exists**(结构化认知状态存在) | research-state 状态机(schemaVersion:1;claims/hypotheses/views/dirty;单 reducer 事件溯源;会话日志重放);137 claims 实证写入 | Infrastructure |
| V2 | **evidence-backed state tracking works**(证据锚定状态跟踪可用) | evidence anchors(file/line_span/blob_sha256 解析);C0–C4 定级 + 裁决态;6/6 C+ B-runs 证据锚定失效 | Infrastructure |
| V3 | **cognition migration mechanism exists**(认知迁移机制存在) | fullExport → cognition-state-export.js → cognition-state-to-import.js → importState;G1 保真(32/32 零失真);6/6 B-runs G2 PASS(importState+export:true) | Infrastructure |
| V4 | **evaluation governance exists**(评测治理存在) | G1–G7 gate;eval-lock(20 项 sha256,LOCK OK);blind-doctor 金丝雀;research-doctor 8 项检查;完整性检测抓住 QUOTA 失败;失败保留 | Infrastructure |

**验证边界(诚实)**:V1–V4 全部为**原型级工程能力**,不是产品化交付;验证范围 = 单仓库(commander.js)、单模型(deepseek-v4-flash)、n=6–12。

## ❓ Unknown(未知 —— 需后续实验)

| # | 问题 | 需要 | 状态 |
|---|---|---|---|
| K1 | **maintenance productivity**(认知继承是否提升长期开发效率) | Phase 2:R1 隔离重跑 + R3 长期维护评估 | 未测量 |
| K2 | **long-term developer value**(长期开发者价值) | 多阶段维护实验(维护臂 vs 重建臂) | 未测量 |
| K3 | **mechanism net effect**(机制净效应,排除提示词) | R2 机制隔离(Condition C 对照) | 未测量 |
| K4 | **invalidation-condition value**(失效条件价值) | claims 无此字段;需条目级实验 | 未测量 |

## ❌ Invalidated / Not Admissible(已证伪或不可采信)

| # | 主张 | 状态 | 原因 |
|---|---|---|---|
| U1 | **Researcher superiority over normal agents** | ❌ 不可采信 | Experiment C+ A/B 配对比较被 **T1 snapshot isolation leakage** 污染:部分 agent 可访问 sibling/T0/mutation 目录获得外部 ground truth → **A/B superiority conclusion 不成立**;Experiment A 方向(GUS Plan ≥ Standard ≥ Quick ≥ Deep)亦不支持 |
| U2 | **Mutation Recall superiority** | ❌ 不可采信 | 12/12 饱和 = marker 注释可搜索 + 泄漏的产物,非认知继承能力度量 |
| U3 | **Projection Layer effectiveness** | ❌ 未验证 | invalidation_condition 字段不在 claims 中;实验未触及条目级价值 |

---

## 判定纪律

1. **不得宣称**:Researcher 优于普通 Agent、生产力提升已证明、AI memory 问题已解决、Projection Layer 已验证。
2. **失败即资产**:QUOTA 失败记录、leakage 披露、Experiment A/C+ 全部产物保留,不删除。
3. **结论边界**:当前所有 Validated 项属于 **Infrastructure 层工程能力**;Application 层(Research Mode)价值全部处于 Unknown 或 Invalidated。

## 快速一览

| 层 | 状态 |
|---|---|
| Infrastructure(状态/迁移/治理) | ✅ 已验证(原型级) |
| Application(Research Mode 价值) | ❓ 未知 / ❌ 不可采信 |
| 未来扩展(semantic dependency / invalidation condition / automatic migration) | ⏸ 未开始(取决于 Phase 2) |

---

*本文件不修改任何实验 protocol/scoring,不删除任何失败记录,不宣称任何未验证价值。*
