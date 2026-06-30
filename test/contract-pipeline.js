/**
 * Contract tests for the pipeline-edge validators (verification/pipeline-schemas.js):
 * GroundingPlan, ContextPacket, EvidenceNode, Receipt. Asserts conformant data is
 * accepted and malformed data (missing required, extra key, bad nested shape) is
 * rejected — including a receipt carrying validated_codes, which must be stripped
 * before a receipt enters the packet.
 * Run from repo root: node test/contract-pipeline.js
 */
import { validateGroundingPlan, validateContextPacket } from "../verification/pipeline-schemas.js";
import { runPipeline } from "../verification/pipeline.js";

const errors = [];
const check = (label, cond) => { if (!cond) errors.push(label); };
const ok = (label, fn) => {
  try {
    fn();
  } catch (e) {
    errors.push(`${label}: expected accept, got reject — ${e.message.slice(0, 80)}`);
  }
};
const no = (label, fn) => {
  try {
    fn();
    errors.push(`${label}: expected reject, got accept`);
  } catch (_) {
    /* expected */
  }
};

const plan = () => ({ needs_static_docs: ["Choosing Wisely"], needs_live_calls: ["terminology"], needs_structured_kg: [] });
const receipt = () => ({ request_id: "id-mock-1", timestamp_utc: new Date().toISOString(), upstream: "terminology", mode: "mock" });
const node = () => ({
  id: "ev-1",
  claim: "Guideline citation",
  supports: [{ kind: "static_doc", ref: "cw-au:imaging-lbp:2024-01" }],
  provenance: { created_at_utc: new Date().toISOString(), created_by: "pipeline", verification: { status: "verified" } },
});
const packet = () => ({ facts: [], evidence: [node()], constraints: ["no diagnosis"], receipts: [receipt()] });

// GroundingPlan
ok("plan: conformant", () => validateGroundingPlan(plan()));
no("plan: missing required field", () => { const { needs_structured_kg, ...p } = plan(); validateGroundingPlan(p); });
no("plan: extra key (strict)", () => validateGroundingPlan({ ...plan(), bogus: 1 }));

// ContextPacket
ok("packet: conformant", () => validateContextPacket(packet()));
no("packet: missing required array", () => { const { receipts, ...p } = packet(); validateContextPacket(p); });
no("packet: receipt missing timestamp_utc", () => validateContextPacket({ ...packet(), receipts: [{ request_id: "id-mock-1", upstream: "terminology", mode: "mock" }] }));
no("packet: receipt with validated_codes (must be stripped)", () => validateContextPacket({ ...packet(), receipts: [{ ...receipt(), validated_codes: ["279039003"] }] }));
no("packet: evidence node missing provenance", () => { const n = node(); delete n.provenance; validateContextPacket({ ...packet(), evidence: [n] }); });
no("packet: evidence support missing ref", () => { const n = node(); n.supports = [{ kind: "static_doc" }]; validateContextPacket({ ...packet(), evidence: [n] }); });

// lab_result hard-limit refinement
const labFact = (over = {}) => ({ fact_id: "fact-lab-1", category: "lab_result", label: "Potassium", value: "Potassium critically elevated", sanitised_by: "deterministic-investigation-parser@v0", ...over });
ok("packet: sanitised lab_result accepted", () => validateContextPacket({ ...packet(), facts: [labFact()] }));
no("packet: lab_result without sanitised_by rejected", () => { const f = labFact(); delete f.sanitised_by; validateContextPacket({ ...packet(), facts: [f] }); });
no("packet: lab_result with numeric string value rejected", () => validateContextPacket({ ...packet(), facts: [labFact({ value: "6.8 mmol/L" })] }));
no("packet: lab_result with number value rejected", () => validateContextPacket({ ...packet(), facts: [labFact({ value: 6.8 })] }));
ok("packet: non-lab fact without sanitised_by still accepted", () => validateContextPacket({ ...packet(), facts: [{ fact_id: "fact-1", category: "symptom", label: "back pain", value: "2 weeks" }] }));

// Integration: raw investigations are sanitised through the parser into the packet,
// the packet validates, and the raw number NEVER appears anywhere in the packet.
{
  const r = await runPipeline({ raw_investigations: [{ loinc: "2823-3", value: 6.8 }] });
  const labFacts = r.packet.facts.filter((f) => f.category === "lab_result");
  check("integration: one sanitised lab fact in packet", labFacts.length === 1 && labFacts[0].interpretation === "HH");
  check("integration: lab fact carries sanitised_by", typeof labFacts[0].sanitised_by === "string");
  ok("integration: produced packet validates", () => validateContextPacket(r.packet));
  check("integration: raw number 6.8 absent from entire packet", !JSON.stringify(r.packet).includes("6.8"));
}

if (errors.length) {
  console.error("Contract failures:", errors);
  process.exit(1);
}
console.log("contract-pipeline: OK");
