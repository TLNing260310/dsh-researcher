# evaluation-protocol-v1.1（Cognition Validation）

> 本文件是 v1.0（`evaluation-protocol-v1.md`）的继承协议，冻结于任何 v1.1 运行之前。**v1.0 文件保持原样**（Flask Phase A 在其下运行，记录为历史冻结，`--check` 按设计失败，见 `evaluation/cases/flask/notes.md` N-05）。
> 定位：**v0.7.1 = Cognition Benchmark v1 —— 验证 Project Cognition Layer 的核心价值是否真实存在**，而不是开发新功能。
> 硬约束（与 v0.6 相同）：不修改核心运行逻辑；不添加 Agent 能力；不修改 prompt 以追求结果；不根据实验结果调整评分规则；失败结果全部保留。

## 0. 动机（为什么是 v1.1 而不是继续 v1.0）

Flask Phase A 已回答"Researcher 是否比 Plan 更聪明（按未来 issue 召回）"：**不是**（0/60）。这个问题的错误之处在于它把认知层当成"更强的分析 Agent"。v1.1 验证的是另一个问题：

> **在 AI Coding Agent 普遍具备执行能力之后，谁负责维护 AI 对项目的长期正确理解？—— Researcher 作为认知层，是否真实提供了这种能力？**

验证的不是"更聪明"，而是四个可测的认知属性：

| # | 属性 | 对应指标 | 实验 |
|---|---|---|---|
| A | 陌生项目理解的准确性（认知重建） | Global Understanding Score (GUS) | Experiment A |
| B | 修改影响范围的判断质量 | Impact Recall / Impact Precision / Critical Edge | Experiment B |
| C | 架构风险发现（而非未来 bug 预测） | Risk GT Coverage / Risk False Alarm | Experiment A（含）+ 独立 Risk GT |
| D | 跨时间认知一致性（认知漂移检测） | Drift Recall / Stale-Claim Invalidation | Experiment C |

## 1. 实验矩阵（三个实验，两个仓库）

- 仓库沿用 Phase A 冻结选择（selection_result.json 已冻结、seed 可复现）：**tj/commander.js**（~27k stars）、**cheeriojs/cheerio**（~30k stars）——符合 10k–50k star 要求，且"完成并审查后才复制到 commander/cheerio"的门已开（Flask 已完成并审查）。**不重新选择。**
- 模式：Standard / Plan / Quick / Deep × 3 runs（每个实验每仓库）。
- 模型/推理/预算：与 Flask 一致（deepseek-official/deepseek-v4-flash，reasoning max，budget 500000，deviation D003 延续）；运行 harness（headless eval runner、eval patches、permission pinning）原样复用。
- 顺序：种子化随机（`dsh-researcher-v0.6-phase-a:<exp>-runs`），每个实验独立 manifest。
- 每次运行：全新 session、cwd=workspace、read-only + never、运行前后 blind-doctor（含金丝雀）。

## 2. T0 / T0+n 选择（机械，禁 cherry-pick）

- **Experiment A/B**：T0 = `t0-selector.js`（Rule A，种子 `dsh-researcher-v0.6-phase-a:<repo>`，与 Flask 同构造）在发布窗口内机械选取。snapshot 创建沿用 `blind-snapshot.js`。
- **Experiment C（漂移）**：需要两个快照：
  - T0：同上机械选取；
  - T0+n：T0 后 **90–120 天**的 main 提交，按同一规则机械选取（用相同种子、同构造，文档化）。T0+n ≤ 当前日期，且两快照之间必须有真实开发（协议 v1.0 §1 的活跃度要求）。
  - **Drift GT**：evaluator 对 `git diff T0..T0+n`（在两个快照外的独立 clone 上做）进行机械筛选 + 人工判定，列出"认知相关变化"（架构改变、API 移除/新增、模块迁移、文档漂移、依赖变化、语义变化）。与 v1.0 相同：T0 已潜伏才算（对未来时间点 T0+n 而言，T0+n 的代码状态是"当前事实"，漂移 GT 是"两个事实之间发生了什么"）。
  - **盲测关键**：run-1（T0）与 run-2（T0+n）是两个独立 session，**互不见面**；run-2 不得收到 run-1 的 capsule。跨 session 对比发生在 evaluator 侧（见 §5-D）。

## 3. Experiment 任务模板（每个实验冻结一份，锁内）

