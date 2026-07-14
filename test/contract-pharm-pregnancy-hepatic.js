/**
 * Contract test for FL-05 — wiring the reserved frozen pregnancy_check + hepatic_check into
 * the pharmacology engine (against the already clinician-signed pregnancy-risk / hepatic
 * datasets). No frozen-schema change: both check_ids and their flag types already exist.
 *
 * Asserts: TGA category X/contraindicated → HARD_FAIL; D → WARN; A → PASS; a KNOWN teratogen
 * (X/D) with UNKNOWN pregnancy status → NOT_RUN → BLOCKED_NO_PROOF (fail-closed, D-FL05-1); a
 * low-risk category (A) with unknown status does NOT block; hepatic_contraindicated → HARD_FAIL,
 * hepatic_caution → WARN, unknown impairment → NOT_RUN; no dose on any HARD_FAIL; a drug with
 * no pregnancy/hepatic record omits the check entirely.
 * Run from repo root: node test/contract-pharm-pregnancy-hepatic.js
 */
import { runPharmCheck } from "../mcp/servers/pharmacology/engine.js";

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };
const chk = (res, id) => res.check_results.find((c) => c.check_id === id);
const flag = (res, type) => res.flags.find((f) => f.flag_type === type);

// Full "safe" resolved facts so pregnancy/hepatic are the only variables under test.
const safe = { allergens: [], current_medications: [], s8_pdmp_checked: true };
const intent = (drug_name, over = {}) => ({
  intent_id: "int-fl05", session_ref: "enc-fl05-01", intent_type: "new_prescription",
  drug_intent: { drug_name, drug_class: "test" }, patient_facts_ref: {},
  clinical_context: { patient_age_years: 30 }, mode: "mock", ...over,
});

// ---- pregnancy_check ----
// Category X + pregnant → HARD_FAIL, category_x flag, NO dose.
const pregX = runPharmCheck(intent("isotretinoin"), { ...safe, pregnancy_status: "pregnant" });
expect(chk(pregX, "pregnancy_check")?.status === "HARD_FAIL", "category X + pregnant → pregnancy_check HARD_FAIL");
expect(!!flag(pregX, "pregnancy_category_x"), "category X raises pregnancy_category_x flag");
expect(pregX.status === "HARD_FAIL" && !pregX.dose_guidance, "overall HARD_FAIL, no dose on a teratogen");

// Category D + pregnant → WARN + category_d flag.
const pregD = runPharmCheck(intent("warfarin"), { ...safe, pregnancy_status: "pregnant" });
expect(chk(pregD, "pregnancy_check")?.status === "WARN", "category D + pregnant → pregnancy_check WARN");
expect(!!flag(pregD, "pregnancy_category_d"), "category D raises pregnancy_category_d flag");

// Category A + pregnant → PASS.
const pregA = runPharmCheck(intent("amoxicillin"), { ...safe, pregnancy_status: "pregnant" });
expect(chk(pregA, "pregnancy_check")?.status === "PASS", "category A + pregnant → pregnancy_check PASS");

// Category X + UNKNOWN status → NOT_RUN → overall BLOCKED_NO_PROOF (fail-closed, D-FL05-1).
const pregXUnknown = runPharmCheck(intent("isotretinoin"), safe);
expect(chk(pregXUnknown, "pregnancy_check")?.status === "NOT_RUN", "category X + unknown status → pregnancy_check NOT_RUN");
expect(pregXUnknown.status === "BLOCKED_NO_PROOF", "unknown status on a teratogen forces overall BLOCKED_NO_PROOF");
expect(!pregXUnknown.dose_guidance, "no dose when pregnancy status is unconfirmed for a teratogen");

// Category A + UNKNOWN status → PASS (a low-risk category must not block).
const pregAUnknown = runPharmCheck(intent("amoxicillin"), safe);
expect(chk(pregAUnknown, "pregnancy_check")?.status === "PASS", "category A + unknown status → PASS (low risk, no block)");
expect(pregAUnknown.status === "PASS", "a safe category-A drug with unknown pregnancy status still passes overall");

