# Principal Architect — v0.7.1 之后的发展路线审查(是否值得继续)

> 角色:Principal Architect。不增加功能,不修改 Researcher 核心逻辑。
> 立场:**不假设项目成功。目标是证伪,找到失败原因。** 本文件回答一个二元问题:Project Cognition Layer 是否值得继续投入。
> 输入:researcher/ 全部代码(8 文件逐行)、evaluation/ 实验产物、docs/ 协议与既有审查(arch-audit-v0.7.1.md、principal-review-v0.7.1.md)。

---

## Part 1 — 架构审计(代码级)

### 1.1 research-state 是否已经形成认知模型?

**结论:形成了"认知状态机",但没有形成"认知模型"。** 这是一个必须精确区分的判断。

| 认知模型的要求 | research-state 现状 | 判定 |
|---|---|---|
| 结构化知识表示 | claim(statement/tier/verdict/evidence[]/confidence)+ hypothesis + view + 依赖图 | 部分(扁平条目 + 字符串引用) |
| 可查询 | 通过 research_checkpoint 返回投影 | ✅ |
| 可更新 + 失效传播 | 局部失效 + 只重算脏节点 + 版本化假设 | ✅(这是最强项) |
| 可重放/可审计 | 单 reducer 事件溯源,会话日志重建 | ✅ |
| **知识之间的关系结构** | claim 之间无 relation;依赖图只在 hypothesis/views 层 | ❌ |
| **知识与代码现实的绑定** | evidence 是字符串("command.js:953-961"),无 blob 指纹 | ❌ |
| **除生成者外的消费方** | 只有模型自己(报告附录);无机器消费方 | ❌ |

**关键判断**:research-state 是"**知识维护的引擎**"(失效传播、版本化、重放),不是"**知识本身的表示**"(关系、指纹、可对账)。它维护的结构是推理图,不是项目认知。二者之差正是 v0.8 Cognition State 要补的。

### 1.2 PCR 是否只是展示层?

**结论:是。PCR 是展示层,而且是当前唯一的对外输出;状态层只为生成 PCR 服务,没有独立出口。**

- PCR 是模型生成的最终文本;状态在插件内存 + 会话日志。
- **报告 ↔ 状态的绑定是 prompt 纪律,不是机械校验**:模型可在附录写 20 条 claim 而只 checkpoint 5 条。doctor 7 项检查验证"运行时按设计运行",不验证"报告忠实于状态"。
- 展示层本身(双层结构、证据纪律、风险/决策分类)是**好产品**,但它是"叙事"不是"数据"。

**含义**:如果认知层的价值主张是"长期认知",那么状态必须**本身就是产物**(机器可消费、可对账、可交接),而不只是报告的生成原料。当前状态层是"生成过程的中间件",这是架构上最需要升级的点。

### 1.3 claims/evidence/checkpoint 缺什么?

缺"**可机械验证的三件套**":

1. **指纹(Fingerprint)**:evidence 锚不与代码 blob 绑定 → 无法机械判断"这条 claim 的证据是否已过期"。Cognition Diff 的前提不存在。
2. **关系(Relation)**:claim 之间无关系(支撑/冲突/同源)→ 失效传播在 claim 层断链;依赖图只覆盖 hypothesis/views。
3. **桥(Bridge)**:跨会话继承只有手动 export/importState → 无自动 capsule 通道;且"报告与状态一致性"无校验。

一句话:**缺的是"让认知可被机器验证"的三件套,而不是"让认知更聪明"的任何东西。**

### 1.4 Researcher 和 Plan 边界是否需要调整?

**结论:边界结构不需要调整;边界上的职责声明需要由实验裁决。**

- 结构:Researcher 无 shell、无 write、无规划产物;Plan 有执行规划。边界由**能力面**强制(不是 prompt 自觉)—— 这是优点,不可动。
- 职责声明:PCR §6(Change Impact Analysis)与 Plan 的"How"有潜在重叠。**如果 Experiment B 显示 Researcher 影响分析无增益,§6 的独立价值主张撤回**(退化为决策备忘录的输入),而不是调整边界结构。
- Experiment A(Plan 胜出)不构成边界调整的理由 —— 那是任务形态匹配(清单核对),不是边界失效。

### 1.5 Researcher 和 Memory 系统边界是否正确?

