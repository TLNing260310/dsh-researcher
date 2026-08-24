# Project Cognition + Goal Governor

本文描述当前实现，不把路线图写成已交付能力。核心价值不是“让模型多想一遍”，而是把项目级认知、执行目标、证据与停止权拆成不同权限面，使 vibe coding 具有可审计的结束条件。

## 1. 三类规范事实与一种非权威账本

| 事实 | 规范载体 | 权限 |
|---|---|---|
| 项目为何存在、架构、不变量、已证明/未知价值 | `.project-cognition/state.json` | JSON 是真相；`PROJECT_COGNITION.md` 只是确定性人类投影 |
| 这一次做到什么算完成 | `.project-cognition/goals/<id>.r<n>.json` | 草案可讨论；只有人工审批后的哈希版本可执行；修改必须新 revision |
| 这一次实际发生了什么 | DSH session log | host 持有；从真实 command/tool events 确定性重放，不信任模型总结 |

Researcher 的 session-log `research-state` 另构成 **Research Session Ledger**：它是当前研究中的 provisional claims/hypotheses/evidence，不是第四份规范事实。认知账本和 Research handoff 都不会自动改变 canonical state 或变成执行授权。只有 `ledger/handoff → draft cognition revision → owner review → seal/install → generated projection` 可以提升项目级事实；完整规则见 [Project Cognition Governance](./cognition-governance.md)。执行流程还必须跨过 Goal Contract 人工批准门，并冻结验证器注册表哈希。

## 2. 两种 Researcher 启动方式

1. `/researcher <question>`：Governed Coding preset 内的一次只读研究 turn。主机只开放显式工具白名单，Shell、写入、工作流和子代理均被拒绝；该 turn 结束后自动退出。
2. `项目研究 Project Research` preset：持续、可自证的 Researcher Mode。它额外要求 OS/DSH sandbox=`read-only`、approval=`never`、无通用 Shell，并由 `research_doctor` 发放 SAFE capability。

`/researcher on` 提供 Governed Coding 内的持久 guarded mode，直到 `/researcher off`。它的模型工具面是只读的，但它不等同于 certified preset 的 OS sandbox 证明；高风险研究仍应使用独立 preset。

`/researcher goal <task>`只研究并输出 Goal Contract 草案。Researcher 不写文件、不批准合同、不执行。

## 3. 目标闭环

```text
human prompt
  → Researcher / project cognition
  → draft Goal Contract
  → human approval + contract hash + verifier registry hash
  → /researcher run <approved contract>
  → baseline attempt
  → execute smallest change
  → frozen verifier tool calls
  → observations referencing real call IDs
  → host compares evidence with contract
  → CONTINUE | NEEDS_HUMAN | DONE | ALREADY_SATISFIED
             | BLOCKED | STOPPED | CANCELLED
```

模型能执行、反馈、报告阻塞，但不能写入终态。`request_goal_decision` 由 host reducer 重放会话并调用纯 Goal Core；只有 host 能调用 DSH `goals.complete/pause/block` 和终止当前 turn。

### DONE 的硬语义

- 每个 MUST criterion 均有与冻结 `verifier_id` 一致的 observation；
- evidence ref 指向本次 DSH session 中更早的真实 tool call/result；
- 工具名、canonical arguments hash、结果策略与冻结注册表一致；
- 所有 required human gates 由直接 `/researcher approve-gate` 命令批准；
- 不存在 scope / invariant / verifier / contract guard violation；
- SHOULD 未通过不能继续消耗尝试；
- 首次 baseline 已满足时返回 `ALREADY_SATISFIED`，不得为了“显得有工作”而修改。

### 防止无休止优化

| 模式 | 适用 | 修改尝试上限 | 无进展上限 |
|---|---|---:|---:|
| Simple | 目标明确、局部、确定性验证、无架构/安全/迁移/主观门 | 2 | 2 |
| Governed | 公共 API、数据迁移、安全、架构、不变量、主观验收或目标歧义 | 5 | 2 |

到达尝试/时间/token/no-progress 边界返回 `STOPPED`，而不是降低验收标准。需要改变目标、范围、验证器或不变量时，旧合同必须 supersede，新 revision 重新人工批准。

## 4. 验证器为什么必须冻结

只冻结 `verifier_id="tests.core"` 不够：执行期间可把同名验证器从“完整测试”改成“echo ok”。因此 Goal Contract 还冻结 `verifier_registry_hash`。注册表的每个 entry 冻结：

- 允许的 DSH tool name；
- canonical JSON arguments 本身及其 SHA-256（二者必须机械一致，Agent 可执行但不能换参数）；
- `tool_success`、`json_field_equals` 或 `text_excludes` 结果策略。

伪造 call ID、引用未来调用、参数漂移、工具运行错误、结果与 observation 不一致，都会产生 `guard_violation` 并进入 `NEEDS_HUMAN`。

## 5. 模型与客户端分别决定什么

