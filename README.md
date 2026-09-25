# dsh-researcher

**English** | [简体中文](./README.zh-CN.md)

[![CI](https://github.com/TLNing260310/dsh-researcher/actions/workflows/test.yml/badge.svg)](https://github.com/TLNing260310/dsh-researcher/actions/workflows/test.yml)
[![Release](https://img.shields.io/github/v/release/TLNing260310/dsh-researcher?include_prereleases&sort=semver)](https://github.com/TLNing260310/dsh-researcher/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Live E1: invalid](https://img.shields.io/badge/Live_E1-INVALID-red.svg)](./docs/validation-status.md)

## Stop AI coding agents from forgetting project reality—or declaring DONE without evidence

`dsh-researcher` is a DSH plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It separates three jobs that ordinary Plan mode tends to mix:

- **Project Research** reconstructs purpose, architecture, constraints, risks, and unknowns inside a guarded read-only session, from a curated library of architecture review lenses.
- **Goal Governor** freezes the target, boundaries, budget, human gates, and definition of done; the host then derives the terminal state from trusted events instead of assistant prose.
- **Research Entry** (`/research`) enters read-only research on demand from a normal coding session, carrying the conversation across. It stays inert otherwise.

They are independent. You can trial Project Research without adopting Goal Contracts.

### What this mode switches off, and why

The developer's judgement is that **other tools compete for the attention budget**. So this mode closes them at all three levels, not just one:

| Level | What is closed |
|---|---|
| Sandbox | The session runs `read-only`; writes are refused by the environment, not by discipline |
| Tool descriptions | `write` and `edit` are replaced by always-refusing stubs; the write-oriented guidance sections are shadowed so they never enter the prompt |
| Permissions | Approval is tightened to `never` — there is no escalation path, by design |

There is no shell. The only subprocess capability is `git_read`, a fixed allowlist with no `-c`, no aliases, no pager and ignored global git config. The mode reads and reasons; it never executes.

> **Environment requirements — read before installing.** Research mode is strict and fails closed. It requires DSH `0.1.5-rc.2` and Node `^22.19.0 || >=24.0.0`, and the session must start with **Read Only** permission. Anything else and the preset **refuses to start** rather than degrading. This is intentional: an environment that cannot be proven read-only cannot run this mode. See [Deployment and use requirements](./docs/deployment-requirements.md).

> **What research mode does not yet do.** It has **no task-level attention routing yet** — that is planned, and we are collecting knowledge bases and mature prior art for it. Today its attention guidance comes from a fixed persona plus two skills. Do not describe this mode as adapting its review angle to the task.

> **Honest maturity:** the mechanisms, installer lifecycle, adversarial replay, and offline E1 infrastructure are tested. A complete v1.5 live attempt ran but was **INVALID**; E1 conformance, net productivity gain, long-term Project Cognition value, and adapters beyond DSH remain **not proven**.

> **Latest runtime evidence:** protocol v1.11 used its single preregistered replacement opportunity. `resume-replay` completed observe, process exit, same-session continue and host `DONE`, but the frozen candidate scorer incorrectly included pre-goal setup events only in its stage-one verification path and returned INVALID. The other five tracks were not run, and the E1 round is stopped rather than retried. Protocol v1.12 fixes that offline scorer scope; a diagnostic rescore passes the one track but cannot rewrite v1.11 or prove 6/6. See the [v1.11 result](./docs/evidence/e1-v1.11-live-results.md).

## The problem

AI coding becomes unreliable across sessions, not only within one prompt:

1. A new session re-guesses why the repository exists.
2. Locally plausible changes slowly cross architecture or migration boundaries.
3. An agent says “done” without sufficient outcome evidence—or keeps polishing after the task is already satisfied.
4. The person never froze a stopping condition, so neither side knows when to stop.

A Plan says what steps may be attempted. This project records what is believed true, what must be achieved, who may prove it, and when work must stop.

## What research mode is for

The purpose is to put the model's attention on the changes that are worth making to **this** project, and to keep it there. Concretely, a research run is expected to:

- name the project's actual purpose and the environment it really runs in;
- find where it is drifting off its own architecture, and where a locally reasonable change would cross a boundary;
- judge whether a proposed change is worth making at all, including changes to prompts and to context, and say what the modification would buy;
- locate the mistakes this project is most likely to make next;
- and, before concluding, **reverse the question**: what would have to be true for this reading to be wrong, and what would change if the architecture were different.

Output is a structured report, not a conversation. Every factual claim carries a citation or is marked unverified; findings land in `BUILD` / `DON'T BUILD` / `INVESTIGATE`.

A curated knowledge base of real experience from other projects is planned, to be selected and injected on demand so the model checks the angles that matter for the task at hand. It does not exist yet; see the honesty note above.

## Who this is not for

Stated plainly, because time is expensive:

- **Not for chasing one code error.** If you know which line is wrong and want it fixed, use an ordinary agent. Research mode cannot write.
- **Not for a model that agrees with everything.** The mode is built to disconfirm its own reading; an assistant that seeks approval will produce ceremony, not findings.
- **Not for a task with no decision in it.** If nothing is in doubt, there is nothing to research.

It is for two situations in particular: **meeting a project you have not worked in and needing its purpose, boundaries and real runtime aligned quickly**; and **having taken a project through many rounds of AI edits until it looks correct while quietly accumulating holes or no longer moving forward** — where the missing thing is not effort but a correct picture of what the project now is.

## See the mechanism in 60 seconds

The public demo is offline and starts real verifier child processes. It uses a synthetic DSH-shaped event envelope, so it proves reducer behavior—not Live DSH or model productivity.

```bash
git clone https://github.com/TLNing260310/dsh-researcher.git
cd dsh-researcher
npm run demo
```

![Agent confidence is rejected until a matching verifier passes](./docs/assets/governor-demo.svg)

The three decisions are reproducible:

```text
assistant says DONE, no trusted evidence  → CONTINUE
matching verifier exits 1                → CONTINUE
matching verifier exits 0 after repair   → DONE
```

The final assistant message is never evidence. A MUST criterion is satisfied only by a host event bound to an approved verifier's tool name, complete arguments, argument hash, and result policy.

## Choose only the layer you need

| Your situation | Use | Maturity |
|---|---|---|
| Taking over an unfamiliar repository, or judging whether a change should happen at all | **Project Research** (`/research` or the preset) | Isolated trial; read-only runtime boundary has a real DSH Web smoke |
| Wanting the review angles chosen for you | `/research <task>` in a normal coding session | Mechanism proven; lens selection quality unproven |
| Checking one project fact during coding | `/researcher <question>` in Governed Coding | Isolated one-turn trial |
| Freezing acceptance criteria, budgets, human gates, and stopping states | **Goal Governor** | Advanced alpha; mechanisms tested, outcome gain unproven |
| A tiny bug, CRUD change, or disposable script | Ordinary Agent / Plan | This project is probably too heavy |
| Codex, Claude Code, OpenClaw, Kiro, or Zed/Zcode without DSH | Do not install yet | Portable core exists; client adapters are not delivered |

### Who this is for

This project assumes a reader who can judge evidence. It is not a "install and forget" assistant:

- You must be able to read evidence strength. Every claim carries `file:line`, a commit or a URL, plus an evidence tier (`C0`–`C4`) and a verdict (`Known` / `Likely` / `Claimed` / `Unknown` / `Contradicted`). The two axes are independent, and the combination table is in the [methodology skill](./researcher/skills/project-research-methodology/SKILL.md).
- You must accept that research may produce **nothing** on a bad environment. The preset refuses to start rather than running degraded.
- You must make the architecture decision yourself. This mode produces cognition and candidate directions, never execution authority.
- You must accept a deliberately narrowed attention surface. No shell, no MCP tool surface, no write tools — in read-only research those are attention cost, not capability.

## Safe trial on DeepSeek Harness

Requirements:

- DeepSeek Harness target: `0.1.5-rc.2`; offline infrastructure is green, while the isolated Gate 0/live conformance result remains pending.
- DSH runtime Node requirement: `^22.19.0 || >=24.0.0` (the portable project core remains `>=22.12.0`).
- Node.js: `>=22.12.0`.
- Research sessions must start with **Read Only** permission; the preset tightens approval to `never`, which the UI shows as Custom.
- Use an isolated `DSH_HOME` and a non-critical repository copy first.

This repository is **GitHub-distributed only**. The unscoped npm name `dsh-researcher` belongs to a different maintainer and repository. Do not use `npm install dsh-researcher`; use the pinned GitHub source or signed release assets below. The private scoped identity `@tlning260310/dsh-researcher` prevents accidental publication under the wrong identity; this is a DSH preset bundle plus Node governance library, not a native marketplace-plugin claim.

Preview every installer-owned change first:

```bash
npx -y github:TLNing260310/dsh-researcher#v0.8.0-alpha.9 --dry-run
```

Install only after reviewing the preview:

```bash
npx -y github:TLNing260310/dsh-researcher#v0.8.0-alpha.9
```

The installer refuses unknown DSH versions and existing presets by default. Backup, force-upgrade, uninstall, rollback, and SHA-256-bound release installation are documented in [Safe installation and recovery](./docs/installation.md).

## Path A: read-only Project Research

1. Start a new DSH Web session and select `Read Only`.
2. Select `项目研究 Project Research`. The preset tightens approval to `never`.
3. Ask a bounded, evidence-oriented question:

```text
Run research_doctor first. Review this repository without writing files.
Use path:line evidence to explain its purpose, immutable constraints,
documentation/implementation conflicts, and the next hypothesis worth testing.
Mark anything unverified as UNKNOWN.
```

`research_doctor` must be the first tool call. Research remains locked unless the Runtime Certificate is `SAFE`; later permission drift revokes the certificate before another model response.

Two entry points exist:

| Entry | Lifetime | Intended use |
|---|---|---|
| `项目研究 Project Research` preset | Persistent session; environment-level read-only, approval never, no generic shell | Full or high-risk repository research |
| `/researcher <question>` | One guarded read-only turn inside Governed Coding | A focused fact check during implementation |

The real smoke proves the runtime boundary, not report quality. Two local 14B probes failed to produce a publishable report; that negative evidence remains public in [Project Research local-output smoke](./docs/evidence/project-research-local-output-smoke-2026-08-25.md).

## Path B: a review-first Goal Contract

The Quickstart generates external Cognition, Verifier Registry, Goal Contract, and `REVIEW.md` drafts. It does not approve a goal or promote project facts for you.

```bash
npx -y --package=github:TLNing260310/dsh-researcher#v0.8.0-alpha.9 project-cognition init .
npx -y --package=github:TLNing260310/dsh-researcher#v0.8.0-alpha.9 project-cognition quickstart --root . --out ../my-goal-review --goal-id fix-login-timeout
```

Review purpose, boundaries, MUST criteria, budget, and verifier definitions in the generated `REVIEW.md`, then follow its explicit approval commands. See the [five-minute Quickstart](./docs/quickstart.md).

## What “done” means here

- Every MUST criterion needs a frozen verifier or direct human gate.
- The final attempt re-proves every MUST; it cannot inherit an old attempt's success.
- An already-passing baseline returns `ALREADY_SATISFIED` without a performative code change.
- Attempt, time, token, or no-progress budgets end in `STOPPED`.
- Contract, cognition, permission, or verifier drift ends in `NEEDS_HUMAN`.
- A model cannot write or replace its own terminal decision; the host recomputes it from the trusted event prefix.

## Authority flow

```text
read-only research
  → Research Session Ledger (non-authoritative)
  → draft revision
  → owner review
  → seal
  → .project-cognition/state.json (canonical truth)
  → deterministic PROJECT_COGNITION.md projection

Goal Contract + frozen verifier registry
  → host-observed calls, results, gates, usage, and repository revision
  → replay / reducer
  → CONTINUE | NEEDS_HUMAN | DONE | STOPPED
```

The CLI actor label is not human authentication. Repository governance must keep approval authority outside the model workflow.

## Evidence ledger

| Layer | Status | What it establishes |
|---|---|---|
| Unit, replay, integration, adversarial, installer, and package tests | PASS | The published mechanisms reject the covered drift and forged-evidence paths |
| `project-cognition doctor .` | PASS | Current schema, hashes, projection, goals, and registry agree; it does not prove evidence freshness |
| DSH Web Project Research smoke | Runtime boundary PASS; output probes FAIL | The exact tested runtime can become SAFE and reject drift; research quality is not established |
| Goal Governor E1 infrastructure | v1.12 offline READY; v1.5 and incomplete v1.6-v1.11 Live E1 INVALID | E1 live round is STOPPED; no six-track conformance claim and no additional paid retry is authorized |
| Client adapter discovery | Claude SDK 0.3.251: HOLD; Codex App Server stdio 0.150.0-alpha.12.2: HOLD | Version-locked interface maps only; no second adapter or compatibility claim |
| Outcome value and portability | NOT PROVEN | Requires Live E1, a non-inferential pilot, E2, then second-adapter conformance |

Run the public offline checks without a model or network call:

```bash
npm run check
npm run demo
npm run adapter:discovery:check
npm run eval:e1:preflight
```

The proof order is frozen as `Gate 0 → E1 → non-inferential pilot → E2 → second-adapter conformance → E3`. See [Validation Status](./docs/validation-status.md) and the protocol-owned [Goal Governor evaluation definition](./docs/goal-governor-evaluation-protocol.md).

Client integrations share the [portable HostEvent and invocation contract](./docs/client-adapter-contract.md): one-shot `researcher.ask(...)`, persistent `researcher.mode.set/get(...)`, and client-native mode-switch commands reduce to the same host-owned state. The package root exposes `adapterCore` for this experimental base envelope; it is not a governed-adapter conformance claim.

Version-locked Claude and Codex discovery records now make the remaining gaps
reviewable. Both are `HOLD`: Codex has a real zero-model app-server handshake plus
a credential-stripped regeneration of its complete schema/method inventory, but
lacks durable raw command replay, principal and write receipts; Claude has a
locked official SDK whose module and bundled CLI load without creating a session,
but no authentic query/tool/resume trace. These records do not change the DSH
manifest or install another adapter.

## How this differs from familiar tools

| Layer | Primary question |
|---|---|
| Plan / Tasks | What steps should we attempt next? |
| Spec | What behavior do we intend to build or change? |
| Memory | What did the agent previously learn? |
| Project Cognition | What claims about repository reality are trusted, why, and when do they become stale? |
| Goal Governor | What observable state counts as done, who may prove it, and when must work stop? |

Spec Kit, OpenSpec, Kiro, Serena, Beads, and client-native Plan/Memory may be better choices for many users. The candidate differentiation here is the combination of **staleable project reality** and **host-owned terminal adjudication**, not any individual feature. See the [competitive and integration landscape](./docs/landscape.md).

## Repository map

- [Project introduction](./docs/project-introduction.md)
- [Safe installation and recovery](./docs/installation.md)
- [Five-minute Quickstart](./docs/quickstart.md)
- [Validation Status](./docs/validation-status.md)
- [Architecture](./docs/architecture.md)
- [Goal Governor guide](./docs/goal-governor.md)
- [Project Cognition governance](./docs/cognition-governance.md)
- [Case library and admission standard](./docs/case-studies/README.md)
- [E1 harness](./evaluation/goal-governor-e1/README.md)

## Feedback

You do not need a polished report. The most useful signals are whether the demo ran, where installation stopped, whether the workflow prevented a wrong completion, and whether it added only overhead.

- [Submit a 10-minute trial report](https://github.com/TLNing260310/dsh-researcher/issues/new?template=trial-report.yml)
- [Read the frozen Pilot 0 protocol](./docs/pilots/pilot-0-protocol.md)
- [Share an admitted external Pilot result](https://github.com/TLNing260310/dsh-researcher/issues/new?template=feedback.yml)
- [Open a reproducible bug](https://github.com/TLNing260310/dsh-researcher/issues/new?template=bug-report.yml)
- Report security issues privately under [SECURITY.md](./SECURITY.md).

Current published release: `v0.8.0-alpha.9`, which shipped before the v1.5-v1.11 live attempts. All post-release results remain negative or incomplete evidence; v1.12 is an offline correction and E1 live is stopped. Outcome value and multi-client portability remain NOT PROVEN.

## Acknowledgements and tribute

The research-mode roadmap — **attention routing, injection discipline, and a curated lens library** — did not start from a blank page. Several DSH ecosystem projects have already explored this ground and published what they learned, including results that overturned their own initial designs. We read them, adopted what fit, and say so here.

**We are grateful to the authors of these projects.** Thanks and respect to:

| Project | What we learned from it |
|---|---|
| [**dsh-company-kb**](https://github.com/wu81313-lab/dsh-company-kb) | The explicit-invocation gate (sticky session state · trigger words with a negation window · path naming) — our first-level trigger follows the same principle. Its dual-FTS5 + RRF retrieval is the reference for our retrieval layer. Its refusal text, which tells the model **not to keep asking**, is a second line of defence against attention pollution. |
| [**dsh-experience-memory**](https://github.com/Marquez807/dsh-experience-memory) | The **four-surface model** (automatic injection / unconditional one-line guidance / maintenance / tools and commands), and the discipline of leaving anything that reaches outside the store behind a **human** trigger. Its provenance audit — flag, never refuse — shaped our lens freshness rule. |
| [**dsh-learn-wiki**](https://github.com/Dayi-Z/dsh-learn-wiki) | The single most useful finding we read: its trigger was changed from *retrieval miss* to *struggle*, because a miss is too cheap a signal (every new topic misses). **That published negative result overturned our first trigger design.** |
| [**dsh-literature**](https://github.com/amphilagus/dsh-literature) | A dedicated preset carrying a dedicated tool set, unloaded everywhere else — the organisational pattern our scoped research entry uses. |
| [**deepseek-harness**](https://github.com/deepseek-ai/deepseek-harness) | The runtime this project is a plugin for. |

Two further projects informed our **thinking only** — no code, text, or data from them is included, because their licences are incompatible with this project's MIT distribution:

- [**twiceshy**](https://github.com/dotts-h/twiceshy) (AGPL-3.0) — the principle that **an approximate-but-wrong experience must never be injected**, because injecting it actively harms the agent; the record shape `{symptom, scope, root cause, guard test}` independently converged on our six-field lens schema; and the push+pull hybrid channel.
- [**dsh-context-mode**](https://github.com/icanfinish11/dsh-context-mode) (Elastic License 2.0) — confirmed by contrast that our bottleneck is **where attention lands**, not context capacity.

**Governance borrowing is acknowledged explicitly**: the discipline of keeping capability-changing paths behind human triggers, of distinguishing "flag" from "refuse", and of publishing negative results rather than quietly replacing them, all come from the projects above. Where we diverge, we say why in the design notes.

Full licence texts are in [`licenses/`](./licenses/); per-project attribution and the register of what is and is not incorporated are in [`THIRD-PARTY-NOTICES.md`](./THIRD-PARTY-NOTICES.md).
