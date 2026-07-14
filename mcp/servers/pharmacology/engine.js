/**
 * Pharmacology deterministic engine (pure) — shared by the MCP server (index.js)
 * and the in-process firewall in the grounding pipeline. Keeping it here means the
 * exact same logic runs whether the firewall is invoked over MCP or in-process.
 *
 * Hard rules (see index.js header): dose guidance ONLY on PASS/WARN and never on
 * HARD_FAIL/BLOCKED/paediatric; HARD_FAIL terminal; paediatric (<18) -> flag, no
 * dose; absent facts -> NOT_RUN -> BLOCKED_NO_PROOF.
 *
 * STEP 4 (FL-30): the engine reads clinical REFERENCE knowledge (allergy cross-reactivity,
 * interactions, renal rules, AU scheduling, dose guidance) through the PharmDataSource seam
 * — NOT from mock-data.json directly. The default source is the self-developed synthetic
 * source, which reads the curated CLINICIAN-SIGNED datastore (data/*.json) and falls back to
 * mock-data.json for any unpopulated capability. A caller may inject a validated live source
 * at Step 5 via runPharmCheck's 3rd argument. Provenance stays honest via the source's
 * receiptMode()/receiptUpstream() — 'mock' until Step-5 validation, never mock-as-live; the
 * reference content is clinician-signed synthetic, never presented as a licensed vendor.
 */
import { validatePharmIntent, validatePharmCheck } from "./schemas.js";
import { SyntheticSelfDevelopedSource } from "./sources/pharm-data-source.js";

const PHARM_VENDOR = process.env.PHARM_VENDOR || "stub";

// One shared source instance (reads the datastore once at module load). Callers needing a
// different source (a validated live source) pass it explicitly to runPharmCheck.
const DEFAULT_SOURCE = new SyntheticSelfDevelopedSource();

export const DATASET_VERSION = DEFAULT_SOURCE.datasetVersion();

/** Standard Receipt for a pharmacology call. `mode` is supplied by the caller from the
 * data source's honest receiptMode() ('mock' until Step-5 validation). */
