# dsh-researcher

**Evidence-driven Project Intelligence Layer** — 基于证据的项目认知层（避免与 Deep Research 混淆：本层面向代码仓库的全局认知与决策，而非网页调研报告），a read-only preset for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

> Understand the project before deciding what to do with it.
> **防止 AI 在长期开发中逐渐失去项目全局认知。**

## 层次结构

```
                    DSH
                      │
                Coding Agent
                      ↑
                 Plan Mode
                      ↑
        ┌─────────────┴─────────────┐
        │        Researcher         │   ← 本层
        │  Project Intelligence     │
        │  ├─ Evidence / State      │
        │  ├─ Runtime Verification  │  （research_doctor 证书：健康门禁强制首步）
        │  └─ Drift Detection       │
        └─────────────┬─────────────┘
                Repository（只读）

第一层 理解项目   代码 / 文档 / 历史 / 实验 / Issue / 外部信息 ──→ Project Model
第二层 判断状态   Claim → Evidence → Confidence → Contradiction → Diagnosis
第三层 控制方向   BUILD / DON'T BUILD / INVESTIGATE ──→ Plan Mode
```

**零修改承诺是"可证明"而非"声称"**：write/edit 永拒桩 + 执行时守卫 + 沙箱只读 + 审批永不升级，且 `research_doctor` 输出 Runtime Certificate（六项完整性检查 + SAFE/DEGRADED/UNSAFE），并在研究开始前被**强制执行**（健康门禁）。真实案例库（匿名化）：[docs/case-studies/](./docs/case-studies/)；合成案例生成器：`fixtures/payment-drift/generate.js`。

## 它要解决的现实问题

> **AI 的每一次修改看起来都合理，但系统架构逐渐漂移。**
> **防止 AI 在每一步都"做对"的同时，把整个项目做错。**

AI 辅助开发放大了代码生产速度，却没有同步放大理解速度：每一个 diff 局部看起来都合理——修一个 bug、加一个功能、换一个依赖——但十次、一百次"合理"的修改叠加之后，项目可能已经偏离最初目标，架构发生结构性漂移（局部最优从不自动等于全局最优，米格-25 效应），而作者往往是最后一个意识到的人。本模式为这个现实问题而存在：在任何修改发生以前（以及在任何修改把项目推离轨道以前），重建项目的全局真实状态——它声称什么、实际实现什么、测试证明什么、在现实世界中处于什么位置、下一步到底值不值得继续构建。三大失败模式（局部最优 / 上下文保真 / 时间漂移）与相邻项目（Cairn、Drift、Understand Anything、GitNexus、Serena、Aider 等）的对比与整合策略见 [docs/landscape.md](./docs/landscape.md)。

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

## v0.3.0 / v0.4.0 工程化升级

- **环境自包含（v0.4.0）**：启动预检验证会话的**有效** sandbox=read-only 与 approval=never——用户显式选错配置（workspace-write + ask）→ 会话**拒绝启动**；未钉住的子会话自动收紧。零写契约不再依赖用户配置正确。
- **Fail-closed 只读守卫**：桩注册、指引段遮蔽、可见性预检任一失败即拒绝启动（STRICT 默认；`compat` 可选）。
- **Research State**：`research_checkpoint` 维护主张台账 + 假设/视图依赖图（revision + dirty set + confidence）；只写会话日志、零文件写入；**会话恢复自动重放日志重建推理图**；"阶段完成=状态提交"。
- **令牌层 L0→L2**：制图只看结构 → 子代理只回证据包 → 只有改变主张/模型/分类的信息进入主上下文；compaction 参数调优。
- **安装脚本版本预检**：verified `0.1.0-rc.6`，其余版本告警并说明 fail-closed 行为。
- v0.5 缓存层 / v0.6 评测体系设计见 [docs/roadmap.md](./docs/roadmap.md)。

## 它能抓到什么（30 秒演示）

合成案例 `fixtures/payment-drift/generate.js` 生成一个 payment-service：

