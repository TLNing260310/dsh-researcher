# dsh-researcher

**项目研究 Project Research** — a read-only build-shaping agent preset for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

> Understand the project before deciding what to do with it.
> 先理解项目现状，再决定要不要动手。

**只读 Build-Shaping Agent**：在任何修改发生以前，建立项目真实状态模型，判断下一步到底**值得构建什么**——每个主要发现以 **BUILD / DON'T BUILD / INVESTIGATE** 收束，"不知道"是合法输出。它是 Plan Mode 的**认知上游**，是重大开发方向进入 Plan 之前的决策层，而不只是"迷茫时看看"。零修改保证不靠提示词祈祷，而靠四层机制（永拒桩工具 + 沙箱只读 + 审批永不升级 + 写代码不进入注意力面）。

## 它要解决的现实问题

> **AI 的每一次修改看起来都合理，但系统架构逐渐漂移。**

AI 辅助开发放大了代码生产速度，却没有同步放大理解速度：每一个 diff 局部看起来都合理——修一个 bug、加一个功能、换一个依赖——但十次、一百次"合理"的修改叠加之后，项目可能已经偏离最初目标，架构发生结构性漂移，而作者往往是最后一个意识到的人。本模式为这个现实问题而存在：在任何修改发生以前（以及在任何修改把项目推离轨道以前），重建项目的全局真实状态——它声称什么、实际实现什么、测试证明什么、在现实世界中处于什么位置、下一步到底值不值得继续构建。

Coding agents accelerate implementation. **Research Mode restores understanding.**

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

实施成本被 Agent 快速压低后，软件生产的瓶颈正在从 "How do we build it?" 移到 "What should we build?"——本模式拥有后者的全部预算。本定位与 v0.2.0 的七项修改受 Andrew Ng《The AI Engineering Skills Map》启发（含四个能力的逐项映射与方法论保留意见，详见 [docs/ai-engineering-skills-map.md](./docs/ai-engineering-skills-map.md)）。

## 十一部管道

```
DISCOVER → RECONSTRUCT（项目模型）→ EVIDENCE MAP（C0–C4 + 裁决）→ DIAGNOSE（问题链）
→ TRADEOFF ANALYSIS（12 维度）→ EXTERNAL RESEARCH（含 GitHub 复用项目）→ COMPARE
→ CHALLENGE（反证检索）→ SHAPE → CLASSIFY（BUILD/DON'T BUILD/INVESTIGATE）
→ SELF-EVAL（10 项自查）→ HANDOFF（仅 BUILD 项交 Plan）
```

管道是**逻辑线性、状态可回边**的：证据台账（`research_checkpoint` 状态工具）是唯一事实源，项目模型/诊断/分类都是它的派生视图。新证据推翻旧判断时只**局部失效 + 重算脏节点**，绝不整管重跑、绝不重读已读文件；假设带版本演化（H1 v1 → invalidated），报告呈现演化轨迹。

## v0.3.0 工程化升级

- **Fail-closed 只读守卫**：`tool-restrict` 默认 STRICT——桩注册、指引段遮蔽、可见性预检任一失败即拒绝启动会话（响亮报错），不再静默退化为 sandbox-only；`compat` 模式可选。
- **Research State 插件**：`research_checkpoint` 工具维护主张台账 + 假设/视图依赖图（revision + dirty set），只写 DSH 会话日志、零文件系统写入；todo_write 降级为索引。
- **令牌层 L0→L2**：制图只看结构 → 子代理只回证据包（非原始仓库倾倒）→ 只有改变主张/模型/分类的信息进入主上下文。
- **Compaction 参数调优**（thresholdRatio 0.68 / retainRatio 0.12 / maxTokens 4096 + 更积极的 pruner）。
- **安装脚本版本预检**：verified `0.1.0-rc.6`，其余版本告警并说明 fail-closed 行为。

## 快速安装

**Windows (PowerShell):**

```powershell
git clone https://github.com/TLNing260310/dsh-researcher.git
cd dsh-researcher
.\install.ps1
```

**macOS / Linux (bash):**

```bash
git clone https://github.com/TLNing260310/dsh-researcher.git
cd dsh-researcher
./install.sh
```

脚本把 `researcher/` 目录复制到 `${DSH_HOME:-~/.dsh}/.agent-presets/researcher`。也可以手动复制。

