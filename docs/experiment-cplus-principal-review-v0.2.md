# Experiment C+ Principal Review v0.2(一致性审查)

> 角色:Evaluation Principal(审查者)。审查对象:`docs/experiment-cplus-protocol-draft.md`(C+ protocol)与 `docs/cognition-projection-layer-design-v0.2.md`(Projection Layer v0.2)。
> 任务:审查两者一致性;不运行实验。
> 方法:对抗性检查五个重点;给出 execution gate。不写代码、不修改任何文件(本审查文档除外)。

---

## 1. C+ 是否真的验证 cognition-state inheritance,而非 prompt/context injection?

**裁决:基本是 inheritance,但存在一个混淆源,必须在报告阶段显式控制 —— 无"上下文注入对照条件"。**

### 1.1 确认是 inheritance(机制正确)

- B 条件的注入路径 = `research_checkpoint importState`(状态机真实加载)+ `export:true`(读取全量)→ 模型得到的是**状态机中的状态**,不是 prompt 中的文本。这是机制级继承,不是上下文注入。✅
- 状态内容(claims/hypotheses/views/dirty)进入 research-state 内部,模型后续通过 projection 交互 —— 与"把 cognition-state.json 文本贴进 prompt"有本质区别。✅

### 1.2 混淆源(必须控制)

**A 与 B 的任务文本差异不止"状态有无"**:B 多了一段注入指令("Before analyzing, import the previous session's cognition state...")。这段指令本身:
- (a) 告知模型"存在前一 session 的认知"(元认知提示);
- (b) 引导模型"把它作为 prior understanding"(使用策略提示)。

**这两者本身就可能改变行为,与状态内容无关。** 若 B 胜出,无法区分是"状态内容有价值"还是"提示词告诉模型要有 prior 有价值"。

**补强(报告阶段,不扩大实验)**:增加**第三条件 C — context injection 对照**:run-2 收到与 B 相同内容的 cognition-state(以**文本**形式附在任务中,标注"前一 session 的认知,仅供参考"),**不走 importState**。这样:

- A vs C = 上下文信息的增量;
- C vs B = **状态机机制的增量(真正的 inheritance 净效应)**;
- B vs A = 总效应(信息 + 机制)。

**裁决**:不加 C 条件实验仍可运行,但结论必须写为"总效应",且**不得声称证明了 inheritance 机制本身**;只有 C vs B 才能证明机制。若预算不允许 C 条件,协议 §10 结论句式必须限定为"显式状态继承指令 + 状态内容的总效应"。

---

## 2. importState 注入链路是否存在隐藏变量?

**裁决:存在四个,必须在 protocol 中显式记录或控制。**

### H1. 状态源大小异质(实测确认)

| 状态源 | claims |
|---|---|
| deep-01 / deep-02 / deep-03 | 32 / 36 / 21 |
| quick-01 / quick-02 / quick-03 | 16 / 10 / 13 |

B 条件的注入状态源按种子分配 → **不同 run 注入的认知量差异达 3.6×**。若某个 B run 恰好分到大状态源,其 Stale Recovery 分母(应失效集合)更大,成功率天然不同。**必须**:每 run 记录注入状态的 claims 数 + 应失效集合大小;配对比较时按"应失效集合大小"分层报告,或限定状态源匹配(deep 源配 deep run)。

### H2. importState 成功无验证(实测确认)

- 协议未定义"注入是否成功"的检查。若模型对 importState 调用失败/参数错误/忘记调用,该 run 名义是 B 但实际是 A → 污染配对。
- **必须**:run 后从 session.events.json 验证是否存在成功的 importState 调用(带 schemaVersion:1 payload);失败 run 标记 INVALID 或按实际条件重新归类,不得静默计入 B。

### H3. projection 不可见 claim 内容(已确认的机制事实)

