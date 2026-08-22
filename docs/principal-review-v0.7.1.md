# Principal Architect + Evaluation Reviewer — v0.7.1 架构审查

> 角色:Principal Architect + Evaluation Reviewer。不增加功能,不修改 Researcher 核心逻辑。
> 立场:不假设 Researcher 成功。目标是证伪 —— 判定 Project Cognition Layer 定位是否成立,以及下一阶段架构路线。
> 审计对象:researcher/ 全部代码、evaluation/ 实验产物、docs/ 协议与定位文档。

---

## 1. 架构审计

### 1.1 PCR 是"报告"还是"认知状态"?

**结论:PCR 是报告;认知状态是另一个东西;两者之间的绑定是 prompt 纪律,不是机械结构。**

代码事实:

| 实体 | 载体 | 持久性 | 机械性 |
|---|---|---|---|
| PCR(7 节 + 附录) | 模型生成的最终消息 | 会话内 | 纯文本,无 schema 强制(除 research_handoff.json 块) |
| 认知状态(claim ledger/依赖图/假设) | research-state 插件,进程内存 | 会话日志重放 | 单一 reducer,事件溯源,机械确定 |
| 状态↔报告的对应 | PCR 模板 Appendix A/B | — | **prompt 约定,无机械校验** |

关键审计发现:**"报告声称的状态"与"实际提交的状态"可以不一致** —— 模型可以在 Appendix A 里写 20 条 claim 而只 checkpoint 了 5 条,或反之;没有任何机制(doctor 检查 7 项中也没有这一项)验证"报告中的 Evidence Ledger == 状态机中的 ledger"。doctor 的 Replay 检查只验证"日志折叠确定性",不验证"报告忠实于状态"。

含义:**PCR 是状态的"叙事投影",不是状态本身**。对读者(人)这是够的;对机器消费(Plan Mode、Memory Bridge、评估器)这是缺口 —— 机器只能消费 research_handoff.json(仅 BUILD 项),无法消费完整认知状态。这正是 v0.8 的 Cognition State 要解决的问题。

### 1.2 claims/evidence/checkpoint 是否形成"真正的认知模型"?

**结论:形成了一个真状态机(依赖图/局部失效/版本化),但还不是真认知模型 —— 缺三个结构:**

1. **无 claim 间关系**:claim 是扁平条目(id/statement/tier/verdict/evidence[]/confidence),claim 之间无 relation(如 "C07 支撑 C19"、"C04 与 C25 冲突")。依赖图只存在于 hypothesis/views 层,claim 层没有图。认知模型的核心是"知识之间的结构关系",当前只有"证据→主张"的单向支撑。
2. **无 freshness/指纹**:evidence 是字符串(file:line),不与代码 blob 绑定。项目变化后,没有任何机制标记"这条 claim 的证据锚已过期"。**Cognition Diff 的机械前提(证据锚指纹)不存在。**
3. **无跨会话自动桥**:export/importState 是手动通道(模型自驱);没有 host-plane 的自动 capsule 持久化(v0.9 承诺)。跨 session 认知继承依赖"模型记得导出",不可靠。

但必须承认其真价值:**局部失效 + 版本化假设 + 会话重放是真实且罕见的机制**(单 reducer 同时服务执行与重放;假设 invalidated 保留历史)。这不是玩具 —— 它是 v0.8 Cognition State 的正确内核,缺的是结构化外壳。

### 1.3 Researcher 与 Plan Mode 边界

**边界清晰,且有机制强制,无漂移:**

- Researcher:只读、无 shell、无 write、无规划产物(handoff 只含 BUILD 项,不含 HOW)、"Never think in diffs"。
- Plan:有执行规划能力,在 Experiment A 中展示出清单核对优势。
- 边界由**能力面**强制(不是 prompt 自觉):researcher 预设中根本没有 pwsh/plan 工具;write/edit 是永拒桩。这是结构性边界,不是纪律性边界 —— 这是本架构最强的一点。
- Experiment A 中 Plan 胜出**不是边界模糊**:任务(清单核对型 GT)与 Plan 形态匹配,而 Researcher 的机制(状态/证据)在该任务中无计分权重。这恰好证明边界存在,而非失效。

