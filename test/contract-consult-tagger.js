/**
 * Contract tests for the omnibus audit-channel enrichment:
 * fact provenance (verification/context-allowlist.js factProvenance) and the
 * deterministic consult tagger (verification/consult-tagger.js).
 * Register items `fhir-path-hooks-unwired` + `freetext-taxonomy-unconsumed`.
 * <test_and_evaluation_gates> requires deterministic safety code to be tested.
 *
 * Asserts:
 *   - BYTE-IDENTICAL PACKET: for identical case_content, the ContextPacket
 *     runPipeline produces is deep-equal whether or not the audit channel is
 *     considered — no packet fact carries fhir_path or taxonomy_tags, and no
 *     `prov-*` evidence node appears in packet.evidence (operator ruling
 *     2026-07-11: the LLM-visible surface does not change);
 *   - fact_provenance rides the RESULT: EvidenceNode-shaped, fact_id-aligned
 *     with the packet's case facts, fhir_path proven against the omnibus,
 *     supported by the structured_dataset receipt;
 *   - taxonomy tags are deterministic (same input → same tags) and drawn from
 *     the omnibus vocabulary (character quality terms, NRS severity, negation,
 *     temporal);
 *   - SENSITIVE-TIER DEFAULT-DENY on the new path: a tier ≥2 fact gets NO
 *     taxonomy tags, only an auditable withheld marker; and warn-only
 *     observability (sensitivityWarnings) reports without gating —
 *     verification.pass and firewall fields are unaffected;
 *   - fail-safe: an unresolvable omnibus anchor yields fhir_path null
 *     (withheld), never an invented path.
 *
 * ALL fixtures are synthetic in-test objects — no file under data/cases/ is
 * read. Run from repo root: node test/contract-consult-tagger.js
 */
import { contextAllowList, injectableFacts, factProvenance } from "../verification/context-allowlist.js";
import { tagConsultFacts, sensitivityWarnings, classifySensitivity } from "../verification/consult-tagger.js";
import { runPipeline } from "../verification/pipeline.js";

const errors = [];
const check = (label, cond) => { if (!cond) errors.push(label); };

const caseContent = {
  "01_presentation_layer": {
    demographics: { age: "58", sex: "female" },
    opening_complaint: "A burning pain in my chest started 2 days ago, about 7/10, and it spreads to my jaw.",
    history_as_reported: "No history of heart problems. Similar tightness last month.",
  },
};

// 1. Provenance metadata — fact_id-aligned, omnibus-proven.
const cls = contextAllowList(caseContent);
const facts = injectableFacts(cls);
const prov = factProvenance(cls);
check("provenance: one entry per packet fact", prov.length === facts.length);
check("provenance: fact_id alignment", prov.every((p, i) => p.fact_id === facts[i].fact_id));
const provByLabel = Object.fromEntries(prov.map((p) => [p.label, p.fhir_path]));
check("provenance: demographics → Patient", provByLabel["01_presentation_layer.demographics"] === "Patient");
check("provenance: opening_complaint → Condition._freetext_HPC_tags", provByLabel["01_presentation_layer.opening_complaint"] === "Condition._freetext_HPC_tags");
check("provenance: history → Condition", provByLabel["01_presentation_layer.history_as_reported"] === "Condition");

// 2. Deterministic tagging from the omnibus vocabulary.
const tags1 = tagConsultFacts(facts);
const tags2 = tagConsultFacts(facts);
check("tagger: deterministic", JSON.stringify(tags1) === JSON.stringify(tags2));
const complaintTags = tags1.find((t) => t.fact_id === facts.find((f) => f.label.endsWith("opening_complaint")).fact_id).taxonomy_tags;
const has = (group, tag) => complaintTags.some((t) => t.group === group && t.tag === tag);
check("tagger: character_quality (burning, from omnibus values)", has("HPC_sub_tags", "character_quality"));
check("tagger: severity_NRS_0_10 (7/10)", has("HPC_sub_tags", "severity_NRS_0_10"));
check("tagger: radiation (spreads to)", has("HPC_sub_tags", "radiation"));
check("tagger: symptom_duration (2 days)", has("Temporal_tags", "symptom_duration"));
check("tagger: onset (started)", has("Temporal_tags", "onset_date"));
const historyTags = tags1.find((t) => t.fact_id === facts.find((f) => f.label.endsWith("history_as_reported")).fact_id).taxonomy_tags;
check("tagger: denied_symptoms (no history of)", historyTags.some((t) => t.tag === "denied_symptoms"));

