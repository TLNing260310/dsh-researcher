# dsh-researcher v0.7 Repositioning Memo（产品架构重构备忘录）

> 角色：产品架构顾问。依据：Flask Phase A evaluation（Recall 0/60；Precision Standard 0.80 / Plan 0.76 / Quick 0.85 / Deep 0.81；Deep≈Quick 准确率、Deep 成本 1.9×；全模式收敛于 3.2 上下文合并冲击面；researcher 展示项目建模/风险发现/证据链能力）。
> 原则：不追分改核心；不做漏洞扫描器；不加工具堆叠；不加 prompt 长度。

---

## 第一部分：定位审查

### 1. Researcher 当前真正解决的问题（证据版）

评测给出的答案：**它解决的不是"预测未来"，而是"用可验证的证据，把'这个项目现在是什么、哪里危险、该不该动'变成一份可审计的认知产物"。**

证据：
- 所有 12 次运行都成功重建了快照的主导现实（3.2 上下文合并 + shim + 文档漂移），convergence 跨模式一致；
- researcher 运行产出 28–32 条带 tier/verdict/evidence 的 claims、hypothesis 演化轨迹、BUILD/DON'T BUILD/INVESTIGATE + handoff；standard/plan 产出同等质量的"分析"，但没有可重放的结构化证据层；
- 0/60 说明：**未来 issue 召回不是它的能力面**，且 GT 选址（教程目录、docs/javascript.rst、should_ignore_error）落在所有模式注意力之外——这是任务对齐问题，不只是能力问题。

### 2. 是否从"高级 Plan Mode"调整为"AI Coding Agent 的项目认知层"

**是。三个理由 + 一个诚实的边界。**

1. 评测显示 Plan 与 Standard 在单次分析质量上与其收敛——"比 Plan 更懂"不成立为差异化；差异化在**结构化、可重放、带自证的认知产物**（证据台账、证书、状态机），这是"层"而非"模式"的属性。
2. "认知层"与 roadmap 的 v0.8（Structural Evidence 集成缝）/ v0.9（Project Intelligence Capsule + Memory Bridge）方向一致；"高级 Plan Mode"会把这些规划变成一个错误分支。
3. 认知层定位下，0/60 不再是产品失败证据，而是**范围声明**（不做 bug predictor）；"高级 Plan Mode"定位下，0/60 是致命伤。同一份数据，两种叙事。

**诚实边界**：认知层 ≠ 全知。单次运行的认知产物需要"新鲜度"与"多会话一致性"机制才成立为长期层（见 Phase 3/4 与第四部分 CDD 指标）。在机制建成前，README 不得声称"Drift Detection"已具备。

### 3. "Architecture Intelligence Layer" vs "AI Software Architect Assistant"

| 候选定位 | 优势 | 风险 | 过度承诺点 |
|---|---|---|---|
| **Project Cognition Layer（推荐主定位，README 已半在场）** | 与实测能力一致（理解重建 + 风险发现 + 证据纪律）；与"层"的集成叙事（v0.9）兼容；0/60 不构成反例 | "认知"抽象，需要 measurable 定义（第四部分补指标） | 若不做 GUS 指标，"认知"无法证伪 |
| Architecture Intelligence Layer（能力副标签，可作次级描述） | 强调架构维度（评测中风险发现最强项）；吸引架构师人群 | "Intelligence"营销感强；易被要求与人类架构师对标 | 架构判断 ≠ 架构正确性 |
| AI Software Architect Assistant（**不建议**） | 对话友好、高记忆度 | 暗示设计权威与正确性保证；评测（0/60 + 假警报 CRLF 案例）会立刻被拿来证伪；与"只读 + 不执行"的机制矛盾 | "Architect"意味着能设计——Researcher 只提供认知，设计权在人与 Plan |

