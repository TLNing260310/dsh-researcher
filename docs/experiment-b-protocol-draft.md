# Experiment B Protocol Draft — Change Impact Cognition

> 状态:**DRAFT — 未冻结**。本文件是 Experiment A 之后的新增协议草案,继承 `evaluation-protocol-v1.1.md` 的纪律与基建,但不修改 v1.1 本身(protocol、GT、scoring、prompt 均保持冻结)。
> 定位:验证 **H1 — Researcher 是否提升 Change Impact Understanding**(change → dependency → behavior → contract 传播链理解)。
> 硬约束(与 v1.1 相同):不修改 Researcher 核心逻辑;不添加 Agent 能力;不修改 prompt 以追求结果;不根据结果调整评分规则;失败结果全部保留;尝试证伪。

## 0. 动机(为什么在 Experiment A 之后做 B)

Experiment A(post-a-analysis.md F1)削弱了 Single Snapshot Understanding:在清单核对型任务上,Plan ≥ Standard ≥ Quick ≥ Deep。但 A 的 PCR §6(Change Impact Analysis)没有真实变更请求、没有 Impact GT,因此"修改影响理解"从未被测量。B 验证 **H1(Change Impact Understanding)**:影响分析需要"链路推理"(A 改 → B 依赖 → C 行为 → D 契约),而链路推理是深度探索模式(Researcher)可能相对基线有优势的维度 —— 也可能没有。B 就是来检验的,不预设成立。

## 1. 实验问题(预注册)

> On the frozen commander.js snapshot, do Researcher modes (Quick/Deep) recover the pre-registered impact chain of a proposed engineering change (change → dependency → behavior → contract) better than Plan/Standard, at comparable cost? Measured by Impact Recall / Impact Precision / Critical Edge Detection / Cost-Normalized Score, chain-correctness weighted, file-count NOT scored.

**这不是**:谁列出更多受影响文件(dependency grep)。
**这是**:谁理解"改 X 会经过 Y 到达 Z"的传播关系,并识别出最高危的传播边。

## 2. 实验条件

- 仓库/快照:**当前冻结 snapshot 复用**(commander.js @ bf35c5f, v14.0.3)——与 Experiment A 同一快照,零新增仓库选择。
- 模式:Standard / Plan / Quick / Deep × 3 runs = 12 runs(与 A 同构,沿用 eval-headless runner、read-only + never、blind-doctor 前后检查、金丝雀)。
- 模型/推理/预算:与 v1.1 一致(deepseek-v4-flash, reasoning max, budget 500000;D003 延续)。
- 顺序:种子化随机(`dsh-researcher-v0.6-phase-a:exp-b-runs`),独立 manifest。
- 任务模板:统一前缀(protocol v1.1 §3)+ 变更请求。变更请求 = mutation manifest 中**选中的 mutation 的 change_summary**(冻结版),每 run 一个变更请求(4 模式 × 3 runs,每个 mutation 至少被 3 个 run 使用,分配方式见 §4.2)。
- 附加约束(沿用 v1.1):"Do not implement" —— 只分析,不实现。

## 3. Mutation Manifest(机械化,禁 cherry-pick)

- 生成:`fixtures/blind/mutation-selector.js`,种子 `dsh-researcher-v0.6-phase-a:commander.js:exp-b-mutations`,每类 2 项,从快照派生池机械抽取。
- 产物:`evaluation/cases/commander.js/mutations/mutation-manifest.json`(DRAFT,6 项)。
- 三类覆盖(用户要求至少含):
  1. **API contract change**:MUT-01(restoreStateBeforeParse 重复 parse 契约)、MUT-02(configureHelp 合并语义)。
  2. **internal architecture change**:MUT-03(_executeSubCommand 模块抽取 + 扩展探测顺序)、MUT-04(_excessArguments 检查时机迁移)。
  3. **compatibility constraint change**:MUT-05(新错误码 commander.invalidArgumentValue)、MUT-06(missingMandatoryOptionValue 消息组合;错误码保持稳定 —— 故意设为"最小风险"型,区分"契约意识"与"消息意识")。
