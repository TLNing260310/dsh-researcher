# research_handoff.json — Plan / Goal Contract 的机器可读接口（schema v2）

交接包不只是 Markdown：它是 Researcher 与 Plan Mode 之间未来的 agent-to-agent 接口。当前由模型在最终报告中输出，格式如下：

```json
{
  "schema": "dsh-researcher/handoff/v2",
  "run": "#N",
  "certificate": "SAFE",
  "cognition_ref": {
    "state_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "revision": 4
  },
  "project": {
    "purpose": "keep an AI coding loop aligned with evidence-backed project intent",
    "value_proven": ["deterministic state replay is covered by tests"],
    "value_unproven": ["maintenance outcomes improve across models and clients"],
    "invariants": ["Researcher remains read-only"],
    "constraints": ["DSH is the first supported adapter"],
    "unknowns": ["effect size attributable to model versus client"]
  },
  "build_items": [
    {
      "id": "B1",
      "problem": "the execution loop has no frozen completion authority",
      "desired_outcome": "only trusted evidence can end the loop",
      "evidence": ["src/controller.ts imports db.ts directly (file:line)"],
      "confidence": 0.91,
      "scope": ["goal governor core"],
      "non_goals": ["choosing an implementation design"],
      "do_not_touch": ["Researcher read-only boundary"],
      "acceptance_hints": ["a forged verifier call cannot produce DONE"],
      "cognition_refs": ["C12", "I1"]
    }
  ]
}
```

字段契约：

- `schema` — v2 固定为 `dsh-researcher/handoff/v2`；v1 读取兼容保留，但新报告只写 v2。
- `run` / `certificate` — 本次研究的运行证明（Runtime Certificate 的 Run # 与 Overall）。
- `cognition_ref` — 锁定产生此交接的规范状态版本；消费者不得把不同哈希的状态当成同一个架构事实。
- `project` — 交接项目目的、已证明/未证明的价值、不变量、约束和未知项，防止只交“功能清单”导致架构偏移。
- `build_items` — **仅包含 BUILD 项**；INVESTIGATE 与 DON'T BUILD 不进入交接（它们各自附带"什么证据能改变判定"，留在报告 §13，不进入 Plan）。
- 每个 build item 描述 `problem`、`desired_outcome`、证据、范围、非目标、禁区、验收提示和认知引用。它定义 WHAT/WHY/DONE 的输入，不替 Plan 决定 HOW。

为什么是 JSON 而不是纯 Markdown：JSON 是规范接口，Markdown 是人类投影。Goal Contract 可从 v2 handoff 派生，但仍必须经过人类审批与验证器冻结，不能自动把 BUILD 建议变成执行授权。
