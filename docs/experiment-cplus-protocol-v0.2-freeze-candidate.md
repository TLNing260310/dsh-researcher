# Experiment C+ Protocol v0.2 — Freeze Candidate

> 状态:**FREEZE CANDIDATE — 冻结审批后不再修改**。作者:Evaluation Engineer。
> 修订依据:`docs/experiment-cplus-principal-review-v0.2.md`(Principal Review v0.2)—— **仅吸收必须修改项**(G1–G7 gate、import/export integrity validation、state source variance logging、结论边界);**未新增实验条件、未新增指标、未扩展研究问题、未修改架构目标**。
> 继承:`docs/experiment-cplus-protocol-draft.md`(v0.1)的全部设计与 §6 指标定义、§7 失败标准。
> 禁止(全部遵守):不修改 researcher / research-state / cognition-state schema / export·diff 工具 / protocol v1.1 / GT;不新增 agent tool;不实现 memory。

---

## 0. 变更摘要(相对 v0.1 draft,仅此六项)

| # | 变更 | 来源 | 类型 |
|---|---|---|---|
| 1 | 加入 **§8 Execution Gate G1–G7** | Review §5 | 新增(必须) |
| 2 | 加入 **§8.1 import/export integrity validation**(G2 细化) | Review §2 H2/H3 | 新增(必须) |
| 3 | 加入 **§8.2 state source variance logging**(G3 细化) | Review §2 H1/H4 | 新增(必须) |
| 4 | **结论边界固定**:C+ 验证 cognition-state inheritance **total effect**(指令 + 状态内容),**不验证全部 Projection Layer 价值**;invalidation_condition 的价值不在本实验范围 | Review §1.2/§4.2 | 声明(必须) |
| 5 | Stale Recovery 报告分母构成 + 部分变化恢复率(次级,非新指标) | Review §3.2 | 报告义务 |
| 6 | Over-Invalidation 计数(报告级,非主指标) | Review §3.5 | 报告义务 |

**明确不采纳**(禁止项):第三条件 C(context injection 对照)、Over-Invalidation 进主判据、任何新指标、任何新研究问题。

---

## 1. 研究问题(不变)

> On the frozen commander.js snapshot, given a single real engineering change (injected mutation), does an agent that receives the previous session's explicit cognition-state (Condition B) recover the affected cognition faster and more correctly than an agent re-analyzing from scratch (Condition A)?

**结论边界(固定,§0-4)**:本实验验证 **cognition-state inheritance 的 total effect**(B 条件 = 注入指令 + 状态内容,不可分离)。**本实验不验证**:inheritance 机制相对"纯上下文注入"的净效应(需第三条件,不在范围);Projection Layer 的 invalidation_condition 价值(claims 无此字段,需后续单独验证)。任何报告不得越此边界。

---

## 2. Hypothesis(不变)

H2:注入 cognition-state 的 run-2(B)在 ≥4/6 配对中同时满足:Recall(B)≥A、Drift(B)≤A、Stale Recovery ≥0.5、成本 ≤1.5×A。零假设:B ≈ A 或更差。

---

## 3. Variables(不变,补记录义务)

自变量:状态注入(A: stateless / B: importState + export:true)。因变量:四指标(§6)。控制变量:快照/模型/顺序/mutation。

**新增记录义务(Review §2)**:每 B run 记录:注入状态源、claims 数、应失效集合大小、dirty 处置(置空注入,payload 生成时 dirty=[])、importState/export:true 调用成功与否。

---

## 4. 实验设计(不变)

6 mutations(MUT-01..06,全部使用,零选择偏差)× (A, B)= 12 run-2。run-1 = Experiment A 的 6 份 Researcher 会话(状态源,已冻结)。T1 快照 = T0 + 注入 mutation(squash 进截断点)。状态源分配 = 种子化(已生成,见 §10)。

---

## 5. Blind Evaluation(不变)

对 run-2 盲注入内容;对 evaluator 盲条件标签;GT 先冻结。**补充(Review §1.2)**:由于 B 条件任务文本含注入指令,评估者必须知晓 —— "盲"指评估者不知道 mutation 内容与配对映射,而非不知道条件。

---

## 6. Evaluation Metrics(不变,补报告义务)

- **Mutation Recall**:matched 1.0 / partial 0.5 / miss 0;认知影响呈现要求;仅文件名 = unsupported。
- **Stale Recovery**(B 特有):失效命中 / cognition-diff 应失效集合。**报告义务(Review §3.2)**:报告分母构成(全 stale / 部分变化 / unverifiable 各自数量)+ 部分变化 claim 中被正确失效的比例(次级,非主指标)。
- **Consistency Drift**:unchanged 区域冲突率;False Invalidation 单列。**报告义务(Review §3.5)**:Over-Invalidation = 被 B 失效但 diff 判定 unchanged 的 claim 数,并列报告(非主指标)。
- **Rebuild Cost**:billed tokens/duration/tools;cost-normalized。

---

## 7. Failure Criteria(不变)

H2 失败 → 降级(principal-verdict 触发);Recall≈0 → 修注入重跑;diff 噪声 >20% → 人工判定;双仓库确认后最终降级。

---

## 8. Execution Gate(新增,冻结前全部满足)

