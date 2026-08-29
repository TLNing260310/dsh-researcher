# Validation Status — dsh-researcher

> 更新时间：2026-08-29（published `0.8.0-alpha.9`; development `0.8.0-alpha.10-dev.0`）。本文件是公开证据账本：准确区分机械实现、Researcher smoke、Goal Governor E1、结果价值与可移植性，不把一个层级的 PASS 外推到另一个层级。规范 claim 以 `.project-cognition/state.json` 为准。

alpha.5 与 alpha.7 candidate 的本地 smoke 是 provisional evidence；在 owner review、seal、install 前，它们不会自动改写 canonical Project Cognition。这是 promotion 边界的实际应用，不是第二份规范真相。

## 证据层级

| 层级 | 回答的问题 | 当前状态 |
|---|---|---|
| Mechanical | schema、hash、reducer、guard、replay、package 是否按设计工作 | **仓库内 PASS** |
| Live conformance | 真实 DSH 模型会话是否覆盖冻结终态/失败轨迹，resume 与 replay 是否等价 | **v1.5 INVALID；v1.6-v1.11 不完整且 INVALID；v1.12 offline-only / live STOPPED** |
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
| E1 model cost and protocol authority | manifest/run lock 冻结北京时间黑窗与 `base_url`；remote 精确为 official Flash + `https://api.deepseek.com`；local 为固定 loopback；v1.12 manifest 明示 `live_e1=STOPPED`，outer runner 在解析 live 参数、路径、输出或启动 DSH 前机械拒绝 | 离线测试及 fresh-home 本地运行支持 route/cost 边界；当前停止状态不能只靠 `--ack-live-cost` 绕过，未来必须由新 proof plan、protocol/candidate 和 Gate 0 显式替换 | 不能证明 loopback 服务没有代理远程、操作系统无外连、provider 实际计费身份真实，或 Live E1 已通过 |
| E1 local model probes | exact DSH rc.2 + isolated `DSH_HOME` + local `qwen3:14b`：修复非标准 Governor schema 后，三条对照为可评分 FAIL、一条对抗轨 INVALID；另修复 resume stage-one 混合 replay domain，replacement observe 的 live/durable checkpoint 与增强事件哈希一致，失败归档不生成 token/seal | local resolver、冻结 settings、provider-visible schema、host verifier、usage、raw log、ledger、live/flush replay 与 scorer 可共同运行；旧参数畸形结果受 adapter 缺陷混杂，不能全归因模型；正确 schema 下宿主仍能拒绝绕过 baseline/decision 的错误完成 | 完整 E1、remote Flash、真实人工 gate、成功 resume、结果价值或 portability 已证明 |
| E1 v1.5 official Flash | alpha.9 tarball + DSH rc.2 + official Flash；r3 因错误终端交接导致 gate 超时而 INVALID；r4 为 `1 PASS / 4 FAIL / 1 INVALID`，直接 TTY gate 成功且 forged-evidence PASS | 伪证据拒绝和真人 gate 链路可在真实官方 Flash 中工作；完整尝试能诚实暴露 scorer path binding、模型调用序列和 resume finalizer 缺陷 | E1 已通过、失败轨可挑选重跑、结果价值或 portability 已证明 |
| E1 v1.6 official Flash early stop | alpha.10-dev candidate + DSH rc.2 + official Flash；`already-satisfied` 得到预期 `ALREADY_SATISFIED`；`simple-done` 因 mutation tool 返回旧 prefix 导致模型重复开始 attempt，durable replay 记录边界违规并裁决 `NEEDS_HUMAN`；其余轨迹主动停止 | 真实 verifier、工作树修改和 host terminal 链路可运行；宿主没有被后续 passing evidence 诱导覆盖 durable invariant violation；read-your-write 是 runtime conformance 的必要条件 | 该轨可计作 PASS、完整 E1 已完成、可以复用旧轨拼接新结果，或产品净收益已证明 |
| Researcher 启动方式 | one-shot、guarded mode、certified preset 的权限/状态机测试 | 研究与执行权限面可分离；certified preset 提供更强环境边界 | 所有客户端都有相同的 OS/host enforcement |
| DSH Web Researcher smoke | alpha.5 candidate 在 DSH `0.1.0-rc.7` Web + 本地 Ollama 中真实运行；SAFE 证书逐项 PASS，workspace-write 漂移在下一模型响应前拒绝 | 当前 Researcher preset 的 recompose、只读收紧、doctor、replay 与漂移拒绝路径在该环境可运行 | Goal Governor E1 已运行；研究输出有价值；所有 DSH 路径或客户端都等价 |
| Researcher local-model outcome | alpha.5 与 alpha.7 candidate 的本地 14B probes 均未得到合格项目报告；alpha.7 Qwen 可达 SAFE 但丢失任务/误用工具，R1 的无证据报告被 terminal gate 拒绝 | 模型与客户端生命周期/上下文都能实质影响结果；host gate 能拒绝部分失败；SAFE 不等于有价值输出 | 已量化 model/client 效应；Researcher outcome value 已证明 |
| DSH packaging | alpha.5 与 alpha.7 pre-release candidate 均成功安装 `researcher`/`governed`；最终 alpha.7 tarball 的隔离 dry-run/install/force/backup/uninstall/rollback 与 Quickstart 入口通过，随后 Windows CI 发现并隔离为测试路径规范化缺陷 | 发布布局可被目标 DSH 版本加载，安装生命周期可逆；CI 能捕获 Windows 8.3 路径差异 | Governed Coding 的协议定义 live E1 已通过，或安装器具备 OS 级事务保证 |
| Safe installer lifecycle | alpha.7 对 dry-run、精确 DSH 元数据 fallback、content-hashed backup、force upgrade、uninstall、rollback 与损坏快照拒绝提供跨平台测试 | 两个受管 preset 的本地安装操作可预览并恢复；release tarball 可绑定 SHA-256 后执行 | 操作系统级事务、恶意本机管理员下的备份真实性，或未知 DSH 版本兼容性 |
| Guided Quickstart | alpha.7 生成仓库外 Cognition/Verifier/Goal review workspace；未审核 marker、零 hash、陈旧 binding 和路径逃逸均被测试拒绝 | 可避免手抄 hash，同时保持 verifier install、Goal approval 与 Cognition promotion 为显式 owner action | 引导器理解用户意图、自动批准合同、或证明治理带来净生产力增益 |
| Deterministic public demo | `npm run demo` 在隔离 fixture 中真实启动两个 verifier 子进程，并将捕获的退出码经模拟 DSH event envelope 交给发布 adapter/reducer，得到 `CONTINUE → CONTINUE → DONE` | Agent 文字和真实失败 verifier 不能满足 MUST；匹配的真实进程结果可以形成 DONE | 完整 Live E1 或产品净收益；v1.4 official Flash 仅形成 `2 PASS / 1 FAIL / 3 NOT RUN` 部分结果 |
| Portable Core | DSH 无关的 cognition/goal/verifier core、schemas、CLI、adapter contract | 核心抽象具备适配缝 | Codex、Claude Code、Zed/Zcode、OpenClaw 已兼容 |
| Adapter discovery | Claude Agent SDK `0.3.251` package/type lock；Codex App Server stdio `0.150.0-alpha.12.2` schema + 零模型 initialize/list trace；artifact hash 与 claim boundary 离线校验 | 两个原生表面可映射到候选 HostEvent，但当前均为 `HOLD` | 已交付第二 adapter、durable replay、human principal、usage completeness、write enforcement 或跨客户端价值 |