统一前缀（三个实验共用）：*"Analyze this repository at the current snapshot. Produce a Project Cognition Report with exactly these sections: (1) Project Identity, (2) Architecture Map, (3) Critical Components, (4) Design Decisions, (5) Risk Map, (6) Change Impact Analysis, (7) Decision Memo."*

- **Experiment A 附加**（无）：即统一任务。无具体变更请求时，§6 的语义 = "对决策备忘录候选变更（或最可能的改动类别）的影响框架"（类级 blast radius + gatekeepers + do-not-touch 区），不是具体变更的影响面。GUS/Risk GT 从 PCR §1–§5 打分。
- **Experiment B 附加**（变更请求，每仓库冻结一份）：
  - commander.js：*"A change is proposed: add support for command aliases with inheritance (child commands inherit parent aliases and options). Identify the full impact surface as a propagation chain: Command builder → Option resolution → parser (parseOptions) → help generation → subcommand dispatch → documentation and typings. For each edge name the affected module, the breaking behavior, and the tests that must move. Do not implement."*
  - cheerio：*"A change is proposed: add a streaming parse mode for large documents. Identify the full impact surface as a propagation chain: entry API → parser pipeline → selector engine → output modes → tests and documentation. For each edge name the affected module, the breaking behavior, and the tests that must move. Do not implement."*
  - 变更请求是**实验条件**（四个模式同样收到），不是 prompt 优化；冻结后不可改。
- **Experiment C 附加**（Synthetic Drift Test 为主路径）：
  - run-1（T0）：统一任务；
  - T1 构造：evaluator 侧用 mutation manifest（种子化、预注册：rename module / change API contract / 修改架构决策痕迹 / 移除 deprecated layer 各 1–2 项，每仓库 4–6 项）在 T0 workspace 的 clone 上注入并 commit，再做盲截断（复用 blind-snapshot 截断流程）；
  - run-2（T1）：统一任务 + *"Note which parts of the project have changed compared with a previous snapshot and which previous assumptions no longer hold."*（该句只出现在 run-2；同样作为冻结任务模板的一部分，对四个模式一致）。
  - 真实窗口漂移（T0→T0+90–120 天）降为 v0.9+ 的后续验证，不在 v0.7.1 主路径。

## 4. Ground Truth 制定方法（先冻结后运行，全部 sha256 锁定）

### 4.1 Cognition GT（GUS + Risk，Experiment A）
- 编制者：两名独立 evaluator（A/B），**只读 T0 快照可见内容**（代码/文档/测试/README/CHANGES/git 历史），不看任何模式输出、不看未来。
- **GT 条目规则（防"知识考试"）**：禁用"文件列举即可作答"型条目（版本号、文件行数、文件存在性、依赖列表本身）；每条必须要求关系/目的/约束推理，或归入 15% 事实桶并显式标记。GT 条目用**关系化表述**（"option.js 依赖 error.js 且被 command.js 使用"而非"lib/ 有 6 个文件"）。
- 类别与条目数（每仓库，按 GUS 权重配比）：
  - **Architecture relations**（40%，10–15 条）：模块间依赖/边界/数据流/派发路径——必须是关系或流程，非位置。
  - **Design purpose**（25%，6–10 条）：关键设计决策的存在性 + 可观察后果（"零依赖策略"及其约束力、"EventEmitter 作为内部总线兼公共兼容面"等）。
  - **Key constraints**（20%，5–8 条）：兼容契约、弃用面、版本纪律、do-not-touch 区。
  - **Factual accuracy**（15%，4–6 条）：版本/规模/测试面等可核对事实——此桶允许文件列举可作答条目，但**权重封顶 15%**。
  - **Risk areas**（另计，见 §5.2）：6–10 条"风险区域"，不是具体 bug，每条附证据锚。
- 合并：复用 `fixtures/blind/adjudicate.js`（一致收录/排除，分歧 ambiguous 不进主评分，记 agreement_rate）；schema 用 `evaluation/cognition/adjudication-schema-v1.1.json`（新增）。
- 锁定：`sha256(cognition-gt.json)` 写入实验 snapshot.json（复用 blind-doctor 的 GT 锁检查，新增对 cognition-gt.json 的锁定字段）。