**结论**：主定位维持 **"Evidence-driven Project Cognition Layer（基于证据的项目认知层）"**，副描述可加 "architecture intelligence"（能力），**禁用 "Architect Assistant"**（承诺层级）。README 现有 diagram 里的 "Drift Detection" 在 Phase 3 落地前改为 "Consistency（checkpoint 状态重放）" 或标注 roadmap。

---

## 第二部分：v0.7 产品目标

### Mission Statement（建议）

> **保持 AI Coding Agent 对项目的全局认知**——在每一次局部修改之前，用可验证的证据重建"项目是什么、架构如何、哪里危险、改动会波及什么"，并输出带证据分级的决策备忘录。Researcher 不预测未来，不代替架构师，不执行修改；它维护的是认知的**真实性**（证据锚定）与**连续性**（状态可重放、跨会话可比较）。

一句话版：**给"局部正确"的 AI 一个"全局真实"的认知底座。**

### README 首页定位（建议改写要点）

1. 首屏从 "before asking how, ask whether"（build-shaping 框架）改为三行式：
   - 问题：AI 编码每一步都正确，整个项目却可能逐渐失去一致性。
   - 机制：只读 + 证书自证 + 证据台账 + 认知产物（Project Cognition Report）。
   - 范围：**不是 bug 预测器，不是架构师，不是 Plan Mode 的加强版**——是它们共用的认知底座。
2. 定位对比表（Coding Agent / Plan Mode / **Researcher**）的"目标"列改为：
   - Coding Agent: produce code → Plan Mode: produce plan → **Researcher: restore & maintain project cognition（重建并维护项目认知）**；输出列改为 "Project Cognition Report + Decision Memo"。
3. 新增"证据墙"小节：引用 Phase A 评测数字（Recall 0/60 如实列出 + 一句话解读"未来 issue 预测不在能力面"；Precision 与风险发现一致性），把评测从"宣传证据"变成"范围声明"——这是与竞品最大的可信度差异。
4. "When to use" 增加：风险改动前的 impact 检查；多会话长周期项目的一致性维护（配合 checkpoint）。

### 用户场景（新的）

1. **接手陌生仓库**：30 分钟获得 Project Identity + Architecture Map + Risk Map，替代"人肉读 3 天"。
2. **重构/重大改动前**：先出 Project Cognition Report，改动影响面（Change Impact Analysis）作为重构 PR 的附件与评审基线。
3. **长期项目一致性维护**：每 N 次 AI 修改后跑一次 cognition refresh + delta（与上次认知对比，检测认知漂移/文档漂移/假设过期）——Phase 3 落地。
4. **技术尽调/开源评估**：Risk Map + Decision Memo 作为结构化尽调产物（评测已验证该场景能力）。

---

## 第三部分：Project Cognition Report（PCR）输出结构

取代 14 节研究报告（内部证据机制保留，重组为 7 节）。**规则：每一节声明证据来源类别；所有推断显式标注；证书与台账不降级。**

| # | 节 | 内容 | 必须来自代码证据 | 允许模型推理（须标注） |
|---|---|---|---|---|
| 1 | **Project Identity** | 项目使命/真实用户/价值机制/当前状态/成熟度 | 声称（C0，来自 README/docs/CHANGES）+ 代码佐证（C1+，如实际 API 面、测试规模、CI 事实） | 使命"为什么存在"的归纳；用户画像 |
| 2 | **Architecture Map** | 模块/分层/边界/核心数据流/入口点，每节点带 file:line | 结构事实：包布局、导入关系、调用链、数据流（read/grep/git 历史） | "设计意图"注释；边界合理性判断（标注） |
| 3 | **Critical Components** | 热点清单：高变更频率、高耦合、低测试覆盖、shim 类机制 | 变更频率（git log/blame）、测试覆盖（grep 测试引用）、耦合证据 | "为什么是风险热点"的归因 |
| 4 | **Design Decisions** | 关键设计决策记录：做了什么、为什么、代价、留下的约束 | 决策事实：commit message / CHANGES / issue 链接 / 代码遗迹（deprecation、注释） | 决策动机重构（须标注"推断"）；腐蚀 vs 演化判定 |
| 5 | **Risk Map** | 风险清单：每条 = 问题链 + 严重性 + 证据 + 置信度 + 反证 | 每条风险必须锚定 file:line/commit/测试缺口 | 严重性分级（在什么规模下成立） |
| 6 | **Change Impact Analysis** | 对指定改动（或候选改动清单）的影响面：依赖链、受波及模块、破坏面 | 依赖链与调用面证据；测试断言受影响处 | "预测"的破坏后果（显式标为预测，带置信度） |
| 7 | **Decision Memo** | BUILD / DON'T BUILD / INVESTIGATE + Recommended action + Handoff（JSON+MD） | 每项决策引用 Risk Map/台账条目 | 优先级排序与时机判断 |

