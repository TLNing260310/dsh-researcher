# Five-minute guided setup

The guided setup creates a review workspace for one bounded Goal Contract. It removes manual hash copying while preserving every authority boundary:

- `.project-cognition/state.json` remains the only canonical project truth;
- review artifacts must live outside the selected project root;
- the initial Goal draft is deliberately not approvable;
- no Verifier Registry is installed automatically;
- no Goal Contract is approved automatically;
- no Project Cognition draft is sealed or installed automatically.

This workflow prepares a decision. It does not make the decision for the owner.

The examples below use the short executable name. If the package is not
installed globally, invoke the exact release without installing a permanent
CLI by prefixing each command with:

```text
npx -y --package=github:TLNing260310/dsh-researcher#v0.8.0-alpha.7 project-cognition
```

## 1. Initialize once

From the target repository:

```sh
npx -y --package=github:TLNing260310/dsh-researcher#v0.8.0-alpha.7 project-cognition init .
```

`init` creates the initial sealed canonical state, its generated Markdown projection, an empty Verifier Registry and the Goal Contract directory. Re-running it validates and preserves existing canonical artifacts.

## 2. Generate one external review workspace

Use a new path outside the `--root` selected for this project review:

```text
npx -y --package=github:TLNing260310/dsh-researcher#v0.8.0-alpha.7 project-cognition quickstart --root . --out ../project-review-001 --goal-id fix-session-resume
```

The command is intentionally one line so it can be pasted into PowerShell or a POSIX shell.

The default is `governed` mode because an unknown task should not silently receive the weaker path. For a localized task with a clear target, deterministic verifier, no architecture/security/public-API/migration/invariant impact, and at most two expected attempts, an owner may choose:

```text
npx -y --package=github:TLNing260310/dsh-researcher#v0.8.0-alpha.7 project-cognition quickstart --root . --out ../project-review-002 --goal-id fix-local-parser --mode simple
```

The CLI infers a conservative test command when it finds a Node, Cargo, Go or pytest project. Otherwise provide the exact verifier invocation explicitly:

```text
npx -y --package=github:TLNing260310/dsh-researcher#v0.8.0-alpha.7 project-cognition quickstart --root . --out ../project-review-003 --goal-id verify-release-build --verify-command "npm run check"
```

Generation does not execute the verifier or contact a model or network service.

The generated manifest freezes the current canonical upstream GitHub tag and `REVIEW.md` renders every follow-up as a complete command such as:

```sh
npx -y --package=github:TLNing260310/dsh-researcher#v0.8.0-alpha.7 project-cognition quickstart sync ../project-review-001 --root .
```

README users therefore do not need a global install or need to prepend six commands manually. The binding is fail-closed during `sync`. A fork must publish and review its own pinned package identity; hand-editing the generated CLI binding is rejected.

Quickstart reuses an installed verifier only when the entry contains exactly one invocation, its tool and complete canonical arguments exactly equal the selected `{ "command": ... }`, and its result policy exactly matches the fail-closed shell failure-marker policy. An entry with extra arguments, multiple invocations or a looser policy is never reused. Otherwise quickstart proposes an exact-next registry draft. This prevents an additional permissive invocation from becoming false-DONE evidence while still avoiding needless Registry drift for a genuinely identical verifier.

## 3. Review what was generated

The external directory contains:

| Artifact | Role | Authority |
| --- | --- | --- |
| `cognition.rN.draft.json` | Optional candidate for durable project facts | Provisional; never canonical until owner review, seal and install |
| `verifiers.rN.draft.json` | Exact tool invocation and result policy proposed for completion evidence | Provisional; not installed |
| `goal.<id>.r1.draft.json` | Problem, value, target, MUST evidence, scope, invariants, budget and human gates | Provisional; not executable |
| `quickstart-review.json` | Generated filenames, selected-project identity, pinned CLI package and hash baselines used by `sync` | Review metadata; not project truth |
| `REVIEW.md` | Exact, path-filled next commands and review checklist | Guidance only |

Replace every `[OWNER REVIEW REQUIRED]` value in the Goal draft. In particular, make these statements independently understandable:

1. What concrete problem exists?
2. Who benefits, and why is the change worth making?
3. What observable state means the work is finished?
4. What frozen tool result proves each MUST criterion?
5. Which files or behavior may change, and which may not?
6. Which hard Project Cognition invariants apply?
7. After how many failed or no-progress attempts must work stop?

