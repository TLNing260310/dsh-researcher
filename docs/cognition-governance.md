# Project Cognition Governance

本文件定义 Project Cognition 的权威边界、研究结论提升流程和证明顺序。它描述治理程序；具体项目事实仍只以 `.project-cognition/state.json` 为准。

## 1. 一份规范真相，不是一份自动记忆

| 载体 | 角色 | 是否规范 | 谁可以改变 |
|---|---|---:|---|
| `.project-cognition/state.json` | 项目目的、架构边界、value claims、不变量、决策、证据索引与下一证明 | **是，唯一 canonical state** | owner-reviewed revision 经 seal/install 后改变 |
| `PROJECT_COGNITION.md` | canonical state 的确定性人类投影 | 否 | CLI 生成；不得手改 |
| Research Session Ledger（`research-state` / session-log replay） | 当前研究会话中的 claims、hypotheses、views、dirty 状态与证据线索 | 否，始终 provisional | Researcher 可追加；不能批准项目事实 |
| Research handoff/report | 给人和下游执行者的候选结论与建议 | 否 | Researcher 产生，owner 选择是否提升 |
| Goal Contract | 单次工作的冻结完成条件、范围、预算与 verifier 引用 | 仅对该目标规范 | 人工批准新 revision；模型不能批准或降级 |
| DSH session events | 单次执行实际发生的工具调用、结果和 gate command | 对运行历史规范 | host 记录；模型总结不能覆盖 |

“记住了”不等于“已批准”。Session Ledger、报告或 handoff 中的内容即使证据充分，也不能直接覆盖 canonical state，不能自动成为不变量，也不能授权执行。

## 2. Promotion：从研究发现到 canonical revision

只有以下流程可以改变项目级真相：

1. **Observe**：Researcher 在只读环境中记录候选 claim、证据位置、置信度、反证和未知；这些内容留在 Session Ledger/handoff。
2. **Propose**：维护者选择值得长期保存的内容，用 `project-cognition cognition draft` 将当前 canonical state 复制为无 `state_hash`、revision 恰好加 1 的候选，并写入本次独占的仓库外（或明确 gitignored）review 路径。
3. **Classify**：为每个变更明确 `authority`、`proof_status`、适用 `scope`、`evidence_refs`、`invalidation_conditions` 和 freshness。模型推断不得伪装成 `owner_ratified` 或 `repository_observed`。
4. **Review**：owner 检查新事实是否与 mission、hard invariants、active decisions、失败实验记录和冻结协议冲突；涉及硬不变量时还必须完成其 `change_policy` 要求的复审。
5. **Seal and install**：CLI 将 owner 实际审阅过的 draft 写成独立 sealed artifact；install 只接受该 artifact，并要求当前 canonical hash 与审阅基线一致、revision 恰好递增 1。state 与 Markdown projection 对进程内写入错误使用 best-effort rollback；这不是跨文件断电事务，也不是 crash-recovery system。
6. **Verify**：运行 `project-cognition doctor .` 检查 active/stale governance lock、canonical state schema/hash、state/projection 缺失或不匹配、合同和注册表。doctor 不枚举所有 `.tmp-*` / `.bak-*`，不自动恢复中断的写入，也不判断证据是否仍新鲜；freshness 必须另用 `project-cognition cognition freshness <fingerprints.json> .`。

```powershell
# <unique-review-dir-outside-repo> 必须是本次 review 独占的新目录；不要放进 .project-cognition/
project-cognition cognition draft --root . --out <unique-review-dir-outside-repo>/state.r<N>.draft.json

# 人工编辑后先检查语义变化与高风险项；记录输出中的 base.state_hash
project-cognition cognition diff <unique-review-dir-outside-repo>/state.r<N>.draft.json --root .

# owner review 通过后，seal 到独立文件；install 不接受未 sealed draft
project-cognition cognition seal <unique-review-dir-outside-repo>/state.r<N>.draft.json --out <unique-review-dir-outside-repo>/state.r<N>.sealed.json
project-cognition cognition install <unique-review-dir-outside-repo>/state.r<N>.sealed.json --root . --replace --expect-current-hash <reviewed-base-state-hash>
project-cognition doctor .
```

review artifact 默认放在仓库外且每次使用唯一文件名；CLI 故意拒绝覆盖它们，install 也不会替你删除。若组织政策要求留在仓库工作区，必须置于明确 gitignored 的 review 目录，绝不能放进 `.project-cognition/`、提交或打包；release package allowlist 会排除它们，builder 也会拒绝任何进入 package inventory 的非 allowlist `.project-cognition` 内容。审阅完成后在仓库外归档或删除这些 provisional artifact。