// not_pregnant → PASS even for a teratogen.
const notPreg = runPharmCheck(intent("isotretinoin"), { ...safe, pregnancy_status: "not_pregnant" });
expect(chk(notPreg, "pregnancy_check")?.status === "PASS", "not_pregnant → pregnancy_check PASS");

// AGE GATE: a teratogen + unknown status for a patient NOT of childbearing potential
// (age > 55) does NOT block — the block is scoped to childbearing potential (~12-55).
const pregXElderly = runPharmCheck(intent("isotretinoin", { clinical_context: { patient_age_years: 60 } }), safe);
expect(chk(pregXElderly, "pregnancy_check")?.status === "PASS", "category X + unknown status + age 60 → pregnancy_check PASS (not childbearing potential)");
// Parity with the signed validation case: warfarin (category D, NTI) age 60 + monitoring +
// unknown pregnancy status → overall PASS (age gate keeps pregnancy_check from blocking).
const warfarin60 = runPharmCheck(intent("warfarin", { clinical_context: { patient_age_years: 60 } }), { ...safe, nti_monitoring_documented: true });
expect(warfarin60.status === "PASS", "warfarin age 60 + NTI monitoring + unknown pregnancy → overall PASS (age gate)");

// ---- hepatic_check ----
// Contraindicated + impaired → HARD_FAIL, hepatic_contraindicated flag, no dose.
const hepContra = runPharmCheck(intent("atorvastatin"), { ...safe, hepatic_impairment: true });
expect(chk(hepContra, "hepatic_check")?.status === "HARD_FAIL", "hepatic_contraindicated + impaired → hepatic_check HARD_FAIL");
expect(!!flag(hepContra, "hepatic_contraindicated"), "raises hepatic_contraindicated flag");
expect(hepContra.status === "HARD_FAIL" && !hepContra.dose_guidance, "overall HARD_FAIL, no dose");

// Caution + impaired → WARN + hepatic_adjustment_required flag.
const hepCaution = runPharmCheck(intent("apixaban"), { ...safe, hepatic_impairment: true });
expect(chk(hepCaution, "hepatic_check")?.status === "WARN", "hepatic_caution + impaired → hepatic_check WARN");
expect(!!flag(hepCaution, "hepatic_adjustment_required"), "caution raises hepatic_adjustment_required flag");

// Rule exists + impairment UNKNOWN → NOT_RUN → BLOCKED.
const hepUnknown = runPharmCheck(intent("atorvastatin"), safe);
expect(chk(hepUnknown, "hepatic_check")?.status === "NOT_RUN", "hepatic rule + unknown impairment → NOT_RUN");
expect(hepUnknown.status === "BLOCKED_NO_PROOF", "unknown hepatic status on a rule-bearing drug forces BLOCKED_NO_PROOF");

// Not impaired → PASS.
const hepOk = runPharmCheck(intent("atorvastatin"), { ...safe, hepatic_impairment: false });
expect(chk(hepOk, "hepatic_check")?.status === "PASS", "hepatic_impairment false → hepatic_check PASS");

// ---- omission: a drug with neither record runs neither check ----
const neither = runPharmCheck(intent("oxycodone"), { ...safe, pregnancy_status: "pregnant", hepatic_impairment: true });
expect(chk(neither, "pregnancy_check") === undefined, "no pregnancy record → pregnancy_check omitted");
expect(chk(neither, "hepatic_check") === undefined, "no hepatic record → hepatic_check omitted");

if (errors.length) {
  console.error("contract-pharm-pregnancy-hepatic FAILED:\n" + errors.map((e) => "  - " + e).join("\n"));
  process.exit(1);
}
console.log("FL-05 pregnancy/hepatic PASS (X→HARD_FAIL · D→WARN · A→PASS · teratogen+unknown→BLOCKED · hepatic contra/caution/unknown · no dose on HARD_FAIL)");
process.exit(0);
