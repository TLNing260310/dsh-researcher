# v0.7.1 Architecture Audit — Evaluation Architect Review

> 作者角色:Evaluation Architect(非开发者、非 Researcher 优化者、非 Prompt Engineer)。
> 方法:以 Researcher 实际代码(researcher/ 全部 8 个文件)+ 实验产物(evaluation/ 全部)+ 协议文档(docs/)为审计对象,不用 README 声明代替代码事实。
> 立场声明:本研究保持中立。**不为证明 Researcher 有效而设计实验;同样不为否定而否定。** 所有判断基于可核验证据,失败标准预注册。

---

## 第一部分:架构审计

### A. 当前定位(从代码核验)

**A1. 声明层**:`preset.yml` 自称 "Project Cognition Layer for AI software engineering" —— "不是 Bug 预测器,不是 AI 架构师,不是 Plan Mode 的加强版——它是三者共用的认知底座"。

**A2. 机制层(实际代码)**:

| 机制 | 代码事实 | 服务对象 |
|---|---|---|
| 只读强制 | `tool-restrict`(fail-closed:启动预检 sandbox=read-only + approval=never;write/edit 永拒桩;指引段遮蔽;执行时 guard) | 身份边界:认知层不执行,只理解 |
| 唯一子进程 | `git-read`(固定 allowlist:status/log/show/diff/ls-files/blame/rev-parse/hash-object;无 shell、无 -c、参数注入封死) | 取证能力,替代 pwsh |
| 证据状态机 | `research-state`:claim ledger 为单一事实源,project model/diagnosis/classification 为派生视图;evidence→claim→hypothesis→view 依赖图;局部失效 + 只重算脏节点;假设版本化(invalidated 不删除) | **长期认知的机制核心** |
| 会话重放 | 同一 reducer 服务执行与重放;`agent/created` 时从会话日志重建状态;export/importState 提供跨会话转移 | 跨 session 认知继承 |
| 自证完整性 | `research-doctor`:7 项运行时检查 + SAFE/DEGRADED/UNSAFE 证书 + 历史折叠 | 可审计性(证明"按设计运行") |
| 输出契约 | PCR 双层:7 节用户层 + AI 内部层(Evidence Ledger/Certificate/Checkpoint State) | 认知产物形态 |

**A3. 判断**:**当前定位没有偏移 —— Researcher 的核心价值机制仍然是"长期项目认知"**。证据:checkpoint/claims/evidence 机制(research-state)是唯一真正区别于普通 Plan Mode 的机制,且其设计目标全部指向时间维度(跨会话重放、局部失效、版本化假设、export/import 状态继承)。它不是"高级 Plan Mode 的加速器"——它没有任何执行/规划增量,只有认知维护增量。

**A4. 定位与 Experiment A 的关系**:Experiment A 测的是"单次、静态、无变更上下文的认知重建"(Single Snapshot Understanding),这是认知层的最弱维度(时间维度为零)。A 的结果(Plan ≥ Standard ≥ Quick ≥ Deep)**没有触及**核心机制(research-state 在 A 中从未被评分:claims 数与 GUS 零相关,基线 claims=0)。因此 A 不能作为"定位偏移"的证据,也不支持"定位不成立"。

### B. 潜在架构漂移(逐项检查)

**B1. 为 benchmark 优化而偏移?—— 未发现,但有一个真实风险点。**

- 已检查:persona、PCR 模板、research-state、research-doctor 在 Experiment A 之后**零修改**(git 历史:仅 docs/ 与 evaluation/ 变更)。无"根据 A 结果调整 prompt/GT/scoring"痕迹。
- **风险点(真实存在)**:protocol v1.1 §3 的 Experiment B 任务模板(commander.js)预注册为 *"add support for command aliases with inheritance"* —— 这是**人工挑选的变更请求**,与"机械化选择、禁 cherry-pick"原则冲突。已在上轮用 `mutation-selector.js`(种子化抽取 6 项)覆盖此问题,B 草案 §3 已写明禁人工增删。**现状已修复,但需在冻结前核验 B 不再引用旧的 aliases 变更请求。**

**B2. 机制是否真正服务长期认知?—— 是,但有一个缺口。**

