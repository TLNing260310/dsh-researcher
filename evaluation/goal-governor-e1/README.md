# Goal Governor E1 live-conformance harness

This directory contains experiment infrastructure, not a proof result. The
machine status is intentionally frozen as `infrastructure=READY`,
`live_e1=NOT_RUN`, and outcome/portability `NOT_PROVEN` until all protocol-defined real DSH runs
are preserved and independently scored.

## Safe default

`node evaluation/goal-governor-e1/run-e1.js` runs the offline preflight only.
It materializes each fixture twice in an OS temporary directory, validates the
sealed cognition/contract/verifier hashes, exercises the host verifier and
write guard with local deterministic helpers, and makes zero network, DSH, or
model calls.

First run the dedicated capture-only entry against pinned DSH `0.1.1-rc.2`:

```text
node evaluation/goal-governor-e1/capture-visible-tools.js \
  --output <external-visible-tools.json> --workspace <external-empty-dir> \
  --dsh-module-root <node-modules-root> --dsh-home <fresh-empty-dsh-home> \
  --preset-root <installed-candidate-root>
```

It boots an idle scoped agent, but contains no prompt, command, tool-call, or
model-request path. It rejects corresponding native events and workspace
changes, and records zero submission counters. The repository preflight does
not execute this DSH process.

`node evaluation/goal-governor-e1/lock.js create --out
<external-run-lock.json> --candidate-package <candidate.tgz>
--candidate-revision <exact-git-head> --route <route> --provider <provider>
--model <model> --reasoning-effort <level> --base-url <locked-base-url>
--dsh-module-root <node-modules-root>
--visible-tools-snapshot <external-visible-tools.json>` creates a lock only
when all frozen inputs are committed, `HEAD` matches, and capture provenance
matches the current Node executable and complete DSH dependency inventory.

## Live interface

Live execution is intentionally verbose and fail-closed:

```text
node evaluation/goal-governor-e1/run-e1.js --mode live \
  --case <case-id> --run-lock <external-run-lock.json> --ack-live-cost \
  --workspace <external-isolated-workspace> --output <external-artifact-root> \
  --dsh-module-root <node-modules-root> \
  --dsh-home <dsh-home> --preset-root <installed-candidate-root>
```

The CLI is not accepted as an independent argument. The runner derives its
single JavaScript entry from the locked
`@deepseek-ai/dsh@0.1.1-rc.2` package and uses the same module root for the
driver imports, preventing a shim/module split. Session persistence is
explicitly JSONL with `packChunks=false` and `compression=none` under the
provided DSH home; every native event therefore remains a separate raw row.
Every new case requires a fresh empty DSH home. Only the two resume stages
reuse one, with stage-one inventory sealed for exact continuation. The lock
also freezes Node/CLI/package hashes and the DSH dependency closure. DSH and
external-verifier children receive an environment stripped of Node
preload/search variables. The E1 overlay disables the unmetered first-prompt
title LLM and model compaction while retaining deterministic result pruning.
The same E1-only environment disables preset-local shell/jobs/skill/plan/
delegation/web components; ordinary governed sessions remain unchanged.
For every child, the outer runner also materializes a run-specific frozen DSH
settings file, forces settings watching off (`watch=false`), and sets the
locked `DEEPSEEK_BASE_URL`. The child resolves the effective connection with
DSH's public `@deepseek-ai/dsh-llm-deepseek` resolver; it does not infer an
effective connection URL from model-selection metadata.

### Model cost admission

The manifest and run lock freeze protocol v1.3's `Asia/Shanghai` policy. On
Monday through Friday, DeepSeek API is denied during `[09:00,12:00)` and
`[14:00,18:00)` Beijing time. Those windows admit only `local-loopback`, with
a literal loopback `--base-url` frozen in the lock. This route still uses the
DSH `deepseek-official` DeepSeek-compatible adapter. Its URL must use a literal
`127/8` or `[::1]` address, an explicit port, no authentication/query/fragment,
and no trailing slash. A provider or model label containing “local” is not
evidence of locality.

Outside the weekday blackout and on weekends, the only remote route is
`--route deepseek-api --provider deepseek-official --model deepseek-v4-flash --base-url https://api.deepseek.com`.
Weekends remove only the time blackout; the immutable run lock, budget,
`--ack-live-cost`, official Flash, and exact remote base URL still apply. Every process, including
each resume process, re-evaluates admission before creating or mutating output
and before spawning DSH. Admission reserves `max_time_sec + 60` seconds and fails if that
interval overlaps a restricted window. The pre-spawn receipt becomes an absolute
deadline passed to the child; child timeout is capped at `max_time_sec`, shortened
for launch delay, and rechecked together with the DSH-resolved base URL before
create/resume and before and after every model followup.
The bundle binds process start, end and timeout to that deadline, and the offline
scorer recomputes them from the frozen policy and timestamps.

