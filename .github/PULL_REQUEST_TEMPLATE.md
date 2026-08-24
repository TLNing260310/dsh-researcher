## Problem and bounded outcome

<!-- What user-visible problem does this solve? What is explicitly out of scope? -->

## Evidence

<!-- Tests, reproduction, live observation, or experiment. State the evidence level honestly. -->

## Authority and compatibility review

- [ ] Researcher remains read-only and project-root confined.
- [ ] Models still cannot approve or complete their own Goal Contracts.
- [ ] I5 remains true: recorded goal terminal decisions equal the host reducer result derived from preceding trusted evidence; terminal prose or labels cannot override it.
- [ ] Goal Contract v1 boundary text is not presented as generic hard path enforcement; any machine path scope has an explicit adapter/schema contract.
- [ ] Schema/API changes have an explicit revision or migration.
- [ ] Invalid or negative evidence remains visible.

## Verification

- [ ] `npm test`
- [ ] `npm run doctor`
- [ ] `npm run eval:e1:preflight` (offline; zero model/network calls)
- [ ] `npm pack --dry-run`
