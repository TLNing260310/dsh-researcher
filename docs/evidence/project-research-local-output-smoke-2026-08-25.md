# Project Research local-output smoke — 2026-08-25

## Why this run exists

This was a pre-release user-path probe for `0.8.0-alpha.7`: can a person install the candidate, select **Read Only → Project Research** in DSH Web, and obtain a useful evidence-backed review from an inexpensive local model?

The answer from these two runs is **no**. The runtime safety gates behaved usefully, but neither local 14B model produced a publishable project report. This record is public precisely so a SAFE certificate is not confused with outcome value.

## Frozen environment

| Item | Value |
|---|---|
| DSH | `0.1.0-rc.7`, PowerShell `dsh web` |
| Candidate package | `dsh-researcher-0.8.0-alpha.7.tgz` (pre-release candidate, not the final release asset) |
| Candidate SHA-256 | `b87b1ac9f944a3202362bd3cec85a3b82d2d1bf858547797b69aac692d4bbf6f` |
| Route | `http://127.0.0.1:11434/v1` through local Ollama |
| Models | `qwen3:14b`, then `deepseek-r1:14b` |
| Remote/API cost | none; no remote DeepSeek request |
| Workspace access | DSH Web `Read Only`; preset resolved the session to `Custom` |

The task required `research_doctor`, Git status, real repository reads, four bounded conclusions and `path:line` citations. It prohibited writes and implementation planning.

## Run A — Qwen3 14B

1. Before certification, the model emitted unrelated Alipay text and a generic readiness response.
2. The preset rejected those drafts with `Uncertified assistant draft rejected; research_doctor is required`.
3. The model then called `research_doctor`; the displayed certificate was `SAFE` and reported read-only sandbox, approval `never`, no shell and `git_read` present.
4. The model stopped at a certificate summary instead of doing the requested review.
5. After a follow-up, it tried to read six files by calling `git_read` with `{ "file_path": ... }`. The host returned `unknown action "undefined"`; repository file reads belong to `read`, while `git_read` requires an allowlisted Git action.
6. A second corrective prompt produced a valid `git_read({"action":"status"})`, but the model again asked what task to perform instead of following the already-visible task.

Outcome: **FAIL — no evidence-backed project report**. The certificate gate rejected uncertified prose, but it could not make this model preserve the task or use the tools correctly.

## Run B — local DeepSeek R1 14B

1. The first response ignored the mandatory doctor call and invented a generic “distributed-system governance and monitoring framework”. It cited filenames without reading them and supplied no line evidence.
2. The runtime injected the bounded certification correction.
3. The model emitted more unsupported implementation advice instead of calling doctor.
4. The terminal gate ended the turn with: `refusing to complete this turn because the model produced assistant text twice without a completed research_doctor result`.

Outcome: **FAIL — terminal gate rejected the report**. The false report is not presented as product output.

## What this does and does not prove

Supported in this environment:

- the candidate preset was discoverable in DSH Web;
- `Read Only → Project Research` produced the expected `Custom` constrained session;
- the doctor-first correction rejected pre-certificate prose;
- the bounded terminal gate refused completion after repeated uncertified drafts;
- the Qwen run could reach a displayed `SAFE` certificate and use the allowlisted Git status action after correction.

Not proven — and negatively indicated by this smoke:

- a local 14B model can reliably produce the promised Project Research report;
- a SAFE certificate implies correct task retention, correct tool arguments or factual conclusions;
- the preset improves research quality relative to an equal-context baseline;
- Goal Governor Live E1, production outcome value or multi-client portability.

The raw DSH cache remains outside the repository because it contains local workspace details. Its post-run SHA-256 is `c067a663ff46f3b233b6d74bede4031fa870296cf9d88bb70f8f03c58973e285`; the two session IDs are `session-7c9fd83d-86e6-4289-b578-de241d1cf8c1` and `session-184675aa-3937-4ecc-8a84-41ac37ab560d`. These identifiers provide provenance for the retained local evidence, not an independently downloadable public bundle.

## Product decision

Do not place a “successful Researcher report” on the homepage yet. Keep Project Research labeled **isolated trial**, show this failure beside the prior runtime smoke, and make a useful report a pilot gate rather than a marketing assumption. The 60-second homepage proof should therefore demonstrate the narrower mechanism that is reproducible today: a real verifier process fails, the host continues, the process passes after a bounded change, and the reducer reaches `DONE`.
