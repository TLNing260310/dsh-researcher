# dsh-researcher

## Evidence-driven Project Intelligence Layer for DeepSeek Harness

**基于证据的项目认知层** — a read-only research preset that helps AI coding agents understand a project **before** changing it.

> **Prevent AI coding agents from making locally correct changes that gradually break the whole project.**
> Coding agents accelerate implementation. **dsh-researcher restores project understanding.**
> Coding Agent 加速构建，Researcher 恢复认知。

Before asking *"How do we build it?"*, ask *"Should we build it?"*

**零修改承诺是"可证明"而非"声称"**：别的 Agent 说 *trust me*，本层回答 **verify me** —— 每次研究开始前强制产出 Runtime Certificate，不 SAFE 不开始。

```
                    DSH
                      │
                Coding Agent
                      ↑
                 Plan Mode
                      ↑
        ┌─────────────┴─────────────┐
        │        Researcher         │
        │  Project Intelligence     │
        │  ├─ Evidence              │
        │  ├─ Runtime Verification  │
        │  └─ Drift Detection       │
        └─────────────┬─────────────┘
                Repository（只读）
```

## Why：AI 可以让每一次修改都正确，仍然把项目改坏

AI coding tools have made implementation cheap. But software development has another bottleneck: **understanding the whole system**.

- A single change may be correct.
- A hundred correct changes may still create:
  - **architectural drift** —— 架构漂移
  - **outdated assumptions** —— 假设悄悄过期
  - **inconsistent documentation** —— 文档与实现失配
  - **hidden complexity** —— 隐性复杂度堆积
  - **loss of original intent** —— 最初的意图丢失

**Local correctness does not guarantee global correctness.** 局部最优不会自动产生系统最优（米格-25 效应）。

## When to use（何时用它）

**✅ 适合**：
- 接手陌生的大型仓库
- AI 已连续修改项目几十次以上
- 重构之前
- 开源项目评估 / 技术尽调
- 技术债分析

**❌ 不适合**（直接用 Coding Agent 更快）：
- 修改一个小函数
- 修一个明显的 bug
- 简单 CRUD 需求

## Position：Researcher 不是另一个 Coding Agent

| | Coding Agent | Plan Mode | **Researcher** |
|---|---|---|---|
| 回答的问题 | 怎么实现 | 怎么修改 | **是否应该修改** |
| 目标 | 产生代码 | 产生方案 | 恢复项目认知 |
| 输出 | patch | implementation plan | diagnosis + direction |
| 失败代价 | 写错 | 计划错误 | 方向错误 |

```
Researcher      What should we build, if anything? → evidence + diagnosis + direction
     ↓ 仅 BUILD 项交接（Markdown 简述 + research_handoff.json）
Plan            How should we build it? → implementation specification
     ↓
Coding Agent    Build it. → working implementation
     ↓
Verifier / Eval Did it actually work? → evidence ──→ 回到 Researcher
```

Researcher does not replace Plan Mode. **It decides what deserves a Plan.** 不确定的项保持 INVESTIGATE——它从不强行生成任务。

## Why not just a Prompt：Project Cognition State

普通 AI 读代码的方式是 **Read → Answer**；Researcher 的方式是：

```
Observe → Record → Challenge → Update belief
（观察 → 记录 → 挑战 → 更新信念）
```

十一阶段流程容易复制；**状态**不可复制。每次研究产出一个带版本、带依赖、带证据的项目认知状态：

```
Project Model → Claims → Evidence → Confidence → Decision → Revision History
```

新证据只失效依赖它的结论（假设版本化、局部重算），不整管重跑。这是"有状态的认知系统"与"一次性的深度分析"的分界线。

## Trust：Research Runtime Health Gate

Many agents claim to be safe. **Researcher proves its operating conditions.**

```
Researcher Runtime Certificate
Run: #1
History: none (first run)
Preset:        PASS   (composedPreset=researcher)
Sandbox:       PASS   (mode=read-only)
Approval:      PASS   (policy=never)
Write tools:   PASS   (write/edit = refusing stubs)
Shell surface: PASS   (git_read only; no pwsh/bash)
Checkpoint:    PASS
Replay:        PASS   (log folds deterministically)
Overall: SAFE
```

证书是**执行级强制首步**：在它产出之前，其他一切工具被健康门禁拒绝；环境不达标时证书照常渲染 UNSAFE 作为解释。每次运行可编号、带历史（`Run #N` + `History: #1 SAFE · #2 DEGRADED`），每一份报告以证书块开头——Researcher 自己也是可审计系统（见 [docs/runtime-certificates/](./docs/runtime-certificates/)）。

## Proof：Benchmark Suite

