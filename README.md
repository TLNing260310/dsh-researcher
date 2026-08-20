# dsh-researcher

## Evidence-driven Project Intelligence Layer for DeepSeek Harness
## 基于证据的项目认知层（DeepSeek Harness）

**EN** — A read-only research preset that helps AI coding agents understand a project **before** changing it.
**中文** — 一个只读研究预设：让 AI 编码 Agent 在动手修改项目**之前**，先真正理解它。

> **EN** — Prevent AI coding agents from making locally correct changes that gradually break the whole project.
> Coding agents accelerate implementation. **dsh-researcher restores project understanding.**
> **中文** — 防止 AI 编码 Agent 用一次次"局部正确"的修改，把整个项目逐渐改坏。
> Coding Agent 加速构建，Researcher 恢复认知。

Before asking *"How do we build it?"*, ask *"Should we build it?"*
在问"怎么做"之前，先问"该不该做"。

**零修改承诺是"可证明"而非"声称"**：别的 Agent 说 *trust me*，本层回答 **verify me** —— 每次研究开始前强制产出 Runtime Certificate，不 SAFE 不开始。
**The zero-write promise is proven, not claimed**: other agents say *trust me*; this layer answers **verify me** — a Runtime Certificate is enforced before research begins, and no research starts unless it is SAFE.

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
                Repository（只读 / read-only）
```

## Why — 为什么需要它

**EN** — AI coding tools have made implementation cheap. But software development has another bottleneck: **understanding the whole system**.
**中文** — AI 编码工具让实现变得廉价，但软件开发还有另一个瓶颈：**理解整个系统**。

**EN**
- A single change may be correct.
- A hundred correct changes may still create: architectural drift, outdated assumptions, inconsistent documentation, hidden complexity, loss of original intent.

**中文**
- 一次修改可能是正确的。
- 一百次正确的修改，仍然可能累积出：架构漂移、过期的假设、文档与实现失配、隐性复杂度、最初意图的丢失。

**EN** — Local correctness does not guarantee global correctness.
**中文** — 局部最优不会自动产生系统最优（米格-25 效应）。

## When to use — 何时用它

**✅ 适合 / Use it when**
- 接手陌生的大型仓库 / taking over a large unfamiliar repository
- AI 已连续修改项目几十次以上 / AI has modified the project dozens of times
- 重构之前 / before a refactor
- 开源项目评估 / 技术尽调 / OSS evaluation or technical due diligence
- 技术债分析 / technical debt analysis

**❌ 不适合 / Skip it when**（直接用 Coding Agent 更快 / a coding agent is faster）
- 修改一个小函数 / changing one small function
- 修一个明显的 bug / fixing an obvious bug
- 简单 CRUD 需求 / simple CRUD work

## Position — 定位：Researcher 不是另一个 Coding Agent

**EN** — Researcher is not another coding agent.

| 问题 Question | Coding Agent | Plan Mode | **Researcher** |
|---|---|---|---|
| EN | How to implement it | How to change it | **Whether to change it at all** |
| 中文 | 怎么实现 | 怎么修改 | **是否应该修改** |
| 目标 Goal (EN/中文) | produce code / 产生代码 | produce a plan / 产生方案 | restore project cognition / 恢复项目认知 |
| 输出 Output | patch | implementation plan | diagnosis + direction |
| 失败代价 Failure cost | 写错 wrong code | 计划错误 wrong plan | 方向错误 wrong direction |

```
Researcher      What should we build, if anything? → evidence + diagnosis + direction
     ↓ 仅 BUILD 项交接（Markdown 简述 + research_handoff.json）
Plan            How should we build it? → implementation specification
     ↓
Coding Agent    Build it. → working implementation
     ↓
