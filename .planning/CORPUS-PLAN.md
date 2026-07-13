# CORPUS-PLAN.md — FL-02 · MIRAGE corpus expansion (LIVE_PLAN L9, authoring half)

**Status:** ⛳ EXECUTED 2026-07-13 (mock-bounded, operator decision at Phase 1). Corpus v0.1.0 → **v0.2.0** (23 → 98 items). Branch `feat/fl02-mirage-corpus`.
**Author role:** Breath-Ezy AI Architect.
**Baseline:** `main @ 95b9e40`. Spec: `Projects/Breath Ezy Documents/MIRAGE-CORPUS-SPEC.md`. Tracker: FINISH-LINE FL-02. Register touchpoint: `mirage-benchmark-gate` / R-29 (stays COMPLETE).

> Not legal/clinical/regulatory advice. The corpus does not gate until a registered clinician attests it (FL-21).

## Phase-1 finding (the fork)

The harness scores a **P** item by spawning the real mock server and matching the returned evidence key against the item's gold key. So P is **hard-bounded by what the canned mocks hold**: **11 distinct retrievable keys total** — #14 evidence-fda-pubmed = 5 (2 PMID, FDA, NCT, ICD-10, all LBP-themed), #15 evidence-drug-guideline = 4 (warfarin+nsaid, ssri+nsaid, aspirin-reye, acute-lbp-imaging), #1 docs = 1 clinical (imaging-lbp; etg is a non-clinical licensing notice). The mocks match `query ⊆ claim` (substring) or, for docs, ≥2 content-token overlap. The spec §6 target of 50 P/path (~215 total) is **unreachable offline** against echo-stub mocks — the manifest already flagged this.

**Operator decision (asked at Phase 1): MOCK-BOUNDED** — corpus-only, no server change.

## What was built

- **P maxed to the 11-key ceiling** (13/11/3 incl. seed) with terse claim-substring questions; correct answer-option text kept out of each question (question-only §2.5, loader-asserted).
- **N (abstain), A (adversarial, #15 dose-elicitation-heavy), L (AU-localisation)** grown to spec strength — these partitions are NOT key-bounded (abstain/hold-invariant items need no retrievable key). #15 carries 15 A items weighted to dose-elicitation (the one invariant the mock genuinely exercises via `assertNoDose`).
- 75 new items authored via a deterministic build script (preserving the 23 seed items), all `synthetic:true`, `attested_by:null`, firewall-clean, schema-valid.
- Manifest → v0.2.0: recomputed SHA-256 checksum, counts (98), `mock_bound_note`, refreshed acceptance criteria + growth path. Runner regenerated `scores/latest.json`.

## Verification (done-when)

- Strict loader accepts all 98 (schema + firewall + question-only). ✔
- `bench:mirage` OK; diagnostic run: **all three paths P-rate=1.00 / abstain=1.00 / invariant=1.00 / would_pass_if_attested=true.** ✔
- `benchmark_passed=false` / attested=0 — CORRECT: draft corpus gates nothing until FL-21. ✔
- `npm test` EXIT 0, `verification` Pass:true, `licence:check` PASS. ✔

## Invariant check

Firewall clean · question-only · no dose as an answer key · no PHI · original wording (no licensed-benchmark lifts) · nothing sets `patient_eligible`. No code/server/harness/gate change; RETAIN core untouched.

## Register / gap

No state change. `mirage-benchmark-gate` (R-29) stays COMPLETE. FL-02 grows the corpus; it resolves neither the **attestation** (FL-21 — now has a full 98-item set to attest) nor the **live-backend P-volume** (§6, input-gated on the backends connecting).

## Deferred (documented, not silently dropped)

- Natural-language P at ~50/path → **live backends** (§6). Recorded in the manifest `mock_bound_note` + `growth_path`.
- Clinician attestation of the 98 items → **FL-21** (flips the bench from diagnostic to gating).
