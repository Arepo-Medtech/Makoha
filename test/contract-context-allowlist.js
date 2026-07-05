/**
 * Contract tests for the live context-injection allow-list
 * (verification/context-allowlist.js) — ARCH_PLAN C7 / FMEA F9; the live mirror
 * of the cases:ingest field-scoped scoring-store firewall.
 * <test_and_evaluation_gates> requires deterministic safety code to be tested.
 *
 * Asserts:
 *   - DEFAULT-DENY: no sim/scorer field is injectable — psychosocial_profile,
 *     digital_tablet_field_map, unknown fields, unknown nodes, and all of
 *     00_case_envelope are rejected;
 *   - a sealed scoring-store node (10_–13_) anywhere in the input THROWS —
 *     packet assembly halts, the content is never classified or dropped silently;
 *   - the ingest allow-list is mirrored exactly: 01 patient-presentation fields
 *     flow (channel packet); 02 dialogue text sub-fields classify as exchange
 *     material and NEVER become packet facts;
 *   - objective_data_offered is QUARANTINED (pending the charter's
 *     patient-reported-vitals sanitiser-policy confirmation) — rejected with a
 *     reason naming the policy, not silently dropped;
 *   - end-to-end: runPipeline({ case_content }) injects only allow-listed 01
 *     facts, the packet passes the zod gate, and no rejected value appears
 *     anywhere in the packet;
 *   - regression: no case_content → packet facts unchanged.
 *
 * ALL fixtures are synthetic in-test objects — no file under data/cases/ is
 * read, and the sealed-node fixture is a dummy key with dummy content.
 * Run from repo root: node test/contract-context-allowlist.js
 */
import { contextAllowList, injectableFacts } from "../verification/context-allowlist.js";
import { runPipeline } from "../verification/pipeline.js";

const errors = [];
const check = (label, cond) => { if (!cond) errors.push(label); };

const presentation = {
  demographics: { age: "58", sex: "female" },
  opening_complaint: "I've had a heavy feeling in my chest since this morning.",
  history_as_reported: "Similar tightness last month after climbing stairs.",
  objective_data_offered: [{ label: "home BP", value: "160 over 95", provenance: "patient_home_device", verified: false }],
  psychosocial_profile: { hidden_agenda: "SIM-ONLY: fears diagnosis X", communication_style: "minimiser" },
  digital_tablet_field_map: { maps_to: "SIM-ONLY mapping" },
  simulator_notes: "SIM-ONLY unknown field",
};
const policy = {
  disclosure_items: [{
    clinical_fact: "The pain spreads to my left arm.",
    patient_response_template: "Only if you ask directly about my arm.",
    patient_deflection_template: "It's probably nothing.",
    gate_level: 3,
    scoring_weight: "SCORER-ONLY",
  }],
  patient_initiated_exchanges: [{ patient_text: "Should I be worried?", trigger: "SIM-ONLY trigger" }],
  deflection_behaviours: [{ deflection_text_template: "I don't want a fuss.", behaviour_id: "SIM-ONLY id" }],
  scoring_rubric_ref: "SCORER-ONLY ref",
};
const envelope = { case_id: "SPEC-TEST-01-99999", specialty: "CARD", difficulty: "01" };

// 1. Classification — default-deny with the ingest mirror.
const cls = contextAllowList({ "00_case_envelope": envelope, "01_presentation_layer": presentation, "02_conversational_policy": policy });
const injectablePaths = cls.injectable_fields.map((f) => f.path);
const rejectedPaths = cls.rejected_fields.map((f) => f.path);

check("01: demographics injectable (packet)", cls.injectable_fields.some((f) => f.path === "01_presentation_layer.demographics" && f.channel === "packet" && f.category === "demographic"));
check("01: opening_complaint injectable (symptom)", cls.injectable_fields.some((f) => f.path === "01_presentation_layer.opening_complaint" && f.category === "symptom"));
check("01: history_as_reported injectable (past_history)", cls.injectable_fields.some((f) => f.path === "01_presentation_layer.history_as_reported" && f.category === "past_history"));
check("01: psychosocial_profile rejected", rejectedPaths.includes("01_presentation_layer.psychosocial_profile"));
check("01: digital_tablet_field_map rejected", rejectedPaths.includes("01_presentation_layer.digital_tablet_field_map"));
check("01: unknown field rejected (default-deny)", rejectedPaths.includes("01_presentation_layer.simulator_notes"));
check("00: whole envelope rejected", rejectedPaths.includes("00_case_envelope"));
check("unknown node rejected", contextAllowList({ mystery_node: { a: 1 } }).rejected_fields.length === 1);