Review the verifier as executable authority. The command, complete arguments and result policy must describe the real check, not a convenient approximation. The CLI never runs this command during setup.

The Cognition draft is optional. Leave it unchanged and do not promote it when the task has discovered no durable project fact. A Goal Contract does not require a new Cognition revision.

## 4. Synchronize bindings without copying hashes

After editing:

```sh
npx -y --package=github:TLNing260310/dsh-researcher#v0.8.0-alpha.7 project-cognition quickstart sync ../project-review-001 --root .
```

`sync`:

- refuses unresolved review markers;
- validates all three drafts;
- fails if canonical Cognition or the installed Verifier Registry changed outside this review;
- calculates the proposed Verifier Registry hash from the reviewed invocation;
- reads the current canonical Cognition hash and Git revision;
- updates only the external Goal draft and review metadata.

It does not install, seal, approve or execute anything. If the repository has no Git `HEAD`, pass an explicit, meaningful baseline with `--repo-revision`.

## 5. Optional Cognition promotion

Only when the Cognition draft contains durable facts the owner accepts, follow the exact `diff → seal → install` commands generated in `REVIEW.md`. Then run `quickstart sync` again so the Goal draft binds the newly installed canonical hash.

Do not promote task notes, model guesses or temporary implementation details. The permitted flow remains:

```text
Research Session Ledger
  → draft cognition revision
  → owner review
  → seal
  → install
  → regenerated projection
```

The CLI actor label is not identity authentication. Owner identity and approval remain repository-governance responsibilities.

## 6. Install the verifier and explicitly approve the goal

Use the exact paths printed in `REVIEW.md`:

```sh
npx -y --package=github:TLNing260310/dsh-researcher#v0.8.0-alpha.7 project-cognition verifier seal ../project-review-001/verifiers.rN.draft.json
npx -y --package=github:TLNing260310/dsh-researcher#v0.8.0-alpha.7 project-cognition verifier install ../project-review-001/verifiers.rN.draft.json --root . --replace --expect-current-hash <reviewed-base-verifier-registry-hash>
npx -y --package=github:TLNing260310/dsh-researcher#v0.8.0-alpha.7 project-cognition quickstart sync ../project-review-001 --root .
npx -y --package=github:TLNing260310/dsh-researcher#v0.8.0-alpha.7 project-cognition goal validate ../project-review-001/goal.fix-session-resume.r1.draft.json
npx -y --package=github:TLNing260310/dsh-researcher#v0.8.0-alpha.7 project-cognition goal approve ../project-review-001/goal.fix-session-resume.r1.draft.json --actor OWNER_NAME --root .
npx -y --package=github:TLNing260310/dsh-researcher#v0.8.0-alpha.7 project-cognition doctor .
```

The generated `REVIEW.md` fills `<reviewed-base-verifier-registry-hash>` automatically. Registry installation uses this hash as compare-and-swap and accepts only the exact next revision; a concurrent Registry change is rejected without overwrite. The second `sync` reports `approval_ready: true` only when the installed registry equals the reviewed proposal. When generation reports `verifier_reused: true`, the exact registry was already installed and `REVIEW.md` omits the replacement command. The final approval still rechecks current Cognition, Registry, invariants and revision lineage. Only `goal approve` writes an approved contract under `.project-cognition/goals/`.

`quickstart-review.json` also binds the canonical real path and filesystem identity of the project root used at generation. `sync` refuses another checkout even when both selected roots happen to have identical initial Cognition and Registry hashes. Every declared artifact path—including the optional sealed Cognition output—is confined to the review directory and must be unique; the manifest itself must remain the actual `quickstart-review.json`.

In the DSH Governed Coding preset, bind the exact approved contract path printed by the approval command:

```text
/researcher run .project-cognition/goals/<encoded-goal-id>.r1.json
```

## When to stop setup

Setup is complete when the owner can answer the seven review questions, the verifier is exact, `sync` reports ready after installation, explicit approval succeeds and `doctor` passes. Do not add more criteria or abstractions merely because more detail is possible.

Reject or archive the review workspace instead of approving it when the target cannot be made observable, the verifier does not prove the target, scope remains ambiguous, or the expected value does not justify the governance cost.
