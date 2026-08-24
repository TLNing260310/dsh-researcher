# Goal Governor Value Evaluation Protocol v1 — immutable archive record

This file is a provenance record, not the active experiment definition. The exact v1 bytes remain in Git and are intentionally not copied into a second editable source of truth.

| Field | Frozen value |
|---|---|
| Status | superseded by v1.1 before any live run |
| Live runs under v1 | `0` |
| Release tag | [`v0.8.0-alpha.3`](https://github.com/TLNing260310/dsh-researcher/tree/v0.8.0-alpha.3) |
| Commit | [`86691ec89951b1d5319760856d21e58ef7d98a04`](https://github.com/TLNing260310/dsh-researcher/commit/86691ec89951b1d5319760856d21e58ef7d98a04) |
| Blob path | [`docs/goal-governor-evaluation-protocol.md`](https://github.com/TLNing260310/dsh-researcher/blob/86691ec89951b1d5319760856d21e58ef7d98a04/docs/goal-governor-evaluation-protocol.md) |
| Byte length | `7749` |
| SHA-256 of exact Git blob bytes | `ce8047a4c569ebeda07be5d1882a820da7efbfac392dabb24123503bf01ea856` |

Reproduce the digest without checking out or rewriting line endings:

```text
node -e "const {execFileSync}=require('node:child_process');const {createHash}=require('node:crypto');const b=execFileSync('git',['show','86691ec89951b1d5319760856d21e58ef7d98a04:docs/goal-governor-evaluation-protocol.md']);console.log(createHash('sha256').update(b).digest('hex'))"
```

v1.1 adds model-route and Beijing-time cost admission before live execution. Because v1 had no live runs, there is no v1 result to migrate, discard, reinterpret or compare. New experiments must use the active [v1.1 protocol](./goal-governor-evaluation-protocol.md) and a newly generated compatible run lock.