- importState 后 `projection()` 只返回 claimCount,**不返回 claim 内容**;模型必须再调 `export:true` 才能读全量。
- 协议 B 条件指令已包含 export:true —— 但**未定义"模型是否实际调用了 export:true"的验证**。若模型只 import 不 export,它看到的只是"有 32 条 claim"而无内容 → 与 A 几乎无差别。
- **必须**:验证每个 B run 的会话日志含 importState + export:true 两次调用;缺失者标记并分析。

### H4. dirty set 状态未知

- 状态源导出时 dirty set 未记录(cognition-state.json 的 freshness 无 dirty 字段 —— 实测确认字段缺失)。
- 若 run-1 结束时 dirty 非空(Experiment A 的 checkpoint 是期末批量提交,极可能 dirty 残留),importState 后模型会收到"有脏视图待重算"的信号 → 影响行为。
- **必须**:导出器(已有)的 fullExport 含 dirty —— C+ 的状态源应**从 fullExport 取 dirty 并记录**,或协议声明忽略 dirty(将 dirty 置空后注入),二选一,写死。

---

## 3. 四指标是否足够证明价值?

**裁决:足够作为 H2 裁决指标,但 Stale Recovery 的定义有"分母偏置"风险,且缺一个 Precision 类指标。**

### 3.1 Mutation Recall(OK)

- 两条件均可测,机械真值(注入清单)。✅

### 3.2 Stale Recovery(B 特有)—— 分母偏置风险

- 定义:失效的命中 claim / cognition-diff 应失效集合。
- **风险**:应失效集合 = cognition-diff 的 stale_candidates = "全部 anchorable 锚皆 STALE"的 claim。但**跨文件锚的 claim(部分变化)不在分母** —— 若注入恰好命中某条跨文件 claim 的核心语义,该 claim 不进分母 → 分母系统性偏小 → Stale Recovery 虚高或虚低(取决于模型行为)。
- **必须**:报告 Stale Recovery 时同时报告分母构成(全 stale / 部分变化 / unverifiable 各自数量),并单独报告"部分变化 claim 中被正确失效的比例"作为次级指标。

### 3.3 Consistency Drift(OK,有明确真值)

- unchanged 区域 = cognition-diff 的 unchanged_claims;False Invalidation 单列。✅

### 3.4 Rebuild Cost(OK)

- token/duration/tools 直接可比。✅

### 3.5 缺失:失效 Precision(假失效率)

- 协议有 False Invalidation(未变区域被误报),但缺 **"B 条件错误失效应保留 claim"** 的指标 —— 模型可能为了"显得在维护"而过度失效旧 claim(反向偏差)。
- **补强(报告级)**:记录"被 B run 失效但 cognition-diff 判定 unchanged 的 claim 数"为 Over-Invalidation,与 False Invalidation 并列报告。不进主判据,防"为失效而失效"。

---

## 4. C+ 成功/失败时,Projection Layer v0.2 应如何解释?

**裁决:v0.2 的 M6 声明正确但不够细 —— 必须区分四种结果,且补一个 v0.2 自身未覆盖的缺口(C+ 不测 invalidation_condition 的价值)。**

### 4.1 结果 → 解释映射(必须写进 C+ 报告与 v0.2 的后续)

| C+ 结果 | Projection Layer v0.2 的解释 | 动作 |
|---|---|---|
| B 全面优于 A(H2 成立) | 状态继承有真实增量 → v0.2 的"投影 = 状态的可读面"定位获得支撑 | 推进渲染器实现(host 侧) |
| B ≈ A(H2 无增益) | 状态无增量 → **v0.2 一并降级**(M6:投影不能比事实源更有价值) | 放弃 .cognition/ 方向 |
| B 更差(状态有害) | 状态继承引入锚定/噪声 → v0.2 不仅降级,且说明"可读投影"本身可能放大噪声 | 放弃 + 记录反例 |
| 实验无效(Recall≈0 或注入不可见) | 无结论 → v0.2 悬置,不推进不放弃 | 修实验重跑一次 |

