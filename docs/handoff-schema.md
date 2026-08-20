# research_handoff.json — Plan Mode 的机器可读接口（schema v1）

交接包不只是 Markdown：它是 Researcher 与 Plan Mode 之间未来的 agent-to-agent 接口。当前由模型在最终报告中输出，格式如下：

```json
{
  "schema": "dsh-researcher/handoff/v1",
  "run": "#N",
  "certificate": "SAFE",
  "build_items": [
    {
      "id": "B1",
      "problem": "restore the architecture boundary",
      "evidence": ["src/controller.ts imports db.ts directly (file:line)"],
      "confidence": 0.91,
      "scope": "what the change covers",
      "do_not_touch": ["paper/ frozen artifacts"]
    }
  ]
}
```

字段契约：

- `schema` — 固定为 `dsh-researcher/handoff/v1`；解析方以此判断兼容性。
- `run` / `certificate` — 本次研究的运行证明（Runtime Certificate 的 Run # 与 Overall）。
- `build_items` — **仅包含 BUILD 项**；INVESTIGATE 与 DON'T BUILD 不进入交接（它们各自附带"什么证据能改变判定"，留在报告 §13，不进入 Plan）。
- 每个 build item：`problem`（改什么）、`evidence[]`（依据，可复核引用）、`confidence`（0–1，来自证据层级）、`scope`（边界）、`do_not_touch[]`（禁区，如冻结工件）。

为什么是 JSON 而不是纯 Markdown：人读报告，Agent 读结构。未来 Plan Mode 或 Memory Bridge 直接消费这个文件时，无需再解析散文。
