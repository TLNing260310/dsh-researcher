# dsh-researcher — mature project introduction

## One sentence

`dsh-researcher` helps an AI coding workflow recover what a project is, freeze what this task must achieve, and stop only when host-observed evidence says it is done.

## Short description

AI coding is no longer limited by how quickly a model can write code. The harder problem is continuity: a new session re-guesses why the system exists, local improvements cross old architecture boundaries, and neither the agent nor the person has a stable answer to “when should we stop?”

`dsh-researcher` is an experimental Project Cognition and Goal Governance layer for DeepSeek Harness. It separates two jobs that ordinary Plan mode usually mixes together:

- **Project Research** is designed to reconstruct project purpose, architecture, constraints, risks and unknowns in a constrained read-only session.
- **Goal Governor** freezes the target state, MUST criteria, scope, budget and human gates, then lets the host—not assistant prose—derive `CONTINUE`, `NEEDS_HUMAN`, `DONE` or `STOPPED` from trusted events.

The two layers are independent. A user can try the Research preset without adopting Goal Contracts, and can use the portable Cognition/Goal CLI without claiming that every client already enforces the same runtime semantics.

## The user story

Imagine asking an agent to fix a timeout. The first patch looks plausible. Tests pass, so the agent also “cleans up” adjacent code. It changes a retry rule, then a public type, then the architecture that made the original system safe. None of those edits is obviously absurd in isolation. The failure is that the session never froze three things: why the project was designed this way, what the timeout task actually needed to achieve, and what evidence was sufficient to stop.

With `dsh-researcher`, the intended flow is different:

```text
recover project reality
        ↓ owner reviews durable facts
freeze target + boundaries + stop budget
        ↓ agent executes
host observes verifier calls and results
        ↓
CONTINUE / NEEDS_HUMAN / DONE / STOPPED
```

Project Cognition is not a bag of model memories. `.project-cognition/state.json` is the single canonical truth; the workflow never promotes session findings automatically. The certified Researcher is read-only, while promotion remains an owner-governance act: review a draft, seal/install the next revision and regenerate the projection. The CLI actor label and local compare-and-swap checks do not authenticate a human identity, so repository governance must keep that authority outside the model workflow.

A Goal Contract is not another task list. A Plan answers “what steps might I take?” The contract answers “what observable state must exist, what must not change, who can prove it, and how much effort is allowed before we stop?” A frozen verifier is bound by tool name, full arguments and hash. The final assistant message is never enough on its own.

## What a user can try today

- Install the `researcher` and `governed` presets with a dry-run, automatic backup, uninstall and rollback path.
- Open an isolated Project Research session whose runtime certificate checks the read-only boundary before research begins.
- Generate an external, review-first Cognition/Verifier/Goal scaffold without manually moving hashes and without silently approving anything.
- Run a 60-second offline demo that starts real verifier child processes: confidence alone yields `CONTINUE`, exit code `1` yields `CONTINUE`, and matching exit code `0` after a bounded repair yields `DONE`.
- Run all schemas, reducers, adversarial replay tests, package smoke and E1 preflight without a model call or network access.

## Why this is still alpha

The repository has evidence that its mechanisms exist and reject several classes of false evidence. It does **not** yet have evidence that the whole workflow improves real maintenance outcomes enough to justify its ceremony. Two local 14B Project Research probes also failed to produce a useful report; the runtime rejected unsafe or uncertified output, but safety was not the same thing as intelligence.

Accordingly, the honest maturity labels are:

- Project Research: **isolated trial**, with runtime safety evidence and mixed model outcomes.
- Goal Governor: **advanced experimental**, with mechanical evidence, a frozen v1.4 partial live result, and v1.5 Live E1 still not run.
- Long-term Project Cognition value: **hypothesis**.
- Codex, Claude Code, Zed/Zcode and OpenClaw compatibility: **not delivered** until a second adapter passes conformance.

The next meaningful proof is not another feature. It is a legitimate Live E1 evidence bundle, followed by a small non-inferential user pilot and then a preregistered comparison. If those results do not show enough value, the project should remain a research prototype rather than expanding its claims.

## Suggested GitHub About text

Read-only repository research, durable project memory, and evidence-gated definitions of done for AI coding agents. DSH adapter; experimental alpha.
