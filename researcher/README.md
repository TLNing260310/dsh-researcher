# 项目研究 Project Research — 只读项目情报 Agent

**Understand the project before deciding what to do with it.**

把项目当文物读：不修改任何文件，产出**证据分级、逐条可复核**的诊断报告。结论可以是 **"暂不建议行动"**——并且附上行动前必须补的证据（实验、用户反馈、竞品对比）。

## 整体用途

对**已有的待优化项目**：① 理解开发者的目的（声称 vs 代码重建 vs git 历史）；② 提出在**实际应用环境**下可能遇到的问题（部署/规模/安全/运维/生态兼容）；③ 给出候选优化方案，**辩证权衡**——价值、代价、风险、反方论证全部摆出，不藏私；④ 重点查找 **GitHub 上可能可以使用的项目**（集成、组合、替代手写部分，附 stars/许可证/活跃度）；⑤ 全程中肯：证据分级（C0–C4）、逐条可复核。

## 流程：三阶段、双闸门

```
Research（本模式，只读诊断） → 【人类决策闸门】 → Plan（新会话） → 【人类批准闸门】 → Code（实施）
```

- **交接 = 跨会话、经过你的决策**，不是本会话获得写权限。研究会话结构性零写能力（桩工具 + 沙箱 read-only + 审批 never 在会话创建时钉死，中途不可升级）；实施发生在另一个可写权限的新会话里。
- 报告 §13 结尾附一份**交接包**：可直接粘贴到新会话首条消息的自包含摘要（项目路径、目标预设与权限、建议与证据引用、改动边界、禁区）。
- **为什么要双闸门**：开发者迷茫时最危险的是"AI 勤快地继续写"。机器自动续到实施，等于复现了最初的问题——诊断、计划、实施的每一步都要经过你的决定才前进。
- 注意：DSH 的 Plan Mode 是行为指引而非权限边界（进入后工具目录不变，write 仍在）；实施会话请用 workspace-write 权限、保持 plan mode 直到计划获你批准。

## 定位：三个 Mode 是上下游，不是竞争

| Mode | 核心问题 | 最终产物 |
|---|---|---|
| **Research（本模式）** | 现在到底是什么情况？要不要动？ | understanding / diagnosis |
| Plan | 准备怎么改？ | implementation plan |
| Code | 怎么做？ | implementation |

Research 的结论通常是一句话建议（可能是不行动），而不是一份实施计划。"如何实现"是 Plan Mode 的活——Research 只负责说清楚**该不该改、改什么方向**。

> Coding agents accelerate implementation. **Research Mode restores understanding.**
> 当代码生产速度超过人类理解速度（AI 连续替你写了一星期的 repo），需要一个 Agent 专门恢复人的"全局理解"。这就是本模式最强的产品叙事。

## 它能给出 Plan Mode 给不了的答案

- **Recommended action: NONE** —— 当前没有足够证据决定改哪个方向；先做实验 X、收集反馈 Y、比较项目 Z。
- **核心 claim 尚未被证明** —— 与主流实现 70% 重叠，真正不同的部分没有实验支撑；值得投入的是验证差异点，而不是继续堆功能。
- **瓶颈根本不是代码** —— 缺的是用户、实验或定位，继续写代码是危险的勤快。
- **把仓库放回现实世界** —— papers / competitors / standards 三层外部调研，不是"看懂仓库"，而是"看懂仓库在现实中的位置"。
- **GitHub 复用项目发现** —— 手写的模块有没有成熟的现成项目可以集成、组合或替代；引入成本、活跃度、许可证逐项给出。

## 用法

1. 新建会话时选择预设 **项目研究 Project Research**。
2. 权限选 **`read-only`（只读）**；审批策略选 **`never`**（当前 UI 中 read-only + never 显示为 custom 组合——这是最严格的组合；选择命名的 `read-only` 预设则保留 `ask`，由你逐次把关升级请求）。
3. 工作目录选你的项目仓库，然后把 **仓库说明 / 当前状态 / 你的困惑** 一起发过去。

