# dsh-researcher — project reality, attention routing, and evidence-gated completion

## In one sentence

`dsh-researcher` is a DSH plugin for DeepSeek Harness that puts a coding agent's attention on the changes worth making to **this** project — its real purpose, its real runtime environment, where its architecture is drifting, and what a change would actually buy — and that refuses to call work done without host-observed evidence.

## The 30-second explanation

An agent is good at producing a plausible next change. It is less reliable at carrying project intent across sessions, respecting old architecture boundaries, and deciding when enough work has been done.

`dsh-researcher` separates three jobs that ordinary Plan mode tends to mix:

| Layer | Entry | Question it answers |
| --- | --- | --- |
| **Project Research** | `/research <task>`, or the `项目研究 Project Research` preset | What is this project now, what is drifting, and what is worth changing? |
| **Project Cognition** | portable core + CLI | Which claims about the repository are trusted, why, and when do they go stale? |
| **Goal Governor** | portable core + Governed Coding | What observable state counts as complete, who may prove it, and when must work stop? |

The layers are independent. Project Research can be tried without adopting Goal Contracts, and the portable CLI works without claiming every client enforces the same thing.

This is not another general-purpose coding agent, and it is not an assistant that agrees with you. It is an advanced experimental alpha for maintainers who want owner-ratified facts and a verifiable definition of done.

## What research mode is for

The purpose is to put the model's attention on the changes worth making to **this** project, and to keep it there. A research run is expected to:

- name the project's actual purpose and the environment it really runs in;
- find where it is drifting off its own architecture, and where a locally reasonable change would cross a boundary;
- judge whether a change is worth making at all — **including changes to prompts and to context** — and say what the modification would buy;
- locate the mistakes this project is most likely to make next;
- and, before concluding, **reverse the question**: what would have to be true for this reading to be wrong, and what would change if the architecture were different.

Output is a structured report, not a conversation. Every factual claim carries a citation or is marked unverified; findings land in `BUILD` / `DON'T BUILD` / `INVESTIGATE`; "I don't know" is a legitimate result.

A curated knowledge base of real experience from other projects is planned, to be selected and injected on demand so the model checks the angles that matter for the task at hand. It does not exist yet — today's attention guidance comes from a fixed persona plus two skills.

## Who this is not for

- **Not for chasing one code error.** If the wrong line is already known, use an ordinary agent. Research mode cannot write.
- **Not for a model that agrees with everything.** The mode exists to disconfirm its own reading; an assistant seeking approval produces ceremony, not findings.
- **Not for a task with no decision in it.** If nothing is in doubt, there is nothing to research.

It is for two situations in particular: **meeting a project you have not worked in and needing its purpose, boundaries and real runtime aligned quickly**; and **having taken a project through many rounds of AI edits until it looks correct while quietly accumulating holes or no longer moving forward** — where the missing thing is not effort but a correct picture of what the project now is.

## Why it exists

A session can fail even when every individual edit looks reasonable. A new agent reinterprets why the repository exists, fixes the immediate symptom, cleans up adjacent code, weakens an old invariant, and declares completion because the visible tests pass. Another session keeps polishing after the task was already satisfied, because nobody defined a stopping condition.

## How research mode works

Research mode is **read-only, and the read-only part is environmental rather than behavioural**. It is closed at three levels, not one:

| Level | What is closed |
| --- | --- |
| Sandbox | The session runs `read-only`; writes are refused by the environment, not by discipline |
| Tool descriptions | `write` and `edit` are replaced by always-refusing stubs; the write-oriented guidance sections are shadowed so they never enter the prompt |
| Permissions | Approval is tightened to `never` — there is no escalation path, by design |

There is no shell. The only subprocess capability is `git_read`: a fixed allowlist with no `-c`, no aliases, no pager, and ignored global git config.

`/research <task>` enters this mode **in the current session**, and the main agent keeps executing:

```text
/research <task>
  → session sandbox switched to read-only
  → tool guard denies shell, write, terminal, delegation and code execution
  → persona switched to the research persona for this session
  → Route Manifest injected: which review lenses were selected, which were
    skipped and why, which cannot be assessed here
  → the main agent researches; /research off restores the previous state
```

The session sandbox alone is not enough. `permissionPresets` constrains the filesystem, and a shell write passes straight through it — on a preset with a persistent shell, `pwsh -c "Set-Content ..."` would have written under a read-only session. The tool guard is what closes that.

`/research --session <task>` derives a separate certified research session instead, which also gets the Runtime Certificate. `research_doctor` and `research_checkpoint` are per-agent preset installations that only run when an agent is created, so they are available in that derived session and not in-session.

### The lens library

40 architecture review lenses across 8 domains live under `docs/kb/`. Each carries a trigger, checkable questions, named failure modes with a primary source, candidate alternatives with their costs, evidence anchors, and provenance. Only clean-licensed sources back its entries; sources that forbid redistribution or derivation stay in a separate tier and contribute links and our own wording, never text.

