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

统一前缀（三个实验共用）：*"Analyze this repository at the current snapshot. Produce a Project Cognition Report: project identity, architecture map, critical components, design decisions, risk map, change impact analysis, decision memo."*

- **Experiment A 附加**（无）：即统一任务。GUS/Risk GT 从 PCR §1–§5 打分。
- **Experiment B 附加**（变更请求，每仓库冻结一份）：
  - commander.js：*"A change is proposed: add support for command aliases with inheritance (child commands inherit parent aliases and options). Identify the full impact surface: which modules, tests, docs, API contracts, and configuration are affected; what breaks; what must be re-tested. Do not implement."*
  - cheerio：*"A change is proposed: add a streaming parse mode for large documents. Identify the full impact surface: which modules, tests, docs, API contracts, and configuration are affected; what breaks; what must be re-tested. Do not implement."*
  - 变更请求是**实验条件**（四个模式同样收到），不是 prompt 优化；冻结后不可改。
- **Experiment C 附加**（无）：统一任务 + 追加 *"Note which parts of the project have changed since ~3 months ago and which previous assumptions no longer hold."*（该句只出现在 run-2；同样作为冻结任务模板的一部分，对四个模式一致）。

## 4. Ground Truth 制定方法（先冻结后运行，全部 sha256 锁定）

### 4.1 Cognition GT（GUS + Risk，Experiment A）
- 编制者：两名独立 evaluator（A/B），**只读 T0 快照可见内容**（代码/文档/测试/README/CHANGES/git 历史），不看任何模式输出、不看未来。
- 类别与条目数（每仓库）：
  - **Identity**（8–12 条）：使命声称 vs 代码佐证、真实用户面、价值机制、当前状态、成熟度事实——每条必须是"可核对的事实"，附规范证据锚（file:line/commit）。
  - **Architecture**（10–15 条）：核心模块清单、分层/边界、入口点、主数据流、外部依赖边界。
  - **Components**（6–10 条）：热点组件（高变更/高耦合/低覆盖）、关键机制（shim 类）、其存在性与理由。
  - **Design rationale**（5–8 条）：关键设计决策及其可观察后果（"允许推理，但 GT 条目本身由 evaluator 从提交历史/CHANGES/代码遗迹确认存在"）。
  - **Risk areas**（6–10 条）：**风险区域**（"这里未来容易错"），不是具体 bug：例如未覆盖的兼容机制、文档与代码失配、语义变化未测试。每条附证据锚。
- 合并：复用 `fixtures/blind/adjudicate.js`（一致收录/排除，分歧 ambiguous 不进主评分，记 agreement_rate）；schema 用 `evaluation/cognition/adjudication-schema-v1.1.json`（新增）。
- 锁定：`sha256(cognition-gt.json)` 写入实验 snapshot.json（复用 blind-doctor 的 GT 锁检查，新增对 cognition-gt.json 的锁定字段）。

### 4.2 Impact GT（Experiment B）
- 编制者：两名独立 evaluator，从 T0 快照做静态影响分析（调用图、导入者、引用该模块的测试、文档/API 引用、配置面）。
- 输出格式：`{ change_id, impacted: [{ component, kind: direct|transitive|tests|docs|api|config, evidence }], critical_edges: [top-3 最高风险影响] }`。
- 锁定同 4.1。

### 4.3 Drift GT（Experiment C）
- 编制者：两名独立 evaluator，在独立 clone 上对 `T0..T0+n` diff 筛选"认知相关变化"：`{ change_id, kind: architecture|api|module_move|doc_drift|semantics|dependency, from, to, cognition_impact }`。
- 判定标准（与 v1.0 三问同构）：变化是否反映真实语义（非 commit 噪声）；是否属于认知应追踪的类别；是否可被 T0+n 快照内的证据发现。
- 锁定同 4.1。

## 5. 评分标准（运行前冻结；matched/partial/unmatched 纪律与 v1.0 相同：不强行匹配、不确定记 ambiguous）

### 5.1 GUS（Experiment A 主指标）
- 条目级：matched（含义等价 + 有证据锚）/ partial（相关但不完整）/ unmatched。
- `GUS = matched / total`，另报 `partial` 数与 `matched+0.5*partial` 加权值。mean + range/模式。

### 5.2 Risk GT（Experiment A 的 §5 打分）
- Coverage = 命中的风险区域 / total；**False Alarm = 无证据支撑的风险主张 / 总风险主张**（不遮蔽：分母是运行自提的 Risk Map 条目）。
- 命中判定：运行提出的风险区域覆盖 GT 区域的主要意图（证据指向同一脆弱面）即 matched；同一区域不同具体 bug 不算 miss（这是 v1.0 学到的教训，写死在评分标准里：**Risk 区域粒度，非 bug 粒度**）。