**结论:边界设计正确,实现缺失。**

- 正确:Researcher 永不拥有 memory_write;认知持久化归 host-plane(v0.9 Memory Bridge 方向)。
- 缺失:host-plane 侧没有任何 capsule 存储/自动桥 —— 当前唯一持久通道是 DSH 会话日志(隐式、依赖日志完整性,压缩/清理会丢状态)。
- **风险**:如果 v0.9 实现自动桥,Experiment C 的盲测纪律(run-2 不得收 run-1 capsule)将失去现实对应(真实场景 run-2 自然携带状态)—— 评测设计需同步演进。

### 1.6 分类输出

**必须保持(架构不变量)**:

1. 只读能力面边界(fail-closed 守卫、无 shell、永拒桩)—— 认知层与执行 agent 的结构性区分,也是信任基础。
2. 单 reducer 事件溯源(执行 == 重放)—— 正确性根基。
3. 局部失效 + 版本化假设 —— 长期维护的机制内核。
4. 零写契约、证据纪律、冻结/盲测/失败保留的评测纪律。

**应该保留(需强化或重新定位)**:

1. export/importState —— v0.8 Cognition Handoff 的机械基础。
2. research_doctor 证书 —— 增加第 8 项检查:"报告 Evidence Ledger 与状态机 ledger 一致性"(机械校验)。
3. research_handoff.json —— 扩展为完整 cognition handoff。
4. git_read 固定 allowlist、Quick/Deep 深度档。

**应该删除**:

1. 无机制级删除项。persona 中 EXTERNAL RESEARCH/COMPARE 的成本权重待 B/C 结果评估(非删除,是降级触发)。

**应该延期(v0.9+)**:

1. Memory Bridge / Capsule 持久化 —— 等 H2 结果。
2. 真实时间窗口漂移 —— 等合成漂移方法学验证。
3. Structural Evidence 集成、Claim Delta —— benchmark-gated。

---

## Part 2 — 验证路线重新设计(能力 vs 不可替代价值)

### 2.1 区分标准

- **测能力**:该任务可被"无认知机制的模型 + 良好 prompt"完成;实验差异可能来自 persona/提示工程红利。失败不证明认知层失败;成功也不证明成立。
- **测不可替代价值**:该任务要求"认知结构本身"(跨会话状态、证据对账、失效传播),原生推理能力无法覆盖。只有这类实验能裁决定位。

### 2.2 逐实验判定

| 实验 | 测什么 | 类别 | 对定位的裁决力 |
|---|---|---|---|
| A(已完成) | 单快照理解(GUS) | **能力** | 无(已削弱,只证明"单次理解不是卖点") |
| **B(Change Impact)** | 影响链推理(单快照 + 拟议变更) | **能力** | 低 —— 影响分析很可能被原生推理覆盖;B 失败不证明认知层失败,B 成功也不证明成立 |
| **C 现状(无状态臂)** | 无记忆漂移检测(H3) | **能力** | 中低 —— 变化检测是模型通用能力;失败什么都证明不了 |
| **C+ 状态继承臂 / D** | **有状态维护 vs 重建(H2)** | **不可替代** | **高 —— 唯一能裁决定位的实验** |

### 2.3 路线修正(必要)

1. **B 照跑,但结论权重要低**:它决定 PCR §6 去留,不决定定位。
2. **C 必须加状态继承臂**:run-2 经 evaluator 注入 run-1 checkpoint export(Researcher 自比:有状态 vs 无状态)。这是机制验证 —— "状态是否提供增量",基线无法参与(claims=0),不对称本身是发现。
3. **新增机制正确性测试(低成本高价值)**:局部失效的**正确性**(给定新证据,状态机是否只失效正确的依赖子集,不过失效/不欠失效)—— 用合成状态机 + 真实注入场景验证,不需要模型。这测的是"机制是否如设计运行",是"不可替代性"的工程前提。
4. **顺序**:B(能力,12 runs)→ C 无状态臂(H3,能力)→ C 状态臂(H2,不可替代)→ 裁决。

**必须回答**:哪些实验测能力?—— A、B、C 无状态臂。哪些测不可替代价值?—— **只有 C 状态继承臂(和 Phase D 变体)**。当前路线(B + C 现状)不足以判定定位,必须加入状态臂。

---

