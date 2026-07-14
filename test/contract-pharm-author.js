/**
 * Contract test for the pharmacology authoring pipeline (FL-30 Step 3, M2).
 *
 * Asserts the two mechanical guarantees:
 *  1. Provenance or it doesn't ship (Guardrail 5): a record whose provenance is incomplete
 *     is REJECTED, not silently written; a schema-invalid entity is REJECTED.
 *  2. No self-attestation via authoring (Guardrail 2): reviewed_by is forced null and
 *     review_status forced "draft" — even when the input tries to set them "approved".
 * Also: checksum is deterministic; every supported capability round-trips.
 * Run from repo root: node test/contract-pharm-author.js
 */
import { authorDataset, buildRecord, checksumRecords } from "../scripts/pharm-author.mjs";

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

const goodDefaults = {
  source: "TDM reference",
  source_ref: "tdm-reference",
  authored_by: "Ken Lee",
  version: "v0.1.0",
  effective_date: "2026-07-13",
};

// --- valid NTI record round-trips, provenance stamped draft/unreviewed ---
const nti = authorDataset({
  capability: "nti",
  provenance_defaults: goodDefaults,
  records: [{ ingredient: "lithium", is_nti: true, rationale: "narrow index; toxicity risk", therapeutic_interval: "0.4-0.8 mmol/L" }],
});
expect(nti.accepted.length === 1 && nti.rejected.length === 0, "valid NTI record accepted");
expect(nti.accepted[0].provenance.review_status === "draft", "authored record forced review_status:draft");
expect(nti.accepted[0].provenance.reviewed_by === null, "authored record forced reviewed_by:null");

// --- No self-attestation: input trying to set approved/reviewed is overridden ---
const sneaky = authorDataset({
  capability: "nti",
  provenance_defaults: { ...goodDefaults, review_status: "approved", reviewed_by: "SomeoneElse" },
  records: [{ ingredient: "digoxin", is_nti: true, rationale: "narrow index; toxicity risk if levels high" }],
});
expect(sneaky.accepted[0].provenance.review_status === "draft", "authoring cannot self-set review_status:approved (forced draft)");
expect(sneaky.accepted[0].provenance.reviewed_by === null, "authoring cannot self-set reviewed_by (forced null)");

// --- Provenance incomplete → rejected (fail-closed) ---
const noProv = authorDataset({
  capability: "nti",
  provenance_defaults: { source: "TDM reference" }, // missing source_ref/authored_by/version/effective_date
  records: [{ ingredient: "phenytoin", is_nti: true, rationale: "narrow index; monitoring needed" }],
});
expect(noProv.accepted.length === 0 && noProv.rejected.length === 1, "record with incomplete provenance is rejected (Guardrail 5)");

// --- Schema-invalid entity → rejected ---
const badEntity = authorDataset({
  capability: "nti",
  provenance_defaults: goodDefaults,
  records: [{ ingredient: "warfarin", is_nti: true }], // missing required rationale
  });
expect(badEntity.rejected.length === 1, "schema-invalid entity (missing rationale) is rejected");

// --- Other capabilities round-trip ---
const renal = authorDataset({ capability: "renal", provenance_defaults: { ...goodDefaults, source: "STOPP/START v3", source_ref: "stopp-start-v3" }, records: [{ ingredient: "metformin", action: "renal_contraindicated", contraindicated_below_egfr: 30 }] });
expect(renal.accepted.length === 1, "renal record round-trips");
const sched = authorDataset({ capability: "scheduling", provenance_defaults: { ...goodDefaults, source: "SUSMP Poisons Standard", source_ref: "susmp-poisons-standard" }, records: [{ ingredient: "oxycodone", schedule: "S8", effective_date: "2026-07-13" }] });
expect(sched.accepted.length === 1, "scheduling record round-trips");
const inter = authorDataset({ capability: "interactions", provenance_defaults: { ...goodDefaults, source: "STOPP/START v3", source_ref: "stopp-start-v3" }, records: [{ interaction_kind: "drug_drug", mechanism_category: "drug_drug", subject: "warfarin", object: "ibuprofen", severity: "critical", mechanism_class: "additive bleeding risk", management_category: "avoid", evidence_tier: "guideline" }] });
expect(inter.accepted.length === 1, "interaction record round-trips");
const allergy = authorDataset({ capability: "allergy", provenance_defaults: { ...goodDefaults, source: "self-authored", source_ref: "self-authored" }, records: [{ group: "beta_lactam", members: ["penicillin", "amoxicillin", "cephalexin"] }] });
expect(allergy.accepted.length === 1, "allergy group round-trips");

// --- Unknown capability rejected loudly ---
expect(throws(() => buildRecord("not_a_capability", {}, goodDefaults)), "unknown capability throws");

// --- Checksum deterministic + order-insensitive on keys ---
const a = checksumRecords([{ x: 1, y: 2 }]);
const b = checksumRecords([{ y: 2, x: 1 }]);
expect(a === b, "checksum is stable across key order");

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-pharm-author FAIL (${errors.length})`);
  process.exit(1);
}
console.log("contract-pharm-author: OK");
