# Project Cognition Projection Layer Design Proposal v0.2

> 作者角色:Architecture Research Engineer。
> 修订依据:`docs/cognition-layer-principal-review-v0.2.md`(Principal Architect 裁决,M1–M6 全部接受)。
> 与 v0.1 的关系:本文件是 v0.1 的**修订版**,不是扩展。名称从 "Project Cognition Layer" 改为 **"Project Cognition Projection Layer"** —— 定位从"认知载体"修正为"认知投影"。
> 限制(全部遵守):不修改 runtime / 不新增 tool / 不实现 memory / 不实现代码。本文件是纯设计文档。

---

## 0. 定位声明(接受 M1 + M2 后的最终形态)

**`.cognition/` 不是认知层,是认知的投影层。** 三者关系:

```
cognition-state(JSON)            ← 唯一事实源(已有:research-state 状态机 + 会话日志)
      │  投影(host 流程,复用 cognition-state-export 家族)
      ▼
.cognition/(markdown 渲染)       ← 派生视图(本提案对象;人/agent 只读,不可直接编辑)
      ▲
cognition-diff(JSON)             ← 失效检测输出面(已有工具;只标注,不动作)
```

- **M1 接受**:cognition-state = 唯一事实源;`.cognition/` = 投影层。任何认知内容只存在于状态机中;`.cognition/` 是它的 markdown 渲染,可以随时删除并重新生成,不丢失任何认知。
- **M2 接受**:这是 **agent-oriented cognition projection** —— 主要读者是修改代码的 agent(及其人类审查者),主要生产者是状态机;**它不是通用 memory 系统**:无独立记忆、无自动回灌、无隐藏状态,内容全部可追溯到状态源。

---

## 1. 单一事实源架构(接受 M1)

### 1.1 数据流(单向,无回流)

```
research_checkpoint 调用(模型自驱,会话内)
   → research-state 状态机(内存 + 会话日志)= 唯一事实源
   → cognition-state-export.js(已有,host 侧)→ cognition-state.json
   → 投影渲染(本 v0.2 定义的格式,host 侧)→ .cognition/*.md
   → cognition-diff.js(已有,host 侧)→ 失效标注(渲染视图中的标记)
```

### 1.2 写入规则(硬性)

| 对象 | 谁能写 | 谁能读 |
|---|---|---|
| research-state(状态机) | Researcher 模型(经 research_checkpoint) | 模型、host 工具 |
| cognition-state.json | 仅导出器(host) | host、评估者 |
| `.cognition/*.md` | **无人直接写** —— 仅投影流程重建 | 人、agent(只读) |
| cognition-diff.json | 仅 diff 工具(host) | host、评估者 |

- **人工不直接编辑 `.cognition/`**。人想改认知 → 改代码/开会话 → 重新导出。这条规则消除双事实源(Review §1 的裁决)。
- **Researcher 无写权限假设被明确禁止(M3)**:投影由 host 流程执行;Researcher 的零写契约保持不变。

---

## 2. 投影格式(渲染视图规范)

> 保留 v0.1 的目录分层作为**渲染组织**(不是事实组织);删除"信息分类三问"作为独立机制(它只是投影内容的分组规则)。

### 2.1 目录(与 v0.1 相同,但性质改为"渲染文件")

```
.cognition/
├── README.md            # 渲染说明 + 指向状态源的链接 + 生成时间
├── core.md              # 目标/原则/不变量的渲染
├── constraints.md       # 硬约束/do-not-touch 渲染
├── decisions.md         # 决策条目渲染
├── state.md             # 当前状态渲染
├── drift.md             # cognition-diff 失效标注的渲染
└── archive/             # 被取代条目的归档渲染(由投影流程生成)
```

### 2.2 条目格式(核心字段 = 仅两项价值,接受 M5)

```markdown
## [I-01] 零运行时依赖
- statement: 生产代码不得引入运行时依赖
- evidence_anchor: package.json (blob sha256: a3f9...)
- invalidation_condition: 供应链策略正式变更(issue #NN)
- status: active            # active | superseded | expired
- source: C07 @ run #N       # 指向状态源 claim id,可追溯
```

