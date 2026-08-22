# Experiment C+ Protocol Draft — Cognition-State Inheritance(状态继承实验)

> 状态:**DRAFT — 未冻结,未运行**。作者角色:Evaluation Engineer。
> 定位:验证 **H2(Longitudinal Cognition Maintenance)** —— 显式注入 cognition-state 是否比无状态重新分析更有效。这是 v0.8-alpha 验证链的裁决实验(principal-verdict 的"状态继承臂")。
> 禁止(全部遵守):不修改 researcher / research-state / cognition-state schema / export·diff 工具 / protocol v1.1 / GT。新增工件全部为 evaluator 侧脚本与冻结条件,不改任何现有文件。

---

## 0. 研究问题(预注册)

> On the frozen commander.js snapshot, given a single real engineering change (injected mutation), does an agent that receives the previous session's explicit cognition-state (Condition B) recover the affected cognition faster and more correctly than an agent re-analyzing from scratch (Condition A)? Measured by Mutation Recall, Stale Recovery (B-only), Consistency Drift, and Rebuild Cost.

**不是**:谁能列更多 diff 文件(注入对 git 历史不可见)。**是**:继承的认知状态是否帮助定位受影响认知、失效旧 claim、保持一致性、省成本。

**实验条件与 protocol v1.1 §2 的关系**:v1.1 §2 的"run-2 不得收到 run-1 capsule"是 **C(无状态漂移检测)的盲测纪律**;本实验(C+)的反向设计(run-2 收到状态)是**实验变量本身**,不冲突 —— C+ 是 v1.1 之外的独立草案,其自身的盲测纪律在 §5 定义。

---

## 1. Hypothesis

**H2(方向性,不预设成立)**:注入 cognition-state 的 run-2(B)在以下方面**不劣于**无状态 run-2(A),且在其中至少两项**显著更优**:

- B1. **Mutation Recall**:更快/更准地定位注入变化影响的认知(更快 = 更少工具调用与更早提及,更准 = 认知影响呈现而非文件名);
- B2. **Stale Recovery**(仅 B 可测):正确失效注入直接命中的旧 claim;
- B3. **Consistency Drift**:与 run-1 认知的冲突更少;
- B4. **Rebuild Cost**:更少的 billed tokens / 时长。

**零假设(H2₀)**:B 与 A 无差异(注入状态无价值),或 B 更差(状态引入噪声/锚定)。

---

## 2. Variables

### 2.1 自变量(唯一操纵):状态注入

| 条件 | run-2 启动时 | run-2 任务 |
|---|---|---|
| **A — Stateless continuation** | 无任何状态输入;从零分析 | 统一任务 + T1 附加句(见 §3.3) |
| **B — Cognition-state inheritance** | 初始注入指令:evaluator 提供 run-1 的 cognition-state(经 `research_checkpoint importState`),随后 `export:true` 读取全量 | 同一任务 + 同一附加句 + 注入指令(仅差注入段) |

**A/B 是配对条件**:同一 mutation、同一 T1 快照、同一 run-1 状态源;唯一差异 = 是否注入状态。

### 2.2 因变量(四指标,定义见 §6)

1. Mutation Recall;2. Stale Recovery(B 特有);3. Consistency Drift;4. Rebuild Cost。

### 2.3 控制变量(冻结)

| 控制 | 值 |
|---|---|
| 仓库/快照 | commander.js @ bf35c5f(v14.0.3),复用冻结快照 |
| run-1 状态源 | Experiment A 的 6 份 Researcher cognition-state 产物(`evaluation/scoring/out/cognition-state-exp-a-{deep,quick}-0{1..3}.json`,T0 认知,已存在) |
| mutation | mutation-manifest.json 6 项,种子化注入子集抽取(见 §3.2) |
| 模型/推理/预算 | deepseek-v4-flash / reasoning max / budget 500000(D003 延续) |
| harness | eval-headless 复用;read-only + never;盲 doctor 前后检查 |
| 顺序 | 种子化随机(`dsh-researcher-v0.6-phase-a:exp-cplus-runs`),独立 manifest |

---

## 3. 实验设计

### 3.1 总体结构

```
run-1(T0)          已存在:Experiment A 的 6 份 cognition-state(deep/quick × 3)
                          (不重跑;状态即 T0 认知)
    │
    ▼
T1 快照 ×6        每 mutation(M1..M6)一个 T1 = T0 + 注入该 mutation(squash 进
                  截断点,git 历史不暴露注入;golden 差异仅存在于工作区文件)
    │
    ▼
run-2 ×12         每个 T1 快照跑 A 与 B 各 1 次 = 6 mutations × 2 条件
```

### 3.2 Mutation 注入子集(机械化,禁 cherry-pick)

