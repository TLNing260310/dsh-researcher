# Evaluation Framework（评测框架）

核心问题不是"Researcher 聪不聪明"，而是：**在当时不知道未来的情况下，它能不能提前发现后来真实开发者也认为是问题的问题？** 三条证据线并行，各有边界：

## 线 A — 自己跑（开发者测试）

持续拿不同类型的公开仓库跑：小型 Web 项目、中型 TS/Python 项目、多年历史的成熟项目、文档严重落后的项目、AI/vibe coding 项目、架构规范强的项目、已知有技术债的项目。

**边界**：你知道 Researcher 想证明什么，存在确认偏误。适合发现卡死 / token 浪费 / 错误工具调用 / 流程过长 / Doctor 误判 / 状态错误 / UX 问题；**不足以**证明"Researcher 比普通 Agent 更容易看懂项目"。

## 线 B — Historical Blind Benchmark（历史盲测，最有力的方法）

1. 选成熟 GitHub 仓库，checkout 到历史 commit **T0**（`node fixtures/blind/blind-snapshot.js create <repo-url> <commit> <dir>`）。
2. 只允许被测模式看 T0 及之前的信息，让它回答：当前主要问题是什么？哪些架构在漂移？哪里值得重构？下一步该做什么？
3. 对照真实世界：T0 后 1–3 个月开发者实际提交了什么 Issue / PR / Refactor / Bugfix —— 填入 `snapshot.json` 的 future 字段。
4. 同一 T0 用 **Researcher / Plan / Standard** 各跑一次，指标：后续真实问题召回、错误判断、无意义建议、架构问题发现、文档漂移发现、Token、耗时、是否改变决策。

**目标形态**（README 级证据，结果在跑完前保持 pending）：

```
Real-world retrospective benchmark — PLANNED
Repositories: ≥20 (Phase A: 3)
Known future issues: TBD (ground truth locked per case before any run)
Plan:       pending
Researcher: pending
```

**禁止预填任何期望成绩**——预先写下数字会污染仓库选择、评分与 prompt 调整（researcher degrees of freedom）。先冻结协议 → 锁定 ground truth → 运行 → 再揭晓。

## 线 C — 真人用户测试（5 个问题）

不要解释理论。让朋友装上 → 给自己的真实项目跑 → 使用几次，然后只问：

1. 有没有告诉你一个你本来不知道的重要事实？
2. 有没有改变你原来准备做的事情？
3. 有没有明显误判？
4. 有哪些部分像废话？
5. **下一次遇到复杂问题，你会不会主动打开 Researcher？**

第 5 题是唯一真正重要的产品指标——"报告很专业"没有意义，是否主动想起并打开才有意义。渠道：本仓库 Discussion（Show us your Researcher report）、DSH Discussions（发设计理念 + benchmark，不是广告）、DSH Discord、朋友 3–5 个真实项目。口号：**Give me your messy repository.**

## 反馈通道（三级，全部本地优先）

| 级别 | 内容 | 通道 |
|---|---|---|
| **Level 0** | 关闭（默认关闭；尊重 `DO_NOT_TRACK=1`） | — |
| **Level 1** | 匿名运行指标（版本、证书结论、时长、工具调用计数、claims created/revised/invalidated、最终决策、error codes）——**无 prompt、无路径、无代码、无仓库身份** | `node bin/feedback.js export <session.jsonl.zstd>` 生成本地 bundle，用户自行决定是否附到 Issue |
| **Level 2** | 脱敏主张摘要（statement + tier + verdict + confidence；证据引用只剩 basename） | 同上加 `--claims`，**逐次显式分享** |

原则：**不搭 telemetry 服务器**。public repo ≠ 授权复制完整 Agent trace；research 对话里可能出现本机路径、未公开设计意图、API endpoint 等。先本地 bundle + 人工分享，等每周几十/几百次 session 的规模再考虑 collector。

## A/B Harness 数据格式

每个被测模式跑完后，用 `node fixtures/benchmark/benchmark-runner.js metrics <report.md> --out metrics.json` 抽取：token、duration、tool calls、claims、revisions、final recommendation、grounded/unsupported claims（claim 卡片数）。同一 case 目录下按模式存放 `researcher-metrics.json` / `plan-metrics.json` / `standard-metrics.json`，人工比对 + 记录到 `snapshot.json.scoring`。