- research-state 的依赖图、局部失效、版本化假设**就是**长期认知维护的机制(H2 的载体)。
- **缺口**:跨会话继承目前只有 `export`/`importState`(手动、模型自驱),没有自动的跨 session 状态桥(v0.9 Memory Bridge 是 roadmap 承诺,未实现)。这意味着 H2 的"维护"在**当前工具面上可测**(importState 已存在),但"自动继承"未落地 —— 这不是漂移,是未完成,且**不影响本阶段实验**(evaluator 侧可显式传递 export)。

**B3. 定位是否收缩成"高级 Plan Mode"?—— 否。**

- 无执行能力、无规划产物、无 diff 思维(人格明令 "Never think in diffs")。Plan 模式在 A 中胜出,但那是**任务形态匹配**(清单核对),不是 Researcher 向 Plan 形态靠拢。

**B4. 文档与代码一致性**:README/persona/PCR 模板三方一致(Project Cognition Layer 定位)。无"文档超前于代码"的漂移。

### C. 必须保持的不变量(任何实验/版本不得破坏)

1. **只读边界**:sandbox=read-only + approval=never + write/edit 永拒桩 + 无通用 shell。任何实验不得放松(包括为了"让 Researcher 写 capsule 文件"——capsule 必须走会话日志或 evaluator 侧转移,不授予写权限)。
2. **证据纪律**:C0–C4 定级 + Known/Likely/Claimed/Unknown/Contradicted 裁决态;每条事实带 file:line/commit/URL 锚。这是产品本体,不是 benchmark 装饰。
3. **零写契约**:research-state 只写 DSH 会话日志,不碰项目文件系统。
4. **GT/评分/协议冻结纪律**:先冻结后运行;失败结果全保留;不根据结果调整规则。
5. **盲测链**:T0/T1 快照截断、金丝雀、evaluator 与模型输出隔离。
6. **身份边界**:不预测具体 bug(只给 Risk 区域)、不设计架构(只给理解与决策输入)、不实现(只给 BUILD/DON'T BUILD/INVESTIGATE)。
7. **claim 台账永不删除**:假设版本化,invalidated 保留历史(审计可追溯)。

---

## 第二部分:实验路线审查

### 2.1 Experiment B(Change Impact Understanding, H1)

**是否验证不可替代能力?**
- 部分成立。影响链推理(change → dependency → behavior → contract)是 Researcher 声称的能力(PCR §6),且 A 从未测过。B 的链路正确性评分(仅提文件名=unsupported)确实指向"理解"而非"检索"。
- **但 B 不验证"不可替代"**——它验证"更好"(Researcher vs 基线对比)。"不可替代"需要 B 失败时基线也系统性失败(即该任务对无认知结构的模式不可解),这在协议中没有作为预期注册。建议在预期表中补充:"所有模式 Impact Recall 均低 → 任务过难;仅 Researcher 高 → 不可替代信号(弱证据,需 C 佐证)"。

**指标审查**:

| 指标 | 合理性 | 风险 |
|---|---|---|
| Impact Recall(链边,按 kind 分列) | 高:防 dependency grep,要求传播关系 | GT 链边完整性依赖 evaluator 静态分析质量;链边漏编 → Recall 天花板 |
| Impact Precision(有证据链声称/总声称) | 高:惩罚"列一堆文件" | 声称集合去重标准需冻结(同一组件两种表述算不算两条?) |
| Critical Edge Detection(30% 权重) | 高:防"全覆盖低风险边";≥2 二元记分简单可复现 | top-3 预注册主观性;6 个 mutation 各 3 条 critical edge,样本小 |
| **Cost-Normalized Score(CNS)** | **高且必要**:A 的核心教训就是成本与收益分离;CNS 是价值边界判断的主视角 | 需防"成本最低者恒赢"——已用"分差 ≤0.05 + 成本 ≥1.5× → 判定无补偿"的预注册规则对冲;原始分与 CNS 并报 |

**Benchmark gaming 风险(B)**:
1. **mutation 选择**:已机械化(种子 `dsh-researcher-v0.6-phase-a:commander.js:exp-b-mutations`),禁 cherry-pick ✓。
2. **change_summary 措辞偏向**:mutation 的 change_summary 由 evaluator 编写,若措辞"结构化为 PCR 风格"则偏向 Researcher(它有 PCR 模板),若"工程人风格"则中性。**需冻结前核验:change_summary 仅描述变更事实,不含任务引导结构。**
3. **evaluator 知模式**:Impact 裁决(evaluator 判定命中/Precision)若不盲模式,可能无意识偏袒。A 已记录 D001 单评估者限制;建议 B 裁决时对报告做模式匿名化(去 run_id/模式名),至少在同批内随机化审阅顺序。
4. **CNS 的 token 口径**:cache reads 单列是正确选择(否则 Deep 的缓存命中会虚高 CNS)。

### 2.2 Experiment C(Synthetic Drift, H2 + H3)

**核心审计发现:C 的当前设计测 H3,不测 H2。**

- protocol v1.1 §2 盲测关键:run-2 **不得**收到 run-1 的 capsule,跨 session 对比发生在 evaluator 侧。
- 因此 run-2 没有任何"待维护的旧认知"输入 —— 它只能做**变化检测 + 从 T1 状态推断旧假设失效**(Stale Claim Detection,H3)。
- **H2(Longitudinal Cognition Maintenance)需要状态继承**:run-2 接收 run-1 的 checkpoint export(现有 `importState` 机制即可,无需改 Researcher 代码),然后测"维护后的认知质量 vs 从零重建"。这**不在当前 C 设计中**。
- 结论:**H2 需要一个新变体(Phase D)或 C 的状态继承臂**。当前 C 草案把 H2/H3 混在同一实验名下,是路线审查必须修正的偏差。

**指标审查(C)**:

| 指标 | 合理性 | 风险 |
|---|---|---|
| Mutation Recall(注入检出/注入清单) | 中-高:GT=注入清单本身,真值已知 | **git 历史可见性风险(见下)**;检出判定若允许"列出 diff 文件名"即退化为 grep |
| Stale-Claim Invalidation(run-1 claim 被 run-2 纠正/否定) | 高:直接测 claim 机制价值 | run-2 无 run-1 capsule 时,该指标退化为"run-2 主动声明旧假设失效"——判定标准需冻结("如何知道旧假设"必须由 run-2 自证来源) |
| Assumption Expiry(显式标注"旧假设不再成立") | 高:测主动失效意愿 | 假阳性(未变区域被误报失效)需单独计数(草案已有 False Invalidation ✓) |
| 基线替代指标(全文矛盾修正率) | 必要但不完全可比 | claims=0 的基线用全文对比,与 claim 级对比粒度不同 —— **不对称本身是发现,但需在报告中显式声明不可直接比较** |

**Benchmark gaming 风险(C)—— 两个真实威胁**:

1. **git 历史可见性(高威胁)**:`git_read` 允许 `log`/`show`/`diff`。T1 快照若保留注入 commit,run-2 用 `git_read diff/show` 即可**机械读出注入内容**,Mutation Recall 变成"读 diff",而非"认知漂移检测"。这是工具面(已存在,不可改)与实验设计(可改)的冲突。
   - **缓解(不修改 Researcher)**:T1 快照构造时把注入 squash 进 T0 的截断点(注入 commit 不出现在历史中,或历史只保留到 T0),使 git 历史无法暴露注入;评估侧把 Mutation Recall 的"呈现"定义为**必须展示认知影响**(哪条旧假设/机制被破坏),仅列出 diff 文件名不计 matched(与 B 的 unsupported 纪律同构)。**协议草案 §3.2 必须补此条。**
2. **注入可发现性不均**:MUT-01(restoreStateBeforeParse 行为翻转)与 MUT-06(错误消息文本)的可发现性差异巨大。C 草案已有"注入完整性检查(可发现性)"✓,但应预注册**可发现性分级**(显式 API 变化=高可发现 / 行为语义变化=中 / 消息文本=低),报告按级分列,防止"低可发现 mutation 全 miss"被误读为能力缺失。

### 2.3 总评

- B/C 指标整体**合理且防 gaming**(链路正确性、Critical Edge 权重、CNS、claim 级对比、False Invalidation)。
- 三个必须修正点:(1) B 冻结前核验 change_summary 中性 + 删除旧的 aliases 变更请求;(2) C 的 T1 构造必须处理 git 历史可见性;(3) **H2 与 H3 分离**:C 只测 H3,状态继承臂(H2)归 Phase D。

---

## 第三部分:设计下一阶段(不修改 Researcher / prompt / GT / scoring)

### Phase B — Experiment B 执行计划(顺序:先 B)

1. **Impact GT 双 evaluator 校准**:两名独立 evaluator 从快照 + mutation-manifest 的 DRAFT 链独立编制 impact_chain/critical_edges;合并(复用 `fixtures/blind/adjudicate.js`);冻结为 `impact-gt-frozen.json` + sha256。
2. **任务模板**:`evaluation/prompts/exp-b-pcr.txt`(统一前缀 + change_summary 冻结版;核验 change_summary 中性)。
3. **运行 manifest**:`plan-runs.js` 扩展,种子 `dsh-researcher-v0.6-phase-a:exp-b-runs`,12 runs,mutation 分配按 §4.2(每 mutation ≥2 模式、每模式 ≥3 mutation)。
4. **Step-0 锁检查**(exp-b 独立锁:protocol draft + impact-gt + mutation manifest 哈希)→ 12 runs(eval-headless 复用,read-only + never,盲 doctor)。
5. **裁决**:evaluator 逐链判定(报告模式匿名化);score-exp-b.js 折叠:Recall/Precision/CriticalEdge/CNS。
6. **产出**:`evaluation/results/experiment-b/`(raw/score/analysis/limitations);结论句式按草案 §8。

### Phase C — Experiment C 执行计划(顺序:后 B,因 B 的 mutation 注入经验直接复用)

0. **前置修正(冻结前)**:
   - T1 构造脚本 `build-t1-snapshot.js`:注入 squash 进截断点,git 历史不暴露注入;补"注入完整性 3 检查"(diff 一致性 / 可发现性 / 金丝雀截断)。
   - Mutation Recall 判定标准:呈现须含认知影响,仅 diff 文件名不计 matched。
   - 可发现性分级预注册。
1. 注入子集抽签(种子 `dsh-researcher-v0.6-phase-a:commander.js:exp-c-inject`,4–6 项)→ 构造 T1 盲快照。
2. Drift GT 冻结(注入清单 + 失效映射 + N/A 规则:run-1 未产生的 claim 不计分母)。
3. run-1(T0 统一任务)+ run-2(T1 + 冻结附加句),12 × 2 sessions,互不见面。
4. capsule-diff.js(evaluator 侧)+ score-exp-c.js;产出 `evaluation/results/experiment-c/`。

### Phase D — 长期真实开发模拟实验(新设计,H2 主场)

**目标**:测 H2(Longitudinal Cognition Maintenance)—— 状态继承下的认知维护是否优于/成本低于从零重建。这是"Project Cognition Layer 的价值是否存在于时间维度"的直接检验。

**设计要点(全部复用现有机制,不改 Researcher)**:

1. **开发剧本(预注册、机械化)**:在 T0 快照上定义 4 个连续阶段(T0→T1→T2→T3),每阶段 = 1 个"真实开发动作"(取自 mutation manifest 的 6 项,按种子顺序分配 + 少量文档/测试同步变更,模拟真实 PR),每阶段一个独立盲快照。
2. **两种条件(同批对比)**:
   - **维护臂(Researcher 特有)**:run 在每个阶段接收**上一阶段的 checkpoint export**(research_checkpoint importState,evaluator 侧显式传递,模拟 Memory Bridge),更新认知,输出 PCR + 新 export。
   - **重建臂(基线 + Researcher 对照)**:每个阶段从零开始(无历史状态),输出 PCR。
   - Researcher 同跑两臂(维护 vs 重建),基线只跑重建臂。
3. **指标**:
   - Maintenance Recall = 被阶段变化直接失效的旧 claim 中,维护臂正确失效/修正的比例(claim 级,与 C 的 Stale-Claim Invalidation 同构但**有真实旧状态输入**)。
   - Consistency Drift = 未变化区域的 claim 在相邻阶段间的稳定性(矛盾率)。
   - **Rebuild Cost Ratio = 维护臂累计 billed tokens / 重建臂累计 billed tokens**(成本归一化,直接回答"增量维护是否更省")。
   - Decision Quality:每阶段 Decision Memo 与 GT 对照。
4. **回答的问题**:维护臂 vs 重建臂 —— 谁更准(Recall/一致性)?谁更省(成本比)?若维护臂在同等或更低成本下达到 ≥ 重建臂的准确率,**H2 成立**;否则 H2 不成立。
5. **约束**:剧本与阶段划分在运行前冻结;失败 run 保留;基线无 claims → 一致性指标用全文对比(同 C 的不对称声明)。

### Phase 顺序建议

B(影响,12 runs)→ C(漂移,24 sessions)→ D(维护,~4 阶段 × 2 臂 × 3 reps)。每步独立冻结、独立报告;任何一步出现系统性 FAIL(边界违规/证书 DEGRADED)→ 停步报告,不继续。

---

## 第四部分:失败标准(预注册,研究中立)

### H1 失败(Change Impact Understanding 无增益)

- **判定**:Researcher(Quick/Deep)Impact Score 与 CNS 均不优于 Plan/Standard(差距 ≤0.05 采样带),或 Critical Edge 检出无差异。
- **意味着**:修改影响理解不是认知层的可辩护价值 —— 该能力被模型通用推理能力覆盖,不需要认知结构。PCR §6 的价值主张降级。
- **不意味着**:Researcher 整体失败(只死一个维度)。

### H2 失败(Longitudinal Cognition Maintenance 无增益)

- **判定**:Phase D 中维护臂准确率(Recovery/Consistency)≤ 重建臂,且成本无优势(比值 ≥1.0)。
- **意味着**:**最严重的失败**。checkpoint/claims/依赖图/局部失效的整套机制没有提供超过"每阶段重跑"的价值 —— 认知层的机制核心失效。claim ledger 沦为仪式。
- **不意味着**:单快照理解失败(那是 A,已测);H2 失败与 H1/H3 失败相互独立。

### H3 失败(Stale Claim Detection 无增益)

- **判定**:C 中 Researcher Mutation Recall / Invalidation / Assumption Expiry 均不优于基线替代指标,且可发现性分级后仍无差异。
- **意味着**:无记忆条件下的变化/漂移检测是模型通用能力,认知结构未提供增量。
- **不意味着**:H2 失败(带状态的维护可能仍然成立 —— H3 失败 + H2 成立是合法组合:"变化检测不需要结构,但维护需要")。

### 何时承认 Project Cognition Layer 方向不成立(预注册门槛)

**承认标准(需满足其一,且经双仓库验证)**:

1. **H2 失败(充分条件)**:维护臂不优于重建臂。因为"跨时间认知维护"是 Project Cognition Layer 区别于"只读分析工具"的唯一核心主张;H2 失败 = 定位的机制基础消失。此时**即使 H1/H3 成立**,也只能定位为"高质量只读报告生成器"(有价值的产品,但不是认知层)。
2. **H1 + H3 同时失败且 H2 无显著收益**:三个可测维度(影响/漂移/维护)全部无增益,叠加 A 的单快照削弱 → 四个维度全部失败 → 认知层作为独立层的定位不成立,应降级为 standard preset 的一个只读 persona 变体。

**承认的纪律**:

- 单仓库(commander.js)结果**不触发承认**——先复制 cheerio(或第二类型仓库)验证方向一致性;若第二仓库同样失败 → 承认。
- 承认前检查:任务形态是否系统性不利于认知结构(如清单核对型)?检查方式是**报告局限**,不是调整 GT —— 禁止用改 GT/prompt 让结果翻盘。
- 承认不是耻辱:它意味着"Researcher 的机制无增量"被**证明**(而非被忽略),这正是评测体系存在的意义。承认后保留全部记录,作为"反例资产"。

---

## 结论(本审计)

1. **定位无偏移**:Researcher 核心机制仍是长期项目认知(checkpoint/claims/evidence),不是高级 Plan Mode;Experiment A 未触及该机制,不能作为定位失效证据。
2. **路线基本健康**:B/C 指标防 gaming 设计到位(CNS 是必要补充);但存在三个必须修正点:H2/H3 分离、C 的 git 历史可见性、change_summary 中性核验。
3. **下一阶段**:B → C → D(维护臂 vs 重建臂),全部复用现有机制,零 Researcher 修改。
4. **失败标准已预注册**:H2 失败是充分承认条件;H1+H3+H2 全败是充分条件;双仓库验证后才承认;研究中立保持。

---
*本文件不含任何修改 Researcher / prompt / GT / scoring 的方案(Phase B/C/D 均为实验设计,复用现有工具面)。*
