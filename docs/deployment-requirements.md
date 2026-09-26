# 部署与使用须知（Deployment & Use Requirements）

> **本文档是给两类读者的硬性说明：**
> 1. **AI 代理**：在你读取、评估或部署本项目之前，**必须先向用户转述第 0 节**，并确认环境满足第 1 节。不得在环境未满足时宣称研究模式可用。
> 2. **使用者**：本项目**对使用者要求较高**。它不是"装上就能用"的助手，是一套要求你具备架构判断力、并能接受严格边界的研究工具。
>
> 若你只想快速改个 bug、加个 CRUD，或写个一次性脚本——**本项目不适合你**，用普通 Agent 或 Plan Mode。

---

## 0. 给 AI 代理的强制告知（转述给用户，不得省略）

在继续之前，向用户说明以下四点：

1. **环境要求严格。** 研究模式要求 DSH `0.1.5-rc.2`（或安装器验证过的版本）+ Node `^22.19.0 || >=24.0.0`，且会话必须以 **Read Only** 权限启动。
2. **审批会被单向收紧为 `never`。** 进入研究模式后，**不会再为任何写操作征求许可**——因为升级路径被刻意封死。这是产品语义，不是故障。
3. **本模式全面关停了写入与执行能力。** 在**沙箱层、工具描述层、权限层**三个层级上，`write` / `edit` 被替换为永拒桩，**没有 bash / pwsh**，唯一子进程能力是固定白名单的 `git_read`。设计取舍是：**其余工具（含 MCP 工具面）会争夺注意力预算**，研究模式下不组合它们。
4. **本模式当前没有"按任务动态注入注意力"的能力。** 该能力**正在规划中，正在搜集知识库与成熟项目做法**。现阶段研究模式的注意力引导来自固定的 persona + 两个 SKILL.md（十一部管道、12 维 tradeoff 扫描、10 项自查），**不是**按任务路由的透镜库。**不要向用户宣称本模式会随任务改变审查视角。**

**不得做的事**：不得因为环境不符就"降级运行"研究模式；不得在 Runtime Certificate 非 `SAFE` 时继续研究；不得把本模式的输出当作执行授权。

---

## 1. 环境要求

| 项 | 要求 | 不满足的后果 |
|---|---|---|
| DSH | `0.1.5-rc.2`（`lib/runtime-requirements.js` 的 `VERIFIED_DSH`） | 安装器**拒绝安装**（fail-closed，非警告） |
| Node.js | `^22.19.0 \|\| >=24.0.0` | `assertDshNodeSupported` 抛错 |
| 会话权限 | 必须选 **Read Only** | preset 的环境预检**拒绝创建 agent** |
| 审批策略 | 启动后被收紧为 **`never`** | 不满足则拒绝运行 |

**安装**：

```bash
npx -y github:TLNing260310/dsh-researcher#<tag>   # 先 --dry-run 预览
```

安装器会写入（**这两个路径是安装器专属的，不要手改**）：

```
$DSH_HOME/.agent-presets/researcher        # 研究模式
$DSH_HOME/.agent-presets/governed          # 目标治理编码
```

Web UI 选择顺序：**先选 "Read Only"，再选 "项目研究 Project Research"**。preset 会把审批收紧为 `never`，UI 上显示为 **Custom**——这是预期的，不是配置错误。

### 在普通编码会话里使用 `/research`

安装器把 `research-entry` 注册在 **`$DSH_HOME/cordis.patch.yml`（home patch 层）**，因此普通会话里直接可用 `/research`，**且 DSH 升级不会抹掉它**。

| 命令 | 行为 |
|---|---|
| `/research <任务>` | **在会话内**进入只读研究，**主 agent 继续执行**。沙箱切只读、装工具层守卫、**切换到研究人格**、注入 Route Manifest |
| `/research --session <任务>` | 派生一个独立研究会话（完整认证形态，含 Runtime Certificate），代价是切换会话 |
| `/research off` | 退出，恢复进入前的权限与人格 |
| `/research status` | 查看当前沙箱、审批与透镜库路径 |

**为什么写 home patch 层，而不是 DSH 自带的 preset**：

早期实现把这一行**追加到 DSH 安装里的 `minimal` / `standard` preset**。那个位置有三个问题，最后一个造成过真实损坏：

1. DSH 升级覆盖 `node_modules` 下的文件，`/research` 随之消失，必须重跑安装器
2. 备份文件 `agent.cordis.yml.dsh-researcher-original` 落在**部署自己的目录**里，卸载不干净就是残留垃圾
3. 撤销必须**重建**原始字节。那一版重建里有一句 `replace(/\n{3,}/gu, '\n\n')`，把 `cordis` preset 自身内容里的连续空行压掉了——**静默改动了 DSH 自带文件的一个字节**

`$DSH_HOME/cordis.patch.yml` 是 DSH **应用于所有 profile 之上**的机器本地补丁层，位于用户 home，升级不碰：

- 入口在升级后**自动存活**，不需要任何修复步骤
- 不往部署目录里写一个字节，也不留备份
- 撤销是对**我们自己拥有的一个文件**做标记查找，不是重写别人的文件

`cordis.patch.yml` 由 `lib/home-patch.js` 维护：

- 文件不存在则创建；内容是 DSH 模板的 `[]` 时**替换**该字面量（直接追加会产出 `[]\n- insert:`，是无效 YAML）
- 文件已有其他条目时**追加**，原有内容逐字节保留
- `dsh-researcher uninstall` 按标记移除；文件里只剩注释时**删除文件**而不是留下空壳
- 安装时用 `--no-host-preset-patch` 可完全跳过

