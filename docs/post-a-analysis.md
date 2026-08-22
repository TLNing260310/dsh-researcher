# Post-A Analysis — What Experiment A Did and Did Not Measure

> 作者角色:Evaluation Architect。本文件只做分析与解释,**禁止**包含任何修改 Researcher / prompt / GT / scoring / protocol 的方案。所有改进方向仅作为"未测维度"记录,供后续实验设计使用。
> 输入:Experiment A 全部产物(12 runs、raw-results.json、score-report.json、analysis-report.md、limitations.md、adjudication-exp-a.json、core-gt-v0.1.json、coverage-map.json)。

## 0. 结论先行

Experiment A 回答了一个**窄问题**:在 commander.js 冻结快照上,四种模式对**预注册认知结构(25 条目 GT)**的恢复准确度。它测的是"单次、静态、无变更上下文的理解"——即 **Single Snapshot Understanding**。该假设已被削弱(Deep 0.629 < Quick 0.669 < Standard 0.702 < Plan 0.717)。

但 Experiment A **没有**测试 Researcher 宣称价值的另外三个维度:修改影响理解、跨时间认知维护、陈旧声明检测。这些正是 H1/H2/H3 与 Experiment B/C 的目标:

- **H1 — Change Impact Understanding**:Researcher 是否提升修改影响理解(→ Experiment B);
- **H2 — Longitudinal Cognition Maintenance**:Researcher 是否提升跨时间认知维护(→ Experiment C);
- **H3 — Stale Claim Detection**:Researcher 是否提升陈旧声明检测(→ Experiment C)。

三个假设均**不预设成立**,由对应实验证伪或支持。

## 1. Finding(带证据)

### F1. 单快照理解上,Researcher 深度模式没有超越基线 —— 反预期成立且被超过

| 模式 | GUS 均值 | min–max | billed tokens(均值 k) | 时长(均值 min) | Risk coverage |
|---|---|---|---|---|---|
| Standard | 0.702 | 0.679–0.721 | 145 | 1.8 | 1/1 |
| Plan | **0.717** | 0.679–0.750 | 183 | 2.8 | 1/1 |
| Quick | 0.669 | 0.636–0.693 | 177 | 3.0 | 1/1 |
| Deep | 0.629 | 0.516–0.707 | 327 | 7.5 | 1/1 |

- 预注册反预期("Deep ≈ Quick ⇒ 长推理不增加理解")被**超过**:Deep 比 Quick 更差(GUS -0.040),成本却是 Quick 的 1.85×(tokens)。
- Deep 是唯一方差超过 0.19 的模式(0.516–0.707);deep-03 的 0.516 是全场最低,其 final_text 仅 751 字符(全场最短之一)。

### F2. Plan 胜出的具体位置:约束识别与架构关系,而非设计意图

分桶均值(credits):

| 桶 | Plan | Standard | Quick | Deep |
|---|---|---|---|---|
| design_purpose(2 credits) | 1.000 | 1.000 | 1.000 | 0.917 |
| key_constraints(7 credits) | **0.905** | 0.881 | 0.786 | 0.714 |
| architecture_relation(14 credits) | **0.714** | 0.690 | 0.655 | 0.643 |

- design_purpose 全部饱和 → 该桶在**此任务难度**下无区分度(天花板效应,见 F3)。
- 区分集中在约束与架构;Plan 在两者均第一,Deep 均垫底。

### F3. 无区分度的指标:factual bucket 与 Risk

- **factual_accuracy:全部 0/0**。GT 预注册时 factual 桶为空(0 条目,0 credits)。该桶未参与任何评分 —— GUS 实际由 23 credits(arch 14 + design 2 + constraints 7)构成,权重重分配(40/25/20/15 → 有效 60.9%/8.7%/30.4%/0%)。**GUS 不是四类均衡指标,而是 arch+constraint 两类的加权。** 这解释并限制了 GUS 的解释面。
- **Risk:12/12 全部命中唯一预注册风险区(GT-C33 ESM 枚举风险),全部 partial 或 matched**。单风险区无区分度;Risk 维度在此任务"测了但没分开"。
- 模式间"报告完整性"无差异:12/12 完成 7 段 PCR,0 写入,证书 SAFE。

