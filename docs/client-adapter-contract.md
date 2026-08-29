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
candidate HostEvent kinds and target the same 28 normalized binding fields. The
current locked documents mark 25 fields for each client as `DOCUMENTED` and
three for each as explicit `GAP`; none is `OBSERVED`. Every documented field
must reference a reproducible proof locator bound to the exact Claude type hash
or Codex generated-schema tree and bounded source-file hashes. These counts
describe the reviewed interface documents, not runtime reliability or a client
ranking. The checker binds the source mapping bytes and keeps
`guard_violation`, authenticated human receipts, usage completeness, raw-first
durability, restart checkpoints and terminal write enforcement as unresolved
boundaries. This comparison cannot promote either client or substitute for E2.

Field presence is not event integrity. The locked event-cohesion audit finds
that Claude can assemble five mappings from one native frame, but its approval
path is unjoined: `PermissionRequestHookInput` has session/prompt context and no
`toolUseID` or `requestId`, while `canUseTool` has the call/request IDs and
decision without `session_id` or `prompt_id`. Its interrupt-return-to-Stop join
also depends on host context rather than a shared native receipt ID. Codex has
five single-frame mappings plus two native-key joins through JSON-RPC and
thread/turn identity. This makes Codex's discovery surface structurally more
cohesive for a future adapter, but still does not establish principal identity,
usage completeness, durable replay, hard-stop enforcement, conformance, or
outcome value.

The discovery checker now executes one locked synthetic semantic fixture per
client. The fixtures are host-authored native-shape data with zero model and
network calls, not captured client output. They verify deterministic projection
and fail-closed behavior for duplicate IDs, missing bindings, and incorrect
terminal joins. Claude produces six candidate projections plus one unresolved
approval path; Codex produces eight candidate projections with no unresolved
fixture event. Those counts describe only the chosen synthetic examples and do
not upgrade either discovery from `HOLD` or create a product adapter.

Each fixture also has one hash-locked synthetic restart boundary. Full replay
must preserve every completed prefix projection and distinguish a genuinely
resolved pending join from a retained or merely changed unresolved condition.
This catches checkpoint drift, event reordering and missing terminal suffixes,
but it is not raw-first persistence or a native process-exit/resume trace.
Accordingly `resume_prefix_checkpoint` remains a convergence `GAP`.