Selection is deterministic and auditable: `skipped` and `unassessable` are required fields of the manifest, not optional. A lens below the precision threshold is never substituted, because injecting an approximate-but-wrong review angle is worse than injecting none.

### 1. Project Cognition: preserve project reality without automatic promotion

```text
read-only research
  → provisional Research Session Ledger
  → draft cognition revision
  → owner review
  → seal and exact-next install
  → canonical .project-cognition/state.json
  → generated PROJECT_COGNITION.md projection
```

The JSON state is the sole normative truth. Markdown is a deterministic projection. Session findings never become project facts merely because a model wrote them confidently. The CLI actor label is not human authentication; approval authority must stay outside the model workflow.

### 2. Goal Governor: make completion an evidence decision

A Goal Contract records the intended result before execution begins: MUST criteria, boundaries, allowed effort, human gates, and approved verifiers. Verifier evidence is bound to the tool name, complete arguments, hashes, and host-observed result.

```text
approved goal + frozen verifier registry
  → agent executes
  → host records calls, results, gates, usage, repository state
  → reducer replays the trusted event prefix
  → CONTINUE | NEEDS_HUMAN | DONE | STOPPED
```

Assistant prose is never sufficient evidence. A passing baseline produces `ALREADY_SATISFIED`; a failing verifier keeps the task open; budget exhaustion produces `STOPPED`; contract, permission, or evidence drift produces `NEEDS_HUMAN`.

## Installation and removal

Requirements, in full, are in [Deployment and use requirements](./deployment-requirements.md). In short: DSH `0.1.5-rc.3`, Node `^22.19.0 || >=24.0.0`, and a session started with **Read Only** permission. Anything else and the preset refuses to start rather than degrading; an environment that cannot be proven read-only cannot run this mode.

The installer writes two presets, and appends one row to the two DSH presets people actually run so `/research` works in a normal session. That patch is one appended block between markers, the original file is kept beside it, `--no-host-preset-patch` skips it, and uninstall removes it by marker search.

Removal leaves nothing behind: the managed presets go, the appended row goes, the backup it took goes. What remains is `.dsh-researcher`, which holds the backups that rollback and audit need, and is documented as such.

## Current maturity and evidence

The honest description is **advanced experimental alpha**.

| Area | Status | What that means |
| --- | --- | --- |
| Canonical cognition, hashes, revisions, projection, reducers, replay, installer lifecycle | **Repository tests pass** | The covered mechanical properties exist and reject the tested drift, forged-evidence and residue paths. |
| Research runtime boundary | **Isolated trial** | A tested DSH environment can become read-only and fail closed. Safety is not answer quality. |
| Attention routing mechanism | **Built, unmeasured** | The router is deterministic and tested; **lens selection quality has never been measured on a real repository**. |
| Experimental lens corpus, clean-licensed sources | **First batch** | 40 lenses from authoritative sources. Requires a curation pass; the vocabulary reflects actual usage rather than a prior design. |
| Goal Governor Live E1 | **Not proven** | Protocol v1.5 and the incomplete v1.6–v1.11 runs are preserved as invalid evidence. Protocol v1.12 is an offline scorer correction and the live round is mechanically `STOPPED`. |
| Outcome value | **Not proven** | No valid experiment yet shows the ceremony reduces false completion, scope drift, or human correction cost. |
| Long-term cognition value · multi-client portability · independent user experience | **Hypothesis · not proven · not measured** | Longitudinal study outstanding; no second adapter has passed conformance; no admitted external pilot result exists. |

Failed and invalid experiments remain part of the public record. A later scorer correction cannot rewrite an old result, and a new experiment may establish only a new claim. Authoritative status lives in [Validation Status](./validation-status.md) and the generated [Project Cognition](../PROJECT_COGNITION.md).

## What would make it a proven product

More features are not the next proof. The progression is deliberately frozen:

```text
fresh Gate 0
  → complete six-track E1
  → non-inferential independent user pilot
  → preregistered E2 value comparison
  → second-adapter conformance
  → model × client E3
```

The current E1 live round is stopped. Another paid run requires a new owner-authorized proof plan, a new frozen protocol and candidate, and a complete fresh run rather than stitching together selected historical tracks. If E2 does not demonstrate sufficient net value, the responsible outcome is to keep this as a research and governance toolkit instead of expanding compatibility claims.

## Short reusable description

Read-only, on-demand research that puts an agent's attention on architecture drift, real project purpose, and the changes worth making — with owner-ratified project cognition and evidence-gated completion. DeepSeek Harness is the first adapter; outcome value and multi-client portability remain experimental.

`dsh-researcher` is released under the [MIT License](../LICENSE), Copyright © 2026 TLNing260310. It may be used, copied, modified, merged, published, distributed, sublicensed, and sold when the copyright and license notices are preserved; the software is provided "as is," without warranty.
