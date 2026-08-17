# dsh-researcher

**项目研究 Project Research** — a read-only project-intelligence agent preset for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

> Understand the project before deciding what to do with it.
> 先理解项目现状，再决定要不要动手。

**只读项目研究模式**：把项目当文物读，产出证据分级（C0–C4）、逐条可复核的诊断报告；结论可以是 **"暂不建议行动"**。零修改保证不靠提示词祈祷，而靠四层机制（无写工具 + 沙箱只读 + 审批永不升级 + 写代码不进入注意力面）。

## 定位

| Mode | 核心问题 | 最终产物 |
|---|---|---|
| **Research（本模式）** | 现在到底是什么情况？要不要动？ | understanding / diagnosis |
| Plan | 准备怎么改？ | implementation plan |
| Code | 怎么做？ | implementation |

Research 是 Plan 的上游：诊断 →【你的决策】→ Plan（新会话）→【你的批准】→ Code。研究会话**永远**不会获得写能力——交接是跨会话、经过你的。

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

## 使用

1. 新建会话，预设选择 **项目研究 Project Research**。
2. 权限选择 **read-only（只读）**，审批策略选择 **never**（当前 UI 中 read-only + never 显示为 custom 组合，是最严格的组合；命名的 `read-only` 预设保留 `ask`，由你逐次把关升级请求）。
3. 工作目录指向你的项目仓库，发送：**仓库说明 + 当前状态 + 你的困惑**。
4. 验收：`write`/`edit` 显示为 "DISABLED in research mode" 的永拒桩；会话前后 `git status --porcelain` 一致。

## 它输出什么

十四节《项目体检报告》：执行摘要与置信度 → 研究范围与方法 → 项目目的理解（声称 vs 代码重建 vs 历史）→ 架构地图 → 技术实现水平 → **证据台账（claim 卡片：Claim / Status / Evidence / Missing evidence / Confidence）** → 宣传与实现差距 → **竞品矩阵 + GitHub 可复用项目候选清单** → 优势 → 风险与现实环境问题 → 未验证假设 → 最大价值改进点 → **建议（可为 NONE + 辩证权衡的候选优化方案）** → 交接包（粘贴到 Plan 会话首条消息即可接手）。

## 为什么不是"只读版 Plan Mode"

- Plan Mode 回答 "How should we change this?"，默认存在一个待实现的任务；Research 回答 "What the hell is this, and should we change it at all?"，连"是否继续开发"都当作待验证假设。
- Plan Mode 是行为指引（guides rather than enforces）——工具目录不变，write 权限仍在；Research 是**结构性零写能力**：write/edit 被 per-agent 永拒桩替换、tool-fs 注入的写指引段被同段名遮蔽、沙箱 read-only、审批 never，四层叠加。
- Research 强制把仓库放回现实世界（papers / competitors / standards / **GitHub 可复用项目**），Plan Mode 的信息结构只有 User task + Repository。

## 目录结构

```
researcher/
├── preset.yml                         # 显示名与描述
├── agent.cordis.yml                   # 组合：工具行 + persona + 限制行
├── plugins/tool-restrict/index.js     # write/edit 永拒桩 + 指引段遮蔽（随预设分发）
├── skills/project-research-methodology/SKILL.md   # 证据阶梯 + 八步方法
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

## License

[MIT](./LICENSE) © 2026 TLNing260310
