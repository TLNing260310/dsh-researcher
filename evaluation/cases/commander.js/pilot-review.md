# v0.7.1 Benchmark Validation Review — commander.js PCR Pilot

> 模式：Benchmark Validation Review（非正式评测）。试点：researcher-quick × 1 run，commander.js @ bf35c5f（T0 = 2026-02-01，Rule A 机械选择，seed `dsh-researcher-v0.6-phase-a:commander.js`，draw 3/17）。任务 = v1.1 Experiment A 统一任务。未评分、未冻结 GT、未跑矩阵。硬约束遵守：未改核心逻辑、未改评分规则、未改 prompt 追结果。

## 1. 运行事实

- exit 0；Runtime Certificate **SAFE**；金丝雀 PASS；0 write 尝试；43 工具调用（git_read/read/grep/web_search）；billed tokens ≈ 199.5k（input 159k + output 40k）；时长 192s。
- 输出：23.5k 字符，**7 节用户层全部在场**（编号 1–9，含模型自插的 DIAGNOSE+CHALLENGE 与 Handoff，语义映射无歧义）+ Appendix（claim ledger summary 16 claims / 2 hypotheses / 4 views，经 research_checkpoint 提交）。

## 2. PCR 质量审查（对照七个评价问题）

| 检查项 | 判定 | 依据 |
|---|---|---|
| §1 Identity：是否回答"项目是什么/服务谁/核心价值"？ | **PASS** | "the de-facto standard declarative framework for Node.js command-line programs… parse argv, generate help, dispatch subcommands, exit with correct codes"，并显式"不是 CLI 工具/不是运行时/不是生成器"；服务对象（CLI 消费者 + TS 消费者）与核心价值（零依赖单用途解析库）明确 |
| §2 Architecture Map：是否形成"输入→解析→命令层级→执行→输出"？ | **PASS** | ASCII 图 + 5 步 parse pipeline（_prepareUserArgs → parseOptions → 值解析 → _parseCommand → dispatch/exit）+ executable 双派发路径 + 模块依赖；**非文件列表** |
| §3 Critical Components：是否给出变更敏感度排序？ | **PASS** | C1–C7 带 file:line 与"为什么关键"（parseOptions 每次解析必经、Help WYSIWYG 回归面等） |
| §4 Design Decisions：是否给出理由与约束？ | **PASS** | 11 项决策，含"零依赖是任何改动的硬约束"（CONTRIBUTING.md:40）等可执行约束 |
| §5 Risk Map：是否输出风险区域而非 bug 列表？ | **PASS** | 9 个风险区域（maintainer 集中、compat 负担、类型漂移、hard-exit 语义、parseOptions 微妙性、生态破坏、v15 周期、CI 噪声、Windows 路径），每项 = severity/likelihood/evidence/mitigants；显式"无 security findings"；推断标注（Node 20 EOL 未验证） |
| §6 Change Impact：是否支持"改 X 先看哪里"？ | **PASS（框架级）** | 8 类变更 × blast radius × gatekeepers × 注意项 + do-not-touch 区；Decision Memo 明确"最高风险文件 = lib/command.js (parseOptions/dispatch)"。注意：无具体变更请求时 §6 是类级框架——见协议漏洞 L-4 |
| §7 Decision Memo：是否可支持决策？ | **PASS** | "No BUILD items" + 明确姿态（不加功能/不加依赖、watch v15 与 bus factor）+ INVESTIGATE 项带证据与"不得仅凭推断行动"约束 + 空 build_items 的 handoff JSON + do_not_touch |

**结论：PCR 输出形态可评价，模板与 persona 端到端工作。** 试点未发现需要回炉的模板缺陷。

## 3. 协议漏洞清单（Benchmark Protocol v1.1 审查）