- 每项 mutation 结构:`change_summary`(run 可见的变更请求)/ `before`(当前行为 + 锚点)/ `after`(变更后行为 + 锚点)/ `ground_truth`(impact_chain:component/kind/evidence + critical_edges + gt_status DRAFT)。
- **GT 状态**:impact_chain 与 critical_edges 目前是 DRAFT(由本架构师基于快照静态分析编制)。正式运行前必须:双 evaluator 独立校准(protocol v1.1 §4.2 流程)→ 冻结 → sha256 锁。**未冻结前不运行任何 scored run。**
- 禁止:人工增删 mutation 以偏向任何模式;禁止在抽签后更换候选。

## 4. 运行设计

### 4.1 盲测

- 所有 mutation 的注入动作(Experiment C 才注入)对 B 不可见 —— B 只给 change_summary(拟议变更的文本描述),不给 diff。这模拟"维护者提出变更时,AI 需要预判影响面"的真实场景。
- 快照保持冻结原样;golden 变更链由 evaluator 在独立 clone 上静态分析得出,不依赖 run 输出。

### 4.2 Mutation 分配

- 6 mutations × 12 runs 的分配由种子化抽签决定(与 runs manifest 同批生成,预注册),保证:
  - 每个 mutation 至少被 2 个模式使用;
  - 无模式偏向任何单一 mutation(每模式覆盖 ≥3 个不同 mutation)。
- 记录于 exp-b-runs-manifest.json(含每 run 的 mutation_id)。

## 5. 评分标准(运行前冻结;与 v1.1 §5 同纪律:不强行匹配、不确定记 ambiguous)

### 5.1 主指标:链式 Impact 评分(防 dependency grep)

- 以 mutation 的 ground_truth.impact_chain 为基准(每条 = { component, kind: direct|transitive|tests|docs|api|config, evidence })。
- **Impact Recall** = 命中的链边 / 总链边,按 kind 分列(direct/transitive/tests/docs/api/config 各自报)。
- **命中判定(关键,防文件列举)**:run 必须展示**传播关系** —— "改 X 会经过 Y 到达 Z"(mention 组件名 + 因果链或机制)。仅提及文件名/组件名 = **unsupported**,计入 Precision 分母,不计 Recall。
- 证据要求:命中项须有可指向快照的锚(读过的文件、引用的行、机制描述);外部断言(CVE、生态)仍按 C3 封顶。

### 5.2 Impact Precision

- Precision = 真实命中(有证据链)的声称组件 / run 声称受影响组件总数。
- 声称 = run 在 Change Impact 段列出的受影响组件(去重);真实 = evaluator 判定传播链成立。

### 5.3 Critical Edge Detection(30% 权重,防"全覆盖低风险边")

- 每个 mutation 预注册 top-3 critical_edges(ground_truth.critical_edges)。
- 记分:run 识别出 ≥2 个 critical edge(与 GT 意图一致)→ 1.0;1 个 → 0.5;0 个 → 0.0。
- **Critical Edge 占总 Impact 分 30%**,Recall/Precision 共占 70%(各 35%)。总 Impact Score = 0.35×Recall + 0.35×Precision + 0.30×CriticalEdge。
- 理由:防止"低风险边全覆盖"的分数虚高(protocol v1.1 §5.3 同构,此处正式化权重)。

### 5.4 Cost-Normalized Score(正式指标,防"成本空转")

Experiment A 的核心教训是成本与收益分离(Deep 以 2.3× tokens / 4.2× 时长取得最低 GUS)。因此 B 把成本归一化升格为**正式指标**,而非附注:

- **Cost-Normalized Score(CNS)= 总 Impact Score / billed tokens(单位:每 100k billed tokens 的 Impact Score)**。
- billed tokens = input + output + reasoning(cache reads 单列,与 v1.1 §5.5 一致)。
- CNS 的解读:**同一 Impact Score 下成本更低的模式 CNS 更高**;它回答"每单位成本买到了多少正确的链路理解",是价值边界判断的主视角之一。
- 报告:mean + range;与原始 Impact Score 并排报告(两者缺一不可 —— 原始分回答"上限",CNS 回答"效率")。
- 防误导规则:若某模式 Impact Score 与基线差距 ≤0.05(采样误差带)而成本 ≥1.5×,则 CNS 判定为"成本劣势无收益补偿",如实报告,不调整任何分数。

