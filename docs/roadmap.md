# Roadmap

## 已发布

- **v0.1.0** — 只读研究预设：证据分级 C0–C4、八步流程、永拒桩 + 指引段遮蔽。
- **v0.2.0** — Build-Shaping 升级：项目模型、裁决态、Tradeoff Scanner、Problem-Before-Solution、BUILD/DON'T BUILD/INVESTIGATE、反证检索、研究自查（受 AI Engineering Skills Map 启发）。
- **v0.3.0** — 工程硬化：fail-closed 守卫、Research State（局部失效 + 会话日志持久化）、L0→L2 令牌层、compaction 调优、版本预检。
- **v0.4.0** — 环境自包含：启动预检验证 sandbox=read-only 与 approval=never，显式错误配置拒绝启动、未钉住会话收紧；状态自动重放（会话日志重建推理图）+ export/import；"阶段完成=状态提交"教义。
- **v0.4.1** — Correctness hardening：修复 replay 死代码（arguments 是 JSON string）、单 reducer（runtime ≡ replay）、view export 键丢失、hypothesis material-change 失效、per-knob 预检；**移除 pwsh，白名单 git_read 工具上线（模型不再拥有任意进程执行原语）**；7 个 reducer 测试 + CI 全绿。
- **v0.4.2** — 定位锐化：三失效模式（局部最优/上下文保真/时间漂移）正式化；"腐蚀 vs 演化"之问进入 CHALLENGE；L0/L1 整合、L2+L3 为核心的定位确立（docs/landscape.md）。

## v0.4.3 — Test / Compatibility Harness（下一步）

**问题**：设计领先于验证。guard preflight、zero-write、环境预检目前只有源码级验证。

**范围**：

- **Golden Research Fixtures**：3 个埋了已知事实的项目（small / medium / monorepo）：README 声称有测试而实际没有；声称支持 Linux 而代码只支持 Windows；一个看似无用的模块实际是关键依赖；一个看似值得 BUILD 的功能实际已有实现。测试 Researcher 能否正确发现、评级、反证、分类。
- **guard 冒烟测试**：真实会话（或测试驱动）验证环境预检三态（unset→tighten / safe→keep / unsafe→refuse）、永拒桩可见性、指引段遮蔽。
- **zero-write 冒烟**：会话前后 `git status --porcelain` 一致，作为 CI 可执行步骤。
- **兼容性探针**：DSH rc.7 / rc.8 上重跑 preflight + 挂载校验，产出兼容性矩阵。

## v0.5 — Integration Seams，然后才是自建缓存（设计已定，顺序修正）

**原则修正**：L0/L1 是商品能力——先接现有优秀项目，不在它们之后再自建知识图谱。

- **第一步（v0.5a）集成缝**：定义 Research Dependency Engine 节点模型（Git Blob → Evidence Packet → Claim → Hypothesis → Project Model → Diagnosis → Classification，统一 `{id, kind, revision, dependencies, sourceFingerprint, dirty}`），并接入：GitNexus MCP（impact/trace/detect_changes）、Cairn blueprint 对比（drift findings 作为 C1 级证据输入）、Understand Anything 导出图（L0 制图输入）。接入即"证据"，不复制数据。
- **第二步（v0.5b）sidecar 缓存**：`$DSH_HOME/researcher-cache/<repo-fingerprint>/`，键 = `sha256(repo_fingerprint + module_path + git_blob_hashes + research_schema_version + question_class)`（`git_read hash-object` 已就绪），失效与推理失效共用同一引擎。

## v0.6 — 自动评测体系（设计已定）

**问题**：目前证明了"会输出报告"，还没证明"比普通 Agent 好"。要进入社区甚至研究级，需要 benchmark。

**设计**：

- 语料：10 个真实项目（small OSS / medium OSS / large monorepo 各若干），每个附人工标注的 ground truth（真实架构、真实问题、已知风险）。
- 基线 vs 实验：DeepSeek Coding Agent（直接干）vs DSH Researcher → Coding Agent（先研究）。
- 指标：
  - **架构理解准确率**：人工标注的 ground-truth 架构 vs Agent 重建架构（模块、边界、数据流）。
  - **建议质量**：专家对 BUILD / DON'T BUILD / INVESTIGATE 三态判定的正确率。
  - **修改避免率**：baseline 直接修改了多少"错误方向"，Researcher 流程提前阻止了多少。
  - 附：token 成本对照（Research 流程的额外成本 vs 省下的回滚成本）。
- 产物：一篇可复现的评测报告 + 数据集发布。这一步会把项目从"GitHub 插件"推向"AI Engineering Research Project"。

## v0.7 — Project Intelligence Capsule + Memory Bridge（设计已定）

- Researcher 产出结构化 capsule（findings + constraints + architecture invariants + unknowns + commit + freshness 依赖），**绝不产出"灌给 Coding Agent 的完整报告"**。
- 持久化归独立的 host-plane Memory Bridge；**Researcher 永远不拥有 memory_write**（它连未来 Agent 的认知环境都无权修改）。
- Coding Agent 侧在 `agent/pre-step` 注入，带 freshness gate（exact HEAD match → CURRENT；blob 未变 → VALID FOR UNCHANGED MODULES；blob 变 → STALE；分支分叉 → HISTORICAL ONLY）——与 v0.5 的 git blob hash 机制共用。

## 上游贡献候选

- permission preset 绑定 agent preset（本预设 v0.4.0 的 preflight 是社区侧 workaround）。
- `read-only` + `never` 命名权限预设。
- 社区预设市场（已在 Discussions #2994 提案）。
