# Flask case — run infrastructure notes (append-only)

## N-01 — research_doctor v0.5.2 regression found during smoke test (2026-08-21)

- **Symptom**: headless eval smoke (researcher-quick) — the model's mandatory
  first `research_doctor` call failed with `Error: session is not defined`;
  no Runtime Certificate could be produced.
- **Root cause** (static analysis, confirmed by git history):
  - `researcher/plugins/research-doctor/index.js` — commit 6796609 (v0.5.2)
    added the certificate-history feature: `const session = agent.session`
    is declared INSIDE the try block, while the new line
    `certificateHistory(Array.isArray(session.events) ...)` sits OUTSIDE it.
    `const` is block-scoped, so every execution throws
    `ReferenceError: session is not defined` at that line — even when all
    checks pass. v0.5.0 declared session inside the try and used it only
    inside, so v0.5.0 worked.
  - The unit tests cover `renderCertificate`/`certificateHistory` as pure
    functions, so the execute() path was never exercised.
- **Classification**: infrastructure/plugin crash — protocol §6a infra-audit
  category ("parser crash / runner bug"). NOT a design change: the fix
  hoists the variable and guards it; the certificate contract is unchanged.
- **Fix** (committed): hoist `session` out of the try block; tolerate a null
  session in the history line.
- **Also fixed**: the doctor's Preset check only accepted the literal preset
  id `researcher`; eval variants researcher-quick/researcher-deep (deviation
  D002) are the same preset under a frozen depth override, so the check now
  accepts all three ids (certificate PASS instead of FAIL/UNSAFE).
- **Impact on eval**: without this fix every researcher-mode run would fail
  its own mandatory certificate (and per persona must stop on UNSAFE); the
  fix is a prerequisite for Phase A researcher runs. Lock re-created
  pre-run (preset hash changed).

## N-02 — eval harness patch semantics (2026-08-21)

- The loader's patch entries are rows merged into targets by `id`
  (`applyEntryPatches` in dsh-app-boot): a top-level `- disable: <id>`
  entry has no `id` and is silently skipped ("patch: id is required").
  Correct disable form: `- id: <id>` + `disabled: true`.
- First smoke runs therefore ran TWO runners (shipped headless-runner +
  eval runner) and leaked the host-level `pwsh` tool into researcher agents;
  both fixed via the corrected patch forms and verified by re-smoke.
