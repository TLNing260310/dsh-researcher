# evaluation-protocol-v1（预注册协议，先冻结后运行）

本文件在**任何真实仓库评测运行之前**冻结。原则：**先冻结评分规则 → 锁定 ground truth → 运行模型 → 最后揭晓**。禁止反向调整。

## 1. Case Selection（仓库入选标准）

必须全部满足：
- public 仓库；
- 至少 12 个月 Git 历史；
- T0 之后至少 3 个月活跃开发（保证有可裁决的未来事实）；
- T0 之后存在 issue / PR / refactor 可用于 adjudication；
- 中等规模（约 200–5000 文件）；
- Researcher 作者未深度参与该项目；
- 排除纯 dependency-bump 仓库（未来事实无法区分"漂移"与"升级"）。

## 2. T0 选择（机械，禁止 cherry-pick）

不允许"看到后面有个漂亮的重构，往前三个月切一刀"。二选一（按案例声明用哪种）：
- **规则 A**：在 cutoff window（发布 N 前 60–120 天）中随机选一个 main 提交；
- **规则 B**：release N-1 的 tag 提交（取 N-1 与 N 之间的中点）。

T0 选定后记录 commit hash 与日期，写入 snapshot.json。

## 3. Blindness Integrity（物理隔离）

- 快照 = `workspace/`（T0 截断仓库：**删除全部其他 ref、expire reflog、gc --prune=now、验证无晚于 T0 的可达提交**）+ `ground-truth/`（未来事实与金丝雀，运行环境外）。
- 每次运行前/后跑 `node fixtures/blind/blind-doctor.js <snapshot-dir>`：任何 FAIL → 该次运行 **INVALID**，结果丢弃。
- 金丝雀：`ground-truth/SECRET_FUTURE_CANARY_*.txt` 的 token 出现在任何 agent 输出中 → 运行 INVALID。
- 每次运行：全新 session id、干净 DSH profile（无历史会话）、cwd 严格为 workspace/。

## 4. Ground Truth（冻结 + 锁）

- 在**任何运行之前**人工整理：从 T0 之后的 issue / PR / refactor / doc 修复中提取"在 T0 已潜伏、后来才暴露"的问题。
- **计入主评分 ✅**：T0 已存在的 architecture debt；T0 已存在的 documentation drift；T0 已存在的 hidden complexity；后来暴露出的已有 bug 的 root cause。
- **不计入 ❌**：外部需求导致的新 feature；新平台/新 API 引起的变化；maintainer 单纯换偏好（否则测的是"预测未来"，不是"恢复 T0 认知"）。
- 格式（ground-truth/future.json）：

```json
{
  "ground_truth": [
    {
      "id": "GT-01",
      "problem": "authentication state duplicated across X and Y",
      "evidence_after_t0": ["issue #812", "PR #827"],
      "severity": "high"
    }
  ]
}
```

- 整理完成后计算 `sha256(future.json)` 写入 `snapshot.json.ground_truth_sha256`，运行期间文件不可改动；发布结果时公开该 hash。

## 5. Run Matrix（第一批 Phase A）

- 3 repos × 4 systems × 3 runs = **36 次运行**：Standard / Plan / Researcher Quick / Researcher Deep。
- 每次运行统一：同模型、同 reasoning 配置、同 T0、同初始 prompt、同可读 workspace、记录 token budget（或固定预算）、全新 session。
- 随机化运行顺序，避免时间趋势污染。

## 6. Scoring（四个核心指标，不压成单数）

- **Recall** = 命中的 ground truth 数 / ground truth 总数；
- **Precision** = 有证据支持的重要发现数 / 被计分的发现总数（100 个说法命中 40 个 ≠ 好）；
- **Researcher Lift**（最重要的产品指标）= 基线（Standard/Plan）没发现、Researcher 发现、且后来被证明重要的发现数——报告绝对差（+pp）与相对差（+%）；
- **Cost-adjusted value** = Critical findings / 1M tokens；Useful findings / minute；Unsupported claims / 10 findings（若 Plan 用 30k token 得 55 分、Researcher 用 700k 得 59 分，产品价值存疑）。

报告 **mean + range/variance**（stochastic system 单次数字无意义）。所有正负结果、traces、成本全部公开。

## 7. v0.6.0 Release Gate

- 30+ tests 全绿；
- recompose / effective-runtime 证书与 env-drift fail-closed 修复并回归测试；
- blind isolation doctor 通过；
- 本协议冻结；
- 至少 3 个真实 repo，Standard / Plan / Quick / Deep 全部跑过，每格 ≥2–3 次重复；
- 失败结果全部公开；
- README 不预填任何期望成绩，结论标注 **Preliminary, not statistically conclusive**。
