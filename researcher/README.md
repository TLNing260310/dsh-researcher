# 项目研究 Project Research — 只读 Build-Shaping Agent（v2）

**先理解项目现状，再决定要不要动手。** Understand the project before deciding what to do with it.

本模式是 Plan Mode 的**认知上游**：在任何修改发生以前，建立项目真实状态模型，判断下一步到底**值得构建什么**——每个主要发现都以 **BUILD / DON'T BUILD / INVESTIGATE** 收束；"不知道"（INVESTIGATE）是合法且优质的输出。绝对只读，不是"迷茫时看看"，而是**重大开发方向进入 Plan 之前的决策层**。

## 它要解决的现实问题

> **AI 的每一次修改看起来都合理，但系统架构逐渐漂移。**
> **防止 AI 在每一步都"做对"的同时，把整个项目做错。**

AI 辅助开发放大了代码生产速度，却没有同步放大理解速度：每一个 diff 局部看起来都合理——修一个 bug、加一个功能、换一个依赖——但十次、一百次"合理"的修改叠加之后，项目可能已经偏离最初目标，架构发生结构性漂移（局部最优从不自动等于全局最优，米格-25 效应），而作者往往是最后一个意识到的人。本模式为这个现实问题而存在：在任何修改发生以前（以及在任何修改把项目推离轨道以前），重建项目的全局真实状态——它声称什么、实际实现什么、测试证明什么、在现实世界中处于什么位置、下一步到底值不值得继续构建。三大失败模式（局部最优 / 上下文保真 / 时间漂移）与相邻项目对比见 [docs/landscape.md](https://github.com/TLNing260310/dsh-researcher/blob/main/docs/landscape.md)。Coding agents accelerate implementation；**本模式 restores understanding**。

## 四角色闭环

```
Researcher（本模式）   What should we build, if anything? → evidence + diagnosis + direction
        ↓ BUILD 项
Plan                   How should we build it? → implementation specification
        ↓
Coding Agent           Build it. → working implementation
        ↓
Verifier / Eval        Did it actually work? → evidence ───→ 回到 Researcher
```

实施成本被 Agent 快速压低后，软件生产的瓶颈正在从 "How do we build it?" 移到 "What should we build?"——本模式拥有后者的全部预算。

## 十一部管道

```
DISCOVER          制图 + 全量主张提取 + 初始假设
   ↓
RECONSTRUCT       项目模型重建（Mission/User/Problem/Value/Architecture/State/Evidence/Constraints）
   ↓
EVIDENCE MAP      主张定级 C0–C4 + 裁决（Known/Likely/Claimed/Unknown/Contradicted）
   ↓
DIAGNOSE          Problem-Before-Solution 链（禁止 问题→功能 跳跃）
   ↓
TRADEOFF ANALYSIS 12 维度扫描（不默认"更多工程=更好"）
   ↓
EXTERNAL RESEARCH papers/competitors/standards + GitHub 可复用项目发现
   ↓
COMPARE           不同选择，而非"更先进"
   ↓
CHALLENGE         反证检索：什么证据会让我的判断是错的？
   ↓
SHAPE             什么值得改变、为什么是现在
   ↓
CLASSIFY          BUILD / DON'T BUILD / INVESTIGATE
   ↓
SELF-EVAL         研究自查清单（10 项，逐项如实）
   ↓
HANDOFF           仅 BUILD 项交给 Plan（跨会话、经你的决策）
```

## 核心机制

- **证据分级 C0–C4**：Claimed / Implemented / Tested / Observed / Externally verified——README 说做到 ≠ 代码实现 ≠ 测试证明 ≠ 运行观察 ≠ 外部复现。
- **裁决态**：每条主张给 Known / Likely / Claimed / Unknown / Contradicted——杜绝"把作者意图当项目现实"。
- **研究状态（v0.3.0）**：`research_checkpoint` 工具维护主张台账与依赖图；新证据推翻旧判断时**局部失效 + 只重算脏节点**，不整管重跑、不重读已读文件；假设版本化演化，报告呈现轨迹。
- **只读四层保证（v0.4.0 起自包含）**：环境预检（验证 sandbox=read-only + approval=never，选错配置**拒绝启动**，子会话自动收紧）｜write/edit 永拒桩 + 指引段遮蔽（工具层，fail-closed）｜沙箱 read-only（强制）｜审批 never（无升级通道）｜人格契约（行为约束）。只读是**机制**而非限制：能修复所见的 Agent 会滑向修复（goal drift），本模式被制度性禁止执行，token 全部花在理解、怀疑、比较与判断上。

## 用法

1. 新建会话 → 预设 **项目研究 Project Research**；权限 `read-only` + 审批 `never`（当前 UI 显示为 custom 组合，是最严格组合）。
2. 工作目录指向项目仓库，直接发送问题，或使用 `/researcher <问题>`；若要为后续执行建立完成标准，使用 `/researcher goal <任务>`，只生成待人工审批的 Goal Contract 草案。
3. 验收：`write`/`edit` 显示为 "DISABLED in research mode" 永拒桩；会话前后 `git status --porcelain` 一致。

本 preset 是持续且可自证的 certified Researcher Mode。Governed Coding preset 内也支持 `/researcher <问题>` 单次只读 turn 与 `/researcher on|off` guarded mode，但后者没有本 preset 的 OS sandbox Runtime Certificate，不能混称为同一级别证明。

## 报告

Project Cognition Report 使用 7 节用户层（Identity / Architecture / Critical Components / Decisions / Risks / Change Impact / Decision Memo）+ AI 内部证据附录。末尾 handoff v2 仅含 BUILD 项，同时携带 cognition hash、项目目的、已证明/未证明价值、不变量、约束、未知、desired outcomes 与 non-goals。报告在对话中输出（只读不写盘），复制或由 host 流程批准保存是你的动作。

## 参考框架与保留意见

本版升级受 Andrew Ng《The AI Engineering Skills Map》启发（四类能力中"Shaping the build"正是本模式的理论依据）。保留意见：该文公布的是行业能力框架（1 万+招聘信息 + 访谈 + 调查），未公开完整数据集、聚类方法与权重，应视为有用框架而非严格定律；待其二级 Skills Map 发布后，值得将每个二级技能逐项映射到本模式的能力树。四个能力到本模式机制的完整映射、七项修改清单见仓库文档 [docs/ai-engineering-skills-map.md](https://github.com/TLNing260310/dsh-researcher/blob/main/docs/ai-engineering-skills-map.md)。

## 目录结构

```
researcher/
├── preset.yml                         # 显示名与描述
├── agent.cordis.yml                   # 组合：工具行 + persona + 限制行
├── plugins/tool-restrict/index.js     # 只读守卫：环境预检 + 永拒桩 + 指引段遮蔽
├── plugins/research-state/index.js    # 证据状态机：台账/依赖图/局部失效/会话日志重放
├── plugins/goal-governor/index.js     # /researcher 入口 + portable Goal Governor 的 DSH host adapter
├── plugins/git-read/index.js          # 白名单只读 git 工具（唯一的子进程能力，无 shell）
├── skills/project-research-methodology/SKILL.md   # 六模块 + 十一部 + 自查清单
├── skills/research-report-template/SKILL.md       # 十四节报告骨架
└── README.md
```