## 工作流（八步）

```
DISCOVER     制图 + 全量主张提取（含你的描述——只是 C0 级声称）
   ↓
RECONSTRUCT  从代码重建架构，对照文档声称与 git 历史
   ↓
VERIFY       逐条主张定级 C0–C4（断言级测试检查、CI 公开证据）
   ↓
RESEARCH     外部调研：papers / competitors / standards / 依赖健康
   ↓
COMPARE      3–6 个竞品的矩阵对比，诚实标注重叠度
   ↓
CHALLENGE    攻击所有假设："还要继续吗？瓶颈是代码吗？"
   ↓
DIAGNOSE     诊断：子系统成熟度、风险（概率×影响）、未验证假设
   ↓
RECOMMEND    建议（可以是 NONE）+ 行动前必须补的证据 → 交接给 Plan
```

## 认识论：五级证据阶梯

| 级别 | 含义 | 验证方式 |
|---|---|---|
| C0 声称 Claimed | 某处文字这么说过（README/文档/issue/**你的描述**） | 记录出处 |
| C1 已实现 Implemented | 代码路径真实存在 | 静态验证 |
| C2 已测试 Tested | 测试存在**且断言了该行为** | 读断言 + CI 链接 |
| C3 已观察 Observed | 真实运行过的证据（CI 日志/发布产物/公开结果） | 公开 URL |
| C4 外部验证 Externally verified | 第三方独立证实（注册表/CVE/审计/benchmark/采纳数据） | 外部 URL + 日期 |

每条主张以 claim 卡片报告：`Claim / Status / Evidence / Missing evidence / Confidence`。没有证据的结论要么降级、要么明示为"未验证（研究者推断）"。

## 只读保证（四层）

| 层 | 机制 | 强度 |
|---|---|---|
| 沙箱 | 会话文件策略 `read-only`：DSH 文件沙箱拒绝一切文件写入 | 强制（权威） |
| 审批 | 策略 `never`：`sandbox_permissions` 升级被确定性拒绝，写操作无升级通道 | 强制 |
| 工具层 | 每个 agent 的 `write`/`edit` 被替换为永远拒绝的桩（子代理同样生效），真实写执行器永不运行；tool-fs 无条件注入的 write/edit **指引段也被同段名遮蔽**为只读说明——写代码不进入工具面，也不进入提示词的注意力面 | 能力移除 |
| 人格 | 调查员行为契约 + 随附方法论技能 | 行为约束（非边界） |

**诚实边界**：沙箱词汇只覆盖文件效果，不含网络/进程策略。pwsh 是本模式唯一的"壳形"工具，仅用于只读 git 取证与依赖查询；本模式承诺的是**零文件修改**（会话前后 `git status --porcelain` 一致可验），而非网络隔离。

## 报告在哪里

报告在对话中输出（只读模式不写盘）。需要保存时，复制出来即可——保存是你的动作，不是 Agent 的。

## 目录结构

```
researcher/
├── preset.yml                         # 显示名与描述
├── agent.cordis.yml                   # 组合：工具行 + persona + 限制行
├── plugins/tool-restrict/index.js     # write/edit 永拒桩（随预设分发）
├── skills/project-research-methodology/SKILL.md   # 证据阶梯 + 八步方法
├── skills/research-report-template/SKILL.md       # 十四节报告骨架
└── README.md
```

## 已知限制与下一步

- 运行行为验证（C3 本地观察）需要可写会话；只读模式以 CI 日志、发布产物等公开证据替代并如实标注。
- 大型仓库靠子代理分片 + 采样声明控制上下文。
- 计划中：专用只读 git 工具（白名单子命令、无壳）、workflow 大规模主张核验、上游贡献 permission preset 绑定 agent preset。
