# Architecture — dsh-researcher 真实架构

> 作者:Release Architect + Open Source Project Reviewer。工程审计风格。
> 本文档描述**当前真实架构**(代码事实,非概念愿景)。定位:**evolving toward a Project Cognition Infrastructure prototype**。
> 关键原则:**Application Layer 消费 Infrastructure Layer;两层不可混淆。**

---

## 0. 2026-08-24 当前系统边界

原有 Research Application / Cognition Infrastructure 双层仍成立，但系统现已增加两条执行治理平面：

```text
Research Application (read-only cognition producer)
        ↓ handoff v2 — evidence, not authority
Portable Cognition Core (canonical project truth + Markdown projection)
        ↓ human-approved, hash-frozen Goal Contract
Portable Goal + Verifier Core (pure fold and decision)
        ↓ client adapter
DSH Host Governor (commands, real session events, external approval channel, hard stop)
        ↓
Governed Coding Agent (execution, never completion authority)
        ↓ raw host evidence
E1 Bundle Integrity (byte commitment + optional external signature + offline scorer)
```

规范状态位于 `.project-cognition/state.json`；`PROJECT_COGNITION.md` 只生成不双写。旧 `research-state` 机制保留为 provisional **Research Session Ledger**，其 session-log replay 只恢复研究过程，不会自动改变 canonical state。候选发现必须经 owner-reviewed cognition revision、seal/install 才能提升。Goal Contract、Verifier Registry 与 runtime events 分别回答“DONE 是什么”“什么证据可信”“实际发生了什么”。详细协议见 [goal-governor.md](./goal-governor.md) 与 [cognition-governance.md](./cognition-governance.md)。

Goal Contract v1 的 `boundaries` 是 hash-frozen 的语义文字，不是通用文件路径 DSL。Portable Goal Core 只验证和呈现这些字符串；当前通用 DSH adapter 也不会从工作树自动推导 scope violation。只有 trusted host 已记录的 `guard_violation(kind=scope)` 会进入 reducer。E1 另有冻结 manifest `allowed_changes`，由专用 runner/scorer 对工作树机械裁决；它不能外推为产品 runtime 已有通用 hard path scope。该能力需要显式的 schema v2 与 adapter conformance。

## 1. 架构总览(双层)

```
dsh-researcher — Project Cognition System(演化中)
    |
    +-------------------------------------------+
    |                                           |
Infrastructure Layer                      Application Layer
Project Cognition Infrastructure          Research Mode
  - Research Session Ledger               - repository research
    (provisional)                          - architecture analysis
  - canonical cognition state             - risk analysis
    (owner-reviewed)                       - decision support
  - claims graph / evidence anchors        - handoff
  - dependency tracking
  - revision tracking
  - export / import migration
  - evaluation governance
```

**数据流(单向)**:

```
Research Mode(应用层)
    │  research_checkpoint(产生认知:claims/hypotheses/views 修订)
    ▼
Research Session Ledger(基础设施:provisional 状态机,内存 + 会话日志事件溯源)
    │  fullExport → cognition-state-export.js → cognition-state.json
    ▼
状态迁移/差异管线(export/import + cognition-diff，仅生成候选与 stale-candidate)
    │  handoff / candidate revision
    ▼  owner review → seal/install
.project-cognition/state.json(canonical project truth)
    │  deterministic projection
    ▼
PROJECT_COGNITION.md(non-normative generated view)
    │
    ▼
evaluation governance(G1–G7 gate · eval-lock · blind-doctor · 失败保留)
```

---

## 2. Application Layer — Research Mode

**职责(应用层)**:

