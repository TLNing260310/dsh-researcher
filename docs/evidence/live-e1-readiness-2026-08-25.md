# Live E1 publication readiness — 2026-08-25

Status: **SUPERSEDED SNAPSHOT — full E1 still NOT RUN**

This record explains the prerequisites observed before the later exact-rc.2
local smoke. The local route/capture prerequisites in items 1–3 and 5 were
subsequently closed for one non-confirmatory Qwen track; see
[E1 local Qwen smoke](./e1-local-qwen-smoke-2026-08-25.md). The real-TTY gate,
remote Flash controls and complete all-track bundle remain open. Neither this
snapshot nor the single-track FAIL is E1 conformance evidence.

## What is ready

- Protocol v1.1, manifest, fixtures, fail-closed runner, scorer and optional
  Ed25519 bundle attestation are present.
- Repository doctor, adapter doctor and offline E1 preflight can be executed
  without network or model calls.
- The model cost policy is machine-enforced by the official runner.

## Missing prerequisites observed on 2026-08-25

1. No final-candidate `visible-tools` capture or `run-lock.json` existed.
2. No isolated, readable module root containing the complete pinned
   `@deepseek-ai/dsh@0.1.0-rc.7` dependency closure was available to the
   runner.
3. The candidate was being modified, so running against the previous release
   would not test the version intended for publication.
4. The execution channel exposed redirected stdin/stdout. The governed gate
   requires a real interactive TTY and cannot accept approval from an agent,
   pipe or command-line flag.
5. No dedicated remote E1 credential, provider-side spend limit or billing
   alert was available. A local Ollama process was present, but the DSH public
   resolver and exact loopback route had not completed Gate 0.

The Beijing-time window happened to permit a remote run, but time admission
alone is insufficient. The runner must fail closed until every prerequisite is
frozen.

## Required execution order

1. Finish, test, commit and package the final candidate.
2. Prepare an isolated rc.7 module root and retain its lockfile.
3. Record both preset scans with `broken=null`.
4. Run capture-only startup to freeze the actual post-mount visible tool names
   and schemas. This path submits no prompt and makes no model request.
5. Create one immutable run lock binding the candidate tarball, commit, DSH
   dependency closure, visible tools, model route and budget.
6. Execute every protocol-defined case in fresh workspaces and DSH homes. The
   governed gate must be performed by the owner in a real PowerShell TTY; the
   resume case must preserve and verify its stage-one seal.
7. Preserve failed and invalid attempts as well as the final attempts.
8. Score the self-contained bundle offline, optionally sign its byte
   commitment with an external key, and publish the unchanged bundle.

Exact commands and the complete file contract remain canonical in
[`evaluation/goal-governor-e1/README.md`](../../evaluation/goal-governor-e1/README.md)
and the frozen
[`Goal Governor Evaluation Protocol`](../goal-governor-evaluation-protocol.md).

## Public bundle acceptance

A publishable bundle must contain the frozen manifest and run lock, append-only
attempt ledger, every case artifact, raw durable session, machine events,
visible tool schemas, replay checkpoints, before/after worktree and DSH-home
evidence, verifier result, runtime provenance, cost receipts, budget evidence,
outer finalization and `score.json`.

Before signing, run the experiment from a clean temporary OS identity and
paths that contain no personal data. Raw evidence must not be edited for
redaction after capture because doing so invalidates its hashes, ledger, seals
and signature.

Even a signed PASS supports only conditional protocol conformance under the
declared trusted-host and external-bundle-root assumptions. It does not prove
that the operator is honest, identify the human at the TTY, or establish
productivity value.