### 4.2 Impact GT（Experiment B）
- 编制者：两名独立 evaluator，从 T0 快照做静态影响分析（调用图、导入者、引用该模块的测试、文档/API 引用、配置面）。
- 输出格式：`{ change_id, impacted: [{ component, kind: direct|transitive|tests|docs|api|config, evidence }], critical_edges: [top-3 最高风险影响] }`。
- 锁定同 4.1。

### 4.3 Drift GT（Experiment C — Synthetic Drift Test）
- **T1 构造（主路径）**：mutation manifest（种子化、预注册、每仓库 4–6 项，类别：rename module / change API contract / 修改架构决策痕迹 / 移除 deprecated layer），evaluator 在 T0 workspace 的 clone 上注入并 commit，再按 blind-snapshot 截断流程处理（T1 是独立盲快照，run-2 看不到注入动作）。
- **GT = 注入清单本身**（已知真值）：`{ mutation_id, kind, file/area, expected_cognition_impact, seeded_in }`。漂移 GT 的"认知相关变化"判定在此天然成立（注入项即真值），无需未来窗口。
- 真实窗口漂移（T0→T0+90–120 天）作为 v0.9+ 后续验证实验设计（沿用 v1.0 三问同构的 Drift GT 编制法），不阻塞 v0.7.1。

## 5. 评分标准（运行前冻结；matched/partial/unmatched 纪律与 v1.0 相同：不强行匹配、不确定记 ambiguous）

### 5.1 GUS（Experiment A 主指标）
- 条目级：matched（含义等价 + 有证据锚）/ partial（相关但不完整）/ unmatched。
- **分类加权**（防"知识考试"——文件检索型事实不得主导）：架构关系理解 **40%** / 设计目的理解 **25%** / 关键约束识别 **20%** / 事实准确性 **15%**。每类内 = matched/total，加权求和得 GUS；另报四类分项与 matched/partial 原始数。mean + range/模式。
- 评分器（score-v11.js）内置权重表，运行前冻结；GT 条目标注所属类别。

### 5.2 Risk GT（Experiment A 的 §5 打分）
- Coverage = 命中的风险区域 / total；**False Alarm = 无证据支撑的风险主张 / 总风险主张**（不遮蔽：分母是运行自提的 Risk Map 条目）。
- 命中判定：运行提出的风险区域覆盖 GT 区域的主要意图（证据指向同一脆弱面）即 matched；同一区域不同具体 bug 不算 miss（Risk 区域粒度，非 bug 粒度）。
- **bug 级发现 = 独立观察类**：运行输出的具体 bug 级发现（证据充分）既不记风险命中、也不计假警报，单独报告计数——防止"风险命中率"与"bug 预测"混淆。

### 5.3 Impact（Experiment B）
- **链式评分（防 dependency grep）**：Impact GT 以传播链（edge）为单位，如 aliases 继承 = Command builder → Option 解析 → parseOptions → Help 生成 → 子命令派发 → 文档/typings。计分 = 命中的链边 / 总链边（按 kind 分列 direct/transitive/tests/docs/api/config）。
- **证据要求**：每项命中必须展示传播关系（"改 X 会经过 Y 到达 Z"），仅提及文件名不算命中（计 unsupported 进 Precision 分母）。
- Impact Precision = 运行声称受影响且真实（有证据链）的组件 / 声称总数。
- **Critical Edge = 30% 权重**：运行是否识别出 pre-registered top-3 高危边中的 ≥2（二元记分），占总 Impact 分 30%，防"全覆盖低风险边"稀释。
- Decision Quality 附项：运行是否区分"直接破坏 / 需重测 / 文档契约"三级，且分级与 GT 一致（partial 档）。

### 5.4 Drift（Experiment C — Synthetic Drift Test）
- Mutation Recall = run-2 的 PCR 呈现的注入变化 / 注入清单 total（按 kind 分列）。
- Stale-Claim Invalidation = run-1 中"被注入变化直接失效"的主张中，run-2 以证据明确纠正/否定的比例（evaluator 用 run-1 capsule vs run-2 PCR 对比判定；run-1 capsule = checkpoint export）。
- Assumption Expiry = run-2 显式标注"旧假设不再成立"的条目 / 注入清单中属假设过期的条目。
- 一致性旁证：run-1 与 run-2 对未变化区域的描述是否矛盾（矛盾记负分项，进报告不遮丑）。
- 真实窗口漂移指标（v0.9+）：Drift Recall / Stale-Claim Invalidation 同构定义。

