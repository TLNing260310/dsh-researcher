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

On 2026-08-29, three authorized turn-capture attempts tested the locked runtime.
One persisted and one ephemeral turn reached a post-completion capture path,
while a parameter-mismatch attempt stopped before model invocation. Both
completed attempts lost their redacted event artifact to a Windows cleanup
race. They are therefore recorded as **INVALID**, not treated as native trace
evidence, and promote no capability from DOCUMENTED to OBSERVED. At most two
Codex model turns may have been billed; exact usage is unknown because the
trace was not retained.

The remaining governed gaps are material. A valid redacted native turn trace
still does not exist. Persisted `thread/read`/`resume`
items are documented as lossy for some command executions; approval responses
do not by themselves prove a stable human principal; and no adapter-owned
write-policy or post-terminal enforcement receipt exists yet. A future spike
must capture one authorized tool turn, persist raw notifications before
projection, and prove that the same prefix replays after process restart.

Stable user semantics would be exposed through `researcher.ask()` and
`researcher.mode.set/get()`. Native slash/UI affordances may be additive but
cannot be the only control plane.
