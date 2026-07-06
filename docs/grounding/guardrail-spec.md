# Breath-Ezy Evidence-First Guardrail Spec

**Document ID:** `heydoc-grounding:guardrail-spec:2026-07`
**Version:** 1.0.0
**Generated:** 2026-07-06 (FLOW_PLAN milestone H2)
**Source pattern:** 2023Anita/clinical-ai-agent-skills (#9) — evidence-first rulebook. **PATTERN-LIFT, SPEC ONLY.**

> **This is a written specification, not code.** No code was lifted, read for
> implementation, forked, or vendored from #9 (its on-repo licence is unconfirmed
> — `licence_status: pending` in `integration/harvest-manifest.json`; it is
> non-shippable and reference-only). This document codifies the evidence-first
> rules the Breath-Ezy grounding stack already enforces mechanically, so the rules
> are legible in one place and the next agent can check code against them. Where a
> rule names an enforcement point, that point is existing first-party code — this
> spec describes it, it does not add it.

---

## Purpose

Harvested evidence taps (#1 docs override, #14 evidence-fda-pubmed, #15
evidence-drug-guideline) turn empty stubs into real retrieval. Retrieval that is
not disciplined is a fabrication surface. This spec states the rules every
evidence path obeys, each mapped to the mechanical enforcement point that makes it
true. It is subordinate to `CLAUDE.md` `<non_negotiable_invariants>`,
`.planning/ARCH_PLAN.md` §1, and `.planning/FLOW_PLAN.md` §1 — where any of those
and this spec disagree, they win and this file is the defect.

---

## The rules

### G-1 — Every claim is grounded on a receipt or citation
An evidence result may enter the pipeline only as an `EvidenceNode` whose
`supports[]` carries at least one real artifact. For a live/mock tool call that is
`kind:"live_data_receipt"` with `ref` = the Receipt `request_id`; for a static doc
it is `kind:"static_doc"` with a `docs.cite` citation_id. No `supports`, no claim.
**Enforcement:** `mcp/schemas/evidence-node.schema.json` (`supports minItems 1`);
`mcp/servers/_shared/evidence-map.js` (`toEvidenceNode` throws without a receipt);
the verifier binds the ref at Step 5.

### G-2 — Evidence is advisory; it is never a dose source
Drug-interaction / paediatric / guideline output (#15) is advisory context. It is
**structurally barred** from carrying a dose. Doses come from exactly one place —
the pharmacology firewall's deterministic PharmCheck (Trunk 8.0, ARCH C2).
**Enforcement:** `evidence-drug-guideline` results are a `.strict()` schema with
`advisory:true` required and no dose field expressible; `assertNoDose()` throws on
any dose-shaped key; the `advisory_dose_leak` integrity detector fails any
advisory text that carries a dosing instruction; verifier check 5 gates HARD_FAIL.

### G-3 — No fabricated codes
A SNOMED/ICD-10-AM/ICD-11/LOINC/PBS/AMT code appears in trunk output only when a
terminology-lookup receipt validated it. An evidence tap that mentions a code
(e.g. "ICD-10 M54.5") supplies advisory reference text, **not** a code binding —
binding still requires a terminology receipt.
**Enforcement:** `verifier.js` checks 1 (per-code binding); evidence servers never
populate `snomed_ref` and never claim a terminology receipt.

### G-4 — No fabricated operational facts
IHI, lab values, pharmacy stock, ECG results come only from a live-data receipt.
Retrieved public literature is **not** an operational fact and never substitutes
for one.
**Enforcement:** `verifier.js` check 3; the investigation parser (C3) for labs.

### G-5 — No raw lab numbers to the LLM
Evidence retrieval returns public literature, not patient observations, so it adds
no lab path. Any patient observation (from FHIR ingest) still crosses the
investigation parser before injection; a raw number never reaches a trunk.
**Enforcement:** `investigation-parser.js` (C3); ContextPacket `superRefine` gate.

### G-6 — Mock is never presented as live
Every evidence path defaults to `mode:mock` and is deterministic. A live context
with no configured endpoint BLOCKS rather than serving mock under a live receipt.
**Enforcement:** the mode-normaliser (C16, `verification/mode.js`); each server's
`choose*Route()` returns `blocked` on a live context with no endpoint.

### G-7 — No path is trusted until it is benchmarked
"It runs" is not "it is safe to show." Every retrieval/answer path is
`patient_eligible:false` until the H3 MIRAGE benchmark (#20) scores it at/above
threshold. H2 ships all evidence paths mock-gated and non-eligible.
**Enforcement:** `PATIENT_ELIGIBLE = false` exported and asserted; H3 wires
`bench-mirage-gate.js` as a blocking CI job (not yet built — H3 is blocked on
#20's licence).

### G-8 — No invented service names
Only the names in the Allowed Service Registry may appear in trunk output.
Harvested server names enter the registry explicitly or are rejected.
**Enforcement:** `verifier.js` check 4 (`ALLOWED_SERVICE_NAMES`).

### G-9 — Integrity detectors strengthen, never loosen
The #8-pattern detectors add machine-decided checks (fabricated citation marker,
unsupported statistic, advisory dose leak, overconfident diagnosis). They compose
with the verifier by a monotone AND — they can only add a failure, never rescue
one; the verifier's five checks are unchanged.
**Enforcement:** `verification/integrity-detectors/` + `combineVerification()`;
`test/contract-integrity-detectors.js` asserts monotonicity.

### G-10 — Licence floor holds on every shippable path
No unresolved-licence dependency enters a shippable path. Only MIT/first-party
evidence taps are wrapped at H2; a pending-licence repo (#18) is refused by the
gate and left unbuilt.
**Enforcement:** `scripts/check-licence-clearance.mjs` (CI-blocking); the wrap is
an external pinned process with no vendored code.

### G-11 — Augmented, not autonomous
Every diagnostic output is provisional and requires clinician confirmation; no
evidence tap diagnoses, prescribes, or finalises care. The clinician-verification
gate (C9) is the release checkpoint every patient path crosses.
**Enforcement:** the `overconfident_diagnosis` detector (warning); the portal gate
(`portal/verification-gate.js`) refuses release without an attested decision.

---

## Non-goals

- This spec does not add runtime behaviour; it names existing enforcement points.
- It does not authorise wrapping #9 (or any pending-licence repo) — adoption is
  separately plan-gated and licence-gated.
- It does not mark any path trusted — trust is the H3 MIRAGE gate's to confer.
