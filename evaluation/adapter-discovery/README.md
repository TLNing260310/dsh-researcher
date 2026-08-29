# Adapter discovery

This directory contains non-product discovery records only. A record locks one
native client surface, records official sources and local contract evidence,
maps expected HostEvent v1 projections, and names gaps before implementation.

Allowed results are `DISCOVERY_QUALIFIED`, `HOLD`, and `NO_GO`. None of them is
an adapter manifest, installation entry point, compatibility claim, or governed
conformance result. Formal implementation remains gated on E2 PASS.

Run `npm run adapter:discovery:check` to verify artifact hashes, source domains,
invocation semantics, redaction boundaries, and the zero-model discovery rule.
The Claude runtime-load capture is reproducible with
`npm run adapter:discovery:capture:claude -- --sdk-root <exact-package-root>`;
it imports the module and runs only the bundled CLI `--version` path.
The Codex contract capture is reproducible with
`npm run adapter:discovery:capture:codex-contract`; it uses a fresh temporary
`CODEX_HOME` and invokes only CLI version and local schema generation paths.