**保留为 PCR 的固定头部/尾部**：Runtime Certificate（完整性证明）作为 §0；证据台账（claims with tier/verdict）作为附录 A 不删除（它是"认知可审计"的载体）；研究自查作为附录 B。PCR 与旧报告的关键差异：**从"研究报告（叙述）"转为"认知产物（结构化、可被下游消费、可被下一轮 diff）"**——这决定 Phase 3/4 的可行性。

---

## 第四部分：Evaluation 调整建议

### 保留（不删除 Flask 实验）
- Issue Recall（IR）保留为**次级指标**，改名 "Future Issue Recall（机会性指标）"，报告中继续如实呈现 0/60 与假阳性裁决记录。它测的不是产品承诺，是"附带发现未来问题的运气"。

### 新增四个主指标（对应认知层承诺）

1. **Global Understanding Score（GUS）**：认知重建准确率。
   - 构造：evaluator 从 T0 快照**可见事实**独立编制"认知 GT"（Project Identity 关键事实、架构模块清单、关键组件、设计决策、真实风险各若干条）——不需要未来知识。
   - 打分：运行输出的 PCR 覆盖多少认知 GT（含正确性判定，matched/partial/unmatched）。
   - 性质：这是对"理解"的直接测量，替代把 IR 当理解代理的错位。
2. **Architecture Risk Discovery（ARD）**：风险发现的"事后验证"。
   - 沿用 T0→T0+120d 窗口与三问裁决（是否 T0 潜伏 / 维护者是否行动 / 是否可从仓库证据发现），但**对象是运行自行提出的 Risk Map 条目**（非预注册 GT），统计命中率 + 假警报率。它比 IR 宽松（发现任何后来成真的风险都算），但保留假警报惩罚。
3. **Decision Quality（DQ）**：决策备忘录质量。
   - 两个维度：(a) 内部一致性——每条 BUILD/DON'T BUILD 是否被其引用证据支持（可用 precision 裁决复用）；(b) 事后校准——DON'T BUILD 项在窗口内是否确实未被建设，BUILD 项是否与后来真实行动同向（允许"方向正确但优先级不同"记 partial）。
4. **Cognitive Drift Detection（CDD）**：长期一致性（多会话）。
   - 场景设计：同一仓库 T0 与 T0+n 两个快照，分别跑 cognition；或同一快照跑两次 + 人为注入一次认知冲突（改 README 声称），测量第二次运行能否：(a) 发现与上次 committed 认知的矛盾（用 checkpoint ledger 重放对比）；(b) 在 delta 研究中对"我上次说的 vs 现在代码"给出正确判定。Phase 3 落地后成为可测项。

### 未来 benchmark 设计（v0.7 评测）