| 能力 | 代码/文档证据 |
|---|---|
| repository research(项目研究) | 十一阶段管道(DISCOVER → … → HANDOFF),methodology SKILL |
| architecture analysis(架构分析) | PCR §2 Architecture Map / §3 Critical Components |
| risk analysis(风险分析) | PCR §5 Risk Map(风险区域,非 bug 预测) |
| decision support(决策支持) | PCR §7 Decision Memo(BUILD / DON'T BUILD / INVESTIGATE) |
| handoff(交接) | `research_handoff.json`(schema v2；v1 读取兼容) |

**身份边界(能力面强制,非 prompt 自觉)**:无 shell(唯一子进程 = git_read 固定 allowlist)、write/edit 永拒桩、只读沙箱 + never 审批 —— Researcher 是**认知生产者**,不是执行者。

**验证状态**:应用层**优越性未验证**(Experiment A 方向不支持;C+ 配对被快照泄漏污染)。

## 3. Infrastructure Layer — Provisional Ledger + Canonical State

**职责(基础设施层,代码事实)**:

| 能力 | 代码证据 | 验证状态 |
|---|---|---|
| **Research Session Ledger（历史名 cognition-state）** | `researcher/plugins/research-state/index.js`:schemaVersion:1;claims/hypotheses/views/dirty;单 reducer(applyCheckpoint)事件溯源;会话日志重放 | ✅ 工程机制已验证(137 claims 实证写入)；始终 provisional、非 canonical |
| **claims graph** | claims → hypotheses → views 依赖图(dependsOn 字段) | ✅ 代码存在(89 边实证);传播机制测试不足 |
| **evidence anchors** | evidence 字符串数组 + 导出器解析为 file/line_span/blob_sha256 | ✅ 已验证(锚解析 + 指纹计算) |
| **dependency tracking** | `dependentsOf` 递归失效 → 局部重算(只重算脏节点) | ✅ 代码存在(invalidate 机制) |
| **revision tracking** | 版本化假设(invalidated 保留历史,revision 递增) | ✅ 代码存在 |
| **export / import migration** | `fullExport` → `cognition-state-export.js` → `cognition-state-to-import.js` → `importState` | ✅ 已验证(G1 32/32 保真;6/6 C+ B-runs G2 PASS) |
| **evaluation governance** | `fixtures/blind/eval-lock.js`(sha256 锁)、`blind-doctor.js`(金丝雀)、`research-doctor`(8 项运行时检查)、G1–G7 gate | ✅ 已验证(抓住 QUOTA 失败;LOCK OK) |
| **canonical Project Cognition state** | `.project-cognition/state.json` + `lib/cognition-core`:sealed schema/hash、review diff、exact-next revision、expected-base hash、state/projection rollback protection | ✅ 机械测试通过；进程内写入失败会 best-effort rollback；doctor 检测 active/stale governance lock 和 missing/mismatched canonical pair，但不枚举所有 tmp/bak、不做 crash recovery，也不宣称跨文件断电原子性或 reviewer 身份 |
| **goal governor** | `lib/goal-core`:frozen revisions/event fold/MUST-SHOULD/human gates/attempt+no-progress stop、repo-revision linkage、terminal-prefix recomputation、progress card | ✅ 机械测试通过；v1 boundary strings 仅具语义约束，通用 runtime path enforcement 未实现；真实长期价值未证明 |
| **trusted verifier** | `lib/verifier-core`:tool + canonical arguments + hash + result policy；DSH call-id pairing | ✅ forged/drift/error replay tests 通过 |
| **DSH host adapter** | `lib/dsh-adapter` + `researcher/plugins/goal-governor` + `governed/` | ⚠️ exact rc.2 实跑发现并修复模型可见 Governor schema 与 resume stage-one 混合 replay domain；DSH recapture 后三条本地对照为可评分 FAIL、一条对抗轨 INVALID，rejected resume observe 的 live/durable checkpoint 一致且不签发 token/seal；完整 E1 与 remote route 仍待做 |
| **E1 evidence integrity** | `evaluation/goal-governor-e1`:raw bundle commitment、外部 Ed25519 trust root、verdict-aware scorer | ✅ 离线/对抗测试通过；签名只证明所给公钥对应私钥签过这些字节及签后完整性，不证明密钥持有人身份、运行真实性或因果价值 |
| **E1 model-route boundary** | run lock 冻结 `base_url`；outer 生成冻结 settings（`watch=false`）并设置 `DEEPSEEK_BASE_URL`；child 通过 DSH 公共 DeepSeek resolver 在 create/resume 与每次 followup 边界复验 | ✅ 离线/对抗路径与 exact rc.2 official Flash 已运行；⚠️ protocol v1.5、不完整 v1.6 与不完整 v1.7 均为 INVALID，v1.8 尚未 live，loopback 只约束第一跳，不证明本地服务不代理远程 |

**原型边界(诚实声明)**:以上全部为**原型级实现**,不是商业级基础设施 —— 产品化(v0.9 capsule / Memory Bridge / 自动迁移)未做;应用层价值未验证。

## 4. Application Consumes Infrastructure(消费关系,不可混淆)

| 维度 | Infrastructure Layer | Application Layer |
|---|---|---|
| 角色 | provisional 认知承载 + owner-ratified canonical state | 认知的**生产**(production) |
| 生命周期 | Session Ledger 随会话日志持久/迁移；canonical state 随仓库 revision 持久 | 会话内(每次分析一次生产) |
| 写入方 | Ledger 由 `research_checkpoint` 追加；canonical state 仅由 owner-reviewed revision 经 CLI seal/install 改变 | 模型(十一阶段管道) |
| 可验证性 | Ledger 可 replay/diff；canonical state 可验 schema/hash/projection，freshness 另验 fingerprint | 证书(doctor)+ PCR 双层 |
| 价值声明 | **工程机制已验证，长期价值未验证** | **优越性未验证** |

**禁止混淆的三件事**:
1. "状态迁移可行" ≠ "Research Mode 更优" —— 前者已验证,后者未验证;
2. "Session Ledger 可重放" ≠ "Ledger 是项目真相" —— 只有 owner promotion 后的 `.project-cognition/state.json` 规范;
3. "基础设施是原型" ≠ "基础设施是营销" —— 原型是真实的工程资产,但产品化未做。

## 5. 与相邻系统的边界

```
L0 项目有什么   → GitNexus / Serena / Aider RepoMap / Understand Anything(整合,不重造)
L1 发生了什么   → Cairn / Drift / codeboarding(整合,不重造)
L2 哪些结论是真的 → dsh-researcher Infrastructure:证据台账、层级、裁决、依赖失效   ★ 核心
L3 变化是不是好事 → dsh-researcher Application:项目模型、问题链、权衡、三态       ★ 核心
L4 怎么做       → DSH Plan Mode
L5 做           → Coding Agent
```

详见 [docs/landscape.md](./landscape.md)。

## 6. 架构决策记录(ADR-lite)

| # | 决策 | 理由 | 状态 |
|---|---|---|---|
| A1 | Application/Infrastructure 分层 | 认知生产与承载分离;已验证能力归基础设施,未验证价值归应用层 | 2026-08 采纳 |
| A2 | 单一项目事实源 = `.project-cognition/state.json`；session-log `research-state` 仅为 provisional Research Session Ledger | 区分模型观察与 owner ratification，同时保留可重放、可审计、零写研究契约 | 已实现 |
| A3 | 状态迁移走 export/importState(现有工具面) | 零新 agent 工具;G1 保真验证 | 已验证 |
| A4 | 检测 = 标注不动作(cognition-diff 只输出 stale-candidate) | 零自动失效承诺;人工裁决 | 已实现 |
| A5 | 失败保留为反例资产 | 可信度优先;QUOTA/leakage 记录不删除 | 已执行 |
| A6 | Ledger/handoff 只能经 owner-reviewed revision → seal/install 提升 | 防止报告、模型推断或 replay 静默改写项目目的与架构 | 已采纳 |
| A7 | Canonical install 只接受 sealed exact-next revision，并绑定 review 时的 current hash | 防止 draft 直装、revision 回退与并发 stale overwrite；进程内写入失败 best-effort rollback；doctor 检测 lock 与 canonical pair 缺失/不匹配，不恢复崩溃或枚举所有残留 | 已实现；不宣称跨文件断电原子性 |
| A8 | E1 外部签名只验证所给公钥对应私钥签过 bundle bytes，不升级身份、live 或 causal claim | 将篡改检测与“密钥属于谁、宿主是否诚实、运行是否真实”分开 | 已实现 |
| A9 | E1 run lock 冻结 `base_url`，不从 model-selection metadata 推断连接目标；outer 固定 settings/`watch=false`/`DEEPSEEK_BASE_URL`，child 用 DSH 公共 resolver 在每个模型边界复验 | model selection 不提供连接 URL；必须对 adapter 真正解析出的连接目标 fail closed。remote 固定 official Flash + `https://api.deepseek.com`；local 仍使用 `deepseek-official` adapter + 无尾斜杠字面 loopback | 离线实现；DSH `0.1.1-rc.2` preset discovery 已通过，完整 Gate 0/capture 仍待验证 |

---

*本文档描述当前真实架构（代码审计）；只确认有证据的原型机制，不把它外推为产品化完成或 Researcher 优越性。*
