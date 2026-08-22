# Principal Architect + Evaluation Reviewer — v0.7.1 核心假设裁决

> 角色:Principal Architect + Evaluation Reviewer。目标不是让项目变强,而是判断**核心假设是否成立**。
> 禁令:不修改 prompt 提高成绩 / 不增加 agent 能力 / 不增加工具 / 不扩展报告内容 / 不根据实验结果修改 GT。**全部遵守。**
> 审阅范围:git 状态与最近 8 commit(全部为评估/审查文档,Researcher 代码零改动)、roadmap、evaluation 全部产物、架构文档、Experiment A 实证数据(12 会话日志折叠)。

---

## 审阅摘要(先记录事实)

- **git 状态**:干净;最近 8 个 commit(2332f8c → cb06c6a)全部为评估产物与审查文档;**Researcher 核心代码自 Experiment A 起零修改**。
- **evaluation**:Experiment A 完成并提交(12 runs、GUS 反预期、post-a-analysis);B/C 协议草案 + mutation manifest(机械化)+ 三份架构审查 + 最终决策文档就位;**无任何实验执行中**。
- **实证数据(上轮取得,本轮引用)**:12 会话日志折叠 —— 137 claims、16 hypotheses、22 views、89 dependsOn 边被真实写入;但 **invalidate=0、importState=0**;使用模式为 DECISION 阶段**一次性批量提交 16 条**(期末汇总)。

---

## Part 1 — 架构状态:当前修改属于 A/B/C/D 哪类?

**判定:A. 强化 Cognition Layer(且是唯一符合的选项),但形式是"验证"而非"建设"。**

| 选项 | 判定 | 依据 |
|---|---|---|
| A. 强化 Cognition Layer | ✅(验证性) | 全部近期工作:Experiment A(测 GUS 认知恢复)、B/C 草案(测影响链/漂移/维护)、四份审查(测定位与机制)。方向全部指向认知层假设,无一偏离 |
| B. 偏向普通 AI 分析工具 | ❌ | 未添加任何"通用分析"能力;PCR 模板、证据纪律、只读边界均未改动 |
| C. 偏向自动 coding agent | ❌ | 零执行能力增加;无 shell、无 write、无 diff 思维,边界未动 |
| D. 偏离定位 | ❌ | 无代码修改即无偏离载体;审查文档均以定位为前提检验之 |

**重要限定**:最近的"修改"全是**评估与判断**,不是架构建设。这意味着当前状态既没有强化 Cognition Layer 的实现(无 Cognition State/Diff/Handoff),也没有削弱它 —— 它停在"假设未验证"的零位。**这不构成 A 的成立,只构成"未偏离"。**

---

## Part 2 — 核心模型:research-state 是 report cache、reasoning trace、还是 cognition state?

**判定:当前实际角色 = ① report cache;设计意图 = ③ cognition state;两者之间的差距 = 未验证、未结构化的中间态。明确排除 ② reasoning trace。**

| 选项 | 判定 | 证据 |
|---|---|---|
| ① report cache | **当前实际角色** | 实证:DECISION 阶段一次提交 16 条 claim(期末批量),而非逐 move 增量;invalidate=0(状态从不被"推理"引用,只被"展示"消费);importState=0(状态从不跨会话流动)。状态机的写入时机与内容完全服务于最终 PCR 附录的生成 —— 这是 cache 的行为模式 |
| ② reasoning trace | ❌ | 状态不记录中间推理(无"为什么这样想"的轨迹,只有结论性 claim);推理轨迹实际存在于对话本身,checkpoint 不镜像它 |
| ③ cognition state | 设计意图,未达成 | 缺三件套:claim 间关系(扁平条目)、evidence 指纹(叙述文本 "lib/command.js full read" 无法对账)、机器消费方(除报告外无消费者);且从未被失效传播或继承机制使用过 —— 一个从未被使用其核心操作的"状态",不能称已达认知状态 |

**一句话**:research-state 是一个**设计为 cognition state、实践中退化为 report cache 的状态机**。它被写入(137 claims)、被展示(附录)、但从未被"认知操作"(失效、继承、对账)调用。**从 cache 到 cognition state 的跨越正是 v0.8 三工件的任务。**

---

## Part 3 — 价值验证:当前证据证明 Capability 还是 Irreplaceable Value?

