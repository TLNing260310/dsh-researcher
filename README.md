# dsh-researcher

[![CI](https://github.com/TLNing260310/dsh-researcher/actions/workflows/test.yml/badge.svg)](https://github.com/TLNing260310/dsh-researcher/actions/workflows/test.yml)
[![Release](https://img.shields.io/github/v/release/TLNing260310/dsh-researcher?include_prereleases&sort=semver)](https://github.com/TLNing260310/dsh-researcher/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Status: alpha](https://img.shields.io/badge/status-alpha-orange.svg)](./docs/validation-status.md)

**让 AI coding 先恢复项目认知，再冻结完成条件，并在证据满足时停止。**<br>
**Recover project cognition, freeze what “done” means, and let evidence—not agent confidence—end the loop.**

`dsh-researcher` 是面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的开源原型，包含两个互补部分：

- **Project Research**：制度性只读的项目研究 preset，从代码、文档、历史和测试中重建项目目的、架构、约束、矛盾与未知。
- **Project Cognition + Goal Governor**：把项目认知、Goal Contract、验证器和真实执行事件分开保存；模型可以执行和报告证据，但只有宿主可以判定目标完成。

> **Alpha boundary / 边界**：DSH adapter 已实现并有仓库内机械测试；长期维护收益、真实模型端到端成功率和其他客户端 adapter 尚未证明。它不是“Researcher 比普通 Agent 更强”的广告，也不是通用自动编码框架。

## 为什么存在

AI coding 降低了单次修改的成本，却没有自动解决三个项目级问题：

1. **Context loss**：新会话重新推导旧会话已经理解的内容。
2. **Architecture drift**：每个局部 diff 都合理，累积结果却偏离原始目的和边界。
3. **Endless polishing**：没有事先约定 Definition of Done，Agent 会继续寻找“还能改什么”。

本项目把这三类事实拆开：

```text
.project-cognition/state.json       唯一 canonical 项目真相：目的、主张、证据与不变量
        +
.project-cognition/goals/*.json     这一次做到什么算完成、范围与预算
        +
DSH durable session events          实际调用过什么工具、得到什么结果
        ↓
host Goal Governor                  CONTINUE / NEEDS_HUMAN / DONE / STOPPED / ...
```

`PROJECT_COGNITION.md` 是由 JSON 确定性生成的人类视图，不是第二份可以悄悄漂移的真相。Researcher 的 session-log `research-state` 是 **Research Session Ledger**：它保存当前研究中的候选 claims、假设和证据线索，但始终是 provisional，不会自动改变 canonical state 或授权执行。提升流程见 [Project Cognition Governance](./docs/cognition-governance.md)。

## 适合什么场景

适合：接手陌生仓库、重大重构前、AI 已连续修改多轮、架构/安全/迁移边界敏感、团队需要明确停止条件。

不适合：一个明显的小 bug、简单 CRUD、一次性脚本，或只需要常规 spec/plan/tasks 的工作；这些场景直接使用现有 Coding Agent、Spec Kit 或 OpenSpec 通常更轻。

## 两种研究入口

| 入口 | 权限与生命周期 | 用途 |
|---|---|---|
| `/researcher <question>` | Governed Coding 中一次只读 turn，结束后自动退出 | 编码过程中临时核对项目事实 |
| `项目研究 Project Research` preset | 持续模式；要求 sandbox=`read-only`、approval=`never`，无通用 shell，并由 Runtime Certificate 自证 | 高风险或完整项目研究 |

Governed Coding 还支持 `/researcher on|off` 持久 guarded mode；它有工具白名单保护，但不等同于独立 preset 的环境级只读证明。`/researcher goal <task>` 只提出 Goal Contract 草案，不批准、不执行。

## 快速开始

安装已发布的 alpha（同时安装 `researcher`、`governed` 和 portable core）：

```bash
npx -y github:TLNing260310/dsh-researcher#v0.8.0-alpha.3
```

只读研究：新建 DSH 会话，选择「项目研究 Project Research」，确认 read-only + never，然后描述仓库和你真正想判断的问题。`research_doctor` 是强制首个工具调用；证书不是 SAFE 时研究不会开始。

Goal Governor 最小入口：

```bash
npx -y --package=github:TLNing260310/dsh-researcher#v0.8.0-alpha.3 project-cognition init .
```

随后人工维护 Project Cognition、冻结 Verifier Registry、批准 Goal Contract，并在「目标治理编码 Governed Coding」中运行：

```text
/researcher run .project-cognition/goals/<goal>.r1.json
```

完整命令见 [Goal Governor 指南](./docs/goal-governor.md#8-最小可运行流程)，可复制的完整合同见 [Minimal Simple Goal](./examples/simple-goal/README.md)。安装脚本也支持 clone 后运行 `install.ps1` / `install.sh`。

## 什么算 DONE

- 每个 MUST criterion 都由冻结的 verifier 证明；不能引用模型编造的 call ID。
- tool name、完整 arguments、arguments hash 和结果策略必须与批准时一致。
- 最终一次 attempt 必须重新证明全部 MUST，不能继承旧 attempt 的成功。
- 主观或架构判断必须经过直接 human gate。
- SHOULD 未完成不会成为继续消耗尝试的理由。
- baseline 已满足时返回 `ALREADY_SATISFIED`，不得为了“显得有工作”而改代码。
- Simple 最多 2 次修改尝试，Governed 最多 5 次；连续 2 次无 MUST 进展返回 `STOPPED`。
- 合同、认知或验证器漂移会 `NEEDS_HUMAN`；只有真实外部阻塞才是 `BLOCKED`。

模型无权写入终态。DSH 宿主重放 session log 后，才可调用 `complete / pause / block`。

Goal Contract v1 的 `boundaries.in_scope / out_of_scope / do_not_touch` 是冻结的**语义约束文字**。当前通用 DSH runtime 会拒绝宿主已经记录的 scope guard violation，但不会把这些任意字符串自动编译为文件系统 allowlist，也不会自行比较工作树路径。E1 是更窄的实验例外：冻结 manifest 的 `allowed_changes` 由 E1 runner/scorer 机械检查，并与 fixture 合同边界一同裁决。通用、机器可执行的路径 scope 需要未来显式的 Goal Contract schema v2；在此之前不能把 v1 文本描述成 hard path enforcement。

## 与相近方案的简要比较

Spec 工具保存“准备构建什么”，memory 工具保存“Agent 学到了什么”，task 工具保存“还有什么没做”。本项目尝试保存的是：**关于项目现实的主张、为什么相信它、何时证据已经陈旧，以及目标是否有结果证据。**

| 方案 | 用户获得的主要价值 | 与本项目的关系 |
|---|---|---|
| [GitHub Spec Kit](https://github.github.com/spec-kit/) | Constitution → Spec → Plan → Tasks → Implement → Converge | 目标治理的直接部分替代；本项目额外绑定 observed evidence、认知约束和通用终态 |
| [Kiro](https://kiro.dev/docs/) | Steering、Specs、任务执行、Hooks、权限与完整客户端体验 | 用户体验重叠最高；本项目更窄，强调独立只读研究和宿主终态裁决 |
| [OpenSpec](https://github.com/Fission-AI/OpenSpec) | 轻量 proposal/spec/design/tasks、delta 和归档 | 很适合作为 BUILD 结论的下游；它保存约定变化，本项目核对观察现实与矛盾 |
| [Serena](https://github.com/oraios/serena/blob/main/docs/02-usage/045_memories.md) | 语义代码工具、onboarding、可版本化 Markdown memories | 项目记忆层的强替代；本项目增量是 typed claims、证据、依赖和 freshness |
| [Beads](https://github.com/gastownhall/beads) | 持久依赖任务图、ready/claim/close、gates 与多 Agent 协调 | 任务状态部分替代且可能互补：Beads 管工作项，Governor 裁决结果是否真的达成 |
| [Claude Code](https://code.claude.com/docs/en/memory) | CLAUDE.md、auto memory 和只读 Plan mode | 单客户端最容易获得的替代；本项目目标是客户端无关、证据化和可失效协议 |

更详细、带官方来源的边界见 [竞争与集成地图](./docs/landscape.md)。这里不主张“没有竞品”：每个单项能力都有成熟替代，项目是否值得继续取决于“证据失效 + 结果完成裁决”的组合能否产生真实维护增量。

## 有价值的测试证据

| 证据 | 当前结果 | 能说明什么 |
|---|---|---|
| Node unit/replay/integration/package tests | 当前仓库测试套件 PASS | sealed-only cognition promotion、hash/revision/replay、预算、人工 gate、伪终态/伪证据拒绝、宿主完成、完整性失败暂停与 tarball 隔离安装按设计工作；具体数量以当次 `npm test` 输出为准 |
| `project-cognition doctor .` | governance lock、cognition schema/hash、Markdown projection、Goal Contracts、Verifier Registry 全 PASS | 检测 active/stale governance lock，以及 canonical state/projection 缺失或不匹配；**不枚举所有 `.tmp-*` / `.bak-*`，不执行 crash recovery，不提供跨文件断电原子性，也不证明代码或引用证据仍新鲜**，freshness 需单独使用 fingerprint report |
| DSH preset discovery | 既有 `0.1.0-rc.7` 临时安装记录中 `researcher` 与 `governed` 均 `broken=null`；alpha.3 未重跑 DSH | 该历史发布布局曾可被目标版本加载；不是本版 live E1 结果 |
| Goal Governor E1 infrastructure | **READY；Live E1 NOT RUN** | 协议定义的 fixture、冻结 manifest/run lock、离线 preflight、fail-closed live runner 与对抗 scorer 已具备；**不证明**真实模型结果价值或多客户端可移植性 |
| Experiment A（12 runs） | 同一模型下编排显著改变成本与输出，但未证明 Researcher 更优 | 客户端/工作流重要，不等于本项目有净收益 |
| Experiment C+（12 runs） | 状态迁移链可运行；A/B 因 snapshot leakage 被判定为 causal-invalid | 证明基础设施存在，也证明评测会保留失败并拒绝夸大结论 |

本地复核：

```bash
npm test
npm run doctor
npm run eval:e1:preflight
```

`eval:e1:preflight` 只执行本地结构、hash、合同和 fixture verifier 检查，网络调用与模型调用均为 0。未来产生外部 live evidence bundle 后，离线评分入口为：

```bash
npm run eval:e1:score -- --run <external-bundle-dir>
```

该命令生成 bundle 内的 `score.json`；`PASS | FAIL | INVALID` 只由宿主事件、真实 call ID/参数、冻结对象与工作树证据决定，不采用助手最终文字。有效但未达到协议终态的包会明确得到 `FAIL_UNDER_TRUSTED_HOST`，不会再出现 verdict=FAIL、causal status=PASS 的冲突。

默认真实性边界仍是：实验操作者与模型不可写的外部 bundle root 可信。alpha.3 可选择用 bundle 外的 Ed25519 key 对原始文件 commitment 签名，再让 scorer 使用 bundle 外的公钥验签：

```bash
npm run eval:e1:attest -- create --run <external-bundle-dir> --private-key <external-private.pem> --out <external-attestation.json>
npm run eval:e1:score -- --run <external-bundle-dir> --attestation <external-attestation.json> --trusted-public-key <external-public.pem>
```

验签只证明“与所给公钥对应的私钥签过这些字节，且其后未被修改”，不能证明密钥持有人身份、签署者诚实、DSH 确实运行、TTY 操作者身份或产品因果价值；代表“无需信任宿主即可独立证明 live 来源”的 `valid_for_live_conformance_claim` 因而始终为 `false`。完整、非 synthetic 的 PASS 会另将 `valid_for_protocol_conformance_under_trusted_host` 设为 `true`，表示在预注册 trusted-host 与外部 bundle-root 假设下支持条件式 E1 conformance，而不是独立来源证明。未提供外部签名时，成功状态仍是 `PASS_UNDER_TRUSTED_HOST`。live runner 默认拒绝启动，只有完整 run lock、固定 DSH 版本和显式 `--ack-live-cost` 同时存在才可能进入真实执行；本版本没有运行 live E1。

公开验证边界见 [Validation Status](./docs/validation-status.md)，预注册的下一阶段实验见 [Goal Governor Evaluation Protocol](./docs/goal-governor-evaluation-protocol.md)。证明顺序固定为 `Gate 0 → E1 → non-inferential pilot → E2 → second-adapter conformance → E3`；轨迹、estimand 与阈值只以冻结协议为准。

由于 alpha.3 按范围未重跑 DSH，当前 candidate 还需先完成冻结协议中的 DSH-dependent Gate 0 checks，之后才进入 live E1；历史 preset scan 不替代当前 candidate 的 Gate 0。

## 已证明、未证明与不允许静默改变

**仓库内已证明**：canonical hashing、sealed-only 且防 stale review / revision 回退的安装、确定性重放、只读工具面、真实 verifier call 绑定、attempt/no-progress 限制、证据前缀终态复算和 host-owned completion。

**仍是待验证假设**：Project Cognition 的纵向维护价值；Goal Governor 相对等内容 Research-only 的增量价值；不同模型/客户端的 effect size；Codex/Claude Code/Kiro/OpenClaw/Zed adapter 可行性。前两项是不同 claim，不能由同一个对照静默合并证明。

**硬不变量**：Certified Researcher 保持只读；JSON 是 Project Cognition 唯一规范事实，Research Session Ledger 只是非权威输入；模型不能批准、削弱或完成自己的 Goal Contract；失败或无效实验不能被改写成正向产品证据；已记录的目标终态必须等于从其先前可信证据复算出的 host reducer 结果，终态文字或标签不能覆盖 reducer。后续有效实验可以建立新 claim，但不能洗白历史 Experiment C+。改变这些内容需要新的 owner-reviewed cognition revision、seal 和重新审查。

## 架构与可移植性

Portable Core（Cognition / Goal / Verifier reducer、canonical JSON、schemas、CLI）不依赖 DSH。客户端 adapter 必须证明五项能力才能标记为 `governed`：host-owned approval channel（并明示 identity assurance）、hard stop/pause、durable ordered events、trusted verifier binding、project-root confinement。缺少其中任何一项时只能称为 advisory。E1 的 headless gate 只证明模型进程外的交互式 TTY 输入与命令链，不证明操作者的密码学身份。

当前只有 DSH adapter；不要把“核心可移植”误读成“其他客户端已经兼容”。

## 仓库入口

| 入口 | 内容 |
|---|---|
| [PROJECT_COGNITION.md](./PROJECT_COGNITION.md) | 本项目目的、架构、不变量、已证/未证价值和下一步证明 |
| [docs/architecture.md](./docs/architecture.md) | 当前真实架构与权限面 |
| [docs/goal-governor.md](./docs/goal-governor.md) | 合同、验证器、状态机、两种 Researcher 入口和 CLI |
| [docs/cognition-governance.md](./docs/cognition-governance.md) | 唯一 canonical state、Session Ledger 边界、promotion 与证明顺序 |
| [docs/validation-status.md](./docs/validation-status.md) | Validated / Unknown / Invalidated 边界 |
| [docs/landscape.md](./docs/landscape.md) | 相近方案、替代关系与集成边界 |
| [evaluation/](./evaluation/) | 协议、锁、原始运行、失败记录和评分产物 |
| [schemas/](./schemas/) | Portable JSON contracts |

## 参与和反馈

- 真实报告、误判和“没有产生价值”的结果都欢迎提交到 [Show us your Researcher report](https://github.com/TLNing260310/dsh-researcher/discussions/1)。
- Bug 请使用 [issue template](https://github.com/TLNing260310/dsh-researcher/issues/new/choose)。
- 开始贡献前阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)；安全问题按 [SECURITY.md](./SECURITY.md) 私下报告。

## Compatibility

- DeepSeek Harness：目标版本为 `0.1.0-rc.7`；先前 candidate 有 preset scanner PASS 记录，但 alpha.3 尚未重跑该 DSH-dependent Gate 0 检查。
- Node.js：`>=22.12.0`；alpha.3 的仓库/CI 机械测试覆盖该下限，不能替代待完成的 DSH rc.7 scanner 与 live E1。
- 当前版本：`0.8.0-alpha.3`，不承诺稳定 API。

## License

[MIT](./LICENSE) © 2026 TLNing260310
