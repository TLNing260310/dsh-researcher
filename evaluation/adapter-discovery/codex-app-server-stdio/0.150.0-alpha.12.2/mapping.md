# Codex App Server stdio discovery — 0.150.0-alpha.12.2

Result: **HOLD**. This is not Codex Desktop compatibility and does not install an
adapter. It scopes only the `codex app-server --stdio` JSON-RPC surface.

The installed runtime generated a version-bound experimental JSON Schema. A
live, redacted `initialize → initialized → thread/list` exchange succeeded with
zero model calls. The contract exposes strong candidate boundaries: explicit
thread/turn/item identities, request/response approvals, item lifecycle,
interrupt, resume/read, and turn-bound usage.

The locked CLI also regenerates the complete experimental schema bundle under
a credential-stripped temporary `CODEX_HOME`. The capture binds the v2 schema,
bundle tree, method-inventory hashes and exact governance subset without
creating a thread, turn, item, prompt or session.

The remaining governed gaps are material. Persisted `thread/read`/`resume`
items are documented as lossy for some command executions; approval responses
do not by themselves prove a stable human principal; and no adapter-owned
write-policy or post-terminal enforcement receipt exists yet. A future spike
must capture one authorized tool turn, persist raw notifications before
projection, and prove that the same prefix replays after process restart.

Stable user semantics would be exposed through `researcher.ask()` and
`researcher.mode.set/get()`. Native slash/UI affordances may be additive but
cannot be the only control plane.
