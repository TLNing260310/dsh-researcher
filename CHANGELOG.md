# Changelog

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