```
3 repos × 4 modes × 3 runs（沿用现有 harness/锁/盲测基建）
每 run 输出：PCR（新 schema）+ 事件 trace + metrics
主指标：GUS（认知 GT 覆盖+正确性）、ARD（风险命中+假警报）、DQ（一致性+校准）
次级：IR（机会性）、成本（token/时长/1M 价值）、False Alarm Burden
裁决：双人独立（D001 保留，公共阶段转双人）；GUS 认知 GT 先行锁定
报告：mean + range；正负结果全公开；结论标注 Preliminary
```
- 基建复用：blind-snapshot / blind-doctor / eval-lock / bootstrap / run-matrix 全部不动，只换 GT 构造与打分器。
- 教训固化：GT 选址必须覆盖"注意力表面"之外的抽样（本次 0/60 部分源于 GT 边缘化）；认知 GT 由 evaluator 独立编制，不参照任何模式的输出。

---

## 第五部分：修改计划（分阶段，不重构核心）

### Phase 1 — 定位与输出契约（纯文档/prompt/schema）
1. README：首屏三行式定位、定位对比表改写、证据墙（含 0/60 范围声明）、When-to-use 增补、diagram 中 Drift Detection 标注修正。
2. `researcher/skills/research-report-template/SKILL.md`：14 节 → 7 节 PCR 模板（含证据来源类别表、附录保留规则）。
3. `researcher/agent.cordis.yml` persona：定位段从 "epistemic upstream of Plan Mode / build-shaping" 改写为 "cognition layer"（"What should we build" 保留为 Decision Memo 的一部分，不删除）；**不动** pipeline moves 结构与守卫机制。
4. `docs/handoff-schema.md`：PCR 对齐（Decision Memo 即 handoff 载体）。
5. `docs/landscape.md`、`docs/roadmap.md`：v0.7 段更新（认知层叙事 + 评测调整）。
6. `docs/evaluation.md` + `evaluation-protocol-v1.md`：bump v1.1（新四指标 + IR 次级化；协议文本变更后按既有规则重跑受影响案例）。
7. `evaluation/scoring/`：新增 GUS/ARD/DQ 打分器（复用 adjudication 框架），IR 保留。

### Phase 2 — Agent 指令（methodology 调整）
- `researcher/skills/project-research-methodology/SKILL.md`：十一 moves 中 SHAPE/CLASSIFY/SELF-EVAL 重组为 PCR 语境（Risk Map → Change Impact → Decision Memo）；新增"Impact Analysis"move 的指令（Phase 1 schema 的 §6 落地）；Quick/Deep 深度定义随 PCR 更新（Quick = Identity+Map+Risks+Memo；Deep = 全 7 节）。

### Phase 3 — Checkpoint / Delta Research（能力层，对应 v0.9 前置）
- checkpoint ledger 已有（不重造）：做**跨会话 export/import 对齐**与 **delta 对比视图**（本次 vs 上次 committed 认知的 diff：新增/失效/矛盾 claims）。
- 新增 delta-research move：给定 T0 vs T0+n 快照（或当前树 vs 上次快照），输出"认知差异报告"（什么变了、上次的什么认知已失效、什么文档/代码漂移了）——这是 CDD 指标的落地点。
- 说明：不新增工具；只新增一个基于现有 checkpoint 能力的 move + 状态对比函数。

### Phase 4 — 连接 Coding Agent Workflow（生态集成，不扩 Researcher 权限）
- 输出侧已就绪：handoff JSON（PCR §7）作为机器接口。
- 集成演示：Researcher（cognition）→ Plan Mode（方案）→ Coding Agent（实现）→ Verifier（证据回流 Researcher）闭环；DSH 生态侧对接（讨论帖 #2651 演示 + #2994 市场提案）。
- v0.9 capsule/memory bridge 保持 roadmap（Researcher 永不获得 memory_write；一致性由 host 侧 freshness gate 承担）。

### 需要修改的文件列表
- `README.md`
- `researcher/preset.yml`（描述文案）
- `researcher/agent.cordis.yml`（persona 定位段；**仅文本**）
- `researcher/skills/research-report-template/SKILL.md`
- `researcher/skills/project-research-methodology/SKILL.md`
- `docs/handoff-schema.md`、`docs/landscape.md`、`docs/roadmap.md`、`docs/evaluation.md`、`docs/evaluation-protocol-v1.md`（v1.1）
- `evaluation/scoring/`（新打分器）
- 变体生成脚本 `evaluation/runtime/sync-presets.js`（PCR 覆盖继承到 quick/deep 变体后重新生成 + 重锁，遵守既有锁纪律）

