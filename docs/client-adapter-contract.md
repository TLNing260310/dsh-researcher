# Client adapter contract

Project Cognition and Goal Governor are portable cores. A client adapter is the authority boundary that turns native client events into `project-cognition/host-event/v1` and enforces the resulting decision. Sharing prompts alone is not conformance.

## Stable invocation surface

Host integrations preserve two equivalent user entry styles:

```js
await researcher.ask({ question: 'What is this project trying to prove?' })
await researcher.mode.set({ state: 'on', question: 'Watch for architecture drift' })
researcher.mode.get()
await researcher.mode.set({ state: 'off' })
```

- `ask` is one-shot and ends at the next host-observed `turn_end`.
- mode `on` persists across turns and resume until a host-authenticated user switches it off.
- model-authored or model-asserted control events cannot switch the mode.
- adapters may expose native command syntax in addition to this control API. DSH maps `/researcher <question>` and `/researcher on|off` to the same reducer.

## HostEvent v1

Every normalized event carries `seq`, `session_id`, optional `runtime_goal_id`, a native evidence reference, actor, source, identity assurance, kind, and data. Frozen kinds are:

`user_action`, `tool_call`, `tool_result`, `goal_transition`, `usage`, `turn_end`, `session_resume`, `guard_violation`.

The host must retain the native event stream. HostEvent is a deterministic projection used by portable reducers; it is not permission to discard native evidence or trust assistant prose.

## Conformance boundary

An adapter manifest v2 reports two different facts:

- capability declaration: the adapter claims to provide human approval, hard stop, event storage, trusted verification, and project-root confinement;
- conformance status: `PENDING`, `PASS`, or `FAIL`, backed by independently scoreable evidence.

Only `conformance=PASS` plus all five capabilities produces `governed=true`. The DSH adapter is currently `PENDING` until Gate 0 and Live E1 complete. Claude Code is the frozen second-adapter target, but implementation is gated on E2 PASS; Codex, Zcode, and OpenClaw remain design candidates rather than compatibility claims.
