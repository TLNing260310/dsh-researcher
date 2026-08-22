# Principal Architect — 最终决策审查:Project Cognition Layer 是否值得继续投入

> 角色:Principal Architect + Evaluation Reviewer。任务不是让项目更强,而是判断 Project Cognition Layer 是否真实存在。
> 禁止:增加 Agent 能力 / 修改 prompt 提高分数 / 增加报告章节 / 根据结果调整 GT。**全部遵守。**
> 输入:researcher/ 代码逐行、evaluation/ 实验产物、docs/ 既有审查(arch-audit-v0.7.1.md、principal-review-v0.7.1.md、principal-route-review.md)。
> **本轮增量:对 Experiment A 的 12 个会话日志做了 research_checkpoint 使用情况实证分析(此前审查均为代码推断,本轮回以数据)。**

---

## Part 1 — 架构审查(代码级 + 实证)

### 1.1 research-state 是否已经形成 cognition model?

**结论:形成了"被真实使用的认知状态机",但没有形成"认知模型"。** 本轮新增实证:

**Experiment A 中 research_checkpoint 实际使用(12 runs 会话日志折叠)**:

| 指标 | 数值 | 解读 |
|---|---|---|
| 使用 checkpoint 的 runs | 6/12(Quick 3 + Deep 3) | 仅 Researcher 模式;基线 0(预期) |
| checkpoint 调用总数 | 21 | 每 run ~3.5 次 |
| 修订 claim 总数 | 137 | 状态机被真实写入 |
| hypothesis 提交 | 16 | 依赖图被构建 |
| views 提交 | 22 | 派生视图被登记 |
| **dependsOn 边** | **89** | **claim→hypothesis→view 依赖图真实存在** |
| **invalidate 调用** | **0** | **局部失效传播从未被触发** |
| **importState 调用** | **0** | **跨会话状态继承从未被使用** |

关键发现:

1. **状态机不是摆设**:137 条 claim、89 条依赖边证明模型确实在构建 ledger 与依赖图 —— "认知状态机"这一层是真实运行着的。
2. **但核心卖点从未被测量**:invalidate=0(单快照任务无"新证据推翻旧 claim"场景)+ importState=0(无跨会话)。**"局部失效"与"状态继承"—— 认知层最该证明的两个机制 —— 在 Experiment A 中一次都没有被激活。** 这既是机会(机制未被证伪),也是警告(机制从未在真实对抗中存活过,可能只是理论)。
3. **使用模式偏"期末汇总"**:单次调用批量提交 16 条 claim(如 exp-a-quick-01 的 DECISION 阶段),而非逐 move 增量维护。状态机被用作"报告附录的数据源",不是"实时推理的参与者"。

**判定矩阵**(与代码推断一致,实证强化):

| 认知模型要求 | 状态 | 证据 |
|---|---|---|
| 结构化知识写入 | ✅ | 137 claims, 16 hyps, 22 views |
| 依赖图 | ✅ | 89 dependsOn 边 |
| 失效传播 | ⚠️ 存在但 0 次触发 | invalidate=0 |
| 跨会话继承 | ⚠️ 存在但 0 次使用 | importState=0 |
| claim 间关系 | ❌ | 扁平条目,无 relation |
| 证据指纹 | ❌ | evidence 是叙述文本("lib/command.js full read") |
| 机器消费方 | ❌ | 除报告附录外无消费者 |

### 1.2 PCR 是否只是 presentation layer?

**是。** PCR 是唯一输出;状态层为 PCR 生成服务。实证佐证:模型在 DECISION 阶段一次性提交 16 条 claim —— 这更像是"为附录补写台账",而非"状态驱动报告"。(报告↔状态无机械校验,doctor 7 项检查不含此项。)

### 1.3 claims/evidence/checkpoint 缺少什么?

缺"可机械验证三件套":**指纹**(evidence 是叙述文本,无法对账过期)、**关系**(claim 层无 relation,失效传播在 claim 层断链)、**桥**(importState 存在但无自动通道,且从未被使用过)。**补:实证显示"使用纪律"也缺** —— checkpoint 是期末汇总而非增量维护,状态机的"实时参与者"角色未被实践。

### 1.4 Researcher 与 Plan 边界是否应该调整?

**不调整结构。** 边界由能力面强制(无 shell、无 write、永拒桩),是优点。职责声明由实验裁决:若 B 失败,PCR §6 独立主张撤回,但边界不动。

### 1.5 Researcher 与 Memory 边界是否正确?

**设计正确,实现缺失。** Researcher 永不拥有 memory_write ✓;host-plane capsule 存储不存在 ✗;唯一持久通道是会话日志(压缩/清理会丢状态)。实证:importState=0 意味着"桥"从未被端到端验证过。

### 1.6 分类输出

