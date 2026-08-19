# Roadmap

## 已发布

- **v0.1.0** — 只读研究预设：证据分级 C0–C4、八步流程、永拒桩 + 指引段遮蔽。
- **v0.2.0** — Build-Shaping 升级：项目模型、裁决态、Tradeoff Scanner、Problem-Before-Solution、BUILD/DON'T BUILD/INVESTIGATE、反证检索、研究自查（受 AI Engineering Skills Map 启发）。
- **v0.3.0** — 工程硬化：fail-closed 守卫、Research State（局部失效 + 会话日志持久化）、L0→L2 令牌层、compaction 调优、版本预检。
- **v0.4.0** — 环境自包含：启动预检验证 sandbox=read-only 与 approval=never，显式错误配置拒绝启动、未钉住会话收紧；状态自动重放（会话日志重建推理图）+ export/import；"阶段完成=状态提交"教义。

## v0.5 — Research Cache Layer（设计已定）

**问题**：大型 monorepo 下重复研究成本高；compaction 只能清理历史，不能省去已经花掉的读取 token。

**设计**：

- 位置：`$DSH_HOME/researcher-cache/<repo-fingerprint>/` —— Harness sidecar，**不是项目目录**。零写契约定义的是 zero project mutation；sidecar 缓存是显式例外，且永远不写项目树。
- 键：`sha256(repo_fingerprint + module_path + git_blob_hashes + research_schema_version + question_class)` —— 用 Git object hash 做失效，不用 mtime/语义相似。
- 值：evidence packet 形态 `{ module, commit, summary, claims[], evidence_refs[], unknowns[] }`。
- 语义：相关 blob 未变 → cache hit，不重读源码；一个文件变 → 只失效包含该 blob 的模块条目。与 v0.3.0 的依赖失效是同一个机制的两端。
- 读写路径：research_checkpoint 增加 `cache_get` / `cache_put` 动作；agent 用 `git hash-object`（只读）算 blob hash 后查询。
- 沙箱边界注意：read-only 沙箱下 DSH fs 缝禁止一切文件写，cache 的 sidecar 写需要走受控路径（预设插件在宿主进程内，写路径严格限制在 sidecar 目录），这一例外必须在文档中显式声明。

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