**判定:全部现有证据只涉及 Capability;Irreplaceable Value 零证据(既未证明,也未证伪)。**

| 证据 | 类型 | 结论 |
|---|---|---|
| Experiment A(GUS Plan 0.717 > Standard 0.702 > Quick 0.669 > Deep 0.629) | Capability | 单快照理解被 Plan/Standard 以零机制达到 → 认知机制在该维度**无增量**(被模型能力覆盖的方向) |
| GUS 与 claims 零相关(实证) | Capability | 状态机写入量与理解质量无关 → 状态机在 A 中不是理解的原因 |
| invalidate=0 / importState=0(实证) | 无证据 | 独有机制从未被激活 → **Irreplaceable 假设从未被测试** |
| B/C 草案(未执行) | Capability 设计 | 即使执行,无状态臂的 C 仍是能力测试 |

**为什么当前证据可能被模型进步吞噬(必须诚实回答)**:

1. Experiment A 已经展示了吞噬路径:Plan/Standard(无任何认知机制)在 GUS 上达到或超过 Researcher,且成本低 2.3–4.2×。**如果"理解项目"本身被推理模型的原生长上下文解决,认知层的第一层价值(单快照理解)已经不存在了。**
2. B(影响分析)与 C 无状态臂(变化检测)与原生推理高度重叠 —— 模型越强,这两项的基线越接近天花板,Researcher 的增量越难显现。
3. **唯一不被原生能力覆盖的维度:跨会话状态继承(H2)** —— 模型每次会话都是新的;除非用外部记忆,否则"昨天的认知"无法自动参与今天的推理。这是 Irreplaceable 假设的唯一立足点,也是当前唯一未测的维度。

**结论**:现有工作证明的是"Capability 部分被模型覆盖";未证明、也未证伪"Irreplaceable Value"。**裁决只能来自 H2。**

---

## Part 4 — 下一步:三个方向(每个含验证/失败/停止)

> 只能从 Cognition State / Cognition Diff / Cognition Handoff 提出。每个:为什么需要、如何验证、如何失败、失败后是否停止。

### 4.1 Cognition State(认知状态实体化)

- **为什么需要**:research-state 现在是 report cache —— 状态在内存 + 会话日志,机器不可消费,报告↔状态无绑定。Cognition State 把状态**导出为可验证实体**(cognition-state.json,复用 foldCheckpointEvents 纯函数,零 agent 改动),是另外两个方向的机械基础。
- **如何验证**:导出器对 Experiment A 的 12 个归档会话日志回放,输出与人工 ledger 对比(逐条 claim 一致率);在 1 个真实注入场景中验证 blob 指纹计算正确性。验收:一致率 100%(确定性折叠)+ 指纹可复现。
- **如何失败**:折叠与人工 ledger 不一致(事件丢失/参数解析偏差);或导出体积膨胀(状态不可用)。若失败 = 工程问题,修导出器即可。
- **失败后是否停止**:**不停止**。它是工具,失败只影响工具本身,不裁决假设。

### 4.2 Cognition Diff(状态 vs 现实对账)

- **为什么需要**:当前无法机械知道"哪些 claim 证据已过期"(evidence 是叙述文本)。Cognition Diff 给出**机械真值**:blob sha 变化 → stale-candidate → dependentsOf 传播。它是 H2 实验的判定标尺(注入变化后,哪些 claim 应失效由机器判定,不依赖 evaluator 主观),也是将来 freshness gate 的输入。
- **如何验证**:合成注入场景(用 mutation manifest 的 6 项):注入后运行 diff,机械 stale 集 vs 人工判定集比对;再在 C+ 状态臂中作为真值,测 Researcher 有状态组能否在拿到 diff 前自行发现失效。
- **如何失败**:stale 判定噪声大(误标/漏标 > 20%)—— 即"证据锚 → blob"的映射在真实仓库不可靠(如证据锚是行号,行号随格式化漂移)。若失败,降级为"文件级粗粒度对账",H2 真值改由 evaluator 人工判定。
- **失败后是否停止**:失败 → **停止使用它作为机械真值,但 H2 实验本身继续**(人工判定替代);只有 H2 失败才停止方向。

### 4.3 Cognition Handoff(标准化认知交接)