### 4.2 关键缺口(C+ 与 v0.2 的价值错位)

- **v0.2 的核心价值 = invalidation_condition + evidence_anchor(条目级)**。
- **C+ 注入的是 claims(状态级)**,claims 无 invalidation_condition 字段(实测确认:claim 字段只有 id/statement/tier/verdict/confidence/revision/evidence_anchors)。
- **因此:C+ 即使成功,也只验证了 evidence_anchor 的载体(状态继承)有价值,完全没有验证 invalidation_condition 的价值。** C+ 成功 ≠ v0.2 全部价值成立。

**必须声明**:C+ 成功后,v0.2 的 invalidation_condition 价值仍属**未验证假设**,需要单独的后续验证(如:注入含 invalidation_condition 的条目级状态 vs 不含,对比失效质量)—— 该验证可并入 C+ 的扩展或作为 v0.9 工作,但**不得在 C+ 成功后直接宣称 v0.2 全部成立**。

---

## 5. C+ Execution Gate(启动前必须全部满足)

| # | Gate 条件 | 验证方式 | 失败动作 |
|---|---|---|---|
| G1 | 注入链路验证:转换器(cognition-state → importState payload)实现,且 round-trip 保真(claims 数一致、statement/verdict/confidence 无损) | 对 6 份状态源跑转换,断言 claim 数 = 32/36/21/16/10/13 | 修转换器 |
| G2 | 注入成功可验证:protocol 增加"run 后检查 importState + export:true 调用存在且成功" | 会话日志检查脚本(host) | 标记 INVALID,不静默计入 |
| G3 | 状态源记录:每 B run 记录注入 claims 数 + 应失效集合大小 + dirty 处置(置空或保留,写死) | 运行 manifest 扩展 | 补 manifest |
| G4 | 第三条件决策:确认是否加 C(context injection 对照);若不加,协议 §10 结论句式限定为"总效应" | 预算/时间评估 | 按限定句式报告 |
| G5 | 既有工具零修改复核:导出器/diff 未变;eval-lock LOCK OK | git diff + lock check | 停止,回滚 |
| G6 | 冻结:protocol + inject-selection + 任务模板 + 状态源分配 + 锁文件全部冻结 | sha256 锁 | 不冻结不运行 |
| G7 | Step-0:盲 doctor 检查 + 金丝雀;任何 DEGRADED → 停 | blind-doctor | 停步修实验 |

**Gate 之外(报告期义务,非阻塞)**:Stale Recovery 分母构成报告;Over-Invalidation 计数;H1–H4 隐藏变量的每 run 记录表。

---

## 6. 最终裁决

**C+ protocol 与 Projection Layer v0.2 的总体一致性:方向一致,但有三处必须修订才能保证"结论可信"与"解释不越界":**

1. **机制纯度(C vs B)**:当前 A/B 设计只能证明"总效应"(指令 + 状态内容);要证明"inheritance 机制本身",需第三条件 C(context injection 对照)。**若不加 C,协议 §10 结论必须限定为总效应,不得声称机制。**
2. **隐藏变量(H1–H4)**:状态源大小异质(3.6×)、importState/export 成功无验证、dirty 未记录 —— 三项都必须在 protocol 中补"记录/验证"条款,否则结果不可归因。
3. **价值错位(invalidation_condition 未测)**:C+ 只验证状态级继承;v0.2 的 invalidation_condition 价值是独立未验证假设。**C+ 成功后不得宣称 v0.2 全部价值成立。**

**结论:C+ 可以运行,但需在冻结前补三处(G2/G3/G4);运行后按 §4.1 映射解释;Projection Layer v0.2 的价值声明按 §4.2 收缩。若三处不补,实验结论将无法支撑 v0.2 的任何决策。**

---

*本审查未运行实验、未写代码、未修改任何现有文件(仅新增本审查文档)。*
