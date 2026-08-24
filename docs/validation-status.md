# Validation Status — dsh-researcher

> 更新时间：2026-08-24（`0.8.0-alpha.3`）。本文件是公开证据账本：准确区分机械实现、真实运行、结果价值与可移植性，不把一个层级的 PASS 外推到另一个层级。规范 claim 以 `.project-cognition/state.json` 为准。

## 证据层级

| 层级 | 回答的问题 | 当前状态 |
|---|---|---|
| Mechanical | schema、hash、reducer、guard、replay、package 是否按设计工作 | **仓库内 PASS** |
| Live conformance | 真实 DSH 模型会话是否覆盖冻结终态/失败轨迹，resume 与 replay 是否等价 | **未完成 E1** |
| Outcome validated | 机制是否改善真实维护结果且成本可接受 | **未完成 E2 / longitudinal study** |
| Portable validated | 第二客户端是否保持治理语义，效果能否跨模型×客户端归因 | **未实现第二 adapter；未完成 E3** |

只有达到后一层，才能使用后一层的产品表述。测试或 doctor PASS 不是生产力、长期价值或跨客户端兼容证明。

## 0.8 alpha 的当前机械证据

| 能力 | 当前证据 | 可采信结论 | 不能据此宣称 |
|---|---|---|---|
| Canonical Project Cognition | sealed canonical schema/hash、机器 diff、exact-next revision、expected-base hash、state+projection best-effort rollback | 可以机械拒绝 draft 直装、hash 缺失、revision 回退/跳号和 stale overwrite；进程内写入失败可 best-effort rollback；doctor 可检测 active/stale governance lock 和 canonical state/projection 缺失或不匹配 | 枚举所有 tmp/bak 残留或 crash recovery；跨文件断电原子性；已提高长期维护效率；本地参数证明 owner 身份；证据自动新鲜 |
| Research Session Ledger | `research-state` reducer、session-log replay、claims/hypotheses/views/dirty、export/import | 研究会话可保留 provisional 推理与线索，并可重放 | Ledger 是 canonical truth；模型可自动 ratify |
| Goal Contract | 冻结 MUST/SHOULD、scope、budget、human gates、cognition/registry hash、有效 invariant refs 与连续本地 revision | “什么算完成”可在执行前固定；修改必须沿已安装 predecessor 新 revision | 合同本身保证任务价值或规格正确 |
| Goal Governor | 纯 reducer/replay、真实 call-ID 与冻结参数绑定、attempt/observation repo revision 一致、终态前缀复算、同一最终 attempt 重验 MUST | 模型文本或不一致的 recorded decision 不能单方面完成目标；会话内伪造/漂移证据可被机械拒绝；status 明示剩余预算与停止动作 | 真实模型端到端成功率或净收益已证明；repo revision label 等同工作树字节证明 |
| E1 bundle integrity | 原始字节 inventory commitment；可选 bundle 外 Ed25519 attestation 与外部 trust root；FAIL/PASS causal status 分离 | 可检测已签证据包在签署后的字节修改，并识别“有效证据但 conformance FAIL” | 签名证明 DSH 真实运行、签署者诚实、真人身份或因果价值 |
| Researcher 启动方式 | one-shot、guarded mode、certified preset 的权限/状态机测试 | 研究与执行权限面可分离；certified preset 提供更强环境边界 | 所有客户端都有相同的 OS/host enforcement |
| DSH packaging | 先前临时安装与 DSH `0.1.0-rc.7` preset scanner 中 `researcher`/`governed` 均可发现；alpha.3 未重跑 DSH | 既有发布布局记录可被目标版本解析 | alpha.3 已重新完成 DSH scan；全部 live terminal trajectories 已通过 |
| Portable Core | DSH 无关的 cognition/goal/verifier core、schemas、CLI、adapter contract | 核心抽象具备适配缝 | Codex、Claude Code、Zed/Zcode、OpenClaw 已兼容 |

当前 `npm test` 覆盖 unit、replay、integration 与 isolated package smoke；具体数量以当次测试输出为准，避免文档复制数字后漂移。

## `doctor` 与 freshness 的边界

`project-cognition doctor .` 验证：

- canonical state schema 与 `state_hash`；
- `PROJECT_COGNITION.md` 是否与 state 的确定性 projection 完全相同；
- Goal Contracts 与 Verifier Registry 是否结构和 hash 有效。