## Part 3 — v0.8 设计(只允许三个工件,零 agent 能力变更)

> 硬约束:不新增 agent 工具、不改变模型工具面、不修改 persona/prompt 以追求分数。以下全部是 **host-plane / 格式 / 消费方** 侧工件,或对现有纯函数(foldCheckpointEvents、dependentsOf)的复用。

### 3.1 Cognition State(认知状态实体化)

**问题**:状态在内存 + 会话日志,机器不可消费;报告与状态无机械绑定。

**设计**:`cognition-state.json`(schema `dsh-researcher/cognition-state/v1`),由 **host-plane 导出器**从会话日志的 research_checkpoint 事件流折叠生成(复用 foldCheckpointEvents —— 纯函数,不涉及 agent):

```json
{
  "schema": "dsh-researcher/cognition-state/v1",
  "run": "#N",
  "project": "commander.js@bf35c5f",
  "claims": [{
    "id": "C07", "statement": "...", "tier": "C2", "verdict": "Known",
    "evidence": [{"ref": "command.js:953-961", "blob_sha": "a3f9c2..."}],
    "confidence": 0.9, "revision": 3
  }],
  "hypotheses": [{"id": "H2", "status": "active", "dependsOn": ["C07"]}],
  "views": [{"name": "project_model", "dependsOn": ["H1", "H2"]}],
  "dirty": []
}
```

- 导出器为每条 evidence 锚计算 **blob 指纹**(git blob sha)—— Cognition Diff 的机械前提。
- **零 agent 改动**:Researcher 不知道它存在;导出器是评估/host 脚本。

### 3.2 Cognition Diff(状态 vs 现实对账)

**问题**:无机制知道"哪些 claim 的证据已过期"。

**设计**:`cognition-diff.js`(host-plane,非 agent 工具):

1. 输入:cognition-state.json + 当前 workspace。
2. 机械对账:证据锚 blob sha 变化 → claim 标 `stale-candidate`;经 dependentsOf 传播 → hypothesis/view 标 `affected`。
3. 输出:`{ stale_claims, affected_hypotheses, unchanged_claims }`。
4. 双重用途:
   - **评估侧**:C/D 的**机械真值** —— 注入变化后,哪些 claim 应失效由 diff 机械判定,不依赖 evaluator 主观;Researcher 能否在拿到提示前自己发现失效,是 H2 的核心测量。
   - **产品侧**(v0.9+):freshness gate 输入。

### 3.3 Cognition Handoff(标准化认知交接)

**问题**:research_handoff.json 只含 BUILD 项;完整认知无法交接。

**设计**:扩展为 `cognition-handoff.json`(schema `dsh-researcher/cognition-handoff/v1`):

```json
{
  "schema": "dsh-researcher/cognition-handoff/v1",
  "run": "#N", "certificate": "SAFE",
  "state_ref": "cognition-state.json (sha256 ...)",
  "diff_ref": "cognition-diff.json (stale/affected counts)",
  "build_items": [ ...现有 research_handoff.json 内容... ],
  "do_not_touch": ["paper/ frozen artifacts"],
  "unknowns": [{"id": "U3", "question": "...", "evidence_needed": "..."}]
}
```

- 机器消费方(Plan Mode pre-step、Memory Bridge、评估器)按 schema 读取。
- **不增加 agent 能力**:模型仍只输出 research_handoff.json 块(现有行为);host-plane 折叠状态/差异进交接包。

### 3.4 v0.8 交付形态与验证策略

| 工件 | 性质 | 依赖 | 验证 |
|---|---|---|---|
| cognition-state 导出器 | host 脚本 | foldCheckpointEvents | 对 Experiment A 归档日志回放,与人工 ledger 对比 |
| cognition-diff.js | host 脚本 | git blob sha | 对 D 的注入场景,机械失效集 vs 人工判定 |
| cognition-handoff schema | 格式定义 | state + diff | D 的维护臂输入 |
| doctor 第 8 项检查 | doctor 新增检查项 | 状态导出 | 报告附录 ↔ 状态一致性 |

**纪律**:v0.8 工件**先为实验服务**(评估工具),验证后再产品化 —— 与 roadmap "benchmark 证明后再深化"一致。

---

## Part 4 — 失败分析(目标是找到失败原因,不证明成功)

### 4.1 四种失败模式的可区分信号

