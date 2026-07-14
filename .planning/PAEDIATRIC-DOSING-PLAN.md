# Paediatric dosing — PLAN (awaiting Phase 2 approval)

> Mode: IDE Planner. Produced 2026-07-15 at `main @ e2b940e`. **Nothing here authorises code.**
> Operator direction 2026-07-15: *"pipeline paediatric dosing with provisioning — requires verification
> with body metric measuring devices and/or attestation of weight and height with patient's parent or
> legal guardian."*
> Companion: `.planning/DOSE-GUIDANCE-PLAN.md` (adult, C0–C4). **This plan depends on that one landing first.**

## Corrections to my own prior claims (all four found during this research pass)

I argued against this change partly on facts that turned out to be wrong. On the record:

1. **"There is no weight field."** **Wrong.** `patient_weight_kg: z.number().optional()` is already in the
   **frozen** `pharm-intent` contract (`schemas.js:57`, `pharm-intent.schema.json:292`).
2. **"This needs a HIST-2 amendment."** **Wrong, and this is the big one — see §1.** HIST-2's
   string-preserving bar governs the **context-packet path** (what the *LLM* sees). The engine reads a
   different path entirely. **No HIST-2 amendment is required, and none should be made.**
3. **"You cannot validate against a case set with no paediatric cases."** **Wrong.** **19 under-18 cases
   exist** in the 303-case set (ages 0, 0, 2, 3, 4, 6×4, 7×3, 8, 9, 14, 15, 16×3). This creates a
   *different* problem — see §4.
4. **"The Clinician Verification Portal isn't built."** **Wrong.** It is `PARTIAL`, not `UNBUILT`:
   `portal/verification-gate.js`, `portal/server.js`, `portal/gate-record-store.js` exist and
   `releaseToPatient()` is already the adoption seam. It needs a WORM adapter + a live IdP (R-39/FL-43).

What survives from my objection is narrower and still binding: the **device path does not exist**,
`height` does not exist, the `and/or` collapses to `or`, and the enabling decisions are the operator's
and the regulator's. The build itself is cleaner than I claimed.

## 1. The key finding: the frozen contract already anticipated this

There are **two distinct paths**, and conflating them is what made me over-refuse:

| | Path | Consumer | Rule |
|---|---|---|---|
| **1** | `01.objective_data_offered` → `context-allowlist.splitVitals()` → `FactSchema` | **the trunk LLM's context packet** | **HIST-2 string-preserving.** `context-allowlist.js:147` mechanically rejects any non-string: *"structured/raw values are not accepted on this path"*. **Do not touch.** |
| **2** | `PharmIntent.clinical_context.patient_weight_kg` + `resolved` facts | **the deterministic engine** | already numeric — `egfr_ml_min` is the precedent |

HIST-2 exists so **raw numbers never reach the LLM**. The engine is deterministic code — the entire
architecture is "the LLM must not mint values; deterministic code computes them from receipted facts."
A weight reaching the *engine* as a number is not the violation HIST-2 was written to prevent.
Paediatric weight flows on **path 2, never path 1**. Path 1 stays byte-unchanged.

**And the frozen contract was built for this:**
- `pharm-intent` already carries `patient_weight_kg` as a **number**.
- `pharm-check`'s frozen `flag_type` enum already contains **`age_paediatric_weight_based`** — it
  literally names weight-based paediatric dosing.

⇒ **No frozen-contract amendment is needed.** (Which matters: FL-30 ruling 5b *refused* to amend the
frozen contract for `schedule_check`. This plan does not ask for what that ruling denied.)
**Only `engine.js` hard-fails.** The contract has been waiting.

## 2. The gap that is real: a bare number has no provenance

`patient_weight_kg: 18` says nothing about *where 18 came from*. The engine cannot give a
device-measured weight and a guardian's estimate different treatment if they arrive identical. **That
is the whole safety question of this feature, and the contract cannot currently express it.**

Fix in `resolved` — the orchestrator-supplied facts object, which is **not frozen** (`egfr_ml_min` is
the precedent for a numeric clinical input there):

