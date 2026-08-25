# Goal Governor Evaluation Protocol v1.2 — archive record

Status: **superseded after one pre-trajectory local smoke failure**. Model calls: `0`. Confirmatory live runs: `0`.

The exact v1.2 protocol is Git blob `acfa74ab70eb5570268e9a3f176b9f6870a1b4b2` at repository revision `b9ac30483c7e0a89be58821a8451a51af6e5ff8b`. Its SHA-256 is `48c5e88603c1214e896c6ec6139ccddc91fa3d7a901029b61f9a81ca6e9c8152`.

Retrieve it with:

```sh
git show b9ac30483c7e0a89be58821a8451a51af6e5ff8b:docs/goal-governor-evaluation-protocol.md
```

The rc.2 capture-only composition completed with zero model and prompt submissions. A subsequent non-confirmatory local `already-satisfied` smoke was refused before the first model message with `WORKTREE_BASELINE_DRIFT`. Root cause: preflight hashed the generated `materialization.json`, while the live runner compared a tree that intentionally excluded that self-describing file. The external attempt ledger records `STARTED → FAILED`, `outer_finalized=false`, and error code `WORKTREE_BASELINE_DRIFT` under run-lock `bebd5c11d3480b46d037e4fd13f262d8dca12532b99799e2756501bb441f4291`.

v1.3 corrects only the fixture-hash domain to exclude `.git` and `materialization.json` consistently. It does not migrate this failed attempt, change fixture bytes, trajectories, E2/E3 estimands, or thresholds.
