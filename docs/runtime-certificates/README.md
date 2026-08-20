# Runtime Certificate 审计日志

Researcher 的每次研究都会产出 Runtime Certificate（`research_doctor` 工具调用，持久在会话日志；报告 §0 强制引用）。对**长期项目**，证书的意义在时间轴上：

```
Research Run #001    Research Run #002    Research Run #003
Environment: SAFE    Environment: SAFE    Environment: SAFE
Evidence: 85%        Evidence: 76%        Evidence: 74%
                     New uncertainty:     New uncertainty:
                     payment module       cache coherence
```

**建议用法**：

1. 每次研究的报告以证书块开头（已由报告模板强制）。
2. 长期项目把每次证书的 Run # / Overall / 关键不确定性摘录到一个 `docs/runtime-certificates/`（或项目自己的日志）——Researcher 自己就成为可审计系统。
3. 连续 DEGRADED 或 Evidence 占比持续下降 = 项目认知质量下降的信号，应当触发一次更深的 INVESTIGATE，而不是继续增量研究。

（本目录本身留作示例存放地；真实项目的证书日志属于项目仓库，不属于本仓库。）
