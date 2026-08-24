# DSH Web local smoke — 2026-08-24

This is a trusted-local-operator smoke report, not an E1 evidence bundle and
not an outcome experiment. All model calls used local Ollama; no remote API or
paid model was used.

This report is provisional evidence. It does not alter canonical Project
Cognition until an owner reviews, seals, and installs a new cognition revision.

## Frozen task

The same Chinese prompt asked for a read-only project review, mandatory
`research_doctor`, four evidence-backed answers, `path:line` citations, and
`UNKNOWN` for unverifiable claims.

## Major rounds

| Candidate | Model | Runtime result | Outcome result |
|---|---|---|---|
| released alpha.4 | local `deepseek-r1:14b` | FAIL: completed unsupported prose with no tool call | FAIL: generic hallucinated project |
| terminal-gate candidate | local `deepseek-r1:14b` | PASS fail-closed: bounded retry then explicit no-doctor failure | no research output |
| terminal-gate candidate | local `qwen3:14b` | doctor ran, UNSAFE | no research output |
| preset-selection candidate | local `qwen3:14b` | partial: replay PASS; approval/stubs FAIL | no research output |
| pre-step candidate | local `qwen3:14b` | SAFE: every certificate row PASS | FAIL: forgot the original task, then invented `project_root` and Rust files |
| same pre-step candidate after permission drift | local `qwen3:14b` | FAIL: stale SAFE accepted no-tool prose after switching to Workspace Write | not applicable |
| drift-fix candidate | local `qwen3:14b` | PASS: SAFE baseline, then Workspace Write rejected before another model response | not an outcome run |

## What this proves

- DSH Web's post-creation preset recompose is a distinct lifecycle from
  `agent/created`; guarding only creation is insufficient.
- The current candidate can attach researcher stubs to the live Web agent,
  tighten approval to never, hydrate replay, require a real doctor verdict,
  and reject post-certificate writable drift before another model response.
- Model behavior matters: the two local 14B models failed differently under
  the same client and task.
- Client context/lifecycle also matters: lifecycle fixes changed the same
  Qwen run from UNSAFE to SAFE without changing model weights.

## What this does not prove

- It is not the protocol-defined Goal Governor E1 and covers none of E1's
  required terminal trajectories.
- It does not prove useful project-research output, productivity, longitudinal
  cognition value, Goal Governor incremental value, or portability.
- The raw DSH sessions are retained outside the repository because they embed
  machine-local paths and the host skill catalog. Their checkpoint hashes are:
  `D15C78E05F245F8A2817933E93A762C4592528D2E664F644597A661C7E7665E3`
  (released baseline),
  `120B5C6320E462997FAD5E2A21A990947785FAE0E2710AB12A9984A177FEEE1C`
  (DeepSeek terminal gate),
  `855F89D04F0B28F94787B4F9158C99A42245F9D6833E094B0E35BF5276F2AD6A`
  (Qwen terminal gate),
  `60B437209C361BBC2683103C466A12B8069FB7A7B62BD6333C62604EC26FBCEC`
  (preset selection),
  `22C36E3CA2BF40D2ADCA34B2CAF4AD385AFC977E7900165826E1C98548EEDA2C`
  (pre-step plus drift failure), and
  `0A7B8C9F7CBD02E3B36B643957083C9FB7290DED170EDBFBD078417FFACC521D`
  (final drift fix). These hashes identify retained local artifacts but are
  not independently verifiable public evidence.