- 池:mutation-manifest.json 的 6 项(MUT-01..MUT-06,覆盖 API contract / internal architecture / compatibility constraint)。
- 抽取:种子 `dsh-researcher-v0.6-phase-a:commander.js:exp-cplus-inject`,从 6 项中选 **6 项全部使用**(每项一个 T1 快照)—— 无选择偏差,全部覆盖。
- 每项注入内容 = manifest 的 change 语义(机械化实现,before→after 锚点);注入后 commit 消息为机械模板;T1 按 blind-snapshot 截断流程处理。
- **注入完整性检查(冻结前)**:① diff 与 manifest 的 before/after 一致;② 注入对工作区可见(cognition-diff 能在 T1 上检出);③ 金丝雀/截断完整(T1 不含 T0 之后真实历史)。

### 3.3 run-2 任务模板(冻结,两条件仅差注入段)

- **统一前缀**:protocol v1.1 §3 统一前缀(PCR 7 节)。
- **T1 附加句**(与 v1.1 §3 C 预注册句一致):*"Note which parts of the project have changed compared with a previous snapshot and which previous assumptions no longer hold."*
- **B 条件注入指令**(冻结文本,仅 B 有):*"Before analyzing, import the previous session's cognition state: call `research_checkpoint` with `importState` set to the provided JSON, then call it again with `export: true` to read the full state. Use it as your prior understanding; verify what still holds in the current snapshot."*
- **A 条件**:无注入指令,其余同。

### 3.4 配对与状态源分配

- 12 run-2 = 6 mutations × (A, B)。
- B 条件的注入状态源:种子化分配(6 份 run-1 cognition-state ↔ 6 个 B run,一对一无重复;种子 `dsh-researcher-v0.6-phase-a:exp-cplus-state-src`)。
- 状态源与 mutation 的搭配是随机的(状态内容与注入内容无刻意关联 —— 任何 T0 认知对任何 T1 都是"旧认知")。

---

## 4. Control Group

**A(Stateless continuation)是控制组**:同一 T1 快照、同一任务,从零分析。它代表"模型原生能力 + 良好 prompt"(即 AI 模型进步的基线);B 与 A 的**配对差值**隔离认知结构的增量价值 —— 这正是"不可替代价值"的测量(principal-verdict Part 3)。

**额外对照(报告不遮丑)**:Standard/Plan 各 1 run(A 条件)作为非-Researcher 基线;仅作成本与 Recall 的参考,不进配对统计。

---

## 5. Blind Evaluation(本实验的盲测纪律)

1. **对 run-2 盲**:run-2 不知道注入内容(mutation 对 git 历史不可见;任务只问"哪些变化/哪些假设失效");A 与 B 的 run-2 都只看到 T1 工作区。
2. **对 evaluator 盲**:评估者判定时,报告按 run-id 匿名(去模式/条件标签),A/B 混排;GT 判定优先用机械真值(cognition-diff / 注入清单),人工裁决仅在机械真值不可用时介入。
3. **对 GT 盲**:GT(mutation 注入清单 + 失效映射)在任何 run-2 前冻结;评估者不看 run-2 输出编制 GT。
4. **状态源不可见**:B 的注入状态(全文)不提供给 evaluator 作判定参考之外的用途;判定只基于 run-2 输出。

---

## 6. Evaluation Metrics(定义 + 真值来源)

### 6.1 Mutation Recall(两条件均可测)

- **定义**:run-2 正确呈现注入变化的程度。
  - matched(1.0):识别注入变化 + 呈现**认知影响**("这改变了 X 的契约/机制,因此 Y 不再成立")—— 仅列文件名/diff 内容 = **unsupported**,计 0;
  - partial(0.5):识别了变化但影响链不完整;
  - miss(0):未识别。
- **真值**:注入清单本身(已知真值)。
- **配对比较**:Recall(B)vs Recall(A),按 mutation 配对。

### 6.2 Stale Recovery(B 条件特有)

- **定义**:B run-2 明确失效/修正的、被注入直接命中的 claim 数 / **cognition-diff 机械判定**的应失效 claim 数。
  - 机械真值:`cognition-diff.js`(run-1 状态 vs T1 workspace)→ stale_candidates = 应失效集合;命中 = run-2 输出中对该 claim 的失效/修正(含"不再成立/已变化/此前 X 现在 Y")。
- **A 条件**:不可测(无 run-1 状态可失效)—— **如实报告为 N/A**,并记录"A 的隐式对应物"= A run-2 独立发现的注入影响(计入 Mutation Recall,不重复计)。
- **机制不对称本身是发现**:仅 B 有 Stale Recovery 可测,量化"无持久认知结构的模式无法显式失效旧认知"。

### 6.3 Consistency Drift(两条件均可测)

- **定义**:run-2 输出中,对 **cognition-diff 判定为 unchanged 的区域**(未变化部分)与 run-1 状态冲突/矛盾的条目数 / 该区域相关输出条目数。越低越好。
- **真值**:cognition-diff 的 unchanged_claims 集合(未变区域基准)。
- 另计 **False Invalidation**:run-2 声称失效、但实际未变区域的条目(单独报告,不进主指标)。

### 6.4 Rebuild Cost(两条件均可测)

