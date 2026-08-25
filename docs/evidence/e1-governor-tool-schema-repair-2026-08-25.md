# E1 Governor tool-schema repair probe — 2026-08-25

Status: **adapter defect fixed; two corrected-schema local tracks FAIL; not full E1**

## Finding

The first local multi-track probe repeatedly produced empty or incorrectly
named Goal Governor arguments. A source-to-runtime audit found a real adapter
defect: built-in DSH tools exposed standard JSON Schema, but the Governor tools
used a legacy flat parameter map such as:

```json
{"attempt_id":{"type":"string","required":true}}
```

Pinned DSH `0.1.1-rc.2` passes `tool.parameters` unchanged to the
OpenAI-compatible DeepSeek request. The model therefore did not receive the
standard `type/properties/required` contract used by the provider API. This
means earlier local model failures remain valid observations of the old
candidate, but their argument-shape failures cannot be attributed solely to
the model.

Commit `e524b12dd47f912082fb3f72fcc0079c1cd9c990` converts every Governor tool
and the host-owned `e1_verify` tool to object JSON Schema, moves required fields
to the root, rejects undeclared fields for repository-owned tools, and makes E1
visible-tool capture reject the legacy flat form.

## Frozen corrected candidate

| Input | Value |
|---|---|
| Candidate commit | `e524b12dd47f912082fb3f72fcc0079c1cd9c990` |
| Candidate package SHA-256 | `0a7dfb0ada0ffc331293aca65f4b5e27fa8637833147f1f0fdbfcdcb27c1a722` |
| DSH | exact `@deepseek-ai/dsh@0.1.1-rc.2` |
| Model/route | local `qwen3:14b`, reasoning `off`, frozen loopback DeepSeek-compatible route |
| Visible-tool schema hash | `b5a2ce895e7f7ea3a50f2ea03a193ec162a7995ba2b6b8134215123119e550b4` |
| Run-lock hash | `d920b9806f0337f67689d6725d31bfa41199f31c40a856e81fe5f38751bb6804` |
| Remote calls/cost | none |

The real DSH `request/header` evidence contains all 16 frozen tools. In
particular, `begin_goal_attempt`, `submit_goal_observation`,
`complete_goal_attempt`, `request_goal_decision`, and `e1_verify` carry standard
object schemas with the intended root-level required arrays.

## Corrected-schema results

| Track | Events | Tokens | Replay terminal | Score | Observed behavior |
|---|---:|---:|---|---|---|
| `already-satisfied` | 530 | 8,778 | `CONTINUE` | `FAIL`, no invalid reasons | Model called `get_goal_contract`, then incorrectly claimed `e1_verify` was unavailable even though the request header included it |
| `simple-done` | 160 | 28,408 | `CONTINUE` | `FAIL`, no invalid reasons | Model read and edited the fixture without opening a baseline or change attempt and never requested the host decision |

The corrected schema eliminated the observed empty/misnamed Governor argument
pattern, but the local model still did not follow the governed trajectory. The
host did not convert either response into completion.

Artifact/raw hashes:

| Track | `artifact.json` SHA-256 | raw session SHA-256 |
|---|---|---|
| `already-satisfied` | `75de00a13394b28f46af36752c9c71a367206c841984b11eebd8f5bbf84e6923` | `02f6351f3fd1a6f7c641ef4a96a165221cfbfcb09914d12ced7055cf6751ccf3` |
| `simple-done` | `61567b8a98d4ac2840a5cb94cc805ac0e3eaf7db265077895e9c8c26777c1232` | `7fe16d3e0bb53e439537f7042078155a8e65131c1b7b8fa2fd4d27800f9d3b27` |

## Interpretation

This proves that the model-visible DSH tool contract is now structurally
correct and that the host continues to fail closed under a model that ignores
the required workflow. It does not prove full E1, successful local-model
conformance, remote Flash behavior, human-gate authority, resume success,
outcome value, or portability.

The next confirmatory run should use the frozen official Flash identity and a
dedicated credential/spend boundary, plus direct owner TTY input for the gate.
Changing the frozen prompts merely to make this local model pass would alter
the intervention and requires an explicit protocol revision rather than a
silent retry.

