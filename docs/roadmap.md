# Roadmap

## 已发布

- **v0.1.0** — 只读研究预设：证据分级 C0–C4、八步流程、永拒桩 + 指引段遮蔽。
- **v0.2.0** — Build-Shaping 升级：项目模型、裁决态、Tradeoff Scanner、Problem-Before-Solution、BUILD/DON'T BUILD/INVESTIGATE、反证检索、研究自查（受 AI Engineering Skills Map 启发）。
- **v0.3.0** — 工程硬化：fail-closed 守卫、Research State（局部失效 + 会话日志持久化）、L0→L2 令牌层、compaction 调优、版本预检。
- **v0.4.0** — 环境自包含：启动预检验证 sandbox=read-only 与 approval=never，显式错误配置拒绝启动、未钉住会话收紧；状态自动重放（会话日志重建推理图）+ export/import。
- **v0.4.1** — Correctness hardening：replay 死代码、单 reducer、view export、material-change 失效、per-knob 预检；移除 pwsh、git_read 上线；测试 + CI。
- **v0.4.2** — 定位锐化：三失效模式、腐蚀 vs 演化之问、L0/L1 整合 L2+L3 核心（docs/landscape.md）。
- **v0.4.3** — 零写契约硬化：git_read 参数注入封死、hypothesis 真版本化；14 测试。
- **v0.4.4** — 执行时守卫（recompose 洞修复）；17 测试。
- **v0.5.0** — Self-verification：`research_doctor` Runtime Certificate；定位 Evidence-driven Project Intelligence；案例库开启。
- **v0.5.1** — 健康门禁强制化（doctor 执行级强制首步）+ 失败案例测试 + 合成案例生成器（payment-drift fixture）+ recompose 洞事后分析归档；23 测试。

## v0.6 — Delta Research：Claim Delta（下一步，不加新机制直到它成立）

**核心定义**：不是 `git diff + 重新研究`，而是**代码变化 → 哪些认知失效**。

- Baseline 研究（Claims/Hypotheses/Views 入库，`export` 基线存档）
- ↓ N commits 之后
- Claim Delta：哪些 Claim 的 evidence 已变、哪些被 invalidated、哪些 INVESTIGATE 变 BUILD
- 每个失效标注：**腐蚀还是演化**（复用 v0.4.2 的腐蚀之问）
- 输出 Delta 报告：`C12 invalidated（cache 引入，瓶颈转移）→ 新问题：cache invalidation risk`
- 实现路径：基线 export 对比当前状态 + git_read log/diff 定位证据变化；与 fixtures/benchmark 共用 ground-truth 打分
- 前置：Golden Fixtures 集（Fixtures A–E 设计见下，payment-drift 生成器已就绪）先跑通 Researcher vs Plan Mode vs 临时 Prompt 的对照，产出第一份"有效果"证据

## v0.7 — DSH 生态化

- Plugin showcase 持续维护（讨论帖 #2651）
- 安装流程打磨（install 脚本 + ZIP + 市场提案 #2994 跟进）
- 与 Plan Mode 的 handoff 演示（交接包 + 新会话接线）
- 合成案例集 3–5 个 + 公开评测报告（v0.6 产物）

## v0.8 — 集成缝与缓存（顺序不变）

- `StructuralEvidence` 标准输入：`{ source, subject, relation, target?, evidence[], confidence?, fingerprint? }`——GitNexus / Cairn / Serena / Understand Anything 的输出统一转成 Structural Evidence 进入 L2，成为 C1 级证据；节点模型统一为 `{id, kind, revision, dependencies, sourceFingerprint, dirty}`。
- sidecar 缓存：`$DSH_HOME/researcher-cache/<repo-fingerprint>/`，键 = `sha256(repo + module + git_blob_hashes + schema + question)`，失效与推理失效共用同一引擎。

## v0.9 — Project Intelligence Capsule + Memory Bridge

- 结构化 capsule（findings + constraints + invariants + unknowns + commit + freshness 依赖），**不灌完整报告**；持久化归独立 host-plane Memory Bridge；**Researcher 永不拥有 memory_write**；Coding Agent 侧 `agent/pre-step` 注入 + freshness gate。

## 上游贡献候选

- permission preset 绑定 agent preset（v0.4.0 preflight 是社区侧 workaround）。
- `read-only` + `never` 命名权限预设。
- 社区预设市场（Discussions #2994）。
- `research_doctor` 长期可作为通用 "DSH Agent Runtime Health Check" 提案。