### F4. Researcher 机制证据:checkpoint/claims 行为与 GUS 无正相关

- Deep 模式 claims 数:11/4/7(deep-01/02/03);Quick 均 1。但 claims 最多的 deep-01(11 claims,GUS 0.707)与 claims 最少的 deep-03(7 claims,GUS 0.516)同模式不同成绩 —— claims 数量不解释 GUS。
- Deep 平均 91 tool calls(87–105)vs Standard 33(25–38)。Deep 的子代理/网络探索(web_search 9–14 次、subagent 1–3 次)是成本主要来源,但探索内容(外部 CVE、typosquat、v15 发布)落在 GT 表面之外。
- 基线模式零 checkpoint 机制(claims=0、certificate=null)——"证据纪律"只存在于 Researcher 侧,但 Experiment A 的评分不奖励它。**证据纪律是未测维度(F5)。**

### F5. 未被 Experiment A 测试的 Researcher 特性(清单,非修改方案)

1. **证据纪律 / 可审计性**:claims、source-tagging、checkpoint 状态机的价值(审计、追溯、跨会话一致性)完全未测。
2. **跨时间认知维护(H2)**:本实验单快照、单 session;checkpoint 跨会话继承能力(Project Intelligence Capsule)未测。
3. **修改影响理解(H1)**:Experiment A 的 PCR §6(Change Impact)被当成"类级 blast radius"打分,没有真实变更请求,也没有 Impact GT 对比。
4. **陈旧声明检测(H3)**:无 T0/T1 对比,无 claim invalidation 测试。
5. **多会话/团队协作形态**:多 Researcher 实例共享认知层的场景未测。
6. **不同项目类型**:commander.js 是"高约束、管线中心"型;业务决策重 / 安全边界重 / 数据模型重的仓库未测。
7. **模型变量**:全部 run 使用 deepseek-v4-flash(D003);更强的推理模型下深度模式的相对表现未知。

## 2. Evidence(数据来源)

- GUS 均值/分桶:score-report.json(summary.gus_means、per_mode.*.gus.*)与 raw-results.json 逐 run gus_parts(credit/total 每桶)。
- 成本:score-report.json per_mode.billed_k/duration_min;raw-results.json metrics.tokens_*。
- 工具分布:raw-results.json metrics.tool_breakdown(Deep 的 web_search/subagent/list_agents 高频)。
- claims:raw-results.json metrics.claims;certificate_overall(Researcher runs "SAFE",基线 null)。
- GT 构成:core-gt-v0.1.json(25 entries;factual 0 条目、0 credits)+ coverage-map.json(max_total_credit 23;arch 14、design 2、constraints 7)。
- 裁决:adjudication-exp-a.json(300 judgments,matched/partial/unmatched,无强制匹配)。
- 反预期:experiment-note.md §预期与反预期("Deep ≈ Quick ⇒ 长推理未带来额外理解——同样是重要结果")。

## 3. Interpretation(为什么 Plan 赢、Deep 输)

### 3.1 Plan 为什么胜出(本实验语境)

- **任务与 Plan 模式的形态匹配**:GT 是"清单式认知单元"(25 条、逐条可核对)。Plan 模式的规划纪律(决策完备枚举、结构输出)恰好匹配清单核对任务:plan-01 达 19/25 matched,其输出是最接近"逐条覆盖"的报告。
- **Plan 的成本优势即信息优势**:Plan 用 183k tokens(仅为 Deep 的 56%)就覆盖了约束/架构的主要单元;多余探索在 GT 上是负边际收益。
- **Plan 的"结构性"不是 Researcher 特有**:本实验的 PCR 结构约束(7 段模板)对四个模式统一施加;Plan 在统一模板内用规划纪律取胜,不涉及 checkpoint/证据机制。

### 3.2 Deep 为什么失败(本实验语境)