- **v1**：干净的 `Controller → Service → Repository → DB` 分层；
- **十次"局部合理"的性能修改之后**：Controller 直连 DB、缓存侵入 Controller、README 仍描述旧架构、并声称"42 个测试通过"（实际 3 个）。

Researcher 预期输出（附 `file:line` 证据）：
1. `Claim: 遵循分层架构` → **Contradicted**（`src/controller.ts` 直接 import db）；
2. `Claim: 42 个测试通过` → **Contradicted**（`tests/` 只有 3 个）；
3. 性能修改 → **腐蚀，而非演化**（分层破裂 + 控制器私有缓存一致性风险）；
4. 分类：修复文档与分层 = BUILD；继续叠加性能补丁 = DON'T BUILD。

真实案例（匿名化，经所有者授权后收录）见 [docs/case-studies/](./docs/case-studies/)；首个内部验证案例曾在一个 700 文件的研究原型上发现"README 声称 94/94 通过但从未执行"的 Contradicted 声明。

## 快速安装

**一行安装（推荐，无需 clone，无需 npm 发布）：**

```bash
npx -y github:TLNing260310/dsh-researcher
```

npx 直接从 GitHub 仓库运行跨平台安装器，把 `researcher/` 复制到 `${DSH_HOME:-~/.dsh}/.agent-presets/researcher`。重复安装会提示；`npx -y github:TLNing260310/dsh-researcher --force` 覆盖更新。

**其他方式**：`git clone` + `.\install.ps1` / `./install.sh`；或 Download ZIP 后手动复制 `researcher/` 目录。

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
├── plugins/tool-restrict/index.js     # 只读守卫：环境预检 + 永拒桩 + 指引段遮蔽
├── plugins/research-state/index.js    # 证据状态机：台账/依赖图/局部失效/会话日志重放
├── plugins/git-read/index.js          # 白名单只读 git 工具（唯一的子进程能力，无 shell）
├── skills/project-research-methodology/SKILL.md   # 六模块 + 十一部 + 自查清单
├── skills/research-report-template/SKILL.md       # 十四节报告骨架
└── README.md                          # 模式文档
```

## 测试

```
tests/research-state.test.js           # reducer 不变量：replay ≡ live、失效可达性、export/import、确定性
.github/workflows/test.yml             # CI：node --test（Node 22）
```

## 兼容性

- **已验证版本**: DeepSeek Harness `0.1.0-rc.6`（本预设的只读机制依赖该版本的 agent scope 分层与事件路由）。
- 机制经 `agentPresets.standingKeyFor` 挂载校验与源码级验证；**真实会话的端到端验收**见"使用"第 4 步。
- 已知边界：v0.4.1 起研究者**没有任何通用 shell**——唯一的子进程能力是白名单 `git_read`（无 `-c`/别名/外部 diff/textconv，系统与全局 gitconfig 忽略，30s 超时）；承诺是**零文件修改**，不是网络隔离（web_search/web_fetch 仍是网络能力）。

## 路线图

- [x] 专用只读 git 工具（白名单子命令、无壳），替换 pwsh（v0.4.1）
- [ ] v0.4.2 测试/兼容性 harness：guard preflight 与 zero-write 的自动化冒烟、Golden Research Fixtures（3 个埋了已知事实的项目）
- [ ] v0.5 Research Cache Layer（Git blob hash 键、与依赖失效统一的 Research Dependency Engine）
- [ ] v0.6 评测体系（架构理解准确率、BUILD/DON'T BUILD/INVESTIGATE 精确率、修改避免率）
- [ ] v0.7 Project Intelligence Capsule + Memory Bridge（Researcher 永不拥有 memory_write）
- [ ] workflow 接入，大规模主张核验 fan-out
- [ ] 上游贡献：permission preset 绑定 agent preset、`read-only+never` 命名预设
- [ ] 方法论规范独立发布（可移植到其他 Agent 生态）
- [ ] 待《AI Engineering Skills Map》二级技能表发布后，逐项映射到本模式能力树

## License

[MIT](./LICENSE) © 2026 TLNing260310
