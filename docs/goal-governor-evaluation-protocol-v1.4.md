# Goal Governor Evaluation Protocol v1.4 — archive record

Status: **superseded after a valid partial official-Flash run exposed an under-sized total-token budget**. Live E1: `2 PASS / 1 FAIL / 3 NOT RUN`.

The exact v1.4 protocol is Git blob `816f0ad40b1f93027a1c9618fc10872440261f05` at repository revision `aa0e7fe2ebb9ff878d6a57ac73264f6a7f510ab6`. Its SHA-256 is `1b6542e3748b7bc7b90f829518c961be3f1419d366acdf823acaef2c95685d28`.

Retrieve it with:

```sh
git show aa0e7fe2ebb9ff878d6a57ac73264f6a7f510ab6:docs/goal-governor-evaluation-protocol.md
```

Under DSH `0.1.1-rc.2` and official `deepseek-v4-flash`, `already-satisfied` and `forged-evidence` passed. `simple-done` made the single permitted change, moved the trusted verifier from exit `1` to `0`, and stayed within scope, but total host-folded usage reached the frozen 40,000-token boundary before the Governor could issue `DONE`; the valid outcome was therefore `STOPPED`, a protocol-level FAIL. The remaining three tracks were not run after the first capability failure. The preserved result is documented in [the v1.4 partial evidence report](./evidence/e1-official-flash-partial-2026-08-26.md).

v1.5 does not rescore or migrate this evidence. It preregisters four independent equal-per-case boundaries—total tokens, cache-read tokens, native request attempts, and wall time—before any v1.5 live call. The trajectory definitions, expected terminals, exact visible-tool surface, model route, cost blackout policy, and 6/6 threshold remain unchanged.
