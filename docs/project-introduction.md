# dsh-researcher — project reality and evidence-gated completion

## In one sentence

`dsh-researcher` is an experimental governance layer that helps AI coding workflows preserve what a project is, define what a task must achieve, and stop only when host-observed evidence says the work is done.

## The 30-second explanation

AI coding agents are good at producing a plausible next change. They are less reliable at carrying project intent across sessions, respecting old architecture boundaries, and deciding when enough work has been done.

`dsh-researcher` addresses those problems with two independent layers:

- **Project Research and Project Cognition** reconstruct purpose, architecture, constraints, evidence, decisions, and unknowns. Research findings remain provisional until an owner reviews and promotes them into canonical project state.
- **Goal Governor** freezes the target state, acceptance criteria, scope, budget, human gates, and stopping rules. The host derives `CONTINUE`, `NEEDS_HUMAN`, `DONE`, or `STOPPED` from trusted events instead of accepting the assistant's final message as proof.

This is not another all-purpose coding agent. It is an advanced experimental alpha for maintainers who want owner-ratified, evidence-backed project facts and a verifiable definition of done.

## Why it exists

A coding session can fail even when every individual edit looks reasonable. A new agent reinterprets why the repository exists, fixes the immediate symptom, cleans up adjacent code, weakens an old invariant, and then declares completion because the visible tests pass. Another session may continue polishing after the task was already satisfied because nobody defined a stopping condition.

The project separates questions that ordinary Plan mode often mixes together:

| Layer | Question it answers |
| --- | --- |
| Plan or task list | What steps might we try next? |
| Specification | What behavior do we intend to build or change? |
| Agent memory | What did the agent previously observe? |
| Project Cognition | What claims about the repository are trusted, why are they trusted, and when do they become stale? |
| Goal Governor | What observable state counts as complete, who may prove it, and when must work stop? |

A Plan can still be useful inside this workflow. It simply does not own project truth or the terminal decision.

## How the two layers work

### 1. Project Cognition: preserve project reality without automatic promotion

The certified Researcher runs inside a constrained read-only session. It may collect evidence and prepare a handoff, but it cannot implement changes or approve its own conclusions.

```text
read-only research
  → provisional Research Session Ledger
  → draft cognition revision
  → owner review
  → seal and exact-next install
  → canonical .project-cognition/state.json
  → generated PROJECT_COGNITION.md projection
```

The JSON state is the sole normative truth. Markdown is a deterministic human-readable projection. Session findings never become project facts merely because a model wrote them confidently. The CLI actor label is not human authentication; repository governance must keep approval authority outside the model workflow.

### 2. Goal Governor: make completion an evidence decision

A Goal Contract records the intended result before execution begins: MUST criteria, boundaries, allowed effort, human approval gates, and approved verifiers. Verifier evidence is bound to the tool name, complete arguments, hashes, and host-observed result.

```text
approved goal + frozen verifier registry
  → agent executes
  → host records calls, results, gates, usage, and repository state
  → reducer replays the trusted event prefix
  → CONTINUE | NEEDS_HUMAN | DONE | STOPPED
```

Assistant prose is never sufficient evidence. A passing baseline can produce `ALREADY_SATISFIED`; a failing verifier keeps the task open; budget exhaustion produces `STOPPED`; contract, permission, or evidence drift produces `NEEDS_HUMAN`.

## Who should consider it

This project is most relevant when:

- an unfamiliar or long-lived repository must be understood before a risky change;
- project purpose and architecture need to survive across multiple agent sessions;
- a wrong completion, silent scope expansion, or unbounded polishing would be costly;
- a maintainer needs an auditable answer to “why is this considered done?”

It is probably too heavy for a tiny bug, disposable script, routine CRUD change, or a workflow that does not need durable evidence. Users of Codex, Claude Code, OpenClaw, Zed/Zcode, or other clients should not install it expecting native support: the portable core exists, but no second client adapter has passed conformance.

## What can be tried today

The portable project core requires Node.js `>=22.12.0`. The DSH trial is pinned to DeepSeek Harness `0.1.5-rc.2`, whose runtime requires Node.js `^22.19.0 || >=24.0.0`. Within those boundaries, a user can:

- preview a GitHub-distributed installation and use its backup, uninstall, and rollback paths;
- run the Project Research preset as an isolated read-only trial;
- use `/researcher <question>` for one guarded research turn;
- generate review-first Cognition, Verifier Registry, and Goal Contract drafts;
- run an offline demo in which real verifier child processes—not assistant confidence—determine completion;
- inspect deterministic replay, adversarial evidence rejection, package, and installer behavior;
- run the offline checks and E1 preflight without a model call or network connection.

The unscoped npm package named `dsh-researcher` belongs to another maintainer; this project is distributed from GitHub and its pinned release artifacts. The two governance layers are independent: trying Project Research does not require adopting Goal Contracts, and using the portable CLI does not imply that every client provides the same enforcement.

Start with the [README](../README.md), use the [safe installation and recovery guide](./installation.md), and review the [five-minute Quickstart](./quickstart.md) before installing into a non-disposable repository.

## Current maturity and evidence

The honest description is **advanced experimental alpha**.

| Area | Current status | What that means |
| --- | --- | --- |
| Canonical Cognition, hashes, revisions, projection, reducers, replay, installer lifecycle | **Repository tests pass** | The covered mechanical properties exist and reject the tested drift or forged-evidence paths. |
| Project Research runtime boundary | **Isolated trial** | A tested DSH environment can become read-only and fail closed, but two local 14B probes did not produce a publishable report. Safety is not the same as answer quality. |
| Goal Governor Live E1 | **Not proven** | Protocol v1.5 and the incomplete v1.6–v1.11 runs are preserved as invalid evidence. Protocol v1.12 is an offline scorer correction, and the live round is mechanically `STOPPED`. |
| Outcome value | **Not proven** | No valid experiment yet shows that the ceremony reduces false completion, scope drift, or total human correction cost. |
| Long-term Project Cognition value | **Hypothesis** | It still requires a separate longitudinal study. |
| Multi-client portability | **Not proven** | Claude Code and Codex App Server have version-locked discovery records marked `HOLD`; neither is a delivered adapter or compatibility claim. |
| Independent user experience | **Not measured** | No admitted external Pilot result exists yet. |

Failed and invalid experiments remain part of the public record. A later scorer correction cannot rewrite an old result, and a new experiment may establish only a new claim. The authoritative status and its boundaries are maintained in [Validation Status](./validation-status.md) and the generated [Project Cognition](../PROJECT_COGNITION.md).

## What would make it a proven product

More features are not the next proof. The project has deliberately frozen the progression:

```text
fresh Gate 0
  → complete six-track E1
  → non-inferential independent user pilot
  → preregistered E2 value comparison
  → second-adapter conformance
  → model × client E3
```

The current E1 live round is stopped. Another paid run requires a new owner-authorized proof plan, a new frozen protocol and candidate, and a complete fresh run rather than stitching together selected historical tracks. If E2 does not demonstrate sufficient net value, the responsible outcome is to keep the project as a research and governance toolkit instead of expanding its compatibility claims.

## Short reusable description

Read-only repository research, owner-ratified and staleable project cognition, and evidence-gated definitions of done for AI coding agents. DeepSeek Harness is the first adapter; outcome value and multi-client portability remain experimental.

`dsh-researcher` is released under the [MIT License](../LICENSE), Copyright © 2026 TLNing260310. It may be used, copied, modified, merged, published, distributed, sublicensed, and sold when the copyright and license notices are preserved; the software is provided “as is,” without warranty.