模型更影响“认知质量”：是否发现真实目的、能否提出可证伪假设、标准是否遗漏、架构判断是否合理。客户端/host 更影响“制度可靠性”：能否限制能力、保留事件、绑定身份、验证真实证据、强制暂停和终止。

因此预期不是二选一：

- 普通 prompt/Research 报告的效果方差更可能由模型与上下文质量主导；
- 防伪证据、不可静默改目标、停止循环的效果更可能由客户端 enforcement 主导；
- 最终维护价值是交互项：强模型 × 弱 host 仍会漂移，强 host × 弱模型会稳定地执行一个较差合同。

需要用同一任务集做 model × client 因子实验，而不能用单模型单客户端推断归因。至少记录：合同缺陷率、MUST 漏项、越界尝试率、伪证据接受率、无效改动数、达到 DONE 的尝试数、人工纠偏次数、长期回归/架构漂移。

## 6. 跨客户端边界

Portable Core 已与 DSH 分离：canonical JSON、Cognition Core、Goal Core、Verifier Core 和 JSON Schemas 不依赖 DSH。客户端只需实现 adapter manifest 的五项能力：

1. host-owned human-approval channel，并明确其 identity-assurance level；
2. hard stop/pause；
3. durable ordered event store；
4. trusted verifier binding；
5. project-root confinement。

Codex、Claude Code、Zed/Zcode、OpenClaw 等可复用合同与 reducer，但不能仅靠 prompt 宣称兼容。若客户端缺少 hard stop、可信事件来源或宿主拥有的批准通道，只能标记 advisory，不能标记 governed。TTY 只能证明输入通道在模型进程之外，不能单独证明操作者的密码学身份。下一 adapter 应在 DSH 真实价值实验通过后再实现，避免把未证明的设计过早复制成多端维护负担。

## 7. 当前证明边界

已证明（仓库内机械证据）：核心状态/hash/revision/replay、合同终态不可覆盖、attempt/no-progress/time/token 上限、最终 attempt 同轮重验全部 MUST、当前合同事件分段、真实 call-ID verifier 绑定、人工 gate command authority、one-shot mode 状态机、host-owned completion 与完整性失败暂停集成轨迹、发布 tarball 隔离安装，以及安装产物可被 DSH rc.7 preset scanner 解析。测试数量以当前 `npm test` 输出为准，不作为价值证明。

尚未证明：真实 DSH 模型会话端到端成功率、Project Cognition 的纵向维护价值、Goal Governor 相对等内容 Research-only 的增量价值、不同模型/客户端的 effect size、其他客户端 adapter。历史 Experiment C+ 因隔离污染不具备因果效力；后续有效实验只能建立新的独立 claim，不能使 C+ 的历史记录恢复有效。

下一价值门不是再加 prompt 或更多 schema，而是严格按以下依赖顺序推进：

`Gate 0 → E1 → non-inferential pilot → E2 → second-adapter conformance → E3`

E1 的 live DSH 轨迹、E2 的实验设计、estimand、阈值和 invalidity rule 只由冻结的 [Goal Governor Evaluation Protocol](./goal-governor-evaluation-protocol.md) 定义，本指南不复制清单。pilot 只验证执行与测量基础设施，不产生效果结论；E2 的增量效应对比同样以协议为准。E2 通过后才实现最小第二 adapter，并先证明协议要求的 governed capabilities 与 live conformance；之后才能运行 model × client 的 E3。Project Cognition 的长期价值另需 longitudinal protocol。

## 8. 最小可运行流程

```powershell
# 1. 建立空骨架
project-cognition init .

# 2. 人工编辑 state draft（删除旧 state_hash、递增 revision），owner review 后显式安装
project-cognition cognition seal .project-cognition/state-draft.json
project-cognition cognition install .project-cognition/state-draft.json --root . --replace

# 3. verifier draft 同时写 tool_name + 完整 arguments；seal 自动计算 arguments_hash 与 registry_hash
project-cognition verifier seal .project-cognition/verifiers-draft.json
project-cognition verifier install .project-cognition/verifiers-draft.json --root . --replace

# 4. 根据风险输入获得 Simple/Governed 建议；最终 mode 由批准者确认
project-cognition goal recommend risk.json

# 5. Goal draft 引用当前 state_hash 与 registry_hash；批准后 revision 文件不可覆盖
project-cognition goal approve goal-draft.json --actor owner --root .
project-cognition goal show .project-cognition/goals/<goal>.r1.json

# 6. 表示完整性与投影一致性检查（不等于 evidence freshness）
project-cognition doctor .

# 若要声称 evidence freshness，另提供实际指纹
project-cognition cognition freshness fingerprints.json .
```

随后在 DSH 选择「目标治理编码 Governed Coding」并运行：

```text
/researcher run .project-cognition/goals/<goal>.r1.json
```

Agent 必须按 `get_goal_contract` 返回的完整冻结 invocation 调用验证器，并把真实 call ID 交给 `submit_goal_observation`。人为主观/架构验收使用 `/researcher approve-gate <id> [evidence-ref]`；拒绝则用 `reject-gate`，需要改变合同则创建新 revision，而不是在运行中降低标准。