### 1.4 Researcher 与 Memory 系统边界

- 现状:Researcher 拥有会话内状态(session log replay),**不拥有跨会话记忆**(Memory Bridge 是 v0.9 承诺,未实现)。
- 设计边界正确:roadmap 明确 "Researcher 永不拥有 memory_write" —— 认知状态持久化归 host-plane,Researcher 只写会话日志。这防止了"认知层变成又一个写文件的 agent"。
- **缺口**:host-plane 的 capsule 存储不存在。当前跨会话继承只有 export/importState(模型自驱、无验证)。Experiment C 的盲测纪律(run-2 不得收 run-1 capsule)反而依赖这个缺口 —— 若 v0.9 实现自动桥,盲测设计需要重新审视(真实场景中 run-2 会自然携带状态,C 测的"无记忆漂移检测"会失去现实对应)。

### 1.5 分类输出

**必须保持(架构不变量,任何版本不得破坏)**:

1. 只读能力面边界(无 shell、无 write、永拒桩、fail-closed 守卫)—— 这是"认知层"与"执行 agent"的结构性区分,也是信任基础。
2. 单一 reducer 的事件溯源(执行 == 重放)—— 正确性根基,不可分叉。
3. 局部失效 + 版本化假设(不重跑整管、不重读已读文件)—— 长期认知维护的机制内核。
4. 零写契约(状态只进会话日志,不碰项目文件系统)。
5. 证据纪律(C0–C4 + 裁决态)—— 产品本体。
6. 冻结/盲测/失败保留的评测纪律。

**应该保留(有价值,但需要强化或重新定位)**:

1. export/importState —— 保留,并作为 v0.8 Cognition Handoff 的机械基础。
2. research_doctor 证书 —— 保留;建议 v0.8 增加第 8 项检查:"报告 Evidence Ledger 与状态机 ledger 的一致性"(机械校验附录 ↔ 状态)。
3. research_handoff.json —— 保留,扩展为完整的 cognition handoff(见 v0.8)。
4. git_read 固定 allowlist —— 保留,是唯一子进程面。
5. Quick/Deep 深度档 —— 保留(实验条件已冻结,不新增档位)。

**应该删除**:

1. **当前没有必须删除的机制**(审计未发现死代码级负担;research-state 的 history 截断 20 条是合理上限)。
2. 建议**不再扩展**的方向:persona 中 EXTERNAL RESEARCH/COMPARE 的成本权重(Experiment A 显示 web_search/subagent 是 Deep 成本黑洞且 GT 外收益为零)—— 不是删除,而是实验后续评估其价值;若 B/C 也显示零收益,应降为条件触发(只在决策需要时),但这属于 v0.8+ 的 persona 调整,本阶段不动。

**应该延期(v0.9+,不阻塞当前)**:

1. Memory Bridge / Project Intelligence Capsule 持久化 —— 等 B/C/D 结果决定是否需要。
2. 真实时间窗口漂移(T0→T0+90–120 天)—— 等合成漂移(C)方法学验证。
3. Structural Evidence 集成(GitNexus/Cairn 接入)—— 等核心价值验证。
4. Claim Delta 深化 —— roadmap 已有纪律:"仅在 benchmark 证明 claim 系统有增益后再做"。

---

## 2. Experiment 路线审查

### 2.1 Experiment B(Change Impact Understanding, H1)

**是否验证核心价值?部分 —— 它验证能力面,不验证机制面。**

- ✅ 验证的是"影响链推理质量"(change → dependency → behavior → contract),这是 PCR §6 的承诺,且 Experiment A 从未测过。
- ✅ 指标(链式 Recall / Precision / Critical Edge 30% / CNS)防 dependency grep,设计扎实。
- ❌ **但它测的不是 Project Cognition Layer 的核心价值**。核心价值 = 长期认知维护(时间维度);B 是单快照 + 拟议变更,无时间轴、无状态继承。B 答的是"Researcher 的认知输出是否更好",不是"认知机制是否提供增量"。
- 关键证伪视角:**如果 B 失败,不证明认知层失败**(影响分析可能被通用推理能力覆盖 —— 这正是"AI 模型本身已解决"风险)。**如果 B 成功,也不证明认知层成立**(可能只是 persona 提示工程红利)。

