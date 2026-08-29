# Adapter discovery

This directory contains non-product discovery records only. A record locks one
native client surface, records official sources and local contract evidence,
maps expected HostEvent v1 projections, and names gaps before implementation.

Allowed results are `DISCOVERY_QUALIFIED`, `HOLD`, and `NO_GO`. None of them is
an adapter manifest, installation entry point, compatibility claim, or governed
conformance result. Formal implementation remains gated on E2 PASS.

`host-event-convergence-v1.json` is a derived discovery-only comparison. The
offline checker reloads and hashes both version-locked `expected-host-events`
documents, then requires their exact common candidate event-kind set. It also
requires the same 28 normalized target binding fields across those event kinds
and requires every `DOCUMENTED` field to reference a proof in the adjacent
`binding-provenance.json`. Each proof is tied to the exact Claude declaration
hash or Codex generated-schema tree and bounded source-file hashes; every `GAP`
must have no native value and no proof. These are reproducible contract proofs,
not live observations or governed conformance evidence. The checker reports
each client's `DOCUMENTED` versus `GAP` coverage without upgrading
either to `OBSERVED`. A common projection target is not native semantic
equivalence, compatibility, portability, or conformance evidence.

The adjacent `event-cohesion.json` adds a separate assembly audit. A field can
be documented yet unusable in one trustworthy HostEvent when its source frames
have no shared native key. Under the locked contracts, Claude has five
single-event mappings, one host-context-only mapping, and one unjoined mapping:
`PermissionRequestHookInput` cannot be natively joined to `canUseTool` because
the former lacks `toolUseID`/`requestId` while the latter lacks
`session_id`/`prompt_id`. Codex has five single-event mappings and two
native-key joins. The checker freezes this result and rejects promotion of the
Claude approval path into a cohesive native join.

Each locked client also has a `semantic-fixture.json`. These are explicitly
host-authored, synthetic native-shape events; neither client nor a model emitted
them. The shared offline projector exercises deterministic candidate assembly,
hashing, join rejection, and unresolved-event behavior. Its result is locked by
SHA-256. Claude deliberately leaves the approval path unresolved and marks the
interrupt-to-Stop path conditional; Codex resolves the two candidate joins only
through matching JSON-RPC and thread/turn identities. Adversarial tests reject
duplicate request IDs, missing fields, and mismatched terminal turns. This is
executable discovery evidence only: it does not prove native emission,
authenticity, durability, enforcement, compatibility, portability, conformance,
or outcome value.

Run `npm run adapter:discovery:check` to verify artifact hashes, source domains,
invocation semantics, redaction boundaries, and claim boundaries. The checker
itself makes zero model and network calls; this does not erase separately
recorded live discovery attempts.
Every Claude capture command first verifies the exact package name, version,
Claude Code version, and SHA-256 of `package.json`, `sdk.mjs`, and `sdk.d.ts`
against one shared lock. Same-version content drift is rejected before module
import or child-process execution.
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
`npm run adapter:discovery:capture:codex-contract -- --codex-bin <absolute-path>`;
the no-model native handshake uses the same argument with
`adapter:discovery:capture:codex-native`. Both require an exact version and
executable-byte SHA-256 lock before process start, use a fresh temporary
`CODEX_HOME` and invokes only CLI version and local schema generation paths.
The current content lock covers only `win32-x64`; other hosts fail closed until
their exact executable is independently captured and reviewed. This is a
capture-host boundary, not evidence that App Server is incompatible elsewhere.
The opt-in Codex turn capture requires `--ack-codex-usage`, uses an ephemeral
thread and read-only/network-disabled workspace, and is never part of
`npm run check`. The 2026-08-29 attempts retained no valid trace and therefore
remain an incident record rather than runtime evidence. A zero-model in-memory
protocol fixture verifies the repaired capture lifecycle, but cannot promote a
native client capability to `OBSERVED`.