**条目只保留四要素**:statement / evidence_anchor / invalidation_condition / status。
**删除的弱属性**:token 预算表(改为投影流程的渲染约束,不是设计价值)、类别分级表(渲染分组用)、被推翻条件流程图(并入 invalidation_condition 字段)。

---

## 3. 维护责任与投影流程(接受 M3)

### 3.1 维护责任(单一归属,无悬空)

| 角色 | 责任 | 触发 |
|---|---|---|
| **投影流程(host)** | 每次 Researcher 会话结束后,从会话日志 → cognition-state.json → `.cognition/` 全量重建 | 会话结束(评估/部署流程调用,复用 export 工具) |
| 人 | **只读**;不承担更新义务 | — |
| agent | **只读**;不承担更新义务;无写工具 | — |
| CI/钩子 | **无** —— v0.2 不定义任何 CI 集成(Review §3 裁决:无执行载体的承诺全部删除) | — |

### 3.2 投影流程定义(不实现,仅规格)

```
输入: session.events.json(已归档)或运行中的会话
步骤:
  1. foldCheckpointEvents(现有纯函数)→ 状态
  2. cognition-state-export.js(现有)→ cognition-state.json
  3. 渲染器(本 v0.2 规格,host 脚本,复用导出器输出)→ .cognition/*.md
  4. cognition-diff.js(现有)→ 失效标注(仅当有对比对象时)
输出: .cognition/(全量重建,旧内容被替换;archive/ 由渲染器维护)
```

**关键性质**:投影是**幂等且可重建的** —— 任何时刻删除 `.cognition/`,重新运行流程即恢复。这就是"渲染视图"的定义。

---

## 4. 检测边界(接受 M4 — 只作为 cognition-diff 输出能力)

### 4.1 删除的承诺

v0.1 的 R1–R5 检测规则、询问开发者流程、自动更新 state.md、CI 钩子 —— **全部删除**。理由(Review §4):它们没有执行载体(agent 无写工具、CI 无钩子、人无义务),是空头承诺。

### 4.2 保留的能力(全部来自已有工具,零新增)

| 能力 | 载体 | 输出 | 动作 |
|---|---|---|---|
| 证据锚失效检测 | `cognition-diff.js`(已有) | stale-candidate 列表 | **无** —— 只标注 |
| 失效标注渲染 | 投影渲染器(本规格) | drift.md 中的 `status: pending-verify` 标记 | **无** —— 只展示 |

**检测 = 标注,不 = 动作**:diff 的输出只进入渲染视图的标记位;"询问开发者""自动失效""自动更新"等行为承诺全部不存在。**人类审查者看到标记后自行决定** —— 这是人的动作,不是系统的承诺。

---

## 5. 价值声明(接受 M5 — 最小化,只留两项)

### 5.1 核心价值(仅此两项)

1. **invalidation condition(被推翻条件)**:每个认知条目显式声明"什么条件下这条认知失效"。这是 CLAUDE.md / ADR / README 都没有的 —— 它们只有"这条知识",没有"这条知识何时过期"。
2. **evidence anchor(证据锚)**:每条认知绑定代码 blob 指纹,使"这条认知还成立吗"成为**可机械检验的问题**(cognition-diff),而非人工猜测。

**两项合一的含义**:认知条目的生命周期(active → superseded/expired)可以被**条件化、可验证地**驱动,而不是靠人发现过期。

### 5.2 明确删除的弱价值描述(Review §5 裁决)

- ❌ "信息密度 / token 效率" —— 渲染约束,不是设计价值(CLAUDE.md 分层也能做到);
- ❌ "条目级生命周期" —— ADR 已有状态机,不是增量;
- ❌ "人机共读" —— 折中不是优势;本 v0.2 明确读者优先级为 agent 优先、人可读为附加面(M2);
- ❌ "漂移检测规则体系" —— 无执行载体,降级为 diff 输出能力(§4)。