**判断**:B 是必要的能力边界测量(决定 PCR §6 是否值得保留),但不是核心价值实验。执行成本 12 runs,值得做,但结论权重要低。

### 2.2 Experiment C(Longitudinal Cognition Maintenance + Stale Claim Detection, H2 + H3)

**核心问题:C 当前设计只测 H3,不测 H2(与 arch-audit 结论一致,此处从架构角度复述)。**

- protocol v1.1 §2 盲测纪律:run-2 不得收到 run-1 capsule → run-2 没有旧认知输入 → 只能测"无记忆条件下的变化检测"(H3)。
- **H2(Longitudinal Maintenance)的定义就是"有旧认知输入下的维护"** → C 的设计排除了 H2 的测量条件。
- 架构含义:当前 C 测的是"模型通用能力"(无状态也能检测漂移),这恰好是"AI 模型本身已解决"风险的最大暴露面 —— **如果 C 在这种不利条件下 Researcher 仍胜出,证据力极强;如果失败,什么都证明不了(H3 可能是通用能力,也可能是任务过难)**。

**修正建议(不修改 Researcher,只改实验设计)**:

1. **C 增加状态继承臂**:run-2 分两组 —— 无状态组(现状,测 H3)与有状态组(run-2 经 evaluator 注入 run-1 的 checkpoint export,测 H2)。有状态组只在 Researcher 模式可行(基线 claims=0),这恰好是"机制不对称"的正确测量形态:Researcher 自比(有状态 vs 无状态)得出"状态是否提供增量",这是**机制验证**而非能力对比。
2. **git 历史可见性处理**(arch-audit 已指出):T1 注入 squash 进截断点,Mutation Recall 要求认知影响呈现。
3. **报告分层**:H2(有状态 vs 无状态,Researcher 内部)+ H3(Researcher vs 基线,无状态)+ 可发现性分级。

### 2.3 路线总判断

| 实验 | 测什么 | 对核心价值的证据力 |
|---|---|---|
| A(已完成) | 单快照理解 | 低(最弱维度,已削弱) |
| B | 影响链推理 | 中低(能力面) |
| C 现状 | 无状态漂移检测(H3) | 中(通用能力风险大) |
| **C+ 状态臂 / D** | **有状态维护 vs 无状态(H2)** | **高(机制面,唯一能证明认知层不可替代的实验)** |

**结论:真正验证核心价值的实验是"状态继承下的维护 vs 重建"(H2),它必须被设计进去。** 若 H2 无增益,Project Cognition Layer 的定位不成立 —— 那时 B/C 的结果只影响"PCR 哪些节值得保留",不影响定位存亡。

---

## 3. v0.8 架构方向设计(不增加 agent 能力)

> 约束:不增加 agent 能力 = 不新增 Researcher 工具、不改变 Researcher 工具面、不修改 persona 核心。以下全部是 **host-plane / 格式 / 消费方** 侧工件,或对现有机制(export/importState、会话日志)的标准化封装。

### 3.1 Cognition State(认知状态实体化)

**问题**:状态在进程内存 + 会话日志,机器不可直接消费;报告与状态无机械绑定。

**设计**:定义 `cognition-state.json`(schema `dsh-researcher/cognition-state/v1`),由 **host-plane 导出器**从会话日志的 research_checkpoint 事件流折叠生成(复用 research-state 的 foldCheckpointEvents —— 它是纯函数,evaluator/host 侧可直接调用,不涉及 agent):

```json
{
  "schema": "dsh-researcher/cognition-state/v1",
  "run": "#N",
  "generated_at": "...",
  "project": "commander.js@bf35c5f",
  "claims": [{ "id": "C07", "statement": "...", "tier": "C2", "verdict": "Known",
               "evidence": ["command.js:953-961"], "confidence": 0.9, "revision": 3 }],
  "hypotheses": [{ "id": "H2", "status": "active", "dependsOn": ["C07"], "revision": 1 }],
  "views": [{ "name": "project_model", "dependsOn": ["H1","H2"] }],
  "dirty": []
}
```

