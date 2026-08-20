# dsh-researcher

## Evidence-driven Project Intelligence Layer for DeepSeek Harness

**基于证据的项目认知层** — a read-only research preset that helps AI coding agents understand a project **before** changing it.

> Understand the project before deciding what to do with it.
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

## 问题：AI 可以让每一次修改都正确，仍然把项目改坏

AI coding tools have made implementation cheap. But software development has another bottleneck: **understanding the whole system**.

- A single change may be correct.
- A hundred correct changes may still create:
  - **architectural drift** —— 架构漂移
  - **outdated assumptions** —— 假设悄悄过期
  - **inconsistent documentation** —— 文档与实现失配
  - **hidden complexity** —— 隐性复杂度堆积
  - **loss of original intent** —— 最初的意图丢失

**Local correctness does not guarantee global correctness.**
局部最优不会自动产生系统最优（米格-25 效应）。这不是"AI 写错代码"的问题，而是"每一步都做对了，整体却做错了"的问题。

## Researcher 不是另一个 Coding Agent

| | Coding Agent | Plan Mode | **Researcher** |
|---|---|---|---|
| 回答的问题 | 怎么实现 | 怎么修改 | **是否应该修改** |
| 目标 | 产生代码 | 产生方案 | 恢复项目认知 |
| 输出 | patch | implementation plan | diagnosis + direction |
| 失败代价 | 写错 | 计划错误 | 方向错误 |

Researcher does not replace Plan Mode. **It decides what deserves a Plan.**

## 四角色闭环

```
Researcher      What should we build, if anything? → evidence + diagnosis + direction
     ↓ 仅 BUILD 项交接
Plan            How should we build it? → implementation specification
     ↓
Coding Agent    Build it. → working implementation
     ↓
Verifier / Eval Did it actually work? → evidence ──→ 回到 Researcher
```

**Researcher only hands off BUILD decisions. Uncertain items remain INVESTIGATE.**
（不确定就是不确定——它从不强行生成任务。）

## 为什么相信它：Research Runtime Health Gate

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

证书是**执行级强制首步**：在它产出之前，其他一切工具被健康门禁拒绝；环境不达标时证书照常渲染 UNSAFE 作为解释。每一份报告以证书块开头（Run #N + History）——每次交付自带运行证明。

## How it works（三层）

**Layer 1 — Understand（理解）**

```
Repository → Code / Docs / History / Tests / Issues / External context
                                    ↓
                             Project Model
```

**Layer 2 — Judge（判断）**

```
Claim → Evidence → Confidence → Contradiction → Diagnosis
```

一个真实抓到过的例子（匿名化）：

```
README:  "94 tests passed"
Evidence: 项目自己的计数口径文件记录"静态期望，从未执行"
Decision: Contradicted（宣传与实现矛盾）
```

**Layer 3 — Guide（引导）**

```
Diagnosis → BUILD / DON'T BUILD / INVESTIGATE → Plan Mode
```

## Research Pipeline（十一阶段）

```
DISCOVER → RECONSTRUCT → EVIDENCE MAP → DIAGNOSE → TRADEOFF ANALYSIS
→ EXTERNAL RESEARCH → COMPARE → CHALLENGE → SHAPE → CLASSIFY
→ SELF-EVAL → HANDOFF
```

**The pipeline is linear in execution but stateful in reasoning.** 执行是线性的，推理是有状态的：新证据只失效依赖它的结论（假设版本化、局部重算），不整管重跑、不重读已读文件。证据分级 C0–C4（Claimed/Implemented/Tested/Observed/Externally verified）+ 裁决态（Known/Likely/Claimed/Unknown/Contradicted）贯穿全程。

## 案例：检测架构漂移（合成，可复现）

`fixtures/payment-drift/generate.js` 生成一个 payment-service：

```
Before:  Controller → Service → Repository → DB
After many local optimizations:
         Controller ──→ DB（直连）
         + cache logic leaked into controller
         + README still describes the old architecture
         + README claims "42 tests passed"（实际 3 个）
```

Researcher 输出：

```
Architecture claim:  Contradicted
Diagnosis:           corruption, not evolution（腐蚀，而非演化）
Decision:
  BUILD:       restore the layering boundary（修复分层边界）
  DON'T BUILD: add more performance patches（继续叠加性能补丁）
```

## 快速安装

```bash
npx -y github:TLNing260310/dsh-researcher
```

一行安装（无需 clone、无需 npm 发布），装进 `${DSH_HOME}/.agent-presets/researcher`。重复安装会提示；`--force` 覆盖更新。备选：`git clone` + `install.ps1/sh`，或 Download ZIP 手动复制。

**使用**：新建会话 → 预设选「项目研究 Project Research」→ 权限 read-only + 审批 never → 第一次工具调用自动是 `research_doctor`（Runtime Certificate）→ SAFE 后开始研究，最终报告以证书块开头。

## 深入文档

| 入口 | 内容 |
|---|---|
| [docs/landscape.md](./docs/landscape.md) | 竞品格局与 L0–L5 分层（Cairn / Drift / GitNexus / Serena / Understand Anything） |
| [docs/roadmap.md](./docs/roadmap.md) | v0.6 Claim Delta、v0.7 生态化、集成缝与 Capsule |
| [docs/ai-engineering-skills-map.md](./docs/ai-engineering-skills-map.md) | 与 AI Engineering Skills Map 的能力映射与方法论保留 |
| [docs/postmortems/](./docs/postmortems/) | 事后分析："配置正确 ≠ 运行正确"（recompose 洞） |
| [docs/case-studies/](./docs/case-studies/) | 匿名化案例库（真实项目案例经授权后收录） |
| [fixtures/](./fixtures/) | 合成案例生成器 + ground truth（benchmark 用） |
| `researcher/` | 预设本体：组合、persona、三个内嵌插件、两个方法技能 |

社区索引约定：以 GitHub topic **`dsh-plugin`** 打标；内置市场提案见 [deepseek-harness#2994](https://github.com/deepseek-ai/deepseek-harness/discussions/2994)。

## 兼容性

已验证 DeepSeek Harness **0.1.0-rc.6**；其他版本守卫 fail-closed（拒绝启动而非静默退化）。DSH 处于 developer preview，兼容性矩阵见路线图。

## License

[MIT](./LICENSE) © 2026 TLNing260310
