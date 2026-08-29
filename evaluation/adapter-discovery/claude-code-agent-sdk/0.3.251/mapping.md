# Claude Code Agent SDK discovery — 0.3.251

Result: **HOLD**. The exact npm package was installed outside the repository;
its SDK module loaded, the expected session/query exports were observed, and
the bundled native CLI reported Claude Code `2.1.251`. The capture created no
session and submitted no prompt, so there is still no native session trace or
compatibility claim.

The type contract is promising: tool hooks carry `session_id` and
`tool_use_id`; permission callbacks occur before execution; result hooks,
resume, SessionStart source, and interrupt controls exist. Official Anthropic
documentation also describes CLI resume and permission-prompt surfaces.

The exact SDK also executed `listSessions`, `getSessionInfo`, and
`getSessionMessages` in a credential-stripped child process using a fresh
`CLAUDE_CONFIG_DIR` and empty project directory. All returned their expected
empty/absent results. This proves the locked local session-read API is callable
without query or model use; it does not expose a non-empty native session,
resume prefix, event ordering, tool correlation, or replay behavior.

The governed gaps remain unresolved. Runtime loading, empty local session reads, and types do not prove raw event
durability, identity assurance for a human approval, complete usage across
helper calls, post-terminal hard stop, or path/write enforcement. The next
discovery step requires an explicitly authorized no-secret native session trace
covering denied approval, allowed tool execution, process exit, resume and replay.
It must not publish an adapter or alter the DSH manifest.

Stable user semantics would remain `researcher.ask()` and
`researcher.mode.set/get()`; native commands would only be aliases.