- **零 agent 改动**:导出器是 host-plane 脚本(如 `evaluation/scoring/capsule-diff.js` 的同族),从归档的 session.events.json 折叠。Researcher 甚至不知道它存在。
- **增益**:评估器可机械对比(Experiment C+/D 的输入)、Plan Mode 可消费、审计可重放。
- **关键结构增强(在导出器侧,不改 research-state)**:为每条 claim 的证据锚计算 **blob 指纹**(`file:line` → git blob sha),这是 Cognition Diff 的机械前提。

### 3.2 Cognition Diff(状态 vs 现实的对账)

**问题**:没有机制知道"哪些 claim 的证据已过期"。

**设计**:`cognition-diff.js`(host-plane,非 agent 工具):

1. 输入:cognition-state.json + 新快照/当前 workspace。
2. 机械对账:对每条 claim 的每个证据锚,取当前 blob sha;sha 变化 → 该锚 **STALE**;claim 的全部锚皆 stale → claim 标 `stale-candidate`;依赖它的 hypothesis/view 传播标 `affected`(复用 research-state 的 dependentsOf 语义 —— 纯函数)。
3. 输出:`{ stale_claims: [...], affected_hypotheses: [...], unchanged_claims: [...] }`。
4. **用途(双刃)**:
   - 评估侧:Experiment D/C+ 的**机械真值** —— 注入变化后,哪些 claim 应失效由 diff 机械判定,不依赖 evaluator 主观;Researcher 的"有状态组"能否在**拿到 diff 提示前**自己发现失效,是 H2 的核心测量。
   - 产品侧(v0.9+):freshness gate 的输入。
- **不是 agent 能力**:它是 evaluator/host 的计算,不授予 Researcher。Researcher 的对应动作(自己重新验证 claim)仍然靠自己的证据纪律 —— 这正是要测的东西。

### 3.3 Cognition Handoff(标准化认知交接)

**问题**:research_handoff.json 只含 BUILD 项;完整认知(状态 + 失效 + 未决)无法交接。

**设计**:扩展 handoff 为 `cognition-handoff.json`(schema `dsh-researcher/cognition-handoff/v1`):

```json
{
  "schema": "dsh-researcher/cognition-handoff/v1",
  "run": "#N",
  "certificate": "SAFE",
  "state_ref": "cognition-state.json (sha256 ...)",
  "diff_ref": "cognition-diff.json (stale/affected counts)",
  "build_items": [ ... 现有 research_handoff.json 内容 ... ],
  "do_not_touch": ["paper/ frozen artifacts"],
  "unknowns": [ { "id": "U3", "question": "...", "evidence_needed": "..." } ]
}
```

- 机器消费方(Plan Mode、编码 agent pre-step、Memory Bridge)按 schema 读取,不需要解析散文。
- **不增加 agent 能力**:模型仍只输出 research_handoff.json 块(现有行为);host-plane 把状态/差异折叠进 handoff 包。PCR 模板可加一句"附录 B 需与状态一致"的纪律,但机械校验归 doctor 第 8 项检查(v0.8,host 侧)。

### 3.4 v0.8 交付形态(全部 evaluator/host 侧,Researcher 零改动)

| 工件 | 性质 | 依赖 |
|---|---|---|
| `cognition-state.json` 导出器 | host 脚本(折叠会话日志) | 复用 foldCheckpointEvents |
| `cognition-diff.js` | host 脚本(blob 指纹对账) | git blob sha |
| `cognition-handoff.json` schema | 格式定义 | state + diff |
| doctor 第 8 项检查(报告↔状态一致性) | doctor 插件新增检查项 | 状态导出 |

**验证策略**:v0.8 工件**先为 Experiment D/C+ 服务**(评估工具),再决定是否产品化 —— 与 roadmap 的"benchmark 证明后再深化"纪律一致。

---

## 4. 风险分析(证伪视角)

### 4.1 最可能的失败原因排序

