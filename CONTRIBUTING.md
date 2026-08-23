# Contributing

Thanks for helping test a deliberately narrow alpha. The highest-value contributions are reproducible failures, real maintenance outcomes and adapter conformance evidence—not longer prompts or more workflow stages.

## Before opening a change

- Use a Discussion for product direction, comparison questions and unstructured usage reports.
- Use an Issue for a reproducible defect.
- Report authority or sandbox bypasses privately under [SECURITY.md](./SECURITY.md).
- For a large feature, explain which user outcome it improves and what observation could show that it did not work.

## Local verification

Requirements: Node.js `>=22.12` and Git.

```bash
npm test
npm run doctor
npm pack --dry-run
```

The current suite covers portable reducers, CLI behavior, DSH event replay, verifier evidence, Researcher restrictions and host-owned completion. A pull request that changes a public contract must add or update a failure-case test.

## Truth discipline

Keep these distinctions explicit in code, docs and release notes:

- **implemented** is not the same as **tested**;
- **tested in a fixture** is not the same as **observed in a live model session**;
- **observed** is not the same as **causally shown to improve maintenance**;
- a technical mechanism does not establish user adoption;
- failed and invalid experiments remain part of the record.

Do not silently weaken these ratified invariants:

1. Certified Researcher remains read-only.
2. Canonical JSON is the Project Cognition truth; Markdown is generated.
3. A model cannot approve, weaken or complete its own Goal Contract.
4. Invalid experiments cannot be promoted into positive product claims.

Changing an invariant requires an explicit owner-approved cognition revision, a migration note and new boundary tests.

## Pull request checklist

- [ ] The change has a bounded user problem and non-goals.
- [ ] Existing public schemas remain compatible, or the revision/migration is explicit.
- [ ] Security and project-root confinement still fail closed.
- [ ] Tests include the relevant failure path, not only the happy path.
- [ ] README/CHANGELOG/validation claims match the evidence level.
- [ ] `npm run check` and `npm pack --dry-run` pass on the final commit.