### 5.3 Impact（Experiment B）
- Impact Recall = 命中的 impacted 组件 / total（按 kind 分列 direct/transitive/tests/docs/api/config）。
- Impact Precision = 运行声称受影响且真实的组件 / 声称总数（每项须有证据锚，否则计为 unsupported）。
- Critical Edge = 运行是否识别出 pre-registered top-3 中的 ≥2（二元记分，防分数稀释）。
- Decision Quality 附项：运行是否区分"直接破坏 / 需重测 / 文档契约"三级，且分级与 GT 一致（partial 档）。

### 5.4 Drift（Experiment C）
- Drift Recall = run-2 的 PCR 呈现的认知相关变化 / Drift GT total。
- Stale-Claim Invalidation = run-1 中"在 T0+n 已失效"的主张中，run-2 以证据明确纠正/否定的比例（evaluator 用 run-1 capsule vs run-2 PCR 对比判定；run-1 capsule = checkpoint export，产物侧已有）。
- Assumption Expiry = run-2 显式标注"旧假设不再成立"的条目 / GT 中属假设过期的条目。
- 一致性旁证：run-1 与 run-2 对未变化区域的描述是否矛盾（矛盾记负分项，进报告不遮丑）。

### 5.5 成本与纪律（沿用 v1.0）
- token（billed：input+output+reasoning，cache 单列）/ duration / tool calls / claims 数；cost-adjusted = 各指标 / 1M billed tokens。
- 报告 mean + range；正负结果全公开；结论标注 **Preliminary, not statistically conclusive**。
- 运行前 lock 检查、运行后金丝雀检查，任何 FAIL → 该 run INVALID 丢弃（保留记录）。

## 6. 需要新增的 evaluation 工件（清单）

| 工件 | 路径 | 用途 |
|---|---|---|
| 协议 v1.1 | `docs/evaluation-protocol-v1.1.md` | 本文件 |
| 认知裁决 schema | `evaluation/cognition/adjudication-schema-v1.1.json` | GUS/Risk/Impact/Drift 双人裁决合并 |
| Cognition GT 模板 | `evaluation/cognition/cognition-gt.template.json` | Identity/Architecture/Components/Rationale/Risk 五类条目格式 |
| Impact GT 模板 | `evaluation/cognition/impact-gt.template.json` | change_id + impacted kinds + critical_edges |
| Drift GT 模板 | `evaluation/cognition/drift-gt.template.json` | change kinds + cognition_impact |
| 任务模板 | `evaluation/prompts/exp-b-commander.txt`、`exp-b-cheerio.txt`、`exp-c-run2-suffix.txt` | 冻结实验条件（锁内） |
| 实验运行 manifest | `evaluation/runs/<repo>/exp-<a/b/c>-runs-manifest.json` | 种子化顺序（plan-runs.js 扩展 `--experiment`） |
| 评分器 | `evaluation/scoring/score-v11.js`（GUS/Risk/Impact/Drift 四合一，`--adjudicate` 折叠人工裁决，模式同 v1.0） | 自动候选 + 人工裁决折叠 |
| Capsule 对比工具 | `evaluation/scoring/capsule-diff.js` | run-1 checkpoint export vs run-2 PCR 的 claim 级对比（**evaluator 工具，非 Agent 能力**） |
| v1.1 锁 | `evaluation/locks/<repo>.<exp>.protocol-v1.1.lock` | eval-lock 扩展 `--gt <cognition-gt.json> --impact <impact-gt.json> --drift <drift-gt.json>` 覆盖新 GT |
| T0+n 选择记录 | `evaluation/cases/<repo>/t0n-selection.json` | Experiment C 的 T0+n 机械选择（t0-selector.js 复用） |

**不需要新增**：Agent 工具、prompt 系统段、守卫/医生/状态机、blind 基建、eval runner。评分器与 manifest 是 evaluator 侧工件。

## 7. Roadmap 影响

- v0.7.1 = **Cognition Benchmark**（本协议执行），取代原"Risk Map 深化"（Risk Map 已存在，缺的是价值证明；深化并入 v0.9 Risk Memory/Capsule 前）。
- v0.8 = Structural Evidence（不变）；v0.9 = Risk Memory / Project Intelligence Capsule（不变，吸收 Risk Map 深化）。
- 执行顺序建议：commander.js 先行（小型，GT 预期 0–3 风险区），跑通 v1.1 全链后复制到 cheerio。

## 8. 版本纪律

- 本协议与全部 GT 在任何 v1.1 运行前冻结并 commit；`--check` 失败 → 协议再 bump + 受影响实验重跑。
- 运行中使用 v0.7.0 对齐后的 preset（persona/PCR 模板）——这正是 v1.1 要验证的认知产物形态；Flask v1.0 结果作为历史基线保留。
- 禁止项：不添加 Agent 能力、不修改 prompt 以追求结果、不根据实验调整评分规则、不删除失败 run、不修改 Flask Phase A 记录。