**① AI 模型本身已经解决(最高风险,概率 ~45%)**

- 现象:Experiment A 中 Plan/Standard(无认知机制)已达 GUS 0.70+,成本远低于 Deep;模型原生长上下文 + 推理已能"理解项目"。
- 机制:认知结构的价值 = 模型原生能力之外的**增量**。若推理模型的单次理解已足够好,H1(影响分析)与 H3(无状态漂移检测)很可能被原生能力覆盖 —— 这不是 Researcher 做得差,而是**问题已被模型解决**。
- 证伪信号:H1 失败 + H3(无状态臂)失败 + 基线在 B/C 上表现良好。
- **对策**:把实验重心压在 H2(状态继承)—— 这是原生能力唯一无法覆盖的维度(模型没有跨会话记忆,除非提示工程,而提示工程在长流程中不保真)。若 H2 也无增益,承认定位不成立。

**② 定位问题(次高风险,概率 ~25%)**

- 现象:Plan 在 A 中胜出;认知层的"时间维度"价值在单快照评测中不可见,而真实工作流(跨会话维护)尚未被任何实验证明有价值。
- 机制:"Project Cognition Layer" 的定位依赖"长期维护"叙事;若 B/C/D 无法在受控实验中展示增量,定位退化为"又一个高质量只读分析 agent"。
- 证伪信号:H2 无增益(状态继承不提供维护优势)。
- **对策**:H2 实验是定位的生死判据;结果如实报告,不粉饰。

**③ 技术问题(风险 ~20%)**

- 现象:状态机正确但**结构不足**(无 claim 关系、无指纹、无自动桥 —— 见 1.2)。
- 机制:即使 H2 在实验中有信号,产品化需要 Cognition State/Diff/Handoff 的工程投入;若投入后增量边际收益低,技术债拖累。
- 证伪信号:评估工具(状态导出/指纹对账)实现后,对真实仓库的失效判定噪声大。
- **对策**:v0.8 工件先做评估工具,用 D 的真实数据校准,再谈产品化。

**④ 市场问题(风险 ~10%)**

- 现象:生态位窄(DSH developer preview;与 Cairn/Drift/GitNexus 相邻)。
- 机制:即使技术成立,采纳依赖生态;非本实验可答。
- 证伪信号:无(不在评测范围内)。

### 4.2 综合判断

**Project Cognition Layer 的存亡判据是 H2(状态继承下的维护 vs 重建),不是 H1/H3。** 当前实验路线(B + C-现状)不足以回答定位问题;必须加入状态继承臂(C+ 或 Phase D)。若 H2 失败,最可能的原因是"AI 模型本身已解决"(维护可以被"每阶段重跑一次"替代)—— 那时应承认:Researcher 的机制无增量,保留其"高质量只读报告 + 证据纪律"的产品价值,放弃"认知层"定位。

### 4.3 停止条件(预注册)

- H2 无增益(维护臂 ≤ 重建臂,双仓库确认)→ 承认"认知层定位不成立",降级为只读分析模式。
- H1+H3 同时失败 → 放弃 PCR §5/§6 的独立价值主张(保留风险地图与决策备忘录作为报告质量特征)。
- 任何实验出现系统性边界违规 → 停步,修实验,不修 Researcher。

---

## 结论

1. **PCR 是状态的叙事投影,不是状态本身**;报告与状态的机械绑定缺失是当前最大的架构缺口。
2. **状态机是真机制,但不是真认知模型**(缺 claim 关系、证据指纹、自动桥) —— v0.8 的 Cognition State/Diff/Handoff 正是补这三个缺口,且全部可在 host-plane 实现,零 agent 改动。
3. **边界(Researcher/Plan/Memory)清晰且有机制强制,无漂移**。
4. **实验路线:B/C 必要但不足以判定定位;H2(状态继承)是唯一能证明认知层不可替代的实验,必须加入。**
5. **最高风险不是技术,是"AI 模型本身已解决"** —— 实验设计必须把 H2 作为主战场,并预注册承认条件。

---
*本文件不含任何 Researcher 核心逻辑修改方案;v0.8 方向全部为 host-plane/格式侧工件。*
