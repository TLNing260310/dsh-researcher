# Experiment C Protocol Draft — Synthetic Drift & Claim Invalidation

> 状态:**DRAFT — 未冻结**。继承 `evaluation-protocol-v1.1.md` 的纪律与基建,不修改 v1.1 本身(protocol、GT、scoring、prompt 均保持冻结)。
> 定位:验证 **H2(Longitudinal Cognition Maintenance)与 H3(Stale Claim Detection)的合成形态** —— Researcher 是否能在项目状态变化后,维持跨时间认知并发现"旧认知失效"(claim invalidation),而不是预测 bug。
> 硬约束(与 v1.1 相同):不修改 Researcher 核心逻辑;不添加 Agent 能力;不修改 prompt 以追求结果;不根据结果调整评分规则;失败结果全部保留;尝试证伪。

## 0. 动机

Experiment A 削弱了单快照理解假设(post-a-analysis.md F1)。但 A 的两个未被测维度正是 Researcher 机制(checkpoint 状态、claims、证据链)唯一可能显形之处:

1. **跨时间认知维护(H2)**:认知层声称的"长期正确理解"只有在**时间流逝后**才能验证。真实时间窗口(T0→T0+90–120 天)是 v0.9+ 的后续验证;本实验用合成漂移做主路径(protocol v1.1 §4.3 已预注册)。
2. **陈旧声明检测(H3)**:项目状态改变后,AI 能否发现**旧认知的哪些部分不再成立**(claim invalidation),而不是预测新 bug。

关键差异(与 Experiment A 的本质区别):A 是**单快照静态理解**;C 是**双快照对比认知** —— run-1 建立 T0 认知(run-1 capsule 即 checkpoint 导出),run-2 在 T1(注入变化的快照)上重建认知,并与 run-1 的 claim 对比。**只有 Researcher 模式有 checkpoint/claims 机制**(A 中基线 claims=0、certificate=null),因此 C 是四种模式机制不对称最明显、Researcher 最可能显形(或显形为负)的实验。

## 1. 实验问题(预注册)

> On the frozen commander.js snapshot with [n] synthetic engineering changes injected (mutation manifest), do Researcher modes (Quick/Deep) detect that pre-established project cognition no longer holds (stale-claim invalidation) and identify the injected changes, better than Plan/Standard? Measured by Mutation Recall / Stale-Claim Invalidation / Assumption Expiry, plus a consistency cross-check.

**这不是**:预测注入变化导致的 bug(具体 bug 级发现单独计数,不进主指标)。
**这是**:发现"我(或上一 session)对项目的理解中,哪些部分被这个变化推翻了"—— claim invalidation。

## 2. 实验条件

- 仓库/快照:复用冻结 snapshot(commander.js @ bf35c5f, v14.0.3)。
- 模式:Standard / Plan / Quick / Deep × 3 runs = 12 runs;每 run 由 **run-1(T0)+ run-2(T1)** 两个独立 session 组成(互不见面,run-2 不得收到 run-1 capsule —— 对比发生在 evaluator 侧,protocol v1.1 §2 盲测关键)。
- 模型/推理/预算:与 v1.1 一致(deepseek-v4-flash, reasoning max, budget 500000;D003 延续)。
- 顺序:种子化随机(`dsh-researcher-v0.6-phase-a:exp-c-runs`),独立 manifest。
- 任务模板:
  - run-1(T0):统一前缀(protocol v1.1 §3)—— 建立原始项目认知。
  - run-2(T1):统一前缀 + 附加句(protocol v1.1 §3 预注册):*"Note which parts of the project have changed compared with a previous snapshot and which previous assumptions no longer hold."*(该句只出现在 run-2,四个模式一致,冻结后不可改)。

## 3. T1 构造(Synthetic Drift,主路径)

### 3.1 注入源:复用 Experiment B 的 mutation manifest

- 同一 manifest(`evaluation/cases/commander.js/mutations/mutation-manifest.json`,6 项,机械化抽签,种子 `dsh-researcher-v0.6-phase-a:commander.js:exp-b-mutations`)。
- 从 6 项中选择注入子集:种子化抽签(独立种子 `dsh-researcher-v0.6-phase-a:commander.js:exp-c-inject`),选 **4–6 项**(protocol v1.1 §4.3:每仓库 4–6 项)。若抽中 6 项则全部注入;预注册此规则,不事后挑选。
- 注入类别覆盖(manifest 已保证):API contract change(MUT-01/02)、internal architecture change(MUT-03/04)、compatibility constraint change(MUT-05/06)。

