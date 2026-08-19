# Roadmap

## 已发布

- **v0.1.0** — 只读研究预设：证据分级 C0–C4、八步流程、永拒桩 + 指引段遮蔽。
- **v0.2.0** — Build-Shaping 升级：项目模型、裁决态、Tradeoff Scanner、Problem-Before-Solution、BUILD/DON'T BUILD/INVESTIGATE、反证检索、研究自查（受 AI Engineering Skills Map 启发）。
- **v0.3.0** — 工程硬化：fail-closed 守卫、Research State（局部失效 + 会话日志持久化）、L0→L2 令牌层、compaction 调优、版本预检。
- **v0.4.0** — 环境自包含：启动预检验证 sandbox=read-only 与 approval=never，显式错误配置拒绝启动、未钉住会话收紧；状态自动重放（会话日志重建推理图）+ export/import；"阶段完成=状态提交"教义。
- **v0.4.1** — Correctness hardening：修复 replay 死代码（arguments 是 JSON string）、单 reducer（runtime ≡ replay）、view export 键丢失、hypothesis material-change 失效、per-knob 预检；**移除 pwsh，白名单 git_read 工具上线（模型不再拥有任意进程执行原语）**；7 个 reducer 测试 + CI 全绿。
- **v0.4.2** — 定位锐化：三失效模式（局部最优/上下文保真/时间漂移）正式化；"腐蚀 vs 演化"之问进入 CHALLENGE；L0/L1 整合、L2+L3 为核心的定位确立（docs/landscape.md）。
- **v0.4.3** — 零写契约硬化 P0：git_read 参数边界修死（ref/path 校验、仓库内路径限制、`--` 隔离、`--output`/`-w`/`-c` 注入全拒，5 个恶意参数测试）；hypothesis 真版本化（history 数组 + 自动失效翻转也记录）；14 个测试全绿。

## v0.4.4 — Golden Research Fixtures（下一步）

**问题**：机制有了，但还没证明"真的产生更好的 Research"。这是项目现在最大的短板。

**范围**（比 Cache 更优先）：

- **Fixture 0（dogfooding）**：让 dsh-researcher 研究 dsh-researcher——验证它能否自动发现"README 架构图落后于实际实现"这类文档漂移（本项目自己的论点必须第一个在自己身上验证）。
- **Fixture A**：README 与实现不一致（声称有测试/跨平台，实际没有）。
- **Fixture B**：每个局部优化都合理，但累积形成循环依赖/架构腐化 → 应判 BUILD 前的全局警告。
- **Fixture C**：旧 convention 已过时 → 不应误判为 corrosion，应判合理演化。
- **Fixture D**：用户要求加 feature，真实瓶颈不是 feature 数量 → DON'T BUILD。
- **Fixture E**：证据不足 → INVESTIGATE。
- **对照**：Researcher vs DSH Plan Mode vs 临时 Research Prompt，人工标注 ground truth，产出第一份"有效果"证据。
- **guard/zero-write 冒烟（并入）**：环境预检三态（unset→tighten / safe→keep / unsafe→refuse）、永拒桩可见性、会话前后 `git status --porcelain` 一致，作为 CI 可执行步骤。
- **兼容性探针（并入）**：DSH rc.7 / rc.8 上重跑 preflight + 挂载校验，产出兼容性矩阵。

## v0.4.5 — Delta Research（候选，看 fixtures 结果）

- baseline → 20 commits → `research --delta`：哪些结构改变？哪些旧 Claim 失效？哪些 INVESTIGATE 变成 BUILD？这是腐蚀还是演化？——与 Temporal Drift Failure 完全闭环，是 Fixtures 之后的自然能力延伸。

## v0.5 — Integration Seams，然后才是自建缓存（设计已定，顺序修正）

**原则修正**：L0/L1 是商品能力——先接现有优秀项目，不在它们之后再自建知识图谱。

- **第一步（v0.5a）集成缝**：定义**极小的标准输入** `StructuralEvidence`：`{ source, subject, relation, target?, evidence[], confidence?, fingerprint? }`——GitNexus（impact/trace/detect_changes）、Cairn（drift findings）、Serena（symbol 关系）、Understand Anything（导出图）的输出统一转成 Structural Evidence 进入 L2 Evidence Engine，成为 C1 级证据；接入即"证据"，不复制数据。节点模型统一为 `{id, kind, revision, dependencies, sourceFingerprint, dirty}`（Research Dependency Engine）。
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