- **探索方向与 GT 表面错位**:Deep 的高成本来自 web_search/subagent 的外部探索(CVE、生态、未来版本),而 GT 全部是快照内 file:line 锚定的认知单元。探索广度买不到"对预注册单元的覆盖"。
- **交付物稀释**:deep-01/03 的 final message 短(1708/751 chars),认知被推到中间消息/子代理报告;评分基于全链(已计入),但结构化的 7 段 PCR 被稀释 → 部分 GT 单元(如 C08/C12/C15)在 Deep 中连续 unmatched。
- **一致性差**:Deep 的 0.516–0.707 方差显示深度推理在该任务上是"高方差投注":偶尔最好(deep-01 0.707 与 plan-01 并列),经常更差。长管线放大了单次采样运气。
- **不要过度解释**:这不是"深度推理无用"的一般结论 —— 是"深度推理在清单核对型单快照任务上,相对其 2–4 倍成本,无收益"的**本实验内**结论。

### 3.3 反预期结构的意义

预注册反预期假设的是"Deep ≈ Quick"(深度无增量)。观察到的是"Deep < Quick"(深度有**负**增量)。两种读法:(a) 深度推理在该任务上有主动伤害(探索稀释交付物);(b) n=3 采样噪声把 0 增量显示成负增量。区分两者需要更多 run 或不同任务 —— 这是 Experiment B/C 可检验的(影响分析与漂移检测是"深度推理可能有收益"的任务类型)。

## 4. Threats(解释边界)

1. **单快照、单仓库、单任务形态**(limitations.md #1–2):commander.js 是 Researcher 有利基线;清单核对型任务可能系统性不利于"探索型"模式。GUS 排序可能随任务形态翻转。
2. **n=3,模型随机性**(limitations.md #4):Plan/Standard/Quick 均值差 ≤0.048,在采样误差范围内;只有 Deep vs 其余(差 ≥0.073)与 Plan vs Quick(0.048)的方向有一定稳健性,但**任何"排序"都不应被当作统计事实**。
3. **GT 加权结构**:factual 空桶使 GUS 有效权重偏离注册值(40/25/20/15 → 60.9/8.7/30.4/0)。GUS 比较应读作"架构+约束理解"的比较。
4. **单评估者裁决(D001)**(limitations.md #5):300 条裁决由一人执行;双人裁决是公共阶段要求。
5. **GT 编制主观性**(limitations.md #3):25 条核心 GT 是双 evaluator 的产物,但条目选择与措辞仍是人类判断。
6. **盲测边界**:GT 在任何 scored run 前冻结;非评分 pilot 早于 GT 编译且 evaluator 不可达(manifest evaluation_integrity)。
7. **运行顺序**:种子化随机序(protocol 合规),时间趋势污染已按设计控制,但模式间相邻 run 的相互影响(如果有)未被单独检验。
8. **结论范围**:本分析只允许声称"在 commander.js 快照、deepseek-v4-flash、清单核对任务上,单快照理解的 GUS 顺序为 Plan ≥ Standard ≥ Quick ≥ Deep"—— 不得外推至"Researcher 不如 Plan"或"深度推理无用"。

## 5. 对下一阶段的意义(仅设计输入,非修改方案)

- Experiment A 证明了:**"更好的单快照理解"不是 Project Cognition Layer 的可辩护价值主张**(该假设被削弱)。
- 因此 H1(Change Impact Understanding)/ H2(Longitudinal Cognition Maintenance)/ H3(Stale Claim Detection)成为价值验证的重点 —— 这些是 Researcher 的机制性特性(checkpoint、claims、证据链、状态恢复)唯一可能产生差异的场景。
- Experiment B 必须避免 Experiment A 的三个陷阱:(1) 任务形态与"清单核对"同构 → 用传播链任务(非枚举任务);(2) 探索型模式的成本空转 → Impact 评分锚定链路正确性而非文件数量;(3) 无区分度桶 → 移除/降权无区分维度(factual 空桶教训),Critical Edge 做硬性权重。
- Experiment C 必须利用 Experiment A 未测的特性:claim 级对比(run-1 capsule vs run-2 PCR)、显式"旧假设不再成立"标注 —— 这些只能由 Researcher 的 checkpoint 机制承载,基线模式没有对应物(claims=0、certificate=null),因此 C 是 Researcher 机制最可能显形之处。

---
*结束。本文件不含任何修改 Researcher / prompt / GT / scoring / protocol 的方案。*