### 5.5 成本与纪律（沿用 v1.0）
- token（billed：input+output+reasoning，cache 单列）/ duration / tool calls / **claims 数（= checkpoint 状态中 claim 总数，revise 数组，非调用次数）**；cost-adjusted = 各指标 / 1M billed tokens。
- 外部事实条目：web_fetch 不可用时，外部条目（版本发布、CVE、生态事实）最高记 **C3**（检索快照级）；C4 需可验证来源。运行未验证的外部条目如实标 Unknown。
- 报告 mean + range；正负结果全公开；结论标注 **Preliminary, not statistically conclusive**。
- 运行前 lock 检查、运行后金丝雀检查，任何 FAIL → 该 run INVALID 丢弃（保留记录）。

## 6. 需要新增的 evaluation 工件（清单）

| 工件 | 路径 | 用途 |
|---|---|---|
| 协议 v1.1 | `docs/evaluation-protocol-v1.1.md` | 本文件 |
| 认知裁决 schema | `evaluation/cognition/adjudication-schema-v1.1.json` | GUS/Risk/Impact/Drift 双人裁决合并 |
| Cognition GT 模板 | `evaluation/cognition/cognition-gt.template.json` | 四类加权条目 + Risk 区域格式（含类别字段） |
| Impact GT 模板 | `evaluation/cognition/impact-gt.template.json` | 传播链 edges + critical_edges（top-3 高危边） |
| **Mutation manifest 模板** | `evaluation/cognition/mutation-manifest.template.json` | Synthetic Drift 注入清单（种子化、预注册、4–6 项/仓库） |
| **T1 快照构造脚本（evaluator 侧）** | `evaluation/runtime/build-t1-snapshot.js` | clone T0 workspace → 注入 manifest → commit → 盲截断 |
| 任务模板 | `evaluation/prompts/exp-b-commander.txt`、`exp-b-cheerio.txt`、`exp-c-run2-suffix.txt` | 冻结实验条件（锁内） |
| 实验运行 manifest | `evaluation/runs/<repo>/exp-<a/b/c>-runs-manifest.json` | 种子化顺序（plan-runs.js 扩展 `--experiment`） |
| 评分器 | `evaluation/scoring/score-v11.js`（GUS 权重表 40/25/20/15 + Impact 链式 + Critical Edge 30% + Drift 注入检出，`--adjudicate` 折叠人工裁决） | 自动候选 + 人工裁决折叠 |
| Capsule 对比工具 | `evaluation/scoring/capsule-diff.js` | run-1 checkpoint export vs run-2 PCR 的 claim 级对比（**evaluator 工具，非 Agent 能力**） |
| v1.1 锁 | `evaluation/locks/<repo>.<exp>.protocol-v1.1.lock` | eval-lock 扩展 `--gt <cognition-gt.json> --impact <impact-gt.json> --drift <drift-gt.json> --mutations <manifest.json>` 覆盖新 GT |
| T0 选择记录 | `evaluation/cases/<repo>/t0-selection.json` | 机械选择（t0-selector.js 复用） |

**不需要新增**：Agent 工具、prompt 系统段、守卫/医生/状态机、blind 基建、eval runner。评分器与 manifest 是 evaluator 侧工件。

## 7. Roadmap 影响

- v0.7.1 = **Cognition Benchmark**（本协议执行），取代原"Risk Map 深化"（Risk Map 已存在，缺的是价值证明；深化并入 v0.9 Risk Memory/Capsule 前）。
- v0.8 = Structural Evidence（不变）；v0.9 = Risk Memory / Project Intelligence Capsule（不变，吸收 Risk Map 深化）。
- 执行顺序建议：commander.js 先行（小型，GT 预期 0–3 风险区），跑通 v1.1 全链后复制到 cheerio。

## 8. 版本纪律

- 本协议与全部 GT 在任何 v1.1 运行前冻结并 commit；`--check` 失败 → 协议再 bump + 受影响实验重跑。
- 运行中使用 v0.7.0 对齐后的 preset（persona/PCR 模板）——这正是 v1.1 要验证的认知产物形态；Flask v1.0 结果作为历史基线保留。
- 禁止项：不添加 Agent 能力、不修改 prompt 以追求结果、不根据实验调整评分规则、不删除失败 run、不修改 Flask Phase A 记录。
