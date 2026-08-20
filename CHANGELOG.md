# Changelog

## 0.5.0 (2026-08-20)

Self-verification becomes a capability: the Researcher Runtime Certificate.

- New `research_doctor` tool (plugins/research-doctor): renders a certificate with per-check PASS/WARN/FAIL and an overall SAFE/DEGRADED/UNSAFE verdict. Checks: preset binding (live scope chain), effective sandbox=read-only, approval=never, write/edit resolve to the refusing stubs (mechanically catches the recompose hole), git_read as the only code surface (no pwsh/bash), research_checkpoint availability, and deterministic session-log fold (same log → same state, double-fold equality).
- Persona: run research_doctor at session start and after any environment change; on DEGRADED/UNSAFE, print the certificate and stop until fixed.
- Positioning upgrade: "Evidence-driven Project Intelligence Agent — 基于证据的 AI 项目认知与健康审计 Agent"; new pitch: 防止 AI 在长期开发中逐渐失去项目全局认知. Case Library opened (docs/case-studies/).
- First real-run forensics (the airecimmunity session) drove this release: the methodology and evidence engine worked end-to-end (15 claims with tiers/verdicts, hypothesis dependency graph, Contradicted finding), and the preset-switch (recompose) path was confirmed to bypass creation-time guards — fixed in v0.4.4 and now self-detectable via the certificate.
- Tests: 20 total, all green.

## 0.4.4 (2026-08-20)

Execution-time guard — fixes the recompose hole found in the first real run.

- **The hole**: a session created on another preset and switched to researcher before the first message (preset recompose) joins the standing composition AFTER `agent/created` fired — so the per-agent stubs, prompt shadows, and environment preflight never installed. Forensics on the first real research session confirmed it: real `write` schema (no stub), `danger-full-access` sandbox, guard absent — zero-write was held by persona alone.
- **The fix**: a standing-scope `tools.guard` (layer-based, not event-based) now applies to EVERY agent under this preset regardless of how it joined: `write`/`edit` execution is always denied with the read-only reason, and every other tool is denied until the agent's environment has been verified once (sandbox=read-only, approval=never) — fail-closed at first use. The creation-time preflight remains for stubs/shadowing on the normal path.
- Tests: 17 total, all green (3 new guard-logic tests: env verdict matrix, refusal text, stub shape).

## 0.4.3 (2026-08-19)

Zero-write contract hardening (P0) and real hypothesis versioning.