**Must Keep(架构不变量)**:
1. 只读能力面边界(fail-closed、无 shell、永拒桩)
2. 单 reducer 事件溯源(执行 == 重放)
3. 局部失效 + 版本化假设(机制内核,虽 0 次触发但代码正确)
4. 零写契约、证据纪律、评测纪律

**Retain(保留,需强化)**:
1. export/importState(→ v0.8 Handoff 基础)
2. research_doctor(+第 8 项:报告↔状态一致性)
3. research_handoff.json(→ Cognition Handoff)
4. git_read 固定 allowlist、Quick/Deep 档

**Remove**:无机制级删除项。

**Defer(v0.9+)**:
1. Memory Bridge / Capsule 持久化 —— 等 H2 结果
2. 真实窗口漂移 —— 等合成方法学验证
3. Structural Evidence 集成、Claim Delta —— benchmark-gated

---

## Part 2 — 验证路线重新设计(Capability vs Irreplaceable)

### 2.1 区分

- **Capability Test**:模型 + 良好 prompt 即可完成;差异可能来自 persona 红利;失败不证伪认知层,成功也不证明。
- **Irreplaceable Value Test**:要求认知结构本身(跨会话状态、失效传播、证据对账);原生推理无法覆盖;只有它能裁决定位。

### 2.2 逐实验判定

| 实验 | 测什么 | 类型 | 裁决力 |
|---|---|---|---|
| A(已完成) | 单快照 GUS | Capability | 无(GUS 与 claims 零相关,实证确认) |
| **B(Change Impact)** | 影响链推理 | **Capability** | 低。影响分析可能被原生推理覆盖;B 只决定 PCR §6 去留 |
| **C 无状态臂(现状)** | 无记忆漂移检测(H3) | **Capability** | 中低。变化检测是通用能力;失败无信息量 |
| **C 状态继承臂(需新增)** | 有状态维护 vs 重建(H2) | **Irreplaceable** | **唯一裁决实验** |

### 2.3 为什么当前实验不能证明 Cognition Layer

**直接回答:当前路线(B + C 现状)测的全是 Capability,没有一个 Irreplaceable Value Test。**

- B:单快照 + 拟议变更,无时间轴、无状态继承 → 可被"更强的模型 + 好 prompt"完成。
- C 现状:run-2 不得收 run-1 capsule(protocol v1.1 §2 盲测纪律)→ 无旧认知输入 → 测的是通用变化检测。
- 实证:Experiment A 中 invalidate=0、importState=0 —— **认知层最独特的两个机制在任何实验中从未被激活,自然从未被证明。**
- **结论:按当前路线执行 B + C,无论结果如何,都无法回答"Project Cognition Layer 是否真实存在"。** 必须加状态继承臂(C+),使 H2 可测。

---

## Part 3 — v0.8 设计(只允许三工件,禁止新增 Agent)

> 全部 host-plane / 格式侧;复用现有纯函数(foldCheckpointEvents、dependentsOf);零 agent 工具、零 prompt 修改。

### 3.1 Cognition State

`cognition-state.json`(schema `dsh-researcher/cognition-state/v1`):host 导出器从会话日志 research_checkpoint 事件折叠(复用 foldCheckpointEvents),每条 evidence 锚附 **blob 指纹**(git blob sha)。**实证驱动的必要性**:当前 evidence 是"lib/command.js full read"这类叙述文本,无法对账;指纹是 Cognition Diff 的机械前提。

### 3.2 Cognition Diff

`cognition-diff.js`(host 脚本):evidence 锚 blob sha 变化 → claim 标 `stale-candidate` → 经 dependentsOf 传播 → hypothesis/view 标 `affected`。双用途:评估侧为 C+/D 提供**机械真值**(注入变化后哪些 claim 应失效,不依赖 evaluator 主观);产品侧为 freshness gate 提供输入。

### 3.3 Cognition Handoff

`cognition-handoff.json`(schema v1):state_ref + diff_ref + build_items + unknowns + do_not_touch。机器消费方(Plan pre-step / Memory Bridge / 评估器)按 schema 读取;模型仍只输出现有 research_handoff.json 块(行为不变),host 折叠状态/差异进交接包。

**v0.8 纪律**:三工件先为实验服务(评估工具),验证后再产品化。

---

## Part 4 — 失败分析(目标是找到失败原因,不证明成功)

### 4.1 四类失败的可区分信号

**① AI 模型进步导致价值消失(≈45%,最可能,不可控)**
- 机制:原生长上下文 + 推理持续吞噬认知层增量面。A 已示警(Plan/Standard 零机制 GUS 0.70+,成本远低)。
- 信号:B 或 C 无状态臂中基线 ≈ Researcher,且随模型版本不拉开。