### 不应该修改的核心部分（红线）
- `researcher/plugins/tool-restrict/`：零写契约、环境预检、fail-closed 守卫（产品存在性的根）。
- `researcher/plugins/research-doctor/`：Runtime Certificate（自证机制）——只允许修 bug，不允许改语义。
- `researcher/plugins/research-state/`：checkpoint 状态机（claims/hypotheses/views/重放不变式）——Phase 3 只在其上加读侧对比，不改 reducer。
- `researcher/plugins/git-read/`：参数注入防线与只读 allowlist。
- 证据分级语义 C0–C4、裁决态、BUILD/DON'T BUILD/INVESTIGATE 的"不知道合法"原则。
- blind benchmark 基建（snapshot/doctor/lock/bootstrap）与已冻结的 Flask 实验记录（含 0/60——它是范围声明的一部分，不删不改）。
- 评测纪律：不改 GT、不调 prompt 追分、不删失败 run。

---

## 结论（v0.7 一句话）

**Researcher v0.7 的产品定位：AI Coding Agent 的只读项目认知层 —— 用可验证证据重建项目认知、绘制风险地图、输出决策备忘录；它不是 bug 预测器（0/60 是范围声明不是缺陷），不是架构师（不承诺设计正确性），不是 Plan Mode 加强版（交付的是认知产物而非方案）——它是三者共用的认知底座。**

---

## 附录 A — 采纳的最终决策（2026-08-21 产品评审后）

1. **定位层级确认**：官方 = Project Cognition Layer；用户层 = Architecture Intelligence Assistant（架构智能分析助手）；营销层 = "为 AI Coding Agent 提供架构师级别的项目理解能力"——类比 Copilot 的 "pair programmer" 而非 "software engineer"。**禁用 "AI Architect Assistant" 作为官方定位。**
2. **认知不抽象**：README 核心问题改为"AI 可以快速修改代码，但不知道这个项目为什么这样设计"；用户路径：陌生项目 → 建立理解 → 识别约束 → 评估修改影响 → 生成决策依据。
3. **Bug Discovery → Risk Discovery**：不放弃发现叙事，改为风险叙事（"这里未来容易错" vs "这里错了"）。Flask GT-01 未命中（teardown chain abort）但发现了 cleanup lifecycle risk —— 这属于 Risk Discovery 命中。
4. **PCR 双层**：用户层 7 节 + AI 内部层（Evidence Ledger / Claims / Confidence / Certificate / Checkpoint State）不删除只摘要——驾驶舱隐喻。
5. **Researcher Benchmark Suite**：Understanding（GUS）/ Risk（ARD）/ Change Impact（DQ）/ Drift（CDD）四基准；Issue Recall 降为次级，Flask 实验保留。
6. **版本节奏**：v0.7.0 = 定位一致化（README / persona / report template / evaluation 文档，零核心代码改动）；**v0.7.1 = Cognition Benchmark（验证认知层真实存在：GUS / Impact / Risk / Drift 四组实验，取代原"Risk Map 深化"——Risk Map 已存在，缺的是价值证明）**；v0.8 = Structural Evidence；v0.9 = Project Intelligence Capsule / Risk Memory（吸收 Risk Map 深化）。
7. **最应避免**：① 急着加 Agent 能力（问题不是"不够聪明"而是"价值未被正确测量与呈现"）；② 与 DeepSeek/Codex 比写代码；③ 宣传 AI Architect。
8. **执行形态**：v0.7.0 是 Product Alignment 而非 Feature Development——统一定位、输出、评价体系；任何核心运行逻辑修改暂缓。
