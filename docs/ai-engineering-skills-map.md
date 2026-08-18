# 受《The AI Engineering Skills Map》启发的修改说明

本文档记录 dsh-researcher v0.2.0（Build-Shaping 升级）与 Andrew Ng《The AI Engineering Skills Map》的关系：文章提供了什么框架、我们由此做了哪些修改、以及我们对文章本身的方法论保留意见。

## 一、文章背景

- 作者：Andrew Ng，发布于 2026-08-14（LinkedIn）。
- 数据来源（作者自述）：1 万余份招聘信息，结合 AI 专家、招聘经理、招聘人员的结构化访谈、调查及其他在线数据。
- 核心产出：聚类出四类最重要的 AI Engineering 能力：

| 能力 | 表面含义 | 更深层含义 |
|---|---|---|
| Building & deploying AI applications | 构建 AI 应用 | 控制不确定系统 |
| Software engineering fundamentals | 软件工程基本功 | 知道 AI 做出的技术选择意味着什么 |
| Using coding agents | 使用 Coding Agent | 管理 AI 的工作过程 |
| Shaping the build | 塑造要构建的东西 | 决定什么值得做 |

文章同时判断：随着 Coding Agent 压低实现成本，软件开发的瓶颈正在从 **"How do we build it?"** 向 **"What should we build?"** 转移。

## 二、四个能力 → 本模式的映射

| 文章能力 | 文章的核心观点 | 映射到 Researcher 的机制（v0.2.0） |
|---|---|---|
| Building AI applications | evals / error analysis / statistical measurement / steering —— 建立"运行→测量→找错→修改→再测量"闭环 | **证据分级 C0–C4**（Claimed/Implemented/Tested/Observed/Externally verified）+ **裁决态**（Known/Likely/Claimed/Unknown/Contradicted）+ **研究自查清单**（10 项，Researcher 自身的 verifier） |
| Software engineering fundamentals | 不要求比 AI 更会写代码，但必须能识别"这里存在一个需要判断的 tradeoff" | **Tradeoff Scanner**：12 维度扫描（cost/performance/reliability/complexity/security/privacy/maintainability/scalability/observability/DX/UX/lock-in），并强制"不默认更多工程 = 更好"（SQLite 在正确规模下可以是更好的选择） |
| Using coding agents | 管理 AI 的工作过程：何时干预、何时放手、planning vs execution、给 Agent verifier、避免 goal drift | **四角色闭环**（Researcher → Plan → Agent → Verifier → 证据回流 Researcher）+ 交接纪律（仅 BUILD 项进入 Plan，跨会话经人类决策）+ 子代理分片取证；**只读边界的 goal-drift 论证**（能修复所见的 Agent 会滑向修复） |
| Shaping the build | 瓶颈从 "How to build" 移到 "What to build"；人类最值钱的工作是决定 spec 里有什么 | **本模式的存在理由**：项目模型重建（Mission/User/Problem/Value/Architecture/State/Evidence/Constraints）→ Problem-Before-Solution 链 → **BUILD / DON'T BUILD / INVESTIGATE 分类**（"不知道"是合法输出）→ 反证检索（disconfirmation search） |

## 三、由此产生的 v0.2.0 修改清单

| # | 修改 | 之前（v0.1.0） | 现在（v0.2.0） |
|---|---|---|---|
| 1 | 项目模型重建 | RECONSTRUCT 只做"从代码重建架构" | 八字段世界模型（Mission/User/Problem/Value mechanism/Architecture/Current state/Evidence/Constraints），先建模、后评价 |
| 2 | 证据台账裁决态 | 只有 C0–C4 层级 | 层级 + 五态裁决（Known/Likely/Claimed/Unknown/Contradicted），杜绝"把作者意图当项目现实" |
| 3 | Tradeoff Scanner | "架构可以优化"式模糊结论 | 12 维度扫描 + "该维度是否当前瓶颈"是强制输出；不默认更多工程更好 |
| 4 | Problem-Before-Solution | 观察到问题后可给方向 | 强制四步链（用户/业务问题→严重性与规模→证据→是否值得干预→才到候选方向）；"问题→功能"跳跃被禁止 |
| 5 | 三态分类 | "Recommended action: NONE" 存在 | 每个主要发现强制归入 **BUILD / DON'T BUILD / INVESTIGATE**；明确禁止"研究完必须给改进建议"的模型反射 |
| 6 | 反证检索 | CHALLENGE 只做"攻击假设" | 增加正式的 disconfirmation search：初始假设 → 主动搜索推翻自己的证据 → 修正假设（报告 §3 呈现完整轨迹） |
| 7 | 研究自查 | 无 | 10 项 self-check（含"是否提议了没有需求证据的构建"），失败项必须修复或披露 |

以上修改分布在：`researcher/agent.cordis.yml`（persona 十一部管道）、`researcher/skills/project-research-methodology/SKILL.md`（六模块）、`researcher/skills/research-report-template/SKILL.md`（十四节报告）。详见 [CHANGELOG](../CHANGELOG.md) v0.2.0。

## 四、方法论保留意见

对文章本身，我们保持如下保留（已写入仓库 README 与预设文档）：

1. 文章公布的**顶层版本**尚未公开完整数据集、聚类方法、权重或四项能力的定量排序依据；因此将其视为**非常有用的行业能力框架**，而非已被严格证明的"AI 工程四大能力定律"。
2. 作者已声明更详细的二级 Skills Map 将在后续文章发布。
3. 我们的承诺（已列入路线图）：**二级 Skills Map 发布后，将每个二级技能逐项映射到 Researcher 的能力树**，并据以把本模式从"一份大 Prompt"逐步演化为更明确的 research harness（例如把自查升级为子代理对抗式复核）。

## 五、参考

- Andrew Ng, *The AI Engineering Skills Map*（LinkedIn，2026-08-14）
- [CHANGELOG v0.2.0](../CHANGELOG.md)
- [methodology skill](../researcher/skills/project-research-methodology/SKILL.md)
- [persona](../researcher/agent.cordis.yml)
