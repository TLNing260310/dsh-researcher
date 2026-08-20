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
