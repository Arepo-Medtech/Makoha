/**
 * Pharmacology deterministic engine (pure) — shared by the MCP server (index.js)
 * and the in-process firewall in the grounding pipeline. Keeping it here means the
 * exact same logic runs whether the firewall is invoked over MCP or in-process.
 *
 * Hard rules (see index.js header): dose guidance ONLY on PASS/WARN and never on
 * HARD_FAIL/BLOCKED/paediatric; HARD_FAIL terminal; paediatric (<18) -> flag, no
 * dose; absent facts -> NOT_RUN -> BLOCKED_NO_PROOF; every result mode='mock'.
 * Reference rules are MOCK/SYNTHETIC-ONLY (mock-data.json) — not a clinical source.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePharmIntent, validatePharmCheck } from "./schemas.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = JSON.parse(readFileSync(join(__dirname, "mock-data.json"), "utf8"));
const PHARM_VENDOR = process.env.PHARM_VENDOR || "stub";

export const DATASET_VERSION = DATA.dataset_version;

/** Standard Receipt for a pharmacology call (mode='mock' in dev). */
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

/** Which allergy cross-reactivity group (if any) a drug belongs to. */
function groupOf(name) {
  const n = String(name || "").toLowerCase();
  const g = DATA.allergy_cross_reactivity_groups.find((grp) => grp.members.includes(n));
  return g ? g.group : null;
}

/**
 * Run the deterministic safety check. Validates the intent and the produced
 * PharmCheck (never emits a malformed safety result). `resolved` carries the
 * patient facts the orchestrator would resolve from patient_facts_ref.
 * @returns {object} a validated PharmCheck
 */
export function runPharmCheck(intentInput, resolved = {}) {
  const intent = validatePharmIntent(intentInput);
  const drug = String(intent.drug_intent.drug_name || "").toLowerCase();
  const age = intent.clinical_context && intent.clinical_context.patient_age_years;
  const src = [DATA.dataset_version];
  const checks = [];
  const flags = [];
  const nextData = [];
  const addCheck = (check_id, status, severity, reason, missing) =>
    checks.push({ check_id, status, ...(severity ? { severity } : {}), ...(reason ? { reason } : {}), ...(missing ? { missing_facts_required: missing } : {}), sources_used: src });

  // 1. Allergy cross-reactivity
  if (Array.isArray(resolved.allergens)) {
    const grp = groupOf(drug);
    const allergenGroups = resolved.allergens.map((a) => groupOf(a)).filter(Boolean);
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
    const hits = DATA.drug_interactions.filter((ix) => (ix.a === drug && meds.includes(ix.b)) || (ix.b === drug && meds.includes(ix.a)));
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
  const renalRule = DATA.renal_rules.find((r) => r.drug === drug);
  if (renalRule) {
    if (typeof resolved.egfr_ml_min === "number") {
      if (resolved.egfr_ml_min < renalRule.egfr_threshold_ml_min) {
        const contra = renalRule.action === "renal_contraindicated";
        addCheck("renal_dosing_check", contra ? "HARD_FAIL" : "WARN", contra ? "critical" : "moderate", `${drug}: ${renalRule.action} below eGFR ${renalRule.egfr_threshold_ml_min}`);
        flags.push({ flag_id: "flag-renal", flag_type: renalRule.action, severity: contra ? "critical" : "moderate", description: `${drug} ${renalRule.action}`, drug_a: drug, renal_threshold: renalRule.egfr_threshold_ml_min });
      } else addCheck("renal_dosing_check", "PASS");
    } else {
      addCheck("renal_dosing_check", "NOT_RUN", undefined, "renal function (eGFR) not provided", ["egfr"]);
      nextData.push("Provide renal function (eGFR).");
    }
  } else addCheck("renal_dosing_check", "PASS", undefined, "no renal rule for this drug");

  // 4. AU scheduling
  const schedule = DATA.schedule_map[drug] || intent.drug_intent.schedule || "unknown";
  addCheck("schedule_check", "PASS", undefined, `AU schedule: ${schedule}`);

  // 5. S8 PDMP (SafeScript)
  if (schedule === "S8") {
    if (resolved.s8_pdmp_checked === true) addCheck("schedule_8_check", "PASS", undefined, "PDMP check recorded");
    else {
      addCheck("schedule_8_check", "HARD_FAIL", "critical", "S8 drug requires a PDMP (SafeScript) check — not performed");
      flags.push({ flag_id: "flag-s8", flag_type: "schedule_8_pdmp_required", severity: "critical", description: `${drug} is S8; PDMP (SafeScript) check required before prescribing`, drug_a: drug, au_reference: "SafeScript" });
      nextData.push("Perform S8 PDMP (SafeScript) check.");
    }
  }

  // Paediatric — flag for in-person review, NEVER a dose.
  let paediatric = false;
  if (typeof age === "number" && age < 18) {
    paediatric = true;
    addCheck("age_appropriateness_check", "HARD_FAIL", "critical", "paediatric (<18): no paediatric dosing tables — in-person review required");
    flags.push({ flag_id: "flag-paed", flag_type: "age_paediatric_weight_based", severity: "critical", description: "Patient under 18 — paediatric dosing not available; in-person review required" });
    nextData.push("Refer for in-person paediatric review (no remote dosing).");
  }

  // Overall status (HARD_FAIL terminal > BLOCKED_NO_PROOF > WARN > PASS).
  let status;
  if (checks.some((c) => c.status === "HARD_FAIL")) status = "HARD_FAIL";
  else if (checks.some((c) => c.status === "NOT_RUN")) status = "BLOCKED_NO_PROOF";
  else if (checks.some((c) => c.status === "WARN")) status = "WARN";
  else status = "PASS";

  // Dose guidance ONLY when safe to proceed — never on HARD_FAIL/BLOCKED/paediatric.
  let dose_guidance;
  if ((status === "PASS" || status === "WARN") && !paediatric) {
    const dg = DATA.dose_guidance_mock[drug];
    if (dg) dose_guidance = { ...dg, ...(status === "WARN" ? { adjustment_required: true, adjustment_reason: "see flags" } : {}) };
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
    receipt: receipt("mock"),
    vendor_reference: `MOCK:${DATA.dataset_version}`,
    mode: "mock",
    checked_at_utc: new Date().toISOString(),
  };
  return validatePharmCheck(out); // never emit a malformed safety result
}