| # | 漏洞 | 证据/推理 | 严重度 |
|---|---|---|---|
| L-1 | **GUS 可能变成知识考试（文件检索竞赛）** | 试点 §1 含可由文件列举直接作答的事实（version/license/文件行数/依赖数/测试文件数）。纯事实覆盖率 GUS 会让 grep Agent 高分，测的是检索不是理解 | **高** |
| L-2 | **Impact 可能退化成 dependency grep** | 试点 §6 是类级框架；若 Experiment B 按"找到引用文件数"计分，aliases 修改会变成"搜 alias → 10 个文件"。真正要测的是传播链（Command → Option → Parser → Help → Dispatch → Docs） | **高** |
| L-3 | **Drift 周期太长** | +90–120 天等待在项目早期不可行；CDD 是最有潜力指标，但 v0.7.1 无法等到真实窗口 | **高** |
| L-4 | Experiment A 任务含"change impact analysis"但无具体变更请求 | 试点用"类级影响框架"化解；协议未定义无变更时 §6 的语义 | 中 |
| L-5 | 任务模板未强制 7 节标题 | 试点输出 9 个编号节（自插 DIAGNOSE+CHALLENGE 与 Handoff）；语义可映射但给评分器留歧义 | 低 |
| L-6 | claims 指标计的是 checkpoint 调用次数不是 claim 数 | 试点 1 次调用 = 16 claims；metrics 的 claims=1 误导 | 低 |
| L-7 | Risk 条目与 bug 级发现的关系未定义 | 若运行输出证据充分的 bug 级发现，现行规则既不记命中也不计假警报——需要显式观察类 | 中 |
| L-8 | 外部事实条目（C4 npm 发布确认）依赖 web_search 快照 | 试点诚实标注 C4 + 无 fetch 限制；协议应规定外部条目最高到 C3 除非可 fetch 验证 | 低 |

## 4. 是否允许冻结 commander.js GT：**暂缓**

理由：L-1/L-2/L-3 直接改变 GT 编制与评分方式（GUS 权重、Impact 链式评分、Synthetic Drift 实验）。**先修改 protocol v1.1（§5 修改清单），再冻结 GT**——否则冻结的 GT 会内嵌"知识考试"缺陷。冻结条件：修改完成 + 双 evaluator 认知 GT 编制 + sha256 锁定 + v1.1 lock。

## 5. 需要修改的 protocol v1.1 内容（已应用于文档）

1. **§5.1 GUS 加权与 GT 条目规则**：能力权重 = 架构关系理解 40% / 设计目的理解 25% / 关键约束识别 20% / 事实准确性 15%；GT 条目禁用"文件列举即可作答"型（每条必须要求关系/目的/约束推理，或归入 15% 事实桶）；GT 条目用关系化表述（"option.js 依赖 error.js 且被 command.js 使用"，而非"lib/ 有 6 个文件"）。
2. **§5.3 Impact 链式评分**：Impact GT 以传播链（edge）为单位（如 aliases 继承：Command builder → Option 解析 → parseOptions → Help 生成 → 子命令派发 → 文档/typings）；计分 = 链边覆盖率，**不按文件数**；证据必须展示传播关系（仅提及文件不算）；**Critical Edge 权重 30%**。
3. **§3/§4.3 Synthetic Drift Test（主路径）**：T0 PCR → 注入式 T1（mutation manifest，种子化预注册：rename module / change API contract / 修改架构决策 / 移除 deprecated layer），构造 = clone + 注入 + commit + 盲截断；GT = 注入清单（已知真值）；指标 = 注入变化检出率 + 旧认知失效检出（Stale-Claim Invalidation）；真实窗口漂移降为 v0.9+ 后续验证。
4. **§5.2 Risk**：bug 级发现定义为独立观察类（不记风险命中、证据充分时不计假警报，单独报告）；风险条目格式（likelihood+impact+evidence）以试点为准。
5. **§3 任务模板**：Experiment A 任务显式列出 7 节标题；无变更请求时 §6 语义 = "对决策备忘录候选变更的影响框架"（试点即此形态）。
6. **§6 工件清单**：新增 mutation manifest 模板、T1 快照构造脚本（evaluator 侧）、GUS 权重表（score-v11.js 内）。
7. **§5 指标备注**：claims = checkpoint 状态 claim 数（revise 数组），非调用次数。
8. **§5.1 外部事实**：不可 fetch 时外部条目最高 C3；C4 需可验证来源。

## 6. 试点本身的产物价值

- 试点 PCR 本身就是一份可审计的认知产物样例（可作为后续 GUS 评分的人工校准样本）。
- 试点证明：v0.7.0 对齐后的 persona + PCR 模板产出**风险区域粒度**的输出（§5 九项全是"未来容易错的地方"），与 Flask 教训一致。
- 试点暴露的"§7 DIAGNOSE+CHALLENGE 自插节"说明 Quick 管道的反证检索自然融合进 PCR——模板无需砍掉该内容，评分器按语义映射即可。

## 7. 下一步（按序）

Step 3（修改已应用）→ 双 evaluator 编制 commander.js 认知 GT（按修订规则）→ sha256 锁定 → v1.1 lock → Step 4 正式实验（commander.js Experiment A 起）。