它不读取代码来判断 evidence ref 是否仍成立，也不重新计算 evidence fingerprint。因此 doctor PASS 只表示**表示完整性与投影一致性**。任何“证据仍新鲜”的声明必须另附：

```text
project-cognition cognition freshness <fingerprints.json> .
```

没有 expected/observed fingerprint 的 evidence 会得到 `unknown`，不能因 state 中旧的 `checked_at` 自动当作 fresh。

## Canonical value claims

| Claim | 当前状态 | 正确证明 |
|---|---|---|
| V1：canonical state/hash/revision/replay/projection 已实现 | proven within repository scope | tests + CLI/doctor |
| V2：DSH adapter 可机械拒绝伪造/漂移证据并保留 host terminal authority | supported，尚非 live E2E | E1 全部 live trajectories |
| V3A：持久 Project Cognition 改善纵向维护 | hypothesis | 独立 T0→Tn cognition-value protocol |
| V3B：Goal Governor 相对等内容 Research-only 降低 false-DONE/scope drift/correction cost | hypothesis | E2 的 B vs C |
| V4：相同 core 可移植到其他客户端 | hypothesis | 第二 adapter capability + conformance，然后 E3 |
| V5：历史 C+ 足以证明 Researcher superiority | refuted / not admissible | 历史结论不可洗白；新实验只能建立新 claim |

E2 的 A vs C 可以报告整个工作流的总效应，但不能单独归因 Project Cognition、Researcher 或 Goal Governor。

## 历史 Research Session Ledger 与 Experiment A/C+

旧文档中的 `cognition-state` 指 Research Session Ledger，不是当前 `.project-cognition/state.json`：

| 历史工程能力 | 保留证据 | 边界 |
|---|---|---|
| structured session ledger | schemaVersion 1；claims/hypotheses/views/dirty；单 reducer 与 session-log replay；137 claims 写入 | 原型工程能力，非 owner-ratified project truth |
| evidence-backed session tracking | file/line/blob anchors、C0–C4、局部失效 | 证明可记录与失效，不证明长期价值 |
| migration mechanism | export/import、G1 保真、C+ B-runs migration gate | 证明迁移链存在，不证明迁移有净收益 |
| evaluation governance | G1–G7、eval-lock、blind-doctor、research-doctor、失败保留 | 证明评测能发现部分完整性问题 |

Experiment A 表明同一模型下 orchestration 会显著改变成本和输出，但没有证明 Researcher 更优。Experiment C+ 的 A/B superiority 与 Mutation Recall 受 T1 snapshot isolation leakage / searchable marker 污染，因而不具备可采信的因果效力。协议、原始运行、失败记录和 validity 结论必须保留；后续有效实验不能修改该历史 validity。

完整历史分析见 [Experiment C+ Conclusion](./evaluation-cplus-conclusion.md)。

## 下一证明及进入条件

当前顺序固定为：

`Gate 0 → E1 → non-inferential pilot → E2 → second-adapter conformance → E3`

轨迹、样本、estimand、阈值和 invalidity rule 只以冻结的 [Goal Governor Evaluation Protocol](./goal-governor-evaluation-protocol.md) 为准。E1 包含协议定义的全部轨迹；本文件不另存一份清单。Project Cognition 的 V3A 使用独立 longitudinal protocol，不由 E2 代替。

`alpha.3` 没有重跑 DSH，因此当前 candidate 仍须先完成协议要求的 DSH-dependent Gate 0 checks，才进入 live E1；既有 scanner 记录不能替代这一步。

## 判定纪律

1. 不得宣称 Researcher superiority、生产力提升、AI memory 问题已解决、真实 DSH E2E 已通过或其他客户端已兼容。
2. Research Session Ledger、报告和 handoff 不得被描述为 canonical state；promotion 必须经过 owner review、seal 与新 revision。
3. QUOTA、leakage、无效果和高成本都是结果；不得删除或通过 scorer wording 改写。
4. pilot 不产生确认性效果结论；pilot 后若改变任务、指标或阈值，必须 protocol bump、重新冻结。
5. E2 未通过，不开始第二 adapter；第二 adapter conformance 未通过，不开始 E3。

治理流程见 [Project Cognition Governance](./cognition-governance.md)，未完成 gate 见 [Roadmap](./roadmap.md)。