### 3.2 注入与快照构造(evaluator 侧,机械化)

- `evaluation/runtime/build-t1-snapshot.js`(protocol v1.1 §6 预注册工件):
  1. clone T0 workspace;
  2. 按 manifest 逐项注入实际代码变更(change 的真实 diff,以 mutation 的 before/after 锚点为依据,机械化生成:重命名、改默认、迁移调用点、改消息/错误码);
  3. commit(消息为机械模板,不含注入说明);
  4. 复用 blind-snapshot 截断流程(独立 T1 盲快照,run-2 看不到注入动作、看不到 manifest)。
- **注入完整性检查(冻结前)**:注入后必须通过 3 项机械检查 —— (a) diff 与 manifest 的 before/after 一致;(b) 注入项的可发现性(变更存在于 T1 可见文件);(c) 金丝雀/截断完整性(T1 不含 T0 之后的真实历史)。
- **注入不改变**:仓库结构外的任何东西;不引入新 bug 修复;不删除 manifest 中未列的变更。

### 3.3 GT = 注入清单本身(已知真值)

- `{ mutation_id, kind, file/area, expected_cognition_impact, seeded_in }` —— 注入项即真值(protocol v1.1 §4.3)。
- expected_cognition_impact 由 evaluator 编制(基于 mutation ground_truth):"此变化使哪些 T0 认知条目失效/需修正"。编制时只使用 T0 快照 + 注入 diff,不看任何 run 输出。

## 4. 评分标准(运行前冻结;同 v1.1 纪律:不强行匹配、不确定记 ambiguous)

### 4.1 Mutation Recall

- run-2 的 PCR 呈现的注入变化 / 注入清单 total,按 kind 分列(api_contract / internal_architecture / compatibility_constraint 各自报)。
- 呈现判定:run-2 明确识别该变化(名称或机制等价,有证据);含糊提及(如"似乎有什么变了")= partial。

### 4.2 Stale-Claim Invalidation(主指标,claim 级)

- **定义**:run-1 中"被注入变化直接失效"的 claim 中,run-2 以证据明确纠正/否定的比例。
- 判定:evaluator 用 run-1 capsule(checkpoint 导出,claims.json)vs run-2 PCR 对比。对每条注入变化,确定它直接失效的 run-1 claim 集(编制 GT 时预注册:change X 使 claim Y 失效,因为机制 Z)。
- 计数:失效 claim 中被 run-2 纠正或否定(显式声明"此前的 X 不再成立,因为 Y")/ 预注册失效 claim 总数。
- **机制说明**:该指标只对 Researcher 模式有完整数据(基线 claims=0) —— 基线模式的 invalidation 无从测量(无 claim 可失效)。**此不对称本身是发现,不是缺陷**:它量化了"无持久认知结构的模式无法显式失效旧认知"。
- 基线模式的替代指标:run-2 中"与 run-1 输出矛盾且显式标注修正"的条目(用 run-1 全文 vs run-2 全文对比,不依赖 claims.json)。

### 4.3 Assumption Expiry

- run-2 显式标注"旧假设不再成立"的条目 / 注入清单中属假设过期的条目(如 MUT-01 的 storeOptionsAsProperties 抛错假设、MUT-04 的 excess 检查时机假设)。
- 与 Stale-Claim Invalidation 的区别:前者是 claim 被**特定变化**失效,后者是 run-2 主动列举**普遍过期假设**(包括未被注入变化直接命中的假设)。

### 4.4 一致性旁证(报告不遮丑)

- run-1 与 run-2 对**未变化区域**的描述是否矛盾(矛盾记负分项,进报告)。
- 检测"假阳性失效":run-2 声称失效、但实际未变区域的假设(未变区域 = diff 之外) —— 单独计数为 False Invalidation,报告不并入 Precision。

### 4.5 成本与纪律

