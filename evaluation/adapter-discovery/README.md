# Adapter discovery

This directory contains non-product discovery records only. A record locks one
native client surface, records official sources and local contract evidence,
maps expected HostEvent v1 projections, and names gaps before implementation.

Allowed results are `DISCOVERY_QUALIFIED`, `HOLD`, and `NO_GO`. None of them is
an adapter manifest, installation entry point, compatibility claim, or governed
conformance result. Formal implementation remains gated on E2 PASS.

Run `npm run adapter:discovery:check` to verify artifact hashes, source domains,
invocation semantics, redaction boundaries, and claim boundaries. The checker
itself makes zero model and network calls; this does not erase separately
recorded live discovery attempts.
The Claude runtime-load capture is reproducible with
`npm run adapter:discovery:capture:claude -- --sdk-root <exact-package-root>`;
it imports the module and runs only the bundled CLI `--version` path.
The separate `adapter:discovery:capture:claude-session` command invokes only
`listSessions`, `getSessionInfo`, and `getSessionMessages` in a child process
with a fresh config and empty project. Its empty results prove callability, not
a native session, resume, replay, or compatibility.
`adapter:discovery:capture:claude-fixture` writes one deterministic,
host-authored JSONL transcript into another fresh config and asks the same real
SDK functions to parse it. This checks non-empty local parser behavior without
calling a model. Because Claude Code did not emit the fixture, it is not native
session, event-ordering, resume, replay, or compatibility evidence.
The Codex contract capture is reproducible with
`npm run adapter:discovery:capture:codex-contract`; it uses a fresh temporary
`CODEX_HOME` and invokes only CLI version and local schema generation paths.
The opt-in Codex turn capture requires `--ack-codex-usage`, uses an ephemeral
thread and read-only/network-disabled workspace, and is never part of
`npm run check`. The 2026-08-29 attempts retained no valid trace and therefore
remain an incident record rather than runtime evidence. A zero-model in-memory
protocol fixture verifies the repaired capture lifecycle, but cannot promote a
native client capability to `OBSERVED`.
