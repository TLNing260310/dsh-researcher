# Project Cognition Report Template（PCR，v1）

The canonical output outline of the `researcher` preset — a **Project Cognition Report**. Load this skill before writing the final report.

## Two layers（双层结构）

Like a cockpit: passengers see altitude and speed; pilots keep the full instrument panel.
像飞机驾驶舱：乘客看到高度与速度；飞行员拥有完整仪表。

- **User layer（用户层）**：7 sections below, written for a reader who wants the cognition, not the research process. Readable in one pass.
- **AI-internal layer（AI 内部层）**：never deleted, only summarized into the appendices — Evidence Ledger, Claims, Confidence, Certificate, Checkpoint State. This is the technical moat: ordinary agents produce neither.

Rules that apply to the whole document:
- Every factual statement carries a citation (`file:line`, commit hash, or URL) or is explicitly marked **未验证（研究者推断）**.
- Every claim in the ledger appears in Appendix A with a tier AND a verdict; nothing gets a tier without an id.
- State uncertainty openly: per-section confidence, and what evidence would raise it.
- The conclusion is a Decision Memo (BUILD / DON'T BUILD / INVESTIGATE), not a to-do list. "不知道" is a legitimate output.
- The report is the final message of the conversation. It cannot be saved to disk in read-only mode — remind the user they can copy it out.

## §0. 运行证明（Runtime Proof）— always first

Quote the Researcher Runtime Certificate produced by your mandatory first `research_doctor` call — including its **Run: #N** and **History** lines — plus a one-line note of any doctor re-runs. Every report carries the proof that the runtime was verified before research began.

## User layer — 用户层（7 节）

### 1. Project Identity（项目身份）
What this project is: mission, real users, value mechanism, current state, maturity.
| 必须来自代码证据 | 允许推理（须标注） |
|---|---|
| 声称（C0：README/docs/CHANGES）+ 代码佐证（C1+：实际 API 面、测试规模、CI 事实、仓库状态） | 使命"为什么存在"的归纳；用户画像 |

End with the hypothesis track: 初始假设 → 反证检索（CHALLENGE 执行了什么）→ 修正后的假设。

### 2. Architecture Map（架构地图）
Modules / layers / boundaries / entry points / core data flow. Every component labeled with `file:line`. Mermaid diagrams welcome.
| 必须来自代码证据 | 允许推理（须标注） |
|---|---|
| 结构事实：包布局、导入关系、调用链、数据流（read/grep/git 历史） | "设计意图"注释；边界合理性判断 |

### 3. Critical Components（核心组件）
Hotspots: high change frequency, high coupling, low test coverage, shim-like mechanisms.
| 必须来自代码证据 | 允许推理（须标注） |
|---|---|
| 变更频率（git log/blame）、测试覆盖（grep 测试引用）、耦合证据、调用面 | "为什么是风险热点"的归因 |

### 4. Design Decisions（设计决策）
What was decided, why, at what cost, and which constraints it left behind.
| 必须来自代码证据 | 允许推理（须标注） |
|---|---|
| 决策事实：commit message / CHANGES / issue 链接 / 代码遗迹（deprecation、注释、遗留 shim） | 决策动机重构（须标注"推断"）；腐蚀 vs 演化判定（corrosion question） |

### 5. Risk Map（风险地图）
For every observed issue, the problem chain: `问题 | 造成的用户/业务问题 | 严重性（在什么规模） | 严重性的证据 | 是否值得现在干预 | 候选方向`.
**Risk = "这里未来容易错"（places likely to fail or drift），不是 "这里错了"（specific bug prediction）。** Every risk must anchor to `file:line` / commit / test gap.
| 必须来自代码证据 | 允许推理（须标注） |
|---|---|
| 每条风险锚定 file:line/commit/测试缺口；矛盾发现（宣传 vs 实现差距）并列 | 严重性分级（在什么规模下成立）；Tradeoff Scanner 各维度是否当前瓶颈 |

### 6. Change Impact Analysis（修改影响分析）
For the change(s) under consideration (or the candidate change list): what breaks, what moves, what must be re-tested. If no specific change was asked for, present the impact surface of the top Decision Memo candidates.
| 必须来自代码证据 | 允许推理（须标注） |
|---|---|
| 依赖链与调用面证据；受影响测试断言 | "预测"的破坏后果（显式标为预测，带置信度） |

### 7. Decision Memo（决策建议）
- 分类总表：`发现 | 分类 (BUILD / DON'T BUILD / INVESTIGATE) | 依据（引用）`。
- Recommended action：`NONE` / `INVESTIGATE：先验证 X` / `BUILD：…`。
- Before modifying：每个 BUILD 项的前提与"什么证据会改变分类"。
- Handoff brief（交接包）：self-contained，包含 `research_handoff.json` 块（schema `dsh-researcher/handoff/v1`：`{ schema, run, certificate, build_items: [{ id, problem, evidence[], confidence, scope, do_not_touch[] }] }`）。JSON 是给 Plan Mode 的机器接口；Markdown 是其人类可读形式。Research 从不获得写能力——交接发生在会话之间、人类决策门之后。不写实现计划。
| 必须来自代码证据 | 允许推理（须标注） |
|---|---|
| 每项决策引用 Risk Map / 台账条目 | 优先级排序与时机判断 |

## AI-internal layer — AI 内部层（附录，不删除，只摘要呈现）

### Appendix A. 证据台账（Evidence Ledger，核心）
The complete claim ledger as claim cards:

`编号 | 主张 | 层级 C0–C4 | 裁决 | 证据 | 缺失证据 | 置信度`

- 裁决 ∈ {Known, Likely, Claimed, Unknown, Contradicted}。
- 证据: what supports the reached tier (cited). 缺失证据: what would upgrade it and does not exist yet. 置信度: High / Medium / Low, justified by the gap.
- Include the user's own descriptions as claims too.
- This appendix is the audit trail of every statement in the user layer: each user-layer claim is traceable to a ledger row.

### Appendix B. Checkpoint State（认知状态）
Research state summary: claims / hypotheses / views counts, final dirty set (should be empty or explained), hypothesis version history (the evolution trail, not just the final state).

### Appendix C. 现实世界对照（外部事实，如适用）
**Ca: 竞品矩阵**（`维度 | 本项目 | 竞品A | 竞品B … | 来源与采集日期`，3–6 peers，诚实陈述重叠度）。
**Cb: GitHub 可复用项目候选清单**（`候选项目 | 可集成/组合/替代的现有部分 | 重叠度 | 引入成本与风险 | 活跃度/许可证 | 证据 URL`）。
外部事实无法验证时标 Unknown 并说明（如 web_fetch 不可用）。

### Appendix D. 置信度声明、研究自查与附录
Per-section confidence + what would raise it. The complete research self-check result (10 items, honest). Then: methodology summary, tool-call log highlights, complete list of files read, full list of external sources with dates. End with the zero-modification statement: verify `git status --porcelain` and report the result.

## 范围声明（每份 PCR 固定段落）

This report is a cognition artifact, not a prediction: it does not claim to find specific future bugs, and it does not substitute for an architect's decisions. What it provides: evidence-backed project understanding, a risk map, and a decision memo — the inputs Plan Mode and coding agents build on. 本报告是认知产物而非预测：不声称发现具体未来 Bug，也不替代架构决策；它提供的是基于证据的项目理解、风险地图与决策依据。