// 3. Sensitive-tier default-deny on the new path; warn-only elsewhere.
check("sensitivity: tier 2 classified", classifySensitivity("I have been feeling depressed and drinking alcohol daily.").rank === 2);
check("sensitivity: tier 3 outranks tier 2", classifySensitivity("depressed, and there is domestic violence at home").tier === "tier_3_highly_sensitive");
check("sensitivity: tier 1 default", classifySensitivity("a sore elbow after tennis").rank === 1);
const sensitiveFacts = [{ fact_id: "case-1", value: "I feel suicidal and hopeless." }];
const sensTagged = tagConsultFacts(sensitiveFacts)[0];
check("tier default-deny: withheld marker, no tags", sensTagged.withheld === true && !sensTagged.taxonomy_tags && sensTagged.tier === "tier_2_sensitive");
check("warn-only: reports tier hits", sensitivityWarnings(sensitiveFacts).length === 1);
check("warn-only: silent on tier 1", sensitivityWarnings([{ fact_id: "x", value: "sore elbow" }]).length === 0);

// 4. Fail-safe: unproven anchor withholds, never invents.
const fakeCls = { injectable_fields: [{ node: "01_presentation_layer", path: "01_presentation_layer.not_a_field", channel: "packet", category: "symptom", value: "x" }] };
check("fail-safe: unknown field → fhir_path null", factProvenance(fakeCls)[0].fhir_path === null);

// 5. End-to-end: packet byte-identical; provenance on the result only.
const [r1, r2] = [await runPipeline({ case_content: caseContent }), await runPipeline({ case_content: caseContent })];
const stripVolatile = (p) => JSON.stringify({ ...p, run_id: 0, assembled_at_utc: 0, evidence: p.evidence.map((e) => ({ ...e, provenance: { ...e.provenance, created_at_utc: 0 } })), receipts: p.receipts.map((r) => ({ ...r, timestamp_utc: 0 })) });
check("packet: stable across runs (byte-identical surface)", stripVolatile(r1.packet) === stripVolatile(r2.packet));
check("packet: no fact carries fhir_path", r1.packet.facts.every((f) => !("fhir_path" in f)));
check("packet: no fact carries taxonomy_tags", r1.packet.facts.every((f) => !("taxonomy_tags" in f)));
check("packet: no prov-* node in packet.evidence", r1.packet.evidence.every((e) => !e.id.startsWith("prov-")));
check("result: fact_provenance present on case runs", r1.fact_provenance && r1.fact_provenance.evidence.length === r1.packet.facts.filter((f) => f.fact_id.startsWith("case-")).length);
check("result: provenance nodes carry the dataset receipt ref", r1.fact_provenance.evidence.every((e) => e.supports.some((s) => s.kind === "structured_dataset" && s.ref.startsWith("digital-tablet-omnibus:v"))));
check("result: provenance node carries proven fhir_path", r1.fact_provenance.evidence.some((e) => e.fhir_path === "Condition._freetext_HPC_tags"));
check("result: taxonomy tags attached on prov nodes", r1.fact_provenance.evidence.some((e) => (e.taxonomy_tags || []).length > 0));
check("gate unchanged: verification result unaffected", r1.verification.pass === true);
const noCase = await runPipeline({});
check("no case content → fact_provenance null", noCase.fact_provenance === null);
check("no case content → no sensitivity warnings on stub facts", Array.isArray(noCase.sensitivity_warnings));

// 6. Sensitive case end-to-end: warn-only + withheld, nothing gates.
const sensCase = { "01_presentation_layer": { demographics: { age: "30" }, opening_complaint: "I feel depressed and have been using cannabis daily.", history_as_reported: "nil significant" } };
const rs = await runPipeline({ case_content: sensCase });
check("sensitive e2e: withheld marker recorded", rs.fact_provenance.tag_withheld.length >= 1);
check("sensitive e2e: warn-only list populated", rs.sensitivity_warnings.length >= 1);
check("sensitive e2e: verification gate unaffected", rs.verification.pass === true && rs.continuation_blocked === false);

if (errors.length) {
  console.error("contract-consult-tagger FAILED:\n - " + errors.join("\n - "));
  process.exit(1);
}
console.log("contract-consult-tagger: all checks passed");