- **为什么需要**:research_handoff.json 只含 BUILD 项;完整认知(状态 + 差异 + 未决)无法交接给 Plan/Memory/下一 session。Cognition Handoff = 状态 + diff 的机器可读交接包,是"H2 状态继承"的产品形态(run-2 接收的正是上一阶段的 handoff/state)。
- **如何验证**:在 C+ 状态臂中,run-2 的输入 = run-1 的 handoff(state_ref + diff_ref);验证有状态组能解析并利用它(对比无状态组)。这是 H2 实验的**输入载体**,随实验一并裁决。
- **如何失败**:有状态组无法利用交接(解析失败/信息无用)→ 交接格式失败;或 H2 无增益 → 交接无价值。
- **失败后是否停止**:格式失败 → 修格式(H2 仍可测);**H2 无增益 → 停止整个方向**(交接的价值完全依赖状态继承的价值)。

### 4.4 三方向的最小验证序列

```
Cognition State(1-2 天,工具) → Cognition Diff(2-3 天,真值) → C+ 状态臂(实验,H2 裁决)
                                    ↑
                              Cognition Handoff(输入载体,随实验)
```

**单次实验即可裁决**:H2 有状态组(经 handoff 接收 run-1 state)vs 无状态组;准确率 + 成本对比。

---

## 最终输出:继续投入 / 降级 / 停止

### 裁决:继续投入(且仅限验证性投入,一次裁决)

**理由(证伪导向)**:

1. **未证伪 ≠ 已失败**:实证显示独有机制(invalidate/importState)零激活 —— 核心假设(Irreplaceable Value 存在于跨会话认知)从未被测试。在"从未测试"与"测试失败"之间,裁决只能是"测试它",而不是"停止"。
2. **现有证据不支持停止**:Experiment A 只证明了"单快照理解不是卖点"(Capability 被覆盖),没有触及 H2。停止需要"假设已证伪",当前是"假设未测"。
3. **一次最小验证可闭合**:H2 状态臂 + 三工件全部复用现有机制(importState、foldCheckpointEvents),零 Researcher 改动、零 prompt 修改、零新工具 —— 成本低,裁决力高。

**投入边界(防止"继续投入"被误读为无上限)**:

- 投入内容**仅限**:Cognition State/Diff/Handoff 工具 + C+ 状态臂实验 + 机制正确性测试。
- 投入**不含**:任何 Researcher 功能开发、prompt 调整、报告扩展、GT 修改、Memory Bridge。
- 预算:一次性(工具 3–5 天 + 实验运行)。**不设第二轮**。

**预注册的降级/停止触发(写死,不事后调整)**:

| 触发 | 动作 |
|---|---|
| H2 无增益(状态臂中维护 ≤ 重建,双仓库确认) | **降级**:承认核心假设(跨会话认知增量)不成立 → 保留证据纪律/风险地图/决策备忘录/只读边界作为"高质量只读分析模式",删除 research-state 图机制、Memory Bridge、Claim Delta 计划 |
| H2 有增益但 B/C 能力面全败 | **降级为产品**:保留认知层机制但定位收缩(长期维护工具,而非认知层);继续 B/C 无意义 |
| H2 有增益且 B/C 部分成立 | **继续投入**:按 v0.9 路线(结构化 capsule + freshness gate)推进 |
| 任何实验系统性边界违规 | 停步修实验,不修 Researcher |

**如果现在停止**:**不具备条件** —— 停止需要"假设已证伪",而独有机制从未被测过;现在就停止等于在零证据下放弃一个尚未检验的假设,与"为了证明而继续"同属非理性。降级同样不具条件(降级 = 承认假设失败,而失败尚未发生)。**唯一理性的中间态是:一次性的、有停止触发的验证投入。**

---

## 结论(一句话)

**核心假设(Irreplaceable Value 存在于跨会话认知)既未被证明也未被证伪 —— 实证显示其独有机制从未被激活;因此裁决为"继续投入(验证性、一次性、带预注册停止触发)":以 Cognition State/Diff/Handoff 三工具 + H2 状态继承臂单次实验闭合;若 H2 无增益则降级保留分析模式价值,若增益则按 v0.9 推进。**

---
*全部禁令遵守:无 prompt 修改、无 agent 能力、无工具、无报告扩展、无 GT 调整。本文件为裁决文档,不含任何 Researcher 核心逻辑修改方案。*