**② 定位失败(≈25%)**
- 机制:H2(状态继承)无增益 → "长期认知维护"叙事无实证。
- 信号:状态臂中维护 ≤ 重建。**这是定位生死判据。**

**③ 技术失败(≈20%,可修)**
- 机制:结构缺口(指纹/关系/桥)+ 使用纪律缺失(期末汇总而非增量维护)。
- 信号:v0.8 评估工具对真实仓库失效判定噪声大;doctor 第 8 项常 FAIL。

**④ 市场失败(≈10%)**
- 机制:生态位窄(DSH developer preview;与 Cairn/GitNexus 相邻)。
- 信号:评测外(采纳率),不阻塞技术判断。

### 4.2 最可能的失败叙事(合成)

> AI 模型进步先吞噬 H1(影响分析)与 H3(变化检测),随后 H2(状态维护)被"每阶段重跑一次"的成本等价替代。认知结构边际价值趋零,定位失去实证支撑。

**三个可观测里程碑**(预注册):
1. B 平局 → 撤回 PCR §6 主张;
2. C 无状态臂平局 → 跳过能力实验,直接裁决 H2;
3. 状态臂无增益 → **承认定位失败**。

---

## 最终输出:是否值得继续投入

### 判断:值得,但有条件 —— 且条件可一次实验判定。

**理由(证伪导向,不乐观)**:

1. **未被证伪 ≠ 已证明**:认知层的两个独特机制(局部失效、状态继承)在全部现有实验中**零激活**(invalidate=0、importState=0 实证)。它们从未失败,因为从未被测试。这保留了一个真实的、尚未检验的价值假设。
2. **当前路线无法裁决**:B + C 现状全是 Capability Test。继续跑它们不会得到"是否值得"的答案 —— 那不是项目失败,是验证失败。
3. **最小验证可行且廉价**:H2 状态臂不需要新 Agent、不需要改 prompt、不需要改 GT —— 只需要 evaluator 在 run-2 注入 run-1 的 checkpoint export(现有 importState),加 Cognition State/Diff 作为机械真值。

### 如果值得:下一步最小验证是什么?

**最小验证(单实验,可裁决)**:

1. **实验 C+ 状态继承臂(主)**:12 × 2 sessions;run-2 分两组 —— 无状态(现状)/ 有状态(evaluator 注入 run-1 checkpoint export)。仅 Researcher 模式跑有状态组(基线无 claims)。判定:**有状态组 ≥ 无状态组(准确率 + 成本)→ H2 成立,值得继续;否则承认定位失败。**
2. **机制正确性测试(辅,零模型成本)**:合成状态机 + 真实注入场景,验证局部失效是否只失效正确的依赖子集(不过失效/不欠失效)。这是"机制是否如设计运行"的工程前提,1 天内可完成。
3. **v0.8 三工件先行(使能)**:Cognition State 导出器 + Cognition Diff 是 C+ 的机械真值来源;实现成本低(复用纯函数),先做。

**不做**:B 照跑但降权(只决定 §6 去留);不扩实验矩阵;不碰 Researcher/prompt/GT。

### 如果不值得:如何降级保留价值?

**承认条件**:H2 无增益(状态臂中维护 ≤ 重建,双仓库确认)。

**降级方案(保留价值,放弃定位)**:

1. **定位降级**:从"Project Cognition Layer"降为"高质量只读项目分析模式"(evidence-backed read-only analysis) —— 一个 standard preset 的可选 persona,不再是独立认知层。
2. **保留的产品价值**:
   - 证据纪律(C0–C4 + 裁决态):独立价值,不依赖状态机;
   - 风险地图 + BUILD/DON'T BUILD/INVESTIGATE 决策备忘录:报告质量特征;
   - 只读安全边界:作为"可信只读分析"的卖点;
   - PCR 模板:作为分析报告格式。
3. **丢弃的机制**:research-state 的依赖图/失效传播/版本化(若无增量)、Memory Bridge 计划、Claim Delta。
4. **记录处置**:全部实验记录、失败分析、反例资产保留;降级决策本身作为 roadmap 的正式条目写入,供后续模型代际重新评估(模型进步可能在某代之后让 H2 重新成立 —— 但那是重新验证,不是当前投入的延续)。

---

## 结论(一句话)

**Project Cognition Layer 是否真实存在,当前没有任何实验能回答 —— 因为它的独有机制从未被激活(实证:invalidate=0、importState=0);以一次最小验证(H2 状态继承臂 + 机制正确性测试 + v0.8 三工件)可得到二元答案;答案若为否,降级为只读分析模式,保留证据纪律与报告价值,不继续加码。**

---
*遵守全部禁令:无 Agent 能力增加、无 prompt 修改、无报告章节增加、无 GT 调整。本文件为决策文档,不含任何 Researcher 核心逻辑修改方案。*