**① 技术失败(概率 ~20%)**

- 机制:状态机正确但结构不足(无指纹/关系/桥)→ 增量无法实现或噪声大;或会话日志依赖脆弱(压缩丢状态)。
- 信号:v0.8 评估工具对真实仓库的失效判定噪声大;状态导出与人工判断系统性不一致;doctor 第 8 项检查常 FAIL。
- 判定方法:可修。若信号出现,是"工程问题",不是"方向问题"。

**② 定位失败(概率 ~25%)**

- 机制:认知层的"长期维护"叙事无实证支撑 —— H2(状态继承)无增益,维护臂 ≤ 重建臂。
- 信号:Experiment C 状态臂中,Researcher 有状态 vs 无状态无差异;或维护臂成本 ≥ 重建臂且准确率无提升。
- 判定方法:**这是定位的生死判据**。H2 无增益 → 承认"认知层定位不成立",降级为"高质量只读分析模式"(证据纪律/风险地图仍有产品价值,但机制无增量)。

**③ 市场失败(概率 ~10%)**

- 机制:生态位窄(DSH developer preview);与 Cairn/Drift/GitNexus 相邻,差异化未被理解。
- 信号:评测外信号(采纳率、issue 讨论),不在本评测范围内。
- 判定方法:非实验可答;不阻塞技术判断。

**④ AI 模型进步导致价值消失(概率 ~45% —— 最高)**

- 机制:模型原生能力(长上下文 + 推理)持续吞噬认知层的增量面。Experiment A 已是早期信号:Plan/Standard(无认知机制)GUS 0.70+,成本远低;H1(影响分析)与 H3(无状态检测)与原生推理高度重叠。
- 信号:B 中基线 ≈ Researcher;或 C 无状态臂中基线 ≈ Researcher;且随模型版本进步,差距不扩大。
- 判定方法:**这是最可能的失败原因,且不可控**。应对:把全部权重压在 H2(跨会话状态) —— 这是模型原生能力唯一无法覆盖的维度(单次推理再强也没有跨会话记忆)。

### 4.2 失败路径合成(最可能的失败叙事)

> 项目最可能的失败路径:**AI 模型进步先吞噬 H1(影响分析)与 H3(变化检测),随后 H2(状态维护)被"每阶段重跑一次"的成本等价替代 —— 认知结构的边际价值趋近于零,定位失去实证支撑。**

这条路径的三个可观测里程碑:

1. B 结果:基线 Impact Score ≈ Researcher(CNS 无优势)→ H1 死亡(能力面)。
2. C 无状态臂:基线 Mutation Recall ≈ Researcher → H3 死亡(能力面)。
3. C 状态臂:有状态维护 ≤ 无状态重建 → H2 死亡(机制面)→ **承认定位不成立**。

### 4.3 反制(不改变 Researcher,只改变投入决策)

- **如果里程碑 1 出现**:停止 PCR §6 独立价值主张,收缩报告范围(B 之后立即执行,不等 C)。
- **如果里程碑 2 出现**:C 状态臂提前,跳过不必要的能力实验,直接裁决 H2。
- **如果里程碑 3 出现**:承认定位失败,保留产品价值(只读报告 + 证据纪律),放弃认知层叙事;所有记录保留为反例资产。
- **如果在任何里程碑前出现系统性边界违规**:停步修实验,不修 Researcher。

---

## 结论(二元判断)

1. **架构**:状态机是真引擎,但不是认知模型;PCR 是展示层;缺指纹/关系/桥三件套 —— **方向可修,且 v0.8 三个工件正好补上,零 agent 改动**。
2. **路线**:当前 B + C 现状测的都是能力,不足以裁决定位;**必须加状态继承臂(C+)**,否则验证路线永远无法回答"是否值得继续"。
3. **v0.8**:Cognition State / Diff / Handoff 全部为 host-plane 工件,符合全部禁令。
4. **失败归因(预测)**:最可能失败原因是 **AI 模型进步导致价值消失(~45%)**,其次定位失败(~25%)。H2 是唯一堡垒;若 H2 无增益,应承认定位不成立并降级,而非继续加码。

---
*本文件不含任何 Researcher 核心逻辑修改方案;v0.8 方向全部为 host-plane/格式侧工件;结论保持证伪导向。*