### 5.3 与替代方案的诚实对比(仅剩差异)

| 方案 | 有 invalidation condition? | 有 evidence anchor? |
|---|---|---|
| README | 无 | 无 |
| CLAUDE.md | 无 | 无 |
| AGENTS.md | 无 | 无 |
| ADR | 无(superseded 是事后状态,不是事前条件) | 无(引用无指纹) |
| **`.cognition/`(v0.2)** | **有(事前声明)** | **有(blob 指纹)** |

**增量判据**:只有当"条件化失效 + 可验证锚"在真实使用中被证明有用时,本设计才有存在价值 —— 这正是 Experiment C+ 要回答的。

---

## 6. 价值依赖声明(接受 M6)

**本设计的价值完全依赖 Experiment C+ 的结果:**

- **若 C+ 成立**(cognition-state 继承被证明有增量):`.cognition/` 作为其人类可读渲染面,有资格进入实现;
- **若 C+ 失败**(H2 无增益):cognition-state 本身降级,`.cognition/` **一并降级/放弃** —— 投影层不能比事实源更有价值。

**禁止**:在 C+ 结果未决时,将 `.cognition/` 作为已证明的价值主张写入任何产品文档、roadmap 或营销材料。

---

## 7. 失败模式(v0.2 修订版)

| 失败模式 | 概率 | 缓解(v0.2 内) | 残余风险 |
|---|---|---|---|
| 渲染无人读(投影存在但 agent 不加载) | 中 | 读者优先级明确(agent 优先);投影与状态同源,agent 读状态即读投影 | agent 加载行为未定义(依赖宿主集成,超出本设计) |
| 双事实源(人工绕过投影直接编辑) | 低(被规则禁止) | 写入规则 §1.2 硬性声明 | 纪律执行靠审查,非机械 |
| H2 失败拖累 | 中 | §6 失败前提声明 | 无(降级路径明确) |
| 渲染噪声(diff 误报淹没标记) | 中 | 标记为 pending-verify(候选非结论) | 文件级指纹粒度的已知局限 |
| 投影流程本身无人运行 | 中 | 责任单一归属(§3.1);复用已有 export 工具 | 部署方义务,超出设计文档 |

**v0.1 的三个致命歧义(边界/伪装/维护)在 v0.2 中已通过 M1/M2/M3 消除**:单一事实源、诚实命名、维护责任单一化。

---

## 8. 实现范围(仅当 C+ 通过后;本文件不实现)

| 项 | 范围 | 新增? |
|---|---|---|
| 渲染器(状态 → `.cognition/*.md`) | host 脚本,消费 cognition-state.json | 新增 1 个 host 脚本(非 agent tool) |
| 条目 schema(四要素) | 渲染格式规格(本文件 §2.2) | 文档 |
| drift.md 渲染 | 消费 cognition-diff.json 输出 | 渲染器内置 |
| 其他 | 无 | — |

**明确不包含**:CI 集成、agent 加载机制、询问流程、自动失效、memory 持久化、任何 runtime/工具/状态机修改。

---

## 9. 结论

v0.2 接受 Principal Review 全部六项裁决,把设计从"认知载体"修正为"认知投影":

- **M1** 单一事实源(cognition-state);`.cognition/` 是可重建渲染;
- **M2** agent-oriented cognition projection,非通用 memory;
- **M3** 维护 = host 投影流程,零人工义务、零 agent 写权限、零 Researcher 写假设;
- **M4** 检测 = cognition-diff 输出能力(标注),无任何无载体动作承诺;
- **M5** 价值 = invalidation condition + evidence anchor 两项;
- **M6** 价值依赖 Experiment C+ 结果。

**本设计的存在理由一句话**:让 cognition-state 的"条件化失效 + 可验证锚"以人类可读、agent 可加载的 markdown 形态呈现 —— 若 C+ 证明状态本身无价值,此投影一并放弃;若 C+ 成立,此投影是认知层的唯一无歧义落地形态。

---
*本文件为纯设计文档;未实现代码、未修改 runtime、未新增 tool、未实现 memory。*