**不用 git 也行**：GitHub 仓库页 **Download ZIP** → 解压 → 把其中的 `researcher/` 文件夹复制到 `${DSH_HOME:-~/.dsh}/.agent-presets/`，立刻出现在预设选择器（无需重启）。

> 社区索引约定：本仓库以 GitHub topic **`dsh-plugin`** 打标。搜索 `topic:dsh-plugin` 可发现同类 DSH 插件/预设；内置一键安装的市场方案已提案上游：[Discussions #2994](https://github.com/deepseek-ai/deepseek-harness/discussions/2994)。

## 使用

1. 新建会话，预设选择 **项目研究 Project Research**。
2. 权限选择 **read-only（只读）**，审批策略选择 **never**（当前 UI 中 read-only + never 显示为 custom 组合，是最严格的组合；命名的 `read-only` 预设保留 `ask`，由你逐次把关升级请求）。
3. 工作目录指向你的项目仓库，发送：**仓库说明 + 当前状态 + 你的困惑**。
4. 验收：`write`/`edit` 显示为 "DISABLED in research mode" 的永拒桩；会话前后 `git status --porcelain` 一致。

## 它输出什么

十四节《项目体检报告》：执行摘要（含 BUILD/DON'T BUILD/INVESTIGATE 分类汇总）→ 研究范围与方法（含自查摘要）→ **项目模型重建**（Mission/User/Problem/Value/Architecture/State/Evidence/Constraints + 初始假设→反证→修正假设）→ 架构地图 → 技术实现水平 → **证据台账（claim 卡片：层级 + 裁决 Known/Likely/Claimed/Unknown/Contradicted）** → 宣传与实现差距 → **竞品矩阵 + GitHub 可复用项目候选清单** → 优势 → **问题与权衡（Problem-Before-Solution 链 + 12 维度扫描）** → 未验证假设 → 候选改进点（预分类）→ **建议与分类 + 交接包（仅含 BUILD 项，粘贴到 Plan 会话即可接手）** → 置信度、自查结果与附录。

## 为什么不是"只读版 Plan Mode"

- Plan Mode 回答 "How should we change this?"，默认存在一个待实现的任务；Research 回答 "What should we build, if anything?"，连"是否继续开发"都当作待验证假设，并以 BUILD / DON'T BUILD / INVESTIGATE 收束。
- Plan Mode 是行为指引（guides rather than enforces）——工具目录不变，write 权限仍在；Research 是**结构性零写能力**：write/edit 被 per-agent 永拒桩替换、写指引段被同段名遮蔽、沙箱 read-only、审批 never，四层叠加。
- **只读是机制而非限制**：能修复所见的 Agent 会滑向修复（goal drift）；本模式被制度性禁止执行，token 全部花在理解、怀疑、比较与判断上——这正是稀缺之处。
- Research 强制把仓库放回现实世界（papers / competitors / standards / **GitHub 可复用项目**），Plan Mode 的信息结构只有 User task + Repository。

## 目录结构

```
researcher/
├── preset.yml                         # 显示名与描述
├── agent.cordis.yml                   # 组合：工具行 + persona + 限制行
├── plugins/tool-restrict/index.js     # write/edit 永拒桩 + 指引段遮蔽（随预设分发）
├── skills/project-research-methodology/SKILL.md   # 六模块 + 十一部 + 自查清单
├── skills/research-report-template/SKILL.md       # 十四节报告骨架
└── README.md                          # 模式文档
```

## 兼容性

- **已验证版本**: DeepSeek Harness `0.1.0-rc.6`（本预设的只读机制依赖该版本的 agent scope 分层与事件路由）。
- 机制经 `agentPresets.standingKeyFor` 挂载校验与源码级验证；**真实会话的端到端验收**见"使用"第 4 步。
- 已知边界：沙箱词汇只覆盖文件效果（不含网络/进程策略）；pwsh 是唯一的壳形工具，仅用于只读 git 取证。承诺的是**零文件修改**，不是网络隔离。

## 路线图

- [ ] 专用只读 git 工具（白名单子命令、无壳），替换 pwsh，彻底移除升级字段语义
- [ ] workflow 接入，大规模主张核验 fan-out
- [ ] 上游贡献：permission preset 绑定 agent preset、`read-only+never` 命名预设
- [ ] 方法论规范独立发布（可移植到其他 Agent 生态）
- [ ] 待《AI Engineering Skills Map》二级技能表发布后，逐项映射到本模式能力树

## License

[MIT](./LICENSE) © 2026 TLNing260310