- billed tokens(input+output+reasoning,cache 单列)+ duration + tool calls + claims 数。
- **主比较**:Rebuild Cost(B)/ Rebuild Cost(A)配对比值;以及 cost-normalized = 主质量分 / 100k billed tokens(与 Exp B CNS 同构)。

### 6.5 主判据(预注册)

**H2 成立** iff 在 ≥4/6 配对中同时满足:

1. Mutation Recall(B)≥ Mutation Recall(A)(不劣);
2. Consistency Drift(B)≤ Consistency Drift(A)(不劣);
3. Stale Recovery(B)≥ 0.5(状态被实质利用);
4. Rebuild Cost(B)≤ 1.5 × Rebuild Cost(A)(成本不爆炸)。

**H2 部分成立**:质量更优但成本 >1.5× → "更准但更贵",如实报告,不视为成立。

---

## 7. Failure Criteria(预注册,删除方向写死)

| 结果 | 判定 | 动作 |
|---|---|---|
| 配对 ≥4 中 Recall(B) < A 或 Drift(B) > A | **H2 失败:状态无增量或引入噪声** | 按 principal-verdict:降级为只读分析模式;删除 research-state 图机制作为产品价值、Memory Bridge、Claim Delta、Handoff 产品化 |
| Stale Recovery < 0.5 且成本 ≥1.5× | **H2 部分失败:状态未被利用且昂贵** | 同上(降级) |
| 两条件 Recall 均 ≈0 | **实验无效(注入不可见/任务过难)** | 修注入可见性或任务(不改 GT/状态);重跑一次;再失败按 H2 失败处理 |
| cognition-diff 真值噪声 >20%(与人工判定不一致) | **工具失败** | 降级人工判定(H2 实验继续,不阻塞) |
| 任何系统性边界违规(写入/证书 DEGRADED) | run INVALID 丢弃(保留记录) | 修实验,不修 Researcher |

**双仓库纪律**:commander.js 结果的 H2 失败触发降级前,需第二仓库(cheerio)确认方向一致(principal-verdict 承认纪律)。

---

## 8. 新增工件清单(不触碰现有任何文件)

| 工件 | 路径 | 状态 |
|---|---|---|
| 本 protocol | `docs/experiment-cplus-protocol-draft.md` | 本文件(DRAFT) |
| 注入子集选择 | `evaluation/cases/commander.js/mutations/inject-selection.json`(种子 + 6 项) | 待批准后生成 |
| T1 快照构建脚本 | `evaluation/scoring/build-t1-snapshot.js`(注入 + squash + 截断;host 侧) | 待实现(v1.1 §6 预注册同族) |
| importState 载荷转换器 | `evaluation/scoring/cognition-state-to-import.js`(cognition-state.json → importState payload;**只读转换,不改 schema**) | 待实现 |
| 任务模板 | `evaluation/prompts/exp-cplus-run2.txt`(统一前缀 + T1 句 + [B 注入段]) | 待生成 |
| 运行 manifest | `evaluation/runs/commander.js/exp-cplus/exp-cplus-runs-manifest.json` | 待生成 |
| 评分器 | `evaluation/scoring/score-exp-cplus.js`(四指标 + 配对统计) | 待实现 |
| exp-cplus 锁 | `evaluation/locks/commander.js.exp-cplus.protocol-draft.lock`(protocol + inject + 任务 + 状态源哈希) | 待冻结 |
| 结果 | `evaluation/results/experiment-cplus/` | 待生成 |

**不需要新增**:agent 工具、prompt 系统段、守卫、盲基建、eval runner、cognition-state schema、export/diff 工具 —— 全部复用。

---

## 9. 预期与反预期(防事后挑选)

- **B 全面优于 A**:支持 H2(状态继承有真实价值)→ 认知层跨会话价值成立,推进 v0.9。
- **B ≈ A**:H2 未获支持 → 状态是仪式,模型原生能力已覆盖。
- **B 的 Recall 高但 Drift 高**:状态引入锚定(旧认知污染新判断)→ 部分失败,报告如实。
- **B 成本高无质量增益**:与 Experiment A 的 Deep 教训同构(成本空转)→ 支持"状态维护不划算"。
- **任何条件 Recall≈0**:任务不可解或注入不可见 → 修实验,不调 GT。

---

## 10. 结论使用规则

Experiment C+ 的结论只允许写成:

> On commander.js (frozen snapshot bf35c5f), with [n] injected mutations across API contract / internal architecture / compatibility constraint types, explicit cognition-state inheritance [did/did not] outperform stateless re-analysis on Mutation Recall / Consistency Drift / Rebuild Cost, with Stale Recovery [x/y]; the stateful-stateless delta isolates the cognition-structure increment from raw model capability. This does not generalize to other project types or real time-window drift.

禁止写成:"Researcher 有长期记忆"或"认知层已被证明"(合成注入 ≠ 真实时间窗口;单仓库无普适性)。

---

*DRAFT — 等待批准后:生成注入子集与 T1 快照 → 冻结任务与锁 → Step-0 检查 → 运行 12 run-2 → 评分 → 报告。本实验不修改任何 Researcher 侧文件。*