## Researcher Benchmark Suite（v0.7 评测体系）

> 依据：Flask Phase A 盲测（Recall 0/60）证明 Future Issue Recall 测的是"附带发现未来问题的运气"，不是产品承诺。认知层承诺的是理解、风险发现、决策依据与一致性——用四个对应基准兑现并证伪。Issue Recall 降级为次级（机会性）指标，**不删除 Flask 实验**。

### B1 — Understanding Benchmark（Global Understanding Score, GUS）
回答：它是否真的理解项目？
- **构造**：evaluator 从 T0 快照**可见事实**独立编制"认知 GT"（不参照任何模式输出、不需要未来知识）：项目身份关键事实、核心模块清单、数据流、设计原因若干条。
- **打分**：运行的 PCR（用户层 §1–§4）覆盖多少认知 GT + 正确性判定（matched / partial / unmatched，沿用裁决纪律）。GUS = matched / total。
- **性质**：对"理解"的直接测量，替代把 Issue Recall 当理解代理的错位。

### B2 — Risk Benchmark（Architecture Risk Discovery, ARD）
回答：它是否发现危险区域？不是"预测 bug"，而是"风险区域 + 证据 + 影响"。
- **构造**：沿用 T0→T0+120d 观察窗与三问裁决（是否 T0 潜伏 / 维护者是否行动 / 是否可从仓库证据发现），但**对象是运行自提的 Risk Map 条目**（非预注册 GT）。
- **打分**：命中率（later-proven risks / proposed risks）+ 假警报率。比 IR 宽松（任何后来成真的风险都算），但保留假警报惩罚。
- **例**：Flask 中"未发现 teardown chain abort（bug），但发现 cleanup lifecycle risk（风险）"——这是 Risk Discovery 命中，不是 miss。

### B3 — Change Impact Benchmark（Decision Quality + Impact, DQ）
回答：它是否知道改动影响？未来 AI coding 最大问题不是写错，而是不知道改动影响。
- **场景**：给定改动意图（如"修改认证逻辑"），运行须给出影响面：middleware / session / tests / API compatibility 等（PCR §6）。
- **打分**：(a) 影响面召回与正确性（对照 evaluator 编制的 impact GT）；(b) Decision Memo 内部一致性（每条 BUILD/DON'T BUILD 是否被其引用证据支持）；(c) 事后校准（DON'T BUILD 项窗口内是否真未建设；BUILD 项是否与后来真实行动同向，方向正确但优先级不同记 partial）。

### B4 — Drift Benchmark（Cognitive Drift Detection, CDD）
回答：长期一致性。这是认知层的长期方向。
- **场景一（跨快照）**：同一仓库 T0 与 T0+n 快照分别跑 cognition，检查 delta 研究能否发现"上次的认知已过期"（例：上次模型"数据库层负责缓存"，现在代码"缓存已迁移到 service 层"）。
- **场景二（冲突注入）**：同一快照跑两次，第二次前注入一次认知冲突（如改动 README 声称），测量运行能否通过与 checkpoint ledger 重放对比发现矛盾。
- **打分**：漂移检出率 + 误报率；前提是 Phase 3（delta research）落地。

### 矩阵与纪律
- 沿用既有基建：blind-snapshot / blind-doctor / eval-lock / bootstrap / run-matrix **全部不动**，只换 GT 构造与打分器（`evaluation/scoring/`）。
- 3 repos × 4 modes × 3 runs，种子化随机顺序，同模型同配置同预算；每 run 输出 PCR + trace + metrics。
- 裁决：双人独立（Internal Phase 保留 D001 单操作者 + 过程全留痕）；认知 GT 先行锁定（sha256），运行前不可见。
- 报告：mean + range；正负结果全公开；结论标注 **Preliminary, not statistically conclusive**。
- 教训固化：认知 GT 必须覆盖"注意力表面"之外的抽样（Flask 0/60 部分源于 GT 边缘化），且由 evaluator 独立编制。