- **git_read option-injection class closed**: model-controlled `ref` values can no longer smuggle git options (`--output=…` wrote files; `-c`/`-w` re-opened config/object-database vectors) — every revision is validated (no leading `-`, no control characters, length cap); every path is validated, resolved against the repo root, and confined inside it (no `../../outside` reads); all paths go after `--` including `hash-object` (`-w` can no longer become an option). New tests cover `--output=x`, `-c`, `-w`, `../../outside`, control characters.
- **Hypothesis history is real**: hypotheses now keep a version history array (previous statement/status/dependencies per revision, capped at 20), including auto-flips to `invalidated`; the persona's "versioned, not overwritten" claim is now true in the state layer, not just in the prompt. export/import round-trips history.
- Tests: 14 total, all green (5 git_read argument-boundary tests + 2 history tests + 7 reducer tests).
- Roadmap: Golden Research Fixtures (incl. dsh-researcher researching dsh-researcher as Fixture 0 — dogfooding the project's own thesis), Delta Research (corrosion-vs-evolution over commit ranges), StructuralEvidence integration seam.

## 0.4.2 (2026-08-19)

Positioning sharpening (no new mechanisms).

- Core problem reframed: "AI coding 可以在每一步都做对的同时，把整个项目做错" — three failure modes formalized: Local Optimum (米格-25), Context Fidelity, Temporal Drift; the mode's job is maintaining the project-level global optimum.
- Persona/methodology: the **corrosion-vs-evolution question** — every deviation from a convention is interrogated (why did the convention exist, do its reasons still hold) before it counts as a finding; DIAGNOSE now checks candidates for "locally optimal, globally worse".
- Layer positioning: L0/L1 (structural intelligence, architecture memory) are commodity to be INTEGRATED (GitNexus / Serena / Aider RepoMap / Cairn / Drift / Understand Anything); L2 (evidence engine) + L3 (build shaping) are this project's core. New docs/landscape.md with the competitive table and integration strategy.
- Roadmap renumbered: v0.4.3 test/compatibility harness; v0.5 integration seams before any self-built knowledge graph.

## 0.4.1 (2026-08-18)

Correctness hardening — design had outpaced implementation reliability.

- **P0-A — replay bug fixed**: DSH `tool/call` events carry `arguments: string` (the model's raw JSON); the replay loop checked `typeof === 'object'` and silently folded nothing. Now `parseCheckpointArgs` accepts both forms and malformed events fail loudly.
- **P0-B — single reducer**: `applyCheckpoint` (parse + importState + mutation) is the ONE entry point for live execution AND session replay — runtime semantics ≡ replay semantics (real event sourcing).
- **P0-C — export bug fixed**: view export mapped a nonexistent `v.name` (views are keyed by name, not fielded); now uses `Map.entries()`; export→import round-trips (covered by tests).
- **P0-D — material-change invalidation**: hypotheses now dirty their dependents on ANY material change (statement / status / dependencies), not only on → invalidated.
- **P0-E — per-knob environment preflight**: unset → tighten, explicit-safe → keep, explicit-unsafe → refuse, independently for sandbox and approval. No more "explicitly wrong sandbox + missing approval → silently fixed".
- **P1 — pwsh removed; git_read added**: fixed-allowlist read-only git tool (status/log/show/diff/ls-files/blame/rev-parse/hash-object), spawned via execFile with `--no-pager --no-ext-diff --no-textconv`, system/global gitconfig ignored, 30s timeout, output capped. The researcher holds NO arbitrary process-execution primitive at all — the upstream loopback-control-plane class of concerns is answered structurally, not by prompt.
- **Tests + CI**: `tests/research-state.test.js` (7 tests, incl. the replay ≡ live invariant) + `.github/workflows/test.yml` (node --test, Node 22). All green.
- Roadmap: v0.4.2 test/compatibility harness + Golden Research Fixtures; v0.5 cache unified as a Research Dependency Engine.

## 0.4.0 (2026-08-18)

Environment self-containment and state recovery.

- **P0 — environment preflight**: the guard now verifies the session's EFFECTIVE sandbox mode (`sandboxPolicy.resolve`/`overrideOf`) and approval policy (`approval.overrideOf`) on `agent/created`. Explicit wrong configuration (e.g. workspace-write + ask) refuses agent startup with a loud error instead of running the researcher in a writable environment; un-pinned programmatic/child sessions are tightened to read-only + never, never relaxed. The zero-write contract is no longer user-dependent.
- **P1 — research state v2**: `research_checkpoint` claims now carry `confidence`; new `export`/`importState` compact transfer; **session-log auto-replay** — on `agent/created` the plugin rebuilds each agent's state graph by folding its logged `research_checkpoint` tool/call events, so resumed sessions, process restarts, and compaction losses all recover the same reasoning graph. Completion doctrine: a move is complete only when its results are committed to the state (text summaries are not completion).
- **P2/P3 designs adopted as roadmap**: research cache layer keyed by git blob hashes ($DSH_HOME/researcher-cache sidecar, v0.5) and an evaluation benchmark system (architecture-understanding accuracy, BUILD/DON'T BUILD/INVESTIGATE precision, modification-avoidance rate, v0.6) — see docs/roadmap.md.
- README/persona: the four-layer guarantee is now described as self-enforcing (verified and refused, not assumed).

## 0.3.0 (2026-08-18)

Pipeline robustness and zero-write contract hardening.

- **P0 — fail-closed read-only guard**: `tool-restrict` defaults to STRICT mode — stub registration, prompt-shadow installation, and an agent-view preflight (`agent.ctx.tools.get(name, agent)` must resolve to the refusing stubs) all must succeed, or the synchronous `agent/created` listener throws and the session refuses to start. `config.mode: 'compat'` restores degrade-with-warning behavior.
- **P1 — research state plugin** (`plugins/research-state`): `research_checkpoint` tool keeps the claim ledger + hypothesis/view dependency graph per agent in memory, with revision bumping and recursive dependent invalidation (no rollback; hypotheses are versioned, not deleted). Writes only to the DSH session log via the tool call itself — zero filesystem writes. todo_write downgraded to a checkpoint index.
- **P2 — token layer L0→L2**: cartography-only L0, subagent evidence packets at L1 (never raw repo dumps), evidence promotion at L2; compaction tuned (thresholdRatio 0.68, retainRatio 0.12, maxTokens 4096, retries 1/1) and pruner tightened (6144/3072/768).
- Install scripts: dsh version preflight (verified 0.1.0-rc.6; warn otherwise, explain fail-closed behavior).
- Persona/methodology: "RESEARCH STATE — evidence-driven partial invalidation" section; pipeline moves read the current ledger and revisit only dirty views.
- P3 (project intelligence capsule + memory bridge + freshness gates) remains on the roadmap, not shipped.

## 0.2.0 (2026-08-17)

Build-Shaping upgrade, inspired by the AI Engineering Skills Map framework (treated as an industry framework, not a strict law).

- Positioning: epistemic upstream of Plan Mode — "What should we build, if anything?"; four-role loop (Researcher → Plan → Agent → Verifier → back to Researcher).
- Pipeline upgraded to eleven moves: DISCOVER → RECONSTRUCT (project model: Mission/User/Problem/Value mechanism/Architecture/State/Evidence/Constraints) → EVIDENCE MAP (tiers + verdicts Known/Likely/Claimed/Unknown/Contradicted) → DIAGNOSE (Problem-Before-Solution chain; problem→feature jumps forbidden) → TRADEOFF ANALYSIS (12-dimension scanner; no "more engineering = better") → EXTERNAL RESEARCH → COMPARE → CHALLENGE (disconfirmation search + revised hypothesis) → SHAPE → CLASSIFY (BUILD / DON'T BUILD / INVESTIGATE; "unknown" is a legitimate output) → SELF-EVAL (10-item research self-check) → HANDOFF (only BUILD items to Plan).
- Report template v2: project model reconstruction, verdict-carrying claim cards, problem chain + tradeoff tables, classification summary, self-check disclosure.
- Read-only boundary unchanged and strengthened in rationale (goal-drift argument).

## 0.1.0 (2026-08-14)

Initial public release.

- Read-only researcher preset: persona (investigator, eight-move method), read-only toolset, evidence ladder C0–C4.
- `plugins/tool-restrict`: per-agent always-refusing `write`/`edit` stubs + same-name shadowing of the `tool:write` / `tool:edit` / `ui:deliverable-file-references` prompt sections.
