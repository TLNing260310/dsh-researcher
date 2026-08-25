[English](./README.md) | **简体中文**

# dsh-researcher

[![CI](https://github.com/TLNing260310/dsh-researcher/actions/workflows/test.yml/badge.svg)](https://github.com/TLNing260310/dsh-researcher/actions/workflows/test.yml)
[![Release](https://img.shields.io/github/v/release/TLNing260310/dsh-researcher?include_prereleases&sort=semver)](https://github.com/TLNing260310/dsh-researcher/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Status: alpha](https://img.shields.io/badge/status-alpha-orange.svg)](./docs/validation-status.md)

![dsh-researcher：项目现实与证据门控的完成判定](./docs/assets/social-preview.png)

**让 AI coding 先理解项目现实，再冻结“什么算完成”，最后由证据而不是 Agent 的自信结束工作。**<br>
*Recover project reality, freeze what “done” means, and let evidence—not agent confidence—stop the loop.*

`dsh-researcher` 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的开源研究型扩展。它提供两个可以分开使用的产品层：

- **Project Research**：现在即可隔离试用的制度性只读研究模式。
- **Goal Governor**：更高级的目标与完成条件治理；工程机制已经实现，净生产力收益仍在验证。

> **当前边界**：DSH adapter、只读运行时和离线验证设施已有机械测试与真实 Web smoke；长期维护收益、真实模型端到端成功率和其他客户端 adapter 尚未证明。本项目不是“更聪明的 Agent”，也不承诺自动消除模型幻觉。

## 你可能正遇到这个问题

第一次让 Agent 修改仓库时，结果通常很好。第五次、第十次之后，问题开始改变：

1. 新会话重新猜测项目目的，旧结论无法区分事实、推断和过期假设。
2. 每个局部改动都看似合理，累积结果却越过原来的架构、安全或迁移边界。
3. 测试已经通过，Agent 仍继续“顺便优化”；或者测试没有通过，它却先宣布 DONE。
4. 人也不知道什么状态算完成，于是不断修改，直到时间耗尽或项目偏离初衷。

普通 Plan 记录“准备做哪些步骤”。本项目额外冻结：

```text
项目为何存在、哪些事实可信
             +
本次任务做到什么算结束、不能碰什么、最多尝试多少次
             +
宿主真实观察到的工具调用、参数、结果和工作树
             ↓
CONTINUE / NEEDS_HUMAN / DONE / STOPPED
```

## 60 秒看懂 Goal Governor

仓库内置一个零网络、零模型费用的可运行演示。它创建隔离临时 fixture，真实启动两次冻结 verifier 子进程，并把进程退出码交给发布代码中的 DSH replay adapter 和 host reducer：

```bash
npm run demo
```

```text
1. Assistant says DONE, but supplied no trusted verifier evidence.
   Host decision: CONTINUE

2. The matching host tool ran and returned exit_code=1.
   Host decision: CONTINUE

3. The same frozen host tool ran after the change and returned exit_code=0.
   Host decision: DONE
```

![只有匹配的真实 verifier 通过后，宿主才判定 DONE](./docs/assets/governor-demo.svg)

Agent 的最终文字不是证据。只有与已批准 verifier 的工具名、完整参数、参数哈希和结果策略匹配的宿主事件，才能满足完成条件。演示中的文件修改和 verifier 进程是真实的；DSH-shaped event envelope 与 call ID 由离线 harness 构造。演示源码见 [`scripts/demo-governor.js`](./scripts/demo-governor.js)。它证明真实进程结果可被 reducer 正确裁决，不是 Live DSH、Live E1 或生产力实验。

## 先选你需要的层

| 你的场景 | 建议 | 当前成熟度 |
|---|---|---|
| 接手陌生仓库、重构前核对架构、只想让 Agent 只读研究 | **Project Research** | 可隔离试用；安全边界有真实 DSH Web smoke |
| 编码中临时核对一个项目事实 | Governed Coding 中运行 `/researcher <question>` | 可隔离试用；一次只读 turn |
| 需要冻结验收条件、预算、人工 gate 和停止状态 | **Goal Governor** | 高级 alpha；机制有测试，结果增益未证明 |
| 一个明显的小 bug、简单 CRUD、一次性脚本 | 继续使用普通 Agent / Plan | 本项目通常过重 |
| 只使用 Codex、Claude Code、Zed/Zcode 或 OpenClaw | 暂不安装 | Portable Core 存在，但相应 adapter 未交付 |

Project Research 与 Goal Governor 并不捆绑。你可以只安装后试用前者，不创建任何 Goal Contract。

## 安全试装

> **分发身份说明**：本项目当前只通过固定 GitHub tag 或 GitHub Release 制品分发。npm 上未加 scope 的 `dsh-researcher` 属于另一位维护者和另一个仓库，请勿运行 `npm install dsh-researcher`。`main` 的本地包身份已改为私有 scoped name `@tlning260310/dsh-researcher`，防止误发布。现有 `v0.8.0-alpha.8` tag 早于这项 metadata 调整，但下列 `github:` 命令直接绑定仓库，不会解析 npm registry 的同名包。

### 前置条件

- DeepSeek Harness 目标版本：`0.1.1-rc.2`；离线设施已通过，隔离 Gate 0/live conformance 仍待完成。
- DSH 运行时 Node 要求：`^22.19.0 || >=24.0.0`（可移植项目核心仍为 `>=22.12.0`）。
- Node.js：`>=22.12.0`。
- 建议使用独立 `DSH_HOME` 和非关键仓库副本首次试用。
- 当前版本：`0.8.0-alpha.8`，不承诺稳定 API。

先预览操作，不写入 preset：

```bash
npx -y github:TLNing260310/dsh-researcher#v0.8.0-alpha.8 --dry-run
```

确认后安装：

```bash
npx -y github:TLNing260310/dsh-researcher#v0.8.0-alpha.8
```

安装器默认不会覆盖已有 preset，并严格核对 DSH 版本。备份、升级、卸载、回滚以及从 GitHub Release 校验 SHA-256 后安装的完整流程见 [安全安装与恢复](./docs/installation.md)。不要在不了解现有 preset 内容时使用覆盖选项。

## 路径 A：只读研究

1. 新建 DSH Web 会话，先选择 `Read Only`。
2. 再选择「项目研究 Project Research」。preset 会把 `approval=ask` 单向收紧为 `never`，因此 UI 显示 `Custom`。
3. 给出具体问题，而不是只说“看看项目”：

```text
先运行 research_doctor。只读审阅本仓库，并用 path:line 证据回答：
1. 项目真正目的是什么？
2. 哪些架构约束不可改变？
3. README、实现和测试有哪些矛盾？
4. 下一项最值得验证的假设是什么？
无法验证的内容标记 UNKNOWN，不要写文件。
```

`research_doctor` 必须是首个工具调用；Runtime Certificate 不是 `SAFE` 时研究不会开始。切换到 writable 权限会撤销旧证书，并在下一次模型调用前拒绝继续。

真实 smoke 的结论并非“模型研究得很好”：发布包确实达到了 `SAFE` 并拒绝权限漂移，但早期本地模型也曾忘记任务、虚构 Rust 路径。这份完整记录见 [DSH Web local smoke](./docs/evidence/dsh-web-local-smoke-2026-08-24.md)。alpha.7 候选又用 Qwen3 14B 与 DeepSeek R1 14B 做了两次本地探测：前者经纠正后仍未完成报告，后者的无证据报告被 terminal gate 拒绝。见 [Project Research local-output smoke](./docs/evidence/project-research-local-output-smoke-2026-08-25.md)。它们证明安全门有用，同时反证了“SAFE 就等于研究质量已证明”。

### 两种研究入口

| 入口 | 生命周期 | 用途 |
|---|---|---|
| `项目研究 Project Research` preset | 持续模式；环境级 read-only、approval never、无通用 shell | 完整或高风险项目研究 |
| `/researcher <question>` | Governed Coding 中一次只读 turn，结束后自动退出 | 编码中临时核对事实 |

Governed Coding 还支持 `/researcher on|off` 持久 guarded mode。它有工具白名单保护，但不等同于独立 preset 的环境级只读证明。

## 路径 B：五分钟建立 Goal Contract

引导器一次生成 Project Cognition、Verifier Registry、Goal Contract 的**待审核草稿**和 `REVIEW.md`，并自动绑定当前 cognition hash、Git revision 与 verifier hash：

```bash
npx -y --package=github:TLNing260310/dsh-researcher#v0.8.0-alpha.8 project-cognition init .
npx -y --package=github:TLNing260310/dsh-researcher#v0.8.0-alpha.8 project-cognition quickstart --root . --out ../my-goal-review --goal-id fix-login-timeout
```

第一条只在项目尚未建立 `.project-cognition/state.json` 时执行；已有 canonical state 的项目直接运行第二条。命令均为单行，可直接用于 PowerShell 或 POSIX shell。

若无法从 `package.json`、`Cargo.toml`、`pyproject.toml` 或 `go.mod` 推断测试命令，则显式提供：

```bash
npx -y --package=github:TLNing260310/dsh-researcher#v0.8.0-alpha.8 project-cognition quickstart --root . --out ../my-goal-review --goal-id fix-login-timeout --verify-command "npm test"
```

省略 `--verify-tool` 时，Windows 默认 `pwsh`，Unix 默认 `bash`；只有 verifier 必须由其他宿主工具执行时才显式指定。

编辑生成的草稿后同步冻结引用：

```bash
npx -y --package=github:TLNing260310/dsh-researcher#v0.8.0-alpha.8 project-cognition quickstart sync ../my-goal-review --root .
```

引导器**不会**替你批准 Goal、seal 项目事实或安装 canonical state。打开生成的 `REVIEW.md`，审核目的、边界、MUST 条件、预算与 verifier 后，再执行其中列出的批准命令。完整说明见 [五分钟 Quickstart](./docs/quickstart.md)。

批准后，在「目标治理编码 Governed Coding」中运行：

```text
/researcher run .project-cognition/goals/<goal>.r1.json
```

## 什么算完成

- 每个 MUST criterion 都必须由冻结 verifier 或直接 human gate 证明。
- 最终 attempt 必须重新证明全部 MUST，不能继承旧 attempt 的成功。
- SHOULD 未完成不会成为继续消耗尝试的理由。
- baseline 已满足时返回 `ALREADY_SATISFIED`，不得为了显得有工作而修改代码。
- 达到尝试、时间、token 或连续无进展预算时返回 `STOPPED`。
- 合同、认知、权限或验证器漂移时返回 `NEEDS_HUMAN`。
- 模型不能写入或覆盖自己的终态；宿主从可信事件前缀复算决定。

Goal Contract v1 的 `in_scope / out_of_scope / do_not_touch` 当前是冻结的语义约束，不是通用文件路径 allowlist。E1 runner 对实验 fixture 的允许路径另有机械检查；通用 hard path enforcement 需要未来显式 schema，不在本版本能力内。

## Project Cognition 如何防止架构漂移

```text
.project-cognition/state.json       唯一 canonical 项目真相
.project-cognition/goals/*.json     本次目标、边界、预算和完成条件
DSH durable session events          宿主观察到的真实执行
PROJECT_COGNITION.md                 由 state.json 确定性生成的人类投影
```

Research Session Ledger 只保存候选 claims、假设和证据线索。模型不能把会话结论自动晋升为项目事实。唯一提升流程是：

```text
session ledger → draft revision → owner review → seal → regenerate projection
```

这条边界刻意保留人工责任：自动生成草稿可以降低摩擦，但不能让同一个模型既提出事实、又批准事实、再依据自己批准的事实完成任务。

## 证据现状

| 层级 | 当前结论 | 它真正说明什么 |
|---|---|---|
| 单元、replay、集成与 package smoke | PASS | 哈希、revision、预算、人工 gate、伪证据拒绝、host completion 和隔离安装按设计工作 |
| `project-cognition doctor .` | PASS | canonical state、schema、hash、projection、Goal 与 registry 当前一致；不证明引用证据仍新鲜 |
| DSH Web Project Research smoke | PASS（运行时边界）；本地输出 probe FAIL | 精确发布 runtime 可达 SAFE 并拒绝权限漂移/未认证终态；两个本地 14B probe 未产出合格报告 |
| Goal Governor E1 infrastructure | READY；Live E1 NOT RUN | preflight、run lock、成本准入、bundle、replay 与 scorer 已存在；不证明真实模型 conformance |
| Experiment C+ | causal-invalid，永久保留 | 基础设施能运行，同时评测会拒绝 snapshot leakage 和伪正向结论 |

本地复核不会调用模型或网络：

```bash
npm run check
npm run demo
npm run eval:e1:preflight
```

公开证明顺序固定为：`Gate 0 → E1 → non-inferential pilot → E2 → second-adapter conformance → E3`。轨迹、阈值和 invalidity rules 只以冻结的 [Goal Governor Evaluation Protocol](./docs/goal-governor-evaluation-protocol.md) 为准，README 不复制实验定义。

不同客户端共享同一份[可移植 HostEvent 与调用合同](./docs/client-adapter-contract.md)：单次 `researcher.ask(...)`、持续 `researcher.mode.set/get(...)` 与客户端原生命令最终进入同一个宿主状态机。

### Live 模型成本边界

北京时间工作日 `[09:00,12:00)`、`[14:00,18:00)` 禁止 DeepSeek 远程 API；这些时段只允许锁定到字面 loopback 地址的本地路由。其他时段和周末的远程 E1 也只能使用 official `deepseek-v4-flash`、精确 `https://api.deepseek.com`、完整 run lock、预算和显式费用确认。loopback 只证明第一跳在本机，不能证明本地服务没有再代理远程。

## 与 Plan、Spec 和 Memory 的区别

| 工具层 | 主要回答 |
|---|---|
| Plan / Tasks | 接下来准备做哪些步骤？ |
| Spec | 准备构建或改变什么？ |
| Memory | Agent 曾经学到了什么？ |
| Project Cognition | 关于项目现实的主张是什么，为什么相信，何时失效？ |
| Goal Governor | 什么状态算完成，谁有权证明，何时必须停止？ |

GitHub Spec Kit、OpenSpec、Kiro、Serena、Beads 和客户端自带 Plan/Memory 都可能是更合适的选择。本项目的差异仅在于“可失效的项目认知 + 宿主拥有的终态裁决”这一组合；每个单项能力都有成熟替代。详细边界见 [竞争与集成地图](./docs/landscape.md)。

## 可移植性

Portable Core（Cognition / Goal / Verifier reducer、canonical JSON、schemas、CLI）不依赖 DSH。但客户端 adapter 只有机械证明以下能力后才能称为 `governed`：host-owned approval、hard stop/pause、durable ordered events、trusted verifier binding、project-root confinement。缺少任一项时只能称为 advisory。

当前只有 DSH adapter。Codex、Claude Code、Kiro、OpenClaw 和 Zed/Zcode 的 effect size 与 adapter 可行性仍是待验证假设，不是已交付兼容性。

## 仓库地图

| 入口 | 从这里得到什么 |
|---|---|
| [安全安装与恢复](./docs/installation.md) | dry-run、安装、备份、卸载、回滚与制品校验 |
| [五分钟 Quickstart](./docs/quickstart.md) | 从任务描述到可人工审核的 Goal 草稿 |
| [成熟项目介绍](./docs/project-introduction.md) | 可复用的一句话、用户叙事、能力与诚实边界 |
| [Validation Status](./docs/validation-status.md) | Validated / Unknown / Invalidated 的正式边界 |
| [Project Cognition](./PROJECT_COGNITION.md) | 项目目的、不变量、已证/未证价值与下一证明 |
| [架构](./docs/architecture.md) | runtime、portable core、权限面和信任边界 |
| [Goal Governor 指南](./docs/goal-governor.md) | 合同、验证器、状态机与完整 CLI |
| [Cognition Governance](./docs/cognition-governance.md) | canonical truth、Session Ledger 与 promotion |
| [E1 harness](./evaluation/goal-governor-e1/README.md) | run lock、成本准入、证据包和离线评分 |
| [失败与真实 smoke](./docs/evidence/dsh-web-local-smoke-2026-08-24.md) | 每轮运行结果、缺陷和不能推出的结论 |
| [alpha.7 本地输出 smoke](./docs/evidence/project-research-local-output-smoke-2026-08-25.md) | 两个本地模型为何未产出可发布 Researcher 报告 |

## 反馈与安全

- 只试了十分钟也有价值：[提交最短试用结果](https://github.com/TLNing260310/dsh-researcher/issues/new?template=trial-report.yml)。
- 完整的有价值、无价值、误阻塞和错误 DONE：[提交真实运行反馈](https://github.com/TLNing260310/dsh-researcher/issues/new?template=feedback.yml)。
- 自审校准案例与真实案例的准入边界见 [Case Library](./docs/case-studies/README.md)。
- Bug 使用 [issue template](https://github.com/TLNing260310/dsh-researcher/issues/new/choose)。
- 贡献前阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。
- 安全问题按 [SECURITY.md](./SECURITY.md) 私下报告。

## Compatibility

- DeepSeek Harness：目标版本 `0.1.1-rc.2`；不得在 Gate 0/live conformance 完成前写成“已经验证”。
- Node.js：`>=22.12.0`。
- 当前版本：`0.8.0-alpha.8`；功能与 alpha.7 相同，本版只修正 Windows 8.3 临时路径在 Quickstart 身份测试中的规范路径断言，并由新的干净提交重新生成发布制品。
- License：MIT。