This enforcement covers only the official E1 runner. It cannot prove host-clock
or scheduler integrity, OS-wide network isolation, provider billing identity, the identity behind a TTY, or
the absence of calls made by bypassing the runner. A loopback base URL proves only
that the adapter's first hop is local; it does not prove that the local service
does not proxy to a remote API. Use a dedicated E1 API key,
trusted time, server-side spend limits and alerts, and host/process egress controls when those
assurances are required. Alpha.4 ran no DSH, live E1, model, or API call. In
particular, `local-loopback` remains pending the DSH-dependent Gate 0 checks;
offline tests are not evidence that this route has run successfully under the pinned DSH runtime.

The frozen registry binds only `e1_verify {}`. That host tool executes the
run-lock-bound template verifier outside the model-writable workspace, while
the E1 tool guard permits filesystem mutation only at the case-declared
`src/task.js` path (or nowhere for zero-change cases). Shell, workflow, job,
skill, and delegation execution are refused. The outer runner independently
executes the same verifier after DSH exits and saves `post/verifier.json`.
The agent-scoped setup restricts inherited global tools, then requires the
actual post-mount `tools.schemas(agent)` names, schemas, and canonical hash to
equal the capture-bound run-lock before the first prompt. Scope-local governor,
status, and `e1_verify` tools are therefore checked from the actual pinned DSH
evidence; a guard alone is never treated as invisibility.

`governed-gate` also requires `--human-gate-stdin` and external interactive TTY
input; it cannot come from a lock, flag, pipe, or model tool. This proves the
input channel and command linkage, not cryptographic human identity. `resume-replay`
is two processes: first `--stage observe`, then `--stage continue
--resume-session <id>` using the same workspace, output root, DSH home, and
run lock.

Each final case bundle is `<output>/<case-id>/`. It preserves the full lock,
fixture baseline, contract/cognition/registry, visible tools, raw durable
session, augmented machine event trace, replay checkpoints, stdout/stderr, and
pre/post worktree evidence. It also records DSH package/CLI provenance,
host-folded token usage, host-monotonic wall time, child status, the final
external verifier result, and an `outer_finalization` decision. A bundle is
scoreable as a success only when `outer_finalized=true`; failed evidence is
preserved but cannot be washed into a PASS.

The bundle root also contains `attempt-ledger.jsonl`: an append-only, fsync'd,
zero-based receipt hash chain. Each case/stage has a `STARTED` row before its
case directory and exactly one `FINALIZED` or `FAILED` row. Unresolved starts,
hash/sequence gaps, duplicate attempts, and missing failed artifacts are
invalid. This prevents silent failed-case replacement while the bundle root is
retained; deletion of the entire external bundle still needs independent
CI/storage retention and cannot be detected by a self-contained ledger.

### Trust boundary

The scorer treats the experiment operator and the model-inaccessible external
bundle root as trusted. It independently rejects assistant prose, fabricated or
ambiguous in-session call/result evidence, frozen-input drift, replay drift,
worktree violations, and incomplete host receipts. A valid failed trajectory is
`FAIL_UNDER_TRUSTED_HOST`; only a conforming package can be
`PASS_UNDER_TRUSTED_HOST`.

The harness also computes a deterministic byte-level bundle commitment. It inventories
portable relative paths, sizes, and SHA-256 digests for every regular file while
excluding only the scorer-generated top-level `score.json`; symbolic links are
refused. An optional Ed25519 signature can authenticate that commitment against a
public key supplied from outside the bundle:

```text
npm run eval:e1:attest -- create --run <external-bundle-dir> \
  --private-key <external-private.pem> --out <external-attestation.json>
npm run eval:e1:attest -- verify --run <external-bundle-dir> \
  --attestation <external-attestation.json> \
  --trusted-public-key <external-public.pem>
npm run eval:e1:score -- --run <external-bundle-dir> \
  --attestation <external-attestation.json> \
  --trusted-public-key <external-public.pem>
```

The private key, public trust root, and attestation must remain outside the bundle.
A verified signature proves only that the supplied key signed those exact bytes
and that they have not changed since. It cannot distinguish an honest run from a
self-consistent fabrication signed by a dishonest producer; it does not prove DSH
execution, human identity, or outcome causality. Therefore
`valid_for_live_conformance_claim` remains false because the report alone cannot
make an unconditional live-origin claim against a dishonest bundle producer.
For a complete, non-synthetic PASS, the separate
`valid_for_protocol_conformance_under_trusted_host` field becomes true: that is
the protocol's conditional E1 result under its declared trusted-host and external
bundle-root assumptions, not independent proof of provenance. Formal E1 evidence
must also be retained by independent CI or immutable storage.

For `resume-replay`, stage one additionally seals its token, raw and augmented
session, immutable inventory, stage artifact, and complete post snapshot
(including external verifier and DSH-home inventories) under `stage1/seal.json`. Continuation
re-hashes every sealed file and requires the workspace to equal that boundary
before any DSH process starts.
The continuation artifact and replay checkpoint both carry that exact seal hash;
the offline scorer recomputes it and rejects any missing or different binding.

Score every protocol-defined external bundle independently with:

```text
npm run eval:e1:score -- --run <external-artifact-root>
```

By default the scorer writes `<external-artifact-root>/score.json`; use
`--out <external-score.json>` only when a separate non-evidence output is
needed.
