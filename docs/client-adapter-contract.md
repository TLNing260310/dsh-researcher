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

The package-root `adapterCore` export exposes this base envelope and the Researcher control reducer as an **experimental additive API**. It freezes the `ask` and `mode.set/get` user semantics, not a governed event profile or a compatibility claim. Typed verifier receipts, usage completeness, atomic sequencing, raw-first storage, and enforcement receipts remain requirements for the later E2-gated adapter API.

## Conformance boundary

An adapter manifest v2 reports two different facts:

- capability declaration: the adapter claims to provide human approval, hard stop, event storage, trusted verification, and project-root confinement;
- conformance status: `PENDING`, `PASS`, or `FAIL`, backed by independently scoreable evidence.

Only `conformance=PASS` plus all five capabilities produces `governed=true`. The DSH adapter is currently `PENDING` until Live E1 completes. Claude Code is the frozen second-adapter target, but implementation is gated on E2 PASS; Codex, Zcode, and OpenClaw remain design candidates rather than compatibility claims.

## Discovery is not conformance

Version-locked discovery records live under `evaluation/adapter-discovery/` and
may contain official-source mappings, redacted no-model traces and replay
designs. Their only allowed results are `DISCOVERY_QUALIFIED`, `HOLD` and
`NO_GO`. They never update an adapter manifest or create an installation path.

The current Claude Code Agent SDK `0.3.251` and Codex App Server stdio
`0.150.0-alpha.12.2` records are both `HOLD`: Codex exposes a promising
thread/turn/item and approval surface, but raw durable command replay, principal
assurance and write enforcement are unproven; its complete schema bundle and
method inventory are reproducible under a credential-stripped capture. Claude's locked SDK module and
bundled CLI load under a credential-stripped no-session capture, but no authentic
query/tool/resume trace exists. Run
`npm run adapter:discovery:check` to verify these boundaries offline.

The derived `evaluation/adapter-discovery/host-event-convergence-v1.json`
currently confirms only that both locked discovery mappings name the same seven
candidate HostEvent kinds. Its checker binds the source mapping bytes and keeps
`guard_violation`, authenticated human receipts, usage completeness, raw-first
durability, restart checkpoints and terminal write enforcement as unresolved
boundaries. This comparison cannot promote either client or substitute for E2.