export function receipt(mode = "mock") {
  return {
    request_id: `pharmchk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp_utc: new Date().toISOString(),
    upstream: PHARM_VENDOR,
    mode,
    tool: "pharm_check",
    server: "pharmacology",
  };
}

/**
 * Run the deterministic safety check. Validates the intent and the produced
 * PharmCheck (never emits a malformed safety result). `resolved` carries the
 * patient facts the orchestrator would resolve from patient_facts_ref.
 * @returns {object} a validated PharmCheck
 */
export function runPharmCheck(intentInput, resolved = {}, { source } = {}) {
  const intent = validatePharmIntent(intentInput);
  const src_ = source || DEFAULT_SOURCE; // reference-knowledge source (seam)
  const drug = String(intent.drug_intent.drug_name || "").toLowerCase();
  const age = intent.clinical_context && intent.clinical_context.patient_age_years;
  const src = [src_.datasetVersion()];
  const checks = [];
  const flags = [];
  const nextData = [];
  const addCheck = (check_id, status, severity, reason, missing) =>
    checks.push({ check_id, status, ...(severity ? { severity } : {}), ...(reason ? { reason } : {}), ...(missing ? { missing_facts_required: missing } : {}), sources_used: src });

  // 1. Allergy cross-reactivity
  if (Array.isArray(resolved.allergens)) {
    const grp = src_.getAllergyGroup(drug);
    const allergenGroups = resolved.allergens.map((a) => src_.getAllergyGroup(a)).filter(Boolean);
    if (grp && allergenGroups.includes(grp)) {
      addCheck("allergy_check", "HARD_FAIL", "critical", `cross-reactivity: ${drug} shares allergy group '${grp}' with a documented allergen`);
      flags.push({ flag_id: "flag-allergy", flag_type: "allergy_cross_reactivity", severity: "critical", description: `${drug} cross-reacts with a documented allergy (group ${grp})`, drug_a: drug });
    } else addCheck("allergy_check", "PASS");
  } else {
    addCheck("allergy_check", "NOT_RUN", undefined, "allergy status not provided", ["allergy_status"]);
    nextData.push("Provide verified allergy status.");
  }

  // 2. Drug-drug interaction
  if (Array.isArray(resolved.current_medications)) {
    const meds = resolved.current_medications.map((m) => String(m).toLowerCase());
    const hits = src_.getInteractions(drug).filter((ix) => (ix.a === drug && meds.includes(ix.b)) || (ix.b === drug && meds.includes(ix.a)));
    if (hits.length) {
      const critical = hits.some((h) => h.severity === "critical");
      hits.forEach((h, i) => flags.push({ flag_id: `flag-ddi-${i}`, flag_type: h.severity === "critical" ? "interaction_severe" : "interaction_moderate", severity: h.severity === "critical" ? "critical" : "moderate", description: `${h.a} + ${h.b}: ${h.note}`, drug_a: h.a, drug_b: h.b }));
      addCheck("interaction_check", critical ? "HARD_FAIL" : "WARN", critical ? "critical" : "moderate", "interaction(s) detected");
    } else addCheck("interaction_check", "PASS");
  } else {
    addCheck("interaction_check", "NOT_RUN", undefined, "current medications not provided", ["current_medications"]);
    nextData.push("Provide current medication list.");
  }

  // 3. Renal dosing
  const renalRule = src_.getRenalRule(drug);
  if (renalRule) {
    if (typeof resolved.egfr_ml_min === "number") {
      if (resolved.egfr_ml_min < renalRule.egfr_threshold_ml_min) {
        const contra = renalRule.action === "renal_contraindicated";
        addCheck("renal_dosing_check", contra ? "HARD_FAIL" : "WARN", contra ? "critical" : "moderate", `${drug}: ${renalRule.action} below eGFR ${renalRule.egfr_threshold_ml_min}`);
        // Frozen schema: renal_threshold is an OBJECT. contraindicated_below for an
        // absolute-contraindication rule, dose_reduction_below for an adjustment rule;
        // both carry the patient's actual eGFR so a clinician sees the margin.
        const renal_threshold = contra
          ? { patient_egfr: resolved.egfr_ml_min, contraindicated_below: renalRule.egfr_threshold_ml_min }
          : { patient_egfr: resolved.egfr_ml_min, dose_reduction_below: renalRule.egfr_threshold_ml_min };
        flags.push({ flag_id: "flag-renal", flag_type: renalRule.action, severity: contra ? "critical" : "moderate", description: `${drug} ${renalRule.action}`, drug_a: drug, renal_threshold });
      } else addCheck("renal_dosing_check", "PASS");
    } else {
      addCheck("renal_dosing_check", "NOT_RUN", undefined, "renal function (eGFR) not provided", ["egfr"]);
      nextData.push("Provide renal function (eGFR).");
    }
  } else addCheck("renal_dosing_check", "PASS", undefined, "no renal rule for this drug");

  // Pregnancy (TGA categorisation, FL-05). Runs only when the drug has a pregnancy record.
  // Category X / contraindicated → HARD_FAIL; D → WARN; A/B/C → PASS. FAIL-SAFE (D-FL05-1):
  // for a KNOWN teratogen/high-risk drug (X/D/contraindicated) an UNKNOWN pregnancy status
  // is NOT_RUN → forces BLOCKED_NO_PROOF, demanding confirmation before prescribing. A
  // low-risk category (A/B/C) with unknown status does not block. No dose is ever emitted here.
  const pregRec = src_.getPregnancyRisk(drug);
  if (pregRec) {
    const cat = String(pregRec.tga_category || "").toUpperCase();
    const highRisk = cat === "X" || cat === "D" || pregRec.contraindicated === true;
    const pregStatus = resolved.pregnancy_status; // "pregnant" | "not_pregnant" | undefined
    const pregRef = "TGA Prescribing Medicines in Pregnancy";
    if (pregStatus === "pregnant") {
      if (cat === "X" || pregRec.contraindicated === true) {
        addCheck("pregnancy_check", "HARD_FAIL", "critical", `TGA pregnancy category ${cat || "X"}: ${pregRec.guidance || "contraindicated in pregnancy"}`);
        flags.push({ flag_id: "flag-preg", flag_type: "pregnancy_category_x", severity: "critical", description: `${drug} — TGA category ${cat || "X"}: ${pregRec.guidance || "teratogen; contraindicated in pregnancy"}`, drug_a: drug, au_reference: pregRef });
      } else if (cat === "D") {
        addCheck("pregnancy_check", "WARN", "moderate", `TGA pregnancy category D: ${pregRec.guidance || "evidence of fetal risk; use only if benefit justifies"}`);
        flags.push({ flag_id: "flag-preg", flag_type: "pregnancy_category_d", severity: "moderate", description: `${drug} — TGA category D: ${pregRec.guidance || "evidence of fetal risk"}`, drug_a: drug, au_reference: pregRef });
      } else {
        addCheck("pregnancy_check", "PASS", undefined, `TGA pregnancy category ${cat || "A/B/C"}`);
      }
    } else if (pregStatus === "not_pregnant") {
      addCheck("pregnancy_check", "PASS", undefined, "not pregnant");
    } else if (highRisk) {
      // Fail-closed (D-FL05-1) but AGE-GATED: an unknown pregnancy status blocks a teratogen
      // ONLY for a patient of childbearing potential (age ~12-55, or unknown age). Outside that
      // window (e.g. an elderly patient on warfarin) an unknown status does not block — the
      // pregnancy concern is negligible, and blocking would be over-triage. Paediatric (<18)
      // is already HARD_FAILed by the age check, which dominates.
      const childbearingPotential = typeof age !== "number" || (age >= 12 && age <= 55);
      if (childbearingPotential) {
        addCheck("pregnancy_check", "NOT_RUN", undefined, `TGA category ${cat}: pregnancy status not provided — must be confirmed before prescribing a teratogenic/high-risk drug to a patient of childbearing potential`, ["pregnancy_status"]);
        nextData.push("Confirm pregnancy status (teratogenic/high-risk drug).");
      } else {
        addCheck("pregnancy_check", "PASS", undefined, `TGA category ${cat}: not of childbearing potential (age ${age}) — pregnancy status not required`);
      }
    } else {
      addCheck("pregnancy_check", "PASS", undefined, `TGA category ${cat || "A/B/C"} (low pregnancy risk)`);
    }
  }

  // Hepatic impairment (FL-05). Runs only when the drug has a hepatic record. The dataset is
  // qualitative (an action + guidance, not a numeric threshold like renal), so it keys on a
  // resolved hepatic-impairment fact. hepatic_contraindicated → HARD_FAIL; any other action
  // (e.g. hepatic_caution) → WARN. Unknown impairment status when a rule exists → NOT_RUN.
  const hepRec = src_.getHepatic(drug);
  if (hepRec) {
    const impaired = resolved.hepatic_impairment; // true | false | undefined
    if (impaired === true) {
      const contra = hepRec.action === "hepatic_contraindicated";
      addCheck("hepatic_check", contra ? "HARD_FAIL" : "WARN", contra ? "critical" : "moderate", `${drug}: ${hepRec.action}${hepRec.guidance ? ` — ${hepRec.guidance}` : ""}`);
      flags.push({ flag_id: "flag-hepatic", flag_type: contra ? "hepatic_contraindicated" : "hepatic_adjustment_required", severity: contra ? "critical" : "moderate", description: `${drug} ${hepRec.action}${hepRec.guidance ? `: ${hepRec.guidance}` : ""}`, drug_a: drug });
    } else if (impaired === false) {
      addCheck("hepatic_check", "PASS", undefined, "no hepatic impairment");
    } else {
      addCheck("hepatic_check", "NOT_RUN", undefined, "hepatic function (impairment) not provided", ["hepatic_impairment"]);
      nextData.push("Provide hepatic function (impairment yes/no).");
    }
  }

  // 4/5. AU scheduling (SUSMP / Poisons Standard) + S8 PDMP gate.
  // General (non-S8) scheduling is INFORMATIONAL metadata, not a separately gated
  // check: the frozen pharm-check check_id enum has no general 'schedule' check and
  // the contract is frozen (FL-30 ruling 5b — no amendment; the former illegal
  // "schedule_check" is removed). Only S8 gates, via the PDMP (SafeScript) check.
  // Treat as S8 if EITHER the mock schedule map OR the intent declares it, so a map
  // miss (brand/spelling variant) can't suppress the PDMP check for a controlled drug.
  const isS8 = src_.getSchedule(drug) === "S8" || intent.drug_intent.schedule === "S8";
  if (isS8) {
    const s8ref = "SUSMP Poisons Standard — Schedule 8 (Controlled Drug); SafeScript PDMP required";
    if (resolved.s8_pdmp_checked === true) {
      addCheck("schedule_8_check", "PASS", undefined, "AU schedule S8 (SUSMP); PDMP (SafeScript) check recorded");
    } else {
      addCheck("schedule_8_check", "HARD_FAIL", "critical", "AU schedule S8 (SUSMP): S8 drug requires a PDMP (SafeScript) check — not performed");
      flags.push({ flag_id: "flag-s8", flag_type: "schedule_8_pdmp_required", severity: "critical", description: `${drug} is S8 (SUSMP Poisons Standard); PDMP (SafeScript) check required before prescribing`, drug_a: drug, au_reference: s8ref });
      nextData.push("Perform S8 PDMP (SafeScript) check.");
    }
  }

  // NTI (narrow therapeutic index). Authoritative NTI status comes from the clinician-signed
  // register (getNti); the intent's is_nti_candidate is a CONSERVATIVE additional trigger
  // (safety-netting — it can raise the check but never suppress it). Per the frozen contract's
  // hard_fail_triggers, an NTI drug with NO documented monitoring plan is a HARD_FAIL.
  // `nti_monitoring_documented` is the resolved fact (mirrors s8_pdmp_checked).
  const ntiRec = src_.getNti(drug);
  const isNti = (ntiRec && ntiRec.is_nti === true) || intent.drug_intent.is_nti_candidate === true;
  if (isNti) {
    const target = ntiRec && ntiRec.therapeutic_interval ? ` (target ${ntiRec.therapeutic_interval})` : "";
    if (resolved.nti_monitoring_documented === true) {
      addCheck("nti_check", "PASS", undefined, `NTI drug: monitoring plan documented${target}`);
    } else {
      addCheck("nti_check", "HARD_FAIL", "critical", `NTI drug (${drug}) without a documented monitoring plan${ntiRec && ntiRec.monitoring_hint ? ` — ${ntiRec.monitoring_hint}` : ""}`);
      flags.push({ flag_id: "flag-nti", flag_type: "nti", severity: "critical", description: `${drug} is a narrow therapeutic index drug; a monitoring plan${target} must be documented before prescribing`, drug_a: drug });
      nextData.push("Document the NTI monitoring plan (levels / target range).");
    }
  }

  // Paediatric / age appropriateness. A KNOWN under-18 → HARD_FAIL (flag, no dose).
  // An UNKNOWN age must NOT silently produce a dose: per the fail-safe default
  // (missing proof → blocked/unknown) we mark the check NOT_RUN, which forces overall
  // BLOCKED_NO_PROOF and withholds dose guidance until age is confirmed.
  let paediatric = false;
  if (typeof age === "number") {
    if (age < 18) {
      paediatric = true;
      addCheck("age_appropriateness_check", "HARD_FAIL", "critical", "paediatric (<18): no paediatric dosing tables — in-person review required");
      flags.push({ flag_id: "flag-paed", flag_type: "age_paediatric_weight_based", severity: "critical", description: "Patient under 18 — paediatric dosing not available; in-person review required" });
      nextData.push("Refer for in-person paediatric review (no remote dosing).");
    } else {
      addCheck("age_appropriateness_check", "PASS");
    }
  } else {
    addCheck("age_appropriateness_check", "NOT_RUN", undefined, "patient age not provided — cannot confirm the patient is not paediatric", ["patient_age_years"]);
    nextData.push("Provide patient age (no remote paediatric dosing).");
  }

  // Overall status (HARD_FAIL terminal > BLOCKED_NO_PROOF > WARN > PASS).
  let status;
  if (checks.some((c) => c.status === "HARD_FAIL")) status = "HARD_FAIL";
  else if (checks.some((c) => c.status === "NOT_RUN")) status = "BLOCKED_NO_PROOF";
  else if (checks.some((c) => c.status === "WARN")) status = "WARN";
  else status = "PASS";

  // Unknown drug → escalate, never a silent pass (FL-30 §4.4). If the drug is not in the
  // reference set the engine cannot vouch for its safety; a PASS/WARN downgrades to
  // BLOCKED_NO_PROOF (a HARD_FAIL already blocks and is more severe, so it stands).
  const known = typeof src_.knownDrug === "function" ? src_.knownDrug(drug) : true;
  if (!known && status !== "HARD_FAIL") {
    status = "BLOCKED_NO_PROOF";
    nextData.push(`Drug '${drug}' is not in the pharmacology reference set — clinician verification required before proceeding.`);
  }

  // Dose guidance ONLY when safe to proceed — never on HARD_FAIL/BLOCKED/paediatric.
  let dose_guidance;
  if ((status === "PASS" || status === "WARN") && !paediatric) {
    const dg = src_.getDoseGuidance(drug);
    if (dg) {
      // Defensive: a datastore dose record may carry non-dose fields (ingredient, provenance).
      // PharmCheck.dose_guidance is strict — pick ONLY the frozen dose keys so extra fields
      // can never break validation when the dose-guidance dataset is later populated.
      const DOSE_KEYS = ["safe_dose_range", "adjustment_required", "adjustment_reason", "monitoring_required", "duration_guidance", "pbs_authority_required", "pbs_item_code"];
      const picked = Object.fromEntries(DOSE_KEYS.filter((k) => k in dg).map((k) => [k, dg[k]]));
      dose_guidance = { ...picked, ...(status === "WARN" ? { adjustment_required: true, adjustment_reason: "see flags" } : {}) };
    }
  }

  const out = {
    check_id: `chk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    intent_id: intent.intent_id,
    session_ref: intent.session_ref,
    status,
    check_results: checks,
    flags,
    ...(dose_guidance ? { dose_guidance } : {}),
    next_data_requests: [...new Set(nextData)],
    receipt: receipt(src_.receiptMode()),
    vendor_reference: src_.receiptUpstream(),
    mode: src_.receiptMode(),
    checked_at_utc: new Date().toISOString(),
  };
  return validatePharmCheck(out); // never emit a malformed safety result
}
