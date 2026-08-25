# E1 local Qwen smoke — 2026-08-25

Status: **one scorable local track FAIL; not confirmatory E1**

This run tested the real DSH-to-model-to-host-capture-to-offline-scorer path in
an isolated evaluation root. It used no remote API and does not count toward
the protocol's all-track E1 threshold.

## Frozen inputs

| Input | Value |
|---|---|
| Candidate commit | `c7c848474733c3e6de77f06f95ea88e93403710a` |
| Candidate package SHA-256 | `40ed38e6b15d79a4f6095035b5906083ab911bbee9cdf0cc86513ad2017de3a9` |
| DSH | exact `@deepseek-ai/dsh@0.1.1-rc.2` isolated module root |
| Route | `local-loopback`, `deepseek-official`, `http://127.0.0.1:11434/v1` |
| Model | local Ollama `qwen3:14b`, reasoning effort `off` |
| Run-lock hash | `9681623dd20f880e0b9b4075e73ba5d8234d0fe0cf2b7a5d1ea7521bfe519694` |
| Track | `already-satisfied` only |
| Network/API cost | no remote API; local model only |

The run used a fresh workspace and fresh `DSH_HOME` under the external
evaluation root. It did not read or write the user's normal DSH home.

## Observed result

DSH completed the session and flushed a full 485-event raw log. The outer
runner exited `0`, the append-only attempt ledger finalized cleanly, the host
verifier exited `0` without changing the fixture, and native usage coverage was
complete (`3/3` requests, `12,289` tokens). The local model called
`get_goal_contract` and `e1_verify`, but never began/completed the required
baseline attempt and never called `request_goal_decision`. Independent replay
therefore derived `CONTINUE`, not the required `ALREADY_SATISFIED`.

After fixing the scorer to use the same runtime-goal creation boundary as the
runner, the captured track scores:

```text
verdict: FAIL
invalid_reasons: []
expected_terminal: ALREADY_SATISFIED
derived_terminal: CONTINUE
attempt_ledger: verified, FINALIZED
```

Artifact SHA-256 is
`f086f865d078116f290ed5f45168c72b42cb3ea11c81199a0ff52b45a0a537fd`;
raw session SHA-256 is
`167ddd67823525a9e6f731b28b556e5e07e87c7a57ef147c894413c4cb430411`;
the incomplete bundle commitment is
`e3260c1a235e89d5322395246ae491ce92d178ea3882e03fac5183a1696c63ae`.
The raw bundle remains outside the repository because it is incomplete and
contains large model/session artifacts.

## What this proves—and does not prove

It supports that the exact rc.2 DSH route, frozen loopback resolver, visible
tool capture, raw session flush, host verifier, usage accounting, attempt
ledger, and offline scorer can operate together. It also gives negative model
evidence: this local 14B model did not follow the frozen Governor trajectory in
the simplest case.

It does **not** prove E1 conformance, product value, remote Flash behavior,
human-gate behavior, resume behavior, or multi-client portability. A full E1
bundle still requires every protocol-defined track under one frozen lock. The
official remote run remains blocked until a dedicated credential and spend
controls exist; the interactive gate must be supplied by the owner in a real
TTY.