三个公开、可复现的合成案例（`fixtures/benchmark/`），每个带 ground truth 与打分器——**这是第一道护城河：别人可以写 Research Prompt，我们提供公开评测标准**。

| 案例 | 埋入的事实 | 期望判定 |
|---|---|---|
| **architecture-drift** | v1 分层架构 → 十次"局部合理"的性能修改 → Controller 直连 DB、缓存入侵、README 描述旧架构 | 架构主张 **Contradicted**；修改 = **腐蚀而非演化**；BUILD 修复边界 / DON'T BUILD 继续补丁 |
| **documentation-drift** | README 声称"42 tests passing, CI green"，实际 3 个测试文件、无 CI、从未执行 | 测试主张 **Contradicted**；文档漂移发现；真实状态 **INVESTIGATE** |
| **false-progress** | v1.1/v1.2 加了 10 个外围功能，核心问题（冷启动质量）自 v1.0 起无评测 | 功能速度上升 ≠ 问题被解决；额外功能 **DON'T BUILD**，核心问题 **INVESTIGATE** |

```
node fixtures/benchmark/benchmark-runner.js generate <dir>
node fixtures/benchmark/benchmark-runner.js score <case-dir> <report.md>
```

（marker 打分是下限，证据引用与证书由人工复核。）

## How it works（三层）

**Layer 1 — Understand**：Repository → Code / Docs / History / Tests / Issues / External context → **Project Model**
**Layer 2 — Judge**：Claim → Evidence → Confidence → Contradiction → **Diagnosis**（证据分级 C0–C4 + 裁决态 Known/Likely/Claimed/Unknown/Contradicted）
**Layer 3 — Guide**：Diagnosis → **BUILD / DON'T BUILD / INVESTIGATE** → Plan Mode

十一阶段管道：`DISCOVER → RECONSTRUCT → EVIDENCE MAP → DIAGNOSE → TRADEOFF ANALYSIS → EXTERNAL RESEARCH → COMPARE → CHALLENGE → SHAPE → CLASSIFY → SELF-EVAL → HANDOFF`。**The pipeline is linear in execution but stateful in reasoning.**

## Non-goals（明确不做什么）

Researcher is **NOT**：
- ❌ 一个 Coding Agent（它从不修改代码）
- ❌ 自动重构工具（它只诊断，不执行）
- ❌ 通用网页调研器（它面向代码仓库，不是 Deep Research）
- ❌ 架构分析工具的替代品（GitNexus / Serena / RepoMap 等 L0/L1 能力应被整合，见 [docs/landscape.md](./docs/landscape.md)）

它负责：✅ Understanding ✅ Evidence ✅ Decision。

## 快速安装

```bash
npx -y github:TLNing260310/dsh-researcher
```

一行安装（无需 clone、无需 npm 发布），装进 `${DSH_HOME}/.agent-presets/researcher`；`--force` 覆盖更新。备选：`git clone` + `install.ps1/sh`，或 Download ZIP 手动复制。

**使用**：新建会话 → 预设选「项目研究 Project Research」→ 权限 read-only + 审批 never → 第一次工具调用自动是 `research_doctor`（Runtime Certificate）→ SAFE 后开始研究，最终报告以证书块开头、以交接包结尾。

## 深入文档

| 入口 | 内容 |
|---|---|
| [docs/landscape.md](./docs/landscape.md) | 竞品格局与 L0–L5 分层（Cairn / Drift / GitNexus / Serena / Understand Anything） |
| [docs/roadmap.md](./docs/roadmap.md) | v0.6 之后的路线（Claim Delta、生态化、集成缝、Capsule） |
| [docs/ai-engineering-skills-map.md](./docs/ai-engineering-skills-map.md) | 与 AI Engineering Skills Map 的能力映射与方法论保留 |
| [docs/handoff-schema.md](./docs/handoff-schema.md) | `research_handoff.json` 机器可读交接接口（schema v1） |
| [docs/postmortems/](./docs/postmortems/) | 事后分析："配置正确 ≠ 运行正确" |
| [docs/runtime-certificates/](./docs/runtime-certificates/) | 证书审计日志用法 |
| [fixtures/benchmark/](./fixtures/benchmark/) | 公开评测基准（三案例 + 打分器） |
| `researcher/` | 预设本体：组合、persona、三个内嵌插件、两个方法技能 |

社区索引约定：以 GitHub topic **`dsh-plugin`** 打标；内置市场提案见 [deepseek-harness#2994](https://github.com/deepseek-ai/deepseek-harness/discussions/2994)。

## 兼容性

已验证 DeepSeek Harness **0.1.0-rc.6**；其他版本守卫 fail-closed（拒绝启动而非静默退化）。

## License

[MIT](./LICENSE) © 2026 TLNing260310
