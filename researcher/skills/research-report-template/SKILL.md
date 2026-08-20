# Research Report Template (v2)

The canonical output outline of the `researcher` preset. Load this skill before writing the final report and follow the fourteen sections in order. Rules that apply to the whole document:

- Every factual statement carries a citation (`file:line`, commit hash, or URL) or is explicitly marked **未验证（研究者推断）**.
- Every claim in the ledger appears in section 6 with a tier AND a verdict; nothing gets a tier without an id.
- State uncertainty openly: per-section confidence, and what evidence would raise it.
- The conclusion is a classification (BUILD / DON'T BUILD / INVESTIGATE), not a to-do list. "不知道" is a legitimate output.
- The report is the final message of the conversation. It cannot be saved to disk in read-only mode — remind the user they can copy it out.

## 0. 运行证明（Runtime Proof）

Quote the Researcher Runtime Certificate produced by your mandatory first `research_doctor` call — including its **Run: #N** and **History** lines — plus a one-line note of any doctor re-runs and their verdicts. A report without this block is incomplete: every report carries the proof that the runtime was verified before research began.

## 1. 执行摘要
One paragraph: what the project actually is (C1+ evidence), its maturity level, top 3 risks — and the headline: the classification summary, e.g. **N 项发现 → X BUILD / Y DON'T BUILD / Z INVESTIGATE**，以及 Recommended action（可能为 NONE）。End with overall confidence.

## 2. 研究范围与方法
What was read (directories, file count), the sampling strategy, which of the eleven moves were completed at which depth, tier + verdict definitions (one line each), and — explicitly — what was NOT verified and why (e.g. runtime behavior: read-only mode does not run the project). Include the **research state summary** (claims / hypotheses / views counts, final dirty set — should be empty or explained) and the **research self-check summary**: which of the 10 items passed, which failed and were fixed, which were disclosed.

## 3. 项目模型重建
The Project Model table: Mission / User / Problem / Value mechanism / Architecture / Current state / Evidence / Constraints — each field with a citation. Then the hypothesis track: **初始假设 → 反证检索（CHALLENGE 执行了什么）→ 修正后的假设**。And the purpose comparison: claimed purpose (C0) vs code-reconstructed purpose (C1) vs what history shows (git).

## 4. 架构地图
Text + mermaid diagrams: modules/layers, entry points, data flow for core scenarios. Every component labeled with an entry `file:line`.

## 5. 技术实现水平
A table of subsystems: `子系统 | 成熟度判断 | 证据级别 | 引用 | 备注`. Maturity words must be tied to a tier.

## 6. 证据台账（核心）
The complete claim ledger as claim cards:

`编号 | 主张 | 层级 C0–C4 | 裁决 | 证据 | 缺失证据 | 置信度`

- 裁决 ∈ {Known, Likely, Claimed, Unknown, Contradicted}。
- 证据: what supports the reached tier (cited). 缺失证据: what would upgrade it and does not exist yet. 置信度: High / Medium / Low, justified by the gap.
- Include the user's own descriptions as claims too.

## 7. 宣传与实现差距
Every contradiction found, side by side: the claim text (cited) vs. what the code does (cited). If none: say so and say how hard you looked.

## 8. 现实世界对照：竞品与可复用项目
**8a 竞品矩阵**: `维度 | 本项目 | 竞品A | 竞品B … | 来源与采集日期`. 3–6 peers. State the overlap honestly (e.g. "与 X 约 70% 功能重叠") and name the genuinely different part.

**8b GitHub 可复用项目候选清单**: `候选项目 | 可集成/组合/替代的现有部分 | 与现状的重叠度 | 引入成本与风险 | 活跃度/许可证 | 证据 URL`. Headline deliverable: for each hand-rolled part that matters, is there a mature open-source project that already does it. Every row needs a URL; rows without activity/license data are marked lower confidence.

## 9. 优势
Only strengths with C1+ evidence. Each with its citation. An unproven differentiator belongs in section 11, not here.

## 10. 问题与权衡
Every observed issue through the **Problem-Before-Solution chain**: `问题 | 造成的用户/业务问题 | 严重性（在什么规模） | 严重性的证据 | 是否值得现在干预 | 候选方向`。Plus the **Tradeoff Scanner** table: `维度 | 现状 | 证据 | 是否是当前瓶颈` across cost / performance / reliability / complexity / security / privacy / maintainability / scalability / observability / developer experience / user experience / lock-in. Never assume more engineering is better — a dimension marked "不是当前瓶颈" is a finding too.

## 11. 未验证假设
Each assumption: what it is, why it matters, how to verify it, the cost of verifying, and what changes in the conclusions if it turns out false. Unproven differentiators live here.

## 12. 候选改进点
Top-N opportunities ordered by 价值 × 可行性/成本, each with its dialectical weighing (value, cost, risk, strongest counter-argument) AND its pre-classification: BUILD / DON'T BUILD / INVESTIGATE. These are candidates — section 13 is the decision.

## 13. 建议与分类
- **分类总表**: `发现 | 分类 (BUILD / DON'T BUILD / INVESTIGATE) | 依据（引用）`。
- **Recommended action**: e.g. `NONE` / `INVESTIGATE：先验证 B` / `BUILD：接入候选项目 Y 替代手写 X`。
- **Before modifying**: for every BUILD item — the concrete prerequisites (experiment, feedback, comparison) and what evidence would change the classification.
- **Handoff brief（交接包）**: a self-contained, paste-ready brief for the NEXT session (a coding preset with plan mode and workspace-write permissions), containing ONLY the BUILD items: project path, target preset + permissions, each BUILD item with its evidence citations, scope boundary (what NOT to touch), and which report sections back it. Research never gains write capability — the handoff is between sessions across a human decision gate. Do not write an implementation plan here.

## 14. 置信度声明、研究自查与附录
Per-section confidence + what would raise it. The complete research self-check result (10 items, honest). Then: methodology summary, tool-call log highlights, complete list of files read, and the full list of external sources with dates. End with the zero-modification statement: the session made no writes (verify with `git status --porcelain` before you finish and report the result).