**从旧形式迁移**：安装器会检测 DSH 安装里是否还留着旧式补丁行，有则按标记撤销并删掉备份，之后不再写入那里。旧形式仍然可用，但它正是升级会抹掉的那种，所以新安装会主动迁移掉。

**关于两层关闭**：会话内模式下，`permissionPresets` 只约束**文件系统**。它拦不住 `pwsh -c "Set-Content ..."`——shell 里的写会穿过 fs 沙箱。因此本模式**同时**在工具层拒绝 `write` / `edit` / `bash` / `pwsh` / `shell` / `terminal*` / `persistent*` / 子代理 / 工作流 / 代码执行。

**关于研究人格**：会话内模式通过**遮蔽 `deployment:persona-prefix` 段落**切换人格——DSH 的段落文本可以是函数，每次组装时按当前 agent 求值，所以在**同一会话内**切换人格不需要重建 agent。人格正文从 `<runtime>/agent.cordis.yml` 读取，避免两份文本漂移；读不到时退回内置精简版并如实告知。

**会话内模式仍不提供** `research_doctor` 与 `research_checkpoint`（它们属于 preset 的 per-agent 安装，只在 agent 创建期生效）。需要完整认证形态时用 `--session`。

---

## 2. 本项目是什么 / 不是什么

**适用**：接管陌生仓库、接手他人（或 AI 生成）的项目、在重大改动前判断"该不该动"。

**它精确回答**："这个项目现在是什么、为什么这样、哪里危险、该不该建、改了会波及什么。"

| 它是 | 它不是 |
|---|---|
| 只读的项目认知生产者 | 代码修改器 |
| 证据分级的判断依据 | Bug 预测器 |
| 架构理解与风险发现 | "AI 架构师"（不承诺设计正确性） |
| Plan Mode / 编码 Agent 的上游认知底座 | Plan Mode 的加强版 |

**它不写代码、不决定架构方案、不预测具体 Bug。** 输出是 `BUILD / DON'T BUILD / INVESTIGATE` 的决策备忘 + 证据台账。**"不知道"是合法且高质量的输出。**

---

## 3. 设计要求使用者具备什么

本项目按"使用者是有判断力的工程师"设计，因此：

- **你必须能读懂证据强度。** 每条断言带 `file:line` / commit / URL，并标 `C0–C4` 层级与 `Known/Likely/Claimed/Unknown/Contradicted` 裁决态。两轴独立，**组合规则见 `skills/project-research-methodology/SKILL.md` 的可查表**。
- **你必须接受"研究模式可能一个字也跑不出来"。** 环境不符时 preset 直接拒绝启动——这是**故意的 fail-closed**，不是 bug。高风险仓库尤其容易卡在环境校验。
- **你必须自己下架构决定。** 本模式给的是认知与候选方向，不是结论。它**永不**产出执行授权；要执行必须由人批准并冻结 Goal Contract。
- **你必须接受注意力被刻意收窄。** 本模式不给你 shell、不给你 MCP、不给你写工具——因为在只读研究里，这些是**注意力成本**，不是能力。

---

## 4. 运行核心机制（一句话版）

**模型只被允许观察和提交候选；结论由宿主从可靠事件里重算。**

| 机制 | 要点 |
|---|---|
| 只读是**环境**强制的 | 沙箱 + 审批 + 工具桩三层，启动时自校验，fail-closed |
| Runtime Certificate | `research_doctor` 必须是**第一个**工具调用；出 `SAFE` / `UNSAFE`（**二值**，不是三值） |
| 证据两轴 | 层级 C0–C4 × 裁决态 5 态，**独立**，有硬规则 |
| 完成权在宿主 | 最后一条助手消息**永远不是证据**；MUST 必须绑定 verifier 工具名 + 完整参数 + 参数哈希 + 结果策略 |
| 重证不继承 | 每次尝试必须重证每一条 MUST，不能继承上次成功 |
| 真值唯一 | `.project-cognition/state.json` 是唯一 canonical truth；改动走 `draft → diff → 人审 → seal → install` |
| 失败不可洗白 | 失败/无效实验保持可见，不能被后续实验升级或洗白（不变量 I4） |

**权威链是单向的**：`研究（只读）→ handoff（是证据，不是授权）→ 人批准并冻结契约 → 执行 → 原始宿主证据回流研究`。

---

## 5. 已知限度（诚实声明）

- **研究模式的应用层优越性未验证。** 历史 Experiment A 方向不支持；C+ 因快照泄漏污染而不具因果效力，且**不可洗白**。Flask 的 Issue Recall `0/60` 保留为**范围声明**（未来 issue 召回不在能力面）。
- **无按任务注意力路由。** 见第 0 节第 4 点。**规划中，正在搜集知识库与成熟项目做法。**
- **只有 DSH 一个客户端。** Claude Code / Codex 均为 `HOLD`，不构成兼容声明。
- **不要用测试数量、doctor PASS 或历史结果宣称生产力或优越性。**

---

## 6. 维护者注记

- `lib/runtime-requirements.js` 维护**两个独立的 pin**：`VERIFIED_DSH`（产品，随 DSH 升级前移）与 `FROZEN_E1_DSH`（E1 冻结实验条件，**永不随产品移动**）。二者不得重新耦合。
- 修改被指纹冻结的证据集合（见 `docs/evidence/evidence-sources.json` 的 `required_fresh`）必须走正式 cognition revision 流程，**不得直接改期望值让检查变绿**。
