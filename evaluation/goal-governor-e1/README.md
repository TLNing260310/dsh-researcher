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

First run the dedicated capture-only entry against pinned rc.7:

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
--candidate-revision <exact-git-head> --provider <provider> --model <model>
--reasoning-effort <level> --dsh-module-root <node-modules-root>
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
`@deepseek-ai/dsh@0.1.0-rc.7` package and uses the same module root for the
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

The frozen registry binds only `e1_verify {}`. That host tool executes the
run-lock-bound template verifier outside the model-writable workspace, while
the E1 tool guard permits filesystem mutation only at the case-declared
`src/task.js` path (or nowhere for zero-change cases). Shell, workflow, job,
skill, and delegation execution are refused. The outer runner independently
executes the same verifier after DSH exits and saves `post/verifier.json`.
The agent-scoped setup restricts inherited global tools, then requires the
actual post-mount `tools.schemas(agent)` names, schemas, and canonical hash to
equal the capture-bound run-lock before the first prompt. Scope-local governor,
status, and `e1_verify` tools are therefore checked from actual rc.7
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
worktree violations, and incomplete host receipts. It does not provide an
external signature or attestation capable of distinguishing a real run from an
entirely fabricated but self-consistent bundle produced by a malicious host.
Accordingly, a valid non-synthetic package is `PASS_UNDER_TRUSTED_HOST`, not an
unconditional causal claim. Formal E1 evidence must also be retained by
independent CI or immutable storage.

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