若 review 未通过，候选结论留在 Session Ledger 或 known unknowns；不得为了减少冲突而静默覆盖旧事实。`cognition diff` 会突出 mission/architecture、authority/proof、硬不变量、active decision 与 evidence 删除等变化，但它只是 review 辅助。`--replace`、`--expect-current-hash` 和本地 actor label 都不构成身份认证；它们防止 draft 直装、revision 回退和 stale/concurrent overwrite，owner 身份与批准仍是仓库治理责任。

Canonical state 使用 `schemas/cognition-state-v1.schema.json` 并必须含 `state_hash`；CLI 产生的无 hash 候选使用 `schemas/cognition-state-draft-v1.schema.json`。两者不是可互换的验证目标。

## 3. 历史无效性与新证据

- 失败、污染或不可采信的实验记录必须保留。
- 新实验可以建立一个带新实验身份、范围和证据引用的新 claim。
- 新实验不能回写历史协议、改变历史 validity，也不能把 Experiment C+ 的污染结果“升级”为有效因果证据。
- 若新证据取代一个仍有效的结论，应新增 revision 并使用明确的 supersession 关系；不能删除审计链。

## 4. 文档职责

- canonical state：只保存当前规范事实及其证据边界。
- `validation-status.md`：证据账本，区分 mechanical、live conformance、outcome validated、portable validated。
- 冻结 evaluation protocol：轨迹、样本、estimand、阈值和 invalidity rule 的唯一来源。
- `roadmap.md`：只保存尚未完成的 gate、依赖与停止条件。
- README：用户入口和诚实边界，只链接状态与协议，不复制易漂移的轨迹定义或测试总数。
- `goal-governor.md`：当前运行语义和 CLI，不重新定义实验协议。

同一事实若必须出现在多个文档中，应由 canonical state/冻结协议生成或使用链接；不得在多处手工维护数字、轨迹清单或阈值。

## 5. 证明级别与顺序

四个层级不可互相替代：

1. **Mechanical**：schema、hash、reducer、replay、guard 和 package 测试通过。
2. **Live conformance**：真实客户端/模型会话按冻结轨迹执行且 replay 等价。
3. **Outcome validated**：预注册对照实验达到效果与成本阈值。
4. **Portable validated**：第二个客户端先通过 governed capability 与 live conformance，再完成跨模型×客户端归因。

当前证明顺序固定为：

`Gate 0 → E1 → non-inferential pilot → E2 → second-adapter conformance → E3`

- E1 的轨迹只由 [Goal Governor Evaluation Protocol](./goal-governor-evaluation-protocol.md) 定义；其他文档不得复制一份可能漂移的清单。
- pilot 只检查任务可执行性、telemetry、blinding 和 scoring，不产生确认性效果结论。若 pilot 导致任务、指标、阈值或协议内容变化，必须 bump protocol、重新冻结，再开始 E2。
- E2 中 B（Research-only）对 C（Research + Governor）识别 Goal Governor 增量价值；A 对 C 只能描述整套系统的总效应。
- Project Cognition 的长期价值是独立的 longitudinal claim，需要多阶段 cognition-value protocol，不能由 E2 代替。
- 只有 E2 通过，才投入第二 adapter；只有第二 adapter 先通过五项 governed capability 和等价 live conformance，才运行 E3。

## 6. 变更检查清单

提交 cognition revision 或状态文档变更前确认：

- [ ] canonical revision 已递增并由 CLI 重新 seal；
- [ ] `cognition diff` 的 base hash 与 install 时的 `--expect-current-hash` 一致；
- [ ] draft/sealed review artifact 使用唯一的仓库外路径（或明确 gitignored 路径），未进入 `.project-cognition/`、提交或 package；
- [ ] `PROJECT_COGNITION.md` 由 CLI 生成而非手改；
- [ ] Session Ledger/handoff 未被描述为规范真相；
- [ ] claim 的 proof status、scope 与实际证据层级一致；
- [ ] 历史失败和 invalidity 未被覆盖；
- [ ] 路线顺序未绕过 E1、pilot 或 E2；
- [ ] `project-cognition doctor .` 通过且不存在 active/stale governance lock；若声称 freshness，另附 fingerprint report。