当前 `npm test` 覆盖 unit、replay、integration 与 isolated package smoke；具体数量以当次测试输出为准，避免文档复制数字后漂移。

## `doctor` 与 freshness 的边界

`project-cognition doctor .` 验证：

- canonical state schema 与 `state_hash`；
- `PROJECT_COGNITION.md` 是否与 state 的确定性 projection 完全相同；
- Goal Contracts 与 Verifier Registry 是否结构和 hash 有效。

它不读取代码来判断 evidence ref 是否仍成立，也不重新计算 evidence fingerprint。因此 doctor PASS 只表示**表示完整性与投影一致性**。仓库发布门另行运行：

```text
npm run cognition:freshness
```

该命令只复验 `docs/evidence/evidence-sources.json` 声明的文件证据。没有 expected/observed fingerprint 的 evidence 会得到 `unknown`；人工和外部证据不会因旧的 `checked_at` 自动变成 fresh。

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

`alpha.5` 与 `alpha.7` pre-release candidate 运行了独立的 Researcher Web 本地 smoke；随后 exact rc.2 的本地 probes 完成了 local route/capture/replay 的真实负面探测。protocol v1.5 使用 alpha.9 发布包、remote official Flash 和真实 TTY gate 运行完整尝试但统一 bundle 为 `1 PASS / 4 FAIL / 1 INVALID`。v1.6-v1.8 连续暴露 mutation feedback 缺陷。v1.9 的 `3 PASS / 1 FAIL / 2 INVALID` 暴露 block-code 与 stage-one seal 漂移；v1.10 的 `4 PASS / 0 FAIL / 2 INVALID` 暴露 transport usage 与 replacement 规则；v1.11 唯一 replacement 的 resume 两进程到达 `DONE`，但 candidate scorer stage-one scope 漂移使原结果 INVALID，详见 [v1.11 record](./evidence/e1-v1.11-live-results.md)。v1.12 的 diagnostic rescore 只能证明 narrow scorer correction，不能改判或建立六轨 conformance。E1 live 已停止；Pilot、E2 和正式第二 adapter 仍被阶段门阻挡。

Claude/Codex discovery 可在该阶段并行记录接口事实，但不越过阶段门：当前两个记录均为 `HOLD`，未修改 adapter manifest，也未建立安装或兼容入口。

北京时间模型成本规则已在协议 v1.1、manifest、run lock 和 scorer 中冻结：工作日 `[09:00,12:00)`、`[14:00,18:00)` 禁止远程 DeepSeek；周末只免时段禁令，远程仍须 official Flash + 精确 `https://api.deepseek.com`，其他 gate 不免。它对官方 E1 runner 是 fail-closed 机械边界，但不是 OS 级网络隔离或计费证明；字面 loopback 也只证明 adapter 第一跳本机，不能证明本地服务不代理远程。正式 live E1 还应使用服务端限额、独立 key、账单告警及必要的出口控制。

## 判定纪律

1. 不得宣称 Researcher superiority、生产力提升、AI memory 问题已解决、真实 DSH E2E 已通过或其他客户端已兼容。
2. Research Session Ledger、报告和 handoff 不得被描述为 canonical state；promotion 必须经过 owner review、seal 与新 revision。
3. QUOTA、leakage、无效果和高成本都是结果；不得删除或通过 scorer wording 改写。
4. pilot 不产生确认性效果结论；pilot 后若改变任务、指标或阈值，必须 protocol bump、重新冻结。
5. E2 未通过，不开始第二 adapter；第二 adapter conformance 未通过，不开始 E3。

治理流程见 [Project Cognition Governance](./cognition-governance.md)，未完成 gate 见 [Roadmap](./roadmap.md)。
