# 项目研究 Project Research — 只读 Build-Shaping Agent（v2）

**先理解项目现状，再决定要不要动手。** Understand the project before deciding what to do with it.

本模式是 Plan Mode 的**认知上游**：在任何修改发生以前，建立项目真实状态模型，判断下一步到底**值得构建什么**——每个主要发现都以 **BUILD / DON'T BUILD / INVESTIGATE** 收束；"不知道"（INVESTIGATE）是合法且优质的输出。绝对只读，不是"迷茫时看看"，而是**重大开发方向进入 Plan 之前的决策层**。

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
- **只读四层保证**：write/edit 永拒桩 + 指引段遮蔽（工具层）｜沙箱 read-only（强制）｜审批 never（无升级通道）｜人格契约（行为约束）。只读是**机制**而非限制：能修复所见的 Agent 会滑向修复（goal drift），本模式被制度性禁止执行，token 全部花在理解、怀疑、比较与判断上。

## 用法

1. 新建会话 → 预设 **项目研究 Project Research**；权限 `read-only` + 审批 `never`（当前 UI 显示为 custom 组合，是最严格组合）。
2. 工作目录指向项目仓库，发送：**仓库说明 + 当前状态 + 你的困惑**。
3. 验收：`write`/`edit` 显示为 "DISABLED in research mode" 永拒桩；会话前后 `git status --porcelain` 一致。

## 报告

十四节：执行摘要（含分类汇总）→ 方法（含自查摘要）→ **项目模型重建**（含 初始假设→反证→修正假设）→ 架构地图 → 实现水平 → **证据台账（claim 卡片含裁决）** → 宣传与实现差距 → **竞品矩阵 + GitHub 可复用候选清单** → 优势 → **问题与权衡（问题链 + 12 维度表）** → 未验证假设 → 候选改进点（预分类）→ **建议与分类（交接包仅含 BUILD 项）** → 置信度与自查附录。报告在对话中输出（只读不写盘），复制保存是你的动作。

## 参考框架与保留意见

本版升级受 Andrew Ng《The AI Engineering Skills Map》启发（四类能力中"Shaping the build"正是本模式的理论依据）。保留意见：该文公布的是行业能力框架（1 万+招聘信息 + 访谈 + 调查），未公开完整数据集、聚类方法与权重，应视为有用框架而非严格定律；待其二级 Skills Map 发布后，值得将每个二级技能逐项映射到本模式的能力树。四个能力到本模式机制的完整映射、七项修改清单见仓库文档 [docs/ai-engineering-skills-map.md](https://github.com/TLNing260310/dsh-researcher/blob/main/docs/ai-engineering-skills-map.md)。

## 目录结构

```
researcher/
├── preset.yml                         # 显示名与描述
├── agent.cordis.yml                   # 组合：工具行 + persona + 限制行
├── plugins/tool-restrict/index.js     # write/edit 永拒桩 + 指引段遮蔽（随预设分发）
├── skills/project-research-methodology/SKILL.md   # 六模块 + 十一部 + 自查清单
├── skills/research-report-template/SKILL.md       # 十四节报告骨架
└── README.md
```