```js
resolved.body_metrics = {
  weight_kg,  height_cm?,                                  // height only present when measured
  provenance: "device_measured" | "guardian_attested",     // the ONLY two values
  receipt_id?,          // REQUIRED iff device_measured — a device reading is a live-data receipt
  attested_by?,         // guardian/legal-guardian ref, REQUIRED iff guardian_attested
  measured_utc,
}
```
Refinements (mechanical): `device_measured` ⇒ `receipt_id` required (no receipt, no device claim —
this is what stops a guardian estimate being relabelled as a device reading). `guardian_attested` ⇒
`attested_by` required and `receipt_id` **forbidden**.

## 3. Engine semantics — and how the `and/or` stops collapsing

Today: `age < 18` → `HARD_FAIL`, unconditionally. Proposed, **behind a default-OFF flag**:

| Age | Body metrics | `age_appropriateness_check` | Dose? |
|---|---|---|---|
| ≥18 | — | unchanged | unchanged |
| <18 | **absent** | `NOT_RUN` → `BLOCKED_NO_PROOF` | no — asks for the metric |
| <18 | **`guardian_attested`** | **`WARN`** + `age_paediatric_weight_based` flag | dose proposed, **stamped as resting on an unverified metric** |
| <18 | **`device_measured`** + receipt | `PASS` | dose proposed |
| <18 | BSA drug, `height_cm` absent | `NOT_RUN` | no — uncomputable |
| <18 | APF refer-out entry (14 of 232) | `HARD_FAIL` | no — specialist referral |
| <18 | both present, **disagree > tolerance** | `HARD_FAIL` | no |

**This is what makes your `and/or` not collapse to `or`.** Both are accepted, but they are not
equivalent: attestation-only can never reach `PASS`. The clinician always sees which one they got.
When both exist they cross-check — agreement corroborates, divergence blocks. That is the repo's own
idiom (OpenCDS A/B parity, the AMASS dose gate): two independent sources, either may block, neither may
rescue.

**Flag:** `PHARM_PAEDIATRIC` in `config/flags.js`, default **OFF** → engine keeps today's blanket
HARD_FAIL byte-for-byte. Mirrors the `AU_OSS_CDS` third-state pattern. Lets P1–P3 build and test with
**zero** production behaviour change.

## 4. The problem the 19 cases create (this is the real cost)

19 under-18 cases exist and are **clinician-attested**. Their `12_management_plan_node` encodes expected
management — which today can only be *escalate / in-person review*, because that is all the engine can do.

**Enabling paediatric dosing changes what those 19 cases should expect.** They do not just keep passing;
their ground truth becomes wrong. That means **re-authoring and re-attesting 19 sealed bundles** —
clinician work, and it is the largest hidden cost in this plan.

*(I did not read `10`–`13` for any of the above. The age values were read from `00`/`01` only. The
scoring-store firewall is intact and this plan does not touch it — the re-authoring is a clinician act
in the case-authoring flow, never an agent read.)*

## 5. Topology impact

**Trunks:** none. **Schemas:** **no frozen change** (§1). **Servers:** `pharmacology` engine only.
**Context packet:** **untouched** — path 1 stays byte-identical; `context-allowlist.js` is not edited.
**Receipts:** a `device_measured` metric is a live-data receipt (`fhir-broker`/device); `guardian_attested`
carries none by construction and is marked unverified end to end.
**Blast radius while `PHARM_PAEDIATRIC=OFF`: zero.**

## Phases

### P0 — Contract + provenance design `[ENG, un-gated]`
`resolved.body_metrics` zod schema + refinements; `PHARM_PAEDIATRIC` flag (default OFF).
**Verify:** unit tests — `device_measured` without `receipt_id` **fails**; `guardian_attested` with a
`receipt_id` **fails**; flag OFF ⇒ engine output byte-identical to today across the existing suite.

### P1 — Engine semantics `[ENG, un-gated, flag OFF]`
Implement the §3 table behind the flag. `contract-pharm-paediatric` covering every row, including
divergence → HARD_FAIL and BSA-without-height → NOT_RUN.
**Verify:** new suite green; **`contract-pharm-validation` (20/20 + 8/8 adversarial) unchanged**; frozen
`pharm-intent`/`pharm-check`/`verification-gate.js` byte-unchanged vs `e2b940e`.

