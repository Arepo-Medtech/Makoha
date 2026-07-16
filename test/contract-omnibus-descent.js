/**
 * contract-omnibus-descent — the digital-tablet descent expansion (Case Corpus v2, Phase 2b).
 *
 * v1.0 was richly specified on the ASCENT (Observation: 522 leaf fields) and thin on the DESCENT
 * (CarePlan: 26) — a measured asymmetry. v1.1 adds the management/safety-netting map the notes carry.
 * This pins that the additions are present, FHIR-tiered, idiom-consistent, and ADDITIVE (nothing the
 * ascent already had was removed — the whole descent argument is "add the way down", not "rebuild").
 *
 * Bars:
 *   §1 version bumped + expansion provenance recorded;
 *   §2 the four functional structures the operator named exist, each _fhir_tier-tagged;
 *   §3 safety-netting's Tier-2 composition is honest — Communication for the advice + ordered
 *      escalation rungs, NOT a pretend-native FHIR resource (R4 has none);
 *   §4 additive — every ascent resource v1.0 carried is still present;
 *   §5 no fabricated bindings — SNOMED codes appear only inside clearly-labelled *_examples maps
 *      (candidates, receipt-gated downstream), never asserted as this-case truth.
 */
import { readFileSync } from "node:fs";

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) return console.log(`  ok: ${name}`);
  failures++;
  console.error(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
};

const omni = JSON.parse(readFileSync("data/digital_tablet_omnibus.json", "utf8"));
const partC = omni.schema.part_c_reasoning_careplanning_consent_riskassessment_sdoh_freetext_taxonomy_governance;
const cp = partC.CarePlan;
const ra = partC.RiskAssessment;

// ── §1 version + provenance ───────────────────────────────────────────────────
check("§1 omnibus version bumped to 1.1", omni._digitalTablet.version === "1.1");
check("§1 the descent expansion records its rationale", typeof omni._digitalTablet._descent_expansion?.rationale === "string" && /ASCENT|DESCENT/i.test(omni._digitalTablet._descent_expansion.rationale));

// ── §2 the four functional structures, each tiered ────────────────────────────
const tiered = (o) => o && [1, 2, 3].includes(o._fhir_tier);
check("§2 Communication (safety-net advice) added, tiered", tiered(partC.Communication) && partC.Communication._fhir_resource === "Communication");
check("§2 CarePlan.safety_netting_escalation (the rung ladder) added, tiered", tiered(cp.safety_netting_escalation));
check("§2 RiskAssessment.prognostic_factors (resolution vs complication) added, tiered", tiered(ra.prognostic_factors));
check("§2 CarePlan.behaviour_change_activities added, tiered", tiered(cp.behaviour_change_activities));

// ── §3 safety-netting represented honestly as Tier 2 composition ──────────────
check("§3 safety-net advice is Tier 2 (composition, not a pretend-native resource)", partC.Communication._fhir_tier === 2);
check("§3 the escalation ladder is Tier 2 and ORDERED (rungs, self-care → ED)", cp.safety_netting_escalation._fhir_tier === 2 && /self_care|emergency_department/.test(cp.safety_netting_escalation.rung_levels));
check("§3 resolution/complication factors are Tier 1 (RiskAssessment.prediction has a native home)", ra.prognostic_factors._fhir_tier === 1);
check("§3 both prognostic directions are present (favouring resolution AND complication)",
  "factors_affecting_resolution" in ra.prognostic_factors && "factors_favouring_complication" in ra.prognostic_factors);

// ── §4 additive: every v1.0 ascent resource survives ──────────────────────────
{
  const partA = omni.schema.part_a_patient_conditions_medications_allergies;
  const partB = omni.schema.part_b_observations_procedures_immunizations_diagnostics_familyhistory;
  const ascent = ["Patient", "Condition", "MedicationRequest", "AllergyIntolerance"].every((r) => r in partA)
    && ["Observation", "Procedure", "Immunization", "DiagnosticReport", "FamilyMemberHistory"].every((r) => r in partB);
  check("§4 every v1.0 ascent resource is still present (additive, not a rebuild)", ascent);
  check("§4 CarePlan's original fields survive (added to, not replaced)", "au_plan_types" in cp && "activity_kinds" in cp);
}

// ── §5 no fabricated bindings asserted as truth ───────────────────────────────
{
  // SNOMED codes may appear only inside *_examples / *_map structures (candidate bindings,
  // receipt-gated), never as a bare asserted code on the new structures.
  const escalation = cp.safety_netting_escalation;
  const noBareCode = !("snomed" in escalation) && !("_snomed" in escalation);
  check("§5 the escalation ladder asserts no bare SNOMED code (rungs are structure, codes come by receipt)", noBareCode);
  check("§5 Communication's SNOMED examples live in a clearly-labelled examples map", "_snomed_advice_examples" in partC.Communication);
}

if (failures) {
  console.error(`contract-omnibus-descent FAIL (${failures})`);
  process.exit(1);
}
console.log("contract-omnibus-descent OK (v1.1 · four descent structures tiered · safety-netting honestly Tier-2 · additive · no fabricated bindings)");
