# Competitive and Integration Landscape

Updated: 2026-08-24. This document compares user-visible alternatives using their official documentation. It does not rank projects by stars and does not claim an empty market.

## Position in one sentence

> An evidence and completion-governance layer that can sit upstream of Spec Kit/OpenSpec and alongside Serena/Beads, while running inside an existing coding client.

Spec tools preserve what we intend to build. Memory tools preserve what an agent has learned. Task tools preserve what remains to do. Project Cognition represents claims about what is currently true, why they are believed and when their evidence becomes stale; Goal Governor rejects “done” without outcome evidence.

That combination is a hypothesis about user value, not a proven moat. Every individual capability already has strong alternatives.

## Closest user alternatives

| Alternative | What users get | Overlap | Current boundary |
|---|---|---|---|
| [GitHub Spec Kit](https://github.github.com/spec-kit/) | Constitution → Spec → Plan → Tasks → Implement → Converge across coding agents | Principles, read-only analysis, implementation gates and convergence loops overlap strongly with goal governance | Spec Kit begins with intended feature behavior; this project additionally binds claims about observed repository reality, evidence freshness and a general terminal-state reducer |
| [Kiro](https://kiro.dev/docs/) | Steering project knowledge, Specs, task execution, Hooks, permissions and an integrated client | Highest product-level overlap: memory + specification + execution + validation | Kiro is the more complete user product; this project is narrower and tests whether independent read-only cognition plus host-owned completion has value |
| [OpenSpec](https://github.com/Fission-AI/OpenSpec) | Lightweight proposal/spec/design/tasks, change deltas and archive workflow | Repository-carried intent and change records; explore before implementation | OpenSpec records agreed behavior and proposed change; Researcher may output DON'T BUILD/INVESTIGATE and treats docs as claims to verify rather than reality by default |
| [Serena memories](https://github.com/oraios/serena/blob/main/docs/02-usage/045_memories.md) | Semantic code tools, onboarding and versionable Markdown project memories | Closest direct substitute for “create project memory so every session does not start over” | Project Cognition adds typed claim status, evidence references, dependencies, revision and freshness; whether that extra structure improves outcomes is unproven |
| [Beads](https://github.com/gastownhall/beads) | Durable dependency task graph, ready/claim/close, gates and multi-agent coordination | Persistent goals, blockers, handoff and auditable work state | Beads answers “what work is ready?”; Goal Governor answers “is the user outcome actually achieved, according to frozen evidence?” They are potential complements |
| [Claude Code memory](https://code.claude.com/docs/en/memory) and [permission modes](https://code.claude.com/docs/en/permission-modes) | CLAUDE.md, auto memory, rules, read-only Plan mode and hooks/permissions | The easiest single-client substitute for memory plus research-before-editing | Claude Code is client-native; this project aims for project-carried, evidence-typed and eventually cross-client semantics, but only DSH is implemented today |

### Spec Kit is a direct pressure on Goal Governor

Spec Kit is not merely `spec → plan → tasks`. Its official [quick start](https://github.github.com/spec-kit/quickstart.html) and [Agentic SDD reference](https://github.github.com/spec-kit/reference/agentic-sdd.html) include a constitution, cross-artifact analysis, checklists and convergence against implementation. Therefore “continue until tasks are checked” is not a differentiator.

Goal Governor remains worth testing only if these narrower properties matter:

- terminal state is bound to real outcome evidence, not task completion alone;
- achieved, already satisfied, needs-human, external blocked, budget stopped and cancelled remain distinct;
- frozen Project Cognition constraints participate in adjudication;
- the reducer is not tied to a feature-spec directory or one client;
- the model cannot silently weaken the verifier or declare its own completion.

### Kiro is the closest complete product

Kiro already combines [Steering](https://kiro.dev/docs/steering/), [Specs](https://kiro.dev/docs/specs/) and [Hooks](https://kiro.dev/docs/hooks/types/). A user who wants one polished environment for project instructions, specification and implementation may reasonably choose Kiro instead.

This project should not recreate that surface. Its research question is whether the following narrower protocol has independent value: research/execution authority separation, Known/Likely/Unknown/Contradicted cognition, evidence fingerprints and host-owned terminal decisions.

### OpenSpec is a likely downstream, not something to clone

OpenSpec's [core concepts](https://github.com/Fission-AI/OpenSpec/blob/main/docs/overview.md) provide a lightweight repository protocol for proposed behavior and change deltas. A natural integration is:

```text
Researcher BUILD item
  → OpenSpec proposal/spec/design/tasks
  → implementation
  → Goal Governor outcome evidence
```

Researcher should retain the ability to conclude DON'T BUILD or INVESTIGATE instead of manufacturing a proposal for every finding.

### Serena and Beads bound two build-vs-integrate decisions

Do not build another generic Markdown memory system: Serena already covers that user need. Project Cognition must justify its extra typed/evidence/freshness structure with measured maintenance outcomes.

Do not build another mature dependency issue database: Beads already covers ready queues, claim/close and multi-agent work graphs. A future integration could emit missing work or evidence as Beads items while leaving terminal adjudication to Goal Governor.

## What this project should not rebuild

- Generic Markdown project memory — use Serena, Kiro or client-native memory.
- A normal spec/plan/tasks pipeline — use Spec Kit, OpenSpec or Kiro.
- Dependency task graphs and multi-agent claiming — use Beads.
- Symbol graphs, repository maps or code search — integrate existing code-intelligence tools.
- A basic read-only planning mode — major coding clients already provide one.
- A loop whose only rule is “continue while a task remains” — Spec Kit Converge already occupies that space.

## Remaining candidate differentiation

Only these areas justify further investment before copying the system to more clients:

1. Reconstruct observed project reality instead of assuming project documents are correct.
2. Represent Known / Likely / Claimed / Unknown / Contradicted with evidence and confidence.
3. Detect stale evidence and invalidate only dependent cognition.
4. Make BUILD / DON'T BUILD / INVESTIGATE a gate before specification.
5. Require outcome evidence for terminal completion.
6. Carry the same cognition, goal and verifier semantics across clients.
7. Mechanically separate Researcher, Planner, Builder, Verifier and Governor authority.

The first four partially exist in the current repository; the fifth is mechanically implemented for DSH; cross-client value and real maintenance effect remain unproven.

## Integration map

```text
Project Cognition
  observed facts · constraints · contradictions · stale beliefs
        ↓ BUILD only
Spec Kit / OpenSpec / Kiro
  desired behavior · plan · implementation tasks
        ↓ optional durable work graph
Beads
  dependencies · ready work · blockers · multi-agent ownership
        ↓ real verifier calls
Goal Governor
  ALREADY_SATISFIED / CONTINUE / NEEDS_HUMAN / DONE / BLOCKED / STOPPED
```

Serena or other code-intelligence/memory services may supply evidence and retrieval underneath Project Cognition. Existing coding clients remain the execution host.

## Evidence gate for competitive claims

Do not claim differentiation merely because schemas or plugins exist. Continue toward a second adapter only if the preregistered experiments show that Research + Governor improves false-DONE rate, invariant/scope violations or unnecessary edits without unacceptable user and token cost. See [goal-governor-evaluation-protocol.md](./goal-governor-evaluation-protocol.md).

If structured dynamic cognition does not outperform an equivalent static project document, retain the useful read-only preset and completion reducer, and drop the “cognition infrastructure” product claim.