### P2 — Paediatric KB `[ENG tooling; DATA is KL's]`
Extend `DoseGuidanceSchema` with `paediatric_dose` + `dose_basis: "fixed"|"per_kg"|"per_m2"|"refer_out"`.
Pull the Tier A paediatric rows from KL's transcription through the **same Channel B + AMASS
cross-check + review queue** as the adult pipeline. The 14 refer-out entries author as `refer_out` —
they carry no number and can only produce HARD_FAIL.
**Verify:** a `per_m2` record with no height source is provably unusable; refer-out records provably
cannot emit a dose.

### P3 — Evaluation `[ENG + CLINICIAN]`
Re-author + re-attest the 19 under-18 cases against the new expected behaviour. Run the case gate.
**Verify:** case pass ≥0.70, case-set ≥80%, **zero critical under-triage** (paediatric under-triage is
the acceptance bar here, weighted 3×), ≥90% verification compliance.

### P4 — Enablement `[OPERATOR + REGULATORY — the gate]`
`PHARM_PAEDIATRIC=ON` **only** when all of: CLAUDE.md hard limit amended; FL-50 intended-use/class
assessment returned; **Portal blocker #2 green** (WORM adapter + live IdP — the clinician-disposes
control is the entire justification for accepting a guardian-attested weight); and a device path exists
if `device_measured` is to ever be reachable.

## Verification summary

| Milestone | Proof | Expected |
|---|---|---|
| P0 | provenance unit tests; full suite with flag OFF | green; byte-identical output |
| P1 | `contract-pharm-paediatric`; `contract-pharm-validation`; frozen byte diff | green; empty diff |
| P2 | KB fixtures (per_m2, refer_out) | green; no dose from either |
| P3 | `eval-case-gate` incl. the 19 re-authored | thresholds met; zero critical under-triage |
| P4 | operator + regulatory rulings on record | — |

## Invariant check
**Preserved.** *No dosages from the LLM:* doses still come only from the engine reading the signed KB;
the LLM never sees a metric number (path 1 untouched). *No autonomous prescription:* `required_human_review`
stays true; P4 makes the clinician control real before enablement. *Raw values never in LLM context:*
HIST-2 **unamended**; `context-allowlist.js:147` untouched. *Fail-safe default:* absent metric →
`BLOCKED_NO_PROOF`; flag OFF → today's HARD_FAIL. *Conservative safety-netting:* attestation-only can
never PASS; divergence blocks; refer-out and BSA-without-height cannot dose. *Scoring-store firewall:*
intact — §4 reads `00`/`01` only. *Australian jurisdiction:* APF22 facts, AMASS verification-only.
**Nothing is patient-facing while the flag is OFF.**

## Register / gap impact
**Opens:** `paediatric-dosing-gated` (Medium while OFF; **`blocks_patient_facing: true` at P4**), plus a
sub-item for the 19-case re-attestation. **Closes:** none. **Corrects:** the CLAUDE.md population-scope
line ("no paediatric dosing tables exist") — **false once P2 lands**; it must be amended in the same
phase or it becomes a `STALE` derived claim in the standing prompt.
**Gap-register:** does not move; blocker #1 and #2 stay RED.

## New dependencies
None. A future connected-device integration is **out of scope** and would be its own plan.

## Decisions needed before Phase 3 (GATE)

- **D-PD-1 — Approve the asymmetry.** `guardian_attested` → WARN, never PASS; `device_measured` → PASS.
  This is the change to your `and/or` and the spine of the plan.
- **D-PD-2 — Accept that P4 is Portal-gated.** Guardian-attested dosing is defensible *because* a
  clinician disposes. Blocker #2 is what makes that real rather than intended. Build now, enable later.
- **D-PD-3 — Accept the 19-case re-attestation cost** (§4), or descope paediatric from the eval gate
  and accept that it ships unvalidated — **I recommend against the second.**
- **D-PD-4 — CLAUDE.md + FL-50.** The hard-limit amendment is yours; the intended-use/classification
  assessment is the regulator's. Both **before** P4, and D-PD-4 is what P4 waits on.
- **D-PD-5 — BSA drugs (10).** No height source exists. Confirm they stay `NOT_RUN` rather than adding a
  guardian-attested height — *recommend NOT_RUN*: an attested height compounds two estimate errors into
  a body-surface-area figure, and these are cytotoxics and corticosteroids.
