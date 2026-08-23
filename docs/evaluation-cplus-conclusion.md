# Experiment C+ Conclusion — Cognition-State Inheritance(架构级结论)

> 作者:Evaluation Principal + Software Architect。**不修改 C+ protocol / 不删除失败记录 / 不隐藏 leakage / 不宣称 Projection Layer 已验证。**
> 目标:建立真实技术边界 —— 什么已被证明、什么未被证明、什么仍需验证。不宣告成功,不宣告失败。

---

## Validated(已验证 —— 基础设施层能力成立)

### V1. State injection pipeline works

- `cognition-state-export.js` → `cognition-state-to-import.js`(from-log 全保真,round-trip 32/32 零差异)→ `research_checkpoint importState` 完整链路可运行。
- 6/6 B runs 的会话日志验证:`importState` 携带 `schemaVersion:1` payload 且 `export:true` 全量读取均成功(G2 PASS)。
- 转换器 G1 保真验证通过(claims 数/statement 无损)。

### V2. Cognition migration works(跨会话认知迁移可行)

- 6/6 B runs 展示了对上一 session 认知的**实际使用**:锚点核对(prior line numbers)、假设演化轨迹(H1 rev 8)、claim 修订(32→38 claims)、"Previous assumptions that no longer hold" 显式失效清单。
- 证据锚定的失效行为可复现:mut04-b 4/4 应失效集合覆盖,mut03-b 5/5,mut06-b 2/2。
- 成本无惩罚:B 均值 404.6s vs A 434.8s(0.93×);4/6 配对 ≤1.0×。

### V3. Evaluation governance works(评测治理机制成立)

- G1–G7 gate 全部可执行且有效:转换器保真(机械)、注入完整性(可发现性+金丝雀)、应失效集预计算(cognition-diff 机械真值)、锁(20 项 sha256)、盲 doctor。
- **完整性检测真的抓住了失败**:QUOTA 中断的 7 个 run 被检测并保留;G2 的 import/export 验证能区分"真注入"与"名义注入"(pilot 的 integrity 判定)。
- 失败保留纪律执行:QUOTA 失败产物原样归档,重跑在冻结协议下完成。

---

## Unvalidated(未验证 —— 必须如实标注,不得宣称)

### U1. Researcher superiority over normal agents(未验证)

- C+ 的 A/B 配对比较被 **snapshot isolation leakage** 污染:T1 快照位于 `commander.js-cplus-t1/`,与原始 T0 同级;只读沙箱允许读 workspace 外,5/6 A-runs 读取了 sibling/T0(获得外部 ground truth)。**Mutation Recall 配对比较不可采信。**
- Experiment A 的方向性证据(GUS Plan ≥ Standard ≥ Quick ≥ Deep)也不支持 superiority 主张。

### U2. Mechanism causality(机制因果未隔离)

- 无 Condition C(context-injection 对照):B 的收益无法区分"注入指令的元认知提示"与"状态机制本身"。total effect 可测,机制净效应不可测。

### U3. Invalidation-condition value(未验证)

- claims 无 `invalidation_condition` 字段;C+ 注入的是 claims 级状态,未测条目级失效条件价值。Projection Layer v0.2 的核心价值主张(invalidation condition + evidence anchor)**未被本实验触及**。

### U4. Mutation Recall improvement(未验证)

- 12/12 饱和(matched)是 marker 注释可搜索 + 泄漏的产物,非认知继承能力的度量。

---

## Remaining(剩余验证 —— 最小路径)

### R1. Isolated rerun(隔离重跑)

- 修复:T1 根目录隔离(无 sibling ground truth 可达)+ 无 marker 注入(仅行为/类型/文档失配可检测)。
- 范围:同协议(protocol 冻结不修改,仅环境修复),6 mutations × (A, B)。
- 目的:获得可采信的 Mutation Recall 与配对比较。

### R2. Mechanism isolation experiment(机制隔离实验)

- 增加 Condition C(context injection 对照:相同内容以文本形式提供,不走 importState)。
- 目的:A vs C = 信息增量;C vs B = 机制净效应。
- 注意:需 protocol bump(新条件),或作为独立实验 C++。

### R3. Long-term maintenance evaluation(长期维护评估)

- 多阶段连续变更(T0→T1→T2→T3,阶段化注入),测维护臂 vs 重建臂的 Maintenance Recall / Consistency Drift / Rebuild Cost Ratio。
- 目的:验证 H2 在"维护"而非"单跳继承"上的价值。

---

## 技术边界总结(一句话)

**已验证的是基础设施:状态生产、状态迁移、评测治理 —— 这些是真实的工程能力;未验证的是应用价值:Researcher 是否因这些机制而优于普通 agent —— 这必须等隔离重跑。任何"Projection Layer 已验证"或"Researcher 更优"的宣称均无依据。**

---

*本文件基于 Experiment C+ 全部产物(evaluation/results/experiment-cplus/)。未修改任何协议/评分规则/失败记录。*
