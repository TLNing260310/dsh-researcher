# Roadmap

> 当前阶段（2026-08）：`0.8.0-alpha.7` 在不改变已实测 Researcher 权限/终态 runtime 的前提下，补齐安全安装生命周期、review-first Quickstart、真实 verifier 进程演示和 Live E1 readiness 记录。下一步仍是对最终 candidate 完成 DSH-dependent Gate 0，再按冻结协议运行真实 E1，而不是继续增加功能。路线只记录尚未完成的 gate；已发布能力和失败证据见 [CHANGELOG](../CHANGELOG.md)、[Validation Status](./validation-status.md)、[DSH Web local smoke](./evidence/dsh-web-local-smoke-2026-08-24.md)、[alpha.7 local-output smoke](./evidence/project-research-local-output-smoke-2026-08-25.md) 与 [Live E1 readiness](./evidence/live-e1-readiness-2026-08-25.md)。

## 路线纪律

- `.project-cognition/state.json` 是唯一 canonical project truth；Research Session Ledger、报告和 handoff 只是 provisional 输入，必须经 [owner promotion](./cognition-governance.md) 才能进入新 revision。
- 冻结的 [Goal Governor Evaluation Protocol](./goal-governor-evaluation-protocol.md) 是 E1/E2/E3 轨迹、样本、estimand、阈值和 invalidity rule 的唯一来源。本路线不复制这些定义。
- mechanical PASS 只说明实现按设计工作；不能替代 live conformance、outcome validation 或 portability validation。
- live E1 必须通过协议 v1.1 的模型路由与成本准入：工作日 `[09:00,12:00)`、`[14:00,18:00)` 禁远程，周末仅免该时段禁令；remote 固定 official Flash + `https://api.deepseek.com`，local 固定 `deepseek-official` DeepSeek-compatible adapter + 无尾斜杠字面 loopback `base_url`。历史 Phase A runtime 仅供审计，不得复用于新模型运行。
- Project Cognition 的 longitudinal value 与 Goal Governor 的 incremental value 是两个 claim，必须分开识别。
- 未通过前一 gate，不开发后一 gate 所需的产品扩展。

## 当前证明链

```text
Gate 0
  ↓
E1: live DSH conformance
  ↓
non-inferential pilot
  ↓
E2: DSH outcome value
  ↓
minimal second adapter + conformance
  ↓
E3: model × client attribution
  ↓
productization decision
```

### Gate 0 — Integrity and freeze

**目的**：确认 canonical state、projection、Goal Contracts、Verifier Registry、adapter capability 与实验冻结产物完整。

**通过条件**：冻结协议列出的 Gate 0 全部 PASS。`project-cognition doctor .` 只证明表示完整性和 projection 一致，不证明 evidence freshness；若实验依赖 freshness，必须另附 fingerprint report。alpha.5 的 Researcher Web smoke 不覆盖 E1 runner route，因此仍需确认：外层冻结 settings 文件且 `watch=false`、锁定值进入 `DEEPSEEK_BASE_URL`，rc.7 公共 DeepSeek resolver 对 remote/local 都得到与 run lock 相同的 resolved base URL。

### E1 — Live DSH conformance

**目的**：在真实 DSH 模型会话中证明 host authority、证据绑定、终态和 resume/replay 行为与 reducer 一致。

**通过条件**：完成冻结协议定义的全部轨迹并满足其有效性规则。失败先修 conformance 或协议基础设施，不进入价值实验。

**网络边界**：loopback 仅证明 DSH adapter 第一跳位于本机，不能证明本地服务未代理远程；E1 操作还需按所需保证配置可信时间、服务端限额、账单告警与出口控制。

### Pilot — Measurement readiness

**目的**：用非推断性 pilot 验证任务可执行性、时间预算、telemetry、blinding、scoring 和人工流程。

**纪律**：pilot 不产生产品价值结论，不用于选择有利阈值。若它导致任务、指标、阈值或流程变化，必须 bump protocol、重新冻结，然后才能开始 E2。

### E2 — Goal Governor outcome value

**目的**：比较 ordinary coding、Research-only 和 Research + Governor，并识别 Goal Governor 的增量价值与使用成本。

**解释边界**：B vs C 是 Governor 的主要归因；A vs C 只能报告整套工作流总效应。E2 不证明 Project Cognition 的纵向价值。

**停止条件**：若效果或成本未达到预注册阈值，保持 DSH alpha/研究资产定位，停止第二 adapter 和 E3 投资，先分析失败机制。

### Second adapter — Portability conformance

**进入条件**：E2 已通过。

**范围**：只实现一个最小 adapter；先机械证明五项 governed capability，再完成与 E1 等价的 live conformance。能力缺失时标记 advisory，不得以 prompt 补足并宣称 governed。

### E3 — Model × client attribution

**进入条件**：第二 adapter 已通过 capability 与 live conformance。

**目的**：在相同任务与合同下分离 model、client/harness 及交互效应。E3 之前不得把单模型、单客户端结果外推到 Codex、Claude Code、Zed/Zcode、OpenClaw 或其他客户端。

## 独立价值轨：Project Cognition longitudinal study

V3A（持久 Project Cognition 是否改善长期维护）不由 E2 代替。另行冻结多阶段 T0→Tn 协议，至少区分：

- 每次重建上下文；
- 等内容静态 context；
- canonical cognition revision + evidence freshness/invalidation。

主要观察 reconstruction cost、stale assumption、architecture drift、人工纠偏和回归。该实验可以复用旧 R1/R2/R3 资产，但必须明确新的 protocol identity、隔离规则和 supersession；历史 Experiment C+ validity 不可改变。

## 暂不投入

- 第三个及更多客户端 adapter；
- semantic knowledge graph、自动 promotion 或自动 owner ratification；
- 在真实价值通过前扩大 prompt、schema 或 memory bridge；
- 用测试数量、doctor PASS 或历史 C+ 宣称生产力/优越性；
- 未经独立证明就将 Research Session Ledger 自动同步到 canonical state。

## 产品化裁决

只有在 E2 达到预注册的效果与成本阈值、第二 adapter conformance 成立、E3 给出可解释的可移植边界后，才评估稳定 API、更多客户端和长期 Memory Bridge。Project Cognition longitudinal track 的结果决定持久 cognition 是否进入产品核心，还是降级为显式文档/研究辅助。
