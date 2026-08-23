# Validation Status — dsh-researcher 验证状态(2026-08)

> 作者:Open Source Project Architect。工程审计标准。
> 目的:公开仓库准确表达"什么已被验证、什么未知、什么已被证伪/不可采信"。**不夸大,不隐藏。**
> 依据:Experiment A(commander.js GUS,12 runs)、Experiment C+(cognition-state inheritance,12 runs)、G1–G7 gate 执行记录。完整结论:[evaluation-cplus-conclusion.md](./evaluation-cplus-conclusion.md)。

---

## 2026-08-24 工程验证增量：Project Cognition + Goal Governor

本节描述 `0.8.0-alpha.1` 新增机制的**机械验证边界**，不改变下方历史实验结论。

| 能力 | 当前证据 | 可采信结论 |
|---|---|---|
| Project Cognition | schema、canonical hash、revision、Markdown 确定性投影、freshness/doctor、仓库自描述状态 | 可以保存并机械检查项目目的、已证/未证事实、不变量、决策与下一步证明；不能据此宣称它已提高长期生产力 |
| Goal Contract | 冻结目标、MUST/SHOULD、边界、预算、人工 gate、verifier registry hash | “什么算完成”可以在执行前固定，合同或 verifier 漂移会失效 |
| Goal Governor | DSH session 事件重放、call-ID/参数绑定、同一最终 attempt 重验全部 MUST、宿主独占终态写入 | 模型文本不能完成目标；证据不足继续，完整性异常暂停，外部阻塞才可 BLOCKED |
| 两种入口 | `/researcher <question>` 一次性只读研究；`/researcher on/off` 持续只读模式；Governed preset 执行已批准合同 | 同一客户端内研究与执行权限可分离；独立 Researcher preset 仍是更强的 OS/DSH 只读边界 |
| 可移植核心 | 无 DSH 依赖的 cognition/goal/verifier reducer、JSON schema、CLI、adapter contract | 机制可以适配其他客户端，但目前只有 DSH adapter 获得仓库内测试，不能宣称 Codex/Claude Code/Zed/OpenClaw 已兼容 |

当前验证包括单元测试、伪造/过期证据拒绝、预算与 no-progress 终止、人工 gate、合同运行分段、Researcher Mode allowlist、host-owned completion、完整性失败暂停，以及 DSH `0.1.0-rc.7` 临时安装后的 preset 扫描。尚未完成真实模型的 live DSH 端到端轨迹，也未完成多模型×多客户端因子实验；对应方案见 [goal-governor-evaluation-protocol.md](./goal-governor-evaluation-protocol.md)。

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