Verifier / Eval Did it actually work? → evidence ──→ 回到 Researcher
```

**EN** — Researcher does not replace Plan Mode. **It decides what deserves a Plan.** Uncertain items remain INVESTIGATE — it never manufactures tasks.
**中文** — Researcher 不取代 Plan Mode。**它决定什么值得进入 Plan。** 不确定的项保持 INVESTIGATE——它从不强行生成任务。

## Why not just a Prompt — 为什么不只是一段 Prompt：Project Cognition State

**EN** — A plain AI reads code as **Read → Answer**. Researcher works as **Observe → Record → Challenge → Update belief**.
**中文** — 普通 AI 读代码的方式是 **Read → Answer**；Researcher 的方式是 **观察 → 记录 → 挑战 → 更新信念**。

**EN** — The eleven-stage pipeline is easy to copy; the **state** is not. Every research run produces a versioned, dependency-carrying, evidence-backed cognition state: Project Model → Claims → Evidence → Confidence → Decision → Revision History.
**中文** — 十一阶段流程容易复制；**状态**不可复制。每次研究产出一个带版本、带依赖、带证据的项目认知状态：项目模型 → 主张 → 证据 → 置信度 → 决策 → 版本历史。

**EN** — New evidence invalidates only what depends on it (versioned hypotheses, local recomputation) — never a full pipeline rerun.
**中文** — 新证据只失效依赖它的结论（假设版本化、局部重算），不整管重跑、不重读已读文件。

## Trust — 为什么相信它：Research Runtime Health Gate

**EN** — Many agents claim to be safe. **Researcher proves its operating conditions.**
**中文** — 很多 Agent 声称自己安全。**Researcher 证明自己的运行条件。**

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

**EN** — The certificate is an **enforced first step**: every other tool is refused by the health gate until it is produced; in a bad environment the certificate still renders UNSAFE as the explanation. Every run is numbered with history (`Run #N` + `History: #1 SAFE · #2 DEGRADED`), every report starts with the certificate block — Researcher itself is an auditable system (see [docs/runtime-certificates/](./docs/runtime-certificates/)).
**中文** — 证书是**执行级强制首步**：在它产出之前，其他一切工具被健康门禁拒绝；环境不达标时证书照常渲染 UNSAFE 作为解释。每次运行可编号、带历史（`Run #N` + `History: #1 SAFE · #2 DEGRADED`），每一份报告以证书块开头——Researcher 自己也是可审计系统（见 [docs/runtime-certificates/](./docs/runtime-certificates/)）。

## Proof — 证明：Benchmark Suite

**EN** — Three public, reproducible synthetic cases with ground truth and a scorer — **the moat: anyone can write a research prompt; we publish an evaluation standard.**
**中文** — 三个公开、可复现的合成案例（带 ground truth 与打分器）——**这是第一道护城河：别人可以写 Research Prompt，我们提供公开评测标准。**

| 案例 Case | 埋入的事实 Planted facts | 期望判定 Expected verdicts |
|---|---|---|
| **architecture-drift** | EN: v1 layered architecture → ten "locally reasonable" perf edits → Controller hits DB directly, cache leaks in, README describes the old architecture. 中文：v1 分层架构 → 十次"局部合理"的性能修改 → Controller 直连 DB、缓存入侵、README 描述旧架构 | 架构主张 **Contradicted**；修改 = **腐蚀而非演化 corrosion, not evolution**；BUILD 修复边界 / DON'T BUILD 继续补丁 |
| **documentation-drift** | EN: README claims "42 tests passing, CI green"; actually 3 test files, no CI, never executed. 中文：README 声称"42 tests passing, CI green"，实际 3 个测试文件、无 CI、从未执行 | 测试主张 **Contradicted**；文档漂移发现 doc-drift；真实状态 **INVESTIGATE** |
| **false-progress** | EN: v1.1/v1.2 added 10 peripheral features; the core problem (cold-start quality) has had no evaluation since v1.0. 中文：v1.1/v1.2 加了 10 个外围功能，核心问题（冷启动质量）自 v1.0 起无评测 | 功能速度上升 ≠ 问题被解决 feature velocity ≠ problem resolution；额外功能 **DON'T BUILD**，核心问题 **INVESTIGATE** |

```
node fixtures/benchmark/benchmark-runner.js generate <dir>
node fixtures/benchmark/benchmark-runner.js score <case-dir> <report.md>
```

（marker 打分是下限，证据引用与证书由人工复核。/ Marker matching is a floor; citations and the certificate are human-reviewed.）

## How it works — 工作原理（三层 / three layers）

**Layer 1 — Understand 理解**：Repository → Code / Docs / History / Tests / Issues / External context → **Project Model**
**Layer 2 — Judge 判断**：Claim → Evidence → Confidence → Contradiction → **Diagnosis**（证据分级 evidence tiers C0–C4 + 裁决态 verdicts Known/Likely/Claimed/Unknown/Contradicted）
**Layer 3 — Guide 引导**：Diagnosis → **BUILD / DON'T BUILD / INVESTIGATE** → Plan Mode

