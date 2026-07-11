/**
 * Contract tests for the structured self-disclosed history capture (HIST) —
 * granular per-item facts with patient-provenance stamps, the lifted vitals
 * quarantine (string-preserving policy, operator ruling 2026-07-11), the
 * patient-provenance ≠ lab_result mechanical bar, and the AUCDI-aligned
 * encounter history summary (verification/history-summary.js +
 * mcp/schemas/patient-history-summary.schema.json).
 * <test_and_evaluation_gates> requires deterministic safety code to be tested.
 *
 * Asserts:
 *   - granular capture: each disclosed condition / medication / allergy /
 *     family-history item becomes its own packet fact with the correct
 *     category, patient-voice value, provenance stamp, verified:false;
 *   - mechanical bar: the packet zod gate REFUSES a lab_result fact carrying
 *     patient provenance;
 *   - the summary is schema-valid against BOTH the zod gate and the JSON
 *     schema (lockstep check), deterministic for fixed inputs, carries the
 *     const disclaimer, verified:false on every entry, the omnibus dataset
 *     receipt, and a summary_sha256 over exactly what the clinician sees;
 *   - AU Core advisory conformance is RECORDED on condition/medication/
 *     allergy entries and gates nothing;
 *   - boundary: the summary never appears in the ContextPacket, and the
 *     builder returns null when there is no case content;
 *   - memory-only: building a summary writes no file.
 *
 * ALL fixtures are synthetic in-test objects. Run: node test/contract-history-summary.js
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";
import { runPipeline } from "../verification/pipeline.js";
import { validateContextPacket } from "../verification/pipeline-schemas.js";
import { buildEncounterHistorySummary, HISTORY_SUMMARY_DISCLAIMER } from "../verification/history-summary.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const check = (label, cond) => { if (!cond) errors.push(label); };

const caseContent = {
  "01_presentation_layer": {
    demographics: { age: "58", sex: "female" },
    opening_complaint: "A burning pain in my chest started 2 days ago.",
    history_as_reported: {
      symptom_narrative: { onset: "this morning", character: "burning" },
      past_medical_history: [
        { condition_as_patient_states: "type 2 diabetes, tablets only", when_diagnosed: "about 5 years ago" },
        { condition_as_patient_states: "high blood pressure" },
      ],
      current_medications_as_reported: [{ name_as_patient_states: "metformin", dose_as_patient_reports: "500mg twice a day" }],
      allergies_as_reported: [{ substance: "penicillin", reaction_described: "rash" }],
      family_history_as_reported: [{ narrative: "father had a heart attack at 60" }],
      social_history_volunteered: { smoking_status: "never smoked" },
    },
    objective_data_offered: [{ type: "blood_pressure", value: "150/95 mmHg", source: "patient_home_device" }],
  },
};

// 1. Granular capture end-to-end.
const r = await runPipeline({ case_content: caseContent });
const caseFacts = r.packet.facts.filter((f) => f.fact_id.startsWith("case-"));
const byCat = (c) => caseFacts.filter((f) => f.category === c);
check("granular: 2 past_history facts (one per condition)", byCat("past_history").length === 2);
check("granular: condition value is patient voice", byCat("past_history").some((f) => f.value === "type 2 diabetes, tablets only; about 5 years ago"));
check("granular: medication fact split out", byCat("medication").length === 1 && byCat("medication")[0].value.includes("metformin"));
check("granular: allergy fact split out", byCat("allergy").length === 1);
check("granular: family_history fact split out", byCat("family_history").length === 1);
check("granular: social_history fact split out", byCat("social_history").length === 1);
check("granular: vitals flow as vital_sign string (quarantine lifted)", byCat("vital_sign").length === 1 && byCat("vital_sign")[0].value === "blood_pressure: 150/95 mmHg");
check("stamps: every case fact provenance + verified:false", caseFacts.every((f) => f.provenance && f.verified === false));
check("stamps: vitals carry the declared device channel", byCat("vital_sign")[0].provenance === "patient_home_device");

// 2. Mechanical bar: patient-provenance fact can never be lab_result.
let barred = false;
try {
  validateContextPacket({
    facts: [{ fact_id: "x1", category: "lab_result", label: "l", value: "troponin normal", sanitised_by: "not-applicable", provenance: "patient_reported", verified: false }],
    evidence: [], constraints: [], receipts: [],
  });
} catch (e) {
  barred = /never carry category lab_result|masquerade/.test(e.message);
}
check("mechanical bar: patient-provenance lab_result REFUSED by the packet gate", barred);

// 3. Summary — schema-valid (zod AND JSON schema, lockstep), deterministic, bounded.
const hs = r.history_summary;
check("summary: present on case runs", !!hs);
check("summary: null without case content", (await runPipeline({})).history_summary === null);
const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
const jsonSchema = JSON.parse(readFileSync(join(ROOT, "mcp", "schemas", "patient-history-summary.schema.json"), "utf8"));
const validateJson = ajv.compile(jsonSchema);
check("summary: valid against the JSON schema (lockstep)", validateJson(hs) === true);
check("summary: const disclaimer present", hs.disclaimer === HISTORY_SUMMARY_DISCLAIMER);
check("summary: omnibus dataset receipt carried", hs.dataset_receipt.ref.startsWith("digital-tablet-omnibus:v"));
const allEntries = Object.values(hs.sections).flat();
check("summary: every entry verified:false", allEntries.length > 0 && allEntries.every((e) => e.verified === false));
check("summary: conditions section holds both disclosures", hs.sections.conditions.length === 2);
check("summary: vitals_offered holds the offered BP", hs.sections.vitals_offered.length === 1 && hs.sections.vitals_offered[0].provenance === "patient_home_device");
check("summary: AU Core advisory recorded on conditions", hs.sections.conditions.every((e) => e.au_core && typeof e.au_core.status === "string"));
check("summary: AU Core advisory recorded on medications + allergies", [...hs.sections.medications, ...hs.sections.allergies].every((e) => e.au_core));
check("summary: no AU Core block on non-profiled sections", hs.sections.vitals_offered.every((e) => !e.au_core));
check("summary: omnibus anchors carried (conditions → Condition)", hs.sections.conditions.every((e) => e.fhir_path === "Condition"));

// Determinism: fixed inputs → identical summary (including hash).
const fixed = { packet: r.packet, fact_provenance: r.fact_provenance, run_id: "run-fixed", generated_at_utc: "2026-07-11T00:00:00.000Z" };
const s1 = buildEncounterHistorySummary(fixed);
const s2 = buildEncounterHistorySummary(fixed);
check("summary: deterministic (hash-identical for fixed inputs)", JSON.stringify(s1) === JSON.stringify(s2) && s1.summary_sha256 === s2.summary_sha256);
check("summary: sha256 covers what is shown (changes when content changes)", s1.summary_sha256 !== buildEncounterHistorySummary({ ...fixed, run_id: "run-other" }).summary_sha256);

// 4. Boundary: the summary and its disclaimer never enter the packet.
const packetBlob = JSON.stringify(r.packet);
check("boundary: summary hash not in packet", !packetBlob.includes(hs.summary_sha256));
check("boundary: disclaimer not in packet", !packetBlob.includes("PATIENT-REPORTED, UNVERIFIED"));

// 5. Memory-only: no new file appears in verification/ from building a summary.
const before = readdirSync(join(ROOT, "verification")).length;
buildEncounterHistorySummary(fixed);
check("memory-only: no file written by the builder", readdirSync(join(ROOT, "verification")).length === before);

if (errors.length) {
  console.error("contract-history-summary FAILED:\n - " + errors.join("\n - "));
  process.exit(1);
}
console.log("contract-history-summary: all checks passed");
