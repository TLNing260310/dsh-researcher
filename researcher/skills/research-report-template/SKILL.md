# Research Report Template

The canonical output outline of the `researcher` preset. Load this skill before writing the final report and follow the fourteen sections in order. Rules that apply to the whole document:

- Every factual statement carries a citation (`file:line`, commit hash, or URL) or is explicitly marked **未验证（研究者推断）**.
- Every claim graded in the ledger appears in section 6 as a claim card; nothing gets a tier without an id.
- State uncertainty openly: per-section confidence, and what evidence would raise it.
- The conclusion is a diagnosis plus a recommendation — which may be "Recommended action: NONE". This is a first-class result, not a failure.
- The report is the final message of the conversation. It cannot be saved to disk in read-only mode — remind the user they can copy it out.

## 1. 执行摘要
One paragraph: what the project actually is (C1+ evidence), its maturity level, top 3 risks, top 3 opportunities — and the headline: **Recommended action** (which may be NONE). End with the overall confidence of the report.

## 2. 研究范围与方法
What was read (directories, file count), the sampling strategy, which of the eight moves were completed at which depth, the evidence-tier definitions (one line each), and — explicitly — what was NOT verified and why (e.g. runtime behavior: read-only mode does not run the project).

## 3. 项目目的理解
Claimed purpose (C0, cited) vs. purpose reconstructed from code (C1, cited) vs. what history shows the project used to be (git evidence). State the gaps explicitly.

## 4. 架构地图
Text + mermaid diagrams: modules/layers, entry points, data flow for core scenarios. Every component labeled with an entry `file:line`.

## 5. 技术实现水平
A table of subsystems: `子系统 | 成熟度判断 | 证据级别 | 引用 | 备注`. Maturity words must be tied to a tier.

## 6. 证据台账（核心）
The complete claim ledger as claim cards:

`编号 | 主张 | 状态（C0–C4） | 证据 | 缺失证据 | 置信度`

- 状态: the tier reached, e.g. `IMPLEMENTED / PARTIALLY TESTED` — never a bare tier without the evidence.
- 证据: what supports the reached tier (cited).
- 缺失证据: what would upgrade it and does not exist yet (e.g. 未发现独立客户端跨环境端到端复现实验).
- 置信度: High / Medium / Low, justified by the evidence gap.
Include the user's own descriptions as claims too.

## 7. 宣传与实现差距
Every contradiction found, side by side: the claim text (cited) vs. what the code does (cited). If none: say so and say how hard you looked.

## 8. 现实世界对照：竞品与可复用项目
**8a 竞品矩阵**: `维度 | 本项目 | 竞品A | 竞品B … | 来源与采集日期`. 3–6 peers. State the overlap honestly (e.g. "与 X 约 70% 功能重叠") and name the genuinely different part. Include criteria like 功能面、架构、活跃度、许可证、成熟度证据.

**8b GitHub 可复用项目候选清单**: `候选项目 | 可集成/组合/替代的现有部分 | 与现状的重叠度 | 引入成本与风险 | 活跃度/许可证 | 证据 URL`. This is a headline deliverable: for each hand-rolled part that matters, is there a mature open-source project that already does it — integrate it, combine with it, or replace yours with it. Every row needs a URL; rows without activity/license data are marked lower confidence.

## 9. 优势
Only strengths with C1+ evidence. Each with its citation. A differentiator that is unproven belongs in section 11, not here.

## 10. 风险与现实环境问题
Table graded by probability × impact: `风险 | 概率 | 影响 | 证据 | 触发条件`. Probability needs a basis, not a vibe. Explicitly cover real application environments: deployment, scale, security, operations, ecosystem compatibility — a problem the project would meet in production is a finding even if it never appears in a local run.

## 11. 未验证假设
Each assumption: what it is, why it matters, how to verify it, the cost of verifying, and what changes in the conclusions if it turns out false. This is where unproven differentiators live.

## 12. 最大价值改进点
Top-N opportunities ordered by 价值 × 可行性/成本. Each: the opportunity, the evidence it builds on, expected value, rough effort, risk of doing it. These are candidates — the recommendation in section 13 decides whether ANY of them is worth doing now.

## 13. 建议（Recommendation）
The recommended action — which **MAY BE NONE**. Format:

- **Recommended action**: e.g. `NONE` / `验证 B 的可行性` / `停止开发 A，转向 B` / `接入候选项目 Y 替代手写 X`.
- **Reason**: the diagnosis behind it, cited.
- **Candidate optimizations**: each weighed dialectically — value, cost, risk, and the strongest counter-argument against it (中肯: the counter-argument is stated, not hidden).
- **Before modifying**: the concrete prerequisites — experiment X to run, feedback Y to collect, comparison Z to finish — and what evidence would change the recommendation.
- **Handoff brief（交接包）**: when action exists, end the report with a self-contained, paste-ready brief for the NEXT session — a new session on a coding preset (e.g. 标准模式) with plan mode enabled and workspace-write permissions. The brief includes: project path, target preset + permissions to select, the recommendation with its evidence citations, the scope boundary (what to change / what NOT to touch), and which report sections back each claim. Research never gains write capability — the handoff is between sessions, across a human decision gate, never inside this one. Do not write an implementation plan here.

When multiple routes remain genuinely open, list 2–3 options with tradeoffs — but always end with the single recommendation the evidence supports, even if that recommendation is "decide nothing yet".

## 14. 置信度声明与附录
Per-section confidence + what would raise it. Then: methodology summary, tool-call log highlights, complete list of files read, and the full list of external sources with dates. End with the zero-modification statement: the session made no writes (verify with `git status --porcelain` before you finish and report the result).