### 5.5 附项(报告不遮丑)

- **Decision Quality**:run 是否区分"直接破坏 / 需重测 / 文档契约"三级,且分级与 GT 一致(partial 档)。
- **链路正确性负例**:run 声称的传播链中,方向错误(说 A 依赖 B,实际 B 依赖 A)或机制错误(说经过 parseOptions,实际不经过)的条目 —— 单独计数并报告(不并入 Precision,单独列"Chain Errors")。
- **越界检查**:任何"实现建议"(写了代码方案)按协议记违规;bug 级预测单独计数,不进 Impact 分。

### 5.6 成本与纪律

- token / duration / tool calls / claims 数(同 v1.1 §5.5);CNS 计算用 §5.4 定义。
- 运行前 lock 检查(exp-b 独立锁,含 mutation manifest 哈希)、运行后金丝雀;任何 FAIL → run INVALID 丢弃(保留记录)。

## 6. 工件清单(新增,不触碰 v1.1 冻结物)

| 工件 | 路径 | 状态 |
|---|---|---|
| Mutation 选择脚本 | `fixtures/blind/mutation-selector.js` | 已生成 |
| Mutation manifest(6 项,DRAFT) | `evaluation/cases/commander.js/mutations/mutation-manifest.json` | 已生成,待双 evaluator 校准冻结 |
| Impact GT(校准后) | `evaluation/cases/commander.js/mutations/impact-gt-frozen.json` | 待生成 |
| 任务模板 | `evaluation/prompts/exp-b-pcr.txt`(统一前缀 + 变更请求占位) | 待生成 |
| 运行 manifest | `evaluation/runs/commander.js/exp-b/exp-b-runs-manifest.json` | 待生成 |
| 评分器 | `evaluation/scoring/score-exp-b.js`(链式 Recall/Precision + Critical Edge 30% + CNS 成本归一化) | 待实现 |
| exp-b 锁 | `evaluation/locks/commander.js.exp-b.protocol-draft.lock` | 待冻结 |
| 结果 | `evaluation/results/experiment-b/` | 待生成 |

**不需要新增**:Agent 工具、prompt 系统段、守卫、盲基建、eval runner —— 全部复用。

## 7. 预期与反预期(结果解读预设,防事后挑选)

- **Researcher(Quick/Deep)Impact Score > Plan/Standard**:支持 H1("深度探索模式更适合链路推理")。
- **Researcher ≈ 基线**:H1 未获支持 —— 影响分析不依赖深度探索,报告如实呈现。
- **Deep 成本高但 Critical Edge 好**:部分支持 —— 深度买了"高危边识别",但链路覆盖无增益。
- **CNS 反超**:某模式原始 Impact Score 略低但 CNS 显著更高(成本低一个量级)—— 价值边界在效率侧,报告如实呈现。
- **CNS 全面落后**:成本劣势无收益补偿 —— 与 Experiment A 同构,支持"深度探索在影响分析上同样不划算"。
- **所有模式 Precision 低、Chain Errors 高**:任务过难或 GT 错位 —— 报告如实呈现,不调整 GT。
- **任何模式 Critical Edge = 0**:critical_edges 预注册过严或任务不可解 —— 报告如实呈现。

## 8. 结论使用规则

Experiment B 的结论只允许写成:

> On commander.js (frozen snapshot bf35c5f), for [n] proposed engineering changes across API contract / internal architecture / compatibility constraint types, Researcher [did/did not] recover the pre-registered impact chains better than Plan/Standard, at [X] tokens; Critical Edge detection [did/did not] differentiate. This does not generalize to other project types.

禁止写成:"Researcher 更懂修改影响"(无跨仓库/跨变更类型证据)。

## 9. 禁止事项(本实验)

- 禁止修改 Researcher 核心逻辑 / prompt / GT / scoring / protocol v1.1。
- 禁止人工挑选"对 Researcher 有利"的 mutation(选择已机械化,种子记录在案)。
- 禁止把文件数量、diff 行数、调用图广度作为评分。
- 禁止删除 Experiment A 任何记录;禁止用 Experiment A 结果调整本实验 GT。

---
*DRAFT — 等待批准后才进入:双 evaluator Impact GT 校准 → 冻结 → Step-0 锁检查 → 运行。*
