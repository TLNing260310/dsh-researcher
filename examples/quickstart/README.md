# Guided quickstart example

This directory intentionally contains no pre-bound JSON templates. Hashes, Git revision, Project Cognition invariants and verifier definitions belong to the target repository and must not be copied from an example.

Generate a safe, project-bound review workspace instead:

```sh
npx -y --package=github:TLNing260310/dsh-researcher#v0.8.0-alpha.7 project-cognition init .
npx -y --package=github:TLNing260310/dsh-researcher#v0.8.0-alpha.7 project-cognition quickstart --root . --out ../my-project-review-001 --goal-id my-first-goal
```

Open `../my-project-review-001/REVIEW.md`, replace every owner-review marker, and run its complete pinned `npx` commands directly. The selected review directory must be outside this command's `--root`; it need not be outside some unrelated enclosing Git repository. Nothing becomes canonical or executable until the owner separately installs the reviewed verifier and approves the reviewed Goal Contract.

See [`docs/quickstart.md`](../../docs/quickstart.md) for the complete five-minute workflow and safety boundaries.
