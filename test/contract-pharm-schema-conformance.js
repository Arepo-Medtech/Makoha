/**
 * Conformance guard: every PharmCheck the engine emits MUST validate against the
 * FROZEN JSON schema (mcp/schemas/pharm-check.schema.json), the single source of
 * truth. The zod contract in schemas.js mirrors it, but zod drift is exactly how the
 * former illegal check_id "schedule_check" and the number-typed renal_threshold went
 * unnoticed (FL-30 Step 2 / C1). This test compiles the frozen schema with ajv and
 * asserts real engine output across every status branch — so a future divergence
 * between the engine, the zod mirror, and the frozen contract fails CI, loudly.
 *
 * In-process (imports engine.js directly) — no spawn, deterministic. The frozen
 * schema's receipt field is a $ref to receipt.schema.json, loaded by $id.
 * Run from repo root: node test/contract-pharm-schema-conformance.js
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";
import { runPharmCheck } from "../mcp/servers/pharmacology/engine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaDir = join(__dirname, "..", "mcp", "schemas");
const pharmCheckSchema = JSON.parse(readFileSync(join(schemaDir, "pharm-check.schema.json"), "utf8"));
const receiptSchema = JSON.parse(readFileSync(join(schemaDir, "receipt.schema.json"), "utf8"));

// strict:false so schema-level annotations (_integration_notes, unresolved formats)
// are ignored; we are validating DATA conformance, not linting the schema doc.
// logger:false silences ajv's "unknown format date-time ignored" annotations
// (we validate structure, not formats); validate.errors still populate for reporting.
const ajv = new Ajv({ allErrors: true, strict: false, logger: false });
ajv.addSchema(receiptSchema); // resolves pharm-check's "$ref": "receipt.schema.json" by $id
const validate = ajv.compile(pharmCheckSchema);

const intent = (over = {}) => ({
  intent_id: "int-conf-1",
  session_ref: "enc-conformance-01",
  intent_type: "new_prescription",
  drug_intent: { drug_name: "amoxicillin", drug_class: "penicillin_antibiotic" },
  patient_facts_ref: { packet_session_ref: "enc-conformance-01" },
  clinical_context: { patient_age_years: 45 },
  mode: "mock",
  ...over,
});

// Each case is chosen to exercise a distinct output shape: PASS+dose, every
// HARD_FAIL trigger, WARN (renal adjustment → renal_threshold object with
// dose_reduction_below), BLOCKED_NO_PROOF, and paediatric.
const cases = [
  { label: "PASS + dose_guidance", intent: intent(), resolved: { allergens: ["paracetamol"], current_medications: ["paracetamol"], s8_pdmp_checked: true }, expect: "PASS" },
  { label: "allergy cross-reactivity HARD_FAIL", intent: intent(), resolved: { allergens: ["penicillin"], current_medications: [] }, expect: "HARD_FAIL" },
  { label: "interaction HARD_FAIL (warfarin+ibuprofen)", intent: intent({ drug_intent: { drug_name: "warfarin", drug_class: "oral_anticoagulant_vitamin_k_antagonist" } }), resolved: { allergens: [], current_medications: ["ibuprofen"] }, expect: "HARD_FAIL" },
  { label: "renal contraindicated HARD_FAIL (metformin eGFR 25)", intent: intent({ drug_intent: { drug_name: "metformin", drug_class: "biguanide_antidiabetic" } }), resolved: { allergens: [], current_medications: [], egfr_ml_min: 25 }, expect: "HARD_FAIL" },
  { label: "renal adjustment WARN (gabapentin eGFR 50) → renal_threshold object", intent: intent({ drug_intent: { drug_name: "gabapentin", drug_class: "gabapentinoid" } }), resolved: { allergens: [], current_medications: [], egfr_ml_min: 50 }, expect: "WARN" },
  { label: "S8 no-PDMP HARD_FAIL (oxycodone)", intent: intent({ drug_intent: { drug_name: "oxycodone", drug_class: "opioid_analgesic" } }), resolved: { allergens: [], current_medications: [] }, expect: "HARD_FAIL" },
  { label: "BLOCKED_NO_PROOF (no facts)", intent: intent(), resolved: {}, expect: "BLOCKED_NO_PROOF" },
  { label: "paediatric HARD_FAIL (age 10)", intent: intent({ clinical_context: { patient_age_years: 10 } }), resolved: { allergens: ["paracetamol"], current_medications: ["paracetamol"], s8_pdmp_checked: true }, expect: "HARD_FAIL" },
];

const errors = [];
for (const c of cases) {
  let out;
  try {
    out = runPharmCheck(c.intent, c.resolved);
  } catch (e) {
    errors.push(`${c.label}: engine threw: ${e.message}`);
    continue;
  }
  if (out.status !== c.expect) errors.push(`${c.label}: expected status ${c.expect}, got ${out.status}`);
  // The illegal id must be gone and every emitted check_id must be in the frozen enum.
  for (const cr of out.check_results) {
    if (cr.check_id === "schedule_check") errors.push(`${c.label}: illegal check_id "schedule_check" still emitted`);
  }
  if (!validate(out)) {
    const detail = (validate.errors || []).map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ");
    errors.push(`${c.label}: output does NOT conform to frozen pharm-check.schema.json — ${detail}`);
  }
}

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-pharm-schema-conformance FAIL (${errors.length})`);
  process.exit(1);
}
console.log("contract-pharm-schema-conformance: OK");
