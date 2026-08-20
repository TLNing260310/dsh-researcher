# Researcher Case Library

案例库是 dsh-researcher 最有力的证明：**不是"它能输出报告"，而是"它在真实项目上发现了什么"**。

## 收录标准

1. 真实项目（不收录合成样例；合成样例属于 tests/fixtures）。
2. 记录三类核心产出：
   - **发现**：证据分级的关键结论（尤其 Contradicted / 腐蚀 vs 演化判定）。
   - **影响**：该发现是否改变了开发决策（BUILD / DON'T BUILD / INVESTIGATE 的取舍）。
   - **可复核性**：每条结论的 file:line / URL 引用是否仍然有效。
3. 案例必须**脱敏**（项目名、作者、仓库路径、专有名词按项目所有者意愿处理）。

## 案例模板

```
## 案例 NNN：<匿名项目代号>

- 日期 / DSH 版本 / 预设版本
- 项目形态：语言、规模、阶段（如"700 文件研究原型、投稿冲刺末期"）
- Runtime Certificate：SAFE / DEGRADED / UNSAFE（附证书原文）
- 关键发现（每条带证据引用）：
  1. ...
- 分类结果：N BUILD / M DON'T BUILD / K INVESTIGATE
- 结论对开发决策的影响：
- 匿名化说明：
```

## 已收录案例

（待首次脱敏授权后添加。首个候选：一个"README 声称测试通过但未执行的冲刺项目"——运行时的 Runtime Certificate 与证据台账已留档。）
