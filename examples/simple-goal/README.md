# Minimal Simple Goal

This example is schema-valid but deliberately not pre-approved. The all-zero hashes are placeholders: approval must bind the current project's actual Cognition and Verifier Registry.

From the target repository:

```bash
project-cognition init .
project-cognition goal recommend examples/simple-goal/risk.json
project-cognition verifier install examples/simple-goal/verifier-draft.json --root . --replace
```

The verifier install command prints the sealed `registry_hash`. Read `.project-cognition/state.json` for `state_hash`, then copy `goal-draft.json` into your own project and replace:

- `verifier_registry_hash` with the installed registry hash;
- `baseline.cognition_hash` with the current state hash;
- `baseline.repo_revision` with the current Git revision;
- the intent, target, scope and criterion with the real bounded task.

Then validate, inspect and approve:

```bash
project-cognition goal validate goal-draft.json
project-cognition goal approve goal-draft.json --actor <human-name> --root .
project-cognition goal show .project-cognition/goals/example-simple-fix.r1.json
```

Approval fails if either installed hash differs. In Governed Coding, bind the emitted approved file with `/researcher run <path>`.

Use Governed mode instead when the task touches architecture, security, public APIs, migrations, hard invariants, subjective acceptance, ambiguous targets or more than two expected attempts.