十一阶段管道 Pipeline：`DISCOVER → RECONSTRUCT → EVIDENCE MAP → DIAGNOSE → TRADEOFF ANALYSIS → EXTERNAL RESEARCH → COMPARE → CHALLENGE → SHAPE → CLASSIFY → SELF-EVAL → HANDOFF`。**The pipeline is linear in execution but stateful in reasoning. 执行是线性的，推理是有状态的。**

## Non-goals — 明确不做什么

Researcher is **NOT**：
- ❌ 一个 Coding Agent（它从不修改代码）/ a coding agent (it never modifies code)
- ❌ 自动重构工具（它只诊断，不执行）/ an automatic refactoring tool (it diagnoses, it does not execute)
- ❌ 通用网页调研器（它面向代码仓库，不是 Deep Research）/ a general web researcher (it targets code repositories, not web deep research)
- ❌ 架构分析工具的替代品（GitNexus / Serena / RepoMap 等 L0/L1 能力应被整合，见 [docs/landscape.md](./docs/landscape.md)）/ a replacement for architecture tools (integrate L0/L1 instead)

它负责 It does：✅ Understanding 理解 ✅ Evidence 证据 ✅ Decision 决策。

## Install — 快速安装

```bash
npx -y github:TLNing260310/dsh-researcher
```

**EN** — One line (no clone, no npm publish) installs into `${DSH_HOME}/.agent-presets/researcher`; `--force` overwrites. Alternatives: `git clone` + `install.ps1/sh`, or Download ZIP and copy manually.
**中文** — 一行安装（无需 clone、无需 npm 发布），装进 `${DSH_HOME}/.agent-presets/researcher`；`--force` 覆盖更新。备选：`git clone` + `install.ps1/sh`，或 Download ZIP 手动复制。

**EN Usage** — New session → preset「项目研究 Project Research」→ permission read-only + approval never → the first tool call is automatically `research_doctor` (Runtime Certificate) → research after SAFE; the final report starts with the certificate block and ends with the handoff package.
**中文 使用** — 新建会话 → 预设选「项目研究 Project Research」→ 权限 read-only + 审批 never → 第一次工具调用自动是 `research_doctor`（Runtime Certificate）→ SAFE 后开始研究，最终报告以证书块开头、以交接包结尾。

## Docs — 深入文档

| 入口 Entry | 内容 Contents |
|---|---|
| [docs/landscape.md](./docs/landscape.md) | 竞品格局与 L0–L5 分层 / competitive landscape & L0–L5 layering（Cairn / Drift / GitNexus / Serena / Understand Anything） |
| [docs/roadmap.md](./docs/roadmap.md) | 路线图 / roadmap（Claim Delta、生态化、集成缝、Capsule） |
| [docs/ai-engineering-skills-map.md](./docs/ai-engineering-skills-map.md) | 与 AI Engineering Skills Map 的能力映射与方法论保留 / capability mapping & methodological caveats |
| [docs/handoff-schema.md](./docs/handoff-schema.md) | `research_handoff.json` 机器可读交接接口 / machine-readable handoff interface（schema v1） |
| [docs/postmortems/](./docs/postmortems/) | 事后分析 / postmortems："配置正确 ≠ 运行正确"（recompose 洞） |
| [docs/runtime-certificates/](./docs/runtime-certificates/) | 证书审计日志用法 / certificate audit log |
| [fixtures/benchmark/](./fixtures/benchmark/) | 公开评测基准 / public benchmark（三案例 + 打分器 / three cases + scorer） |
| `researcher/` | 预设本体 / the preset itself：组合 composition、persona、三个内嵌插件 plugins、两个方法技能 skills |

社区索引约定 Community index convention：以 GitHub topic **`dsh-plugin`** 打标；内置市场提案见 / marketplace proposal: [deepseek-harness#2994](https://github.com/deepseek-ai/deepseek-harness/discussions/2994)。

## Compatibility — 兼容性

**EN** — Verified on DeepSeek Harness **0.1.0-rc.6**; on other versions the guard fails closed (refuses to start rather than degrading silently).
**中文** — 已验证 DeepSeek Harness **0.1.0-rc.6**；其他版本守卫 fail-closed（拒绝启动而非静默退化）。

## License

[MIT](./LICENSE) © 2026 TLNing260310
