# Contributing

Thanks for helping test a deliberately narrow alpha. The highest-value contributions are reproducible failures, real maintenance outcomes and adapter conformance evidence—not longer prompts or more workflow stages.

## Before opening a change

- Use a Discussion for product direction, comparison questions and unstructured usage reports.
- Use an Issue for a reproducible defect.
- Report authority or sandbox bypasses privately under [SECURITY.md](./SECURITY.md).
- For a large feature, explain which user outcome it improves and what observation could show that it did not work.

## Local verification

Requirements: Node.js `>=22.12.0` and Git. Full DSH install/package lifecycle tests require DSH's runtime range, `^22.19.0 || >=24.0.0`; the Node 22.12 CI lane runs the portable suite and explicitly skips those integration-only tests.

```bash
npm test
npm run doctor
npm run eval:e1:preflight
npm pack --dry-run
```

The E1 preflight is offline: it validates the protocol-defined frozen manifest, materializes each fixture twice and performs no network or model calls. Live E1 is a separate, explicitly acknowledged evaluation and must never be substituted for preflight in routine CI.

The current suite covers portable reducers, CLI behavior, DSH event replay, verifier evidence, Researcher restrictions and host-owned completion. A pull request that changes a public contract must add or update a failure-case test.

Release candidates use the offline artifact gate from an empty directory outside the repository:

```bash
git rev-parse HEAD
npm run release:artifacts -- --out <external-empty-directory> --expected-version <package.json-version> --expected-revision <full-git-object-id-from-above> --require-clean
```

The builder samples Git revision and worktree cleanliness before and after `npm pack`, fails if either changes, and records both in `package-manifest.json`. Build only after the final commit from a clean worktree. Publish the generated tarball together with `SHA256SUMS` and `package-manifest.json`; do not rebuild only one asset after review because the three files are one release evidence set.

## Truth discipline

Keep these distinctions explicit in code, docs and release notes:

- **implemented** is not the same as **tested**;
- **tested in a fixture** is not the same as **observed in a live model session**;
- **observed** is not the same as **causally shown to improve maintenance**;
- a technical mechanism does not establish user adoption;
- failed and invalid experiments remain part of the record;
- Goal Contract v1 boundary strings are semantic constraints, not a generic runtime filesystem allowlist; only the frozen E1 `allowed_changes` path contract is mechanically scored today;
- a verified bundle signature proves that the private key corresponding to the supplied public key signed those bytes; it does not identify the key holder, prove that a client ran, or make an outcome claim causal.

Do not silently weaken these ratified invariants:

1. **I1:** Certified Researcher remains read-only.
2. **I2:** Canonical JSON is the Project Cognition truth; Markdown is generated.
3. **I3:** A model cannot approve, weaken or complete its own Goal Contract.
4. **I4:** Invalid experiments cannot be promoted into positive product claims.
5. **I5:** A recorded goal terminal decision must equal the host reducer result derived from its preceding trusted evidence; terminal prose or labels cannot override the reducer.

Changing an invariant requires an explicit owner-approved cognition revision, a migration note and new boundary tests.

## Pull request checklist

- [ ] The change has a bounded user problem and non-goals.
- [ ] Existing public schemas remain compatible, or the revision/migration is explicit.
- [ ] Security and project-root confinement still fail closed.
- [ ] Tests include the relevant failure path, not only the happy path.
- [ ] README/CHANGELOG/validation claims match the evidence level.
- [ ] `npm run check` and `npm pack --dry-run` pass on the final commit.