- 每 session 的 token / duration / tool calls / claims;两 session 合计成本报 run 级。
- 运行前 lock 检查(exp-c 独立锁,含 mutation manifest + 注入子集哈希)、运行后金丝雀;任何 FAIL → 该 run 对(session 对)INVALID 丢弃(保留记录)。

## 5. 工件清单(新增,不触碰 v1.1 冻结物)

| 工件 | 路径 | 状态 |
|---|---|---|
| Mutation manifest(6 项,DRAFT) | `evaluation/cases/commander.js/mutations/mutation-manifest.json` | 已生成 |
| 注入子集选择(种子化) | 记录于 exp-c 运行 manifest | 待生成 |
| T1 快照构造脚本 | `evaluation/runtime/build-t1-snapshot.js` | 待实现(protocol v1.1 §6 预注册) |
| Drift GT(注入清单 + 失效映射) | `evaluation/cases/commander.js/mutations/drift-gt-frozen.json` | 待生成(基于注入子集) |
| 任务模板 | `evaluation/prompts/exp-c-run1.txt`、`exp-c-run2.txt` | 待生成 |
| 运行 manifest | `evaluation/runs/commander.js/exp-c/exp-c-runs-manifest.json` | 待生成 |
| Capsule 对比工具(evaluator 侧) | `evaluation/scoring/capsule-diff.js` | 待实现(protocol v1.1 §6 预注册) |
| 评分器 | `evaluation/scoring/score-exp-c.js` | 待实现 |
| exp-c 锁 | `evaluation/locks/commander.js.exp-c.protocol-draft.lock` | 待冻结 |
| 结果 | `evaluation/results/experiment-c/` | 待生成 |

**不需要新增**:Agent 工具、prompt 系统段、守卫、盲基建、eval runner —— 全部复用。

## 6. 预期与反预期(结果解读预设,防事后挑选)

- **Researcher Stale-Claim Invalidation > 基线替代指标**:支持 H2/H3("认知层能在状态变化后显式失效旧认知")。
- **Researcher 检出注入但 invalidation 低**:支持"能发现变化、不能关联到旧 claim" —— H2 部分支持,H3 不支持。
- **Researcher Mutation Recall < 基线**:探索型模式反而不如清单核对 —— H3 不支持,报告如实呈现。
- **基线模式的"矛盾修正"率 ≥ Researcher invalidation 率**:说明显式 claim 机制无增益 —— H2 不支持。
- **高 False Invalidation**:run-2 过度宣称"旧假设失效"(未变区域被误报) —— 报告如实呈现,不调整 GT。
- **任何模式 Mutation Recall = 0**:注入不可见或任务不可解 —— 报告如实呈现,不调整 GT。

## 7. 结论使用规则

Experiment C 的结论只允许写成:

> On commander.js (frozen snapshot bf35c5f), with [n] synthetic engineering changes injected across API contract / internal architecture / compatibility constraint types, Researcher [did/did not] detect the injected changes and invalidate pre-established claims better than Plan/Standard; baseline modes [had/did not have] measurable claim-invalidation (no claims mechanism). This does not generalize to real time-window drift (v0.9+) or other project types.

禁止写成:"Researcher 有长期记忆"或"Researcher 能预测漂移"(合成注入 ≠ 真实时间窗口;无跨仓库证据)。

## 8. 禁止事项(本实验)

- 禁止修改 Researcher 核心逻辑 / prompt / GT / scoring / protocol v1.1。
- 禁止人工挑选注入 mutation(注入子集种子化,预注册)。
- 禁止把"检测到 bug"当作漂移检测成绩(bug 级发现单独计数)。
- 禁止给 run-2 提供 run-1 capsule 或任何跨 session 记忆(盲测关键)。
- 禁止删除 Experiment A/B 任何记录;禁止用其结果调整本实验 GT。

## 9. 与 v1.1 §2 真实窗口漂移的关系

真实窗口漂移(T0→T0+90–120 天,Drift Recall 同构定义)是 v0.9+ 的后续验证,不阻塞本实验;本实验的 invalidation 方法论(claim 级对比、False Invalidation 计数、基线的替代指标)将直接迁移到真实窗口版本。

---
*DRAFT — 等待批准后才进入:注入子集抽签 → build-t1-snapshot 实现与注入完整性检查 → Drift GT 冻结 → Step-0 锁检查 → 运行。*
