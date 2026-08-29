# Claude Code Agent SDK discovery — 0.3.251

Result: **HOLD**. The npm package and public type surface are locked, but the
Claude runtime is not installed on this host, so there is no native session
trace and no compatibility claim.

The type contract is promising: tool hooks carry `session_id` and
`tool_use_id`; permission callbacks occur before execution; result hooks,
resume, SessionStart source, and interrupt controls exist. Official Anthropic
documentation also describes CLI resume and permission-prompt surfaces.

The governed gaps remain unresolved. Types alone do not prove raw event
durability, identity assurance for a human approval, complete usage across
helper calls, post-terminal hard stop, or path/write enforcement. The next
discovery step requires an exact runtime installation and a no-secret trace
covering denied approval, allowed tool execution, process exit, resume and
replay. It must not publish an adapter or alter the DSH manifest.

Stable user semantics would remain `researcher.ask()` and
`researcher.mode.set/get()`; native commands would only be aliases.