// objective_data_offered: QUARANTINED with a reason naming the open policy.
const quarantine = cls.rejected_fields.find((f) => f.path === "01_presentation_layer.objective_data_offered");
check("01: objective_data_offered quarantined", !!quarantine && /quarantined/.test(quarantine.reason) && /sanitiser-policy/.test(quarantine.reason));
check("01: objective_data_offered NOT injectable", !injectablePaths.some((p) => p.includes("objective_data_offered")));

// 02: only the named text sub-fields pass, as exchange channel; scorer/sim sub-fields rejected.
check("02: clinical_fact exchange-injectable", cls.injectable_fields.some((f) => f.path === "02_conversational_policy.disclosure_items[0].clinical_fact" && f.channel === "exchange"));
check("02: patient_text exchange-injectable", cls.injectable_fields.some((f) => f.path.endsWith("patient_initiated_exchanges[0].patient_text")));
check("02: deflection_text_template exchange-injectable", cls.injectable_fields.some((f) => f.path.endsWith("deflection_behaviours[0].deflection_text_template")));
check("02: gate_level rejected", rejectedPaths.includes("02_conversational_policy.disclosure_items[0].gate_level"));
check("02: scoring_weight rejected", rejectedPaths.includes("02_conversational_policy.disclosure_items[0].scoring_weight"));
check("02: sim trigger rejected", rejectedPaths.includes("02_conversational_policy.patient_initiated_exchanges[0].trigger"));
check("02: scoring_rubric_ref rejected", rejectedPaths.includes("02_conversational_policy.scoring_rubric_ref"));

// NO sim/scorer field is injectable — sweep every injectable value for markers.
const injectableBlob = JSON.stringify(cls.injectable_fields);
check("no SIM-ONLY content injectable", !injectableBlob.includes("SIM-ONLY"));
check("no SCORER-ONLY content injectable", !injectableBlob.includes("SCORER-ONLY"));

// 2. Sealed scoring-store nodes THROW (dummy key + dummy content only).
for (const sealed of ["10_ground_truth_node", "11_symptom_links_node", "12_management_plan_node", "13_safety_netting_node"]) {
  let threw = false;
  try {
    contextAllowList({ "01_presentation_layer": presentation, [sealed]: { dummy: "synthetic-test-content" } });
  } catch (e) {
    threw = /SCORING-STORE FIREWALL/.test(e.message);
  }
  check(`sealed ${sealed} throws firewall error`, threw);
}

// 3. Facts conversion — packet channel only; exchange material never becomes facts.
const facts = injectableFacts(cls);
check("facts: only packet-channel fields", facts.length === 3);
check("facts: valid categories", facts.every((f) => ["demographic", "symptom", "past_history"].includes(f.category)));
check("facts: no exchange text in facts", !JSON.stringify(facts).includes("left arm"));

// 4. End-to-end through the pipeline + packet zod gate.
const result = await runPipeline({
  candidate_output: "Based on the provided context, no diagnosis or dosages are given.",
  case_content: { "01_presentation_layer": presentation, "02_conversational_policy": policy, "00_case_envelope": envelope },
});
const packetBlob = JSON.stringify(result.packet);
check("e2e: packet carries the 3 allow-listed facts", result.packet.facts.filter((f) => f.fact_id.startsWith("case-")).length === 3);
check("e2e: packet passes the zod gate (pipeline returned)", !!result.verification);
check("e2e: no SIM-ONLY content in packet", !packetBlob.includes("SIM-ONLY"));
check("e2e: no SCORER-ONLY content in packet", !packetBlob.includes("SCORER-ONLY"));
check("e2e: no quarantined vitals in packet", !packetBlob.includes("160 over 95"));
check("e2e: no exchange dialogue in packet", !packetBlob.includes("left arm"));
check("e2e: no envelope metadata in packet", !packetBlob.includes("SPEC-TEST-01-99999"));

// Sealed content anywhere in case_content halts the pipeline run entirely.
let pipelineThrew = false;
try {
  await runPipeline({ case_content: { "10_ground_truth_node": { dummy: "synthetic-test-content" } } });
} catch (e) {
  pipelineThrew = /SCORING-STORE FIREWALL/.test(e.message);
}
check("e2e: sealed node halts the pipeline", pipelineThrew);

// 5. Regression — no case_content leaves the packet exactly as before.
const plain = await runPipeline({ candidate_output: "Based on the provided context, no diagnosis or dosages are given." });
check("regression: no case facts without case_content", !plain.packet.facts.some((f) => f.fact_id.startsWith("case-")));

if (errors.length) {
  console.error("Contract failures:", errors);
  process.exit(1);
}
console.log("contract-context-allowlist: OK");
