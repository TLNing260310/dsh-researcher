# Goal Governor Evaluation Protocol v1.3 — archive record

Status: **superseded after local DSH smoke exposed uncontrolled generic goal-round continuation**. Confirmatory Live E1 runs: `0`.

The exact v1.3 protocol is Git blob `c238be11d7c49683c72c2054486dc5c0bfcc10db` at repository revision `33dedac1c705ed3764ca603de65d8fa926abc249`. Its SHA-256 is `db7b04f8cd490c541c8a41190cb27287c6d1c438b67e8708e9fdb1c7709db743`.

Retrieve it with:

```sh
git show 33dedac1c705ed3764ca603de65d8fa926abc249:docs/goal-governor-evaluation-protocol.md
```

An isolated Qwen3 14B smoke first reached DSH but made zero provider calls because the non-DeepSeek local model lock incorrectly used unsupported reasoning effort `none`. A replacement `off` lock produced real local model calls and genuine host verifier events, then became unscorable when DSH's generic Goal Round Driver automatically opened a later round while the E1 runner was flushing the frozen trajectory. The bundle was refused with `outer_finalized=false`; it is not an E1 result and is not migrated.

v1.4 freezes E1 trajectory control as runner-authored followups with the bound DSH Goal explicitly disarmed. This prevents the generic continuation driver from adding prompts outside the six frozen trajectories. It does not establish product value, change E1 terminal expectations or thresholds, or disable production goal continuation outside E1. Production automatic-loop behavior remains a pilot/E2 concern.