| # | Gate | 验证 | 状态 |
|---|---|---|---|
| **G1** | 转换器 round-trip 保真 | `cognition-state-to-import.js`;--from-log vs --from-state 的 claims 数/statement 一致 | ✅ **PASS**(deep-01: 32/32, statementMismatch=0) |
| **G2** | import/export integrity validation(见 §8.1) | run 后会话日志检查 | 待运行期 |
| **G3** | state source variance logging(见 §8.2) | manifest 每 run 记录 | ✅ 已生成(claims 10–36) |
| **G4** | 第三条件决策:不加 C;结论限定 total effect | 本文件 §0/§1 | ✅ 已声明 |
| **G5** | 既有工具零修改 + LOCK OK | git diff + eval-lock --check | 待冻结时验证 |
| **G6** | 全量冻结(protocol/inject/任务/manifest/状态源/锁) | sha256 锁 | 本文件提交时 |
| **G7** | Step-0 盲 doctor + 金丝雀 | blind-doctor | 运行前 |

### 8.1 import/export integrity validation(新增,Review §2 H2/H3)

每个 B run 运行后,从该 run 的 `session.events.json` 机械检查:

1. **存在成功的 `research_checkpoint` importState 调用**(参数含 `schemaVersion: 1` 且 `claims` 数组非空);
2. **存在后续 `export: true` 调用**(或等效的全量读取路径);
3. 两者调用顺序在任务要求的时序内(import 先于 export)。

**判定**:任一缺失 → 该 run 标记 `INJECT-INTEGRITY-FAIL`;**不进主配对统计**,单独报告(防"名义 B 实际 A"污染)。若 ≥3/6 B runs 失败 → 注入链路不可用,实验停,修链路(不改 Researcher),重跑。

### 8.2 state source variance logging(新增,Review §2 H1/H4)

每 B run 在运行 manifest 中记录:

- `state_source`:状态源 run id(deep-01/02/03, quick-01/02/03);
- `state_claims`:注入 claims 数(10–36,异质 3.6× 已知);
- `expected_stale_set_size`:cognition-diff 对该 (状态源, mutation) 对判定的应失效集合大小(运行前预计算,冻结);
- `dirty_handling`:`payload dirty=[]`(置空注入,写死)。

**分析义务**:配对比较按 `expected_stale_set_size` 分层报告;若某 mutation 的应失效集合为 0(注入不影响任何锚定 claim),该配对在 Stale Recovery 上记为 N/A 并披露。

---

## 9. 新增/冻结工件清单(v0.2)

| 工件 | 路径 | 状态 |
|---|---|---|
| 本 protocol | `docs/experiment-cplus-protocol-v0.2-freeze-candidate.md` | 本文件 |
| 转换器 | `evaluation/scoring/cognition-state-to-import.js` | ✅ 已实现(G1 PASS) |
| 注入选择 | `evaluation/cases/commander.js/mutations/inject-selection.json` | ✅ 已生成(6/6) |
| 状态 payload(6,from-log 全保真) | `evaluation/scoring/out/payload-exp-a-*.json` | ✅ 已生成 |
| 任务模板 A | `evaluation/cases/commander.js/exp-cplus-tasks/exp-cplus-run2-A.txt` | ✅ 已生成 |
| 任务模板 B(基准,无 payload) | `evaluation/cases/commander.js/exp-cplus-tasks/exp-cplus-run2-B.txt` | ✅ 已生成 |
| 任务文件 B×6(payload 内嵌,冻结) | `evaluation/cases/commander.js/exp-cplus-tasks/exp-cplus-mut0X-b.txt` | ✅ 已生成 |
| 运行 manifest(12 runs,种子化) | `evaluation/runs/commander.js/exp-cplus/exp-cplus-runs-manifest.json` | ✅ 已生成 |
| exp-cplus 锁 | `evaluation/locks/commander.js.exp-cplus.protocol-v0.2.lock` | 待冻结 |

**T1 快照构建(6 个注入副本)**:执行前由 host 脚本生成(注入 + squash + 截断),复用 mutation manifest 的 before/after 锚点;生成后 sha256 记录进锁。

---

## 10. 冻结的种子化分配(已生成,不可改)

- 运行顺序:种子 `dsh-researcher-v0.6-phase-a:exp-cplus-runs`,Fisher-Yates,12 runs。
- 状态源分配:同种子流内二次 shuffle(MUT ↔ 状态源):
  - MUT-01 ← quick-01;MUT-02 ← quick-02;MUT-03 ← deep-02;MUT-04 ← deep-01;MUT-05 ← quick-03;MUT-06 ← deep-03。

---

## 11. 结论使用规则(边界固定)

> On commander.js (bf35c5f), with 6 injected mutations across API contract / internal architecture / compatibility constraint types, explicit cognition-state inheritance (injection instruction + state content, total effect) [did/did not] outperform stateless re-analysis on Mutation Recall / Consistency Drift / Rebuild Cost, with Stale Recovery [x/y] and [n] integrity-failed runs excluded. **This validates the total effect of cognition-state inheritance; it does not validate the mechanism net of context injection, and it does not validate the Projection Layer's invalidation-condition value.**

禁止写成:机制净效应已证明、Projection Layer 全部价值已验证、Researcher 有长期记忆。

---

*FREEZE CANDIDATE — 等待冻结审批。审批后:生成 T1 快照 → 冻结锁 → Step-0 检查 → 运行 12 runs → 评分 → 报告。协议不再修改。*
