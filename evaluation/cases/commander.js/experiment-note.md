# Experiment Scope Statement — commander.js Experiment A（实验解释边界声明）

> 冻结后声明：本文件在 Experiment A 任何 run 之前写入，定义实验结果可以说什么、不可以说什么。**本实验之后不得修改本声明以适配结果。**

## 本实验验证什么

在**具有复杂隐含约束的成熟软件项目**（commander.js：高约束、API compatibility 重、parser pipeline 明显）中，Researcher（Quick/Deep）相比 Plan / Standard，能否在**独立 GT、可审计证据、冻结协议**下恢复项目关键认知结构（架构关系 / 设计意图 / 关键约束 / 风险区域）。

## 本实验不验证什么

- ❌ 通用代码能力（写代码、改代码、修 bug 的成功率）
- ❌ Bug 预测能力（未来 issue 召回 —— Flask Phase A 已给出范围声明 0/60，本实验不重复测试）
- ❌ 架构设计能力（提出"最佳"未来设计）
- ❌ 修改成功率（Researcher 不做修改，也不被要求保证修改成功）
- ❌ 跨项目类型的普适性（commander.js 是 Researcher 有利场景；结果**不能**直接外推到所有项目类型。只有覆盖不同认知结构（业务决策重 / 安全边界重 / 数据模型重）的仓库矩阵才能回答普适性问题——那是后续实验）

## 指标解释边界

| 指标 | 高分的含义 | 不代表 |
|---|---|---|
| GUS | 对项目**已有结构**的理解更完整（恢复认知结构） | 能提出最佳未来设计；不证明"更聪明" |
| Risk Surface | 识别 compatibility constraint / hidden contract / coupling point 等风险区域 | 预测具体 bug |
| Impact Recall | 识别修改的传播路径（change → dependency → behavior → contract 链） | 能自动完成修改 |
| Drift（synthetic） | 能发现注入认知变化并失效旧认知（长期认知层潜力） | 具备长期记忆能力（本实验无跨会话记忆） |

## 预期与反预期（结果解读预设，防事后挑选）

- **Deep > Quick > Plan > Standard（GUS）**：支持"深度推理带来更多理解"。
- **Deep ≈ Quick**：长推理未带来额外理解 —— **同样是重要结果**（支持"Quick 已覆盖 Deep 大部分价值"）。
- **Plan 提出更多文件 ≠ Impact 更好**：只看传播链命中与 Critical Edge。
- **任何模式 GUS 接近 0**：认知 GT 错位或任务不可解 —— 报告如实呈现，不调整 GT。

## 已知偏差声明

1. commander.js 是 Researcher 的**有利场景**（成熟、高约束、管道明显）——本实验是"上限探测"而非"平均能力估计"。
2. 单人操作者（D001，Internal Phase A）；双人裁决为公共阶段要求。
3. GT 由独立 evaluator 于任何 scored run 前生成并冻结（时间线与独立性见 manifest 声明）；非评分 pilot 早于 GT 编译，其输出未影响 GT（evaluator 提示词禁止读取，条目证据为快照 file:line 锚）。
4. 模型为 deepseek-v4-flash（D003，配额驱动）；跨模型外推需重跑。

## 结论使用规则

Experiment A 的结论只允许写成形如：

> On commander.js (a mature, high-constraint library), Researcher [did/did not] recover the pre-registered cognition structure (GUS) better than Plan/Standard, at [X] tokens; Risk/Impact/Drift dimensions show [..]. This does not generalize to all project types.

禁止写成："Researcher 比普通 Agent 更懂项目"（无跨类型证据）。
